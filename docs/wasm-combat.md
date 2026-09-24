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
