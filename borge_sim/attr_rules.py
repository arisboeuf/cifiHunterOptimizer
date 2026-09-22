"""Borge attribute tree rules matching cifi-tools.com (ATTRIBUTE_DEPENDENCIES / MIN_VALUE)."""

from __future__ import annotations

from .engine import Borge, ensure_path

# Online keys → hunter-sim / local YAML keys
ONLINE_TO_LOCAL: dict[str, str] = {
    "ares": "soul_of_ares",
    "ylith": "essence_of_ylith",
    "spartan": "spartan_lineage",
    "timeless": "timeless_mastery",
    "baal": "book_of_baal",
    "sensors": "superior_sensors",
    "htb": "helltouch_barrier",
    "lfin": "lifedrain_inhalers",
    "exp": "explosive_punches",
    "atlas": "atlas_protocol",
    "weak": "weakspot_analysis",
    "battle": "born_for_battle",
    "mino": "soul_of_the_minotaur",
    "hermes": "soul_of_hermes",
    "athena": "soul_of_athena",
}

# Parent keys must be > 0 before this attribute can be raised (cifi-tools ATTRIBUTE_DEPENDENCIES).
ATTRIBUTE_DEPENDENCIES: dict[str, list[str]] = {
    ONLINE_TO_LOCAL[child]: [ONLINE_TO_LOCAL[p] for p in parents]
    for child, parents in {
        "ylith": ["ares"],
        "baal": ["ares"],
        "htb": ["ares"],
        "exp": ["htb"],
        "spartan": ["ylith"],
        "timeless": ["spartan"],
        "sensors": ["baal"],
        "lfin": ["htb"],
        "atlas": ["sensors"],
        "weak": ["exp"],
        "battle": ["spartan"],
        "athena": ["battle"],
        "mino": ["atlas"],
        "hermes": ["weak"],
    }.items()
}

# Path points spent on attributes with a *lower* min_value must be >= this before investing
# (cifi-tools ATTRIBUTE_MIN_VALUE).
ATTRIBUTE_MIN_VALUE: dict[str, int] = {
    ONLINE_TO_LOCAL[k]: v
    for k, v in {
        "ares": 0,
        "ylith": 0,
        "spartan": 0,
        "timeless": 0,
        "baal": 0,
        "sensors": 0,
        "htb": 0,
        "lfin": 0,
        "exp": 0,
        "atlas": 75,
        "weak": 75,
        "battle": 75,
        "mino": 150,
        "hermes": 150,
        "athena": 180,
    }.items()
}


def _attr_cost(key: str) -> int:
    ensure_path()
    return int(Borge.costs["attributes"][key]["cost"])


def _attr_max(key: str) -> int:
    ensure_path()
    mx = Borge.costs["attributes"][key]["max"]
    return 9999 if mx == float("inf") else int(mx)


def attr_spent(attrs: dict[str, int]) -> int:
    ensure_path()
    total = 0
    for k, lvl in attrs.items():
        if k in Borge.costs["attributes"]:
            total += int(lvl) * _attr_cost(k)
    return total


def min_value_spent_ok(attrs: dict[str, int], key: str) -> bool:
    """True if ATTRIBUTE_MIN_VALUE gate for ``key`` is satisfied."""
    need = int(ATTRIBUTE_MIN_VALUE.get(key, 0))
    if need <= 0:
        return True
    my_min = need
    spent = 0
    for k, lvl in attrs.items():
        if int(lvl) <= 0:
            continue
        if int(ATTRIBUTE_MIN_VALUE.get(k, 0)) < my_min:
            spent += int(lvl) * _attr_cost(k)
    return spent >= need


def dependencies_ok(attrs: dict[str, int], key: str) -> bool:
    parents = ATTRIBUTE_DEPENDENCIES.get(key, [])
    return all(int(attrs.get(p, 0)) > 0 for p in parents)


def dependents_of(key: str) -> list[str]:
    """All attributes that (transitively) depend on ``key``."""
    out: list[str] = []
    for child, parents in ATTRIBUTE_DEPENDENCIES.items():
        if key in parents:
            out.append(child)
            out.extend(dependents_of(child))
    # unique, preserve order
    seen: set[str] = set()
    uniq: list[str] = []
    for k in out:
        if k not in seen:
            seen.add(k)
            uniq.append(k)
    return uniq


def can_increase_attribute(attrs: dict[str, int], key: str) -> bool:
    if int(attrs.get(key, 0)) >= _attr_max(key):
        return False
    if not dependencies_ok(attrs, key):
        return False
    if not min_value_spent_ok(attrs, key):
        return False
    return True


def attributes_tree_valid(attrs: dict[str, int], budget: int | None = None) -> tuple[bool, str]:
    """Validate max/cost budget + cifi-tools dependency / min-value gates."""
    ensure_path()
    for k, lvl in attrs.items():
        if k not in Borge.costs["attributes"]:
            continue
        lvl = int(lvl)
        if lvl < 0 or lvl > _attr_max(k):
            return False, f"{k} level {lvl} invalid"
        if lvl > 0:
            if not dependencies_ok(attrs, k):
                parents = ", ".join(ATTRIBUTE_DEPENDENCIES.get(k, []))
                return False, f"{k} needs parent(s): {parents}"
            if not min_value_spent_ok(attrs, k):
                need = ATTRIBUTE_MIN_VALUE.get(k, 0)
                return False, f"{k} needs {need} path points in lower-tier attributes"
    spent = attr_spent(attrs)
    if budget is not None and spent > budget:
        return False, f"Attributes {spent}/{budget}"
    return True, "ok"


def zero_orphan_dependents(attrs: dict[str, int]) -> dict[str, int]:
    """If a parent is 0, force all dependents to 0 (online BuildModal behaviour)."""
    out = {k: int(v) for k, v in attrs.items()}
    changed = True
    while changed:
        changed = False
        for child, parents in ATTRIBUTE_DEPENDENCIES.items():
            if int(out.get(child, 0)) <= 0:
                continue
            if any(int(out.get(p, 0)) <= 0 for p in parents):
                out[child] = 0
                changed = True
    return out
