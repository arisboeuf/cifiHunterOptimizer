# cifi-toolkit Generate / Optimise vs our pushers

Notes from inspecting [cifi-toolkit Borge](https://www.cifi-toolkit.com/borge) (Oct 2026) against this repo's talent/attribute screens. Their combat eval is the same public WASM family we call; the search UI and scoring are theirs. Bundle clues come from `BuildOptimiseModal` / worker pool in their shipped JS (asset hash changes over time).

## Two entry points, one modal

| Entry | Where | What it says |
| --- | --- | --- |
| **Generate** | Top bar on the hunter page | *New build, from scratch* — best talents/attributes at a **target level**, using current stats, gems, and overrides. Adds a **new** build to the category. |
| **Optimise build** | Per-build toolbar (wand icon; title `Optimise build`) | *Searches the talents and attributes at the target level for the best split.* Stats/gems/overrides stay. **Does not change** the open build; a better one is **added next to it**. |

Same dialog after either click: pick **target level**, then **Optimise for Boss Kill** or **Optimise for Loot**. Needs gems set first (otherwise the objective buttons stay disabled). Warning copy: millions of sims on all CPU cores for up to **3 minutes** (`fz = 180` in the modal).

## Their two objectives

### Boss Kill

UI: *The most bosses killed per run. With that boss out of reach, it pushes your max stage.*

Search score is **not** plain Boss Kill % or bosses/day. From their `OB` helper (stage histogram + boss HP):

1. Map each ending stage to “bosses cleared + progress”:  
   `floor((stage - 1) / 100) + 0.25 × fraction into the next 100`.
2. Blend in remaining boss HP when runs die on a boss (so near-kills beat never reaching).
3. Add a term from the **furthest-of-10** style max-stage estimator (`PB`), so pushing max stage still moves the score when clears are zero.
4. Return `{ score, se }` — mean plus a **standard-error** estimate from the histogram.

Improvement blurbs after a run (in order): more bosses killed per run → max stage (furthest of 10) → average stage toward the next boss → more damage to the next boss.

Closest cousins in this app: **Maximize Boss/day** (once clears exist) and **First Bosskill Finder** / **Push Average Stage** (when the boss is still out of reach). They fold those ladders into **one** objective with one composite score.

### Loot

UI: *Highest Loot Score, so the most loot per day. Gives up survivability where a boss can't be beaten anyway, so runs end and restart sooner.*

Score is WASM **`lootPerMin`** (their “Loot Score”), with a simple SE proxy (`~0.6 × |score| / √n`). Optional loot multiplier can scale both score and SE. That matches the *intent* of our **Push Material/XP** (same `lootScore` / loot-per-minute idea), including the trade of tankiness for shorter runs.

## How their search works (high level)

Not a fixed factorial grid. Rough shape from the minified optimiser:

- **Web Worker pool** sized to `navigator.hardwareConcurrency` — parallel WASM evals.
- **Time-boxed** local search (~180s): neighbor moves on talent/attribute point splits, optional **construct** build-up, **kick** restarts, patience / refine caps.
- Candidate moves must beat **noise**: gain &gt; `z × se` and &gt; `minGain ×` scale of the baseline. Final accept uses a stricter `finalZ` / settle passes (`improved` only if that holds).
- Phases show in the UI as Search → converging / final confirm; can **stop early**.
- Outcome: new build card, or *Nothing beat your build … by more than the simulation noise*.

So: **stochastic hill-climb + statistical gate**, wall-clock budget, multi-core. Point moves are free-form under tree rules, not a pre-built 0/high matrix.

## How our pushers work (reminder)

Documented in [boss-screen.md](boss-screen.md). Short version:

| Button | Score | Search |
| --- | --- | --- |
| **Push Average Stage** | Mean stage (loot breaks ties) | 3-phase **funnel** at **current** level |
| **Push Material/XP** | Loot/min | Same funnel |
| **Maximize Boss/day** | Clears × runs/day for checked boss(es) | Same funnel |
| **First Bosskill Finder** | Remaining boss HP closeness; confirm by clears | Same funnel shape; Lucky Loot & Timeless pinned at 0 |

Funnel properties:

- Screen 1 coarse 0/high factorial → screen 2 locks clear gains → refinement steps cheap levels + filler split.
- Call Me Lucky Loot and Timeless Mastery are **free factors** on the three push buttons (off is legal; not forced).
- Fixed sims per row (~50–100), order-of **thousands** of builds total — not “millions of sims” wall-clock.
- Confirm: re-sim winner vs current at **4,000** sims; **Apply** writes onto the open hunter (no automatic sibling build).
- Compares are **raw** means while on this WASM path (no SE significance test); see [wasm-combat.md](wasm-combat.md).
- Main-thread eval in our UI (no worker pool for the funnel today).

## Side-by-side

| | **cifi-toolkit Generate / Optimise** | **Our pushers (+ First Bosskill Finder)** |
| --- | --- | --- |
| Entry | From scratch **or** from existing build | Always starts from the open build’s budgets / trees |
| Output | New build beside the old one | Optional **Apply** overwrites talents/attributes |
| Level | User **target level** (can differ from the card) | **Current** hunter level only |
| Objectives | Boss Kill (composite) · Loot (`lootPerMin`) | Stage · Loot/min · Bosses/day · (separate) Boss HP |
| Boss out of reach | Same Boss Kill mode falls back through max/avg stage / boss damage | Use Stage or First Bosskill Finder; Bosses/day stays flat at 0 |
| Search shape | Local search + kicks, time limit ~3 min | Designed factorial funnel, ~minutes but budgeted by grid size |
| Parallelism | All CPU cores via workers | Single-threaded WASM calls from the page |
| Accept rule | Gain must beat **simulation noise** (SE × z) | Incumbent keep on screens; apply if confirm mean is better |
| Lucky Loot / Timeless | Not called out as pinned; search moves the full split | Push: free factors. First boss: both forced 0 |
| Factor charts | Search/confirm progress UI | Screen charts of which skills moved the score |
| Gems / stats | Fixed; only talent/attr searched | Same idea: left column stays; only talent/attr modal spend |

## Practical takeaway

- **Loot:** Same problem statement as **Push Material/XP**. Difference is search (noise-gated walk vs funnel) and packaging (sibling build vs apply).
- **Boss Kill:** One ladder that covers “not clearing yet → clearing.” We split that into **First Bosskill Finder** (HP), **Push Average Stage** (progress), and **Maximize Boss/day** (farm rate). Their composite score is closer to “always press Boss Kill” than to any single button here.
- **Generate from scratch** has no direct twin; our screens always edit the current hunter’s point spend at the current level.
- Their **noise gate** is the main methodological gap vs our raw 4k confirm — worth remembering when builds disagree.

## Algorithm judgment (Boss Kill vs our boss tools)

### Is it a different approach?

**Yes — different search, different score, overlapping goal.**

| Layer | cifi-toolkit Boss Kill | Ours |
| --- | --- | --- |
| Search | Time-boxed local search + kicks, multi-core, SE noise gate | Fixed factorial funnel (coarse → fine → corner), main thread |
| Score | One **composite** over the stage histogram | Separate buttons with separate scalars |
| Accept | Gain must beat `z × se` (and minGain) | Raw mean keep / 4k confirm mean |

Their Boss Kill score is **not** “minimize Boss HP” and **not** “maximize bosses/day”:

- Primary intent (UI): **bosses killed per run** (clear fraction), not clears × runs/day.
- Soft ladder when clears are rare/zero: progress inside the next 100 stages, **boss HP left** when dying on the boss, plus a furthest-of-10 / max-stage term so the walk still has gradient.
- **Bosses/day** needs run time. Their boss mode does not optimize that; short-run farming is closer to their **Loot** mode (`lootPerMin`).

So: HP closeness is *one ingredient* of a smooth “get to and past the boss” score. Farm rate per day is a different product question — that is our **Maximize Boss/day**.

### Which is “better”?

No single winner. Different failure modes:

- **Their walk** can reach point splits our 0/high grid never lists, and the noise gate avoids fake “wins.” It is opaque (no factor chart), can stall in local optima, and Boss Kill ≠ Bosses/day.
- **Our funnel** is designed for main effects, shows which skills moved the score, and separates first-kill (HP) from farm (bosses/day) from stage/loot. Coarse grids miss intermediate levels; raw compares can keep noise; Bosses/day is flat until someone clears.

Same WASM combat: disagreements are almost always **objective + search**, not “wrong fight math.”

### What is still an advantage on our side

1. **Objective split** — First Bosskill Finder vs Bosses/day vs Stage vs Loot. Toolkit folds pre-clear and clear-rate into one Boss Kill button; farm-per-day is not that button.
2. **Interpretability** — screen charts / locks explain *why* a skill was kept.
3. **First-kill specialization** — Timeless/Lucky Loot pinned at 0; confirm by clears. Their composite may spend into loot skills when that still helps the ladder.
4. **Bosses/day** as an explicit score (run length matters). Toolkit boss mode is per-run clears/progress.
5. **Deterministic funnel shape** — same screens, comparable across hunters/levels; not “whatever 3 minutes of hill-climb found.”

Toolkit advantages we do **not** currently match: SE noise gate, worker pool / sim volume, free-form neighbors, generate-at-level, sibling build instead of overwrite, one button that still moves before first clear.

### What we adopted (Oct 2026)

Shipped in this repo (funnel kept):

1. **Noise-aware confirm** — Push screens and First Bosskill Finder only offer **Apply** when the confirm gain beats SE×z plus a minimum (`confirmBeatsNoise` / `clearRateBeatsNoise` in `web/js/optimize.js`). Raw-mean wins inside noise are reported, not applied.
2. **Bosses/day cold-start** — Maximize Boss/day screens with no clears rank on remaining boss HP; once clears appear, that screen uses bosses/day.

Still open / optional:

3. **Worker pool** — same funnel, more sims or larger grids in the same wall time. Not shipped.
4. **Do not replace** First Bosskill Finder with their walk — charts, pinned loot skills, and clear confirm stay ours.

### Bottom line

Toolkit Boss Kill ≈ “one smooth get-past-the-boss score + heavy statistical search.”  
Our stack ≈ “ask the right scalar for the job + designed screen,” now with a **noise-gated apply** and **HP cold-start** on Bosses/day. Worker parallelism remains the main speed gap.

This is reverse-engineered from UI copy and the public minified bundle, not an official spec. Re-check titles and `fz` if their UI changes.
