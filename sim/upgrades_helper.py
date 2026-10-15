"""Cifi.OfflineHunt.UpgradesHelper — closed-form helpers from extraction asm."""

from __future__ import annotations

import math


def hunter_upgrade(level: float, a: float, step: float, b: float) -> float:
    """HunterUpgrade: level * (A + floor(level/step) * B)."""
    level = float(level)
    if level <= 0:
        return 0.0
    return level * (a + math.floor(level / step) * b)


def additive(level: float, k: float) -> float:
    return float(level) * k


def multiplicative(base: float, level: float) -> float:
    return float(base) ** float(level)


def gadget_corrected(level: float, base: float, interval: float, base2: float) -> float:
    """1 if level < 1 else base**level * base2**(level // interval)."""
    level = float(level)
    if level < 1:
        return 1.0
    return (base**level) * (base2 ** math.floor(level / interval))


def gem_upgrade(level: float, base: float, quality: float) -> float:
    """1 if level < 1 else (base**level) ** (1 + 0.1*quality - 0.1)."""
    level = float(level)
    if level < 1:
        return 1.0
    return (base**level) ** (1.0 + 0.1 * float(quality) - 0.1)


def diamond_ultima(level: float, k: float, base: float, all_ultimas: float) -> float:
    """1 + k * level * base**(allUltimas // 50)."""
    level = float(level)
    return 1.0 + k * level * (base ** math.floor(float(all_ultimas) / 50.0))


def flag_mul(flag: bool | int | float, factor: float) -> float:
    return factor if flag else 1.0
