# Generator-/Card-/Booster-Optimizer: Rechenmodell & GUI-Skript-Anleitung

## Ziel

Du willst ein Tool, in dem du eingibst:

```text
- verfügbare Gems
- geplante Prestige-Dauer, z. B. 2h, 4h, 8h
- aktueller Generator-State (MK1–MK5)
- aktuelle Booster-Kosten und Multiplikatoren (Gem-Booster-Upgrades)
- Card-Pool (fix; nur bei Spiel-Patch aktualisieren)
```

und das Tool soll berechnen:

```text
Welche Kaufsequenz gibt den höchsten erwarteten Output bis zum Prestige-Zeitpunkt?
```

Nicht nur:

```text
welcher Kauf ist einzeln gut?
```

sondern:

```text
welche Reihenfolge aus Boostern und Cards ist mit meinem Gem-Budget optimal?
```

### Was sich zwischen Prestiges ändert (und was nicht)

**Cards** sind im Spiel **immer gleich** (feste Kosten und Multiplikatoren). Die Card-Liste pflegst du **einmal** im Tool oder in einer statischen `cards.json` / `cards.csv`; pro Run musst du sie nicht neu erfassen.

**Pro Run wechselnd** (kommen aus Screenshots / Eingabe):

- verfügbare **Gems** und **Gem-Upgrades**, sofern du sie im Modell abbildest
- **MK-Booster**: Multiplikatoren, nächste Kosten, Kostensteigerung (alles, was sich über Booster-Gem-Käufe ändert)
- **Generator-Setup MK1–MK5**: Bestände, Kaufpreise, Produktion pro Tick / Rates

Der Optimizer kombiniert damit weiterhin **Booster- und Card-Käufe** in einer Sequenz — nur die **Card-Definitionen** sind keine freien Parameter pro Sitzung.

**Card-Käufe im Spiel:** Jede Card ist **höchstens einmal** kaufbar. Nach dem Kauf verschwindet sie aus dem Shop — der Optimizer muss jede Card also als **0/1-Entscheidung** behandeln und sie nach Kauf **nicht** erneut in die Kandidatenliste aufnehmen.

---

## Aktuelles Setup aus deinen Screenshots

### Runtime-Kontext

```text
Typische Prestige-Dauer: variabel, z. B. 2h / 4h / 8h
Tickdauer: 4.90 Sekunden
Aktueller Output: ca. 2e99 bis 4e99 Cells/Tick, je nach Screenshot-Zeitpunkt
Verfügbare Gems im Screenshot: 369
```

### Generator-Kette

```text
MK5 → MK4 → MK3 → MK2 → MK1 → Cells
```

**Rollen:** **MK1** ist der **Basisgenerator** und erzeugt **Cells**. **MK2–MK5** verstärken die Wirtschaft **nur indirekt**, indem sie **ausschließlich die Generatorstufe direkt darunter** pro Tick produzieren (MK2 liefert MK1, MK3 liefert MK2, usw.). Booster/Cards mit „MKk Gen Output“ beziehen sich auf den **Output dieser einen Stufe**; der Effekt auf Cells entsteht über diese Kette.

### Aktueller Generator-State, grob aus Screenshot

```text
MK1 owned: 8.69e60
MK2 owned: 1.34e40
MK3 owned: 63.48sx
MK4 owned: 15.26b
MK5 owned: 26
```

### Aktuelle Generator-Kaufpreise

```text
MK1: 5.65e100
MK2: 2.17e102
MK3: 1.13e102
MK4: 1.16e101
MK5: 1.02e102
```

---

## Aktuelle Booster

### Generator-Booster

| Booster | Aktueller Multi | Effekt pro Kauf | Nächste Kosten |
|---|---:|---:|---:|
| MK1 Booster | x1.17 | x1.02 MK1 Output | 18 Gems |
| MK2 Booster | x1.22 | x1.04 MK2 Output | 30 Gems |
| MK3 Booster | x1.26 | x1.06 MK3 Output | 42 Gems |
| MK4 Booster | x1.85 | x1.08 MK4 Output | 72 Gems |
| MK5 Booster | x2.59 | x1.10 MK5 Output | 100 Gems |

### Specials

| Booster | Aktueller Multi | Effekt pro Kauf | Nächste Kosten |
|---|---:|---:|---:|
| Cells Booster | x1.95 | x1.25 Cells gained | 203 Gems |
| Tokens Booster | +0.50 | +0.5 Tokens from Token Chests | 300 Gems |
| MP Booster | x1.14 | x1.07 MP gained | 320 Gems |
| Shards Booster | x1.07 | x1.07 Shards gained | 420 Gems |

Für reine Cell-Prestige-Optimierung sind primär relevant:

```text
MK1–MK5 Booster
Cells Booster
Cards mit Cells/Generator-Output
```

Tokens/MP/Shards sind nur relevant, wenn das Ziel nicht maximale Cells ist.

---

## Cards aus deinen Screenshots

### Fenix Card

```text
Kosten: 1500 Gems
Cells gained x1.16
MK4 Gen Output x1.50
MP gained x1.07
```

Für reine Cells ist relevant:

```text
Cells x1.16
MK4 x1.50
```

MP wird ignoriert, außer Ziel = MP-Farming.

---

### Delta Card

```text
Kosten: 1500 Gems
Cells gained x2.30
MK2 Gen Output x1.14
MK3 Gen Output x1.14
```

---

### Epsilon Card

```text
Kosten: 1500 Gems
MK1 Gen Output x1.52
MK2 Gen Output x1.52
MK4 Gen Output x1.44
```

---

### Gamma Card

```text
Kosten: 2000 Gems
Cells gained x2.40
MK3 Gen Output x1.34
MK5 Gen Output x1.34
```

Sehr interessant für längere Runs, weil sie gleichzeitig:

```text
- final Cells bufft
- MK3 bufft
- MK5 bufft
```

---

### Helion Card

```text
Kosten: 2000 Gems
MK1 Gen Output x1.68
MK2 Gen Output x1.68
MP gained x1.13
```

Für Cells nur:

```text
MK1 x1.68
MK2 x1.68
```

---

### Ixion Card

```text
Kosten: 2000 Gems
MK4 Gen Output x1.64
MK5 Gen Output x1.52
MP gained x1.16
```

Für lange Runs potenziell sehr stark, weil sie die obersten aktiven Chain-Stufen bufft:

```text
MK5 → MK4
```

---

### Juno Card

```text
Kosten: 2500 Gems
Cells gained x1.65
Shards gained x1.45
MP gained x1.25
```

Für reine Cells:

```text
Cells x1.65
```

Für Hybrid-Ziele eventuell gut.

---

### Lyra Card

```text
Kosten: 2500 Gems
MK2 Gen Output x2.16
MK5 Gen Output x2.12
Shards gained x1.50
```

Für lange Runs und Shards-Hybrid sehr interessant:

```text
MK2 x2.16
MK5 x2.12
```

---

## Warum “statisches Produkt” nicht reicht

Ein simpler Vergleich wäre:

```text
Delta = 2.30 * 1.14 * 1.14 = x2.99
Epsilon = 1.52 * 1.52 * 1.44 = x3.33
Gamma = 2.40 * 1.34 * 1.34 = x4.31
Ixion = 1.64 * 1.52 = x2.49
Lyra = 2.16 * 2.12 = x4.58
```

Aber das ist nicht exakt, weil ein MK5-Bonus nicht sofort genauso wirkt wie ein Cells-Bonus.

Der Unterschied:

```text
Cells gained = sofortiger finaler Multiplikator
MK1 = sehr nah an finaler Produktion
MK2 = erzeugt MK1, wirkt mit leichter Verzögerung
MK3 = erzeugt MK2, wirkt stärker langfristig
MK4 = erzeugt MK3, wirkt noch langfristiger
MK5 = erzeugt MK4, wirkt am stärksten langfristig, aber mit größter Verzögerung
```

Darum hängt die Bewertung stark von der Prestige-Dauer ab.

---

## Mathematisches Modell

### State-Variablen

```text
G1 = Anzahl MK1
G2 = Anzahl MK2
G3 = Anzahl MK3
G4 = Anzahl MK4
G5 = Anzahl MK5
C  = Cells
```

### Produktionsraten pro Tick

```text
G1 produziert Cells
G2 produziert G1
G3 produziert G2
G4 produziert G3
G5 produziert G4
```

Allgemein:

```text
dC/dt  = r1 * G1 * cells_multiplier
dG1/dt = r2 * G2 * mk2_multiplier
dG2/dt = r3 * G3 * mk3_multiplier
dG3/dt = r4 * G4 * mk4_multiplier
dG4/dt = r5 * G5 * mk5_multiplier
```

In einem diskreten Tick-Modell:

```text
C  += r1 * G1
G1 += r2 * G2
G2 += r3 * G3
G3 += r4 * G4
G4 += r5 * G5
```

Das wiederholt man für:

```text
ticks = prestige_seconds / tick_seconds
```

Beispiel:

```text
2h bei 4.9s Tick = 7200 / 4.9 ≈ 1469 Ticks
8h bei 4.9s Tick = 28800 / 4.9 ≈ 5878 Ticks
```

---

## Wie ein Kauf bewertet wird

Für jeden möglichen Kauf simulierst du:

```text
Output ohne Kauf nach T Stunden
Output mit Kauf nach T Stunden
```

Dann:

```text
Wert = Output_mit_Kauf / Output_ohne_Kauf
Effizienz = ln(Wert) / Gemkosten
```

Warum `ln`?

Weil Multiplikatoren sich multiplizieren, aber Log-Werte addieren:

```text
ln(a * b) = ln(a) + ln(b)
```

Das macht eine Kaufsequenz sauber vergleichbar.

---

## Optimierungsproblem

Du hast:

```text
Budget = verfügbare Gems
Items = Booster und Cards
Jedes Item hat:
- Kosten
- Effekt
- eventuell steigende Folgekosten (typisch Booster)
- Cards: pro Card-ID maximal ein Kauf (danach ausgeschlossen)
```

Gesucht:

```text
beste Kaufsequenz unter Budget
```

Das ist wie ein dynamisches Knapsack-/Search-Problem, aber mit Zustandsänderungen, weil Boosterpreise steigen und **Card-Käufe nicht wiederholbar** sind.

---

## Praktischer Algorithmus für Cursor AI

### Variante 1: Greedy, schnell und gut genug

Wiederhole, solange Gems übrig sind:

```text
1. Für jeden aktuell kaufbaren Booster/Card:
   a) simuliere Run ohne Kauf
   b) simuliere Run mit Kauf
   c) berechne score = ln(output_with / output_without) / cost

2. Kaufe das Item mit bestem score

3. Ziehe Kosten von Gems ab

4. Aktualisiere:
   - Multiplikator
   - Booster-Level
   - nächste Kosten
   - bei **Card-Kauf:** diese Card dauerhaft aus den Kandidaten streichen

5. Wiederhole
```

Vorteil:

```text
schnell
einfach
gut für GUI
```

Nachteil:

```text
nicht garantiert global optimal
```

---

### Variante 2: Beam Search, besser

Greedy kann falsch liegen, wenn ein teurer Kauf später stark skaliert. Besser:

```text
Beam Search mit Top-N Pfaden
```

Ablauf:

```text
1. Starte mit leerer Kaufsequenz
2. Erzeuge alle möglichen nächsten Käufe (nur Booster, die bezahlbar sind, und Cards, die noch nicht gekauft wurden)
3. Behalte nur die besten z. B. 50 Sequenzen
4. Wiederhole bis kein Kauf mehr möglich
5. Wähle Sequenz mit höchstem simuliertem Output
```

Das ist für dein Spiel wahrscheinlich ideal.

---

## Prompt für Cursor AI

Du kannst Cursor ungefähr so anweisen:

```text
Baue mir ein Python-Programm mit GUI zur Optimierung meiner Gem-Käufe in einem Idle-Game.

Das Spiel hat eine Generator-Kette:

MK5 → MK4 → MK3 → MK2 → MK1 → Cells

Jede Stufe produziert pro Tick die darunterliegende Stufe:
- MK1 produziert Cells
- MK2 produziert MK1
- MK3 produziert MK2
- MK4 produziert MK3
- MK5 produziert MK4

Die GUI soll Eingabefelder haben für:
- verfügbare Gems
- Prestige-Dauer in Stunden
- Tickdauer in Sekunden
- Startwert Cells
- aktueller Cells/Tick-Wert
- Anzahl MK1 bis MK5
- Produktionsrate pro Generatorstufe
- aktuelle Booster-Multiplikatoren
- aktuelle Booster-Kosten
- Kostensteigerung je Booster-Kauf
- Liste verfügbarer Cards mit Kosten und Multiplikatoren

Das Programm soll berechnen, welche Kaufsequenz den höchsten Cells-Output nach der angegebenen Prestige-Dauer bringt.

Implementiere zwei Optimierer:
1. Greedy:
   - simuliere jeden möglichen nächsten Kauf
   - berechne score = ln(output_with_purchase / output_without_purchase) / cost
   - kaufe den besten Score
   - wiederhole bis Budget aufgebraucht ist

2. Beam Search:
   - behalte die besten N Sequenzen, z. B. beam_width=50
   - erweitere jede Sequenz mit allen möglichen Käufen
   - simuliere Output nach Prestige-Dauer
   - wähle die Sequenz mit dem höchsten Output

Die Simulation soll diskret pro Tick laufen:
C += r1 * G1 * cells_multiplier
G1 += r2 * G2 * mk2_multiplier
G2 += r3 * G3 * mk3_multiplier
G3 += r4 * G4 * mk4_multiplier
G4 += r5 * G5 * mk5_multiplier

Die GUI soll ausgeben:
- beste Kaufsequenz
- Gesamtkosten
- erwarteter Output nach Prestige-Dauer
- Multiplikator gegenüber ohne Käufe
- Tabelle aller Einzelkäufe mit score
- optional Plot: Output über Zeit für “ohne Käufe”, “Greedy”, “Beam Search”

Nutze Python mit tkinter für die GUI und matplotlib für Plots.
Speichere Konfigurationen als JSON.
```

---

## Datenstruktur-Vorschlag für Python

```python
state = {
    "gems": 369,
    "prestige_hours": 4,
    "tick_seconds": 4.9,
    "cells": 0.0,
    "generators": {
        "MK1": 8.69e60,
        "MK2": 1.34e40,
        "MK3": 6.348e22,  # falls sx = 1e21, bitte im Tool konfigurierbar machen
        "MK4": 15.26e9,
        "MK5": 26,
    },
    "rates": {
        "MK1_to_cells": None,
        "MK2_to_MK1": None,
        "MK3_to_MK2": None,
        "MK4_to_MK3": None,
        "MK5_to_MK4": 47.23e6,
    },
    "multipliers": {
        "cells": 1.95,
        "MK1": 1.17,
        "MK2": 1.22,
        "MK3": 1.26,
        "MK4": 1.85,
        "MK5": 2.59,
    }
}
```

Booster:

```python
boosters = [
    {
        "name": "MK1 Booster",
        "target": "MK1",
        "multiplier_per_buy": 1.02,
        "cost": 18,
        "cost_increase": 0
    },
    {
        "name": "MK2 Booster",
        "target": "MK2",
        "multiplier_per_buy": 1.04,
        "cost": 30,
        "cost_increase": 0
    },
    {
        "name": "MK3 Booster",
        "target": "MK3",
        "multiplier_per_buy": 1.06,
        "cost": 42,
        "cost_increase": 0
    },
    {
        "name": "MK4 Booster",
        "target": "MK4",
        "multiplier_per_buy": 1.08,
        "cost": 72,
        "cost_increase": 4
    },
    {
        "name": "MK5 Booster",
        "target": "MK5",
        "multiplier_per_buy": 1.10,
        "cost": 100,
        "cost_increase": 5
    },
    {
        "name": "Cells Booster",
        "target": "cells",
        "multiplier_per_buy": 1.25,
        "cost": 203,
        "cost_increase": 1
    }
]
```

Cards:

```python
cards = [
    {
        "name": "Fenix Card",
        "cost": 1500,
        "effects": {
            "cells": 1.16,
            "MK4": 1.50,
            "MP": 1.07
        }
    },
    {
        "name": "Delta Card",
        "cost": 1500,
        "effects": {
            "cells": 2.30,
            "MK2": 1.14,
            "MK3": 1.14
        }
    },
    {
        "name": "Epsilon Card",
        "cost": 1500,
        "effects": {
            "MK1": 1.52,
            "MK2": 1.52,
            "MK4": 1.44
        }
    },
    {
        "name": "Gamma Card",
        "cost": 2000,
        "effects": {
            "cells": 2.40,
            "MK3": 1.34,
            "MK5": 1.34
        }
    },
    {
        "name": "Helion Card",
        "cost": 2000,
        "effects": {
            "MK1": 1.68,
            "MK2": 1.68,
            "MP": 1.13
        }
    },
    {
        "name": "Ixion Card",
        "cost": 2000,
        "effects": {
            "MK4": 1.64,
            "MK5": 1.52,
            "MP": 1.16
        }
    },
    {
        "name": "Juno Card",
        "cost": 2500,
        "effects": {
            "cells": 1.65,
            "shards": 1.45,
            "MP": 1.25
        }
    },
    {
        "name": "Lyra Card",
        "cost": 2500,
        "effects": {
            "MK2": 2.16,
            "MK5": 2.12,
            "shards": 1.50
        }
    }
]
```

---

## Wichtig: Was das Tool von dir braucht

Damit die Berechnung exakt wird, brauchst du im Tool klare Eingaben für:

```text
1. Suffix-System
   Was bedeutet sx, sp, qu, d usw. exakt?

2. Current State
   MK1–MK5 owned

3. Produktion pro Generator
   Nicht nur Gesamtoutput der Stufe, sondern ideal:
   Output pro einzelner Generator oder Gesamtoutput und Owned

4. Tickdauer

5. Prestige-Dauer

6. Aktuelle Booster-Level, Multiplikatoren, Kosten und Kostensteigerung

7. Cards mit Kosten und Effekten

8. Zielmetrik:
   - Cells nach T Stunden
   - Shards
   - MP
   - Hybrid Score
```

---

## Empfohlene GUI-Felder

### Tab 1: Run Settings

```text
Gems available
Prestige duration hours
Tick duration seconds
Optimization target: Cells / Shards / MP / Hybrid
Beam width
```

### Tab 2: Generators

```text
MK1 owned
MK2 owned
MK3 owned
MK4 owned
MK5 owned

MK1 output to Cells per tick
MK2 output to MK1 per tick
MK3 output to MK2 per tick
MK4 output to MK3 per tick
MK5 output to MK4 per tick
```

### Tab 3: Boosters

```text
Name
Target
Current multiplier
Multiplier per buy
Current cost
Cost increase per buy
Max level
Enabled yes/no
```

### Tab 4: Cards

```text
Name
Cost
Effect 1 target + multiplier
Effect 2 target + multiplier
Effect 3 target + multiplier
Enabled yes/no
Already purchased yes/no   (im Spiel: jede Card höchstens einmal; gekauft = nicht mehr wählbar)
```

### Tab 5: Results

```text
Best sequence
Total spent
Remaining gems
Expected output
Multiplier vs baseline
Table of purchase steps
Plot output over time
```

---

## Aktuelle qualitative Einschätzung

Mit deinen aktuellen sichtbaren Booster-Kosten:

```text
MK3 Booster: 42 Gems for x1.06
MK2 Booster: 30 Gems for x1.04
MK4 Booster: 72 Gems for x1.08
MK5 Booster: 100 Gems for x1.10
Cells Booster: 203 Gems for x1.25
```

sind für kurze bis mittlere Runs weiterhin sehr attraktiv:

```text
MK3 Booster
MK2 Booster
Cells Booster
MK4 Booster
```

Für längere Runs werden wichtiger:

```text
MK5 Booster
Ixion Card
Lyra Card
Gamma Card
```

Für 2–4h Runs sind Cards mit direktem Cells-Multi oft stabiler:

```text
Delta Card
Gamma Card
Fenix Card
```

Für 8h+ Runs können top-chain Cards besser werden:

```text
Ixion Card
Lyra Card
Gamma Card
```

Aber die exakte Antwort sollte das Skript per Simulation ausrechnen.
