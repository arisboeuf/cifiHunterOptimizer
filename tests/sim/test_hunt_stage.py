from sim.hunt_stage import HuntStage


def test_ten_kills_advance_normal_stage():
    s = HuntStage(number=1, progress=0)
    for i in range(9):
        assert s.advance() is False
        assert s.number == 1
        assert s.progress == i + 1
    assert s.advance() is True
    assert s.number == 2
    assert s.progress == 0


def test_boss_stage_one_kill():
    s = HuntStage(number=100, progress=0)
    assert s.advance() is True
    assert s.number == 101
    assert s.progress == 0


def test_stage_99_still_ten_kills():
    s = HuntStage(number=99, progress=0)
    for _ in range(9):
        assert s.advance() is False
    assert s.advance() is True
    assert s.number == 100
