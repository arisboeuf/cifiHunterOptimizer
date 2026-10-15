# OfflineHunt simulator (Borge + Ozzy)

Python event-driven Monte-Carlo engine ported from the Android **0.7.3.42** OfflineHunt extraction. **Not** bit-identical to cifi-tools WASM; use WASM as a distribution oracle.

See [STATUS.md](STATUS.md) for ported vs stub coverage. Knox is out of scope.

## Web UI toggle

Start with [`launch.py`](../launch.py) (not a plain static file server). In the Hunter toolbar, **Engine** switches between:

- **WASM (cifi-tools)** — `web/wasm/release.wasm`
- **Offline (Python sim)** — this package via `POST /api/sim` (Borge + Ozzy only)

## Quick start

```powershell
# Web app + API
python launch.py

# Single run (CLI)
& "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe" -m sim run --build sim/fixtures/borge_lvl14_example.json --seed 1

# Monte-Carlo
& "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe" -m sim mc --build sim/fixtures/borge_lvl14_example.json --n 200 --seed 1

# Stop after clearing boss 100
& "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe" -m sim mc --build sim/fixtures/ozzy_default.json --n 100 --stop-after-boss 100
```

## Build JSON

Same shape as the web app (`meta`, `stats`, `talents`, `attributes`, `inscryptions`, `relics`, `gems`, `mods`).

Without `combat`, Python computes finals via ported **HuntStatistics** (`sim/hunt_statistics.py` — same ctor math as OfflineHunt 0.7.3.42). The web Offline engine strips any saved `combat` dump so Python owns the stats.

Optional `combat` override (CLI / WASM oracle dumps only) replaces finals:

```json
"combat": {
  "max_hp": 12000,
  "atk_power": 800,
  "hp_regen": 40,
  "dmg_reduction": 0.25,
  "evade_chance": 0.15,
  "effect_chance": 0.2,
  "crit_chance": 0.35,
  "crit_power": 2.2,
  "atk_interval": 0.8
}
```

## WASM oracle

```powershell
node scripts/wasm_oracle.mjs --hunter borge --build sim/fixtures/borge_lvl14_example.json --n 200
```

Compares histogram / avg stage / boss metrics from `release.wasm`. Attach printed `combat` into the build JSON for fairer Python vs WASM fights.

## Library API

```python
from sim import load_build, run_hunt, run_monte_carlo

build = load_build("sim/fixtures/borge_lvl14_example.json")
one = run_hunt(build, seed=42)
mc = run_monte_carlo(build, n=500, seed=1, stop_after_boss=200, keep_runs=True)
```

## Tests

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe" -m pytest tests/sim -q
```
