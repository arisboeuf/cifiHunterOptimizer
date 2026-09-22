"""Monte-Carlo local search over talent / attribute point budgets (WASM eval)."""

from __future__ import annotations

import copy
import random
from dataclasses import dataclass, field
from typing import Callable

from .attr_rules import (
    attr_spent,
    attributes_tree_valid,
    can_increase_attribute,
    dependents_of,
    zero_orphan_dependents,
)
from .engine import Borge, ensure_path
from .eval import (
    SimResult,
    point_budgets,
    run_sims,
    validate_budgets,
)


ProgressCb = Callable[[str, int, int, float | None, float | None], None]
CancelCb = Callable[[], bool]


@dataclass
class OptimizeConfig:
    n_search: int = 250
    n_refine: int = 1000
    n_baseline: int = 200  # sims for current build (match main UI "Sims")
    max_evals: int = 200
    restarts: int = 8
    stagnation_limit: int = 18
    top_k: int = 5
    seed: int | None = None
    # Keep Timeless Mastery at max (5) — common for loot/XP AFK builds.
    force_timeless_mastery_5: bool = False


TIMELESS_KEY = "timeless_mastery"
# Minimum parent chain so Timeless Mastery is unlockable (cifi-tools deps).
TIMELESS_PARENT_MIN: dict[str, int] = {
    "soul_of_ares": 1,
    "essence_of_ylith": 1,
    "spartan_lineage": 1,
}


def _ensure_timeless_lock(attrs: dict[str, int], keys: list[str]) -> dict[str, int]:
    out = {k: int(attrs.get(k, 0)) for k in keys}
    for k, mn in TIMELESS_PARENT_MIN.items():
        if k in out:
            out[k] = max(int(out.get(k, 0)), mn)
    if TIMELESS_KEY in out or TIMELESS_KEY in keys:
        out[TIMELESS_KEY] = 5
    return zero_orphan_dependents(out)


def _timeless_lock_cost() -> int:
    """Path points reserved when Timeless Mastery 5 is forced (incl. min parents)."""
    cost = 5 * _attr_cost(TIMELESS_KEY)
    for k, mn in TIMELESS_PARENT_MIN.items():
        cost += mn * _attr_cost(k)
    return cost


@dataclass
class OptimizeResult:
    best_config: dict
    best_score: tuple[float, float]  # (avg_stage, loot_score) — stage primary
    best_eval: SimResult | None
    baseline_config: dict
    baseline_score: tuple[float, float]
    baseline_eval: SimResult | None
    improved: bool
    history: list[tuple[float, float]] = field(default_factory=list)
    evals: int = 0


def _score(res: SimResult) -> tuple[float, float]:
    """Primary: Ø stage; secondary: loot score (user-facing advantage = stage)."""
    return (float(res.avg_stage), float(res.loot_score))


def _talent_max(key: str) -> int:
    return int(Borge.costs["talents"][key]["max"])


def _attr_cost(key: str) -> int:
    return int(Borge.costs["attributes"][key]["cost"])


def _attr_max(key: str) -> int:
    mx = Borge.costs["attributes"][key]["max"]
    return 9999 if mx == float("inf") else int(mx)


def _attrs_valid(attrs: dict[str, int], budget: int) -> bool:
    ok, _ = attributes_tree_valid(attrs, budget)
    return ok


def _random_talents(rng: random.Random, keys: list[str], budget: int) -> dict[str, int]:
    levels = {k: 0 for k in keys}
    remaining = budget
    while remaining > 0:
        candidates = [k for k in keys if levels[k] < _talent_max(k)]
        if not candidates:
            break
        k = rng.choice(candidates)
        levels[k] += 1
        remaining -= 1
    return levels


def _random_attributes(
    rng: random.Random,
    keys: list[str],
    budget: int,
    *,
    force_timeless_5: bool = False,
) -> dict[str, int]:
    levels = {k: 0 for k in keys}
    if force_timeless_5:
        levels = _ensure_timeless_lock(levels, keys)
        if attr_spent(levels) > budget:
            return levels
    remaining = budget - attr_spent(levels)
    for _ in range(budget * 6):
        if remaining <= 0:
            break
        candidates = [
            k
            for k in keys
            if (not force_timeless_5 or k != TIMELESS_KEY)
            and _attr_cost(k) <= remaining
            and can_increase_attribute(levels, k)
        ]
        if not candidates:
            break
        k = rng.choice(candidates)
        levels[k] = int(levels.get(k, 0)) + 1
        remaining -= _attr_cost(k)
    if force_timeless_5:
        levels = _ensure_timeless_lock(levels, keys)
    return levels


def _neighbor_talents(rng: random.Random, talents: dict[str, int], keys: list[str]) -> dict[str, int] | None:
    donors = [k for k in keys if int(talents.get(k, 0)) > 0]
    receivers = [k for k in keys if int(talents.get(k, 0)) < _talent_max(k)]
    if not donors or not receivers:
        return None
    for _ in range(24):
        a = rng.choice(donors)
        b = rng.choice(receivers)
        if a == b:
            continue
        out = dict(talents)
        out[a] = int(out[a]) - 1
        out[b] = int(out.get(b, 0)) + 1
        return out
    return None


def _neighbor_attributes(
    rng: random.Random,
    attrs: dict[str, int],
    keys: list[str],
    budget: int,
    *,
    force_timeless_5: bool = False,
) -> dict[str, int] | None:
    locked_floor = dict(TIMELESS_PARENT_MIN) if force_timeless_5 else {}
    if force_timeless_5:
        locked_floor[TIMELESS_KEY] = 5
    donors = [
        k
        for k in keys
        if int(attrs.get(k, 0)) > locked_floor.get(k, 0)
    ]
    if not donors:
        return None
    base_snap = {k: int(attrs.get(k, 0)) for k in keys}
    for _ in range(48):
        a = rng.choice(donors)
        out = dict(base_snap)
        floor = locked_floor.get(a, 0)
        out[a] = max(floor, int(out[a]) - 1)
        if out[a] <= 0 and a not in locked_floor:
            out[a] = 0
            for dep in dependents_of(a):
                if dep in locked_floor:
                    continue
                out[dep] = 0
        if force_timeless_5:
            out = _ensure_timeless_lock(out, keys)
        else:
            out = zero_orphan_dependents(out)
        spent = attr_spent(out)
        remaining = budget - spent
        receivers = [
            k
            for k in keys
            if k != a
            and (not force_timeless_5 or k != TIMELESS_KEY)
            and can_increase_attribute(out, k)
            and _attr_cost(k) <= remaining
        ]
        if receivers:
            b = rng.choice(receivers)
            out[b] = int(out.get(b, 0)) + 1
        if force_timeless_5:
            out = _ensure_timeless_lock(out, keys)
        if _attrs_valid(out, budget) and out != base_snap:
            return out
    return None


def _apply_points(base: dict, talents: dict[str, int], attrs: dict[str, int]) -> dict:
    cfg = copy.deepcopy(base)
    cfg["talents"] = {k: int(talents.get(k, 0)) for k in base.get("talents", {})}
    for k, v in talents.items():
        cfg["talents"][k] = int(v)
    cleaned = zero_orphan_dependents({k: int(attrs.get(k, 0)) for k in base.get("attributes", {})})
    for k, v in attrs.items():
        cleaned[k] = int(v)
    cleaned = zero_orphan_dependents(cleaned)
    cfg["attributes"] = {k: int(cleaned.get(k, 0)) for k in base.get("attributes", {})}
    for k, v in cleaned.items():
        cfg["attributes"][k] = int(v)
    return cfg


def optimize_build(
    base_config: dict,
    opt: OptimizeConfig | None = None,
    progress: ProgressCb | None = None,
    cancel_check: CancelCb | None = None,
) -> OptimizeResult:
    """Search talent/attribute allocations from scratch (random starts).

    1. Simulate the current build once with ``n_baseline`` (standard sim reps).
    2. Search new allocations from zero/random (never seeded by current points).
    3. Compare search best vs baseline; ``improved`` is True only if search wins.
    """
    ensure_path()
    opt = opt or OptimizeConfig()
    rng = random.Random(opt.seed)
    force_tm = bool(opt.force_timeless_mastery_5)

    base = copy.deepcopy(base_config)
    level = int(base["meta"]["level"])
    tal_cap, attr_cap = point_budgets(level)

    talent_keys = list(base.get("talents", {}).keys()) or list(Borge.load_dummy()["talents"].keys())
    attr_keys = list(base.get("attributes", {}).keys()) or list(Borge.load_dummy()["attributes"].keys())

    if force_tm and _timeless_lock_cost() > attr_cap:
        raise ValueError(
            f"Timeless Mastery 5 Pflicht braucht mind. {_timeless_lock_cost()} Path Points "
            f"(Level {level} hat nur {attr_cap})."
        )

    def notify(msg: str, done: int, total: int, stage: float | None = None, loot: float | None = None) -> None:
        if progress:
            progress(msg, done, total, loot, stage)

    def evaluate(cfg: dict, n: int, *, enforce_timeless: bool) -> SimResult | None:
        if cancel_check and cancel_check():
            return None
        if enforce_timeless and int(cfg.get("attributes", {}).get(TIMELESS_KEY, 0)) != 5:
            return None
        ok, _msg = validate_budgets(cfg)
        if not ok:
            return None
        return run_sims(cfg, repetitions=max(1, int(n)), engine="wasm")

    cur_tal = {k: int(base.get("talents", {}).get(k, 0)) for k in talent_keys}
    cur_attr = zero_orphan_dependents({k: int(base.get("attributes", {}).get(k, 0)) for k in attr_keys})
    baseline_cfg = _apply_points(base, cur_tal, cur_attr)

    history: list[tuple[float, float]] = []
    top: list[tuple[tuple[float, float], dict, SimResult]] = []
    evals = 0
    total_budget = max(1, opt.max_evals + opt.top_k + 1)

    search_best_cfg: dict | None = None
    search_best_score = (-1.0, -1.0)
    search_best_eval: SimResult | None = None

    def consider_search(cfg: dict, res: SimResult) -> None:
        nonlocal search_best_cfg, search_best_score, search_best_eval
        sc = _score(res)
        history.append(sc)
        top.append((sc, copy.deepcopy(cfg), res))
        top.sort(key=lambda t: t[0], reverse=True)
        del top[opt.top_k :]
        if sc > search_best_score:
            search_best_score = sc
            search_best_cfg = copy.deepcopy(cfg)
            search_best_eval = res

    notify(f"Simuliere aktuellen Build ({opt.n_baseline} sims)…", 0, total_budget)
    baseline_eval = evaluate(baseline_cfg, opt.n_baseline, enforce_timeless=False)
    if baseline_eval is None:
        raise RuntimeError(
            "Aktueller Build konnte nicht simuliert werden (ungueltig oder abgebrochen)."
        )
    evals += 1
    baseline_score = _score(baseline_eval)
    notify("Baseline fertig", evals, total_budget, baseline_score[0], baseline_score[1])

    for restart in range(opt.restarts):
        if cancel_check and cancel_check():
            break
        if evals >= opt.max_evals + 1:
            break

        tal = _random_talents(rng, talent_keys, tal_cap)
        attr = _random_attributes(rng, attr_keys, attr_cap, force_timeless_5=force_tm)

        local_cfg = _apply_points(base, tal, attr)
        local_res = evaluate(local_cfg, opt.n_search, enforce_timeless=force_tm)
        if local_res is None:
            continue
        evals += 1
        consider_search(local_cfg, local_res)
        local_score = _score(local_res)
        stagnant = 0
        show = search_best_score if search_best_score[0] >= 0 else local_score
        notify(f"Suche Start {restart + 1}/{opt.restarts}", evals, total_budget, show[0], show[1])

        while stagnant < opt.stagnation_limit and evals < opt.max_evals + 1:
            if cancel_check and cancel_check():
                break
            if rng.random() < 0.5:
                nxt_tal = _neighbor_talents(rng, tal, talent_keys)
                nxt_attr = attr
                if nxt_tal is None:
                    nxt_attr = _neighbor_attributes(
                        rng, attr, attr_keys, attr_cap, force_timeless_5=force_tm
                    )
                    nxt_tal = tal
            else:
                nxt_attr = _neighbor_attributes(
                    rng, attr, attr_keys, attr_cap, force_timeless_5=force_tm
                )
                nxt_tal = tal
                if nxt_attr is None:
                    nxt_tal = _neighbor_talents(rng, tal, talent_keys)
                    nxt_attr = attr
            if nxt_tal is None and nxt_attr is None:
                break
            if nxt_tal is None:
                nxt_tal = tal
            if nxt_attr is None:
                nxt_attr = attr

            cand = _apply_points(base, nxt_tal, nxt_attr)
            cand_res = evaluate(cand, opt.n_search, enforce_timeless=force_tm)
            if cand_res is None:
                if cancel_check and cancel_check():
                    break
                stagnant += 1
                continue
            evals += 1
            cand_score = _score(cand_res)
            consider_search(cand, cand_res)
            better_local = cand_score > local_score
            accept = better_local or (
                stagnant > 4 and cand_score[0] >= local_score[0] - 0.5 and rng.random() < 0.12
            )
            if accept:
                tal, attr = nxt_tal, nxt_attr
                local_cfg, local_res, local_score = cand, cand_res, cand_score
                stagnant = 0 if better_local else stagnant + 1
            else:
                stagnant += 1
            notify(
                f"Suche r{restart + 1} eval {evals}",
                evals,
                total_budget,
                search_best_score[0],
                search_best_score[1],
            )

    refine_pool = list(top[: opt.top_k])
    for i, (sc, cfg, _) in enumerate(refine_pool):
        if cancel_check and cancel_check():
            break
        notify(f"Refine {i + 1}/{len(refine_pool)}…", evals, total_budget, sc[0], sc[1])
        r = evaluate(cfg, opt.n_refine, enforce_timeless=force_tm)
        if r is None:
            continue
        evals += 1
        consider_search(cfg, r)
        notify(f"Refined {i + 1}", evals, total_budget, search_best_score[0], search_best_score[1])

    improved = search_best_cfg is not None and search_best_score > baseline_score
    if improved:
        best_cfg = search_best_cfg
        best_score = search_best_score
        best_eval = search_best_eval
    else:
        best_cfg = copy.deepcopy(baseline_cfg)
        best_score = baseline_score
        best_eval = baseline_eval

    notify("Done", total_budget, total_budget, best_score[0], best_score[1])
    return OptimizeResult(
        best_config=best_cfg,
        best_score=best_score,
        best_eval=best_eval,
        baseline_config=baseline_cfg,
        baseline_score=baseline_score,
        baseline_eval=baseline_eval,
        improved=improved,
        history=history,
        evals=evals,
    )
