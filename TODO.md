# TODO — Web-App

## Hunter-Module

Aktuell nur **Borge**. Ozzy und Knox sollen eigene Module werden (nicht alles in einem monolithischen `app.js`).

### Geplant

- [ ] **Ozzy-Modul** — UI + `EVALOZZY_WASM` + eigene Talents/Attributes/Inscryptions/Kosten
- [ ] **Knox-Modul** — UI + `EVALKNOX_WASM` + eigene Talents/Attributes/Inscryptions/Kosten
- [ ] **Hunter-Auswahl / Routing** — Umschalten Borge ↔ Ozzy ↔ Knox (eigene Seiten oder Tabs, getrennte `localStorage`-Keys)

### Hinweise

- WASM-Exports sind bereits in `release.wasm`: `EVALOZZY_WASM`, `EVALKNOX_WASM` (+ Progress/Death/Stats-Getter).
- Monster-Stats: Ozzy-Formeln in `docs/monster_stats/`; Knox ggf. noch ergänzen, falls WASM/Online abweichen.
- Borge als Referenz-Modul unter `web/js/` belassen und Ozzy/Knox analog auslagern (z. B. `web/js/hunters/borge/`, `ozzy/`, `knox/`).
