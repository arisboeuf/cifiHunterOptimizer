# WASM combat engine

## What `web/wasm/release.wasm` is

The file lives in this repo under `web/wasm/release.wasm`, but **we did not write the combat math**. It is the public engine from [cifi-tools](https://cifi-tools.com/) (`EVALBORGE_WASM`, `EVALOZZY_WASM`, `EVALKNOX_WASM`).

- Deploy: if the file is missing, `.github/workflows/deploy-hunter-web.yml` downloads it from `https://cifi-tools.com/wasm/release.wasm`.
- Our JS only **bridges** builds into eval params and reads result getters (see `web/js/hunters/*/wasm-engine.js`).

If a run stages, dies, and loots correctly, that behavior comes from **their** binary. UI, optimizer, and charts are ours.

## Where hunter mechanics live

| Layer | Role |
| --- | --- |
| `release.wasm` | Actual fight: hits, procs, Multistrike, Echo, revives, bosses, loot |
| Hunter `wasm-engine.js` | Map stats/talents/attrs → WASM args; map getters → sim result |
| `costs.js` / tips | Labels and short effect blurbs (from online-sim definitions) — **not** the combat implementation |
| `docs/monster_stats/` | Documented enemy formulas (CSV); may drift slightly from WASM |

Example (Ozzy): UI “Multistrike Chance / Power” → eval keys `multichance` / `multipower` → WASM. Talent tips in `ozzy/costs.js` describe intended effects; the engine enforces them.

## Answering “how does X work?” from this repo

`release.wasm` is a **compiled binary**, not readable source.

**Useful:**

- Exported symbols and getters (`getLastOzzyMultistrike`, …)
- Parameter order / wiring in our bridges
- Talent/attribute tips and wiki/community notes
- Controlled sims: change one input, compare stage/loot/stats (behavior probes)

**Not reliable as documentation:**

- Decompiling hit/proc order or exact formulas from the binary alone

Prefer: documented tips + external wiki/community, then confirm with WASM runs when the answer matters for balance or the optimizer.

**Player mechanics (Crit / Multistrike / Charge):** see [docs/mechanics.md](mechanics.md).

**Boss Kill % vs Boss HP %**, why the First Bosskill Finder is a budgeted screen rather than a Resolution V factorial, and how the stage, loot, and bosses/day buttons use that funnel: see [docs/boss-screen.md](boss-screen.md).

## Optimizer compares are raw numbers

While combat runs through `release.wasm`, the optimizer and Next-Best-Opti rank builds by the raw objective. There is no significance test.

- **Push Average Stage:** higher average stage wins. Loot breaks an exact tie.
- **Push Material/XP:** higher loot/min wins. Average stage breaks an exact tie.
- **Maximize Boss/day:** higher bosses/day wins, then loot, then average stage.
- **Next-Best-Opti:** a +1 counts when its average stage is higher than the baseline. The label shows that raw delta.

WASM returns a stage histogram and means for a batch of runs, not a sample this tool treats as a formal test. A z-test on that histogram used to hide small gaps (for example 100.01 vs 100.00) as noise. That test is removed on purpose for as long as this WASM engine is the combat backend.

Put a statistical compare back only if a future engine exposes per-run outcomes and we decide a noise filter is worth using again.
