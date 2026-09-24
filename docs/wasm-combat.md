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

## Ozzy Multistrike (summary)

Community / wiki consensus (engine implements the fight; this is the intended model):

- **Chance** — probability of a second, weaker hit after a successful attack (one extra hit, not a chain).
- **Power** — damage multiplier/scale of that extra hit.
- Extra hits can re-roll many on-hit effects; that is often more valuable early than raw Multi damage.
- Multistrikes generally **do not** grant Trickster evade stacks or Thousand Needles stuns.
- **Echo Bullets** can trigger their own Multistrike.
- Soft boosts in-build: Cycle of Death (per revive used), Inscryption #40 (+Multistrike Chance).

UI note in-game: Multistrike count stats have historically shown `0` while Multistrikes still occur (light-blue damage numbers). Our sim does not depend on that UI counter.
