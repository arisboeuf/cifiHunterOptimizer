from pathlib import Path

from sim import load_build, run_monte_carlo

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "sim" / "fixtures" / "ozzy_default.json"


def test_ozzy_mc():
    build = load_build(FIXTURE)
    mc = run_monte_carlo(build, n=100, seed=2)
    assert mc.hunter == "ozzy"
    assert mc.avg_stage > 1
    assert "100" in {str(k) for k in mc.boss_kill_rate}


def test_ozzy_harden_path_reachable():
    build = load_build(FIXTURE)
    build.combat = {
        "max_hp": 500_000,
        "atk_power": 20_000,
        "hp_regen": 500,
        "dmg_reduction": 0.4,
        "evade_chance": 0.25,
        "effect_chance": 0.4,
        "crit_chance": 0.4,
        "crit_power": 0.6,
        "atk_interval": 0.25,
    }
    mc = run_monte_carlo(build, n=20, seed=3, stop_after_boss=200)
    assert mc.max_stage >= 100
