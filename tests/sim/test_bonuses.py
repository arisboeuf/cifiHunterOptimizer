"""Tip-based inscryption / attribute passives."""

from sim.bonuses import MutableStats, apply_inscryptions
from sim.config import build_from_dict
from sim.hunter_stats import resolve_combat_stats


def test_borge_inscryption_flat_and_mult():
    s = MutableStats(
        max_hp=100,
        atk_power=50,
        hp_regen=1,
        dmg_reduction=0.1,
        evade_chance=0.1,
        effect_chance=0.1,
        crit_chance=0.1,
        crit_power=1.5,
        atk_interval=2.0,
    )
    apply_inscryptions("borge", {"i3": 2, "i23": 1, "i87": 1, "i4": 1}, s)
    assert s.max_hp == 112  # +6*2
    assert abs(s.atk_interval - 1.96) < 1e-9
    assert abs(s.atk_power - 52.5) < 1e-9  # *1.05
    assert abs(s.crit_chance - 0.1065) < 1e-9


def test_ozzy_inscryption_loot_and_dr():
    s = MutableStats(
        max_hp=100,
        atk_power=50,
        hp_regen=1,
        dmg_reduction=0.1,
        evade_chance=0.1,
        effect_chance=0.1,
        crit_chance=0.1,
        crit_power=0.5,
        atk_interval=2.0,
    )
    apply_inscryptions("ozzy", {"i32": 1, "i37": 2, "i40": 3}, s)
    assert abs(s.loot_mult - 1.5) < 1e-9
    assert abs(s.dmg_reduction - 0.1222) < 1e-9
    assert abs(s.crit_chance - 0.115) < 1e-9


def test_resolve_applies_inscryptions_without_combat_block():
    build = build_from_dict(
        {
            "meta": {"hunter": "Borge", "level": 10},
            "stats": {
                "hp": 10,
                "power": 10,
                "regen": 5,
                "damage_reduction": 5,
                "evade_chance": 5,
                "effect_chance": 5,
                "special_chance": 5,
                "special_damage": 5,
                "speed": 5,
            },
            "talents": {},
            "attributes": {"soul_of_ares": 0},
            "inscryptions": {"i13": 5, "i11": 2},
            "mods": {},
        }
    )
    base = resolve_combat_stats(
        build_from_dict({**build.raw, "inscryptions": {}})
    )
    with_insc = resolve_combat_stats(build)
    # HuntStatistics: +1 ATK flat per i13; +2% effect per i11
    assert abs(with_insc.atk_power - (base.atk_power + 5)) < 1e-9
    assert abs(with_insc.effect_chance - (base.effect_chance + 0.04)) < 1e-9


def test_ozzy_echo_from_talents():
    build = build_from_dict(
        {
            "meta": {"hunter": "Ozzy", "level": 14},
            "stats": {"hp": 10, "power": 10, "regen": 5, "damage_reduction": 5,
                      "evade_chance": 5, "effect_chance": 5, "special_chance": 5,
                      "special_damage": 5, "speed": 5},
            "talents": {"echo_bullets": 3, "crippling_shots": 2},
            "attributes": {"exo_piercers": 1},
            "inscryptions": {},
            "mods": {},
        }
    )
    c = resolve_combat_stats(build)
    assert c.echo_level == 3
    assert c.crippling == 2


def test_combat_block_skips_reapply():
    build = build_from_dict(
        {
            "meta": {"hunter": "Borge", "level": 1},
            "stats": {},
            "talents": {},
            "attributes": {"soul_of_ares": 50},
            "inscryptions": {"i87": 10},
            "combat": {
                "max_hp": 100,
                "atk_power": 40,
                "hp_regen": 1,
                "dmg_reduction": 0.2,
                "evade_chance": 0.1,
                "effect_chance": 0.1,
                "crit_chance": 0.1,
                "crit_power": 1.5,
                "atk_interval": 2.0,
            },
        }
    )
    c = resolve_combat_stats(build)
    assert c.atk_power == 40
    assert c.max_hp == 100
