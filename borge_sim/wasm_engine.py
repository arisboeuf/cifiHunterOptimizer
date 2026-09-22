"""Run Borge sims via cifi-tools WebAssembly (same engine as the online sim)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

WASM_DIR = Path(__file__).resolve().parent.parent / "vendor" / "cifi_wasm"
WASM_PATH = WASM_DIR / "release.wasm"
WASM_URL = "https://cifi-tools.com/wasm/release.wasm"

# Exact order expected by EVALBORGE_WASM (cifi-tools EVAL_PARAMS / rD).
EVAL_PARAMS: list[str] = [
    "lvl",
    "stage",
    "hp",
    "atk",
    "regen",
    "dr",
    "evade",
    "effect",
    "critchance",
    "critpower",
    "atkspeed",
    "revival",
    "loth",
    "ua",
    "impeccable",
    "omen",
    "ll",
    "pog",
    "ultima",
    "tfow",
    "ares",
    "ylith",
    "spartan",
    "timeless",
    "battle",
    "athena",
    "baal",
    "sensors",
    "atlas",
    "mino",
    "htb",
    "exp",
    "weak",
    "hermes",
    "lfin",
    "upgrades.gadgets.wrench",
    "upgrades.iap.travpack",
    "upgrades.diamondspecials.hunterloot",
    "upgrades.ultima.ulti",
    "upgrades.diamondspecials.reviveboost",
    "upgrades.loopmods.trample",
    "upgrades.loopmods.scavenger",
    "upgrades.shardmilestones.m0",
    "upgrades.relics.r4",
    "upgrades.relics.r7",
    "upgrades.relics.r16",
    "upgrades.relics.r19",
    "upgrades.inscryptions.i3",
    "upgrades.inscryptions.i4",
    "upgrades.inscryptions.i11",
    "upgrades.inscryptions.i13",
    "upgrades.inscryptions.i14",
    "upgrades.inscryptions.i23",
    "upgrades.inscryptions.i24",
    "upgrades.inscryptions.i27",
    "upgrades.inscryptions.i44",
    "upgrades.inscryptions.i60",
    "upgrades.inscryptions.i80",
    "upgrades.inscryptions.i84",
    "upgrades.inscryptions.i87",
    "upgrades.inscryptions.i88",
    "upgrades.inscryptions.i89",
    "upgrades.inscryptions.i91",
    "upgrades.gems_nodes.creation_gem1",
    "upgrades.gems_nodes.creation_gem2",
    "upgrades.gems_nodes.creation_gem3",
    "upgrades.gems_nodes.innovation_gem3",
    "upgrades.gems_nodes.attraction_gem2",
    "upgrades.gems_nodes.attraction_gem3",
    "upgrades.gems_nodes.attraction_level",
    "upgrades.gems_nodes.attraction_catchUp",
    "upgrades.gems_nodes.attraction_lootBorge",
    "upgrades.diamondcards.gaiden",
    "upgrades.researches.res81",
    "upgrades.researches.res95",
    "upgrades.researches.res105",
    "iterations",
    "upgrades.cms.cm46",
    "upgrades.cms.cm47",
    "upgrades.cms.cm48",
    "upgrades.cms.cm51",
    "upgrades.cms.cm53",
    "upgrades.cms.cm54",
    "upgrades.cms.cm57",
    "upgrades.cms.cm58",
    "upgrades.cms.cm_ultima",
    "upgrades.cms.cm_ultimas",
    "upgrades.gems_nodes.creation_borgeGU",
    "upgrades.gems_nodes.evolution_gem2",
    "upgrades.gems_nodes.evolution_gem3",
    "upgrades.gems_nodes.temporal_gem4",
    "upgrades.loopmods.stelzi",
    "upgrades.inscryptions.i103",
    "upgrades.gems_nodes.exodus_gem1",
    "upgrades.gems_nodes.exodus_temporalEvolutionCount",
    "upgrades.gems_nodes.exodus_gem4",
    "upgrades.cms.milestoneCount",
    "upgrades.gems_nodes.temporal_gem6",
    "upgrades.gems_nodes.innovation_gem5",
    "upgrades.gems_nodes.creation_gem4",
    "upgrades.gems_nodes.creation_gem5",
    "upgrades.gems_nodes.creation_galvTrinketsCount",
    "upgrades.gems_nodes.evolution_gem6",
    "upgrades.relics.t2r7",
    "upgrades.loopmods.roe",
    "upgrades.mats_exchange.tysconDrives",
]

# Indices that EVALBORGE_WASM expects as f64.
_FLOAT_PARAM_INDEX = {37, 38}  # hunterloot, ultima.ulti


def wasm_available() -> bool:
    try:
        import wasmtime  # noqa: F401
    except ImportError:
        return False
    return WASM_PATH.is_file()


def ensure_wasm(download: bool = True) -> Path:
    if WASM_PATH.is_file():
        return WASM_PATH
    if not download:
        raise FileNotFoundError(f"Missing WASM at {WASM_PATH}")
    WASM_DIR.mkdir(parents=True, exist_ok=True)
    import urllib.request

    urllib.request.urlretrieve(WASM_URL, WASM_PATH)
    return WASM_PATH


def build_to_eval_values(config: dict, iterations: int) -> dict[str, float | int]:
    """Map hunter-sim / local YAML build into cifi-tools EVAL_PARAMS values."""
    meta = config.get("meta", {})
    stats = config.get("stats", {})
    talents = config.get("talents", {})
    attrs = config.get("attributes", {})
    insc = config.get("inscryptions", {})
    relics = config.get("relics", {})
    gems = config.get("gems", {})
    mods = config.get("mods", {})
    wasm_extra = config.get("wasm", {})  # optional passthrough for online-only fields

    values: dict[str, float | int] = {k: 0 for k in EVAL_PARAMS}
    values["lvl"] = int(meta.get("level", 0))
    values["stage"] = int(stats.get("highest_stage_reached", 0))
    values["hp"] = int(stats.get("hp", 0))
    values["atk"] = int(stats.get("power", 0))
    values["regen"] = int(stats.get("regen", 0))
    values["dr"] = int(stats.get("damage_reduction", 0))
    values["evade"] = int(stats.get("evade_chance", 0))
    values["effect"] = int(stats.get("effect_chance", 0))
    values["critchance"] = int(stats.get("special_chance", 0))
    values["critpower"] = int(stats.get("special_damage", 0))
    values["atkspeed"] = int(stats.get("speed", 0))

    values["revival"] = int(talents.get("death_is_my_companion", 0))
    values["loth"] = int(talents.get("life_of_the_hunt", 0))
    values["ua"] = int(talents.get("unfair_advantage", 0))
    values["impeccable"] = int(talents.get("impeccable_impacts", 0))
    values["omen"] = int(talents.get("omen_of_defeat", 0))
    values["ll"] = int(talents.get("call_me_lucky_loot", 0))
    values["pog"] = int(talents.get("presence_of_god", 0))
    values["ultima"] = int(talents.get("legacy_of_ultima", wasm_extra.get("ultima", 0)) or 0)
    values["tfow"] = int(talents.get("fires_of_war", 0))

    values["ares"] = int(attrs.get("soul_of_ares", 0))
    values["ylith"] = int(attrs.get("essence_of_ylith", 0))
    values["spartan"] = int(attrs.get("spartan_lineage", 0))
    values["timeless"] = int(attrs.get("timeless_mastery", 0))
    values["battle"] = int(attrs.get("born_for_battle", 0))
    values["athena"] = int(attrs.get("soul_of_athena", 0))
    values["baal"] = int(attrs.get("book_of_baal", 0))
    values["sensors"] = int(attrs.get("superior_sensors", 0))
    values["atlas"] = int(attrs.get("atlas_protocol", 0))
    values["mino"] = int(attrs.get("soul_of_the_minotaur", 0))
    values["htb"] = int(attrs.get("helltouch_barrier", 0))
    values["exp"] = int(attrs.get("explosive_punches", 0))
    values["weak"] = int(attrs.get("weakspot_analysis", 0))
    values["hermes"] = int(attrs.get("soul_of_hermes", 0))
    values["lfin"] = int(attrs.get("lifedrain_inhalers", 0))

    for key in (
        "i3",
        "i4",
        "i11",
        "i13",
        "i14",
        "i23",
        "i24",
        "i27",
        "i44",
        "i60",
        "i80",
        "i84",
        "i87",
        "i88",
        "i89",
        "i91",
        "i103",
    ):
        values[f"upgrades.inscryptions.{key}"] = int(insc.get(key, 0))

    values["upgrades.loopmods.trample"] = 1 if mods.get("trample") else 0
    values["upgrades.relics.r4"] = int(relics.get("disk_of_dawn", 0))
    values["upgrades.relics.r7"] = int(relics.get("long_range_artillery_crawler", 0))
    values["upgrades.relics.t2r7"] = int(relics.get("t2r7", wasm_extra.get("t2r7", 0)) or 0)

    # Gem mapping from hunter-sim names → cifi-tools nodes
    values["upgrades.gems_nodes.creation_gem1"] = int(gems.get("creation_node_#1", 0))
    values["upgrades.gems_nodes.creation_gem2"] = int(gems.get("creation_node_#2", 0))
    values["upgrades.gems_nodes.creation_gem3"] = int(gems.get("creation_node_#3", 0))
    values["upgrades.gems_nodes.innovation_gem3"] = int(gems.get("innovation_node_#3", 0))
    values["upgrades.gems_nodes.attraction_gem3"] = int(gems.get("attraction_node_#3", 0))
    values["upgrades.gems_nodes.attraction_level"] = int(gems.get("attraction_gem", 0))
    values["upgrades.gems_nodes.attraction_catchUp"] = int(gems.get("attraction_catch-up", 0))

    # Optional online-only fields via config["wasm"]
    for k, v in wasm_extra.items():
        if k in values:
            values[k] = v

    values["iterations"] = max(1, int(iterations))
    return values


def _values_to_call_args(values: dict[str, float | int]) -> list[float | int]:
    args: list[float | int] = []
    for i, key in enumerate(EVAL_PARAMS):
        raw = values.get(key, 0)
        if i in _FLOAT_PARAM_INDEX:
            args.append(float(raw))
        else:
            args.append(int(raw))
    return args


@dataclass
class WasmEvalResult:
    loot_per_min: float
    avg_stage: float
    avg_time: float
    min_stage: float
    max_stage: float
    boss_hp_percent: float
    boss_kill_rate: float
    mat1: float
    mat2: float
    mat3: float
    xp: float
    stage_counts: dict[int, int]
    first_revive: dict[int, int]
    second_revive: dict[int, int]
    build_stats: dict[str, float]


class WasmBorgeEngine:
    def __init__(self, wasm_path: Path | None = None) -> None:
        from wasmtime import Engine, FuncType, Linker, Module, Store, ValType

        path = ensure_wasm() if wasm_path is None else Path(wasm_path)
        self._engine = Engine()
        self._module = Module.from_file(self._engine, str(path))
        self._store = Store(self._engine)
        linker = Linker(self._engine)

        def _abort(_a: int, _b: int, _c: int, _d: int) -> None:
            raise RuntimeError("WASM abort()")

        linker.define_func(
            "env",
            "abort",
            FuncType([ValType.i32(), ValType.i32(), ValType.i32(), ValType.i32()], []),
            _abort,
        )
        self._instance = linker.instantiate(self._store, self._module)
        self._exp = self._instance.exports(self._store)

    def evaluate(self, config: dict, iterations: int) -> WasmEvalResult:
        values = build_to_eval_values(config, iterations)
        args = _values_to_call_args(values)
        loot = float(self._exp["EVALBORGE_WASM"](self._store, *args))

        stage_counts: dict[int, int] = {}
        nprog = int(self._exp["getProgressSize"](self._store))
        for i in range(nprog):
            # stages often come back as tenths (46.0 -> 460?) — online uses float stages
            stage_f = float(self._exp["getProgressStageAt"](self._store, i))
            count = int(self._exp["getProgressCountAt"](self._store, i))
            # store as rounded int key for histogram; keep float stage in odds via weighted expand
            key = int(round(stage_f))
            stage_counts[key] = stage_counts.get(key, 0) + count

        first_rev: dict[int, int] = {}
        second_rev: dict[int, int] = {}
        ndeath = int(self._exp["getDeathsByStageAndReviveSize"](self._store))
        for i in range(ndeath):
            key = int(self._exp["getDeathKeyAt"](self._store, i))
            count = int(self._exp["getDeathCountAt"](self._store, i))
            # Online encoding: stage * 1000 + reviveIndex (1 = first, 2 = second).
            stage = key // 1000
            revive_i = key % 1000
            if revive_i == 1:
                first_rev[stage] = first_rev.get(stage, 0) + count
            elif revive_i == 2:
                second_rev[stage] = second_rev.get(stage, 0) + count

        return WasmEvalResult(
            loot_per_min=loot,
            avg_stage=float(self._exp["getLastAvgStage"](self._store)),
            avg_time=float(self._exp["getLastAvgTime"](self._store)),
            min_stage=float(self._exp["getLastMinStage"](self._store)),
            max_stage=float(self._exp["getLastMaxStage"](self._store)),
            boss_hp_percent=float(self._exp["getLastBossHpPercent"](self._store)),
            boss_kill_rate=float(self._exp["getLastBossKillRate"](self._store)),
            mat1=float(self._exp["getLastMat1"](self._store)),
            mat2=float(self._exp["getLastMat2"](self._store)),
            mat3=float(self._exp["getLastMat3"](self._store)),
            xp=float(self._exp["getLastXp"](self._store)),
            stage_counts=dict(sorted(stage_counts.items())),
            first_revive=first_rev,
            second_revive=second_rev,
            build_stats={
                "max_hp": round(float(self._exp["getLastBorgeMaxHp"](self._store)), 2),
                "atk_power": round(float(self._exp["getLastBorgeAtk"](self._store)), 2),
                "hp_regen": round(float(self._exp["getLastBorgeRegen"](self._store)), 4),
                "dmg_reduction": round(float(self._exp["getLastBorgeDr"](self._store)) * 100, 2),
                "evade_chance": round(float(self._exp["getLastBorgeEvade"](self._store)) * 100, 2),
                "effect_chance": round(float(self._exp["getLastBorgeEffect"](self._store)) * 100, 2),
                "crit_chance": round(float(self._exp["getLastBorgeCritRate"](self._store)) * 100, 2),
                "crit_power": round(float(self._exp["getLastBorgeCritPower"](self._store)), 2),
                "atk_speed": round(float(self._exp["getLastBorgeReload"](self._store)), 2),
            },
        )
