# Hunter Sim

Browser app to **simulate** and **optimize** CIFI hunter builds — **Borge**, **Ozzy**, and **Knox**.

Combat evaluation uses the same public WASM engine as [cifi-tools](https://cifi-tools.com/). Everything else (UI, optimizer, packaging) lives in this repo.

---

## Credits & attribution

This project is **not** a from-scratch combat simulator. The fight math and balance data come from the online sim / community tools. **Thank you to the cifi-tools authors and maintainers** — without their WASM engine and hunter definitions, this app would not exist.

### Reused / derived (not our combat engine)

| Item | Source |
| --- | --- |
| `release.wasm` combat evaluation | [cifi-tools](https://cifi-tools.com/) (`EVALBORGE_WASM`, `EVALOZZY_WASM`, `EVALKNOX_WASM`) |
| Eval parameter order & WASM result getters | Same online sim / JS bundle |
| Talent, attribute, inscryption costs, caps, labels | Online sim hunter definitions |
| Attribute tree (dependencies, min path points) | Online sim `ATTRIBUTE_DEPENDENCIES` / `MIN_VALUE` |
| Relic / gem keys wired into WASM | Online sim mappings |
| Knox enemy formulas (CSV docs) | Online sim EnemyStatsDebug |
| Borge / Ozzy enemy formulas (CSV docs) | Earlier [hunter-sim](https://github.com/bhnn/hunter-sim) / community formulas |

If a run stages, dies, and loots correctly, that is **their** engine. We only call it from the browser.

See **[docs/mechanics.md](docs/mechanics.md)** for Crit / Multistrike / Charge, and **[docs/wasm-combat.md](docs/wasm-combat.md)** for WASM provenance and bridge limits.

### Built in this project

| Item | What it does |
| --- | --- |
| **Talent / attribute optimizer** | Monte-Carlo search over point budgets: random restarts, local neighbors, refine pass, multi-loop champions, Welch/z stage-mean comparison with loot as tie-break, optional Prioritize Timeless Mastery (max affordable TM first), apply/discard UI |
| **Next-Best-Opti** | Marginal +1 sweep over combat stats (auto after talent apply), or on-demand for inscryptions / relics+gems; Δ Ø-stage labels next to each row |
| Web UI | Hunter tabs (Borge → Ozzy → Knox), per-hunter themes, build editor, charts (stage distribution / odds / revives), budget bar, import/export, hide-maxed filter |
| Hunter modules | `web/js/hunters/{borge,ozzy,knox}/` plus shared WASM helpers |
| Persistence | Separate `localStorage` builds per hunter |
| Monster CSV docs | `docs/monster_stats/` + `scripts/export_monster_stats.py` |
| Deploy | GitHub Actions → GitHub Pages (static `web/` folder) |

The optimizer is the main added value beyond “run the same sim once”: it searches and compares builds against that shared WASM evaluation.

---

## Features

- Simulate Borge, Ozzy, Knox with the cifi-tools WASM combat engine
- Edit stats, inscryptions, relics/gems, talents, and attributes (tree rules enforced)
- Run N Monte-Carlo sims; see loot score, stage range, time, boss kill %, charts
- Optimize talent/attribute spend for average stage (loot on statistical ties)
- **Next-Best-Opti**: for the current build, show Δ Ø-stage of investing +1 in each combat stat (also runs after applying a talent/attribute optimize). Separate on-demand buttons on Inscryptions and Relics/Gems tabs (never auto-chained).
- Builds saved per hunter in the browser

---

## Quick start

Easiest in Cursor: run **`launch.py`** (▶ Run) or double-click **`launch.cmd`**.

```text
python launch.py
```

Opens **http://127.0.0.1:8080** (next free port if 8080 is taken). Stop with Ctrl+C.

Manual alternatives:

```text
python -m http.server 8080 --directory web
```

Or: `npx --yes serve web -p 8080`

HTTP required — ES modules + WASM do not work via `file://`.

---

## Deploy (GitHub Pages)

1. Repo **Settings → Pages → Source: GitHub Actions**
2. Push to `main` / `master`, or run workflow **Deploy Hunter Sim** manually
3. The workflow publishes `web/`. If `wasm/release.wasm` is missing in the repo, it downloads it from cifi-tools.com

---

## Repository layout

| Path | Purpose |
| --- | --- |
| `launch.py` / `launch.cmd` | One-click local server for `web/` |
| `web/` | Static app (HTML / CSS / JS + WASM) |
| `web/js/hunters/` | Per-hunter modules (costs, attr rules, WASM bridge) |
| `web/js/optimize.js` | Talent / attribute optimizer (our code) |
| `web/js/app.js` | UI, tabs, sim / optimize wiring |
| `.github/workflows/` | Pages deploy |
| `docs/mechanics.md` | Crit / Multistrike / Charge (per hunter) |
| `docs/wasm-combat.md` | WASM provenance, bridge vs engine, mechanics Q&A limits |
| `docs/monster_stats/` | Enemy / boss CSV documentation |
| `scripts/export_monster_stats.py` | Regenerate those CSVs |
| `TODO.md` | Open work / ideas |

Regenerate monster CSVs:

```text
python scripts/export_monster_stats.py
```

---

## Roadmap (see `TODO.md`)

- Optimizer target: maximize **bosses per hour** (not only avg stage / loot)
- Ultima talent (level 70) in the UI
- More overrides / gadgets / CM fields (closer to cifi-tools)

---

## License

Still TBD.

- Combat WASM and balance data derived from it belong to the respective online-sim / community authors.
- Our UI and optimizer code can take a separate license once one is chosen.
