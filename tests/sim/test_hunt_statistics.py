"""HuntStatistics ctor port vs WASM combat dumps on fixtures."""

from pathlib import Path

from sim.config import load_build
from sim.hunt_statistics import compute_borge_finals, compute_ozzy_finals
from sim.hunter_stats import resolve_combat_stats

ROOT = Path(__file__).resolve().parents[2]


def test_borge_fixture_matches_wasm_dump():
    build = load_build(ROOT / "sim" / "fixtures" / "borge_lvl14_example.json")
    # Fixture still carries a combat dump — clear so we exercise the port.
    expected = dict(build.combat)
    build.combat = {}
    got = compute_borge_finals(build)
    assert abs(got.max_hp - expected["max_hp"]) < 1e-6
    assert abs(got.atk_power - expected["atk_power"]) < 1e-6
    assert abs(got.hp_regen - expected["hp_regen"]) < 1e-6
    assert abs(got.dmg_reduction - expected["dmg_reduction"]) < 1e-9
    assert abs(got.evade_chance - expected["evade_chance"]) < 1e-9
    assert abs(got.effect_chance - expected["effect_chance"]) < 1e-9
    assert abs(got.crit_chance - expected["crit_chance"]) < 1e-9
    assert abs(got.crit_power - expected["crit_power"]) < 1e-9
    assert abs(got.atk_interval - expected["atk_interval"]) < 1e-9


def test_ozzy_fixture_matches_wasm_dump():
    build = load_build(ROOT / "sim" / "fixtures" / "ozzy_default.with_combat.json")
    expected = dict(build.combat)
    build.combat = {}
    # Align talent fields if they still sit under attributes in older fixture.
    if "echo_bullets" in build.attributes and "echo_bullets" not in build.talents:
        build.talents["echo_bullets"] = build.attributes.pop("echo_bullets")
    if "crippling_shots" in build.attributes and "crippling_shots" not in build.talents:
        build.talents["crippling_shots"] = build.attributes.pop("crippling_shots")
    got = compute_ozzy_finals(build)
    assert abs(got.max_hp - expected["max_hp"]) < 1e-6
    assert abs(got.atk_power - expected["atk_power"]) < 1e-6
    assert abs(got.hp_regen - expected["hp_regen"]) < 1e-6
    assert abs(got.dmg_reduction - expected["dmg_reduction"]) < 1e-9
    assert abs(got.evade_chance - expected["evade_chance"]) < 1e-9
    assert abs(got.effect_chance - expected["effect_chance"]) < 1e-9
    assert abs(got.crit_chance - expected["crit_chance"]) < 1e-9
    assert abs(got.crit_power - expected["crit_power"]) < 1e-9
    assert abs(got.atk_interval - expected["atk_interval"]) < 1e-9


def test_resolve_without_combat_uses_port():
    build = load_build(ROOT / "sim" / "fixtures" / "borge_lvl14_example.json")
    expected = dict(build.combat)
    build.combat = {}
    c = resolve_combat_stats(build)
    assert abs(c.max_hp - expected["max_hp"]) < 1e-6
    assert abs(c.atk_power - expected["atk_power"]) < 1e-6
