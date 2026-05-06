#!/usr/bin/env python3
"""
Alpha: load unified game-state CSV, print summary, run a short discrete tick simulation.

Data format: section,key,value,extra1,extra2,extra3
Card rows use key=value tokens across value + extras (e.g. cost=1500, cells=2.3).
"""

from __future__ import annotations

import csv
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path


DEFAULT_CSV = Path(__file__).resolve().parent / "data" / "sample_game_state.csv"
DEFAULT_PRESTIGE_HOURS = 4.0


def _num(s: str) -> float:
    s = s.strip()
    if not s:
        raise ValueError("empty number")
    return float(s)


def _parse_kv_parts(parts: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if "=" not in p:
            continue
        k, v = p.split("=", 1)
        out[k.strip().lower()] = v.strip()
    return out


@dataclass
class CardRow:
    name: str
    attrs: dict[str, str]  # cost, cells, mk1, ... string values

    @property
    def owned(self) -> bool:
        return self.attrs.get("cost", "").lower() == "owned"

    @property
    def purchase_cost(self) -> int | None:
        c = self.attrs.get("cost", "")
        if c.lower() == "owned":
            return None
        return int(float(c))

    def mult(self, stat: str) -> float:
        """Multiplier for stat (cells, mk1, ...); missing -> 1.0."""
        s = stat.lower()
        if s not in self.attrs:
            return 1.0
        return float(self.attrs[s])


@dataclass
class GameState:
    config: dict[str, float] = field(default_factory=dict)
    generator: dict[str, float | str] = field(default_factory=dict)
    booster: dict[str, float] = field(default_factory=dict)
    cards: list[CardRow] = field(default_factory=list)


def load_game_state(path: Path) -> GameState:
    state = GameState()
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not row.get("section"):
                continue
            sec = row["section"].strip().lower()
            key = (row.get("key") or "").strip()
            parts = [
                row.get("value") or "",
                row.get("extra1") or "",
                row.get("extra2") or "",
                row.get("extra3") or "",
            ]
            if sec == "card":
                attrs = _parse_kv_parts(parts)
                state.cards.append(CardRow(name=key.lower(), attrs=attrs))
                continue
            val = (parts[0] or "").strip()
            if not key:
                continue
            if sec == "generator":
                # e.g. mk2_target -> mk1 ("mk1" is not .isalpha() because of the digit)
                if key.endswith("target"):
                    state.generator[key] = val.lower()
                else:
                    state.generator[key] = _num(val) if val else 0.0
            elif sec == "config":
                state.config[key] = _num(val) if val else 0.0
            elif sec == "booster":
                state.booster[key] = _num(val) if val else 0.0
    return state


def _booster_mult(state: GameState, name: str) -> float:
    return float(state.booster.get(f"{name}_multiplier", 1.0))


def _card_mult_product(cards: list[CardRow], stat: str) -> float:
    m = 1.0
    for c in cards:
        if not c.owned:
            continue
        m *= c.mult(stat)
    return m


def simulate_ticks(state: GameState, prestige_hours: float) -> tuple[float, int]:
    """
    Discrete tick model (see generator_optimizer_gui_spec.md):
        C  += r1 * G1 * m_cells
        G1 += r2 * G2 * m_mk2
        G2 += r3 * G3 * m_mk3
        G3 += r4 * G4 * m_mk4
        G4 += r5 * G5 * m_mk5

    mk{k}_prod from CSV = total shown output/tick for that tier -> r_k = P_k / G_k.
    r1 is inferred from cells_per_tick so the first tick matches the save:
        cells_per_tick = r1 * G1 * m_cells * m_mk1
    """
    tick_s = float(state.config["tick_seconds"])
    ticks = int(prestige_hours * 3600.0 / tick_s)
    if ticks < 1:
        ticks = 1

    G1 = float(state.generator["mk1_owned"])
    G2 = float(state.generator["mk2_owned"])
    G3 = float(state.generator["mk3_owned"])
    G4 = float(state.generator["mk4_owned"])
    G5 = float(state.generator["mk5_owned"])

    P2 = float(state.generator["mk2_prod"])
    P3 = float(state.generator["mk3_prod"])
    P4 = float(state.generator["mk4_prod"])
    P5 = float(state.generator["mk5_prod"])

    m_cells_b = _booster_mult(state, "cells")
    m1b = _booster_mult(state, "mk1")
    m2b = _booster_mult(state, "mk2")
    m3b = _booster_mult(state, "mk3")
    m4b = _booster_mult(state, "mk4")
    m5b = _booster_mult(state, "mk5")

    mc_cells = _card_mult_product(state.cards, "cells")
    mc_mk1 = _card_mult_product(state.cards, "mk1")
    mc_mk2 = _card_mult_product(state.cards, "mk2")
    mc_mk3 = _card_mult_product(state.cards, "mk3")
    mc_mk4 = _card_mult_product(state.cards, "mk4")
    mc_mk5 = _card_mult_product(state.cards, "mk5")

    m_cells = m_cells_b * mc_cells
    m_mk1 = m1b * mc_mk1
    m_mk2 = m2b * mc_mk2
    m_mk3 = m3b * mc_mk3
    m_mk4 = m4b * mc_mk4
    m_mk5 = m5b * mc_mk5

    cells_per_tick_ui = float(state.config["cells_per_tick"])
    r1 = cells_per_tick_ui / (G1 * m_cells * m_mk1) if G1 > 0 else 0.0
    r2 = P2 / G2 if G2 > 0 else 0.0
    r3 = P3 / G3 if G3 > 0 else 0.0
    r4 = P4 / G4 if G4 > 0 else 0.0
    r5 = P5 / G5 if G5 > 0 else 0.0

    C = float(state.config.get("current_cells", 0.0))

    for _ in range(ticks):
        C += r1 * G1 * m_cells * m_mk1
        G1 += r2 * G2 * m_mk2
        G2 += r3 * G3 * m_mk3
        G3 += r4 * G4 * m_mk4
        G4 += r5 * G5 * m_mk5

    return C, ticks


def print_summary(state: GameState) -> None:
    print("=== config ===")
    for k in sorted(state.config):
        v = state.config[k]
        if abs(v) >= 1e6 or (abs(v) > 0 and abs(v) < 1e-3):
            print(f"  {k}: {v:.6e}")
        else:
            print(f"  {k}: {v}")
    print("\n=== generators (subset) ===")
    for k in sorted(state.generator):
        v = state.generator[k]
        if isinstance(v, float) and abs(v) >= 1e6:
            print(f"  {k}: {v:.6e}")
        else:
            print(f"  {k}: {v}")
    print("\n=== boosters (multipliers) ===")
    for name in ("mk1", "mk2", "mk3", "mk4", "mk5", "cells", "mp", "shards"):
        m = _booster_mult(state, name)
        print(f"  {name}: x{m}")
    print("\n=== cards ===")
    for c in state.cards:
        st = "OWNED" if c.owned else f"{c.purchase_cost} gems"
        parts = ", ".join(f"{k}={v}" for k, v in sorted(c.attrs.items()))
        print(f"  {c.name:8} [{st}] {parts}")


def main(argv: list[str]) -> int:
    path = Path(argv[1]).resolve() if len(argv) > 1 else DEFAULT_CSV
    hours = float(argv[2]) if len(argv) > 2 else DEFAULT_PRESTIGE_HOURS

    if not path.is_file():
        print(f"File not found: {path}", file=sys.stderr)
        return 1

    state = load_game_state(path)
    print_summary(state)

    end_c, ticks = simulate_ticks(state, hours)
    start_c = float(state.config.get("current_cells", 0.0))
    tick_s = float(state.config["tick_seconds"])
    print("\n=== alpha simulation (discrete chain, constant booster/card mults) ===")
    print(f"  prestige: {hours} h  ->  {ticks} ticks @ {tick_s}s")
    print(f"  cells start: {start_c:.6e}")
    print(f"  cells end:   {end_c:.6e}")
    print(f"  delta:       {end_c - start_c:.6e}")
    if end_c > start_c:
        print(f"  ln growth:   {math.log(end_c / start_c):.6f}")

    purch = [c for c in state.cards if not c.owned and c.purchase_cost is not None]
    gems = int(state.config.get("gems", 0))
    print(f"\n=== purchasable cards (gems={gems}) ===")
    for c in purch:
        ok = "yes" if c.purchase_cost <= gems else "no"
        print(f"  {c.name:8} cost={c.purchase_cost}  affordable={ok}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
