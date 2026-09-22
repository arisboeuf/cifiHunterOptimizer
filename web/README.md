# Hunter Sim (Web)

Static hunter sim / optimizer for [cifi-tools](https://cifi-tools.com/borge).

Uses `wasm/release.wasm` in the browser — no backend. Hunter modules live under `js/hunters/` (currently `borge/`).

## Local preview

```bash
python -m http.server 8080 --directory web
# or: npx --yes serve web -p 8080
```

Open http://localhost:8080

## Deploy (GitHub Pages)

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. Push to `main`/`master` (or **Actions → Deploy Hunter Sim → Run workflow**)
3. Site URL appears on the workflow run / Pages settings

The workflow publishes the `web/` folder. If `wasm/release.wasm` is missing, it downloads from cifi-tools.com.
