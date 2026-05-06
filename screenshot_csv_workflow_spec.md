# Screenshot → CSV Workflow Specification

## Ziel

Der Workflow soll so funktionieren:

1. Du sendest Screenshots aus dem Spiel.
2. ChatGPT liest die relevanten Werte aus.
3. Daraus wird automatisch eine strukturierte CSV erzeugt.
4. Dein Python-Tool / GUI liest die CSV ein.
5. Das Tool berechnet:

   * beste Booster
   * beste Cards
   * optimale Kaufreihenfolge
   * ROI pro Gem
   * optimale Strategie für:

     * 2h Prestige
     * 4h Prestige
     * 8h Prestige
     * usw.

---

## Was fest vs. variabel ist

**Fest (spielweit gleich):** alle **Cards** — Kosten und Multiplikatoren ändern sich nicht zwischen deinen Runs. Im Tool reicht eine **statische `cards.csv`** (oder eingebaute Tabelle); du musst den Cards-Screen **nicht** bei jedem Export neu auswerten, höchstens nach einem **Balance-Patch** des Spiels.

**Variabel pro Run / Screenshot-Export:**

- **Gems** und sonstige **Gem-Upgrades**, falls du sie modellierst
- **MK-Booster** (Cells/MK1–MK5 usw.): Multiplikatoren, nächste Kosten, Level, Kostensteigerung — alles, was sich über Booster-**Gem**-Käufe ändert
- **Generator-Setup MK1–MK5**: owned, Kaufpreise, Produktion pro Tick

Kurz: Screenshots liefern vor allem **State + Booster**; **Cards** sind Konfiguration, kein täglicher OCR-Input.

---

# Benötigte Screenshots

## 1. Generator Screen

Pflicht.

Muss enthalten:

* current cells/tick
* tick duration
* MK1 owned + cost (mit in den Export aufnehmen)
* MK2 owned + cost
* MK3 owned + cost
* MK4 owned + cost
* MK5 owned + cost
* Produktionsraten jeder Stufe

Beispiel:

* "47.23m MK4 GENS PER TICK"
* "1.02e102"

---

## 2. Booster Screen

Pflicht.

Muss enthalten:

* aktueller Multiplikator
* aktueller Kaufpreis
* Booster-Level

Für:

* MK1 Booster
* MK2 Booster
* MK3 Booster
* MK4 Booster
* MK5 Booster
* Cells Booster
* ggf. Shards Booster

---

## 3. Cards Screen

**Einmalig** (oder nach Spiel-Update): ja — um `cards.csv` zu befüllen oder zu prüfen.

**Bei jedem typischen Run:** nein — Card-Stats sind **konstant**; das Tool nutzt die gespeicherte `cards.csv`.

Wenn du doch einen Screenshot hast, soll er enthalten:

* alle Cards
* Kosten
* Multiplikatoren

Beispiel:

* Cells x2.4
* MK5 x1.34
* MK4 x1.64

---

## 4. Prestige/Shard Infos

Optional aber hilfreich.

Für:

* Shards/hour
* MP/hour
* typische Prestigedauer
* Tokens
* Chest gain

---

# CSV Struktur

Die CSV besteht aus mehreren Tabellen.

---

# generators.csv

```csv
generator,owned,cost,production,target
mk1,8.69e60,5.65e100,<cells_per_tick>,cells
mk2,1.34e40,2.17e102,9.59e58,mk1
mk3,6.348e76,1.13e102,1.28e38,mk2
mk4,1.526e10,1.16e101,430.8e15,mk3
mk5,26,1.02e102,47.23e6,mk4
```

Erklärung:

* owned → wie viele existieren
* cost → aktueller Kaufpreis
* production → Produktion pro Tick
* target → welche Stufe gebufft wird (`mk1` → Ziel `cells`)

Platzhalter `<cells_per_tick>`: aus UI oder aus Kette ableiten, je nachdem was du im Screenshot hast.

---

# boosters.csv

```csv
booster,current_multiplier,next_cost,base_gain,cost_increase
mk1,1.17,18,0.02,0
mk2,1.22,30,0.04,0
mk3,1.26,42,0.06,0
mk4,1.85,72,0.08,4
mk5,2.59,100,0.10,5
cells,1.95,203,0.25,1
```

Erklärung:

* current_multiplier → aktueller Gesamtwert
* next_cost → nächster Kaufpreis
* base_gain → Bonus pro Kauf
* cost_increase → linearer Kostenanstieg

---

# cards.csv

```csv
card,cost,cells,mk1,mk2,mk3,mk4,mk5,shards,mp
gamma,2000,2.4,1,1,1.34,1,1.34,1,1
ixion,2000,1,1,1,1,1.64,1.52,1,1.16
lyra,2500,1,1,2.16,1,1,2.12,1.5,1
```

Regel:

* nicht vorhandene Werte = 1.0

---

# config.csv

```csv
parameter,value
prestige_hours,4
tick_seconds,4.9
available_gems,1500
optimization_target,cells
```

Mögliche optimization_target:

* cells
* shards
* mp
* hybrid

---

# Optimierungslogik

Das Tool simuliert jede mögliche Kaufentscheidung.

Für jeden Kauf:

1. Neuer Multiplikator berechnen
2. Effekt durch gesamte Generatorchain propagieren
3. Neue final cells/tick berechnen
4. Output über Prestigedauer integrieren
5. ROI/Gem bestimmen

---

# Generator-Chain-Modell

Beispiel:

MK5 → bufft MK4
MK4 → bufft MK3
MK3 → bufft MK2
MK2 → bufft MK1
MK1 → erzeugt Cells

Dadurch propagiert ein MK5 Buff exponentiell durch die gesamte Kette.

---

# Wichtig: Multiplikative Skalierung

Alle Booster stacken multiplikativ:

```text
MK4 Booster Level 8:
1.08^8 = 1.8509
```

NICHT linear:

```text
1 + 8*0.08
```

Cards stacken ebenfalls multiplikativ.

---

# Ziel des Python-Tools

Das GUI soll:

* Screenshots importieren
* CSV automatisch generieren
* optimale Kaufsequenz berechnen
* verschiedene Prestigezeiten vergleichen
* Break-even von Cards berechnen
* ROI Graphen anzeigen
* Booster vs Cards simulieren

---

# Geplante GUI Features

## Inputs

* verfügbare Gems
* Prestigedauer
* Zielresource

## Outputs

* beste Kaufreihenfolge
* projected cells/hour
* projected shards/hour
* strongest generator layer
* ROI Charts
* Break-even Zeiten
* Card Tierlist
* Booster Tierlist

---

# Langfristige Erweiterungen

Später möglich:

* OCR direkt aus Screenshots
* automatische Screenshot-Erkennung
* Run-History
* ML-basierte Kaufstrategien
* Auto-Prestige Empfehlungen
* Sankey Flow Visualisierung
* Heatmaps für Generator-Effizienz
