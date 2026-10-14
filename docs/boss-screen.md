# Boss screen: what we tried and what the finder does

Notes from the October 2026 design discussion. The First Bosskill Finder runs the two screens described under [Current screen](#current-screen) and [Second screen](#second-screen), then the short pass under [Refinement](#refinement). [Stage, loot, and bosses/day](#stage-loot-and-bossesday) is the same funnel shape with a different score. Borge, Ozzy, and Knox all use it. The boss finder itself is unchanged.

## Current screen

Borge only, at the **current hunter level**. Talent points equal that level. Attribute points equal `level × 3`. Level 27 in the examples below was one illustration, not a fixed target. A hunter at level 26 is screened with 26 talent points and 78 attribute points.

Each row spends the whole budget. There is no pass that tries 1 point, then 2, then 3.

| Piece | Levels in the screen |
| --- | --- |
| Death Is My Companion | 0 or 2 |
| Life of the Hunt | 0 or 5 |
| The Unfair Advantage | 0 or 5 |
| Impeccable Impacts | 0 or 10 |
| The Omen Of Defeat | 0 or 10 |
| The Fires of War | 0 or 15 |
| Presence Of A God | leftover talent points (0–15), not its own toggle |
| Call Me Lucky Loot | always 0 |
| Helltouch Barrier | 0 or 1 (parent unlock, not the cap of 10) |
| Lifedrain Inhaler | 0 or 10, only if Helltouch is on |
| Explosive Punches | 0 or 6, only if Helltouch is on |
| Book Of Baal | 0, 3, or 6 |
| Superior Sensors | 0 or 6, only if Book Of Baal is on |
| Spartan Lineage | 0 or 6 |
| Essence Of Ylith | 1 when Spartan is on, otherwise 0 |
| The Atlas Protocol | 0, 2, or 6, only if Sensors is on and 75 lower-path points remain |
| Weakspot Analysis | 0 or 6, only if Explosive Punches is on and the same 75-point gate holds |
| Born For Battle | 0 or 3, only if Spartan is on and the same gate holds |
| Soul Of Ares | leftover attribute points |
| Timeless Mastery, Soul Of The Minotaur, Soul Of Hermes, Soul Of Athena | always 0 |

Stats, relics, gems, inscryptions, and the Gaiden card stay on the saved hunter. The screen does not write a build back.

Every row is simulated **50** times. The score is **remaining boss HP** for the first checked boss, not bosses/day. Lower is closer to a kill. The later phases are the [second screen](#second-screen) and the [refinement](#refinement).

The WASM value (`getLastBossHpPercent`) is already in percent, and it is only filled in when the hunter dies on that boss. It is 0 in two opposite cases: the run never reaches the boss, and the run is already past it. The screen splits those:

- Stage still below the boss: 100% (not there yet).
- Died on the boss: the WASM percent.
- Stage past the boss: 0% (the boss is dead).

The report is a bar chart, largest drop first. A factor's bar is how many points of boss HP its best tested level removes compared with that skill at 0. Presence Of A God and Soul Of Ares are fillers, so they are not bars. A factor that cannot change at this budget is named under the chart as staying at 0. At level 26 that is Atlas, Weakspot, and Born For Battle: the lower path must already hold 75 points, and the skill itself costs more than the 3 points left in a 78-point budget.

Row counts with this filler rule:

| Level | Talent rows | Attribute rows | Builds |
| --- | --- | --- | --- |
| 26 | 28 | 49 | 1372 |
| 27 | 33 | 68 | 2244 |

## Second screen

Screen 2 starts from whatever screen 1 just measured. It does not pin a named skill. Death at 2 was the largest drop on one level-26 chart, so that run locked Death at 2. A later run whose largest drop is something else locks that skill instead, and Death stays in the screen.

Rules, in order:

- The skill with the largest boss-HP drop is locked at the level that won.
- A skill whose best level was off is locked at 0.
- Every other skill that beat off is stepped through intermediate levels (0 and the screen-1 high, plus the steps below).
- Helltouch Barrier is held at 1 when Lifedrain or Explosive Punches is still in the screen, because those two cannot be selected without it. That lock is the parent, not a rank from the chart.
- Presence Of A God and Soul Of Ares stay the fillers. Call Me Lucky Loot and Timeless Mastery stay at 0.
- If the finer grid would pass about 1500 builds, intermediate steps on the smallest screen-1 lifts are dropped first. 0 and the level that won are kept.

| Skill, when it is stepped | Levels |
| --- | --- |
| Death Is My Companion | 0 or 2 |
| Life of the Hunt | 0, 2, or 5 |
| The Unfair Advantage | 0, 2, or 5 |
| Impeccable Impacts | 0, 5, or 10 |
| The Omen Of Defeat | 0, 5, or 10 |
| The Fires of War | 0, 5, 10, or 15 |
| Helltouch Barrier | 0 or 1 |
| Lifedrain Inhaler | 0, 4, 7, or 10 |
| Explosive Punches | 0, 3, or 6 |
| Book Of Baal | 0, 2, 4, or 6 |
| Spartan Lineage | 0, 3, or 6 |
| Superior Sensors | 0, 3, or 6 |

Same score as screen 1, 50 sims per build. The report shows the screen-1 chart, then the screen-2 chart. Under those, three pairs are tables of mean boss HP when both skills actually vary: Death × Lifedrain, Lifedrain × Explosive Punches, Lifedrain × Book Of Baal. The finer screen supplies the table when both screens have the pair.

## Refinement

After screen 2, one short pass holds every screen-2 winner and steps the cheap levels the grids never tried on the Atlas chain:

- The Atlas Protocol at 1 and 2, when screen 1 already kept it on. Level 2 is the first level that fits the 75-point gate at level 27. Level 1 costs 3 points and was not in either screen.
- Superior Sensors at 1 and 2, plus the screen-2 winner when that winner is higher.
- Book Of Baal at 1 and 2, plus the screen-2 winner when that winner is higher.

Atlas stays off when screen 1 left it off. Sensors and Baal still take those cheap steps when their own screen-2 bar was positive. Rows that miss the 75-point gate or the point budget are dropped. Presence Of A God and Soul Of Ares still take the leftovers.

The report then adds the refinement chart, the boss-HP change per point on each step, a comparison of the three best boss-HP numbers, the single best refinement build, and the Atlas × Sensors, Baal × Sensors, and Atlas × Baal tables.

The three phases are a funnel. Screen 2 puts the screen-1 champion row back into its grid, including that row's levels when the finer list had dropped them (Book of Baal 3 is the usual case). Refinement locks the running champion and only steps around it. A new row replaces the champion only when its boss HP is lower. The headline best therefore stays or falls. The "this phase" column is the best row that phase found on its own, which can be worse.

## Why the level-27 picture was 884 rows

An earlier count forced Presence, Baal, and Atlas onto the exact levels from one level-27 build (Presence 0/10/15, Baal 0/3/6, Atlas 0/2/6) and required the talent levels to sum to exactly 27. That matrix has 13 talent rows and 68 attribute rows, **884** builds, and it does contain that screenshot.

Those talent levels cannot sum to 26. The subset sums of `{0,2}`, `{0,5}`, `{0,5}`, `{0,10}`, `{0,10}`, `{0,10,15}`, `{0,15}` skip 26. A finder tied to 884 would screen nothing at the level that was actually selected. The shipped screen therefore rebuilds the rows from the live budget and parks the remainder on Presence and Ares.

## Full enumeration does not fit

At level 27, with Call Me Lucky Loot and Timeless Mastery fixed at 0, the attribute tree enforced, and both budgets spent in full:

- **139,893** talent allocations
- **36,552,960** legal attribute allocations
- **5.1 trillion** pairs

Soul Of Ares and Essence Of Ylith have no cap and cost 1, so most of the attribute count is how the leftover splits between them. Treating them only as fillers (one legal dump per other-attribute skeleton, or both endpoints) cuts the attribute side from 36.6 million to **1.51 million** (or 3.0 million if both dump targets are kept). That is about **24×**. With the talent allocations still free, **212 billion** builds remain.

A millisecond per build is still years for one level. The old finder looked at about 840 candidates per level (two loops, 420 evaluations each).

## The old finder was a random walk

Before this screen, First Bosskill Finder did not use a designed experiment. Per level it ran a Monte-Carlo local search: up to 36 random full-budget restarts, a neighbor that moves one point, a 55% chance to reroll talents or attributes, and a stop after 12 steps without a gain or 420 evaluations. Two loops. Timeless Mastery and Call Me Lucky Loot stayed at 0. The search walked level+2, then level+1, then the current level, and added 3 stat points per level above the current one into one random material class. `biasBlend` was 0, so good rows did not reweight later draws. The top 4–8 rows were resimulated at 6000 runs. A clear was 0.2 bosses/day.

That search can produce a build shaped like the level-27 example. It will not reliably hit one exact point split.

Push Average Stage, Push Material/XP, and Maximize Boss/day still use that style of search (`web/js/optimize.js`). Only the First Bosskill Finder was switched.

## Resolution V does not fit this budget

[NIST/SEMATECH 5.3.3.4.4](https://www.itl.nist.gov/div898/handbook/pri/section3/pri3344.htm) defines resolution as the length of the shortest word in the defining relation of a two-level fractional factorial.

- Resolution III: main effects are aliased with two-factor interactions.
- Resolution IV: main effects are clear of two-factor interactions; two-factor interactions are aliased with each other.
- Resolution V: main effects and two-factor interactions are clear of each other (two-factor interactions are aliased with three-factor interactions).

That guarantee needs the orthogonal ±1 columns from the generators. Talent and attribute points share one budget, and many attribute levels are illegal without a parent. Dropping illegal rows, or moving points until the row sums to the budget, removes the alias structure the resolution number describes.

A two-level plan on about 18 skills is only on the order of 170–256 runs, which would fit in the old 420-evaluation cap. The problem is not the run count. The rows would not be legal builds, and the question they answer is "high versus low," not "10 Presence, 3 Book of Baal, 2 Atlas."

Coding high as the skill cap makes that worse:

- Talent caps excluding Call Me Lucky Loot sum to 62. The level-27 budget is 27. Presence and Fires of War cannot both sit at max, so that interaction is not in any row.
- Every talent package whose caps sum to exactly 27 includes Death Is My Companion, so Death never varies and its effect is not estimable.
- Soul Of Ares and Essence Of Ylith have no maximum.
- Helltouch at max costs 20 points. The useful level in the example build is 1, only so Lifedrain and Explosive Punches unlock. Presence was 10/15, Book of Baal 3/6, Atlas 2/6. A 0/max matrix does not contain that row.
- A skill that looks flat or harmful at max often just spent the budget. Dropping it afterwards also drops the partial level that was actually useful.

The chart can only talk about levels that were put in the matrix on purpose. It does not discover Presence 7 or Atlas 4.

## Boss HP %

On [cifi-tools Borge](https://cifi-tools.com/borge) the two boss readouts are different:

- **Boss Kill %** is the share of runs that kill the boss. Same quantity as this app's Boss Kill % (`bossKillRate`). Bosses/day is that clear rate times runs per day. A clear is a run that ends past the boss stage.
- **Boss HP %** is the average boss health still left when the hunter dies on the boss. Lower means the failed runs got closer. The WASM getter is `getLastBossHpPercent` (`bossHpPercent` on the Borge bridge), already scaled as a percent (about 18.6 means 18.6%, not 0.186). The First Bosskill Finder ranks on this number. The main metric cards still show Boss Kill % only.

## Gaiden card

The diamond card is one purchase (5000 diamonds), not a stack of ranks. Owned, it applies all four multipliers together: Max HP ×1.03, HP Regen ×1.03, ATK ×1.03, Loot ×1.05. Probes of the current WASM give the same HP, attack, regen, and loot at card levels 1, 2, 3, and 4. The UI is one checkbox. Any saved value above 0 counts as owned. Iridian is the same kind of switch for Ozzy; Knox has no diamond card.

## Stage, loot, and bosses/day

Push Average Stage, Push Material/XP, and Maximize Boss/day on Borge, Ozzy, and Knox run the same three-phase funnel as the boss finder, with a different score and a different factor list. The boss finder itself is unchanged.

Call Me Lucky Loot and Timeless Mastery are free factors on all three push screens. Off is a legal row. Neither skill is forced on. Each hunter parks leftover talent points on one filler (Borge: Presence Of A God, Ozzy: Echo Bullets, Knox: Finishing Move) and leftover attribute points on another (Borge: Soul Of Ares, Ozzy: Living Off The Land, Knox: Release The Kraken). Those fillers are ranked on the chart. Screen 1 also steps Borge's Ylith at 1 and 5 when that still fits the row cap; otherwise refinement moves 5 points between the attribute filler and its shift partner (Ylith, Exo Piercers, or Soul Amplification). The refinement corner follows the skills the chart ranked, and it always tries that filler split. A skill is locked on only when its gain is clear next to the spread of the builds at those levels. Grids up to about 2,500 builds use 100 sims. Larger grids use 80, then 50.

The apply decision resimulates the current hunter and the funnel winner at 4,000 sims. The charts use the screening sims. A row is written onto the hunter only when that confirm is better and Apply is accepted. Show finder report hides the charts when it is off. A better confirm still opens the apply question.

### The funnel, apart from boss HP

Three nested searches at the current level. Each row spends the talent budget and the attribute budget. A later phase puts the current best row back into the grid and replaces it only when the new row scores better. A fresh sim of that same row that comes back worse does not become the headline.

1. Screen 1 is a coarse 0 / high factorial. The chart ranks each skill by how much the score moves at its best tested level versus off.
2. Screen 2 locks the largest positive skill at the level that won, locks skills that did not beat off at 0, and steps the rest through intermediate levels.
3. Refinement holds that build and only steps cheap levels the earlier grids skipped.

That is why a later boss-HP headline can stay flat and cannot rise. It is also why a designed screen of about 1,400–2,200 builds sees main effects a 420-evaluation random walk misses. Both of those properties are about the search, not about boss HP.

### Push Average Stage

Average stage is the same kind of question as the boss screen: which talent and attribute package makes the hunter stronger. Higher average stage wins. Loot breaks an exact tie.

What is worth keeping:

- One level, both budgets spent, parent gates enforced, Presence and Ares as the dumps only after the toggles are chosen.
- Coarse, then finer, then a small corner, with the incumbent kept. Fifty-sim noise is why the keep rule exists, and average stage is noisier than a 5-point boss-HP step.

What has to change before this is a stage search:

- Call Me Lucky Loot and Timeless Mastery are factors on this screen, the same as on Material/XP and Bosses/day. The boss finder pins both at 0. The stage button does the opposite for Timeless while "Prioritize Timeless Mastery" is on: it buys the parents (Ares 1, Ylith 1, Spartan 1) and up to Timeless 5, which is 19 attribute points, before the walk starts. A stage screen puts Lucky Loot and Timeless in the chart (off and the high level, plus a middle level for Timeless) and lets the score decide. It does not inherit the checkbox, and it does not force either skill on.
- Presence and Ares are not bars. The chart then locks whichever toggled skill moved the mean, even when the real change was the filler that skill freed or consumed. That confound already showed up on boss HP, where Impeccable 5 was only legal next to Life of the Hunt 5. On stage it matters more, because Presence (−4% enemy HP per level) and Ares (+1% Max HP and +0.2% ATK per level) are often the spend. A stage screen has to rank them, not only park leftovers on them.
- Ylith is pinned at 1 whenever Spartan is on. Extra Ylith is regen and HP, which stage can want.
- Soul of Athena, Soul of the Minotaur, and Soul of Hermes stay at 0. Athena's heavy attack is a stage candidate this matrix never turns on.
- The refinement corner is Baal, Sensors, and Atlas because those were the boss-HP chain. A stage corner has to walk the skills the stage chart ranked, and the filler split. Copying the Atlas steps would tighten the wrong corner.
- Boss HP had steps of several points, so 50 sims could rank them. Average-stage gaps are often a fraction of a stage. A stage screen should lock a skill only when the lift is large next to the spread, and it wants more than 50 sims on the coarse pass.

The funnel is a better first stage search than the random walk once Presence, Ares, and Ylith are real factors and Lucky Loot and Timeless are free factors. Running today's boss matrix and reading the winner as a stage build would answer the boss question a second time.

### Push Material/XP

Loot per minute is loot per drop times how fast things die. Combat skills stay in the screen. A build that clears slower can lose loot/min even with a larger multiplier.

The boss matrix forces the two loot skills to 0. Stage, Material/XP, and Bosses/day all put them back in as free factors. Off is a legal row. Neither skill is required:

- Timeless Mastery, +14% loot per level, cost 3, max 5. With the parents above, level 5 is 19 attribute points. Spartan does not have to be 6. The current button will not start unless level 5 fits, and then every row has it. The screen should include off and 5, and a middle level, so the chart can say whether +70% loot beats spending those points on clear speed.
- Call Me Lucky Loot, +20% loot per level on kill, cost 1, max 10. It competes with Death, Presence, and Fires. It is a toggle. Presence still takes the talent points that remain.

The Gaiden card stays the saved checkbox (+5% loot). Loot inscryptions stay out of this matrix, as they do today.

The Atlas corner is the wrong refinement when Timeless or Lucky Loot is the skill the chart ranked. The corner follows that winner: Timeless level and the Spartan point that unlocks it, or Lucky Loot's intermediate levels.

The funnel is the right shape for loot, and it can beat the current walk, because that walk locks Timeless at 5 before it looks. The boss grid with both loot skills pinned at 0 would not.

### Maximize Boss/day

Bosses/day is clears times runs per day. It is closer to this finder than average stage is, but the score is a kill, not remaining HP. Until some rows actually get past the boss, almost every row is 0 and there is nothing to lock. Boss HP is the screen to run while the boss still lives. Bosses/day is the score to switch to after kills start. This matrix is not that switch. Call Me Lucky Loot and Timeless Mastery are still free factors on that screen, the same as on stage and Material/XP.

### Wired

Borge, Ozzy, and Knox call `findPushBuild` from the three push buttons. The First Bosskill Finder still calls `findFirstBossKill`.

## Not done yet

The boss finder's refinement only steps the cheap Atlas-chain levels. It does not walk the build up to the next hunter level, and it does not try every untested level of the skills screen 2 already ranked.
