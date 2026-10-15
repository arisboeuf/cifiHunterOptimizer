# OfflineHunt sim — port status

Extraction baseline: Android **0.7.3.42**. WASM oracle: `web/wasm/release.wasm` (cifi-tools).

Legend: **ported** = used in combat path · **stub** = present but approximate · **unknown** = not modeled

| Area | Borge | Ozzy | Notes |
| --- | --- | --- | --- |
| HuntTime / UnitActions event loop | ported | ported | Shared kernel |
| HuntStage Progress (10 kills / boss 1) | ported | ported | `sim/hunt_stage.py` — was 1 kill = 1 stage (time ~7–10× too short) |
| HuntRoll (Xoshiro256**) | ported | ported | Fresh-run seed init is synthetic |
| Shared enemy_stats + boss multipliers | ported | ported | Matches extraction; Borge/Ozzy WASM constants align |
| Stage factory / spawn | ported | ported | Named bosses by stage band |
| Basic attack (hit / evade / DR / crit or multi) | ported | ported | |
| Enemy / hunter regen (per second) | ported | ported | Simplified NextSecond ticks |
| Boss enrage + ApplyFrenzy | ported | ported | Ozzy Harden adds stacks |
| Boss secondary attack (×1.8) | ported | — | Stage 200 |
| Exoscarab Harden | — | stub | 25s period, 5s DR/regen buff; stun-on-hunter approximate |
| Dragorim InfernalBulk / DemonicFury | stub | — | Timers + ATK×1.01 / haste |
| Mordrekarn Rekindle | stub | — | +12% MaxHp / 120s |
| Hunter final stats (HuntStatistics) | ported | ported | Extraction ctor formulas in `sim/hunt_statistics.py`; matches WASM dumps on fixtures |
| Inscryptions in finals | ported | ported | Inside HuntStatistics (combat) + tip loot_mult for loot-only IS |
| Attribute combat passives | ported | ported | Via HuntStatistics (Ares/Ylith/… / LOTL/Exo/Ibu/…) |
| Relics / gems combat | unknown | unknown | Levels stored on build; combat wiring TBD |
| Presence of God (enemy HP) | ported | ported | −4% enemy MaxHp per level |
| Born for Battle | ported | — | Damage ×(1+0.01×lvl) approx |
| Crit / Multistrike | ported | ported | |
| Fires of War interval shorten | stub | — | Cap half interval |
| Lifedrain / Baal / Scorpions lifesteal | stub | stub | On-hit heal from tip %; no false Sensors/Baal ATK amp |
| Revives (Death is my Companion) | stub | stub | Fixed HP restore counts |
| Crippling Shots | — | ported | Talent levels (not exo_piercers) |
| Echo Bullets | — | stub | Talent levels; chance ≈½ effect; damage ≈5% ATK×lvl |
| Loot / XP totals | stub | stub | Enemy loot × inscryption/attr loot_mult |
| Soft-enrage / full talent graph | unknown | unknown | |
| Knox | — | — | Out of scope |

Honesty label for outputs: `engine=offline_hunt_port` · `parity=unvalidated` until WASM distribution bands are agreed.

Narrative (approach, WASM vs Python differences, major bugs fixed): [docs/offline-python-sim.md](../docs/offline-python-sim.md).

## Snapshot notes

- Finals: fixture dumps match `hunt_statistics` (Borge/Ozzy) field-for-field.
- Before `HuntStage` (10 kills/stage): Ø time was ~7–10× too short at similar death stages.
- Remaining stage/loot gaps: ability graph, soft-enrage, `AcquireLoot` — see matrix above.
- Prefer `node scripts/wasm_oracle.mjs` / `compare_sim_vs_wasm.mjs` for distribution checks.
