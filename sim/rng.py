"""HuntRoll — Xoshiro256** port from extraction combat_primitives."""

from __future__ import annotations

MASK = (1 << 64) - 1


def rotl64(x: int, k: int) -> int:
    return ((x << k) | (x >> (64 - k))) & MASK


class HuntRoll:
    """Xoshiro256StarStar with four uint64 state words."""

    def __init__(self, state: list[int] | tuple[int, ...]):
        if len(state) != 4 or not any(state):
            raise ValueError("four nonzero-in-total uint64 state words required")
        if any(not isinstance(x, int) or not 0 <= x <= MASK for x in state):
            raise ValueError("state word outside uint64")
        self.state = list(state)

    def next_uint64(self) -> int:
        a, b, c, d = self.state
        result = (rotl64((b * 5) & MASK, 7) * 9) & MASK
        t = (b << 17) & MASK
        c ^= a
        d ^= b
        b ^= c
        a ^= d
        c ^= t
        d = rotl64(d, 45)
        self.state = [a & MASK, b & MASK, c & MASK, d & MASK]
        return result

    def succeeds(self, p: float) -> bool:
        if p <= 0:
            return False
        if p >= 1:
            return True
        return (self.next_uint64() >> 11) * 1.1102230246251565e-16 < p

    def copy(self) -> HuntRoll:
        return HuntRoll(self.state)


def seed_state(seed: int) -> list[int]:
    """Synthetic fresh-run seed (not game PersistTo init). Splitmix64-style expand."""
    s = seed & MASK
    out = []
    for _ in range(4):
        s = (s + 0x9E3779B97F4A7C15) & MASK
        z = s
        z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9 & MASK
        z = (z ^ (z >> 27)) * 0x94D049BB133111EB & MASK
        z = z ^ (z >> 31)
        out.append(z)
    if not any(out):
        out[0] = 1
    return out


def boss_attack_interval(base_interval: float, enrage_stack: int) -> float:
    return max(base_interval * (1.0 - enrage_stack / 200.0), 0.5)
