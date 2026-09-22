"""Run N Borge combat sims and aggregate stage / loot / revive stats."""

from __future__ import annotations

import copy
import statistics
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import timedelta
from math import floor
from typing import Callable, Literal

from .engine import Borge, Simulation, ensure_path

EngineName = Literal["auto", "wasm", "python"]


def clamp_levels(config: dict) -> dict:
    """Clamp talents / attributes / inscryptions to their per-item max levels."""
    ensure_path()
    cfg = copy.deepcopy(config)
    for section in ("talents", "attributes", "inscryptions"):
        costs = Borge.costs.get(section, {})
        for key, lvl in list(cfg.get(section, {}).items()):
            if key not in costs:
                continue
            mx = costs[key]["max"]
            if mx == float("inf"):
                cfg[section][key] = max(0, int(lvl))
            else:
                cfg[section][key] = max(0, min(int(lvl), int(mx)))
    # Cap capped Borge Stats the same way as cifi-tools UI
    stat_caps = {
        "damage_reduction": 40,
        "evade_chance": 50,
        "effect_chance": 50,
        "special_chance": 100,
        "special_damage": 100,
        "speed": 100,
    }
    for key, mx in stat_caps.items():
        if key in cfg.get("stats", {}):
            cfg["stats"][key] = max(0, min(int(cfg["stats"][key]), mx))
    return cfg


def sanitize_config(config: dict) -> dict:
    """Drop GUI-only keys so hunter-sim validation accepts the build."""
    cfg = copy.deepcopy(config)
    cfg.pop("build_name", None)
    dummy = Borge.load_dummy()
    # Keep only known top-level + nested keys.
    cfg = {k: cfg[k] for k in dummy if k in cfg}
    for section, defaults in dummy.items():
        if not isinstance(defaults, dict):
            continue
        section_data = cfg.get(section, {})
        cfg[section] = {k: section_data.get(k, v) for k, v in defaults.items()}
    return clamp_levels(cfg)


def _sim_one(config: dict) -> dict:
    ensure_path()
    return Simulation(Borge(sanitize_config(config))).run()


@dataclass
class SimResult:
    n: int
    stages: list[int]
    elapsed: list[float]
    loot: list[float]
    revive_logs: list[list]
    enrage_logs: list[list]
    avg_stage: float = 0.0
    min_stage: float = 0.0
    max_stage: float = 0.0
    median_stage: float = 0.0
    stage_counts: dict[int, int] = field(default_factory=dict)
    stage_odds: dict[int, float] = field(default_factory=dict)  # P(reach >= stage)
    avg_time_s: float = 0.0
    runs_per_day: float = 0.0
    avg_loot: float = 0.0
    loot_per_hour: float = 0.0
    loot_score: float = 0.0
    first_revive: Counter = field(default_factory=Counter)
    second_revive: Counter = field(default_factory=Counter)
    boss_kill_rate: float = 0.0
    boss_hp_pct: float = 0.0  # placeholder; hunter-sim does not expose remaining boss HP
    combat_avgs: dict[str, float] = field(default_factory=dict)
    build_stats: dict[str, float] = field(default_factory=dict)
    engine: str = "python"
    mats: dict[str, float] = field(default_factory=dict)
    xp: float = 0.0


def compute_build_stats(config: dict) -> dict[str, float]:
    """Combat stats as shown after applying talents/attributes/etc."""
    ensure_path()
    b = Borge(sanitize_config(config))
    return {
        "max_hp": round(b.max_hp, 2),
        "atk_power": round(b._power, 2),
        "hp_regen": round(b.regen, 4),
        "dmg_reduction": round(b._damage_reduction * 100, 2),
        "evade_chance": round(b.evade_chance * 100, 2),
        "effect_chance": round(b._effect_chance * 100, 2),
        "crit_chance": round(b._special_chance * 100, 2),
        "crit_power": round(b.special_damage, 2),
        "atk_speed": round(b._speed, 2),
    }


def _aggregate(runs: list[dict], config: dict) -> SimResult:
    stages = [int(r["final_stage"]) for r in runs]
    elapsed = [float(r["elapsed_time"]) for r in runs]
    loot = [float(r["total_loot"]) for r in runs]
    revive_logs = [list(r.get("revive_log") or []) for r in runs]
    enrage_logs = [list(r.get("enrage_log") or []) for r in runs]

    counts = Counter(stages)
    n = len(stages)
    sorted_stages = sorted(stages)
    # cumulative odds: P(final_stage >= s)
    odds: dict[int, float] = {}
    if sorted_stages:
        lo, hi = min(sorted_stages), max(sorted_stages)
        for s in range(lo, hi + 1):
            odds[s] = sum(1 for x in stages if x >= s) / n

    first_rev: Counter = Counter()
    second_rev: Counter = Counter()
    for log in revive_logs:
        if len(log) >= 1:
            first_rev[int(log[0])] += 1
        if len(log) >= 2:
            second_rev[int(log[1])] += 1

    avg_time = statistics.fmean(elapsed) if elapsed else 0.0
    avg_loot = statistics.fmean(loot) if loot else 0.0
    lph_vals = [
        (loot[i] / (elapsed[i] / 3600.0)) if elapsed[i] > 0 else 0.0 for i in range(n)
    ]
    lph = statistics.fmean(lph_vals) if lph_vals else 0.0
    runs_per_day = (86400.0 / avg_time) if avg_time > 0 else 0.0

    # Boss kill proxy: fraction of runs that reached stage > 100 (past first boss)
    boss_kill_rate = sum(1 for s in stages if s > 100) / n if n else 0.0

    skip = {"final_stage", "revive_log", "enrage_log", "elapsed_time", "total_loot"}
    combat_avgs: dict[str, float] = {}
    keys = set()
    for r in runs:
        keys.update(r.keys())
    for k in sorted(keys):
        if k in skip:
            continue
        vals = []
        for r in runs:
            v = r.get(k)
            if isinstance(v, (int, float)):
                vals.append(float(v))
        if vals:
            combat_avgs[k] = statistics.fmean(vals)

    return SimResult(
        n=n,
        stages=stages,
        elapsed=elapsed,
        loot=loot,
        revive_logs=revive_logs,
        enrage_logs=enrage_logs,
        avg_stage=statistics.fmean(stages) if stages else 0.0,
        min_stage=float(min(stages)) if stages else 0.0,
        max_stage=float(max(stages)) if stages else 0.0,
        median_stage=float(floor(statistics.median(stages))) if stages else 0.0,
        stage_counts=dict(sorted(counts.items())),
        stage_odds=odds,
        avg_time_s=avg_time,
        runs_per_day=runs_per_day,
        avg_loot=avg_loot,
        loot_per_hour=lph,
        loot_score=round(lph / 1000.0, 1) if lph else 0.0,
        first_revive=first_rev,
        second_revive=second_rev,
        boss_kill_rate=boss_kill_rate,
        boss_hp_pct=0.0,
        combat_avgs=combat_avgs,
        build_stats=compute_build_stats(config),
    )


def _odds_from_counts(counts: dict[int, int]) -> dict[int, float]:
    n = sum(counts.values())
    if not n or not counts:
        return {}
    lo, hi = min(counts), max(counts)
    odds: dict[int, float] = {}
    for s in range(lo, hi + 1):
        odds[s] = sum(c for stage, c in counts.items() if stage >= s) / n
    return odds


def _expand_stages(counts: dict[int, int]) -> list[int]:
    out: list[int] = []
    for stage, count in sorted(counts.items()):
        out.extend([int(stage)] * int(count))
    return out


def _wasm_to_sim_result(wasm_res, repetitions: int) -> SimResult:
    counts = {int(k): int(v) for k, v in wasm_res.stage_counts.items()}
    stages = _expand_stages(counts)
    n = sum(counts.values()) or repetitions
    avg_time = float(wasm_res.avg_time)
    loot_per_min = float(wasm_res.loot_per_min)
    loot_per_hour = loot_per_min * 60.0
    # Online "Loot Score" is the EVALBORGE_WASM return value (loot/min).
    loot_score = round(loot_per_min, 1)
    avg_loot = loot_per_min * (avg_time / 60.0) if avg_time > 0 else 0.0
    runs_per_day = (86400.0 / avg_time) if avg_time > 0 else 0.0
    median = float(floor(statistics.median(stages))) if stages else 0.0
    return SimResult(
        n=n,
        stages=stages,
        elapsed=[avg_time] * n,
        loot=[avg_loot] * n,
        revive_logs=[],
        enrage_logs=[],
        avg_stage=float(wasm_res.avg_stage),
        min_stage=float(wasm_res.min_stage),
        max_stage=float(wasm_res.max_stage),
        median_stage=median,
        stage_counts=dict(sorted(counts.items())),
        stage_odds=_odds_from_counts(counts),
        avg_time_s=avg_time,
        runs_per_day=runs_per_day,
        avg_loot=avg_loot,
        loot_per_hour=loot_per_hour,
        loot_score=loot_score,
        first_revive=Counter(wasm_res.first_revive),
        second_revive=Counter(wasm_res.second_revive),
        boss_kill_rate=float(wasm_res.boss_kill_rate),
        boss_hp_pct=float(wasm_res.boss_hp_percent),
        combat_avgs={
            "mat1": float(wasm_res.mat1),
            "mat2": float(wasm_res.mat2),
            "mat3": float(wasm_res.mat3),
            "xp": float(wasm_res.xp),
        },
        build_stats=dict(wasm_res.build_stats),
        engine="wasm",
        mats={
            "mat1": float(wasm_res.mat1),
            "mat2": float(wasm_res.mat2),
            "mat3": float(wasm_res.mat3),
        },
        xp=float(wasm_res.xp),
    )


def resolve_engine(engine: EngineName = "auto") -> str:
    if engine == "python":
        return "python"
    if engine == "wasm":
        from .wasm_engine import wasm_available

        if not wasm_available():
            raise RuntimeError(
                "WASM engine unavailable. Install wasmtime and ensure "
                "vendor/cifi_wasm/release.wasm exists (see scripts/fetch_cifi_wasm.py)."
            )
        return "wasm"
    # auto
    try:
        from .wasm_engine import wasm_available

        if wasm_available():
            return "wasm"
    except Exception:
        pass
    return "python"


def run_sims(
    config: dict,
    repetitions: int = 100,
    processes: int = -1,
    progress: Callable[[int, int], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
    engine: EngineName = "auto",
) -> SimResult:
    """Run ``repetitions`` simulations of ``config`` and aggregate results.

    ``engine``:
      - ``auto`` (default): prefer cifi-tools WASM when available
      - ``wasm``: online-identical EVALBORGE_WASM (requires wasmtime + release.wasm)
      - ``python``: vendored hunter-sim Monte-Carlo
    """
    ensure_path()
    if repetitions < 1:
        raise ValueError("repetitions must be >= 1")

    chosen = resolve_engine(engine)
    if chosen == "wasm":
        from .wasm_engine import WasmBorgeEngine

        if progress:
            progress(0, repetitions)
        if cancel_check and cancel_check():
            raise RuntimeError("Simulation cancelled")
        wasm_res = WasmBorgeEngine().evaluate(config, repetitions)
        if progress:
            progress(repetitions, repetitions)
        return _wasm_to_sim_result(wasm_res, repetitions)

    runs: list[dict] = []
    if processes and processes > 0 and repetitions > 1:
        with ProcessPoolExecutor(max_workers=processes) as pool:
            futs = [pool.submit(_sim_one, config) for _ in range(repetitions)]
            done = 0
            for fut in as_completed(futs):
                if cancel_check and cancel_check():
                    for f in futs:
                        f.cancel()
                    break
                runs.append(fut.result())
                done += 1
                if progress:
                    progress(done, repetitions)
    else:
        for i in range(repetitions):
            if cancel_check and cancel_check():
                break
            runs.append(_sim_one(config))
            if progress:
                progress(i + 1, repetitions)

    if not runs:
        raise RuntimeError("No simulation runs completed")
    result = _aggregate(runs, config)
    result.engine = "python"
    return result


def format_duration(seconds: float) -> str:
    td = timedelta(seconds=int(round(seconds)))
    total = int(td.total_seconds())
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m}m"
    if m:
        return f"{m}m {s}s"
    return f"{s}s"


TALENT_LABELS = {
    "death_is_my_companion": "Death Is My Companion",
    "life_of_the_hunt": "Life of the Hunt",
    "unfair_advantage": "The Unfair Advantage",
    "impeccable_impacts": "Impeccable Impacts",
    "omen_of_defeat": "The Omen Of Defeat",
    "call_me_lucky_loot": "Call Me Lucky Loot",
    "presence_of_god": "Presence Of A God",
    "fires_of_war": "The Fires of War",
}

ATTRIBUTE_LABELS = {
    "soul_of_ares": "Soul Of Ares",
    "essence_of_ylith": "Essence Of Ylith",
    "spartan_lineage": "Spartan Lineage",
    "timeless_mastery": "Timeless Mastery",
    "book_of_baal": "Book Of Baal",
    "superior_sensors": "Superior Sensors",
    "helltouch_barrier": "Helltouch Barrier",
    "lifedrain_inhalers": "Lifedrain Inhaler",
    "explosive_punches": "Explosive Punches",
    "atlas_protocol": "The Atlas Protocol",
    "weakspot_analysis": "Weakspot Analysis",
    "born_for_battle": "Born For Battle",
    "soul_of_the_minotaur": "Soul Of The Minotaur",
    "soul_of_hermes": "Soul Of Hermes",
    "soul_of_athena": "Soul Of Athena",
}

# Labels / effect text matching cifi-tools Temporary Upgrades → Inscryptions
INSCRIPTION_META: dict[str, dict] = {
    "i3": {"title": "Inscryption #3", "effect": "Max HP +6"},
    "i4": {"title": "Inscryption #4", "effect": "Crit Chance +0.65%"},
    "i11": {"title": "Inscryption #11", "effect": "Effect Chance +2%"},
    "i13": {"title": "Inscryption #13", "effect": "ATK Power +1"},
    "i14": {"title": "Inscryption #14", "effect": "Loot ×1.1"},
    "i23": {"title": "Inscryption #23", "effect": "ATK Speed −0.04s"},
    "i24": {"title": "Inscryption #24", "effect": "DMG Reduction +0.4%"},
    "i27": {"title": "Inscryption #27", "effect": "Max HP +24"},
    "i44": {"title": "Inscryption #44", "effect": "Loot ×1.08"},
    "i60": {"title": "Inscryption #60", "effect": "ATK/HP/Loot +3%"},
    "i80": {"title": "Inscryption #80", "effect": "Loot ×1.1"},
    "i84": {"title": "Inscryption #84", "effect": "Max HP +5%"},
    "i87": {"title": "Inscryption #87", "effect": "ATK Power ×1.05"},
    "i88": {"title": "Inscryption #88", "effect": "Crit Chance +0.4%"},
    "i89": {"title": "Inscryption #89", "effect": "Effect Chance +0.2%"},
    "i91": {"title": "Inscryption #91", "effect": "DMG Reduction +0.2%"},
    "i103": {"title": "Inscryption #103", "effect": "Loot ×1.08"},
}


def inscription_label(key: str) -> str:
    meta = INSCRIPTION_META.get(key)
    if not meta:
        return key
    mx = Borge.costs["inscryptions"].get(key, {}).get("max", "?")
    return f"{meta['title']}  ·  {meta['effect']}  /{mx}"


def attribute_points_spent(config: dict) -> int:
    ensure_path()
    costs = Borge.costs["attributes"]
    total = 0
    for k, lvl in config.get("attributes", {}).items():
        if k in costs:
            total += int(lvl) * int(costs[k]["cost"])
    return total


def talent_points_spent(config: dict) -> int:
    return sum(int(v) for v in config.get("talents", {}).values())


def point_budgets(level: int) -> tuple[int, int]:
    """Talent points and attribute path points available at ``level``.

    Game rules (hunter-sim / cifi-tools):
    - +1 talent point per level
    - +3 attribute (path) points per level
    """
    level = max(0, int(level))
    return level, level * 3


def validate_budgets(config: dict) -> tuple[bool, str]:
    ensure_path()
    from .attr_rules import attributes_tree_valid

    config = sanitize_config(config)
    level = int(config["meta"]["level"])
    tal_cap, attr_cap = point_budgets(level)
    tal = talent_points_spent(config)
    attr = attribute_points_spent(config)
    b = Borge(copy.deepcopy(config))
    _attr_spent, _attr_avail, invalid, _tal_spent, _tal_avail = b.validate_build()
    if invalid:
        return False, f"Over max level: {', '.join(sorted(invalid))}"
    over_insc = []
    for key, lvl in config.get("inscryptions", {}).items():
        meta = Borge.costs["inscryptions"].get(key)
        if meta and int(lvl) > int(meta["max"]):
            over_insc.append(f"{key}>{meta['max']}")
    if over_insc:
        return False, f"Inscryption over max: {', '.join(over_insc)}"
    if tal > tal_cap:
        return False, f"Talents {tal}/{tal_cap} (Level {level} → {tal_cap} Punkte)"
    if attr > attr_cap:
        return False, f"Attributes {attr}/{attr_cap} (Level {level} → {attr_cap} Path Points)"
    ok_tree, tree_msg = attributes_tree_valid(config.get("attributes", {}), attr_cap)
    if not ok_tree:
        return False, tree_msg
    unused_t = tal_cap - tal
    unused_a = attr_cap - attr
    return (
        True,
        f"Level {level}  ·  Talents {tal}/{tal_cap} ({unused_t} frei)  ·  "
        f"Attributes {attr}/{attr_cap} ({unused_a} frei)",
    )
