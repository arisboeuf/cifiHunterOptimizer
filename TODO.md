# TODO — Hunter Sim (Web)

## Hunter-Module

Aktuell nur **Borge** unter `web/js/hunters/borge/`. Ozzy und Knox sollen eigene Module werden.

### Geplant

- [ ] **Ozzy-Modul** — `web/js/hunters/ozzy/` + `EVALOZZY_WASM` + eigene Talents/Attributes/Inscryptions/Kosten
- [ ] **Knox-Modul** — `web/js/hunters/knox/` + `EVALKNOX_WASM` + eigene Talents/Attributes/Inscryptions/Kosten
- [ ] **Hunter-Auswahl / Routing** — Umschalten Borge ↔ Ozzy ↔ Knox (Tabs/Seiten, getrennte `localStorage`-Keys)

### Hinweise

- WASM-Exports sind bereits in `release.wasm`: `EVALOZZY_WASM`, `EVALKNOX_WASM` (+ Progress/Death/Stats-Getter).
- Monster-Stats: Ozzy-Formeln in `docs/monster_stats/`; Knox ggf. noch ergänzen, falls WASM/Online abweichen.
- Shared UI: `web/js/app.js`, `build.js`, `optimize.js`, `charts.js`.
