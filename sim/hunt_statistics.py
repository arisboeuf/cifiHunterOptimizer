"""Offline HunterHuntStatistics — ported from Borge/Ozzy HuntStatistics ctors (0.7.3.42).

Sources:
- Cifi.OfflineHunt.Borge.BorgeHuntStatistics..ctor
- Cifi.OfflineHunt.Ozzy.OzzyHuntStatistics..ctor
- UpgradesHelper.HunterUpgrade / Additive / GadgetCorrected

Validated against sim/fixtures/* WASM combat dumps (core upgrade + attr terms).
Gem/relic/diamond/gadget floats default to neutral (0 or 1.0) when absent from build.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .config import BuildConfig
from .upgrades_helper import flag_mul, gadget_corrected, hunter_upgrade


def _i(d: dict, *keys: str, default: int = 0) -> int:
    for k in keys:
        if k in d and d[k] is not None:
            return int(float(d[k]))
    return default


def _f(d: dict, *keys: str, default: float = 0.0) -> float:
    for k in keys:
        if k in d and d[k] is not None:
            return float(d[k])
    return default


def _flag(d: dict, *keys: str) -> bool:
    for k in keys:
        if k in d and d[k]:
            return True
    return False


@dataclass
class HuntFinals:
    max_hp: float
    atk_power: float
    hp_regen: float
    dmg_reduction: float
    evade_chance: float
    effect_chance: float
    crit_chance: float  # Borge crit / Ozzy multistrike chance
    crit_power: float  # Borge crit power / Ozzy multistrike power
    atk_interval: float
    secondary_dr: float = 0.0
    loot_bonus: float = 1.0  # not fully ported; stub 1.0


def compute_borge_finals(build: BuildConfig) -> HuntFinals:
    s, t, a = build.stats, build.talents, build.attributes
    insc = build.inscryptions
    relics = build.relics
    gems = build.gems
    mods = build.mods
    wasm = (build.raw.get("wasm") or {}) if build.raw else {}

    hp_u = _f(s, "hp")
    atk_u = _f(s, "power")
    regen_u = _f(s, "regen")
    dr_u = _f(s, "damage_reduction")
    evade_u = _f(s, "evade_chance")
    effect_u = _f(s, "effect_chance")
    crit_u = _f(s, "special_chance")
    critp_u = _f(s, "special_damage")
    spd_u = _f(s, "speed")
    level = float(build.level)

    ares = _i(a, "soul_of_ares")
    ylith = _i(a, "essence_of_ylith")
    spartan = _i(a, "spartan_lineage")
    sensors = _i(a, "superior_sensors")
    explosive = _i(a, "explosive_punches")
    minotaur = _i(a, "soul_of_the_minotaur")
    hermes = _i(a, "soul_of_hermes")
    impeccable = _i(t, "impeccable_impacts")
    legacy = _i(t, "legacy_of_ultima") or _i(wasm, "ultima")

    i3 = _i(insc, "i3")
    i4 = _i(insc, "i4")
    i11 = _i(insc, "i11")
    i13 = _i(insc, "i13")
    i23 = _i(insc, "i23")
    i24 = _i(insc, "i24")
    i27 = _i(insc, "i27")
    i60 = _i(insc, "i60")
    i84 = _i(insc, "i84")
    i87 = _i(insc, "i87")
    i88 = _i(insc, "i88")
    i89 = _i(insc, "i89")
    i91 = _i(insc, "i91")

    r4 = _i(relics, "disk_of_dawn", "r4")
    r16 = _i(relics, "r16")
    t2r7 = _f(relics, "t2r7", default=_f(wasm, "t2r7", default=1.0)) or 1.0
    wrench = _i(wasm, "wrench_of_gore", "wrench")
    exodus_gn4 = _i(wasm, "exodus_gn4")
    creation_gu9 = _f(wasm, "creation_gu9", default=1.0) or 1.0
    creation_gn5_3 = _f(wasm, "creation_gn5_3", default=1.0) or 1.0
    creation_gn4_3 = _f(wasm, "creation_gn4_3", default=0.0)

    innov_gn3 = _flag(gems, "innovation_node_#3") or _flag(wasm, "innov_gn3")
    evo_gn3 = _flag(gems, "evolution_gn3") or _flag(wasm, "evo_gn3")
    evo_gn6_3 = _flag(gems, "evolution_gn6_3") or _flag(wasm, "evo_gn6_3")
    temporal_gn6 = _flag(gems, "temporal_gn6") or _flag(wasm, "temporal_gn6")
    cg1 = _flag(gems, "creation_gn1") or _flag(wasm, "creation_gn1")
    cg2 = _flag(gems, "creation_gn2") or _flag(wasm, "creation_gn2")
    cg3 = _flag(gems, "creation_gn3") or _flag(wasm, "creation_gn3")
    gaiden = _flag(mods, "gaiden")

    gc = gadget_corrected(wrench, 1.001, 10, 1.02)
    cg3_hp = (1.0 + 0.015 * (level - 39)) if (cg3 and level >= 40) else 1.0
    cg3_atk = (1.0 + 0.01 * (level - 39)) if (cg3 and level >= 40) else 1.0
    cg3_regen = (1.0 + 0.005 * (level - 39)) if (cg3 and level >= 40) else 1.0

    max_hp = (
        (hunter_upgrade(hp_u, 2.5, 5, 0.01) + 43.0 + 6 * i3 + 24 * i27)
        * (1.0 + 0.03 * i60)
        * (1.0 + 0.05 * i84)
        * (1.0 + 0.01 * ares)
        * (1.0 + 0.01 * legacy)
        * (1.0 + 0.03 * r4)
        * flag_mul(cg1, 1.2)
        * flag_mul(cg2, 1.02)
        * cg3_hp
        * gc
        * flag_mul(gaiden, 1.03)
        * creation_gu9
        * flag_mul(evo_gn3, 1.0777)
        * flag_mul(temporal_gn6, 1.03)
        * creation_gn5_3
    )

    atk_power = (
        (hunter_upgrade(atk_u, 0.5, 10, 0.01) + 3.0 + i13 + 2 * impeccable)
        * (1.0 + 0.03 * i60)
        * (1.05**i87)
        * (1.0 + 0.002 * ares)
        * (1.0 + 0.01 * minotaur)
        * (1.0 + 0.01 * legacy)
        * flag_mul(innov_gn3, 1.03)
        * flag_mul(cg2, 1.02)
        * cg3_atk
        * (1.0 + 0.03 * r16)
        * gc
        * flag_mul(gaiden, 1.03)
        * creation_gu9
        * flag_mul(temporal_gn6, 1.03)
        * t2r7
    )

    hp_regen = (
        (hunter_upgrade(regen_u, 0.03, 30, 0.01) + 0.02 + 0.04 * ylith)
        * (1.0 + 0.009 * ylith)
        * (1.0 + 0.01 * legacy)
        * flag_mul(cg2, 1.02)
        * cg3_regen
        * gc
        * flag_mul(gaiden, 1.03)
        * creation_gu9
        * flag_mul(evo_gn3, 1.0777)
    )

    dmg_reduction = (
        0.0144 * dr_u
        + 0.004 * i24
        + 0.002 * i91
        + 0.015 * spartan
        + (0.02 if cg2 else 0.0)
    )
    secondary_dr = 0.01 * minotaur + 0.01 * creation_gn4_3
    evade = 0.0034 * evade_u + 0.01 + 0.016 * sensors
    effect = (
        0.005 * effect_u
        + 0.04
        + 0.012 * sensors
        + 0.004 * hermes
        + 0.02 * i11
        + 0.002 * i89
        + (0.03 if innov_gn3 else 0.0)
        + (0.02 if cg2 else 0.0)
    )
    crit_chance = (
        0.0018 * crit_u
        + 0.05
        + 0.044 * explosive
        + 0.004 * hermes
        + 0.0065 * i4
        + 0.004 * i88
        + (0.02 if cg2 else 0.0)
        + (0.02 if evo_gn6_3 else 0.0)
    )
    crit_power = 0.01 * critp_u + 1.3 + 0.08 * explosive + 0.01 * hermes
    atk_interval = 5.0 - 0.03 * spd_u - 0.04 * i23 - 0.01 * exodus_gn4

    return HuntFinals(
        max_hp=max_hp,
        atk_power=atk_power,
        hp_regen=hp_regen,
        dmg_reduction=dmg_reduction,
        evade_chance=evade,
        effect_chance=effect,
        crit_chance=crit_chance,
        crit_power=crit_power,
        atk_interval=max(0.05, atk_interval),
        secondary_dr=secondary_dr,
    )


def compute_ozzy_finals(build: BuildConfig) -> HuntFinals:
    s, t, a = build.stats, build.talents, build.attributes
    insc = build.inscryptions
    relics = build.relics
    gems = build.gems
    mods = build.mods
    wasm = (build.raw.get("wasm") or {}) if build.raw else {}

    hp_u = _f(s, "hp")
    atk_u = _f(s, "power")
    regen_u = _f(s, "regen")
    dr_u = _f(s, "damage_reduction")
    evade_u = _f(s, "evade_chance")
    effect_u = _f(s, "effect_chance")
    multi_u = _f(s, "special_chance")
    multip_u = _f(s, "special_damage")
    spd_u = _f(s, "speed")

    lotl = _i(a, "living_off_the_land")
    exo = _i(a, "exo_piercers")
    ibu = _i(a, "wings_of_ibu")
    exterm = _i(a, "extermination_protocol")
    cat = _i(a, "blessing_of_the_cat")
    needles = _i(t, "thousand_needles")
    legacy = _i(t, "legacy_of_ultima") or _i(wasm, "ultima")

    i31 = _i(insc, "i31")
    i36 = _i(insc, "i36")
    i37 = _i(insc, "i37")
    i40 = _i(insc, "i40")
    i86 = _i(insc, "i86")
    i92 = _i(insc, "i92")

    r4 = _i(relics, "disk_of_dawn", "r4")
    r17 = _i(relics, "bee_gone_companion_drone", "r17")
    t2r7 = _f(relics, "t2r7", default=_f(wasm, "t2r7", default=1.0)) or 1.0
    bio = _i(wasm, "bio_repair_tool", "bio_repair")
    exodus_gn4 = _i(wasm, "exodus_gn4")

    creation_gu10 = _f(wasm, "creation_gu10", default=1.0) or 1.0
    creation_gn5_3 = _f(wasm, "creation_gn5_3", default=1.0) or 1.0
    creation_gn6_1 = _f(wasm, "creation_gn6_1", default=1.0) or 1.0
    creation_gn6_2 = _f(wasm, "creation_gn6_2", default=1.0) or 1.0
    creation_gn6_3 = _f(wasm, "creation_gn6_3", default=1.0) or 1.0
    creation_gn4_3 = _f(wasm, "creation_gn4_3", default=0.0)

    innov_gn2 = _flag(gems, "innovation_node_#2") or _flag(wasm, "innov_gn2")
    innov_gn3 = _flag(gems, "innovation_node_#3") or _flag(wasm, "innov_gn3")
    evo_gn3 = _flag(gems, "evolution_gn3") or _flag(wasm, "evo_gn3")
    evo_gn6_3 = _flag(gems, "evolution_gn6_3") or _flag(wasm, "evo_gn6_3")
    temporal_gn6 = _flag(gems, "temporal_gn6") or _flag(wasm, "temporal_gn6")
    iridian = _flag(mods, "iridian")

    gc = gadget_corrected(bio, 1.001, 10, 1.02)

    max_hp = (
        (hunter_upgrade(hp_u, 2.0, 5, 0.03) + 16.0)
        * (1.0 + 0.02 * lotl)
        * (1.0 + 0.01 * legacy)
        * (1.0 + 0.03 * r4)
        * gc
        * flag_mul(iridian, 1.03)
        * creation_gu10
        * flag_mul(evo_gn3, 1.0777)
        * flag_mul(temporal_gn6, 1.03)
        * creation_gn6_1
        * creation_gn5_3
    )

    atk_power = (
        (hunter_upgrade(atk_u, 0.3, 10, 0.01) + 2.0)
        * (1.0 + 0.012 * exo)
        * (1.0 + 0.02 * cat)
        * (1.0 + 0.01 * legacy)
        * flag_mul(innov_gn3, 1.03)
        * (1.0 + 0.03 * r17)
        * gc
        * flag_mul(iridian, 1.03)
        * creation_gu10
        * flag_mul(temporal_gn6, 1.03)
        * creation_gn6_2
        * t2r7
    )

    hp_regen = (
        (hunter_upgrade(regen_u, 0.05, 30, 0.01) + 0.1)
        * (1.0 + 0.02 * lotl)
        * (1.0 + 0.01 * legacy)
        * flag_mul(innov_gn2, 1.25)
        * gc
        * flag_mul(iridian, 1.03)
        * creation_gu10
        * flag_mul(evo_gn3, 1.0777)
        * creation_gn6_3
    )

    dmg_reduction = 0.0035 * dr_u + 0.0111 * i37 + 0.002 * i86 + 0.026 * ibu
    secondary_dr = 0.01 * creation_gn4_3
    evade = 0.05 + 0.0062 * evade_u + 0.005 * ibu
    effect = 0.04 + 0.0035 * effect_u + 0.028 * exterm + 0.006 * i31 + 0.002 * i92
    multi_chance = (
        0.05
        + 0.0038 * multi_u
        + 0.005 * i40
        + (0.03 if innov_gn3 else 0.0)
        + (0.02 if evo_gn6_3 else 0.0)
    )
    multi_power = 0.25 + 0.01 * multip_u

    # Cat shortens interval: base / (1 / (1 - 0.004*cat)) = base * (1 - 0.004*cat)
    base_interval = 4.0 - 0.02 * spd_u - 0.03 * i36 - 0.06 * needles - 0.01 * exodus_gn4
    atk_interval = base_interval * (1.0 - 0.004 * cat)

    return HuntFinals(
        max_hp=max_hp,
        atk_power=atk_power,
        hp_regen=hp_regen,
        dmg_reduction=dmg_reduction,
        evade_chance=evade,
        effect_chance=effect,
        crit_chance=multi_chance,
        crit_power=multi_power,
        atk_interval=max(0.05, atk_interval),
        secondary_dr=secondary_dr,
    )


def compute_hunt_finals(build: BuildConfig) -> HuntFinals:
    if build.hunter_id == "ozzy":
        return compute_ozzy_finals(build)
    return compute_borge_finals(build)
