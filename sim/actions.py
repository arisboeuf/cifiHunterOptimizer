"""UnitActions — pending action schedule (hot path for the event loop)."""

from __future__ import annotations

from enum import IntEnum
from typing import NamedTuple, Optional


class ActionKind(IntEnum):
    HUNTER_ATTACK = 1
    ENEMY_ATTACK = 2
    ENEMY_SECONDARY = 3
    REGEN_TICK = 4
    BOSS_SKILL = 5
    HARDEN = 6
    MULTISTRIKE = 7
    ECHO = 8


class ScheduledAction(NamedTuple):
    time: float
    kind: ActionKind
    tag: str = ""


class UnitActions:
    """Small schedule: dict keyed by (kind, tag), O(n) next with n typically ≤ 6."""

    __slots__ = ("_times",)

    def __init__(self) -> None:
        self._times: dict[tuple[int, str], float] = {}

    def set(self, kind: ActionKind, time: float, tag: str = "") -> None:
        self._times[(int(kind), tag)] = float(time)

    def unset(self, kind: ActionKind, tag: str = "") -> None:
        self._times.pop((int(kind), tag), None)

    def clear_kinds(self, kinds: tuple[ActionKind, ...] | list[ActionKind]) -> None:
        drop = {int(k) for k in kinds}
        self._times = {key: t for key, t in self._times.items() if key[0] not in drop}

    def delay(self, kind: ActionKind, delta: float, tag: str = "") -> None:
        key = (int(kind), tag)
        t = self._times.get(key)
        if t is not None:
            self._times[key] = t + float(delta)

    def find_next(self) -> Optional[ScheduledAction]:
        items = self._times
        if not items:
            return None
        # Prefer earliest time; tie-break kind then tag (stable vs old Enum path).
        best_key = None
        best_t = 0.0
        for key, t in items.items():
            if best_key is None or t < best_t or (
                t == best_t and (key[0] < best_key[0] or (key[0] == best_key[0] and key[1] < best_key[1]))
            ):
                best_key = key
                best_t = t
        assert best_key is not None
        return ScheduledAction(best_t, ActionKind(best_key[0]), best_key[1])

    def pop_next(self) -> Optional[ScheduledAction]:
        nxt = self.find_next()
        if nxt is None:
            return None
        del self._times[(int(nxt.kind), nxt.tag)]
        return nxt

    def remaining(self, kind: ActionKind, now: float, tag: str = "") -> Optional[float]:
        t = self._times.get((int(kind), tag))
        if t is None:
            return None
        return max(0.0, t - now)

    def earliest_time(self) -> Optional[float]:
        if not self._times:
            return None
        return min(self._times.values())
