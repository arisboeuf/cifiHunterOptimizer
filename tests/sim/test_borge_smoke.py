from pathlib import Path

from sim import load_build, run_hunt, run_monte_carlo

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "sim" / "fixtures" / "borge_lvl14_example.json"


def test_single_hunt_completes():
    build = load_build(FIXTURE)
    r = run_hunt(build, seed=7)
    assert r.end_stage >= 1
    assert r.time_seconds > 0
    assert r.stop_reason in ("death", "max_time", "max_stage") or r.stop_reason.startswith(
        "stop_after_boss"
    )


def test_mc_1000_non_degenerate():
    build = load_build(FIXTURE)
    mc = run_monte_carlo(build, n=200, seed=1)
    assert mc.n == 200
    assert mc.avg_stage > 1
    assert mc.max_stage >= mc.min_stage
    assert len(mc.stage_counts) >= 1


def test_stop_after_boss():
    build = load_build(FIXTURE)
    # Strong combat so we can clear early bosses in smoke tests
    build.combat = {
        "max_hp": 1_000_000,
        "atk_power": 50_000,
        "hp_regen": 1000,
        "dmg_reduction": 0.5,
        "evade_chance": 0.3,
        "effect_chance": 0.3,
        "crit_chance": 0.5,
        "crit_power": 2.5,
        "atk_interval": 0.2,
    }
    r = run_hunt(build, seed=1, stop_after_boss=100)
    assert r.end_stage >= 100
    assert r.bosses_killed >= 1
