"""Shared OfflineHunt enemy statistics (Android 0.7.3.42)."""

from __future__ import annotations

from math import floor

RAMPS = {
    "borge": [
        (150, 0.006), (200, 0.006), (250, 0.006), (300, 0.006), (310, 0.003),
        (320, 0.003), (330, 0.004), (340, 0.004), (350, 0.005), (360, 0.005),
        (370, 0.006), (380, 0.006), (390, 0.007), (401, 0.005), (411, 0.005),
        (421, 0.005), (431, 0.004), (441, 0.004), (451, 0.004), (461, 0.006),
        (471, 0.006), (481, 0.006), (491, 0.006),
    ],
    "ozzy": [
        (150, 0.006), (200, 0.006), (250, 0.006), (300, 0.006), (310, 0.003),
        (320, 0.003), (330, 0.004), (340, 0.004), (350, 0.005), (360, 0.005),
        (370, 0.006), (380, 0.006), (390, 0.007),
    ],
    "knox": [
        (50, 0.006), (100, 0.006), (120, 0.01), (130, 0.008), (140, 0.006),
        (150, 0.006), (160, 0.006), (170, 0.006), (180, 0.006), (190, 0.006),
        (200, 0.006), (220, 0.02), (250, 0.006), (300, 0.006), (310, 0.003),
        (320, 0.02), (330, 0.004), (340, 0.004), (350, 0.005), (360, 0.005),
        (370, 0.006), (380, 0.006), (390, 0.007),
    ],
}
POWER_ANCHOR = {"borge": 350, "ozzy": 300, "knox": 200}


def stage_scaling(hunter: str, stage: int) -> float:
    hunter = hunter.lower()
    scale = 1.0
    for start, slope in RAMPS[hunter]:
        if stage >= start:
            scale += (stage - start + 1) * slope
    return scale * 1.01 ** max(stage - POWER_ANCHOR[hunter], 0)


_ENEMY_STATS_CACHE: dict[tuple[str, int], dict] = {}


def enemy_stats(hunter: str, stage: int) -> dict:
    hunter = hunter.lower()
    if hunter not in RAMPS:
        raise ValueError("hunter must be borge, ozzy or knox")
    if not isinstance(stage, int) or isinstance(stage, bool) or stage < 1:
        raise ValueError("stage must be a positive integer")
    cache_key = (hunter, stage)
    cached = _ENEMY_STATS_CACHE.get(cache_key)
    if cached is not None:
        return cached
    n = stage - 1
    b = floor(n / 100) if stage >= 101 else 0
    k = stage_scaling(hunter, stage)
    if hunter == "borge":
        hp = (13 + 4 * n) * 2.85**b * k
        atk = (3.2 + 0.7 * n) * 2.85**b * k
        regen = 0.08 * max(n, 0) * 1.052**b * k
        evade = 0.004 * (1 + max(b - 1, 0)) if stage >= 100 else 0
        crit = min(0.0326 + 0.0004 * n, 0.25)
        power = min(1.22 + 0.008 * n, 2.5)
        interval = max(4.52 - 0.006 * n, 0.5)
        loot = 1.051**stage * 5**b
    elif hunter == "ozzy":
        hp = (17 + 6 * n) * 2.9**b * k
        atk = (2.1 + 0.75 * n) * 2.7**b * k
        regen = (0.02 + 0.1 * max(n, 0)) * 1.25**b * k
        evade = 0.01 * (1 + max(b - 1, 0)) if stage >= 100 else 0
        crit = min(0.1 + 0.0006 * n, 0.25)
        power = min(1.038 + 0.008 * n, 2.5)
        interval = max(3.2 - 0.004 * n, 0.5)
        loot = 1.059**stage * 5**b
    else:
        hp = (16 + 9 * n) * 2.85**b * k
        atk = (3.8 + 1.4 * n) * 2.85**b * k
        regen = 0.04 * stage * 1.052**b * k
        evade = 0.01 * (1 + max(b - 1, 0)) if stage >= 100 else 0
        crit = min(0.1 + 0.0006 * n, 0.25)
        power = min(1.04 + 0.008 * n, 2.5)
        interval = max(6 - 0.005 * n, 0.5)
        loot = 1.074**stage * 5**b
    dr = 0.04 + 0.02 * max(b - 2, 0) if stage >= 200 else 0
    effect = 0.04 + 0.01 * max(b - 3, 0) if stage >= 300 else 0
    boss = stage % 100 == 0
    if boss:
        if hunter == "borge":
            hp *= 90
            atk *= 3.63
            regen *= 1.92
            dr += 0.05
            if stage >= 300:
                effect += 0.04
            crit = min(crit + 0.04, 0.25)
            power = min(power + 0.25, 2.5)
            interval *= 2.42
        elif hunter == "ozzy":
            hp *= 48
            atk *= 3
            regen *= 6
            dr += 0.05
            crit = 0.25
            interval *= 2.45
            if stage >= 300:
                effect += 0.04
        else:
            hp *= 12
            atk *= 4
            regen *= 2
            dr += 0.05
            if stage >= 300:
                effect += 0.04
            crit = min(crit + 0.13, 0.25)
            interval *= 2.85
    if hunter == "borge" and stage > 400:
        effect += 0.004999999888241291
    out = {
        "hunter": hunter,
        "stage": stage,
        "band": b,
        "boss": boss,
        "stage_scaling": k,
        "max_hp": hp,
        "atk_power": atk,
        "hp_regen": regen,
        "dmg_reduction": dr,
        "evade_chance": evade,
        "effect_chance": effect,
        "crit_power": power,
        "crit_chance": crit,
        "attack_interval_seconds": interval,
        "loot": loot,
    }
    _ENEMY_STATS_CACHE[cache_key] = out
    return out
