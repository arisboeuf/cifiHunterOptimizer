# CIFI-Spielzustand → eine CSV-Datei

Du bekommst in derselben Nachricht **Screenshots und/oder abgeschriebenen Text** aus dem Spiel. Erzeuge daraus **genau eine** CSV-Datei zum RUNTERLADEN <- WICHTIG>, die ein externes Tool unverändert einlesen kann.

## Ausgabe (wichtig)

- **Nur** der CSV-Text: beginnt mit der Header-Zeile, danach Datenzeilen.
- **Keine** Einleitung („Hier ist…“), **keine** Schlussbemerkung, **keine** Markdown-Codefences um die Ausgabe, **keine** nummerierten Listen außerhalb der CSV.

## Strikte Vorgaben für die CSV

1. **Kodierung:** UTF-8.  
2. **Trennzeichen:** Komma `,`.  
3. **Erste Zeile (Header) — exakt so, keine anderen Spaltennamen:**

   `section,key,value,extra1,extra2,extra3`

4. Jede **weitere Zeile** hat genau **sechs** Spalten (leere Spalten erlaubt; Kommas müssen stimmen).

5. **`section`** nur: `config` | `generator` | `booster` | `card` (alles kleingeschrieben).  
   **`key`:** kleinschreiben (`mk3_next_cost`). BOM am Dateianfang vermeiden.

6. **`config`**, **`generator`**, **`booster`:** Hauptwert in **`value`**; `extra1`–`extra3` **leer** lassen.

7. **`generator`:** Keys `mk2_target` … `mk5_target`: in **`value`** nur Kleinbuchstaben-String (`mk1`, `mk2`, …), **keine** wissenschaftliche Zahl.  
   Kette: mk2→mk1, mk3→mk2, mk4→mk3, mk5→mk4.

8. **`card`:** **`key`** = Karten-ID (`delta`, …, klein). In **`value`** … **`extra3`** nur Tokens **`attribut=wert`** (`cells=`, `mk2=`, …).  
   - **`cost=owned`** nur wenn die Karte **bereits gekauft** ist.  
   - **Kein** `cost=<zahl>` für kaufbare Karten — Gem-Preise kommen im Tool aus festen Konstanten, nicht aus der CSV.  
   - Fehlende Multiplikatoren weglassen (= Faktor 1 im Tool).

9. Zahlen: **Punkt** als Dezimaltrenner; wissenschaftliche Notation erlaubt (`3.32e102`).

10. **`booster`:** Gem-Anstieg pro weiterem Kauf (`cost_increase`) muss **nicht** in die CSV — das Tool nutzt eigene Konstanten. Nur **`{prefix}_multiplier`**, **`{prefix}_next_cost`**, **`{prefix}_base_gain`** wie unten.

## Pflicht-Zeilen (Reihenfolge egal; alle genannten Keys müssen vorkommen)

**`config`**

| key | Bedeutung |
|-----|-----------|
| `level` | Spielerlevel |
| `gems` | Verfügbare Gems |
| `tick_seconds` | Tick-Dauer in Sekunden |
| `cells_per_tick` | Angezeigte Cells pro Tick |
| `current_cells` | Aktuelle Cells |

**`generator`** — pro Stufe mk1 … mk5

| key | value |
|-----|--------|
| `mkN_owned` | Zahl |
| `mkN_cost` | Zahl |
| `mkN_prod` | Zahl (nur **mk2–mk5**: Produktion pro Tick Richtung untere Stufe laut UI; **mk1_prod** nicht nötig) |
| `mkN_target` | nur mk2–mk5: Text `mk1` … `mk4` wie oben |

**`booster`** — pro Prefix `mk1` … `mk5`, `cells`; **`mp`** und **`shards`** nur wenn im Spiel sichtbar, sonst Zeilen weglassen

| key | Bedeutung |
|-----|-----------|
| `{prefix}_multiplier` | Aktueller Gesamt-Multiplikator |
| `{prefix}_next_cost` | Nächster Kaufpreis in Gems |
| `{prefix}_base_gain` | Bonus **pro Kauf**, für diesen Booster konstant (z. B. `0.08` → ×1,08 pro Kauf) |

**`card`** — eine Zeile pro sichtbarer Karte; bis zu vier `attr=wert`-Tokens auf `value` + `extra1` + `extra2` + `extra3` verteilen.

## Vollständige Zeilenliste (Platzhalter durch echte Werte ersetzen)

```
section,key,value,extra1,extra2,extra3
config,level,<LEVEL>
config,gems,<GEMS>
config,tick_seconds,<TICK_SEC>
config,cells_per_tick,<CELLS_PER_TICK>
config,current_cells,<CURRENT_CELLS>
generator,mk1_owned,<MK1_OWNED>
generator,mk1_cost,<MK1_COST>
generator,mk2_owned,<MK2_OWNED>
generator,mk2_cost,<MK2_COST>
generator,mk2_prod,<MK2_PROD_PER_TICK>
generator,mk2_target,mk1
generator,mk3_owned,<MK3_OWNED>
generator,mk3_cost,<MK3_COST>
generator,mk3_prod,<MK3_PROD_PER_TICK>
generator,mk3_target,mk2
generator,mk4_owned,<MK4_OWNED>
generator,mk4_cost,<MK4_COST>
generator,mk4_prod,<MK4_PROD_PER_TICK>
generator,mk4_target,mk3
generator,mk5_owned,<MK5_OWNED>
generator,mk5_cost,<MK5_COST>
generator,mk5_prod,<MK5_PROD_PER_TICK>
generator,mk5_target,mk4
booster,mk1_multiplier,<M>
booster,mk1_next_cost,<GEMS>
booster,mk1_base_gain,<GAIN>
booster,mk2_multiplier,<M>
booster,mk2_next_cost,<GEMS>
booster,mk2_base_gain,<GAIN>
booster,mk3_multiplier,<M>
booster,mk3_next_cost,<GEMS>
booster,mk3_base_gain,<GAIN>
booster,mk4_multiplier,<M>
booster,mk4_next_cost,<GEMS>
booster,mk4_base_gain,<GAIN>
booster,mk5_multiplier,<M>
booster,mk5_next_cost,<GEMS>
booster,mk5_base_gain,<GAIN>
booster,cells_multiplier,<M>
booster,cells_next_cost,<GEMS>
booster,cells_base_gain,<GAIN>
booster,mp_multiplier,<M>
booster,mp_next_cost,<GEMS>
booster,mp_base_gain,<GAIN>
booster,shards_multiplier,<M>
booster,shards_next_cost,<GEMS>
booster,shards_base_gain,<GAIN>
card,<card_id>,cost=owned,<attr>=<mult>,,
card,<card_id>,<attr>=<mult>,<attr>=<mult>,<attr>=<mult>,
```

Die letzten beiden `card`-Zeilen sind **Muster**: pro echter Karte **eine** Zeile; nicht vorhandene Karten weglassen.

## Format-Referenz (nur Struktur; nicht 1:1 wiederholen)

```
section,key,value,extra1,extra2,extra3
config,level,1
config,gems,100
config,tick_seconds,4.9
config,cells_per_tick,1.0e6
config,current_cells,0
generator,mk1_owned,10
generator,mk1_cost,100
generator,mk2_owned,2
generator,mk2_cost,200
generator,mk2_prod,5
generator,mk2_target,mk1
generator,mk3_owned,1
generator,mk3_cost,300
generator,mk3_prod,1
generator,mk3_target,mk2
generator,mk4_owned,1
generator,mk4_cost,400
generator,mk4_prod,1
generator,mk4_target,mk3
generator,mk5_owned,1
generator,mk5_cost,500
generator,mk5_prod,1
generator,mk5_target,mk4
booster,mk1_multiplier,1
booster,mk1_next_cost,10
booster,mk1_base_gain,0.01
booster,mk2_multiplier,1
booster,mk2_next_cost,10
booster,mk2_base_gain,0.01
booster,mk3_multiplier,1
booster,mk3_next_cost,10
booster,mk3_base_gain,0.01
booster,mk4_multiplier,1
booster,mk4_next_cost,10
booster,mk4_base_gain,0.01
booster,mk5_multiplier,1
booster,mk5_next_cost,10
booster,mk5_base_gain,0.01
booster,cells_multiplier,1
booster,cells_next_cost,10
booster,cells_base_gain,0.01
booster,mp_multiplier,1
booster,mp_next_cost,10
booster,mp_base_gain,0.01
booster,shards_multiplier,1
booster,shards_next_cost,10
booster,shards_base_gain,0.01
card,alpha,cost=owned,cells=1.1,,
card,delta,cells=1.5,mk2=1.1,,
```
