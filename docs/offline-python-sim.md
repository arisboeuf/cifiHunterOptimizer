# Offline Python sim — how we built it and how it differs from WASM

This doc records the path from **cifi-tools WASM** + **Android OfflineHunt extraction** to our own Python Monte Carlo (`sim/`), and the differences that still matter for results and speed.

Related:

- Port checklist: [`sim/STATUS.md`](../sim/STATUS.md)
- WASM bridge (what we did *not* reverse from the binary): [`docs/wasm-combat.md`](wasm-combat.md)
- Extraction package: `docs/data/CIFI-Hunter-Extraction-0.7.3.42/` (local; large)
- UI: engine toggle **WASM** vs **Offline (Python)** — Push / Finder / Next-Best stay on WASM for wall-clock speed

---

## Goal

Run the same *kind* of hunt Monte Carlo as cifi-tools (stages, time, loot/min, boss metrics) with:

1. A **Python event-loop** we own and can extend (Borge + Ozzy; Knox out of scope).
2. Finals and combat rules grounded in **extraction 0.7.3.42**, not guessed heuristics.
3. The **same saved build JSON** as the web UI (stats, talents, attrs, inscryptions, relics, gems, mods).

WASM remains the **oracle** for parity checks and the **fast path** for the optimizer funnel.

---

## Sources of truth (what we used)

| Source | What it gave us | What it did not |
| --- | --- | --- |
| `web/wasm/release.wasm` (cifi-tools) | Working MC oracle; build-stat dumps via getters; loot/min + avgTime | Readable formulas; we do not decompile the fight loop from the binary |
| Android OfflineHunt extraction 0.7.3.42 | Enemy ramps, `HuntTime` / `UnitActions`, `HuntStage.Advance`, `HuntStatistics` ctors, `UpgradesHelper`, ability names | A drop-in full game client; many ability paths still stubbed |
| Web `costs.js` tips | Human-readable talent / inscryption / attribute effects | Not a substitute for ctor math when tips and asm disagree |
| Fixtures + `scripts/wasm_oracle.mjs` | Side-by-side stage / time / combat dumps | Bit-identical seeds to the live game |

Honesty label for Offline outputs: treat as **`parity=unvalidated`** until distributions track WASM within agreed bands.

---

## How we proceeded

### 1. Split the problem

Combat is two layers:

1. **Finals** — upgrade levels → Max HP, ATK, regen, DR, evade, effect, crit/multistrike, atk interval (`*HuntStatistics` ctors).
2. **Fight loop** — event schedule, hits, regen, stage progress, bosses, loot (`HuntTime` + `UnitActions` + abilities).

WASM does both inside one eval. We ported them separately so each gap is measurable.

### 2. Kernel first (event loop)

Ported a shared Borge/Ozzy engine:

- `HuntTime`, `UnitActions`, `HuntRoll` (Xoshiro256**)
- Enemy stats from extraction (`sim/enemy_stats.py`)
- Basic attacks, regen, enrage / Harden stubs, named bosses

Early Offline runs used a **heuristic** for finals (or a one-shot WASM combat dump). That was enough to smoke-test the loop, not for parity.

### 3. Finals: stop guessing, port `HuntStatistics`

Heuristic upgrade→stat mapping overstated ATK/HP by ~10× (e.g. ATK ~600 vs WASM ~50). Temporary bridge: **WASM 1-iter dump → `combat` block**.

Then decoded ctor asm + `UpgradesHelper`:

- `sim/upgrades_helper.py` — `HunterUpgrade`, Additive, GadgetCorrected, …
- `sim/hunt_statistics.py` — Borge / Ozzy closed forms

Validated against fixture WASM dumps (9/9 combat fields). Offline **no longer needs** a WASM dump for finals; `launch.py` strips saved `combat` on `/api/sim`.

### 4. Wire the UI

- `web/js/hunters/offline-engine.js` → `POST /api/sim`
- Engine toggle: Offline for **Run Simulation** only; search funnel stays WASM
- Caps (e.g. 500 sims) because Python wall-clock is slower

### 5. Close the huge duration gap: `HuntStage`

Same build stats, Offline ~21 min vs WASM ~2.5 h, similar death stage → wrong **kills per stage**.

Extraction `HuntStage.Advance`:

- Normal stage: **10 kills** (`Progress` 1…10, then `Number++`)
- Boss (`Number % 100 == 0`): **1 kill**

We had treated **1 kill = 1 stage**. Fix: `sim/hunt_stage.py`. That alone explains most of the sim-time ratio (~7–10×).

### 6. Speed work (wall-clock, not sim-time)

Profiled hotspots (action queue, per-request module purge, regen ticks). Mitigations:

- Faster `UnitActions`, shared finals per MC batch, `enemy_stats` cache, regen batching
- `launch.py` reloads `sim/` only when source mtimes change (not every POST)

**Expectation:** Python will not match WASM wall-clock without a native/compiled OfflineHunt port. WASM is in-process compiled MC; Offline is CPython + HTTP JSON.

---

## Architecture: WASM vs Offline

```text
Build JSON (same for both)
        │
        ├─► WASM path
        │     JS bridge → EVAL*_WASM(iterations)
        │     → loot/min, avgTime (minutes), stages, buildStats getters
        │
        └─► Offline path
              JS → POST /api/sim
              → HuntStatistics finals (Python)
              → event-loop MC (Python)
              → avg_stage, avg_time_seconds, avg_loot, combat echo
              → UI maps to lootScore = loot/min (same formula as WASM bridge)
```

| | WASM (cifi-tools) | Offline (Python) |
| --- | --- | --- |
| Where it runs | Browser, in-process | `launch.py` `/api/sim` |
| Finals | Inside WASM | `sim/hunt_statistics.py` |
| Fight model | Opaque compiled MC | Explicit event loop in `sim/engine.py` |
| Stage progress | Full OfflineHunt (assumed) | `HuntStage` 10 kills / boss 1 |
| Loot score | Engine loot/min (often ignores pure loot boosts) | Stub: Σ enemy loot × tip mults / time |
| Optimizer Push/Finder | Used | Not used (too slow per evaluate) |
| Knox | Supported | Not supported |

---

## Differences that bite (lessons)

### Same Build Stats ≠ same hunt

Identical HP/ATK/… in the Build Stats tab only means finals match. Duration and loot/min also need:

- Correct **StageProgress**
- Ability / soft-enrage / revive timing fidelity
- Loot pipeline (`AcquireLoot`, what cifi-tools includes in lootScore)

### Do not double-apply passives

WASM dumps already bake inscryptions/attrs into finals. Applying tip multipliers again on top of a dump overbuffs. Offline now computes finals in Python and ignores request `combat`.

### Tip text ≠ ctor when mapping talents

Example: Ozzy **Echo Bullets / Crippling Shots** are talent slots in WASM wiring, not `wings_of_ibu` / `exo_piercers`. Wrong attr fallbacks skewed Ozzy combat.

### Stale `launch.py` process

Editing `sim/` while an old server stays up can serve **old heuristic** finals. Health exposes `stats_engine: hunt_statistics`; restart after big sim changes. Prefer mtime-based reload over “purge every request” for speed.

### Sim-time vs wall-clock

| Symptom | Meaning |
| --- | --- |
| Ø TIME 21m vs 2.5h (same stats) | Fight / stage model bug (e.g. missing StageProgress) |
| Progress bar slow vs WASM | Expected: interpreter + HTTP; optimize hotspots, don’t expect parity |

### Loot score

UI `lootScore ≈ round(lootPerMin, 1)`. Absolute Offline vs WASM loot is **not** comparable until `AcquireLoot` / cifi-tools loot filters are ported. Relative Offline-only ranking is a weak signal only.

---

## Current shape of `sim/`

| Module | Role |
| --- | --- |
| `hunt_statistics.py` | Finals from extraction ctors |
| `upgrades_helper.py` | Shared upgrade math helpers |
| `hunt_stage.py` | Stage number + kill progress |
| `engine.py` | Monte Carlo + event loop |
| `enemy_stats.py` / `enemy.py` | Enemy ramps + units |
| `actions.py` / `time_model.py` / `rng.py` | Schedule, clock, HuntRoll |
| `hunter_stats.py` | Finals → `CombatStats` + combat knobs |
| `bonuses.py` | Tip tables (loot-only / fallbacks) |
| `fixtures/` | Builds + optional WASM combat dumps for tests |

CLI: `python -m sim …` · API: `launch.py` · Tests: `tests/sim/`

---

## What is still open

See [`sim/STATUS.md`](../sim/STATUS.md). Highest impact after StageProgress:

1. Full ability / soft-enrage / revive timing vs WASM stage curves  
2. Real `AcquireLoot` (and whether lootScore should ignore pure loot boosts like cifi-tools)  
3. Relic / gem combat fields beyond levels on the build  
4. Wall-clock: further Python opts or a compiled OfflineHunt core if optimizer must run Offline  
5. Knox  

---

## Practical workflow

1. Edit build in the UI; toggle **Offline** for Run Simulation.  
2. Compare Build Stats to WASM — finals should match closely.  
3. Compare Ø stage / Ø time / loot only as **parity probes**, not absolute truth.  
4. For optimizer work, keep WASM.  
5. After changing `sim/`, restart `launch.py` if results look like old heuristics.  
6. Oracle scripts: `scripts/wasm_oracle.mjs`, `scripts/compare_sim_vs_wasm.mjs`.

---

## Short history of major mistakes (and fixes)

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Heuristic finals | ATK/HP ~10× too high; stages ~180 | Port `HuntStatistics` |
| 1 kill = 1 stage | Ø time ~7–10× too short | `HuntStage.Advance` |
| WASM dump + tip re-apply | Double buffs | Strip `combat` on Offline API |
| Echo/Crippling from wrong attrs | Ozzy skew | Read talent slots |
| Fake Sensors/Baal ATK amp | Extra DPS | Remove; Baal/scorpions as lifesteal |
| Full `sys.modules` purge every POST | Extra wall-clock | Mtime-gated reload |
