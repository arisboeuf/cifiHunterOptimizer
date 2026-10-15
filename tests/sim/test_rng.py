from sim.rng import HuntRoll, boss_attack_interval, seed_state


def test_succeeds_boundaries():
    r = HuntRoll(seed_state(1))
    assert r.succeeds(0) is False
    assert r.succeeds(1) is True


def test_seed_deterministic():
    a = HuntRoll(seed_state(42))
    b = HuntRoll(seed_state(42))
    assert [a.next_uint64() for _ in range(5)] == [b.next_uint64() for _ in range(5)]


def test_frenzy_interval():
    assert boss_attack_interval(10.0, 0) == 10.0
    assert abs(boss_attack_interval(10.0, 100) - 5.0) < 1e-9
    assert boss_attack_interval(10.0, 200) == 0.5
