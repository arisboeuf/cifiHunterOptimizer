#!/usr/bin/env python3
"""
Alpha: load unified game-state CSV, show summary + tick simulation.

- Default: **GUI** (tkinter).
- Terminal: ``python alpha_state_tool.py --cli [csv] [prestige_hours]`` (Standard-Prestige: 8 h)

**CSV (Gem-relevant):** Pro Booster/Generator nur der **aktuelle Preis fürs nächste Upgrade** (`*_next_cost` bzw. `mkN_cost`). Anstiege/Multiplikatoren: **Konstanten im Code**. **Karten:** feste Gem-Preise (`GAME_CARD_COST_GEMS`); CSV nur `cost=owned` vs. nicht, plus Effekt-Attribute (`cells=`, `mk2=`, …). Optional kann `cost=` in der CSV noch stehen — **wird für Gems ignoriert**, wenn die Karte im Konstanten-Dict steht.

Data format: section,key,value,extra1,extra2,extra3
Card rows use key=value tokens across value + extras (e.g. cost=1500, cells=2.3).
"""

from __future__ import annotations

import csv
import json
import math
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from io import StringIO
from pathlib import Path


DEFAULT_CSV = Path(__file__).resolve().parent / "data" / "sample_game_state.csv"
DEFAULT_PRESTIGE_HOURS = 8.0
UI_STATE_PATH = Path(__file__).resolve().parent / "data" / "alpha_manual_ui_state.json"

# --- Spielkonstanten (nicht aus CSV): Gem-Preis pro weiterem Kauf ---
# mk4/mk5/cells wie in generator_optimizer_gui_spec.md; übrige Werte Platzhalter → bei Bedarf anpassen.
GAME_BOOSTER_COST_INCREASE_GEMS: dict[str, float] = {
    "mk1": 2.0,
    "mk2": 2.0,
    "mk3": 3.0,
    "mk4": 4.0,
    "mk5": 5.0,
    "mk6": 6.0,
    "cells": 1.0,
    "mp": 5.0,
    "shards": 5.0,
}
# Nach +1 owned: ``mk{tier}_cost += GAME_GENERATOR_COST_INCREASE_GEMS[tier]`` (Gems).
# Nicht verwechseln mit ``GAME_BOOSTER_COST_INCREASE_GEMS`` (Booster-Shop, siehe Spec).
# Werte 0 = kein Generator-Kauf im Kaufpfad für diese Stufe (Preiskurve steht nicht in der Spec).
GAME_GENERATOR_COST_INCREASE_GEMS: dict[int, float] = {
    1: 0.0,
    2: 0.0,
    3: 0.0,
    4: 0.0,
    5: 0.0,
    6: 0.0,
}

MAX_MK_TIER = 6

# Feste Gem-Preise pro Karte (einmalig kaufbar). CSV muss keine Kosten mehr liefern (außer cost=owned).
GAME_CARD_COST_GEMS: dict[str, int] = {
    "delta": 1500,
    "epsilon": 1500,
    "fenix": 1500,
    "gamma": 2000,
    "helion": 2000,
    "ixion": 2000,
    "juno": 2500,
    "lyra": 2500,
    "kappa": 2500,
}

# Feste Karten-Effekte (für Manual-Input-Modus ohne CSV).
GAME_CARD_ATTRS: dict[str, dict[str, float]] = {
    "alpha": {"cells": 1.3, "mk1": 1.78, "mk2": 1.54},
    "beta": {"mk1": 1.54, "mk2": 1.54, "mk3": 1.54},
    "ceti": {"cells": 1.24, "mk3": 1.32, "mp": 1.08},
    "delta": {"cells": 2.3, "mk2": 1.14, "mk3": 1.14},
    "epsilon": {"mk1": 1.52, "mk2": 1.52, "mk4": 1.44},
    "fenix": {"cells": 1.16, "mk4": 1.5, "mp": 1.07},
    "gamma": {"cells": 2.4, "mk3": 1.34, "mk5": 1.34},
    "helion": {"mk1": 1.68, "mk2": 1.68, "mp": 1.13},
    "ixion": {"mk4": 1.64, "mk5": 1.52, "mp": 1.16},
    "juno": {"cells": 1.65, "shards": 1.45, "mp": 1.25},
    "lyra": {"mk2": 2.16, "mk5": 2.12, "shards": 1.5},
    "kappa": {"mk1": 2.84, "mk6": 1.92},
}

# Kaufpfad-Planung: Beam-Search (mehrere Teilpfade parallel), Ziel max. cells_end nach Prestige.
# Kein vollständiges globales Optimum (diskret, Reihenfolge wirkt auf Preise); breiterer Beam ~ bessere Näherung.
PURCHASE_PLAN_BEAM_WIDTH = 48
PURCHASE_PLAN_MAX_DEPTH = 250

# Kurzschreibweisen für große Zahlen (z. B. 409qu).
SHORT_SCALE_EXP: dict[str, int] = {
    "k": 3,
    "m": 6,
    "b": 9,
    "t": 12,
    "qu": 15,
    "sx": 21,
    "sp": 24,
    "oc": 27,
    "n": 30,
    "d": 33,
}


def _num(s: str) -> float:
    s = s.strip()
    if not s:
        raise ValueError("empty number")
    return float(s)


def _parse_short_scale_num(raw: str) -> float:
    """
    Parse Zahl mit optionalem Suffix:
    k=1e3, m=1e6, b=1e9, t=1e12, qu=1e15,
    sx=1e21, sp=1e24, oc=1e27, n=1e30, d=1e33.
    """
    s = raw.strip().lower().replace(",", ".")
    if not s:
        raise ValueError("empty number")
    for suf in sorted(SHORT_SCALE_EXP, key=len, reverse=True):
        if not s.endswith(suf):
            continue
        base = s[: -len(suf)].strip()
        if not base:
            raise ValueError(f"invalid short scale number: {raw}")
        return float(base) * (10.0 ** SHORT_SCALE_EXP[suf])
    return float(s)


def _has_short_scale_suffix(raw: str) -> bool:
    s = raw.strip().lower().replace(",", ".")
    if not s:
        return False
    for suf in sorted(SHORT_SCALE_EXP, key=len, reverse=True):
        if s.endswith(suf):
            base = s[: -len(suf)].strip()
            if base:
                return True
    return False


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
        if self.owned:
            return None
        if self.name in GAME_CARD_COST_GEMS:
            return int(GAME_CARD_COST_GEMS[self.name])
        c = self.attrs.get("cost", "")
        if c.lower() == "owned":
            return None
        if not c.strip():
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
    #: cells_per_tick = r1_anchor * G1 * m_cells * m_mk1 (t=0); bleibt bei Booster-/Card-Käufen fix (MK2–MK6-Mults nur in der Tick-Schleife).
    r1_anchor: float | None = None


def load_game_state(path: Path) -> GameState:
    state = GameState()
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not row.get("section"):
                continue
            sec = row["section"].strip().lower()
            raw_key = (row.get("key") or "").strip().lstrip("\ufeff")
            key = raw_key.lower()
            parts = [
                row.get("value") or "",
                row.get("extra1") or "",
                row.get("extra2") or "",
                row.get("extra3") or "",
            ]
            if sec == "card":
                attrs = _parse_kv_parts(parts)
                cname = key.lower()
                co = attrs.get("cost", "").lower()
                if co != "owned" and cname in GAME_CARD_COST_GEMS:
                    attrs.pop("cost", None)
                state.cards.append(CardRow(name=cname, attrs=attrs))
                continue
            val = (parts[0] or "").strip()
            if not key:
                continue
            if sec == "generator":
                if key.endswith("_cost_increase"):
                    continue
                # e.g. mk2_target -> mk1 ("mk1" is not .isalpha() because of the digit)
                if key.endswith("target"):
                    state.generator[key] = val.lower()
                else:
                    state.generator[key] = _num(val) if val else 0.0
            elif sec == "config":
                state.config[key] = _num(val) if val else 0.0
            elif sec == "booster":
                if key.endswith("_cost_increase"):
                    continue
                state.booster[key] = _num(val) if val else 0.0
    _finalize_r1_anchor(state)
    return state


def _finalize_r1_anchor(state: GameState) -> None:
    G1 = float(state.generator.get("mk1_owned", 0.0))
    if G1 <= 0:
        state.r1_anchor = 0.0
        return
    m_cells = _booster_mult(state, "cells") * _card_mult_product(state.cards, "cells")
    m_mk1 = _booster_mult(state, "mk1") * _card_mult_product(state.cards, "mk1")
    cpt = float(state.config.get("cells_per_tick", 0.0))
    state.r1_anchor = cpt / (G1 * m_cells * m_mk1)


def copy_state(state: GameState) -> GameState:
    return GameState(
        config=dict(state.config),
        generator=dict(state.generator),
        booster=dict(state.booster),
        cards=[CardRow(c.name, dict(c.attrs)) for c in state.cards],
        r1_anchor=state.r1_anchor,
    )


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
        G5 += r6 * G6 * m_mk6

    mk{k}_prod from CSV = total shown output/tick for that tier -> r_k = P_k / G_k.
    Mit gesetztem ``r1_anchor`` (nach ``load_game_state``): fester MK1→Cells-Rohfaktor;
    ``m_cells`` / ``m_mk1`` kommen aus Boostern + **owned** Cards und können bei Käufen steigen.
    """
    tick_s = float(state.config["tick_seconds"])
    ticks = int(prestige_hours * 3600.0 / tick_s)
    if ticks < 1:
        ticks = 1

    G1 = float(state.generator["mk1_owned"])
    G2 = float(state.generator["mk2_owned"])
    G3 = float(state.generator["mk3_owned"])
    G4 = float(state.generator["mk4_owned"])
    G5 = float(state.generator.get("mk5_owned", 0.0))
    G6 = float(state.generator.get("mk6_owned", 0.0))

    P2 = float(state.generator.get("mk2_prod", 0.0))
    P3 = float(state.generator.get("mk3_prod", 0.0))
    P4 = float(state.generator.get("mk4_prod", 0.0))
    P5 = float(state.generator.get("mk5_prod", 0.0))
    P6 = float(state.generator.get("mk6_prod", 0.0))

    m_cells_b = _booster_mult(state, "cells")
    m1b = _booster_mult(state, "mk1")
    m2b = _booster_mult(state, "mk2")
    m3b = _booster_mult(state, "mk3")
    m4b = _booster_mult(state, "mk4")
    m5b = _booster_mult(state, "mk5")
    m6b = _booster_mult(state, "mk6")

    mc_cells = _card_mult_product(state.cards, "cells")
    mc_mk1 = _card_mult_product(state.cards, "mk1")
    mc_mk2 = _card_mult_product(state.cards, "mk2")
    mc_mk3 = _card_mult_product(state.cards, "mk3")
    mc_mk4 = _card_mult_product(state.cards, "mk4")
    mc_mk5 = _card_mult_product(state.cards, "mk5")
    mc_mk6 = _card_mult_product(state.cards, "mk6")

    m_cells = m_cells_b * mc_cells
    m_mk1 = m1b * mc_mk1
    m_mk2 = m2b * mc_mk2
    m_mk3 = m3b * mc_mk3
    m_mk4 = m4b * mc_mk4
    m_mk5 = m5b * mc_mk5
    m_mk6 = m6b * mc_mk6

    if state.r1_anchor is not None:
        r1 = float(state.r1_anchor)
    else:
        cells_per_tick_ui = float(state.config["cells_per_tick"])
        r1 = cells_per_tick_ui / (G1 * m_cells * m_mk1) if G1 > 0 else 0.0
    r2 = P2 / G2 if G2 > 0 else 0.0
    r3 = P3 / G3 if G3 > 0 else 0.0
    r4 = P4 / G4 if G4 > 0 else 0.0
    r5 = P5 / G5 if G5 > 0 else 0.0
    r6 = P6 / G6 if G6 > 0 else 0.0

    C = float(state.config.get("current_cells", 0.0))

    for _ in range(ticks):
        C += r1 * G1 * m_cells * m_mk1
        G1 += r2 * G2 * m_mk2
        G2 += r3 * G3 * m_mk3
        G3 += r4 * G4 * m_mk4
        G4 += r5 * G5 * m_mk5
        G5 += r6 * G6 * m_mk6

    return C, ticks


BOOSTER_PREFIXES = ("mk1", "mk2", "mk3", "mk4", "mk5", "mk6", "cells", "mp", "shards")


def apply_booster_buy(state: GameState, prefix: str) -> None:
    gain_k = f"{prefix}_base_gain"
    mult_k = f"{prefix}_multiplier"
    cost_k = f"{prefix}_next_cost"
    if gain_k not in state.booster or mult_k not in state.booster or cost_k not in state.booster:
        return
    gain = float(state.booster[gain_k])
    state.booster[mult_k] = float(state.booster[mult_k]) * (1.0 + gain)
    inc = float(GAME_BOOSTER_COST_INCREASE_GEMS.get(prefix, 0.0))
    state.booster[cost_k] = float(state.booster[cost_k]) + inc


def apply_card_buy(state: GameState, card_name: str) -> None:
    n = card_name.strip().lower()
    for c in state.cards:
        if c.name == n:
            c.attrs = dict(c.attrs)
            c.attrs["cost"] = "owned"
            return


def booster_next_cost(state: GameState, prefix: str) -> int | None:
    k = f"{prefix}_next_cost"
    if k not in state.booster:
        return None
    return int(float(state.booster[k]))


def apply_generator_buy(state: GameState, tier: int) -> int:
    """+1 owned; ``mk{tier}_cost`` += ``GAME_GENERATOR_COST_INCREASE_GEMS[tier]``. Rückgabe: gezahlte Gems."""
    pref = f"mk{tier}"
    ok, ck = f"{pref}_owned", f"{pref}_cost"
    if ok not in state.generator or ck not in state.generator:
        return -1
    inc = float(GAME_GENERATOR_COST_INCREASE_GEMS.get(tier, 0.0))
    if inc <= 0.0:
        return -1
    paid = int(float(state.generator[ck]))
    state.generator[ok] = float(state.generator[ok]) + 1.0
    state.generator[ck] = float(state.generator[ck]) + inc
    return paid


def generator_buy_cost(state: GameState, tier: int) -> int | None:
    ck = f"mk{tier}_cost"
    if ck not in state.generator:
        return None
    return int(float(state.generator[ck]))


def _qf(x: float) -> float:
    """Stable-enough float for plan-state deduplication keys."""
    return float(f"{float(x):.12g}")


def _plan_state_key(state: GameState, gems_left: int) -> tuple[object, ...]:
    row: list[object] = []
    for p in BOOSTER_PREFIXES:
        mk = f"{p}_multiplier"
        if mk not in state.booster:
            continue
        row.append(
            (
                p,
                _qf(float(state.booster[mk])),
                _qf(float(state.booster.get(f"{p}_next_cost", 0.0))),
            )
        )
    for i in range(1, MAX_MK_TIER + 1):
        row.append(
            (
                i,
                _qf(float(state.generator.get(f"mk{i}_owned", 0.0))),
                _qf(float(state.generator.get(f"mk{i}_cost", 0.0))),
            )
        )
    row.append(tuple((c.name, c.owned) for c in sorted(state.cards, key=lambda x: x.name)))
    row.append(int(gems_left))
    return tuple(row)


def _plan_state_sim_key(state: GameState) -> tuple[object, ...]:
    """Spielzustand ohne Gems — ``cells_end`` der Simulation hängt davon ab."""
    row: list[object] = []
    for p in BOOSTER_PREFIXES:
        mk = f"{p}_multiplier"
        if mk not in state.booster:
            continue
        row.append(
            (
                p,
                _qf(float(state.booster[mk])),
                _qf(float(state.booster.get(f"{p}_next_cost", 0.0))),
            )
        )
    for i in range(1, MAX_MK_TIER + 1):
        row.append(
            (
                i,
                _qf(float(state.generator.get(f"mk{i}_owned", 0.0))),
                _qf(float(state.generator.get(f"mk{i}_cost", 0.0))),
            )
        )
    row.append(tuple((c.name, c.owned) for c in sorted(state.cards, key=lambda x: x.name)))
    return tuple(row)


def _apply_purchase_by_kind(state: GameState, kind: str, name: str) -> None:
    if kind == "booster":
        apply_booster_buy(state, str(name))
    elif kind == "generator":
        apply_generator_buy(state, int(str(name)[2:]))
    else:
        apply_card_buy(state, str(name))


def _purchase_benefit_index(pct_gain: float, cost: float) -> float:
    """
    +% Zuwachs pro Kauf / Gem.
    """
    if cost <= 0 or not math.isfinite(pct_gain) or not math.isfinite(cost) or pct_gain <= 0.0:
        return 0.0
    return float(pct_gain) / float(cost)


def _legal_purchase_edges(
    state: GameState,
    gems_left: int,
    skip: frozenset[str],
    cells_fn: Callable[[GameState], float],
) -> list[tuple[str, str, int]]:
    """Alle legalen Ein-Kauf-Kanten (kind, name, cost) mit strikt steigendem cells_end."""
    sc = cells_fn
    out0 = float(sc(state))
    if out0 <= 0 or not math.isfinite(out0):
        return []
    edges: list[tuple[str, str, int]] = []
    for prefix in BOOSTER_PREFIXES:
        cost = booster_next_cost(state, prefix)
        if cost is None or cost <= 0 or cost > gems_left:
            continue
        trial = copy_state(state)
        apply_booster_buy(trial, prefix)
        out1 = float(sc(trial))
        if out1 <= out0 or not math.isfinite(out1):
            continue
        edges.append(("booster", prefix, cost))
    for tier in range(1, MAX_MK_TIER + 1):
        cost_g = generator_buy_cost(state, tier)
        if cost_g is None or cost_g <= 0 or cost_g > gems_left:
            continue
        trial = copy_state(state)
        paid = apply_generator_buy(trial, tier)
        if paid < 0 or paid != cost_g:
            continue
        out1 = float(sc(trial))
        if out1 <= out0 or not math.isfinite(out1):
            continue
        edges.append(("generator", f"mk{tier}", cost_g))
    for c in state.cards:
        if c.owned or c.name in skip:
            continue
        pc = c.purchase_cost
        if pc is None or pc <= 0 or pc > gems_left:
            continue
        trial = copy_state(state)
        apply_card_buy(trial, c.name)
        out1 = float(sc(trial))
        if out1 <= out0 or not math.isfinite(out1):
            continue
        edges.append(("card", c.name, pc))
    return edges


def plan_purchase_steps(
    state: GameState,
    hours: float,
    gems_budget: int,
    skip_cards: frozenset[str] | set[str] | None = None,
) -> list[dict[str, object]]:
    """
    Beam-Search über Kauffolgen (Booster + Generatoren + Karten) unter dem Gem-Budget.

    Zielfunktion: ``simulate_ticks(state, hours)[0]`` am Endzustand; Tie-Break: mehr übrige Gems.
    Kaufreihenfolge wirkt auf die Gesamtkosten (Booster-``next_cost``-Kette); Beam hält die
    besten Teillösungen parallel (kein garantiert globales Optimum).

    ``skip_cards``: Karten ohne GUI-Haken werden nicht gekauft.
    """
    skip = frozenset(skip_cards) if skip_cards is not None else frozenset()
    beam_w = max(1, int(PURCHASE_PLAN_BEAM_WIDTH))
    max_d = max(1, int(PURCHASE_PLAN_MAX_DEPTH))

    sim_cache: dict[tuple[object, ...], float] = {}

    def sim_cells(st: GameState) -> float:
        k = _plan_state_sim_key(st)
        hit = sim_cache.get(k)
        if hit is not None:
            return hit
        v = float(simulate_ticks(st, hours)[0])
        sim_cache[k] = v
        return v

    s0 = copy_state(state)
    c0 = sim_cells(s0)
    if not math.isfinite(c0) or c0 <= 0:
        return []

    frontier: list[tuple[float, int, GameState, list[dict[str, object]]]] = [
        (float(c0), int(gems_budget), s0, [])
    ]
    best_terminal: tuple[float, int, list[dict[str, object]]] | None = None

    def consider_terminal(cells_t: float, gems_t: int, path_t: list[dict[str, object]]) -> None:
        nonlocal best_terminal
        if best_terminal is None:
            best_terminal = (cells_t, gems_t, path_t)
            return
        bc, bg, _bp = best_terminal
        if cells_t > bc or (cells_t == bc and gems_t > bg):
            best_terminal = (cells_t, gems_t, path_t)

    for _depth in range(max_d):
        children_raw: list[tuple[float, int, GameState, list[dict[str, object]]]] = []
        for cells_par, gl, st, path in frontier:
            edges = _legal_purchase_edges(st, gl, skip, sim_cells)
            if not edges:
                consider_terminal(cells_par, gl, path)
                continue
            for kind, name, cost in edges:
                st2 = copy_state(st)
                _apply_purchase_by_kind(st2, kind, name)
                gl2 = gl - cost
                new_c = sim_cells(st2)
                if not math.isfinite(new_c) or new_c <= cells_par:
                    continue
                c_start = float(st.config.get("current_cells", 0.0))
                base_run_gain = cells_par - c_start
                new_run_gain = new_c - c_start
                if base_run_gain <= 0.0 or new_run_gain <= 0.0:
                    continue
                ratio_run = new_run_gain / base_run_gain
                pct_gain = (ratio_run - 1.0) * 100.0 if math.isfinite(ratio_run) and ratio_run > 0 else 0.0
                sc = _purchase_benefit_index(pct_gain, float(cost))
                step: dict[str, object] = {
                    "step": len(path) + 1,
                    "kind": kind,
                    "name": name,
                    "cost": int(cost),
                    "gems_left": int(gl2),
                    "pct_gain": float(pct_gain),
                    "pct_per_gem": float(sc),
                    "cells_end": float(new_c),
                }
                children_raw.append((float(new_c), int(gl2), st2, path + [step]))

        if not children_raw:
            break

        merged: dict[tuple[object, ...], tuple[float, int, GameState, list[dict[str, object]]]] = {}
        for new_c, gl2, st2, path_full in children_raw:
            key = _plan_state_key(st2, gl2)
            old = merged.get(key)
            if old is None or new_c > old[0] or (new_c == old[0] and gl2 > old[1]):
                merged[key] = (new_c, gl2, st2, path_full)

        ranked = sorted(merged.values(), key=lambda x: (x[0], x[1]), reverse=True)
        frontier = ranked[:beam_w]

    for cells_par, gl, _st, path in frontier:
        consider_terminal(cells_par, gl, path)

    if best_terminal is None:
        return []
    _bc, _bg, best_path = best_terminal
    out: list[dict[str, object]] = []
    for i, step in enumerate(best_path, start=1):
        d = dict(step)
        d["step"] = i
        out.append(d)
    return out


def build_report_text(state: GameState, hours: float, gems_budget_display: int | None = None) -> str:
    buf = StringIO()

    def ln(s: str = "") -> None:
        buf.write(s + "\n")

    ln("=== config ===")
    for k in sorted(state.config):
        v = state.config[k]
        if abs(v) >= 1e6 or (abs(v) > 0 and abs(v) < 1e-3):
            ln(f"  {k}: {v:.6e}")
        else:
            ln(f"  {k}: {v}")
    ln("\n=== generators (subset) ===")
    for k in sorted(state.generator):
        v = state.generator[k]
        if isinstance(v, float) and abs(v) >= 1e6:
            ln(f"  {k}: {v:.6e}")
        else:
            ln(f"  {k}: {v}")
    ln("\n=== boosters (multipliers) ===")
    for name in ("mk1", "mk2", "mk3", "mk4", "mk5", "mk6", "cells", "mp", "shards"):
        m = _booster_mult(state, name)
        ln(f"  {name}: x{m}")
    ln("\n=== cards ===")
    for c in state.cards:
        st = "OWNED" if c.owned else f"{c.purchase_cost} gems"
        parts = ", ".join(f"{k}={v}" for k, v in sorted(c.attrs.items()))
        ln(f"  {c.name:8} [{st}] {parts}")

    end_c, ticks = simulate_ticks(state, hours)
    start_c = float(state.config.get("current_cells", 0.0))
    tick_s = float(state.config["tick_seconds"])
    ln("\n=== alpha simulation (discrete chain, constant booster/card mults) ===")
    ln(f"  prestige: {hours} h  ->  {ticks} ticks @ {tick_s}s")
    ln(f"  cells start: {start_c:.6e}")
    ln(f"  cells end:   {end_c:.6e}")
    ln(f"  delta:       {end_c - start_c:.6e}")
    if end_c > start_c and start_c > 0:
        ln(f"  ln growth:   {math.log(end_c / start_c):.6f}")

    purch = [c for c in state.cards if not c.owned and c.purchase_cost is not None]
    gems = gems_budget_display if gems_budget_display is not None else int(state.config.get("gems", 0))
    ln(f"\n=== purchasable cards (gems={gems}) ===")
    for c in purch:
        ok = "yes" if c.purchase_cost <= gems else "no"
        ln(f"  {c.name:8} cost={c.purchase_cost}  affordable={ok}")

    return buf.getvalue()


def run_analysis(
    path: Path,
    hours: float,
    gems_budget: int | None = None,
    skip_cards: frozenset[str] | set[str] | None = None,
) -> tuple[str, list[dict[str, object]]]:
    if not path.is_file():
        raise FileNotFoundError(f"Datei nicht gefunden: {path}")
    state = load_game_state(path)
    g = gems_budget if gems_budget is not None else int(state.config.get("gems", 0))
    text = build_report_text(state, hours, gems_budget_display=g)
    plan = plan_purchase_steps(state, hours, g, skip_cards)
    return text, plan


def build_manual_state(
    values: dict[str, float], owned_cards: frozenset[str] | set[str]
) -> GameState:
    st = GameState()
    st.config = {
        "tick_seconds": float(values["tick_seconds"]),
        "cells_per_tick": float(values["cells_per_tick"]),
        "current_cells": 0.0,
        "gems": float(values["gems_budget"]),
        "level": 0.0,
    }
    st.generator = {
        "mk1_owned": float(values["mk1_owned"]),
        "mk2_owned": float(values["mk2_owned"]),
        "mk3_owned": float(values["mk3_owned"]),
        "mk4_owned": float(values["mk4_owned"]),
        "mk5_owned": float(values["mk5_owned"]),
        "mk6_owned": float(values.get("mk6_owned", 0.0)),
        "mk1_cost": 1e30,
        "mk2_cost": 1e30,
        "mk3_cost": 1e30,
        "mk4_cost": 1e30,
        "mk5_cost": 1e30,
        "mk6_cost": 1e30,
        "mk2_prod": float(values["mk2_prod"]),
        "mk3_prod": float(values["mk3_prod"]),
        "mk4_prod": float(values["mk4_prod"]),
        "mk5_prod": float(values["mk5_prod"]),
        "mk6_prod": float(values.get("mk6_prod", 0.0)),
        "mk2_target": "mk1",
        "mk3_target": "mk2",
        "mk4_target": "mk3",
        "mk5_target": "mk4",
        "mk6_target": "mk5",
    }
    st.booster = {
        "mk1_multiplier": 1.0,
        "mk2_multiplier": 1.0,
        "mk3_multiplier": 1.0,
        "mk4_multiplier": 1.0,
        "mk5_multiplier": 1.0,
        "mk6_multiplier": 1.0,
        "cells_multiplier": 1.0,
        "mk1_next_cost": float(values["mk1_next_cost"]),
        "mk2_next_cost": float(values["mk2_next_cost"]),
        "mk3_next_cost": float(values["mk3_next_cost"]),
        "mk4_next_cost": float(values["mk4_next_cost"]),
        "mk5_next_cost": float(values["mk5_next_cost"]),
        "mk6_next_cost": float(values.get("mk6_next_cost", 0.0)),
        "cells_next_cost": float(values["cells_next_cost"]),
        "mk1_base_gain": 0.02,
        "mk2_base_gain": 0.04,
        "mk3_base_gain": 0.06,
        "mk4_base_gain": 0.08,
        "mk5_base_gain": 0.10,
        "mk6_base_gain": 0.12,
        "cells_base_gain": 0.25,
    }
    cards: list[CardRow] = []
    own = frozenset(n.lower() for n in owned_cards)
    for name, attrs in GAME_CARD_ATTRS.items():
        row = {k: str(v) for k, v in attrs.items()}
        if name in own:
            row["cost"] = "owned"
        cards.append(CardRow(name=name, attrs=row))
    st.cards = cards
    _finalize_r1_anchor(st)
    return st


def main_cli(args: list[str]) -> int:
    if not args:
        print(
            "CLI: alpha_state_tool.py --cli <csv> [prestige_hours] [gems_budget]",
            file=sys.stderr,
        )
        return 2
    path = Path(args[0]).resolve()
    hours = float(args[1]) if len(args) > 1 else DEFAULT_PRESTIGE_HOURS
    gems = int(float(args[2])) if len(args) > 2 else None
    try:
        text, _plan = run_analysis(path, hours, gems)
        print(text, end="")
    except (OSError, ValueError, FileNotFoundError, ZeroDivisionError) as e:
        print(str(e), file=sys.stderr)
        return 1
    return 0


def main_gui() -> None:
    import tkinter as tk
    from tkinter import messagebox, ttk

    # Dark palette (editor-style, nähe an Cursor/VS Dark+)
    BG = "#181818"
    PANEL_BG = "#1f1f1f"
    FG = "#e6e6e6"
    DIM = "#9aa0a6"
    INPUT_BG = "#252526"
    INPUT_BORDER = "#3f3f46"
    BTN_BG = "#2d2d30"
    BTN_ACTIVE = "#3a3a3d"
    ACCENT = "#3b82f6"
    SEL_BG = "#1f4a7a"
    SEL_FG = "#ffffff"

    root = tk.Tk()
    root.title("CIFI Alpha — Manual Optimizer")
    root.minsize(980, 620)
    root.configure(bg=BG)

    style = ttk.Style(root)
    if "clam" in style.theme_names():
        style.theme_use("clam")
    style.configure("TFrame", background=BG)
    style.configure("TLabelframe", background=PANEL_BG, borderwidth=1, relief="solid")
    style.configure("TLabelframe.Label", background=PANEL_BG, foreground=FG)
    style.configure("TLabel", background=BG, foreground=FG)
    style.configure("Dim.TLabel", background=BG, foreground=DIM)
    style.configure("Panel.TLabel", background=PANEL_BG, foreground=FG)
    style.configure("PanelDim.TLabel", background=PANEL_BG, foreground=DIM)
    style.configure("TButton", background=BTN_BG, foreground=FG, borderwidth=1)
    style.map(
        "TButton",
        background=[("active", BTN_ACTIVE), ("pressed", BTN_ACTIVE)],
        foreground=[("disabled", DIM)],
    )
    style.configure(
        "TEntry",
        fieldbackground=INPUT_BG,
        foreground=FG,
        insertcolor=FG,
        bordercolor=INPUT_BORDER,
        lightcolor=INPUT_BG,
        darkcolor=INPUT_BG,
    )
    style.configure(
        "Treeview",
        background=INPUT_BG,
        foreground=FG,
        fieldbackground=INPUT_BG,
        borderwidth=0,
    )
    style.configure("Treeview.Heading", background=BTN_BG, foreground=FG, borderwidth=1)
    style.map("Treeview", background=[("selected", SEL_BG)], foreground=[("selected", SEL_FG)])
    # Tk erwartet bei Font-Familien mit Leerzeichen geschweifte Klammern.
    root.option_add("*Font", "{Segoe UI} 10")

    hours_var = tk.StringVar(value=str(DEFAULT_PRESTIGE_HOURS))
    status_var = tk.StringVar(value="Bereit.")
    split = ttk.Panedwindow(root, orient=tk.HORIZONTAL)
    split.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

    left_outer = ttk.Frame(split)
    right = ttk.Frame(split)
    split.add(left_outer, weight=3)
    split.add(right, weight=5)

    left_canvas = tk.Canvas(
        left_outer,
        bg=BG,
        highlightthickness=0,
        bd=0,
    )
    left_scroll = ttk.Scrollbar(left_outer, orient=tk.VERTICAL, command=left_canvas.yview)
    left_canvas.configure(yscrollcommand=left_scroll.set)
    left_scroll.pack(side=tk.RIGHT, fill=tk.Y)
    left_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
    left = ttk.Frame(left_canvas)
    left_canvas_win = left_canvas.create_window((0, 0), window=left, anchor="nw")

    def _left_update_scrollregion(_evt: object | None = None) -> None:
        left_canvas.configure(scrollregion=left_canvas.bbox("all"))

    def _left_fit_inner_width(evt: object) -> None:
        w = getattr(evt, "width", 0)
        if w and isinstance(w, int):
            left_canvas.itemconfigure(left_canvas_win, width=w)

    def _left_wheel(evt: object) -> None:
        d = getattr(evt, "delta", 0)
        if isinstance(d, int) and d != 0:
            left_canvas.yview_scroll(int(-d / 120), "units")

    left.bind("<Configure>", _left_update_scrollregion)
    left_canvas.bind("<Configure>", _left_fit_inner_width)
    left_canvas.bind("<Enter>", lambda _e: left_canvas.bind_all("<MouseWheel>", _left_wheel))
    left_canvas.bind("<Leave>", lambda _e: left_canvas.unbind_all("<MouseWheel>"))

    vars_num: dict[str, tk.StringVar] = {
        "tick_seconds": tk.StringVar(value="4.9"),
        "gems_budget": tk.StringVar(value="5000"),
        "mk1_next_cost": tk.StringVar(value="18"),
        "mk2_next_cost": tk.StringVar(value="30"),
        "mk3_next_cost": tk.StringVar(value="42"),
        "mk4_next_cost": tk.StringVar(value="72"),
        "mk5_next_cost": tk.StringVar(value="100"),
        "mk6_next_cost": tk.StringVar(value="120"),
        "cells_next_cost": tk.StringVar(value="203"),
    }
    sci_vars: dict[str, tuple[tk.StringVar, tk.StringVar]] = {
        "mk1_owned": (tk.StringVar(value="1"), tk.StringVar(value="0")),
        "mk2_owned": (tk.StringVar(value="1"), tk.StringVar(value="0")),
        "mk3_owned": (tk.StringVar(value="1"), tk.StringVar(value="0")),
        "mk4_owned": (tk.StringVar(value="1"), tk.StringVar(value="0")),
        "mk5_owned": (tk.StringVar(value="1"), tk.StringVar(value="0")),
        "mk6_owned": (tk.StringVar(value="1"), tk.StringVar(value="0")),
        "cells_per_tick": (tk.StringVar(value="1"), tk.StringVar(value="6")),
        "mk2_prod": (tk.StringVar(value="1"), tk.StringVar(value="2")),
        "mk3_prod": (tk.StringVar(value="1"), tk.StringVar(value="1")),
        "mk4_prod": (tk.StringVar(value="1"), tk.StringVar(value="0")),
        "mk5_prod": (tk.StringVar(value="1"), tk.StringVar(value="-1")),
        "mk6_prod": (tk.StringVar(value="1"), tk.StringVar(value="-2")),
    }
    sci_preview_vars: dict[str, tk.StringVar] = {k: tk.StringVar(value="") for k in sci_vars}
    sci_exp_entries: dict[str, ttk.Entry] = {}
    owned_vars: dict[str, tk.BooleanVar] = {
        n: tk.BooleanVar(value=(n in {"alpha", "beta", "ceti"})) for n in sorted(GAME_CARD_ATTRS)
    }

    def save_ui_state() -> None:
        payload = {
            "hours": hours_var.get(),
            "vars_num": {k: v.get() for k, v in vars_num.items()},
            "sci_vars": {k: {"mantissa": m.get(), "exp": e.get()} for k, (m, e) in sci_vars.items()},
            "owned_cards": sorted([n for n, v in owned_vars.items() if v.get()]),
        }
        UI_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        UI_STATE_PATH.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")

    def load_ui_state() -> None:
        if not UI_STATE_PATH.is_file():
            return
        try:
            data = json.loads(UI_STATE_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        if isinstance(data.get("hours"), str):
            hours_var.set(data["hours"])
        vn = data.get("vars_num")
        if isinstance(vn, dict):
            for k, var in vars_num.items():
                raw = vn.get(k)
                if isinstance(raw, str):
                    var.set(raw)
        sv = data.get("sci_vars")
        if isinstance(sv, dict):
            for k, (m, e) in sci_vars.items():
                raw = sv.get(k)
                if isinstance(raw, dict):
                    if isinstance(raw.get("mantissa"), str):
                        m.set(raw["mantissa"])
                    if isinstance(raw.get("exp"), str):
                        e.set(raw["exp"])
        oc = data.get("owned_cards")
        if isinstance(oc, list):
            own = frozenset(str(x).lower() for x in oc)
            for n, v in owned_vars.items():
                v.set(n in own)

    load_ui_state()

    def add_row(parent: ttk.Frame, r: int, label: str, key: str) -> None:
        ttk.Label(parent, text=label, style="Panel.TLabel").grid(
            row=r, column=0, sticky=tk.W, padx=(0, 8), pady=1
        )
        ttk.Entry(parent, textvariable=vars_num[key], width=16).grid(row=r, column=1, sticky=tk.EW, pady=1)

    def add_row_sci(parent: ttk.Frame, r: int, label: str, key: str) -> None:
        ttk.Label(parent, text=label, style="Panel.TLabel").grid(
            row=r, column=0, sticky=tk.W, padx=(0, 8), pady=1
        )
        mant_v, exp_v = sci_vars[key]
        wrap = ttk.Frame(parent)
        wrap.grid(row=r, column=1, sticky=tk.EW, pady=1)
        ttk.Entry(wrap, textvariable=mant_v, width=10).pack(side=tk.LEFT)
        ttk.Label(wrap, text="e", style="Panel.TLabel").pack(side=tk.LEFT, padx=4)
        exp_ent = ttk.Entry(wrap, textvariable=exp_v, width=6)
        exp_ent.pack(side=tk.LEFT)
        sci_exp_entries[key] = exp_ent
        ttk.Label(wrap, textvariable=sci_preview_vars[key], style="PanelDim.TLabel").pack(
            side=tk.LEFT, padx=(8, 0)
        )

    def refresh_sci_preview() -> None:
        for k, (m, e) in sci_vars.items():
            exp_ent = sci_exp_entries.get(k)
            if _has_short_scale_suffix(m.get()):
                if e.get() != "0":
                    e.set("0")
                if exp_ent is not None:
                    exp_ent.configure(state="disabled")
            else:
                if exp_ent is not None:
                    exp_ent.configure(state="normal")
            try:
                mv = _parse_short_scale_num(m.get())
                ev = int(float(e.get().replace(",", ".")))
                vv = mv * (10.0**ev)
                sci_preview_vars[k].set(f"= {vv:.2e}")
            except (ValueError, OverflowError):
                sci_preview_vars[k].set("= ?")

    f_top = ttk.Frame(left)
    f_top.pack(fill=tk.X, padx=4, pady=(0, 2))
    run_btn = ttk.Button(f_top, text="Auswerten")
    run_btn.pack(side=tk.LEFT)
    ttk.Label(f_top, textvariable=status_var, style="Dim.TLabel").pack(side=tk.LEFT, padx=10)

    f_run = ttk.LabelFrame(left, text="Run")
    f_run.pack(fill=tk.X, padx=4, pady=(0, 2))
    ttk.Label(f_run, text="Prestige (h)", style="Panel.TLabel").grid(
        row=0, column=0, sticky=tk.W, padx=(0, 8), pady=1
    )
    ttk.Entry(f_run, textvariable=hours_var, width=16).grid(row=0, column=1, sticky=tk.EW, pady=1)
    add_row(f_run, 1, "Seconds/Tick", "tick_seconds")
    add_row(f_run, 2, "Gem Budget", "gems_budget")
    f_run.columnconfigure(1, weight=1)

    f_rates = ttk.LabelFrame(left, text="Generator-Rates")
    f_rates.pack(fill=tk.X, padx=4, pady=2)
    add_row_sci(f_rates, 0, "MK1 owned", "mk1_owned")
    add_row_sci(f_rates, 1, "MK2 owned", "mk2_owned")
    add_row_sci(f_rates, 2, "MK3 owned", "mk3_owned")
    add_row_sci(f_rates, 3, "MK4 owned", "mk4_owned")
    add_row_sci(f_rates, 4, "MK5 owned", "mk5_owned")
    add_row_sci(f_rates, 5, "MK6 owned", "mk6_owned")
    add_row_sci(f_rates, 6, "MK1 = Cells/tick (gesamt)", "cells_per_tick")
    add_row_sci(f_rates, 7, "MK2 -> MK1 /tick", "mk2_prod")
    add_row_sci(f_rates, 8, "MK3 -> MK2 /tick", "mk3_prod")
    add_row_sci(f_rates, 9, "MK4 -> MK3 /tick", "mk4_prod")
    add_row_sci(f_rates, 10, "MK5 -> MK4 /tick", "mk5_prod")
    add_row_sci(f_rates, 11, "MK6 -> MK5 /tick", "mk6_prod")
    f_rates.columnconfigure(1, weight=1)
    for m, e in sci_vars.values():
        m.trace_add("write", lambda *_: refresh_sci_preview())
        e.trace_add("write", lambda *_: refresh_sci_preview())
    refresh_sci_preview()

    f_cost = ttk.LabelFrame(left, text="Booster-Next-Cost (Gems)")
    f_cost.pack(fill=tk.X, padx=4, pady=2)
    add_row(f_cost, 0, "MK1", "mk1_next_cost")
    add_row(f_cost, 1, "MK2", "mk2_next_cost")
    add_row(f_cost, 2, "MK3", "mk3_next_cost")
    add_row(f_cost, 3, "MK4", "mk4_next_cost")
    add_row(f_cost, 4, "MK5", "mk5_next_cost")
    add_row(f_cost, 5, "MK6", "mk6_next_cost")
    add_row(f_cost, 6, "Cells", "cells_next_cost")
    f_cost.columnconfigure(1, weight=1)

    def show_cards_info_popup() -> None:
        pop = tk.Toplevel(root)
        pop.title("Cards - Effekte")
        pop.configure(bg=BG)
        pop.transient(root)
        pop.geometry("760x420")

        frm = ttk.Frame(pop)
        frm.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

        cols_i = ("name", "cost", "effects", "owned")
        tree_i = ttk.Treeview(frm, columns=cols_i, show="headings", height=14)
        for cid, title, w in (
            ("name", "Card", 120),
            ("cost", "Kosten", 90),
            ("effects", "Effekte", 420),
            ("owned", "Vorhanden", 90),
        ):
            tree_i.heading(cid, text=title)
            tree_i.column(cid, width=w, stretch=True)
        tree_i.pack(fill=tk.BOTH, expand=True)

        for name in sorted(GAME_CARD_ATTRS):
            effects = ", ".join(f"{k} x{v}" for k, v in sorted(GAME_CARD_ATTRS[name].items()))
            cost = str(GAME_CARD_COST_GEMS.get(name, "-"))
            own_var = owned_vars.get(name)
            own = "ja" if (own_var is not None and own_var.get()) else "nein"
            tree_i.insert("", tk.END, values=(name, cost, effects, own))

    cards_hdr = ttk.Frame(left)
    cards_hdr.pack(fill=tk.X, padx=4, pady=(2, 0))
    ttk.Label(cards_hdr, text="Cards vorhanden (abhaken)", style="Dim.TLabel").pack(side=tk.LEFT)
    ttk.Button(cards_hdr, text="Cards-Info", command=show_cards_info_popup).pack(side=tk.RIGHT)

    f_cards = ttk.LabelFrame(left, text="")
    f_cards.pack(fill=tk.X, padx=4, pady=2)
    card_grid = ttk.Frame(f_cards)
    card_grid.pack(fill=tk.X, padx=2, pady=2)
    for i, name in enumerate(sorted(owned_vars)):
        r, c = divmod(i, 3)
        tk.Checkbutton(
            card_grid,
            text=name,
            variable=owned_vars[name],
            bg=PANEL_BG,
            fg=FG,
            selectcolor=INPUT_BG,
            activebackground=PANEL_BG,
            activeforeground=FG,
            highlightthickness=0,
        ).grid(row=r, column=c, sticky=tk.W, padx=6, pady=1)

    ttk.Label(
        left,
        text="Hinweis: Booster-/Cells-Multiplier sind im Quick-Mode fix auf x1.0.",
        style="Dim.TLabel",
    ).pack(anchor=tk.W, padx=6, pady=(1, 2))

    tbl = ttk.LabelFrame(right, text="Kaufsequenz")
    tbl.pack(fill=tk.BOTH, expand=True, padx=4, pady=(0, 6))
    ttk.Label(
        tbl,
        text=(
            "Spalte „+%/Gem“: pro Kauf der prozentuale Zuwachs am End-Output geteilt durch die Gem-Kosten "
            "dieses Schritts. Hoeher ist besser."
        ),
        style="PanelDim.TLabel",
        wraplength=700,
    ).pack(anchor=tk.W, padx=6, pady=(0, 2))

    cols = ("step", "kind", "name", "cost", "gems", "pct_gain", "pct_per_gem", "cells_end")
    tree = ttk.Treeview(tbl, columns=cols, show="headings", height=9)
    headings = (
        ("step", "#", 36),
        ("kind", "Art", 72),
        ("name", "Name", 88),
        ("cost", "Kosten", 64),
        ("gems", "Gems übrig", 88),
        ("pct_gain", "+%", 78),
        ("pct_per_gem", "+%/Gem", 104),
        ("cells_end", "Cells Ende", 120),
    )
    for cid, title, w in headings:
        tree.heading(cid, text=title)
        tree.column(cid, width=w, stretch=True)
    tree.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

    def fill_tree(plan: list[dict[str, object]]) -> None:
        for iid in tree.get_children():
            tree.delete(iid)
        for row in plan:
            ce = float(row["cells_end"])
            ce_s = f"{ce:.6e}" if abs(ce) >= 1e6 or (ce != 0 and abs(ce) < 1e-3) else f"{ce:.6f}"
            tree.insert(
                "",
                tk.END,
                values=(
                    row["step"],
                    row["kind"],
                    row["name"],
                    row["cost"],
                    row["gems_left"],
                    f'{float(row["pct_gain"]):.2f}',
                    f'{float(row["pct_per_gem"]):.4f}',
                    ce_s,
                ),
            )

    summary_var = tk.StringVar(value="")
    ttk.Label(right, textvariable=summary_var, style="Dim.TLabel").pack(anchor=tk.W, padx=6, pady=(0, 4))

    def run_clicked() -> None:
        status_var.set("Rechne…")
        root.update_idletasks()
        try:
            h = float(hours_var.get().replace(",", "."))
            values: dict[str, float] = {}
            for k, v in vars_num.items():
                values[k] = _parse_short_scale_num(v.get())
            for k, (m, e) in sci_vars.items():
                mv = _parse_short_scale_num(m.get())
                ev = int(float(e.get().replace(",", ".")))
                values[k] = mv * (10.0**ev)
            gb = int(values["gems_budget"])
            owned = frozenset(n for n, v in owned_vars.items() if v.get())
            st = build_manual_state(values, owned)
            skip = frozenset(n for n, v in owned_vars.items() if v.get())
            plan = plan_purchase_steps(st, h, gb, skip)
            fill_tree(plan)
            end_cells = simulate_ticks(st, h)[0]
            final_cells = plan[-1]["cells_end"] if plan else end_cells
            summary_var.set(
                f"Basis-Ende: {end_cells:.3e}  |  Mit Kaufsequenz: {float(final_cells):.3e}  |  Steps: {len(plan)}"
            )
            status_var.set(f"OK — {len(plan)} Käufe")
            save_ui_state()
        except (OSError, ValueError, FileNotFoundError, ZeroDivisionError, KeyError) as e:
            status_var.set("Fehler")
            messagebox.showerror("CIFI Alpha", str(e), parent=root)

    run_btn.configure(command=run_clicked)

    def _start_maximized() -> None:
        try:
            root.state("zoomed")
        except tk.TclError:
            sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
            root.geometry(f"{sw}x{sh}+0+0")

    def on_close() -> None:
        try:
            save_ui_state()
        finally:
            root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_close)
    root.after(0, _start_maximized)
    root.after(180, run_clicked)
    root.mainloop()


def main(argv: list[str]) -> int:
    rest = argv[1:]
    if rest and rest[0] == "--cli":
        return main_cli(rest[1:])
    main_gui()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
