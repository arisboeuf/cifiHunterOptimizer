# CIFI

Idle-Game für **Android**.

Dieses Repository enthält Hilfswerkzeuge und Projektdateien.

## Borge Simulator

Lokaler Twin von [cifi-tools.com/borge](https://cifi-tools.com/borge): Build eingeben, N Combat-Sims laufen lassen, Stage-Distribution / Odds / Revives / Build-Stats ansehen.

**Punktbudget aus Level (Spielregel):**

- Talents = `Level` (z. B. Lvl 14 → 14 Talent-Punkte)
- Attributes = `Level × 3` Path Points (z. B. Lvl 14 → 42)

```text
pip install -r requirements-borge.txt
python borge_sim_tool.py
python borge_sim_tool.py --cli builds/borge_lvl14_example.yaml 200
```

Combat-Engine: vendored [hunter-sim](https://github.com/bhnn/hunter-sim) unter `vendor/hunter_sim/` (inkl. Soul of Hermes / Minotaur / Athena).

Ein Talent/Attribute-Optimizer kann später auf `borge_sim.eval` aufsetzen.

## Entwicklung (Android-App)

Nach dem Anlegen des Android-Studio-Projekts (oder dem Klonen mit vorhandenem `app/`-Modul):

1. Projekt in Android Studio öffnen
2. Gradle-Sync ausführen
3. Auf Emulator oder Gerät bauen und starten

## Lizenz

(Noch festzulegen.)
