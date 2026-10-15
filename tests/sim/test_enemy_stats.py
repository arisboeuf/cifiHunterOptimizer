from sim.enemy_stats import enemy_stats


def test_borge_boss_100_matches_extraction():
    s = enemy_stats("borge", 100)
    assert s["boss"] is True
    assert abs(s["max_hp"] - 36810.0) < 1e-6
    assert abs(s["atk_power"] - 263.175) < 1e-6


def test_ozzy_boss_100():
    s = enemy_stats("ozzy", 100)
    assert s["boss"] is True
    assert abs(s["max_hp"] - 29328.0) < 1e-6


def test_borge_200_secondary_interval_base():
    s = enemy_stats("borge", 200)
    assert abs(s["attack_interval_seconds"] * 1.8 - 14.488) < 0.01
