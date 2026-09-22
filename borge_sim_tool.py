#!/usr/bin/env python3
"""
Borge Simulator — local twin of https://cifi-tools.com/borge

Edit build (stats / talents / attributes / inscryptions / gems / relics),
run N Monte-Carlo combat sims via cifi-tools WASM, inspect stage / loot / revives.
Optimize talent/attribute redistribution within level budgets.

Usage:
  python borge_sim_tool.py
  python borge_sim_tool.py --maximized
  python borge_sim_tool.py --cli builds/borge_lvl14_example.yaml 200
  python borge_sim_tool.py --cli builds/borge_lvl14_example.yaml 200 wasm
"""

from __future__ import annotations

import copy
import json
import sys
import threading
import traceback
from pathlib import Path
from tkinter import filedialog, messagebox

import yaml

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from borge_sim.engine import Borge, ensure_path
from borge_sim.eval import (
    ATTRIBUTE_LABELS,
    TALENT_LABELS,
    SimResult,
    attribute_points_spent,
    compute_build_stats,
    format_duration,
    inscription_label,
    point_budgets,
    resolve_engine,
    run_sims,
    talent_points_spent,
    validate_budgets,
)
from borge_sim.optimize import OptimizeConfig, optimize_build
from borge_sim.wasm_engine import wasm_available

DEFAULT_BUILD = ROOT / "builds" / "borge_lvl14_example.yaml"
UI_STATE_PATH = ROOT / "data" / "borge_sim_ui_state.json"

STAT_LABELS: dict[str, str] = {
    "hp": "MAX HP",
    "power": "ATK Power",
    "regen": "HP Regen",
    "damage_reduction": "DMG Reduction",
    "evade_chance": "Evade Chance",
    "effect_chance": "Effect Chance",
    "special_chance": "Crit Chance",
    "special_damage": "Crit Power",
    "speed": "ATK Speed",
    "highest_stage_reached": "Highest Stage Reached",
}
STAT_MAX: dict[str, int] = {
    "hp": 9999,
    "power": 9999,
    "regen": 9999,
    "damage_reduction": 40,
    "evade_chance": 50,
    "effect_chance": 50,
    "special_chance": 100,
    "special_damage": 100,
    "speed": 100,
    "highest_stage_reached": 9999,
}
STAT_ORDER = [
    "hp",
    "power",
    "regen",
    "damage_reduction",
    "evade_chance",
    "effect_chance",
    "special_chance",
    "special_damage",
    "speed",
    "highest_stage_reached",
]

TALENT_ORDER = [
    "death_is_my_companion",
    "life_of_the_hunt",
    "unfair_advantage",
    "impeccable_impacts",
    "omen_of_defeat",
    "call_me_lucky_loot",
    "presence_of_god",
    "fires_of_war",
]
ATTR_ORDER = [
    "soul_of_ares",
    "essence_of_ylith",
    "spartan_lineage",
    "timeless_mastery",
    "book_of_baal",
    "superior_sensors",
    "helltouch_barrier",
    "lifedrain_inhalers",
    "explosive_punches",
    "atlas_protocol",
    "weakspot_analysis",
    "born_for_battle",
    "soul_of_the_minotaur",
    "soul_of_hermes",
    "soul_of_athena",
]
INSC_ORDER = [
    "i3",
    "i4",
    "i11",
    "i13",
    "i14",
    "i23",
    "i24",
    "i27",
    "i44",
    "i60",
    "i80",
    "i84",
    "i87",
    "i88",
    "i89",
    "i91",
    "i103",
]


def main_cli(path: Path, n: int, engine: str = "auto") -> None:
    ensure_path()
    with path.open(encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    ok, msg = validate_budgets(cfg)
    print(msg)
    if not ok:
        sys.exit(1)
    chosen = resolve_engine(engine)  # type: ignore[arg-type]
    print(f"Running {n} sims via {chosen}…")
    res = run_sims(
        cfg,
        repetitions=n,
        processes=-1,
        engine=engine,  # type: ignore[arg-type]
        progress=lambda d, t: print(f"\r{d}/{t}", end="", flush=True),
    )
    print()
    print(f"Engine:  {res.engine}")
    print(f"Ø Stage: {res.avg_stage:.1f}  ({res.min_stage:.0f}–{res.max_stage:.0f})")
    print(f"Ø Time:  {format_duration(res.avg_time_s)}  ({res.runs_per_day:.1f} runs/d)")
    print(f"Loot/h:  {res.loot_per_hour:.1f}  (score {res.loot_score})")
    print(f"Boss kill rate: {res.boss_kill_rate:.1%}  (boss HP {res.boss_hp_pct:.1f}%)")
    if res.mats:
        print(f"Mats:    {res.mats}  XP {res.xp:.2f}")
    print("Build stats:", json.dumps(res.build_stats, indent=2))
    print("Stage counts:", res.stage_counts)


def main_gui(*, maximized: bool = False) -> None:
    try:
        import customtkinter as ctk
    except ImportError:
        messagebox.showerror(
            "Missing dependency",
            "customtkinter is required.\n\npip install customtkinter",
        )
        return

    try:
        from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
        from matplotlib.figure import Figure
    except ImportError:
        messagebox.showerror(
            "Missing dependency",
            "matplotlib is required for charts.\n\npip install matplotlib PyYAML",
        )
        return

    PANEL = "#1a1a1e"
    FG = "#f4f4f5"
    DIM = "#a1a1aa"
    ACCENT = "#e11d48"
    ACCENT_HOVER = "#be123c"
    CARD = "#27272a"
    INPUT = "#18181b"

    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("dark-blue")

    ensure_path()
    if not wasm_available():
        messagebox.showerror(
            "WASM missing",
            "cifi-tools WASM engine is required.\n\n"
            "pip install wasmtime\n"
            "python scripts/fetch_cifi_wasm.py",
        )
        return

    root = ctk.CTk()
    root.title("CIFI — Borge Simulator")
    root.minsize(1180, 740)
    root.geometry("1280x820")
    if maximized:
        root.after(0, lambda: root.state("zoomed"))

    state: dict = {
        "config": None,
        "result": None,
        "cancel": False,
        "opt_cancel": False,
        "vars": {},
        "clamping": False,
        "section_titles": {},
        "traced_vars": set(),
        "talent_win": None,
        "opt_running": False,
    }

    STAT_KEYS = [k for k in STAT_ORDER if k in Borge.load_dummy()["stats"]]
    for k in Borge.load_dummy()["stats"]:
        if k not in STAT_KEYS:
            STAT_KEYS.append(k)
    dummy_tal = Borge.load_dummy()["talents"]
    TALENT_KEYS = [k for k in TALENT_ORDER if k in dummy_tal]
    for k in dummy_tal:
        if k not in TALENT_KEYS:
            TALENT_KEYS.append(k)
    dummy_attr = Borge.load_dummy()["attributes"]
    ATTR_KEYS = [k for k in ATTR_ORDER if k in dummy_attr]
    for k in dummy_attr:
        if k not in ATTR_KEYS:
            ATTR_KEYS.append(k)
    dummy_insc = Borge.load_dummy()["inscryptions"]
    INSC_KEYS = [k for k in INSC_ORDER if k in dummy_insc]
    for k in dummy_insc:
        if k not in INSC_KEYS:
            INSC_KEYS.append(k)
    RELIC_KEYS = list(Borge.load_dummy()["relics"].keys())
    GEM_KEYS = list(Borge.load_dummy()["gems"].keys())

    def _ivar(key: str, default: int = 0) -> ctk.IntVar:
        v = ctk.IntVar(value=default)
        state["vars"][key] = v
        return v

    def _bvar(key: str, default: bool = False) -> ctk.BooleanVar:
        v = ctk.BooleanVar(value=default)
        state["vars"][key] = v
        return v

    def save_ui_state() -> None:
        try:
            cfg = config_from_vars()
            label = (name_var.get() or "").strip()
            if label:
                cfg = copy.deepcopy(cfg)
                cfg["build_name"] = label
            payload = {"config": cfg, "reps": int(reps_var.get())}
            UI_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
            UI_STATE_PATH.write_text(
                json.dumps(payload, ensure_ascii=True, indent=2),
                encoding="utf-8",
            )
        except Exception:
            pass

    def load_ui_state() -> dict | None:
        if not UI_STATE_PATH.is_file():
            return None
        try:
            return json.loads(UI_STATE_PATH.read_text(encoding="utf-8"))
        except Exception:
            return None

    def load_config_into_vars(cfg: dict) -> None:
        state["config"] = cfg
        name_var.set(str(cfg.get("build_name") or cfg.get("meta", {}).get("hunter", "Borge")))
        level_var.set(int(cfg["meta"]["level"]))
        for k in STAT_KEYS:
            state["vars"][f"stat.{k}"].set(int(cfg["stats"].get(k, 0)))
        for k in TALENT_KEYS:
            state["vars"][f"tal.{k}"].set(int(cfg["talents"].get(k, 0)))
        for k in ATTR_KEYS:
            state["vars"][f"attr.{k}"].set(int(cfg["attributes"].get(k, 0)))
        for k in INSC_KEYS:
            state["vars"][f"insc.{k}"].set(int(cfg["inscryptions"].get(k, 0)))
        for k in RELIC_KEYS:
            state["vars"][f"relic.{k}"].set(int(cfg["relics"].get(k, 0)))
        for k in GEM_KEYS:
            state["vars"][f"gem.{k}"].set(int(cfg["gems"].get(k, 0)))
        state["vars"]["mod.trample"].set(bool(cfg.get("mods", {}).get("trample", False)))
        refresh_budget()
        refresh_preview_stats()

    def config_from_vars() -> dict:
        from borge_sim.eval import clamp_levels

        cfg = Borge.load_dummy()
        cfg["meta"]["hunter"] = "Borge"
        cfg["meta"]["level"] = int(level_var.get())
        for k in STAT_KEYS:
            cfg["stats"][k] = int(state["vars"][f"stat.{k}"].get())
        for k in TALENT_KEYS:
            cfg["talents"][k] = int(state["vars"][f"tal.{k}"].get())
        for k in ATTR_KEYS:
            cfg["attributes"][k] = int(state["vars"][f"attr.{k}"].get())
        for k in INSC_KEYS:
            cfg["inscryptions"][k] = int(state["vars"][f"insc.{k}"].get())
        for k in RELIC_KEYS:
            cfg["relics"][k] = int(state["vars"][f"relic.{k}"].get())
        for k in GEM_KEYS:
            cfg["gems"][k] = int(state["vars"][f"gem.{k}"].get())
        cfg["mods"]["trample"] = bool(state["vars"]["mod.trample"].get())
        return clamp_levels(cfg)

    def _clamp_spin_vars() -> None:
        if state.get("clamping"):
            return
        state["clamping"] = True
        try:
            groups = [
                (TALENT_KEYS, "tal", lambda k: int(Borge.costs["talents"][k]["max"])),
                (
                    ATTR_KEYS,
                    "attr",
                    lambda k: 9999
                    if Borge.costs["attributes"][k]["max"] == float("inf")
                    else int(Borge.costs["attributes"][k]["max"]),
                ),
                (INSC_KEYS, "insc", lambda k: int(Borge.costs["inscryptions"][k]["max"])),
            ]
            for keys, prefix, mx_fn in groups:
                for k in keys:
                    v = state["vars"][f"{prefix}.{k}"]
                    try:
                        cur = int(v.get())
                    except Exception:
                        continue
                    mx = mx_fn(k)
                    if cur > mx:
                        v.set(mx)
                    elif cur < 0:
                        v.set(0)
            for k, mx in STAT_MAX.items():
                key = f"stat.{k}"
                if key not in state["vars"]:
                    continue
                v = state["vars"][key]
                try:
                    cur = int(v.get())
                except Exception:
                    continue
                if cur > mx:
                    v.set(mx)
                elif cur < 0:
                    v.set(0)
        finally:
            state["clamping"] = False

    def refresh_budget(*_a) -> None:
        try:
            _clamp_spin_vars()
            cfg = config_from_vars()
            level = int(level_var.get())
            tal_cap, attr_cap = point_budgets(level)
            tal = talent_points_spent(cfg)
            attr = attribute_points_spent(cfg)

            def _safe_title(key: str, text: str) -> None:
                lbl = state["section_titles"].get(key)
                if lbl is None:
                    return
                try:
                    if lbl.winfo_exists():
                        lbl.configure(text=text)
                    else:
                        state["section_titles"].pop(key, None)
                except Exception:
                    state["section_titles"].pop(key, None)

            _safe_title("tal", f"Talents  ({tal}/{tal_cap}  ·  Level gibt {tal_cap})")
            _safe_title(
                "attr",
                f"Attributes  ({attr}/{attr_cap} Path Points  ·  Level×3 = {attr_cap})",
            )
            ok, msg = validate_budgets(cfg)
            budget_var.set(msg)
            budget_lbl.configure(text_color="#4ade80" if ok else "#f87171")
        except Exception as e:
            budget_var.set(str(e))
            budget_lbl.configure(text_color="#f87171")

    def refresh_preview_stats(*_a) -> None:
        try:
            cfg = config_from_vars()
            st = compute_build_stats(cfg)
            preview_var.set(
                f"HP {st['max_hp']}  ·  ATK {st['atk_power']}  ·  Regen {st['hp_regen']}/s  ·  "
                f"DR {st['dmg_reduction']}%  ·  Evade {st['evade_chance']}%  ·  "
                f"Eff {st['effect_chance']}%  ·  Crit {st['crit_chance']}% ×{st['crit_power']}  ·  "
                f"Speed {st['atk_speed']}s"
            )
        except Exception as e:
            preview_var.set(f"Stats error: {e}")

    # ---- top bar ----
    top = ctk.CTkFrame(root, fg_color="transparent")
    top.pack(fill="x", padx=12, pady=(12, 6))

    name_var = ctk.StringVar(value="Borge")
    level_var = ctk.IntVar(value=14)
    reps_var = ctk.IntVar(value=200)
    budget_var = ctk.StringVar(value="")
    preview_var = ctk.StringVar(value="")
    status_var = ctk.StringVar(value="Bereit.")

    ctk.CTkLabel(top, text="Build", text_color=DIM).pack(side="left", padx=(0, 6))
    ctk.CTkEntry(top, textvariable=name_var, width=140, fg_color=INPUT).pack(side="left", padx=(0, 10))
    ctk.CTkLabel(top, text="Level", text_color=DIM).pack(side="left", padx=(0, 6))
    ctk.CTkEntry(top, textvariable=level_var, width=56, fg_color=INPUT).pack(side="left", padx=(0, 6))
    ctk.CTkLabel(top, text="+1 Talent / Lvl · +3 Attr / Lvl", text_color=DIM, font=ctk.CTkFont(size=12)).pack(
        side="left", padx=(0, 14)
    )
    ctk.CTkLabel(top, text="Sims", text_color=DIM).pack(side="left", padx=(0, 6))
    ctk.CTkEntry(top, textvariable=reps_var, width=64, fg_color=INPUT).pack(side="left", padx=(0, 14))

    def do_import() -> None:
        p = filedialog.askopenfilename(
            title="Import build YAML",
            filetypes=[("YAML", "*.yaml *.yml"), ("All", "*.*")],
            initialdir=str(ROOT / "builds"),
        )
        if not p:
            return
        with open(p, encoding="utf-8") as f:
            cfg = yaml.safe_load(f)
        dummy = Borge.load_dummy()
        for section in dummy:
            if section not in cfg:
                cfg[section] = dummy[section]
            elif isinstance(dummy[section], dict):
                for k, v in dummy[section].items():
                    cfg[section].setdefault(k, v)
        load_config_into_vars(cfg)
        status_var.set(f"Loaded {Path(p).name}")

    def do_export() -> None:
        p = filedialog.asksaveasfilename(
            title="Export build YAML",
            defaultextension=".yaml",
            filetypes=[("YAML", "*.yaml")],
            initialdir=str(ROOT / "builds"),
        )
        if not p:
            return
        cfg = config_from_vars()
        label = (name_var.get() or "").strip()
        if label and label.lower() != "borge":
            cfg = copy.deepcopy(cfg)
            cfg["build_name"] = label
        with open(p, "w", encoding="utf-8") as f:
            yaml.dump(cfg, f, default_flow_style=False, sort_keys=False)
        status_var.set(f"Saved {Path(p).name}")

    ctk.CTkButton(top, text="Import", width=80, command=do_import, fg_color=CARD, hover_color="#3f3f46").pack(
        side="left", padx=3
    )
    ctk.CTkButton(top, text="Export", width=80, command=do_export, fg_color=CARD, hover_color="#3f3f46").pack(
        side="left", padx=3
    )

    def open_talent_window() -> None:
        existing = state.get("talent_win")
        if existing is not None:
            try:
                if existing.winfo_exists():
                    existing.deiconify()
                    existing.lift()
                    existing.focus_force()
                    existing.after(0, lambda: existing.state("zoomed"))
                    return
            except Exception:
                pass

        win = ctk.CTkToplevel(root)
        win.title("Talents & Attributes — Optimizer")
        win.minsize(900, 640)
        win.geometry("1100x740")
        state["talent_win"] = win

        def _focus_max() -> None:
            try:
                win.deiconify()
                win.lift()
                win.focus_force()
                win.state("zoomed")
                win.attributes("-topmost", True)
                win.after(200, lambda: win.attributes("-topmost", False))
            except Exception:
                pass

        win.after(0, _focus_max)

        def on_talent_close() -> None:
            state["section_titles"].pop("tal", None)
            state["section_titles"].pop("attr", None)
            state["talent_win"] = None
            win.destroy()

        win.protocol("WM_DELETE_WINDOW", on_talent_close)

        def show_opt_dialog(
            *,
            title: str,
            body: str,
            show_apply: bool,
            on_apply=None,
        ) -> None:
            dlg = ctk.CTkToplevel(win)
            dlg.title(title)
            dlg.geometry("460x280")
            dlg.resizable(False, False)
            dlg.transient(win)
            dlg.grab_set()
            dlg.lift()
            dlg.focus_force()

            frame = ctk.CTkFrame(dlg, fg_color=CARD, corner_radius=12)
            frame.pack(fill="both", expand=True, padx=14, pady=14)
            ctk.CTkLabel(
                frame, text=title, font=ctk.CTkFont(size=16, weight="bold"), text_color=FG, anchor="w"
            ).pack(fill="x", padx=16, pady=(14, 8))
            ctk.CTkLabel(
                frame, text=body, text_color=DIM, justify="left", anchor="w", wraplength=400
            ).pack(fill="both", expand=True, padx=16, pady=(0, 12))

            btns = ctk.CTkFrame(frame, fg_color="transparent")
            btns.pack(fill="x", padx=16, pady=(0, 14))

            def close_dlg() -> None:
                try:
                    dlg.grab_release()
                except Exception:
                    pass
                dlg.destroy()

            if show_apply:
                ctk.CTkButton(
                    btns,
                    text="Übernehmen",
                    width=120,
                    fg_color=ACCENT,
                    hover_color=ACCENT_HOVER,
                    command=lambda: (close_dlg(), on_apply() if on_apply else None),
                ).pack(side="right", padx=(6, 0))
                ctk.CTkButton(
                    btns, text="Behalten", width=100, fg_color=INPUT, hover_color="#3f3f46", command=close_dlg
                ).pack(side="right")
            else:
                ctk.CTkButton(
                    btns, text="OK", width=90, fg_color=ACCENT, hover_color=ACCENT_HOVER, command=close_dlg
                ).pack(side="right")

        bar = ctk.CTkFrame(win, fg_color="transparent")
        bar.pack(fill="x", padx=12, pady=(12, 6))
        opt_status = ctk.StringVar(value="Optimize sucht von 0 — Vergleich erst danach mit aktuellem Build.")
        ctk.CTkLabel(bar, textvariable=opt_status, text_color=DIM, anchor="w").pack(side="left", fill="x", expand=True)

        restrict_row = ctk.CTkFrame(win, fg_color="transparent")
        restrict_row.pack(fill="x", padx=12, pady=(0, 6))
        force_timeless_var = ctk.BooleanVar(value=True)
        ctk.CTkCheckBox(
            restrict_row,
            text="Timeless Mastery 5 Pflicht  (Optimizer hält Attribute immer auf 5)",
            variable=force_timeless_var,
            fg_color=ACCENT,
            hover_color=ACCENT_HOVER,
            text_color=FG,
        ).pack(anchor="w")

        def stop_optimize() -> None:
            state["opt_cancel"] = True

        def start_optimize() -> None:
            if state.get("opt_running"):
                return
            cfg = config_from_vars()
            ok, msg = validate_budgets(cfg)
            if not ok:
                show_opt_dialog(title="Ungültiger Build", body=msg, show_apply=False)
                return
            state["opt_cancel"] = False
            state["opt_running"] = True
            opt_btn.configure(state="disabled")
            opt_status.set("Optimizing…")
            force_tm = bool(force_timeless_var.get())
            n_base = max(1, int(reps_var.get()))

            def worker() -> None:
                try:
                    def prog(msg, done, total, loot, stage):
                        def ui():
                            frac = done / total if total else 0
                            opt_progress.set(frac)
                            if stage is not None and loot is not None and stage >= 0:
                                opt_status.set(
                                    f"{msg}  ·  best Ø stage {stage:.2f} / loot {loot:.1f}"
                                )
                            else:
                                opt_status.set(msg)

                        root.after(0, ui)

                    result = optimize_build(
                        cfg,
                        OptimizeConfig(
                            n_search=250,
                            n_refine=1000,
                            n_baseline=n_base,
                            max_evals=200,
                            restarts=8,
                            stagnation_limit=18,
                            top_k=5,
                            force_timeless_mastery_5=force_tm,
                        ),
                        progress=prog,
                        cancel_check=lambda: state["opt_cancel"],
                    )

                    def finish() -> None:
                        b_stage, b_loot = result.baseline_score
                        n_stage, n_loot = result.best_score
                        d_stage = n_stage - b_stage
                        d_loot = n_loot - b_loot
                        opt_progress.set(1.0)

                        if result.baseline_eval is None or b_stage < 0:
                            show_opt_dialog(
                                title="Optimize Fehler",
                                body="Aktueller Build konnte nicht simuliert werden.",
                                show_apply=False,
                            )
                            opt_status.set("Fehler bei Baseline-Simulation.")
                            return

                        if not result.improved:
                            opt_status.set(
                                f"Kein Vorteil  ·  aktuell Ø stage {b_stage:.2f} / loot {b_loot:.1f} "
                                f"({result.evals} evals)"
                            )
                            status_var.set("Optimize: kein besserer Build — unverändert.")
                            show_opt_dialog(
                                title="Kein Vorteil",
                                body=(
                                    f"Suche von 0 hat keinen besseren Build gefunden "
                                    f"({result.evals} evals).\n\n"
                                    f"Aktueller Build ({n_base} sims):\n"
                                    f"  Ø Stage {b_stage:.2f}  ·  Loot {b_loot:.1f}\n\n"
                                    f"Build wurde nicht geändert."
                                ),
                                show_apply=False,
                            )
                            return

                        opt_status.set(
                            f"Vorschlag  ·  Ø stage {n_stage:.2f} ({d_stage:+.2f})  ·  "
                            f"loot {n_loot:.1f} ({d_loot:+.1f})"
                        )

                        def do_apply() -> None:
                            load_config_into_vars(result.best_config)
                            status_var.set(
                                f"Optimize übernommen — Ø stage {n_stage:.2f} ({d_stage:+.2f})"
                            )
                            if result.best_eval is not None:
                                state["result"] = result.best_eval
                                state["config"] = result.best_config
                                on_result(result.best_eval)
                            opt_status.set(
                                f"Übernommen  ·  Ø stage {n_stage:.2f} / loot {n_loot:.1f}"
                            )

                        def on_keep() -> None:
                            status_var.set("Optimize: Vorschlag verworfen — Build unverändert.")
                            opt_status.set(
                                f"Verworfen  ·  aktuell Ø stage {b_stage:.2f} / loot {b_loot:.1f}"
                            )

                        dlg = ctk.CTkToplevel(win)
                        dlg.title("Vorteil gefunden")
                        dlg.geometry("480x300")
                        dlg.resizable(False, False)
                        dlg.transient(win)
                        dlg.grab_set()
                        dlg.lift()
                        frame = ctk.CTkFrame(dlg, fg_color=CARD, corner_radius=12)
                        frame.pack(fill="both", expand=True, padx=14, pady=14)
                        ctk.CTkLabel(
                            frame,
                            text="Besserer Build gefunden",
                            font=ctk.CTkFont(size=16, weight="bold"),
                            anchor="w",
                        ).pack(fill="x", padx=16, pady=(14, 8))
                        ctk.CTkLabel(
                            frame,
                            text=(
                                f"{result.evals} evals  ·  Baseline {n_base} sims\n\n"
                                f"Aktuell:    Ø Stage {b_stage:.2f}  ·  Loot {b_loot:.1f}\n"
                                f"Vorschlag:  Ø Stage {n_stage:.2f}  ({d_stage:+.2f})\n"
                                f"            Loot {n_loot:.1f}  ({d_loot:+.1f})\n\n"
                                f"Vorschlag übernehmen?"
                            ),
                            text_color=DIM,
                            justify="left",
                            anchor="w",
                        ).pack(fill="both", expand=True, padx=16, pady=(0, 12))
                        btns = ctk.CTkFrame(frame, fg_color="transparent")
                        btns.pack(fill="x", padx=16, pady=(0, 14))

                        def close_and(fn) -> None:
                            try:
                                dlg.grab_release()
                            except Exception:
                                pass
                            dlg.destroy()
                            fn()

                        ctk.CTkButton(
                            btns,
                            text="Übernehmen",
                            width=120,
                            fg_color=ACCENT,
                            hover_color=ACCENT_HOVER,
                            command=lambda: close_and(do_apply),
                        ).pack(side="right", padx=(6, 0))
                        ctk.CTkButton(
                            btns,
                            text="Behalten",
                            width=100,
                            fg_color=INPUT,
                            hover_color="#3f3f46",
                            command=lambda: close_and(on_keep),
                        ).pack(side="right")

                    root.after(0, finish)
                except Exception as e:
                    err = str(e) or traceback.format_exc()
                    root.after(
                        0,
                        lambda: show_opt_dialog(title="Optimize Fehler", body=err, show_apply=False),
                    )
                finally:

                    def done_ui() -> None:
                        state["opt_running"] = False
                        opt_btn.configure(state="normal")

                    root.after(0, done_ui)

            threading.Thread(target=worker, daemon=True).start()

        opt_btn = ctk.CTkButton(
            bar,
            text="Optimize",
            width=90,
            height=28,
            command=start_optimize,
            fg_color=ACCENT,
            hover_color=ACCENT_HOVER,
        )
        opt_btn.pack(side="right", padx=(6, 0))
        ctk.CTkButton(
            bar, text="Stop", width=60, height=28, command=stop_optimize, fg_color=CARD, hover_color="#3f3f46"
        ).pack(side="right")

        opt_progress = ctk.CTkProgressBar(win, progress_color=ACCENT)
        opt_progress.pack(fill="x", padx=12, pady=(0, 8))
        opt_progress.set(0)

        scroll = ctk.CTkScrollableFrame(win, fg_color=PANEL, corner_radius=12)
        scroll.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        sec_tal = _section(scroll, "Talents", "tal")
        for k in TALENT_KEYS:
            mx = Borge.costs["talents"][k]["max"]
            _spin_row(sec_tal, TALENT_LABELS.get(k, k), state["vars"][f"tal.{k}"], mx)

        sec_attr = _section(scroll, "Attributes", "attr")
        from borge_sim.attr_rules import ATTRIBUTE_DEPENDENCIES as ATTR_DEPS
        from borge_sim.attr_rules import ATTRIBUTE_MIN_VALUE as ATTR_MIN

        for k in ATTR_KEYS:
            meta = Borge.costs["attributes"][k]
            label = ATTRIBUTE_LABELS.get(k, k)
            cost = meta["cost"]
            mx = meta["max"]
            bits = [f"cost {cost}"]
            parents = ATTR_DEPS.get(k)
            if parents:
                bits.append("needs " + "+".join(ATTRIBUTE_LABELS.get(p, p) for p in parents))
            need = ATTR_MIN.get(k, 0)
            if need:
                bits.append(f"min spent {need}")
            suffix = "  (" + ", ".join(bits) + ")"
            _spin_row(sec_attr, label + suffix, state["vars"][f"attr.{k}"], mx)

        refresh_budget()

    ctk.CTkButton(
        top,
        text="Talents & Attributes…",
        width=160,
        command=open_talent_window,
        fg_color=ACCENT,
        hover_color=ACCENT_HOVER,
    ).pack(side="left", padx=(10, 3))

    budget_lbl = ctk.CTkLabel(root, textvariable=budget_var, text_color=DIM, anchor="w")
    budget_lbl.pack(fill="x", padx=14)
    ctk.CTkLabel(root, textvariable=preview_var, text_color=DIM, anchor="w", font=ctk.CTkFont(size=12)).pack(
        fill="x", padx=14, pady=(0, 6)
    )

    body = ctk.CTkFrame(root, fg_color="transparent")
    body.pack(fill="both", expand=True, padx=12, pady=4)
    body.grid_columnconfigure(0, weight=2, minsize=420)
    body.grid_columnconfigure(1, weight=3)
    body.grid_rowconfigure(0, weight=1)

    left_tabs = ctk.CTkTabview(
        body,
        fg_color=PANEL,
        segmented_button_selected_color=ACCENT,
        segmented_button_selected_hover_color=ACCENT_HOVER,
        segmented_button_unselected_color=CARD,
        segmented_button_unselected_hover_color="#3f3f46",
    )
    left_tabs.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
    tab_stats_in = left_tabs.add("Stats")
    tab_insc = left_tabs.add("Inscryptions")
    tab_relics = left_tabs.add("Relics / Gems")

    left_stats = ctk.CTkScrollableFrame(tab_stats_in, fg_color="transparent")
    left_stats.pack(fill="both", expand=True)
    left_insc = ctk.CTkScrollableFrame(tab_insc, fg_color="transparent")
    left_insc.pack(fill="both", expand=True)
    left_misc = ctk.CTkScrollableFrame(tab_relics, fg_color="transparent")
    left_misc.pack(fill="both", expand=True)

    right = ctk.CTkFrame(body, fg_color="transparent")
    right.grid(row=0, column=1, sticky="nsew")

    def _section(parent, title: str, key: str | None = None) -> ctk.CTkFrame:
        wrap = ctk.CTkFrame(parent, fg_color=CARD, corner_radius=10)
        wrap.pack(fill="x", padx=6, pady=6)
        title_lbl = ctk.CTkLabel(wrap, text=title, font=ctk.CTkFont(size=14, weight="bold"), anchor="w")
        title_lbl.pack(fill="x", padx=12, pady=(10, 4))
        if key:
            state["section_titles"][key] = title_lbl
        inner = ctk.CTkFrame(wrap, fg_color="transparent")
        inner.pack(fill="x", padx=8, pady=(0, 10))
        return inner

    def _spin_row(parent, label: str, var: ctk.Variable, mx: int | float, *, show_max: bool = True) -> None:
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", pady=2)
        ctk.CTkLabel(row, text=label, anchor="w", text_color=FG).pack(
            side="left", fill="x", expand=True, padx=(4, 8)
        )

        hi = 9999 if mx == float("inf") else int(mx)

        def bump(delta: int) -> None:
            try:
                cur = int(var.get())
            except Exception:
                cur = 0
            var.set(max(0, min(hi, cur + delta)))
            refresh_budget()
            refresh_preview_stats()

        def set_max() -> None:
            var.set(hi)
            refresh_budget()
            refresh_preview_stats()

        ctrls = ctk.CTkFrame(row, fg_color="transparent")
        ctrls.pack(side="right")
        ctk.CTkButton(
            ctrls, text="−", width=28, height=28, command=lambda: bump(-1), fg_color=INPUT, hover_color="#3f3f46"
        ).pack(side="left", padx=(0, 2))
        ctk.CTkEntry(ctrls, textvariable=var, width=56, justify="center", fg_color=INPUT).pack(side="left")
        ctk.CTkButton(
            ctrls, text="+", width=28, height=28, command=lambda: bump(1), fg_color=INPUT, hover_color="#3f3f46"
        ).pack(side="left", padx=(2, 0))
        if show_max and hi < 9999:
            ctk.CTkButton(
                ctrls,
                text="Max",
                width=40,
                height=28,
                command=set_max,
                fg_color=ACCENT,
                hover_color=ACCENT_HOVER,
                font=ctk.CTkFont(size=11, weight="bold"),
            ).pack(side="left", padx=(4, 0))
        # One write-trace per variable — reopening the talent window must not stack more.
        var_id = str(var)
        if var_id not in state["traced_vars"]:
            state["traced_vars"].add(var_id)
            var.trace_add("write", lambda *_: (refresh_budget(), refresh_preview_stats()))

    # Create vars for talents/attrs even though controls live in the subwindow
    for k in TALENT_KEYS:
        _ivar(f"tal.{k}")
    for k in ATTR_KEYS:
        _ivar(f"attr.{k}")

    sec_stats = _section(left_stats, "Borge Stats")
    for k in STAT_KEYS:
        mx = STAT_MAX.get(k, 9999)
        label = STAT_LABELS.get(k, k)
        if k in ("damage_reduction", "evade_chance", "effect_chance", "special_chance", "special_damage", "speed"):
            label = f"{label}  /{mx}"
        _spin_row(sec_stats, label, _ivar(f"stat.{k}"), mx)

    sec_insc = _section(left_insc, "Inscryptions")
    insc_actions = ctk.CTkFrame(sec_insc, fg_color="transparent")
    insc_actions.pack(fill="x", pady=(0, 6))

    def max_all_inscryptions() -> None:
        for k in INSC_KEYS:
            mx = int(Borge.costs["inscryptions"][k]["max"])
            state["vars"][f"insc.{k}"].set(mx)
        refresh_budget()
        refresh_preview_stats()

    def clear_all_inscryptions() -> None:
        for k in INSC_KEYS:
            state["vars"][f"insc.{k}"].set(0)
        refresh_budget()
        refresh_preview_stats()

    ctk.CTkButton(
        insc_actions,
        text="All Max",
        width=80,
        height=28,
        command=max_all_inscryptions,
        fg_color=ACCENT,
        hover_color=ACCENT_HOVER,
    ).pack(side="left", padx=(4, 4))
    ctk.CTkButton(
        insc_actions,
        text="Clear",
        width=70,
        height=28,
        command=clear_all_inscryptions,
        fg_color=INPUT,
        hover_color="#3f3f46",
    ).pack(side="left")
    for k in INSC_KEYS:
        mx = Borge.costs["inscryptions"][k]["max"]
        _spin_row(sec_insc, inscription_label(k), _ivar(f"insc.{k}"), mx)

    sec_misc = _section(left_misc, "Relics / Gems / Mods")
    for k in RELIC_KEYS:
        _spin_row(sec_misc, k, _ivar(f"relic.{k}"), 20)
    for k in GEM_KEYS:
        _spin_row(sec_misc, k, _ivar(f"gem.{k}"), 20)
    ctk.CTkCheckBox(
        sec_misc,
        text="Trample mod",
        variable=_bvar("mod.trample"),
        command=lambda: (refresh_budget(), refresh_preview_stats()),
        fg_color=ACCENT,
        hover_color=ACCENT_HOVER,
    ).pack(anchor="w", padx=6, pady=6)

    # ---- right panel ----
    run_bar = ctk.CTkFrame(right, fg_color="transparent")
    run_bar.pack(fill="x", pady=(0, 8))

    def stop_run() -> None:
        state["cancel"] = True

    def start_run() -> None:
        cfg = config_from_vars()
        ok, msg = validate_budgets(cfg)
        if not ok:
            messagebox.showerror("Invalid build", msg)
            return
        n = max(1, int(reps_var.get()))
        state["cancel"] = False
        run_btn.configure(state="disabled")
        status_var.set(f"Running {n} sims (wasm)…")
        progress_bar.set(0)

        def worker() -> None:
            try:

                def prog(d, t):
                    root.after(0, lambda: progress_bar.set(d / t if t else 0))

                res = run_sims(
                    cfg,
                    repetitions=n,
                    engine="wasm",
                    progress=prog,
                    cancel_check=lambda: state["cancel"],
                )
                state["result"] = res
                state["config"] = cfg
                root.after(0, lambda: on_result(res))
            except Exception:
                err = traceback.format_exc()
                root.after(0, lambda: messagebox.showerror("Sim error", err))
            finally:
                root.after(0, lambda: run_btn.configure(state="normal"))

        threading.Thread(target=worker, daemon=True).start()

    run_btn = ctk.CTkButton(
        run_bar,
        text="Run Simulation",
        command=start_run,
        fg_color=ACCENT,
        hover_color=ACCENT_HOVER,
        width=140,
        height=34,
        font=ctk.CTkFont(weight="bold"),
    )
    run_btn.pack(side="left", padx=(0, 6))
    ctk.CTkButton(run_bar, text="Stop", width=70, command=stop_run, fg_color=CARD, hover_color="#3f3f46").pack(
        side="left", padx=(0, 10)
    )
    progress_bar = ctk.CTkProgressBar(run_bar, width=240, progress_color=ACCENT)
    progress_bar.pack(side="left", padx=4)
    progress_bar.set(0)

    cards = ctk.CTkFrame(right, fg_color="transparent")
    cards.pack(fill="x", pady=(0, 8))
    for i in range(4):
        cards.grid_columnconfigure(i, weight=1)
    card_vars = {
        "loot": ctk.StringVar(value="—"),
        "stage": ctk.StringVar(value="—"),
        "time": ctk.StringVar(value="—"),
        "boss": ctk.StringVar(value="—"),
    }

    def make_card(title: str, var: ctk.StringVar, col: int) -> None:
        f = ctk.CTkFrame(cards, fg_color=CARD, corner_radius=10)
        f.grid(row=0, column=col, sticky="nsew", padx=3)
        ctk.CTkLabel(f, text=title, text_color=DIM, font=ctk.CTkFont(size=11)).pack(anchor="w", padx=12, pady=(10, 0))
        ctk.CTkLabel(f, textvariable=var, font=ctk.CTkFont(size=18, weight="bold")).pack(
            anchor="w", padx=12, pady=(2, 12)
        )

    make_card("LOOT SCORE", card_vars["loot"], 0)
    make_card("Ø STAGE (RANGE)", card_vars["stage"], 1)
    make_card("Ø TIME (RUNS/D)", card_vars["time"], 2)
    make_card("BOSS KILL %", card_vars["boss"], 3)

    tabs = ctk.CTkTabview(
        right,
        fg_color=PANEL,
        segmented_button_selected_color=ACCENT,
        segmented_button_selected_hover_color=ACCENT_HOVER,
        segmented_button_unselected_color=CARD,
        segmented_button_unselected_hover_color="#3f3f46",
    )
    tabs.pack(fill="both", expand=True)
    tab_dist = tabs.add("Stage Distribution")
    tab_odds = tabs.add("Stage Odds")
    tab_rev = tabs.add("Revive Distribution")
    tab_stats = tabs.add("Build Stats")

    fig_dist = Figure(figsize=(5, 3), dpi=100, facecolor=PANEL)
    ax_dist = fig_dist.add_subplot(111)
    canvas_dist = FigureCanvasTkAgg(fig_dist, master=tab_dist)
    canvas_dist.get_tk_widget().configure(bg=PANEL, highlightthickness=0)
    canvas_dist.get_tk_widget().pack(fill="both", expand=True)

    fig_odds = Figure(figsize=(5, 3), dpi=100, facecolor=PANEL)
    ax_odds = fig_odds.add_subplot(111)
    canvas_odds = FigureCanvasTkAgg(fig_odds, master=tab_odds)
    canvas_odds.get_tk_widget().configure(bg=PANEL, highlightthickness=0)
    canvas_odds.get_tk_widget().pack(fill="both", expand=True)

    fig_rev = Figure(figsize=(5, 3), dpi=100, facecolor=PANEL)
    ax_rev = fig_rev.add_subplot(111)
    canvas_rev = FigureCanvasTkAgg(fig_rev, master=tab_rev)
    canvas_rev.get_tk_widget().configure(bg=PANEL, highlightthickness=0)
    canvas_rev.get_tk_widget().pack(fill="both", expand=True)

    stats_frame = ctk.CTkFrame(tab_stats, fg_color="transparent")
    stats_frame.pack(fill="both", expand=True, padx=8, pady=8)
    for c in range(3):
        stats_frame.grid_columnconfigure(c, weight=1)
    for r in range(3):
        stats_frame.grid_rowconfigure(r, weight=1)
    stats_labels: dict[str, ctk.StringVar] = {}
    for i, (key, title) in enumerate(
        [
            ("max_hp", "MAX HP"),
            ("atk_power", "ATK Power"),
            ("hp_regen", "HP Regen"),
            ("dmg_reduction", "DMG Reduction"),
            ("evade_chance", "Evade Chance"),
            ("effect_chance", "Effect Chance"),
            ("crit_chance", "Crit Chance"),
            ("crit_power", "Crit Power"),
            ("atk_speed", "ATK Speed"),
        ]
    ):
        r, c = divmod(i, 3)
        f = ctk.CTkFrame(stats_frame, fg_color=CARD, corner_radius=10)
        f.grid(row=r, column=c, sticky="nsew", padx=4, pady=4)
        ctk.CTkLabel(f, text=title, text_color=DIM, font=ctk.CTkFont(size=11)).pack(pady=(14, 0))
        sv = ctk.StringVar(value="—")
        stats_labels[key] = sv
        ctk.CTkLabel(f, textvariable=sv, font=ctk.CTkFont(size=20, weight="bold")).pack(pady=(4, 14))

    summary_bottom = ctk.CTkFrame(right, fg_color="transparent")
    summary_bottom.pack(fill="x", pady=(8, 0))
    for i in range(3):
        summary_bottom.grid_columnconfigure(i, weight=1)
    min_var = ctk.StringVar(value="—")
    avg_var = ctk.StringVar(value="—")
    max_var = ctk.StringVar(value="—")
    for col, (title, var) in enumerate(
        [("Min Stage", min_var), ("Avg Stage", avg_var), ("Max Stage", max_var)]
    ):
        f = ctk.CTkFrame(summary_bottom, fg_color=CARD, corner_radius=10)
        f.grid(row=0, column=col, sticky="nsew", padx=3)
        ctk.CTkLabel(f, text=title, text_color=DIM).pack(pady=(8, 0))
        ctk.CTkLabel(f, textvariable=var, font=ctk.CTkFont(size=14, weight="bold")).pack(pady=(2, 10))

    def _style_ax(fig, ax) -> None:
        plot_bg = "#111113"
        fig.patch.set_facecolor(PANEL)
        ax.set_facecolor(plot_bg)
        ax.tick_params(colors=FG, labelcolor=FG, which="both")
        ax.xaxis.label.set_color(FG)
        ax.yaxis.label.set_color(FG)
        ax.title.set_color(FG)
        for spine in ax.spines.values():
            spine.set_color("#52525b")
        ax.grid(True, color="#3f3f46", linestyle="-", linewidth=0.6, alpha=0.85)
        ax.set_axisbelow(True)

    def _init_empty_chart(fig, ax, canvas, xlabel: str, ylabel: str) -> None:
        ax.clear()
        _style_ax(fig, ax)
        ax.set_xlabel(xlabel)
        ax.set_ylabel(ylabel)
        ax.text(
            0.5,
            0.5,
            "Run Simulation to see results",
            transform=ax.transAxes,
            ha="center",
            va="center",
            color=DIM,
            fontsize=11,
        )
        fig.tight_layout()
        canvas.draw_idle()

    _init_empty_chart(fig_dist, ax_dist, canvas_dist, "Stage", "Frequency")
    _init_empty_chart(fig_odds, ax_odds, canvas_odds, "Stage", "Odds %")
    _init_empty_chart(fig_rev, ax_rev, canvas_rev, "Stage", "Frequency")

    def on_result(res: SimResult) -> None:
        card_vars["loot"].set(f"{res.loot_score}")
        card_vars["stage"].set(f"{res.avg_stage:.1f}  ({res.min_stage:.0f}–{res.max_stage:.0f})")
        card_vars["time"].set(f"{format_duration(res.avg_time_s)}  ({res.runs_per_day:.1f})")
        card_vars["boss"].set(f"{res.boss_kill_rate * 100:.1f}%")
        min_var.set(f"{res.min_stage:.1f}")
        avg_var.set(f"{res.avg_stage:.1f}")
        max_var.set(f"{res.max_stage:.1f}")
        status_var.set(f"Done — {res.n} runs ({res.engine})")
        progress_bar.set(1.0)

        ax_dist.clear()
        _style_ax(fig_dist, ax_dist)
        if res.stage_counts:
            xs = list(res.stage_counts.keys())
            ys = list(res.stage_counts.values())
            ax_dist.bar(xs, ys, color=ACCENT, width=0.8, edgecolor="#7f1d1d")
            ax_dist.set_xlabel("Stage")
            ax_dist.set_ylabel("Frequency")
        fig_dist.tight_layout()
        canvas_dist.draw_idle()

        ax_odds.clear()
        _style_ax(fig_odds, ax_odds)
        if res.stage_odds:
            xs = list(res.stage_odds.keys())
            ys = [v * 100 for v in res.stage_odds.values()]
            ax_odds.plot(xs, ys, color=ACCENT, linewidth=2)
            ax_odds.fill_between(xs, ys, color=ACCENT, alpha=0.25)
            for thr, col in ((90, "#22c55e"), (50, "#eab308"), (10, "#f472b6")):
                ax_odds.axhline(thr, color=col, linestyle="--", linewidth=1, alpha=0.9)
            ax_odds.set_ylim(0, 105)
            ax_odds.set_xlabel("Stage")
            ax_odds.set_ylabel("Odds %")
        fig_odds.tight_layout()
        canvas_odds.draw_idle()

        ax_rev.clear()
        _style_ax(fig_rev, ax_rev)
        stages = sorted(set(res.first_revive) | set(res.second_revive))
        if stages:
            f1 = [res.first_revive.get(s, 0) for s in stages]
            f2 = [res.second_revive.get(s, 0) for s in stages]
            ax_rev.bar(stages, f1, color="#22c55e", label="First Revive", edgecolor="#14532d")
            ax_rev.bar(stages, f2, bottom=f1, color="#eab308", label="Second Revive", edgecolor="#854d0e")
            leg = ax_rev.legend(facecolor=PANEL, edgecolor="#52525b", labelcolor=FG, framealpha=1.0)
            for txt in leg.get_texts():
                txt.set_color(FG)
            ax_rev.set_xlabel("Stage")
            ax_rev.set_ylabel("Frequency")
        fig_rev.tight_layout()
        canvas_rev.draw_idle()

        st = res.build_stats
        stats_labels["max_hp"].set(str(st.get("max_hp", "—")))
        stats_labels["atk_power"].set(str(st.get("atk_power", "—")))
        stats_labels["hp_regen"].set(f"{st.get('hp_regen', 0)} /s")
        stats_labels["dmg_reduction"].set(f"{st.get('dmg_reduction', 0)} %")
        stats_labels["evade_chance"].set(f"{st.get('evade_chance', 0)} %")
        stats_labels["effect_chance"].set(f"{st.get('effect_chance', 0)} %")
        stats_labels["crit_chance"].set(f"{st.get('crit_chance', 0)} %")
        stats_labels["crit_power"].set(f"{st.get('crit_power', 0)} x")
        stats_labels["atk_speed"].set(f"{st.get('atk_speed', 0)} s")

    ctk.CTkLabel(root, textvariable=status_var, text_color=DIM, anchor="w").pack(fill="x", padx=14, pady=(4, 10))

    level_var.trace_add("write", lambda *_: (refresh_budget(), refresh_preview_stats()))

    def on_close() -> None:
        state["cancel"] = True
        state["opt_cancel"] = True
        save_ui_state()
        tw = state.get("talent_win")
        if tw is not None:
            try:
                tw.destroy()
            except Exception:
                pass
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_close)

    saved = load_ui_state()
    if saved and isinstance(saved.get("config"), dict):
        try:
            reps_var.set(int(saved.get("reps", 200)))
            load_config_into_vars(saved["config"])
            status_var.set(f"Restored last session ({UI_STATE_PATH.name})")
        except Exception:
            saved = None
    if not saved:
        if DEFAULT_BUILD.exists():
            with DEFAULT_BUILD.open(encoding="utf-8") as f:
                load_config_into_vars(yaml.safe_load(f))
            status_var.set(f"Loaded {DEFAULT_BUILD.name}")
        else:
            load_config_into_vars(Borge.load_dummy())

    root.mainloop()


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] == "--cli":
        path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_BUILD
        n = int(sys.argv[3]) if len(sys.argv) > 3 else 50
        eng = sys.argv[4] if len(sys.argv) > 4 else "auto"
        main_cli(path, n, eng)
    else:
        main_gui(maximized="--maximized" in sys.argv)


if __name__ == "__main__":
    main()
