"""Passive combat bonuses from attributes / inscryptions / tips.

Tip text lives in web/js/hunters/*/costs.js (ATTRIBUTE_TIPS, INSCRIPTION_META).
This module applies those documented combat effects in Python so Offline does not
need a WASM dump for inscryptions and related passives.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


@dataclass
class MutableStats:
    max_hp: float
    atk_power: float
    hp_regen: float
    dmg_reduction: float  # fraction 0..1
    evade_chance: float
    effect_chance: float
    crit_chance: float
    crit_power: float
    atk_interval: float
    loot_mult: float = 1.0
    xp_mult: float = 1.0
    lifesteal: float = 0.0  # fraction of damage dealt healed


# Inscryption effects: (levels) -> mutate stats. Keys match web INSCRIPTION_META.
BORGE_INSCRIPTIONS: dict[str, Callable[[MutableStats, int], None]] = {}
OZZY_INSCRIPTIONS: dict[str, Callable[[MutableStats, int], None]] = {}


def _reg_borge(key: str):
    def wrap(fn):
        BORGE_INSCRIPTIONS[key] = fn
        return fn

    return wrap


def _reg_ozzy(key: str):
    def wrap(fn):
        OZZY_INSCRIPTIONS[key] = fn
        return fn

    return wrap


@_reg_borge("i3")
def _b_i3(s: MutableStats, n: int) -> None:
    s.max_hp += 6 * n


@_reg_borge("i4")
def _b_i4(s: MutableStats, n: int) -> None:
    s.crit_chance += 0.0065 * n


@_reg_borge("i11")
def _b_i11(s: MutableStats, n: int) -> None:
    s.effect_chance += 0.02 * n


@_reg_borge("i13")
def _b_i13(s: MutableStats, n: int) -> None:
    s.atk_power += 1 * n


@_reg_borge("i14")
def _b_i14(s: MutableStats, n: int) -> None:
    s.loot_mult *= 1.1**n


@_reg_borge("i23")
def _b_i23(s: MutableStats, n: int) -> None:
    s.atk_interval = max(0.05, s.atk_interval - 0.04 * n)


@_reg_borge("i24")
def _b_i24(s: MutableStats, n: int) -> None:
    s.dmg_reduction += 0.004 * n


@_reg_borge("i27")
def _b_i27(s: MutableStats, n: int) -> None:
    s.max_hp += 24 * n


@_reg_borge("i44")
def _b_i44(s: MutableStats, n: int) -> None:
    s.loot_mult *= 1.08**n


@_reg_borge("i60")
def _b_i60(s: MutableStats, n: int) -> None:
    m = 1.03**n
    s.max_hp *= m
    s.atk_power *= m
    s.loot_mult *= m


@_reg_borge("i80")
def _b_i80(s: MutableStats, n: int) -> None:
    s.loot_mult *= 1.1**n


@_reg_borge("i84")
def _b_i84(s: MutableStats, n: int) -> None:
    s.max_hp *= 1.05**n


@_reg_borge("i87")
def _b_i87(s: MutableStats, n: int) -> None:
    s.atk_power *= 1.05**n


@_reg_borge("i88")
def _b_i88(s: MutableStats, n: int) -> None:
    s.crit_chance += 0.004 * n


@_reg_borge("i89")
def _b_i89(s: MutableStats, n: int) -> None:
    s.effect_chance += 0.002 * n


@_reg_borge("i91")
def _b_i91(s: MutableStats, n: int) -> None:
    s.dmg_reduction += 0.002 * n


@_reg_borge("i103")
def _b_i103(s: MutableStats, n: int) -> None:
    s.loot_mult *= 1.08**n


@_reg_ozzy("i31")
def _o_i31(s: MutableStats, n: int) -> None:
    s.effect_chance += 0.006 * n


@_reg_ozzy("i32")
def _o_i32(s: MutableStats, n: int) -> None:
    s.loot_mult *= 1.5**n


@_reg_ozzy("i33")
def _o_i33(s: MutableStats, n: int) -> None:
    s.xp_mult *= 1.75**n


@_reg_ozzy("i36")
def _o_i36(s: MutableStats, n: int) -> None:
    s.atk_interval = max(0.05, s.atk_interval - 0.03 * n)


@_reg_ozzy("i37")
def _o_i37(s: MutableStats, n: int) -> None:
    s.dmg_reduction += 0.0111 * n


@_reg_ozzy("i40")
def _o_i40(s: MutableStats, n: int) -> None:
    s.crit_chance += 0.005 * n


@_reg_ozzy("i81")
def _o_i81(s: MutableStats, n: int) -> None:
    s.loot_mult *= 1.1**n


@_reg_ozzy("i86")
def _o_i86(s: MutableStats, n: int) -> None:
    s.dmg_reduction += 0.002 * n


@_reg_ozzy("i92")
def _o_i92(s: MutableStats, n: int) -> None:
    s.effect_chance += 0.002 * n


@_reg_ozzy("i104")
def _o_i104(s: MutableStats, n: int) -> None:
    s.loot_mult *= 1.08**n


def apply_inscryptions(hunter_id: str, levels: dict, stats: MutableStats) -> None:
    table = BORGE_INSCRIPTIONS if hunter_id == "borge" else OZZY_INSCRIPTIONS
    for key, fn in table.items():
        n = int(float(levels.get(key) or 0))
        if n > 0:
            fn(stats, n)


def apply_borge_attributes(attrs: dict, stats: MutableStats) -> None:
    ares = int(float(attrs.get("soul_of_ares") or 0))
    if ares:
        stats.max_hp *= 1.0 + 0.01 * ares
        stats.atk_power *= 1.0 + 0.002 * ares

    ylith = int(float(attrs.get("essence_of_ylith") or 0))
    if ylith:
        stats.hp_regen += 0.04 * ylith
        stats.max_hp *= 1.0 + 0.009 * ylith

    spartan = int(float(attrs.get("spartan_lineage") or 0))
    if spartan:
        stats.dmg_reduction += 0.015 * spartan

    # timeless_mastery: loot only
    timeless = int(float(attrs.get("timeless_mastery") or 0))
    if timeless:
        stats.loot_mult *= 1.0 + 0.14 * timeless

    sensors = int(float(attrs.get("superior_sensors") or 0))
    if sensors:
        stats.evade_chance += 0.016 * sensors
        stats.effect_chance += 0.012 * sensors

    atlas = int(float(attrs.get("atlas_protocol") or 0))
    if atlas:
        stats.dmg_reduction += 0.007 * atlas
        stats.effect_chance += 0.014 * atlas
        stats.crit_chance += 0.025 * atlas

    explosive = int(float(attrs.get("explosive_punches") or 0))
    if explosive:
        stats.crit_chance += 0.044 * explosive
        stats.crit_power += 0.08 * explosive

    baal = int(float(attrs.get("book_of_baal") or 0))
    if baal:
        stats.lifesteal += 0.0111 * baal

    minotaur = int(float(attrs.get("soul_of_the_minotaur") or 0))
    if minotaur:
        stats.atk_power *= 1.0 + 0.01 * minotaur
        stats.dmg_reduction += 0.01 * minotaur

    hermes = int(float(attrs.get("soul_of_hermes") or 0))
    if hermes:
        stats.crit_chance += 0.004 * hermes
        stats.effect_chance += 0.004 * hermes
        stats.crit_power += 0.01 * hermes


def apply_ozzy_attributes(attrs: dict, stats: MutableStats) -> None:
    lotl = int(float(attrs.get("living_off_the_land") or 0))
    if lotl:
        stats.max_hp *= 1.0 + 0.02 * lotl
        stats.hp_regen *= 1.0 + 0.02 * lotl

    exo = int(float(attrs.get("exo_piercers") or 0))
    if exo:
        stats.atk_power *= 1.0 + 0.012 * exo

    scorp = int(float(attrs.get("shimmering_scorpions") or 0))
    if scorp:
        stats.lifesteal += 0.033 * scorp

    timeless = int(float(attrs.get("timeless_mastery") or 0))
    if timeless:
        stats.loot_mult *= 1.0 + 0.16 * timeless

    ibu = int(float(attrs.get("wings_of_ibu") or 0))
    if ibu:
        stats.dmg_reduction += 0.026 * ibu
        stats.evade_chance += 0.005 * ibu

    exterm = int(float(attrs.get("extermination_protocol") or 0))
    if exterm:
        stats.effect_chance += 0.028 * exterm


def apply_talent_flats(hunter_id: str, talents: dict, stats: MutableStats) -> None:
    if hunter_id == "borge":
        imp = int(float(talents.get("impeccable_impacts") or 0))
        if imp:
            stats.atk_power += 2 * imp
    elif hunter_id == "ozzy":
        needles = int(float(talents.get("thousand_needles") or 0))
        if needles:
            stats.atk_interval = max(0.05, stats.atk_interval - 0.06 * needles)


def apply_mods(mods: dict, stats: MutableStats) -> None:
    if mods.get("gaiden"):
        stats.max_hp *= 1.03
        stats.hp_regen *= 1.03
        stats.atk_power *= 1.03
        stats.loot_mult *= 1.05


def clamp_rates(stats: MutableStats) -> None:
    stats.dmg_reduction = min(0.9, max(0.0, stats.dmg_reduction))
    stats.evade_chance = min(0.85, max(0.0, stats.evade_chance))
    stats.effect_chance = min(0.95, max(0.0, stats.effect_chance))
    stats.crit_chance = min(0.95, max(0.0, stats.crit_chance))
    stats.crit_power = max(0.05, stats.crit_power)
    stats.atk_interval = max(0.05, stats.atk_interval)
    stats.max_hp = max(1.0, stats.max_hp)
    stats.atk_power = max(0.0, stats.atk_power)
    stats.hp_regen = max(0.0, stats.hp_regen)
    stats.loot_mult = max(0.0, stats.loot_mult)
    stats.xp_mult = max(0.0, stats.xp_mult)
    stats.lifesteal = max(0.0, stats.lifesteal)


def apply_all_passives(
    hunter_id: str,
    *,
    talents: dict,
    attributes: dict,
    inscryptions: dict,
    mods: dict,
    stats: MutableStats,
) -> MutableStats:
    """Apply attrs → talent flats → inscryptions → mods, then clamp."""
    if hunter_id == "borge":
        apply_borge_attributes(attributes, stats)
    else:
        apply_ozzy_attributes(attributes, stats)
    apply_talent_flats(hunter_id, talents, stats)
    apply_inscryptions(hunter_id, inscryptions, stats)
    apply_mods(mods, stats)
    clamp_rates(stats)
    return stats
