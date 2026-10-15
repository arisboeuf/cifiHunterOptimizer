# Reference: ObeliskFarm Monte Carlo (external)

Notes from inspecting [arisboeuf/ObeliskFarm](https://github.com/arisboeuf/ObeliskFarm/tree/web) (`web` branch). Useful as a **same-genre** idle-game calculator (Idle Obelisk Miner), not as CIFI combat math.

Live app: `https://arisboeuf.github.io/ObeliskFarm/`

---

## Stack (web app)

| Layer | Tech | Role |
| --- | --- | --- |
| UI | React + TypeScript + Vite (`web/`) | Inputs, charts, module pages |
| MC core | TypeScript | Archaeology / event simulators and optimizers |
| Execution | Browser **Web Workers** | Heavy MC off the UI thread |
| Assets | npm scripts | Sprite download/copy before `dev` / `build` |

`web/package.json` has only React + Vite tooling — **no WASM, no Rust** dependencies for the simulators.

Local run (their README):

```bash
cd web
npm install
npm run dev
```

---

## Where the MC code lives

### Web (what the GitHub Pages app runs)

| Path | Purpose |
| --- | --- |
| `web/src/lib/archaeology/mc/monteCarlo.ts` | Archaeology run MC (ported from Python) |
| `web/src/lib/archaeology/mc/prng.ts` | PRNG (Mulberry32) |
| `web/src/lib/event/monteCarloOptimizer.ts` | Event upgrade budget MC optimizer |
| `web/src/lib/event/simulation.ts` | Single event fight / wave simulation |
| `web/src/workers/arch_mc.worker.ts` | Archaeology worker entry |
| `web/src/workers/mc.worker.ts` | Event optimizer worker entry |

Comments in those files explicitly say they were **ported from** the Python modules below.

### Python / Lua (desktop / earlier path)

| Path | Purpose |
| --- | --- |
| `ObeliskGemEV/archaeology/monte_carlo_crit.py` | Archaeology MC engine |
| `ObeliskGemEV/archaeology/mc_parallel.py` | Parallel MC |
| `ObeliskGemEV/archaeology/MC_GUIDELINES.md` | MC design rules (variance, threads, stats tests) |
| `ObeliskGemEV/event/monte_carlo_optimizer.py` | Event MC optimizer |
| `ObeliskGemEV/event/simulation.py` / `simulator.py` | Event sim |

So: **Python was the original MC**; the **browser runs a TypeScript port** of that logic.

---

## How their MC works (high level)

1. Seed a small PRNG (Mulberry32).
2. For `n_sims` (or many candidate builds): run one full archaeology run / event wave sim with RNG (crit, blocks, upgrades, …).
3. Collect raw samples (max stage, fragments, wave, time, …), then summarize mean / variance / best build.
4. Workers keep the UI responsive; progress messages go back via `postMessage`.

Not a compiled binary in the browser — plain JS/TS loops, same idea as “many random trials → distribution.”

---

## Compared to CIFI

| | ObeliskFarm (web) | CIFI (this repo) |
| --- | --- | --- |
| Primary browser combat/MC | Own **TypeScript** MC | **cifi-tools WASM** (+ optional Offline Python / own Rust port) |
| Heavy work off UI thread | Web Workers | WASM is sync/fast in-page; Offline Python via `POST /api/sim` |
| Origin of sim math | Python → TS port of game-derived formulas | WASM oracle + Android OfflineHunt extraction → Python/Rust |
| Optimizer | TS MC / guided search in workers | JS optimizer calling WASM eval |

Architectural takeaway for us: shipping a **full TS/JS Monte Carlo in Workers** is a proven pattern for idle calculators when you own the formulas. CIFI still leans on WASM for speed/oracle and Python Offline for a transparent Hunt port — different constraints (binary engine we did not author vs. formulas they ported themselves).

---

## Related CIFI docs

- [Offline Python sim vs WASM](offline-python-sim.md)
- [WASM combat provenance](wasm-combat.md)
- [sim/README.md](../sim/README.md)
