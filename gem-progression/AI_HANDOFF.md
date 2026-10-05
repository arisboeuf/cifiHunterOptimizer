# AI Handoff – CIFI Ouroboros Progression

## Ziel des Nutzers

Der Nutzer pflegt eine persönliche CIFI-Ouroboros-Progressionsübersicht. Die HTML-Datei soll fortlaufend aktualisiert werden und gleichzeitig als Progressions-Map und persönliches Upgrade-Dashboard dienen.

Sprache: Deutsch.
Priorität: Exakte Werte, keine geratenen Kosten oder Unlocks.
Aktualität: Der Nutzer möchte 2026-relevante Informationen.

## Datenquellen

1. Vom Nutzer hochgeladene Excel-Datei: `Kopie von SirRed's Gem Costings 0.018_.xlsx`
   - Grundlage für GU-Kostenformeln, Basispreise, Multiplikatoren und Planner-Unlock-Logik.
   - Achtung: Die Datei weist selbst darauf hin, dass SirRed v0.018 nicht mehr gepflegt wird und verweist auf eine neuere, von Adam gepflegte Version.
2. Öffentliche Referenz für Quality-Kosten und bekannte GU-Effekte:
   - https://cifi.game-vault.net/wiki/Ouroboros_Gems_Collection

## Aktueller Game-Stand des Nutzers

- Exodus Q2
  - Cells Multi Bonus: 2 / 999
  - Shards Multi Bonus: 1 / 999
- Temporality Q2
  - MP (Loop Mods) Bonus: 1 / 50
  - MP (Ticks) Bonus: 1 / 50
- Innovation Q1
  - Studies / Study Bonus: 0 / 50

## Nächste drei GU-Kosten vom aktuellen Stand

### Exodus Q2 – Cells
- Lv3: 1,44 OO
- Lv4: 1,728 OO
- Lv5: 2,0736 OO
- bekannter Effekt in HTML: ×4 Cells pro GU-Level

### Exodus Q2 – Shards
- Lv2: 3,6 OO
- Lv3: 6,48 OO
- Lv4: 11,664 OO
- bekannter Effekt in HTML: ×5 Shards pro GU-Level

### Temporality Q2 – MP (Loop Mods)
- Lv2: 2,25 OO
- Lv3: 3,375 OO
- Lv4: 5,0625 OO
- bekannter Effekt in HTML: +1% MP pro GU-Level je Loop Mod

### Temporality Q2 – MP (Ticks)
- Lv2: 6 OO
- Lv3: 24 OO
- Lv4: 96 OO
- bekannter Effekt in HTML: +0,05% MP pro GU-Level je Tick

### Innovation Q1 – Studies / Study
- Lv1: 3 OO
- Lv2: 6 OO
- Lv3: 12 OO
- bekannter Effekt: +2 Studies pro Study je GU-Level

## Nächstes freischaltbares Gem Quality

Aktuell: Attraction Q1
- Quality-Kosten: 30 OO
- Voraussetzung im verwendeten Planner: Temporality Q2 – erfüllt
- schaltet Borge Loot GU frei
- Borge-Loot-Effekt: ×1,07 pro GU-Level
- erste drei Borge-GU-Kosten nach dem Q1-Kauf:
  - Lv1: 5 OO
  - Lv2: 12,5 OO
  - Lv3: 31,25 OO
- Attraction Q1 + Borge Lv1 zusammen ab aktuellem Quality-Kaufpunkt: 35 OO
- Attraction Q1 + Borge Lv1+Lv2: 47,5 OO

Die HTML-Datei wurde zuletzt so erweitert, dass der „Nächstes Gem Quality“-Block diese drei GU-Folgekosten direkt anzeigt.

## Unlock-/Dependency-Kette aus SirRed v0.018

Frühe Hauptkette:

Exodus Q1 (1 OO)
→ Cells GU Lv1 (1 OO; Pflicht-Gate)
→ Exodus Q2 (5 OO)
→ Temporality Q1 (5 OO)
→ Innovation Q1 (12 OO)
→ Temporality Q2 (18 OO)
→ Attraction Q1 (30 OO)
→ Attraction Q2 (150 OO)
→ Creation Q1 (555 OO)
→ Attraction Q3 (1k OO)
→ Exodus Q3 (5k OO)

Danach verzweigt die Planner-Logik unter anderem zu:
- Creation Q2: 200k OO
- Power Q1: 150m OO

Die Progression ist daher nicht rein linear; frühe Abschnitte sind stark geführt, später gibt es Cross-Gem-Gates und Verzweigungen.

## Weitere bekannte Quality-Kosten, die im Chat verwendet wurden

- Exodus: Q1 1; Q2 5; Q3 5k; Q4 200k; Q5 95t OO
- Temporality: Q1 5; Q2 18; Q3 3b OO
- Innovation: Q1 12; Q2 10b; Q3 8t OO
- Attraction: Q1 30; Q2 150; Q3 1k; Q4 20t OO
- Creation: Q1 555; Q2 200k; Q3 400k; Q4 6t OO
- Power: Q1 150m; Q2 1t; Q3 1.2qa OO
- Evolution: Q1 50t OO

## HTML-Anforderungen des Nutzers

1. Unlock-Map mit Quality-Kosten und Voraussetzungen.
2. Erklärung, was Qualities und GUs bewirken, soweit bekannt.
3. Eigener Abschnitt „Mein aktueller Game-Stand“ unten in der HTML-Datei.
4. Jede GU-Zeile zeigt:
   - aktuelles Level / Max-Level
   - Kosten des nächsten GU-Levels
   - Kosten des übernächsten GU-Levels
   - Kosten des dritten folgenden GU-Levels
   - GU-Effekt
5. OO-Kosten werden per Heatmap visualisiert.
6. Es wird immer das nächste freischaltbare Gem Quality angezeigt.
7. Im „Nächstes Gem Quality“-Block werden zusätzlich die ersten drei GU-Kosten angezeigt, die nach dem Quality-Kauf verfügbar sind.
8. Bei jedem zukünftigen Status-Update sollen Level, Folgepreise und nächstes Gem Quality gemeinsam weitergeschoben werden.

## Heatmap im aktuellen HTML

CSS-Klassen:
- `hm-1` = sehr günstig / dunkelgrün
- `hm-2` = günstig / grün
- `hm-3` = mittel / gelblich
- `hm-4` = teuer / orange
- `hm-5` = sehr teuer / rot

Die Einordnung ist aktuell eine visuelle relative Skala für den gegenwärtigen Kaufhorizont, keine logarithmisch berechnete globale Skala.

## Wichtige Korrekturen aus dem Chat

Nicht folgende frühere Aussagen ungeprüft übernehmen:

- Früh wurde einmal behauptet, Exodus Q2 schalte direkt Ozzy frei. Das wurde später als nicht ausreichend belegt korrigiert.
- Früh wurde Attraction Q1 ein eigener ungefährer ×1,7-Hunter-Loot-Effekt zugeschrieben. Das wurde korrigiert. Der belegte Q1-bezogene Effekt ist das freigeschaltete Borge-Loot-GU mit ×1,07 pro GU-Level. ×1,7 entspricht ungefähr mehreren gestapelten GU-Leveln, nicht dem bloßen Q1-Kauf.

## Vorgehen bei zukünftigen Updates

Wenn der Nutzer z. B. schreibt:
`Cells jetzt 4, Shards 2, Innovation Studies 1`

Dann:
1. aktuelle Levels im HTML und `current_state.json` aktualisieren;
2. aus der Excel-Datei die Kosten der nächsten drei Einzel-GU-Level berechnen/auslesen;
3. Heatmap-Klassen passend aktualisieren;
4. prüfen, ob sich durch neue Qualities das „Nächste Gem Quality“ geändert hat;
5. falls ja, dessen Kosten, Voraussetzung, Effekt und erste drei GU-Kosten im oberen Statusblock aktualisieren;
6. keine Effekte ergänzen, wenn sie nicht in Excel oder aktueller Quelle belegt sind;
7. bei Widerspruch zwischen altem Planner und 2026-Quelle den Widerspruch sichtbar kennzeichnen.
