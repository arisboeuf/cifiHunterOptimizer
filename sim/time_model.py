"""HuntTime — continuous simulation clock with second-aligned regen."""

from __future__ import annotations

import math


class HuntTime:
    def __init__(self, now: float = 0.0):
        self.now = float(now)

    def in_(self, dt: float) -> float:
        """Absolute time of an event dt seconds from now."""
        return self.now + float(dt)

    def next_second(self) -> float:
        """Next integer second boundary strictly after now (regen ticks)."""
        return math.floor(self.now) + 1.0

    def advance(self, t: float) -> None:
        self.now = float(t)
