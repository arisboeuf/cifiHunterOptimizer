# TODO — Hunter Sim (Web)

## Hunter-Module

- [x] **Borge-Modul** — `web/js/hunters/borge/`
- [x] **Ozzy-Modul** — `web/js/hunters/ozzy/` + `EVALOZZY_WASM`
- [x] **Knox-Modul** — `web/js/hunters/knox/` + `EVALKNOX_WASM`
- [x] **Hunter-Auswahl** — Tabs Borge → Ozzy → Knox, getrennte `localStorage`-Keys, Theme-Farben

### Optional / später

- [x] **Boss Maximizer (separat)** — eigener Button „Maximize Boss/day“ neben „Push Average Stage“; Boss-Checkboxen 100/200/300; Ziel: clears past selected bosses × runs/day; nur ein Opti gleichzeitig (anderer Button disabled)
- [x] **Push Material/XP (separat)** — dritter Opti-Button; Ziel: WASM `lootScore` (loot/min = mats/XP-Farm)
- [ ] **Mat-Drops pro Stage als CSV** — Base-Loot (mat1/2/3 + XP) je Stage für Borge/Ozzy/Knox dokumentieren (`docs/…`), Formeln aus cifi-tools / Kylenator-Sheet (Knox teils in `evalknox.js`: `1.074^stage`, Drop-Tabellen)
- [ ] Ultima-Talent (Lvl 70) in UI
- [ ] Mehr Overrides / Gadgets / CM-Felder wie auf cifi-tools
