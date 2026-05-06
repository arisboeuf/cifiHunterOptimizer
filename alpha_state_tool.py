#!/usr/bin/env python3
"""
Alpha: load unified game-state CSV, show summary + tick simulation.

- Default: **GUI** (tkinter).
- Terminal: ``python alpha_state_tool.py --cli [csv] [prestige_hours]``

**CSV (Gem-relevant):** Pro Booster/Generator nur der **aktuelle Preis fürs nächste Upgrade** (`*_next_cost` bzw. `mkN_cost`). Anstiege/Multiplikatoren: **Konstanten im Code**. **Karten:** feste Gem-Preise (`GAME_CARD_COST_GEMS`); CSV nur `cost=owned` vs. nicht, plus Effekt-Attribute (`cells=`, `mk2=`, …). Optional kann `cost=` in der CSV noch stehen — **wird für Gems ignoriert**, wenn die Karte im Konstanten-Dict steht.

Data format: section,key,value,extra1,extra2,extra3
Card rows use key=value tokens across value + extras (e.g. cost=1500, cells=2.3).
"""

from __future__ import annotations

import csv
import math
import sys
from dataclasses import dataclass, field
from io import StringIO
from pathlib import Path


DEFAULT_CSV = Path(__file__).resolve().parent / "data" / "sample_game_state.csv"
DEFAULT_PRESTIGE_HOURS = 4.0

# --- Spielkonstanten (nicht aus CSV): Gem-Preis pro weiterem Kauf ---
# mk4/mk5/cells wie in generator_optimizer_gui_spec.md; übrige Werte Platzhalter → bei Bedarf anpassen.
GAME_BOOSTER_COST_INCREASE_GEMS: dict[str, float] = {
    "mk1": 2.0,
    "mk2": 2.0,
    "mk3": 3.0,
    "mk4": 4.0,
    "mk5": 5.0,
    "cells": 1.0,
    "mp": 5.0,
    "shards": 5.0,
}
# Nach +1 owned: ``mk{tier}_cost += GAME_GENERATOR_COST_INCREASE_GEMS[tier]`` (Gems).
# Nicht verwechseln mit ``GAME_BOOSTER_COST_INCREASE_GEMS`` (Booster-Shop, siehe Spec).
# Werte 0 = kein Greedy-Generator-Kauf für diese Stufe (Preiskurve steht nicht in der Spec).
GAME_GENERATOR_COST_INCREASE_GEMS: dict[int, float] = {
    1: 0.0,
    2: 0.0,
    3: 0.0,
    4: 0.0,
    5: 0.0,
}

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
}


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
    #: cells_per_tick = r1_anchor * G1 * m_cells * m_mk1 (t=0); bleibt bei Booster-/Card-Käufen fix (MK2–MK5-Mults nur in der Tick-Schleife).
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

    if state.r1_anchor is not None:
        r1 = float(state.r1_anchor)
    else:
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


BOOSTER_PREFIXES = ("mk1", "mk2", "mk3", "mk4", "mk5", "cells", "mp", "shards")


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


def greedy_purchase_steps(
    state: GameState,
    hours: float,
    gems_budget: int,
    skip_cards: frozenset[str] | set[str] | None = None,
) -> list[dict[str, object]]:
    """
    Greedy: max ln(cells_end / cells_end_before) / gem_cost pro Schritt.
    Booster: ``next_cost += GAME_BOOSTER_COST_INCREASE_GEMS``. Generatoren: ``mkN_cost += GAME_GENERATOR_COST_INCREASE_GEMS[N]`` (falls > 0).
    Cards: fester Preis; ``skip_cards``: Kartennamen ohne Haken → nicht als Kauf-Option.
    """
    skip = frozenset(skip_cards) if skip_cards is not None else frozenset()
    working = copy_state(state)
    gems_left = int(gems_budget)
    steps: list[dict[str, object]] = []
    max_rounds = 500

    for _ in range(max_rounds):
        base = copy_state(working)
        out0 = simulate_ticks(base, hours)[0]
        if out0 <= 0 or not math.isfinite(out0):
            break

        best: dict[str, object] | None = None

        for prefix in BOOSTER_PREFIXES:
            cost = booster_next_cost(working, prefix)
            if cost is None or cost <= 0 or cost > gems_left:
                continue
            trial = copy_state(working)
            apply_booster_buy(trial, prefix)
            out1 = simulate_ticks(trial, hours)[0]
            if out1 <= out0 or not math.isfinite(out1):
                continue
            ratio = out1 / out0
            score = math.log(ratio) / float(cost)
            if best is None or score > float(best["score"]):
                best = {
                    "score": score,
                    "kind": "booster",
                    "name": prefix,
                    "cost": cost,
                }

        for tier in (1, 2, 3, 4, 5):
            cost_g = generator_buy_cost(working, tier)
            if cost_g is None or cost_g <= 0 or cost_g > gems_left:
                continue
            trial = copy_state(working)
            paid = apply_generator_buy(trial, tier)
            if paid < 0 or paid != cost_g:
                continue
            out1 = simulate_ticks(trial, hours)[0]
            if out1 <= out0 or not math.isfinite(out1):
                continue
            ratio = out1 / out0
            score = math.log(ratio) / float(cost_g)
            if best is None or score > float(best["score"]):
                best = {
                    "score": score,
                    "kind": "generator",
                    "name": f"mk{tier}",
                    "cost": cost_g,
                }

        for c in working.cards:
            if c.owned:
                continue
            if c.name in skip:
                continue
            pc = c.purchase_cost
            if pc is None or pc <= 0 or pc > gems_left:
                continue
            trial = copy_state(working)
            apply_card_buy(trial, c.name)
            out1 = simulate_ticks(trial, hours)[0]
            if out1 <= out0 or not math.isfinite(out1):
                continue
            ratio = out1 / out0
            score = math.log(ratio) / float(pc)
            if best is None or score > float(best["score"]):
                best = {
                    "score": score,
                    "kind": "card",
                    "name": c.name,
                    "cost": pc,
                }

        if best is None:
            break

        if best["kind"] == "booster":
            apply_booster_buy(working, str(best["name"]))
        elif best["kind"] == "generator":
            apply_generator_buy(working, int(str(best["name"])[2:]))
        else:
            apply_card_buy(working, str(best["name"]))

        cost_i = int(best["cost"])
        gems_left -= cost_i
        end_c = simulate_ticks(copy_state(working), hours)[0]
        steps.append(
            {
                "step": len(steps) + 1,
                "kind": best["kind"],
                "name": best["name"],
                "cost": cost_i,
                "gems_left": gems_left,
                "score": float(best["score"]),
                "cells_end": end_c,
            }
        )

    return steps


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
    for name in ("mk1", "mk2", "mk3", "mk4", "mk5", "cells", "mp", "shards"):
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
    plan = greedy_purchase_steps(state, hours, g, skip_cards)
    return text, plan


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
    from tkinter import filedialog, messagebox, scrolledtext, ttk

    # Dark palette (editor-style, nähe an Cursor/VS Dark+)
    BG = "#1e1e1e"
    FG = "#d4d4d4"
    DIM = "#858585"
    INPUT_BG = "#3c3c3c"
    INPUT_BORDER = "#474747"
    BTN_BG = "#3c3c3c"
    BTN_ACTIVE = "#505050"
    ACCENT = "#3794ff"
    SEL_BG = "#264f78"
    SEL_FG = "#ffffff"

    root = tk.Tk()
    root.title("CIFI Alpha — State CSV")
    root.minsize(700, 560)
    root.configure(bg=BG)

    style = ttk.Style(root)
    if "clam" in style.theme_names():
        style.theme_use("clam")
    style.configure("TFrame", background=BG)
    style.configure("TLabel", background=BG, foreground=FG)
    style.configure("Dim.TLabel", background=BG, foreground=DIM)
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

    csv_var = tk.StringVar(value=str(DEFAULT_CSV))
    hours_var = tk.StringVar(value=str(DEFAULT_PRESTIGE_HOURS))
    gems_var = tk.StringVar(value="")
    status_var = tk.StringVar(value="Bereit.")
    path_memento: dict[str, str] = {"v": ""}

    pad = {"padx": 8, "pady": 4}
    top = ttk.Frame(root)
    top.pack(fill=tk.X, **pad)

    ttk.Label(top, text="CSV-Datei:").grid(row=0, column=0, sticky=tk.W)
    ent = ttk.Entry(top, textvariable=csv_var, width=70)
    ent.grid(row=0, column=1, sticky=tk.EW, padx=4)
    top.columnconfigure(1, weight=1)

    def browse() -> None:
        p = filedialog.askopenfilename(
            title="Game-State CSV",
            filetypes=[("CSV", "*.csv"), ("Alle", "*.*")],
        )
        if p:
            csv_var.set(p)

    ttk.Button(top, text="Durchsuchen…", command=browse).grid(row=0, column=2)

    ttk.Label(top, text="Prestige (h):").grid(row=1, column=0, sticky=tk.W, pady=(8, 0))
    ttk.Entry(top, textvariable=hours_var, width=10).grid(row=1, column=1, sticky=tk.W, pady=(8, 0))
    ttk.Label(top, text="Gem-Budget:").grid(row=1, column=2, sticky=tk.W, padx=(16, 0), pady=(8, 0))
    ttk.Entry(top, textvariable=gems_var, width=10).grid(row=1, column=3, sticky=tk.W, pady=(8, 0))

    cards_outer = ttk.LabelFrame(root, text="Karten im Greedy (Haken = kaufen erlauben)")
    cards_outer.pack(fill=tk.X, padx=8, pady=(0, 2))
    card_inner = ttk.Frame(cards_outer)
    card_inner.pack(fill=tk.X, padx=4, pady=4)
    card_toggle_vars: dict[str, tk.BooleanVar] = {}

    def rebuild_card_toggles(st: GameState, path_changed: bool) -> None:
        prev: dict[str, bool] = {}
        if not path_changed and card_toggle_vars:
            prev = {n: v.get() for n, v in card_toggle_vars.items()}
        for w in card_inner.winfo_children():
            w.destroy()
        card_toggle_vars.clear()
        purch = [c for c in st.cards if not c.owned and c.purchase_cost is not None]
        if not purch:
            ttk.Label(
                card_inner,
                text="Keine kaufbaren Karten im State.",
                style="Dim.TLabel",
            ).pack(anchor=tk.W)
            return
        ttk.Label(
            card_inner,
            text="Ohne Haken: Karte wird im Greedy-Pfad übersprungen.",
            style="Dim.TLabel",
        ).pack(anchor=tk.W)
        rowf = ttk.Frame(card_inner)
        rowf.pack(fill=tk.X, pady=(4, 0))
        for i, c in enumerate(sorted(purch, key=lambda x: x.name)):
            pc = c.purchase_cost
            var = tk.BooleanVar(value=prev.get(c.name, True))
            card_toggle_vars[c.name] = var
            r, col = divmod(i, 4)
            cb = tk.Checkbutton(
                rowf,
                text=f"{c.name} ({pc} G)",
                variable=var,
                bg=BG,
                fg=FG,
                selectcolor=INPUT_BG,
                activebackground=BG,
                activeforeground=FG,
                highlightthickness=0,
            )
            cb.grid(row=r, column=col, sticky=tk.W, padx=6, pady=2)

    body = ttk.Frame(root)
    body.pack(fill=tk.BOTH, expand=True, padx=0, pady=0)

    out = scrolledtext.ScrolledText(
        body,
        wrap=tk.WORD,
        font=("Consolas", 10),
        height=16,
        bg=INPUT_BG,
        fg=FG,
        insertbackground=FG,
        selectbackground=SEL_BG,
        selectforeground=SEL_FG,
        highlightthickness=1,
        highlightbackground=INPUT_BORDER,
        highlightcolor=ACCENT,
        bd=0,
    )
    out.pack(fill=tk.BOTH, expand=True, padx=8, pady=(4, 2))
    out.configure(state=tk.DISABLED)
    for sb_name in ("vbar", "hbar"):
        sb = getattr(out, sb_name, None)
        if sb is not None:
            sb.configure(
                bg=BTN_BG,
                troughcolor=BG,
                activebackground=BTN_ACTIVE,
                bd=0,
                highlightthickness=0,
            )

    tbl = ttk.LabelFrame(body, text="Greedy-Kaufpfad (Booster + Generatoren + Karten)")
    tbl.pack(fill=tk.BOTH, expand=False, padx=8, pady=(2, 6))

    cols = ("step", "kind", "name", "cost", "gems", "score", "cells_end")
    tree = ttk.Treeview(tbl, columns=cols, show="headings", height=9)
    headings = (
        ("step", "#", 36),
        ("kind", "Art", 72),
        ("name", "Name", 88),
        ("cost", "Kosten", 64),
        ("gems", "Gems übrig", 88),
        ("score", "Score lnΔ/Gem", 112),
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
                    f'{float(row["score"]):.6e}',
                    ce_s,
                ),
            )

    def set_out(text: str) -> None:
        out.configure(state=tk.NORMAL)
        out.delete("1.0", tk.END)
        out.insert(tk.END, text)
        out.configure(state=tk.DISABLED)

    def run_clicked() -> None:
        status_var.set("Rechne…")
        root.update_idletasks()
        try:
            p = Path(csv_var.get().strip()).expanduser().resolve()
            key = str(p)
            path_changed = path_memento["v"] != key
            st = load_game_state(p)
            if path_changed:
                path_memento["v"] = key
                gems_var.set(str(int(st.config.get("gems", 0))))
            rebuild_card_toggles(st, path_changed)
            h = float(hours_var.get().replace(",", "."))
            gs = gems_var.get().strip()
            if not gs:
                gb = int(st.config.get("gems", 0))
            else:
                gb = int(float(gs.replace(",", ".")))
            skip = frozenset(n for n, v in card_toggle_vars.items() if not v.get())
            text, plan = run_analysis(p, h, gb, skip)
            set_out(text)
            fill_tree(plan)
            status_var.set(f"OK — {p.name} · {len(plan)} Käufe")
        except (OSError, ValueError, FileNotFoundError, ZeroDivisionError) as e:
            status_var.set("Fehler")
            messagebox.showerror("CIFI Alpha", str(e), parent=root)

    bar = ttk.Frame(root)
    bar.pack(fill=tk.X, **pad)
    ttk.Button(bar, text="Auswerten", command=run_clicked).pack(side=tk.LEFT)
    ttk.Label(bar, textvariable=status_var, style="Dim.TLabel").pack(side=tk.LEFT, padx=12)
    root.geometry("920x720")
    root.after(120, run_clicked)
    root.mainloop()


def main(argv: list[str]) -> int:
    rest = argv[1:]
    if rest and rest[0] == "--cli":
        return main_cli(rest[1:])
    main_gui()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
