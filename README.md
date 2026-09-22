# Borge Hunter Simulator (Web)

Browser-App zum Simulieren und Optimieren von **Borge**-Builds (CIFI).

Gleicher Combat-Engine wie [cifi-tools.com/borge](https://cifi-tools.com/borge) (`release.wasm` im Browser).

## Lokal starten

```text
python -m http.server 8080 --directory web
```

Dann http://localhost:8080 öffnen (kein `file://` — ES-Module + WASM brauchen HTTP).

## Deploy (GitHub Pages)

1. **Settings → Pages → Source: GitHub Actions**
2. Push auf `main`/`master` oder Workflow **Deploy Borge Web App** manuell
3. Details: [`web/README.md`](web/README.md)

## Repo-Inhalt

| Pfad | Zweck |
|---|---|
| `web/` | Statische App (HTML/CSS/JS + WASM) |
| `.github/workflows/` | Pages-Deploy |
| `docs/monster_stats/` | Monster-Stat-Tabellen (Doku) |
| `scripts/export_monster_stats.py` | CSV-Export neu erzeugen |
| `TODO.md` | Offene Arbeit (Ozzy/Knox-Module, …) |

## Lizenz

(Noch festzulegen.)
