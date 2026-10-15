# WASM combat engine

## What `web/wasm/release.wasm` is

The file lives in this repo under `web/wasm/release.wasm`, but **we did not write the combat math**. It is the public engine from [cifi-toolkit](https://www.cifi-toolkit.com/) / [cifi-tools](https://cifi-tools.com/) (`EVALBORGE_WASM`, `EVALOZZY_WASM`, `EVALKNOX_WASM`).

- Deploy: if the file is missing, `.github/workflows/deploy-hunter-web.yml` downloads from `https://www.cifi-toolkit.com/wasm/release.wasm` (fallback: cifi-tools.com). The toolkit build exposes `getLast*BossHpWorst` / `getLast*BossHpBest` used for Worst/Best run HP.
- An older cifi-tools-only binary (~94 KB) lacks those getters; Boss Finder then shows `—` for Worst/Best.
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

**Our Python OfflineHunt port** (how it diverges from WASM, StageProgress, finals): see [docs/offline-python-sim.md](offline-python-sim.md).

**Boss Kill % vs Boss HP %**, why the First Bosskill Finder is a budgeted screen rather than a Resolution V factorial, and how the stage, loot, and bosses/day buttons use that funnel: see [docs/boss-screen.md](boss-screen.md).

## Optimizer compares: raw screens, noisy confirm

While combat runs through `release.wasm`:

- **Funnel screens** (Push Average Stage / Material/XP / Bosses/day, First Bosskill Finder) still rank builds by the **raw** objective so small designed-grid gaps are not erased mid-search.
- **Confirm / Apply** requires the winner to beat the current hunter by more than **simulation noise** (one-sided ~95% SE gate plus a small minimum gain). Push confirms use the stage histogram, loot SE proxy, or bosses/day clear-rate SE; the First Bosskill Finder gates on clear-rate difference at 500 sims. A raw-mean win that fails the gate is reported as within noise and is not offered to apply.
- **Maximize Boss/day cold-start:** while a screen has no clears, that screen ranks and locks on remaining **boss HP** (lower better). Once any row clears, later scoring on that screen uses bosses/day again.
- **Next-Best-Opti:** still raw average-stage delta only (no SE gate).

WASM returns a stage histogram and means for a batch of runs. The confirm gate estimates SE from that histogram (or a loot proxy), similar in spirit to cifi-toolkit’s noise filter, without using their local-search walk. See [cifi-toolkit-optimiser.md](cifi-toolkit-optimiser.md) and [boss-screen.md](boss-screen.md).
