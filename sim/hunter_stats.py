"""Resolve hunter combat stats from HuntStatistics port (+ optional combat override).

Default path: `sim.hunt_statistics` (extraction ctor formulas).
Optional `combat` block (WASM dump / oracle) replaces finals and skips recompute.
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import BuildConfig
from .hunt_statistics import HuntFinals, compute_hunt_finals


@dataclass
class CombatStats:
    max_hp: float
    atk_power: float
    hp_regen: float
    dmg_reduction: float  # 0..1 fraction
    evade_chance: float
    effect_chance: float
    crit_chance: float  # Borge crit / Ozzy multistrike chance
    crit_power: float  # Borge crit power / Ozzy multistrike power
    atk_interval: float  # seconds between attacks
    loot_mult: float = 1.0
    xp_mult: float = 1.0
    lifesteal: float = 0.0
    # Talent / attr combat knobs (proc levels)
    presence: int = 0
    born_for_battle: int = 0
    fires_of_war: int = 0
    lifedrain: int = 0
    ares: int = 0
    baal: int = 0
    sensors: int = 0
    atlas: int = 0
    explosive: int = 0
    hermes: int = 0
    weakspot: int = 0
    revival_charges: int = 0
    omen: int = 0
    unfair: int = 0
    impeccable: int = 0
    echo_level: int = 0
    crippling: int = 0
    thousand_needles: int = 0
    tricksters_boon: int = 0


def _g(d: dict, *keys: str, default: float = 0.0) -> float:
    for k in keys:
        if k in d and d[k] is not None:
            return float(d[k])
    return default


def _level_from(talents: dict, attrs: dict, key: str) -> int:
    v = int(_g(talents, key))
    if v:
        return v
    return int(_g(attrs, key))


def _from_combat_block(c: dict) -> HuntFinals:
    max_hp = float(c.get("max_hp") or c.get("hp") or 1000)
    atk = float(c.get("atk_power") or c.get("atk") or 100)
    regen = float(c.get("hp_regen") or c.get("regen") or 1)
    dr = float(c.get("dmg_reduction") or c.get("dr") or 0)
    if dr > 1:
        dr /= 100.0
    evade = float(c.get("evade_chance") or c.get("evade") or 0)
    if evade > 1:
        evade /= 100.0
    effect = float(c.get("effect_chance") or c.get("effect") or 0)
    if effect > 1:
        effect /= 100.0
    crit_c = float(c.get("crit_chance") or c.get("multistrike_chance") or 0)
    if crit_c > 1:
        crit_c /= 100.0
    crit_p = float(c.get("crit_power") or c.get("multistrike_power") or 1.5)
    interval = float(c.get("atk_speed") or c.get("atk_interval") or c.get("reload") or 1.0)
    return HuntFinals(
        max_hp=max_hp,
        atk_power=atk,
        hp_regen=regen,
        dmg_reduction=dr,
        evade_chance=evade,
        effect_chance=effect,
        crit_chance=crit_c,
        crit_power=crit_p,
        atk_interval=interval,
        loot_bonus=float(c.get("loot_mult") or c.get("loot_bonus") or 1.0),
    )


def _lifesteal_from_build(build: BuildConfig) -> float:
    """On-hit lifesteal not stored on HuntStatistics; tip rates from attrs."""
    a = build.attributes
    if build.hunter_id == "borge":
        return 0.0111 * _g(a, "book_of_baal")
    return 0.033 * _g(a, "shimmering_scorpions")


def resolve_combat_stats(build: BuildConfig) -> CombatStats:
    t = build.talents
    a = build.attributes
    c = build.combat

    presence = int(_g(t, "presence_of_god"))
    born = int(_g(a, "born_for_battle"))
    fires = int(_g(t, "fires_of_war"))
    lifedrain = int(_g(a, "lifedrain_inhalers"))
    ares = int(_g(a, "soul_of_ares"))
    baal = int(_g(a, "book_of_baal"))
    sensors = int(_g(a, "superior_sensors"))
    atlas = int(_g(a, "atlas_protocol"))
    explosive = int(_g(a, "explosive_punches"))
    hermes = int(_g(a, "soul_of_hermes"))
    weakspot = int(_g(a, "weakspot_analysis"))
    revival = int(_g(t, "death_is_my_companion"))
    omen = int(_g(t, "omen_of_defeat", "omen_of_decay"))
    unfair = int(_g(t, "unfair_advantage"))
    impeccable = int(_g(t, "impeccable_impacts"))
    echo = _level_from(t, a, "echo_bullets")
    crippling = _level_from(t, a, "crippling_shots")
    needles = int(_g(t, "thousand_needles"))
    trickster = int(_g(t, "tricksters_boon"))

    if c:
        finals = _from_combat_block(c)
    else:
        finals = compute_hunt_finals(build)

    # Tip loot mults that are NOT in the combat-stat ctor path (timeless etc.)
    # stay as separate loot_mult; HuntStatistics loot_bonus is stubbed at 1.0.
    loot_mult = finals.loot_bonus
    if build.hunter_id == "borge":
        loot_mult *= 1.0 + 0.14 * _g(a, "timeless_mastery")
        for key, base in (("i14", 1.1), ("i44", 1.08), ("i80", 1.1), ("i103", 1.08)):
            n = int(_g(build.inscryptions, key))
            if n:
                loot_mult *= base**n
        n60 = int(_g(build.inscryptions, "i60"))
        if n60:
            loot_mult *= 1.03**n60
    else:
        loot_mult *= 1.0 + 0.16 * _g(a, "timeless_mastery")
        for key, base in (("i32", 1.5), ("i81", 1.1), ("i104", 1.08)):
            n = int(_g(build.inscryptions, key))
            if n:
                loot_mult *= base**n
    if build.mods.get("gaiden"):
        loot_mult *= 1.05

    xp_mult = 1.0
    n33 = int(_g(build.inscryptions, "i33"))
    if n33:
        xp_mult *= 1.75**n33

    return CombatStats(
        max_hp=finals.max_hp,
        atk_power=finals.atk_power,
        hp_regen=finals.hp_regen,
        dmg_reduction=finals.dmg_reduction,
        evade_chance=finals.evade_chance,
        effect_chance=finals.effect_chance,
        crit_chance=finals.crit_chance,
        crit_power=finals.crit_power,
        atk_interval=finals.atk_interval,
        loot_mult=loot_mult,
        xp_mult=xp_mult,
        lifesteal=_lifesteal_from_build(build),
        presence=presence,
        born_for_battle=born,
        fires_of_war=fires,
        lifedrain=lifedrain,
        ares=ares,
        baal=baal,
        sensors=sensors,
        atlas=atlas,
        explosive=explosive,
        hermes=hermes,
        weakspot=weakspot,
        revival_charges=revival,
        omen=omen,
        unfair=unfair,
        impeccable=impeccable,
        echo_level=echo,
        crippling=crippling,
        thousand_needles=needles,
        tricksters_boon=trickster,
    )
