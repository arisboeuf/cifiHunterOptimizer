# CSV-Export für CIFI Alpha (`alpha_state_tool.py`)

Den folgenden Block kannst du **1:1 in ChatGPT** (o. ä.) einfügen. Ziel: Das Modell erzeugt **eine CSV-Datei**, die unser Tool **ohne Anpassung** einlesen kann.

---

## Prompt für das LLM (kopieren ab hier)

Du sollst aus Screenshots / Spieltext einen **einzigen CSV-Export** erzeugen.

### Strikte Vorgaben

1. **Kodierung:** UTF-8.  
2. **Trennzeichen:** Komma `,`.  
3. **Erste Zeile (Header) — exakt so, keine anderen Spaltennamen:**

   ```text
   section,key,value,extra1,extra2,extra3
   ```

4. Jede **weitere Zeile** hat genau diese sechs Spalten (leere Spalten sind erlaubt, aber die Kommas müssen stimmen).

5. Spalte **`section`** ist immer einer von: `config` | `generator` | `booster` | `card` (kleingeschrieben).

6. **`config` und `generator` und `booster`:** Spalte **`value`** enthält den Hauptwert; `extra1`–`extra3` werden für diese Sections **nicht** genutzt (leer lassen).

7. **`generator` — Keys mit Text statt Zahl:**  
   Zeilen mit Key `mk2_target`, `mk3_target`, … enthalten in **`value`** das Ziel als Kleinbuchstaben-String (`mk1`, `mk2`, …), **keine** wissenschaftliche Zahl.

8. **`card`:** Spalte **`key`** = **Karten-ID** (ein Wort, z. B. `delta`, `gamma`; kleinschreiben).  
   In **`value`**, **`extra1`**, **`extra2`**, **`extra3`** stehen nur **Paare** der Form `attribut=wert`, durch Komma getrennt **nicht** nötig — jedes Paar in **einer** der vier Spalten; das Tool liest alle vier Spalten zusammen.  
   Erlaubte Attribute u. a.: `cost`, `cells`, `mk1`, `mk2`, `mk3`, `mk4`, `mk5`, `mp`, `shards`.  
   - **`cost=owned`** = Karte ist **schon gekauft** (nur für Stat-Anzeige; kein erneuter Kauf).  
   - **`cost=1500`** (Zahl) = noch kaufbar für 1500 Gems.  
   - Fehlende Multiplikatoren weglassen (Tool behandelt fehlend wie Faktor 1, sofern nicht anders implementiert — für Konsistenz fehlende Stats als `mk4=1` setzen, wenn du sicher gehen willst).

9. Zahlen: **Punkt** als Dezimaltrenner; wissenschaftliche Notation erlaubt (`3.32e102`, `265.25e21`).

10. **Keine** Markdown-Codefences um die ganze Datei im Chat — nur **reiner CSV-Text** ausgeben, den man speichern kann.

### Pflicht-Zeilen (Reihenfolge egal, alle müssen vorkommen)

**`config`** (alle `key` wie unten; Werte aus dem Spiel ersetzen):

| key | Bedeutung |
|-----|-----------|
| `level` | Spielerlevel (Zahl) |
| `gems` | Verfügbare Gems (Zahl) |
| `tick_seconds` | Tick-Dauer in Sekunden |
| `cells_per_tick` | Angezeigte Cells pro Tick |
| `current_cells` | Aktuelle Cells (Stand) |

**`generator`** — pro Stufe `mk1` … `mk5`:

| key | value-Typ |
|-----|-----------|
| `mkN_owned` | Zahl |
| `mkN_cost` | Zahl |
| `mkN_prod` | Zahl (nur **mk2**–**mk5**: Produktion „nach unten“ pro Tick aus UI; **mk1** hat keine `mk1_prod`-Zeile nötig) |
| `mkN_target` | Text: `mk1` … `mk4` (mk1-Ziel = `cells` gibt es nicht als Zeile — bei mk2 target = `mk1`, … mk5 target = `mk4`) |

**`booster`** — pro Booster-Prefix `mk1` … `mk5`, `cells`, optional `mp`, `shards`:

| key | Bedeutung |
|-----|-----------|
| `{prefix}_multiplier` | Aktueller Gesamt-Multiplikator |
| `{prefix}_next_cost` | Nächster Kaufpreis in Gems |
| `{prefix}_base_gain` | Bonus **pro Kauf**, für diesen Booster **konstant** (dezimal, z. B. `0.08` → Faktor ×1,08 pro Kauf; nicht kaufabhängig absinkend) |
| `{prefix}_cost_increase` | **Einziges** sich änderndes Nicht-Card-Feld je Kauf: lineare **Gem**-Kostensteigerung zum nächsten Kauf (`0` wenn keine) |

**`card`** — eine Zeile pro Karte; `key` = Kartenname; in value/extras nur `attr=wert`-Tokens, mindestens **`cost=…`**.

---

## Skelett (Platzhalter — Struktur 1:1 beibehalten)

```csv
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
booster,mk1_cost_increase,<INC>
booster,mk2_multiplier,<M>
booster,mk2_next_cost,<GEMS>
booster,mk2_base_gain,<GAIN>
booster,mk2_cost_increase,<INC>
booster,mk3_multiplier,<M>
booster,mk3_next_cost,<GEMS>
booster,mk3_base_gain,<GAIN>
booster,mk3_cost_increase,<INC>
booster,mk4_multiplier,<M>
booster,mk4_next_cost,<GEMS>
booster,mk4_base_gain,<GAIN>
booster,mk4_cost_increase,<INC>
booster,mk5_multiplier,<M>
booster,mk5_next_cost,<GEMS>
booster,mk5_base_gain,<GAIN>
booster,mk5_cost_increase,<INC>
booster,cells_multiplier,<M>
booster,cells_next_cost,<GEMS>
booster,cells_base_gain,<GAIN>
booster,cells_cost_increase,<INC>
booster,mp_multiplier,<M>
booster,mp_next_cost,<GEMS>
booster,mp_base_gain,<GAIN>
booster,mp_cost_increase,<INC>
booster,shards_multiplier,<M>
booster,shards_next_cost,<GEMS>
booster,shards_base_gain,<GAIN>
booster,shards_cost_increase,<INC>
card,<card_id>,cost=owned,<attr>=<mult>,,
card,<card_id>,cost=<GEMS>,<attr>=<mult>,<attr>=<mult>,<attr>=<mult>
```

**Hinweis zu `card`:** Pro Karte bis zu **vier** `attr=wert`-Tokens auf `value` + `extra1` + `extra2` + `extra3` verteilen (z. B. `card,delta,cost=1500,cells=2.3,mk2=1.14,mk3=1.14` — eine Spalte pro Token reicht).

---

## Mini-Beispiel (fertig ausgefüllt, zum Testen)

```csv
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
booster,mk1_cost_increase,0
booster,mk2_multiplier,1
booster,mk2_next_cost,10
booster,mk2_base_gain,0.01
booster,mk2_cost_increase,0
booster,mk3_multiplier,1
booster,mk3_next_cost,10
booster,mk3_base_gain,0.01
booster,mk3_cost_increase,0
booster,mk4_multiplier,1
booster,mk4_next_cost,10
booster,mk4_base_gain,0.01
booster,mk4_cost_increase,0
booster,mk5_multiplier,1
booster,mk5_next_cost,10
booster,mk5_base_gain,0.01
booster,mk5_cost_increase,0
booster,cells_multiplier,1
booster,cells_next_cost,10
booster,cells_base_gain,0.01
booster,cells_cost_increase,0
booster,mp_multiplier,1
booster,mp_next_cost,10
booster,mp_base_gain,0.01
booster,mp_cost_increase,0
booster,shards_multiplier,1
booster,shards_next_cost,10
booster,shards_base_gain,0.01
booster,shards_cost_increase,0
card,alpha,cost=owned,cells=1.1,,
card,delta,cost=99,cells=1.5,mk2=1.1,
```

---
Gib mir die passende .csv bitte :-)

## Ende Prompt (bis hier kopieren)

Referenz im Projekt: `data/sample_game_state.csv` und Parser in `alpha_state_tool.py` → `load_game_state`.
