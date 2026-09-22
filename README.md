# Hunter Sim (Web)

Browser-App zum Simulieren und Optimieren von **Hunter**-Builds (CIFI). Aktuell: **Borge**; Ozzy/Knox folgen.

Gleicher Combat-Engine wie [cifi-tools](https://cifi-tools.com/borge) (`release.wasm` im Browser).

## Lokal starten

```text
python -m http.server 8080 --directory web
```

Oder mit Node: `npx --yes serve web -p 8080`

Dann http://localhost:8080 öffnen (kein `file://` — ES-Module + WASM brauchen HTTP).

## Deploy (GitHub Pages)

1. **Settings → Pages → Source: GitHub Actions**
2. Push auf `main`/`master` oder Workflow **Deploy Hunter Sim** manuell
3. Details: [`web/README.md`](web/README.md)

## Repo-Inhalt

| Pfad | Zweck |
|---|---|
| `web/` | Statische App (HTML/CSS/JS + WASM) |
| `web/js/hunters/borge/` | Borge-Modul (Kosten, Attr-Rules, WASM-Bridge) |
| `.github/workflows/` | Pages-Deploy |
| `docs/monster_stats/` | Monster-Stat-Tabellen (Doku) |
| `scripts/export_monster_stats.py` | CSV-Export neu erzeugen |
| `TODO.md` | Offene Arbeit (Ozzy/Knox-Module, …) |

## Lizenz

(Noch festzulegen.)
