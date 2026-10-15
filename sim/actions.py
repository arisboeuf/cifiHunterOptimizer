"""UnitActions — pending action schedule."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from typing import Optional


class ActionKind(Enum):
    HUNTER_ATTACK = auto()
    ENEMY_ATTACK = auto()
    ENEMY_SECONDARY = auto()
    REGEN_TICK = auto()
    BOSS_SKILL = auto()
    HARDEN = auto()
    MULTISTRIKE = auto()
    ECHO = auto()


@dataclass
class ScheduledAction:
    time: float
    kind: ActionKind
    tag: str = ""


class UnitActions:
    def __init__(self) -> None:
        self._items: list[ScheduledAction] = []

    def set(self, kind: ActionKind, time: float, tag: str = "") -> None:
        self.unset(kind, tag)
        self._items.append(ScheduledAction(time=float(time), kind=kind, tag=tag))

    def unset(self, kind: ActionKind, tag: str = "") -> None:
        self._items = [a for a in self._items if not (a.kind == kind and a.tag == tag)]

    def delay(self, kind: ActionKind, delta: float, tag: str = "") -> None:
        for a in self._items:
            if a.kind == kind and a.tag == tag:
                a.time += float(delta)

    def find_next(self) -> Optional[ScheduledAction]:
        if not self._items:
            return None
        return min(self._items, key=lambda a: (a.time, a.kind.value, a.tag))

    def pop_next(self) -> Optional[ScheduledAction]:
        nxt = self.find_next()
        if nxt is None:
            return None
        self._items.remove(nxt)
        return nxt

    def remaining(self, kind: ActionKind, now: float, tag: str = "") -> Optional[float]:
        for a in self._items:
            if a.kind == kind and a.tag == tag:
                return max(0.0, a.time - now)
        return None
