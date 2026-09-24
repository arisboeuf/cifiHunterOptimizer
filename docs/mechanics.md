# Hunter combat mechanics

Player-facing notes for the **special combat pair** each hunter maps to the same UI slots (`special_chance` / `special_damage` in builds; shown as Crit / Multistrike / Charge).

Fight math is enforced by `release.wasm` ([docs/wasm-combat.md](wasm-combat.md)). Numbers and blurbs below come from in-repo tips (`web/js/hunters/*/costs.js`), wiki, and community consensus — treat exact edge cases as “confirm in sim” if balance-critical.

---

## Same slots, different jobs

| Hunter | Chance stat | Power / gain stat | What it does |
| --- | --- | --- | --- |
| **Borge** | Crit Chance | Crit Power | Same hit deals multiplied damage |
| **Ozzy** | Multistrike Chance | Multistrike Power | Chance of a **second, weaker hit** after the attack |
| **Knox** | Charge Chance | Charge Gained | Chance to **gain charge** (resource for free shots / torpedoes) |

In the sim result panel these still use internal keys `crit_chance` / `crit_power`, but labels change per hunter.

WASM eval keys:

| Hunter | Chance → | Power → |
| --- | --- | --- |
| Borge | `critchance` | `critpower` |
| Ozzy | `multichance` | `multipower` |
| Knox | `charge` | `chargeGain` |

---

## Borge — Crit

**Model:** On a successful attack, roll Crit Chance. On success, that hit’s damage is scaled by Crit Power (e.g. `2.5×` means 2.5× normal hit damage for that strike — not a second attack).

| | |
| --- | --- |
| **Chance** | Probability the current hit crits |
| **Power** | Damage multiplier on a crit |
| **Not** | An extra attack (that is Ozzy Multistrike) |

### Related bonuses (from attribute / inscryption tips)

- **Explosive Punches:** +4.4% Crit Chance and +8% Crit Power per level
- **Atlas Protocol:** +2.5% Crit Chance per level (plus DR / Effect; bosses −ATK Speed)
- **Soul of Hermes:** +0.4% Crit Chance, +1% Crit Power (and Effect)
- **Soul of Athena:** heavy attack that **always crits** (×1.5 damage, ×6 charge)
- **Weakspot Analysis:** −11% **crit damage taken** per level (defense vs enemy crits)
- Inscryptions **#4** / **#88:** Crit Chance

Enemy crit chance/power are capped in monster docs (≤25% / ≤2.5×); see [monster_stats/README.md](monster_stats/README.md).

---

## Ozzy — Multistrike

**Model:** On a successful attack, roll Multistrike Chance. On success, fire **one extra hit**. That extra hit’s damage is scaled by Multistrike Power (usually weaker than the primary). It is **not** “double the main hit” and does not chain into more Multistrikes from itself.

| | |
| --- | --- |
| **Chance** | Probability of a second hit |
| **Power** | How hard the second hit hits |
| **Main early value** | Re-rolling many on-hit / attack passives |

### Proc notes (wiki / community)

| Can Multistrike help trigger? | Effect |
| --- | --- |
| Often yes | Omen of Decay, Crippling Shots, other on-hit damage passives |
| No | Trickster’s Boon evade stacks; Thousand Needles stuns |
| Special | **Echo Bullets** can trigger their **own** Multistrike |

### Related bonuses

- **Cycle of Death:** +2.3% Multistrike Chance and +2% Multistrike Power **per revive used**, per level
- Inscryption **#40:** +0.5% Multistrike Chance

In-game Multistrike *counters* in statistics have historically shown `0` while Multistrikes still fire (light-blue damage numbers). The WASM sim does not rely on that UI counter.

Echo tip in-repo: chance ≈ ½ Effect Chance; echo damage ≈ 5% ATK Power × level. Crippling applies on Attack, Multistrike, or Echo (Effect Chance).

---

## Knox — Charge

**Model:** Knox does **not** crit or Multistrike. Charge Chance / Charge Gained feed a **charge meter**.

Community consensus (confirm in-game tooltips / sim for thresholds):

- Roll Charge Chance **once per attack sequence** (not once per projectile in a salvo).
- On success, add **Charge Gained**.
- Rough thresholds often cited: every **~10** charge → free attack; every **~100** → **torpedoes** (burst across several upcoming enemies; projectile/salvo upgrades can add targets).
- Early push often deprioritizes on-hit charge; **Passive Charge Tank** and boss attempts change that.

| | |
| --- | --- |
| **Chance** | Probability to gain charge this sequence |
| **Gained** | How much charge you add on success |
| **Not** | A damage multiplier on the current bullet |

---

## Quick compare

```text
Borge crit:     [Attack] ──crit?──► same hit × Crit Power
Ozzy multi:     [Attack] ──multi?─► extra hit (× Multistrike Power)
Knox charge:    [Attack] ──charge?► meter += Charge Gained → free hit / torpedoes
```

---

## Sources in this repo

| Topic | Where |
| --- | --- |
| Talent / attr blurbs | `web/js/hunters/{borge,ozzy,knox}/costs.js` |
| WASM wiring | `web/js/hunters/{borge,ozzy,knox}/wasm-engine.js` |
| Enemy crit caps / formulas | `docs/monster_stats/` |
| Engine provenance | `docs/wasm-combat.md` |
