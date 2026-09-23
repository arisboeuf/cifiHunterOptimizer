# Monster / Enemy Stats (Dokumentation)

**Basiswerte vor** Talent-/Attribute-Effekten (Presence of God, Omen of Defeat, …).
Formeln leben in `scripts/export_monster_stats.py`.

Neu generieren:

```text
python scripts/export_monster_stats.py
```

## Dateien

| Datei | Inhalt |
|---|---|
| `borge_enemies.csv` | Borge-Normalgegner, Stage 1–300 |
| `ozzy_enemies.csv` | Ozzy-Normalgegner, Stage 1–300 |
| `knox_enemies.csv` | Knox-Normalgegner, Stage 1–300 |
| `enemies_milestones.csv` | Kompakte Stichproben aller drei Hunter |
| `bosses.csv` | Bosse Stage 100 / 200 (Borge + Ozzy + Knox) |

## Caps (Combat)

Ab Patch 2024-01-24 in `Enemy.__create__`:

- Crit Chance (`special_chance`) ≤ **25%**
- Crit Damage (`special_damage`) ≤ **2.5×**

In den Enemy-CSVs sind die Werte bereits gecappt; `*_capped` markiert, ob der Cap greift.

## Formeln (Normalgegner)

### Borge / Ozzy (hunter-sim)

Skalierungsschwellen:

- **Stage > 100:** HP/Power/Regen-Multiplikatoren + Evade
- **Stage ≥ 150:** zusätzlicher Late-Game-Multiplikator  
  `1 + (stage-149) * (0.006 + 0.006 * (stage-150)//50)`  
  (bei HP zusätzlich mit `stage // 150` multipliziert)

#### Borge

| Stat | Formel (Kern) |
|---|---|
| HP | `(9 + stage*4) * (2.85 if stage>100) * late` |
| Power | `(2.5 + stage*0.7) * (2.85 if stage>100) * late` |
| Regen | `((stage-1)*0.08) * (1.052 if stage>100) * late` (0 auf Stage 1) |
| Crit Chance | `0.0322 + stage*0.0004` |
| Crit Damage | `1.21 + stage*0.008025` |
| Evade | `0.004` ab Stage 101, sonst 0 |
| Speed | `4.53 - stage*0.006` |
| DR | immer 0 |

#### Ozzy

| Stat | Formel (Kern) |
|---|---|
| HP | `(11 + stage*6) * (2.9 if stage>100) * late` |
| Power | `(1.35 + stage*0.75) * (2.7 if stage>100) * late` |
| Regen | `(0.02 + (stage-1)*0.1) * (1.25 if stage>100) * late` |
| Crit Chance | `0.0994 + stage*0.0006` |
| Crit Damage | `1.03 + stage*0.008` |
| Evade | `0.01` ab Stage 101, sonst 0 |
| Speed | `3.20 - stage*0.004` |
| DR | immer 0 |

### Knox (cifi-tools EnemyStatsDebug)

Late-Multiplikator startet früher (ab Stage 49) und hat zusätzliche Breakpoints; Band = `floor((stage-1)/100)`.

| Stat | Formel (Kern, PoG=0, Normal) |
|---|---|
| HP | `(7 + stage*9) * late * 3.2^band` |
| Power | `(2.4 + stage*1.4) * late * 2.7^band` |
| Regen | `0.04 * stage * late * 1.4^band` |
| Crit Chance | `0.0994 + stage*0.0006` |
| Crit Damage | `1.032 + stage*0.008` |
| Evade | immer `0.01` |
| Speed | `6.005 - stage*0.005` |
| DR | 0 unter Stage 200; ab 200: `0.02*(band-2)+0.04` (min. band≥2) |

Boss-Stufen (`stage % 100 == 0`): HP×120, Power×4, Regen×2, Speed×2.85, +DR/Crit-Boni.

## Bosse

Feste Tabellenwerte bzw. Knox aus derselben Formel, siehe `bosses.csv`.

Zusatzmechanik:

- **Enrage:** +1 Stack pro Primary-Hit; Speed wird schneller; bei ≥200 Stacks: Power ×3, Crit Chance 100%
- **Borge 200 (Gothmorgor):** Secondary Attack (`speed2`)
- **Ozzy 200 (Exoscarab):** Harden (DR 95%, 3× Regen, 5 Ticks)
- **Knox 200:** Boss-Ability in der WASM-Engine (siehe cifi-tools Changelog)

## Hinweis WASM / Online-Sim

Die Online-/WASM-Engine kann leicht abweichende Werte haben. Borge/Ozzy-CSVs spiegeln die dokumentierten hunter-sim-Formeln; Knox folgt cifi-tools EnemyStatsDebug.
