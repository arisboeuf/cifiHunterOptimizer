/** Monte-Carlo local search over talent/attribute budgets (WASM eval). */
import { pointBudgets, validateBudgets } from "./build.js";

export const DEFAULT_OPTIMIZE = {
  /** Cheap Monte-Carlo screen during local search / restarts. */
  nSearch: 100,
  /** High-N re-eval for top fraction + final champion compare. */
  nRefine: 4000,
  /** Baseline vs champion; independent of UI Sims field. */
  nBaseline: 4000,
  maxEvals: 200,
  restarts: 8,
  stagnationLimit: 18,
  /** After screening: refine this top fraction of unique builds (clamped). */
  refineTopFraction: 0.03,
  refineMin: 2,
  refineMax: 8,
  /** Independent full search passes; champions are compared statistically at the end. */
  loops: 1,
  seed: null,
  /**
   * When true: fill Timeless Mastery to the max level affordable under the attribute
   * budget (parents included) before other attrs. Ignored if even TM 1 is impossible.
   * (Legacy alias: forceTimelessMastery5.)
   */
  prioritizeTimelessMastery: true,
  /** How strongly elite screen builds bias later random/neighbor moves (0–1). */
  biasBlend: 0.55,
  /**
   * "stage" = push average stage;
   * "bosses" = maximize selected boss clears / day;
   * "loot" = push Material/XP (WASM lootScore = loot/min); Timeless Mastery max is mandatory.
   */
  objective: "stage",
  /** Boss stages to count when objective is "bosses" (subset of BOSS_STAGE_OPTIONS). */
  bossStages: [],
};

function stageStatsFromCounts(res) {
  const counts = res?.stageCounts || {};
  let n = 0;
  let sum = 0;
  for (const [stageRaw, countRaw] of Object.entries(counts)) {
    const stage = Number(stageRaw);
    const c = Number(countRaw);
    if (!Number.isFinite(stage) || !Number.isFinite(c) || c <= 0) continue;
    n += c;
    sum += stage * c;
  }
  if (n <= 0) {
    const avg = Number(res?.avgStage) || 0;
    const fallbackN = Math.max(1, Number(res?.n) || 1);
    return { n: fallbackN, mean: avg };
  }
  return { n, mean: sum / n };
}

/** Boss stages the Boss Maximizer can target (every 100). */
export const BOSS_STAGE_OPTIONS = [100, 200, 300];

export function normalizeBossStages(raw) {
  const allowed = new Set(BOSS_STAGE_OPTIONS);
  const out = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    const n = Math.floor(Number(v));
    if (!allowed.has(n) || out.includes(n)) continue;
    out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Expected selected-boss clears per run from the stage histogram.
 * A clear counts when the run ends past that boss stage (stage > boss).
 */
function bossClearStatsFromCounts(res, bossStages) {
  const bosses = normalizeBossStages(bossStages);
  const counts = res?.stageCounts || {};
  let n = 0;
  let sum = 0;
  for (const [stageRaw, countRaw] of Object.entries(counts)) {
    const stage = Number(stageRaw);
    const c = Number(countRaw);
    if (!Number.isFinite(stage) || !Number.isFinite(c) || c <= 0) continue;
    let kills = 0;
    for (const b of bosses) {
      if (stage > b) kills += 1;
    }
    n += c;
    sum += kills * c;
  }
  if (n <= 0) {
    return { n: Math.max(1, Number(res?.n) || 1), mean: 0 };
  }
  return { n, mean: sum / n };
}

function normalizeObjective(raw) {
  if (raw === "bosses" || raw === "loot") return raw;
  return "stage";
}

function scoreOf(res, objective = "stage", bossStages = []) {
  const st = stageStatsFromCounts(res);
  const runsPerDay = Number(res.runsPerDay) || 0;
  const bossStats = bossClearStatsFromCounts(res, bossStages);
  const bossesPerDay = bossStats.mean * runsPerDay;
  const avgStage = Number(res.avgStage) || st.mean;
  const lootScore = Number(res.lootScore) || 0;
  return {
    avgStage,
    lootScore,
    n: st.n,
    bossesPerDay,
    objective: normalizeObjective(objective),
    bossStages: normalizeBossStages(bossStages),
  };
}

/**
 * Raw numeric compare. No significance test while combat is WASM.
 * See docs/wasm-combat.md.
 * Stage: higher Ø stage, then loot. Loot: higher loot/min, then Ø stage.
 * Bosses: higher bosses/day, then loot, then Ø stage.
 */
function scoreGt(a, b) {
  if (!a) return false;
  if (!b) return true;
  const objective = normalizeObjective(a.objective ?? b.objective);
  if (objective === "bosses") {
    if (a.bossesPerDay !== b.bossesPerDay) return a.bossesPerDay > b.bossesPerDay;
    if (a.lootScore !== b.lootScore) return a.lootScore > b.lootScore;
    return a.avgStage > b.avgStage;
  }
  if (objective === "loot") {
    if (a.lootScore !== b.lootScore) return a.lootScore > b.lootScore;
    return a.avgStage > b.avgStage;
  }
  if (a.avgStage !== b.avgStage) return a.avgStage > b.avgStage;
  return a.lootScore > b.lootScore;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const rand = seed == null ? Math.random : mulberry32(Number(seed) || 1);
  return {
    random: () => rand(),
    choice(arr) {
      return arr[Math.floor(rand() * arr.length)];
    },
    /** Pick from `items` with probability ∝ max(eps, weightFn(item)). */
    weightedChoice(items, weightFn) {
      if (!items.length) return undefined;
      let total = 0;
      const weights = new Array(items.length);
      for (let i = 0; i < items.length; i++) {
        const w = Math.max(0.05, Number(weightFn(items[i])) || 0.05);
        weights[i] = w;
        total += w;
      }
      let r = rand() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
}

function yieldToUi() {
  return new Promise((r) => setTimeout(r, 0));
}

function configKey(cfg) {
  return JSON.stringify({ t: cfg.talents, a: cfg.attributes });
}

function sortByScoreDesc(rows) {
  return rows.slice().sort((a, b) =>
    scoreGt(a.sc, b.sc) ? -1 : scoreGt(b.sc, a.sc) ? 1 : 0,
  );
}

/** Mean levels in elite rows → soft weights (mean ≈ 1), blended with previous. */
function blendLevelWeights(keys, eliteMaps, prevWeights, blend) {
  const next = { ...prevWeights };
  if (!keys.length || !eliteMaps.length) return next;
  const means = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const m of eliteMaps) {
    for (const k of keys) means[k] += Number(m?.[k] ?? 0);
  }
  for (const k of keys) means[k] /= eliteMaps.length;
  const avg = keys.reduce((s, k) => s + means[k], 0) / keys.length;
  const b = Math.min(1, Math.max(0, Number(blend) || 0));
  for (const k of keys) {
    const target = (means[k] + 0.35) / (avg + 0.35);
    const old = Number(prevWeights[k] ?? 1) || 1;
    next[k] = old * (1 - b) + target * b;
  }
  return next;
}

function refineCountFor(screenedLen, opt) {
  const frac = Math.min(1, Math.max(0.01, Number(opt.refineTopFraction) || 0.1));
  const raw = Math.ceil(Math.max(1, screenedLen) * frac);
  const mn = Math.max(1, Math.floor(Number(opt.refineMin) || 3));
  const mx = Math.max(mn, Math.floor(Number(opt.refineMax) || 12));
  return Math.min(mx, Math.max(mn, raw));
}

/**
 * @param {object} baseConfig
 * @param {{ evaluate: Function }} engine
 * @param {import('./hunters/index.js').HUNTERS[string]} hunter
 * @param {Partial<typeof DEFAULT_OPTIMIZE>} [optIn]
 * @param {{ onProgress?: Function, isCancelled?: () => boolean }} [hooks]
 */
export async function optimizeBuild(baseConfig, engine, hunter, optIn = {}, hooks = {}) {
  const { costs, attrs, wasmToSimResult } = hunter;
  const TIMELESS_KEY = costs.TIMELESS_KEY;
  const TIMELESS_PARENT_MIN = costs.TIMELESS_PARENT_MIN || {};

  function talentMax(key) {
    return Number(costs.TALENT_COSTS[key]?.max ?? 0);
  }
  function attrCost(key) {
    return Number(costs.ATTRIBUTE_COSTS[key]?.cost ?? 1);
  }
  function attrsValid(attrsMap, budget) {
    return attrs.attributesTreeValid(attrsMap, budget).ok;
  }
  function timelessParentCost() {
    let cost = 0;
    for (const [k, mn] of Object.entries(TIMELESS_PARENT_MIN)) {
      cost += mn * attrCost(k);
    }
    return cost;
  }
  /** Highest TM level whose parents + TM cost fit in `budget` (0 if even TM 1 does not). */
  function maxAffordableTimeless(budget) {
    const tmCost = attrCost(TIMELESS_KEY);
    if (!(tmCost > 0)) return 0;
    const parentCost = timelessParentCost();
    const maxLvl = Number(costs.ATTRIBUTE_COSTS[TIMELESS_KEY]?.max ?? 5);
    let best = 0;
    for (let lvl = 1; lvl <= maxLvl; lvl++) {
      if (parentCost + lvl * tmCost <= budget) best = lvl;
      else break;
    }
    return best;
  }
  function ensureTimelessPriority(attrMap, keys, tmLevel) {
    const out = Object.fromEntries(keys.map((k) => [k, Number(attrMap[k] ?? 0)]));
    if (tmLevel < 1) return attrs.zeroOrphanDependents(out);
    for (const [k, mn] of Object.entries(TIMELESS_PARENT_MIN)) {
      if (k in out) out[k] = Math.max(Number(out[k] ?? 0), mn);
    }
    if (TIMELESS_KEY in out || keys.includes(TIMELESS_KEY)) out[TIMELESS_KEY] = tmLevel;
    return attrs.zeroOrphanDependents(out);
  }
  function randomTalents(rng, keys, budget, talW) {
    const levels = Object.fromEntries(keys.map((k) => [k, 0]));
    let remaining = budget;
    while (remaining > 0) {
      const candidates = keys.filter((k) => levels[k] < talentMax(k));
      if (!candidates.length) break;
      const k = rng.weightedChoice(candidates, (x) => talW[x] ?? 1);
      levels[k] += 1;
      remaining -= 1;
    }
    return levels;
  }
  function randomAttributes(rng, keys, budget, useTm, tmLevel, attrW) {
    let levels = Object.fromEntries(keys.map((k) => [k, 0]));
    if (useTm) {
      levels = ensureTimelessPriority(levels, keys, tmLevel);
      if (attrs.attrSpent(levels) > budget) return levels;
    }
    let remaining = budget - attrs.attrSpent(levels);
    for (let i = 0; i < budget * 6; i++) {
      if (remaining <= 0) break;
      const candidates = keys.filter(
        (k) =>
          (!useTm || k !== TIMELESS_KEY) &&
          attrCost(k) <= remaining &&
          attrs.canIncreaseAttribute(levels, k),
      );
      if (!candidates.length) break;
      const k = rng.weightedChoice(candidates, (x) => attrW[x] ?? 1);
      levels[k] = Number(levels[k] ?? 0) + 1;
      remaining -= attrCost(k);
    }
    if (useTm) levels = ensureTimelessPriority(levels, keys, tmLevel);
    return levels;
  }
  function neighborTalents(rng, talents, keys, talW) {
    const donors = keys.filter((k) => Number(talents[k] ?? 0) > 0);
    const receivers = keys.filter((k) => Number(talents[k] ?? 0) < talentMax(k));
    if (!donors.length || !receivers.length) return null;
    for (let i = 0; i < 24; i++) {
      // Prefer stealing from weak keys, giving to strong ones (learned from screen elite).
      const a = rng.weightedChoice(donors, (x) => 1 / (talW[x] ?? 1));
      const b = rng.weightedChoice(receivers, (x) => talW[x] ?? 1);
      if (a === b) continue;
      const out = { ...talents };
      out[a] = Number(out[a]) - 1;
      out[b] = Number(out[b] ?? 0) + 1;
      return out;
    }
    return null;
  }
  function neighborAttributes(rng, attrMap, keys, budget, useTm, tmLevel, attrW) {
    const lockedFloor = useTm ? { ...TIMELESS_PARENT_MIN, [TIMELESS_KEY]: tmLevel } : {};
    const donors = keys.filter((k) => Number(attrMap[k] ?? 0) > (lockedFloor[k] ?? 0));
    if (!donors.length) return null;
    const baseSnap = Object.fromEntries(keys.map((k) => [k, Number(attrMap[k] ?? 0)]));
    for (let i = 0; i < 48; i++) {
      const a = rng.weightedChoice(donors, (x) => 1 / (attrW[x] ?? 1));
      let out = { ...baseSnap };
      const floor = lockedFloor[a] ?? 0;
      out[a] = Math.max(floor, Number(out[a]) - 1);
      if (out[a] <= 0 && !(a in lockedFloor)) {
        out[a] = 0;
        for (const dep of attrs.dependentsOf(a)) {
          if (dep in lockedFloor) continue;
          out[dep] = 0;
        }
      }
      out = useTm ? ensureTimelessPriority(out, keys, tmLevel) : attrs.zeroOrphanDependents(out);
      const remaining = budget - attrs.attrSpent(out);
      const receivers = keys.filter(
        (k) =>
          k !== a &&
          (!useTm || k !== TIMELESS_KEY) &&
          attrs.canIncreaseAttribute(out, k) &&
          attrCost(k) <= remaining,
      );
      if (receivers.length) {
        const b = rng.weightedChoice(receivers, (x) => attrW[x] ?? 1);
        out[b] = Number(out[b] ?? 0) + 1;
      }
      if (useTm) out = ensureTimelessPriority(out, keys, tmLevel);
      const changed = keys.some((k) => Number(out[k] ?? 0) !== baseSnap[k]);
      if (attrsValid(out, budget) && changed) return out;
    }
    return null;
  }
  function applyPoints(base, talents, attrMap) {
    const cfg = structuredClone(base);
    cfg.talents = Object.fromEntries(
      Object.keys(base.talents || {}).map((k) => [k, Number(talents[k] ?? 0)]),
    );
    for (const [k, v] of Object.entries(talents)) cfg.talents[k] = Number(v);
    let cleaned = attrs.zeroOrphanDependents(
      Object.fromEntries(Object.keys(base.attributes || {}).map((k) => [k, Number(attrMap[k] ?? 0)])),
    );
    for (const [k, v] of Object.entries(attrMap)) cleaned[k] = Number(v);
    cleaned = attrs.zeroOrphanDependents(cleaned);
    cfg.attributes = Object.fromEntries(
      Object.keys(base.attributes || {}).map((k) => [k, Number(cleaned[k] ?? 0)]),
    );
    for (const [k, v] of Object.entries(cleaned)) cfg.attributes[k] = Number(v);
    return cfg;
  }

  const opt = { ...DEFAULT_OPTIMIZE, ...optIn };
  const objective = normalizeObjective(opt.objective);
  const bossStages = normalizeBossStages(opt.bossStages);
  if (objective === "bosses" && !bossStages.length) {
    throw new Error("Select at least one boss (100 / 200 / 300).");
  }
  const mkScore = (res) => scoreOf(res, objective, bossStages);
  const rng = makeRng(opt.seed);
  const prioritizeTm =
    objective === "loot" ||
    !!(opt.prioritizeTimelessMastery ?? opt.forceTimelessMastery5 ?? DEFAULT_OPTIMIZE.prioritizeTimelessMastery);
  const onProgress = hooks.onProgress || (() => {});
  const isCancelled = hooks.isCancelled || (() => false);

  const base = structuredClone(baseConfig);
  const level = Number(base.meta?.level ?? 0);
  const caps = pointBudgets(level);
  const talCap = caps.talents;
  const attrCap = caps.attributes;

  const lockTalentZero = new Set(Array.isArray(opt.lockZeroTalents) ? opt.lockZeroTalents : []);
  const lockAttrZero = new Set(Array.isArray(opt.lockZeroAttributes) ? opt.lockZeroAttributes : []);
  const talentKeys = (Object.keys(base.talents || {}).length
    ? Object.keys(base.talents)
    : [...costs.TALENT_ORDER]
  ).filter((k) => !lockTalentZero.has(k));
  const attrKeys = (Object.keys(base.attributes || {}).length
    ? Object.keys(base.attributes)
    : [...costs.ATTR_ORDER]
  ).filter((k) => !lockAttrZero.has(k));

  const tmMax = Number(costs.ATTRIBUTE_COSTS[TIMELESS_KEY]?.max ?? 5);
  const affordableTm = maxAffordableTimeless(attrCap);
  // Material/XP: Timeless Mastery max (5) is mandatory. Other modes: max affordable if prioritized.
  let tmTarget = 0;
  if (objective === "loot") {
    if (affordableTm < tmMax) {
      throw new Error(
        `Push Material/XP requires Timeless Mastery ${tmMax} (attribute budget too low; max affordable is ${affordableTm}).`,
      );
    }
    tmTarget = tmMax;
  } else if (prioritizeTm && !lockAttrZero.has(TIMELESS_KEY)) {
    tmTarget = affordableTm;
  }
  const useTm = tmTarget >= 1;

  const loops = Math.max(1, Math.floor(Number(opt.loops) || 1));
  const refineCap = refineCountFor(opt.maxEvals, opt);
  const perLoopBudget = Math.max(1, opt.maxEvals + refineCap);
  const totalBudget = Math.max(1, 1 + loops * perLoopBudget + loops);
  let evals = 0;
  let globalDone = 0;
  const history = [];
  const loopChampions = [];
  let talW = Object.fromEntries(talentKeys.map((k) => [k, 1]));
  let attrW = Object.fromEntries(attrKeys.map((k) => [k, 1]));

  const notify = (msg, done, stage = null, loot = null, bosses = null) => {
    onProgress({
      msg,
      done: done ?? globalDone,
      total: totalBudget,
      stage,
      loot,
      bossesPerDay: bosses,
      objective,
      bossStages,
      evals,
      loop: null,
      loops,
    });
  };

  const evaluate = async (cfg, n, enforceTimeless) => {
    if (isCancelled()) return null;
    if (enforceTimeless && Number(cfg.attributes?.[TIMELESS_KEY] ?? 0) !== tmTarget) return null;
    const v = validateBudgets(cfg, hunter);
    if (!v.ok) return null;
    await yieldToUi();
    if (isCancelled()) return null;
    const wasmRes = engine.evaluate(v.config, Math.max(1, Number(n) || 1));
    return wasmToSimResult(wasmRes, n);
  };

  const learnFromScreened = (screened) => {
    if (screened.length < 3) return;
    const ranked = sortByScoreDesc(screened);
    const eliteN = Math.max(1, Math.ceil(ranked.length * Math.min(0.25, opt.refineTopFraction * 2)));
    const elite = ranked.slice(0, eliteN);
    talW = blendLevelWeights(
      talentKeys,
      elite.map((e) => e.cfg.talents),
      talW,
      opt.biasBlend,
    );
    attrW = blendLevelWeights(
      attrKeys,
      elite.map((e) => e.cfg.attributes),
      attrW,
      opt.biasBlend,
    );
  };

  const curTal = Object.fromEntries(talentKeys.map((k) => [k, Number(base.talents?.[k] ?? 0)]));
  const curAttr = attrs.zeroOrphanDependents(
    Object.fromEntries(attrKeys.map((k) => [k, Number(base.attributes?.[k] ?? 0)])),
  );
  const baselineCfg = applyPoints(base, curTal, curAttr);

  notify(`Baseline (${opt.nBaseline} sims)…`, 0);
  const baselineEval = await evaluate(baselineCfg, opt.nBaseline, false);
  if (!baselineEval) {
    throw new Error("Could not simulate current build (invalid or cancelled).");
  }
  evals += 1;
  globalDone = 1;
  const baselineScore = mkScore(baselineEval);
  notify(
    "Baseline done",
    globalDone,
    baselineScore.avgStage,
    baselineScore.lootScore,
    baselineScore.bossesPerDay,
  );

  // Soft-start: current spend biases the first screens (not a hard lock).
  // The boss finder starts cold so a failing build does not pull every sample toward itself.
  if (!opt.coldStart) {
    talW = blendLevelWeights(talentKeys, [curTal], talW, 0.35);
    attrW = blendLevelWeights(attrKeys, [curAttr], attrW, 0.35);
  }

  for (let loop = 0; loop < loops; loop++) {
    if (isCancelled()) break;

    /** @type {Map<string, { sc: object, cfg: object, res: object }>} */
    const screenedByKey = new Map();
    let screenBestCfg = null;
    let screenBestScore = null;
    let loopEvals = 0;
    const loopOffset = 1 + loop * perLoopBudget;

    const loopNotify = (msg, stage = null, loot = null, bosses = null) => {
      globalDone = Math.min(totalBudget, loopOffset + loopEvals);
      const prefix = loops > 1 ? `Iteration ${loop + 1}/${loops} · ` : "";
      onProgress({
        msg: `${prefix}${msg}`,
        done: globalDone,
        total: totalBudget,
        stage,
        loot,
        bossesPerDay: bosses,
        objective,
        bossStages,
        evals,
        loop: loop + 1,
        loops,
      });
    };

    const considerScreen = (cfg, res) => {
      const sc = mkScore(res);
      history.push(sc);
      const key = configKey(cfg);
      const prev = screenedByKey.get(key);
      if (!prev || scoreGt(sc, prev.sc)) {
        screenedByKey.set(key, { sc, cfg: structuredClone(cfg), res });
      }
      if (scoreGt(sc, screenBestScore)) {
        screenBestScore = sc;
        screenBestCfg = structuredClone(cfg);
      }
    };

    loopNotify(`Screening (${opt.nSearch} sims/eval)…`);

    for (let restart = 0; restart < opt.restarts; restart++) {
      if (isCancelled() || loopEvals >= opt.maxEvals) break;
      // Boss finder: some restarts skip Timeless Mastery so combat builds are in the pool.
      const restartUseTm = useTm && !(opt.diverseTimeless && rng.random() < 0.5);

      let tal = randomTalents(rng, talentKeys, talCap, talW);
      let attr = randomAttributes(rng, attrKeys, attrCap, restartUseTm, tmTarget, attrW);
      let localCfg = applyPoints(base, tal, attr);
      let localRes = await evaluate(localCfg, opt.nSearch, restartUseTm);
      if (!localRes) continue;
      evals += 1;
      loopEvals += 1;
      considerScreen(localCfg, localRes);
      let localScore = mkScore(localRes);
      let stagnant = 0;
      const show = screenBestScore || localScore;
      loopNotify(`Screen r${restart + 1}/${opt.restarts}`, show.avgStage, show.lootScore, show.bossesPerDay);

      while (stagnant < opt.stagnationLimit && loopEvals < opt.maxEvals) {
        if (isCancelled()) break;
        let nxtTal;
        let nxtAttr;
        if ((Number(opt.jumpChance) || 0) > 0 && rng.random() < Number(opt.jumpChance)) {
          if (rng.random() < 0.5) {
            nxtTal = randomTalents(rng, talentKeys, talCap, talW);
            nxtAttr = attr;
          } else {
            nxtAttr = randomAttributes(rng, attrKeys, attrCap, restartUseTm, tmTarget, attrW);
            nxtTal = tal;
          }
        } else if (rng.random() < 0.5) {
          nxtTal = neighborTalents(rng, tal, talentKeys, talW);
          nxtAttr = attr;
          if (!nxtTal) {
            nxtAttr = neighborAttributes(rng, attr, attrKeys, attrCap, restartUseTm, tmTarget, attrW);
            nxtTal = tal;
          }
        } else {
          nxtAttr = neighborAttributes(rng, attr, attrKeys, attrCap, restartUseTm, tmTarget, attrW);
          nxtTal = tal;
          if (!nxtAttr) {
            nxtTal = neighborTalents(rng, tal, talentKeys, talW);
            nxtAttr = attr;
          }
        }
        if (!nxtTal && !nxtAttr) break;
        if (!nxtTal) nxtTal = tal;
        if (!nxtAttr) nxtAttr = attr;

        const cand = applyPoints(base, nxtTal, nxtAttr);
        const candRes = await evaluate(cand, opt.nSearch, restartUseTm);
        if (!candRes) {
          if (isCancelled()) break;
          stagnant += 1;
          continue;
        }
        evals += 1;
        loopEvals += 1;
        const candScore = mkScore(candRes);
        considerScreen(cand, candRes);
        const betterLocal = scoreGt(candScore, localScore);
        const softOk =
          objective === "bosses"
            ? candScore.bossesPerDay >= localScore.bossesPerDay - 0.5
            : objective === "loot"
              ? candScore.lootScore >= localScore.lootScore - 0.5
              : candScore.avgStage >= localScore.avgStage - 0.5;
        const accept = betterLocal || (stagnant > 4 && softOk && rng.random() < 0.12);
        if (accept) {
          tal = nxtTal;
          attr = nxtAttr;
          localCfg = cand;
          localRes = candRes;
          localScore = candScore;
          stagnant = betterLocal ? 0 : stagnant + 1;
        } else {
          stagnant += 1;
        }
        loopNotify(
          `Screen r${restart + 1} eval ${loopEvals}`,
          screenBestScore?.avgStage,
          screenBestScore?.lootScore,
          screenBestScore?.bossesPerDay,
        );
      }

      // Learn mid-loop so later restarts prefer elite talent/attr spends.
      learnFromScreened([...screenedByKey.values()]);
    }

    const screened = sortByScoreDesc([...screenedByKey.values()]);
    learnFromScreened(screened);

    const nRefineHere = Math.min(refineCap, refineCountFor(screened.length, opt));
    const refinePool = screened.slice(0, nRefineHere);

    let refineBestCfg = null;
    let refineBestScore = null;
    let refineBestEval = null;

    for (let i = 0; i < refinePool.length; i++) {
      if (isCancelled()) break;
      const { sc, cfg } = refinePool[i];
      loopNotify(
        `Refine ${i + 1}/${refinePool.length} (${opt.nRefine} sims)…`,
        sc.avgStage,
        sc.lootScore,
        sc.bossesPerDay,
      );
      const r = await evaluate(cfg, opt.nRefine, useTm && !opt.diverseTimeless);
      if (!r) continue;
      evals += 1;
      loopEvals += 1;
      const rSc = mkScore(r);
      history.push(rSc);
      if (scoreGt(rSc, refineBestScore)) {
        refineBestScore = rSc;
        refineBestCfg = structuredClone(cfg);
        refineBestEval = r;
      }
      loopNotify(
        `Refined ${i + 1}`,
        refineBestScore?.avgStage,
        refineBestScore?.lootScore,
        refineBestScore?.bossesPerDay,
      );
    }

    globalDone = Math.min(totalBudget, 1 + (loop + 1) * perLoopBudget);
    const champCfg = refineBestCfg || screenBestCfg;
    const champScore = refineBestScore || screenBestScore;
    const champEval = refineBestEval || screened[0]?.res || null;
    if (champCfg && champScore) {
      loopChampions.push({
        loop: loop + 1,
        cfg: champCfg,
        res: champEval,
        sc: champScore,
      });
      loopNotify(
        objective === "bosses"
          ? `Champion ${champScore.bossesPerDay.toFixed(1)} bosses/d`
          : objective === "loot"
            ? `Champion loot ${champScore.lootScore.toFixed(1)}`
            : `Champion Ø ${champScore.avgStage.toFixed(1)}`,
        champScore.avgStage,
        champScore.lootScore,
        champScore.bossesPerDay,
      );
    }
  }

  let searchBestCfg = null;
  let searchBestScore = null;
  let searchBestEval = null;

  const unique = [];
  const seen = new Set();
  for (const ch of loopChampions) {
    const key = configKey(ch.cfg);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(ch);
  }

  for (let i = 0; i < unique.length; i++) {
    if (isCancelled()) break;
    const ch = unique[i];
    globalDone = Math.min(totalBudget, 1 + loops * perLoopBudget + i + 1);
    const prefix = loops > 1 ? `Final ${i + 1}/${unique.length} · ` : "Final · ";
    notify(
      `${prefix}Compare (${opt.nRefine} sims)…`,
      globalDone,
      ch.sc?.avgStage,
      ch.sc?.lootScore,
      ch.sc?.bossesPerDay,
    );
    const r = await evaluate(ch.cfg, opt.nRefine, useTm && !opt.diverseTimeless);
    if (!r) continue;
    evals += 1;
    const sc = mkScore(r);
    history.push(sc);
    if (scoreGt(sc, searchBestScore)) {
      searchBestScore = sc;
      searchBestCfg = structuredClone(ch.cfg);
      searchBestEval = r;
    }
    notify(
      objective === "bosses"
        ? `${prefix}${sc.bossesPerDay.toFixed(1)} bosses/d · loot ${sc.lootScore.toFixed(1)}`
        : objective === "loot"
          ? `${prefix}loot ${sc.lootScore.toFixed(1)} · Ø ${sc.avgStage.toFixed(1)}`
          : `${prefix}Ø ${sc.avgStage.toFixed(1)} · loot ${sc.lootScore.toFixed(1)}`,
      globalDone,
      searchBestScore?.avgStage,
      searchBestScore?.lootScore,
      searchBestScore?.bossesPerDay,
    );
  }

  if (!searchBestCfg && loopChampions.length) {
    const ch = loopChampions.reduce((best, cur) =>
      scoreGt(cur.sc, best.sc) ? cur : best,
    );
    searchBestCfg = ch.cfg;
    searchBestScore = ch.sc;
    searchBestEval = ch.res;
  }

  const improved =
    searchBestCfg != null && scoreGt(searchBestScore, baselineScore);
  const bestCfg = improved ? searchBestCfg : structuredClone(baselineCfg);
  const bestScore = improved ? searchBestScore : baselineScore;
  const bestEval = improved ? searchBestEval : baselineEval;

  notify("Done", totalBudget, bestScore.avgStage, bestScore.lootScore, bestScore.bossesPerDay);

  return {
    bestConfig: bestCfg,
    bestScore,
    bestEval,
    baselineConfig: baselineCfg,
    baselineScore,
    baselineEval,
    improved,
    history,
    evals,
    loops,
    loopChampions: loopChampions.length,
    nSearch: opt.nSearch,
    nRefine: opt.nRefine,
    objective,
    bossStages,
  };
}

/** Sims per screened build. Screening only; no refine pass. */
const FIRST_BOSS_SCREEN_SIMS = 50;

/** Talent points left after the toggles go here so the level budget is spent. */
const BORGE_TALENT_FILLER = "presence_of_god";
const BORGE_TALENT_FILLER_MAX = 15;

/** 0 or the tested level. Presence Of A God is not a toggle; it takes the remainder. */
const BORGE_TALENT_TOGGLES = [
  ["death_is_my_companion", [0, 2]],
  ["life_of_the_hunt", [0, 5]],
  ["unfair_advantage", [0, 5]],
  ["impeccable_impacts", [0, 10]],
  ["omen_of_defeat", [0, 10]],
  ["fires_of_war", [0, 15]],
];

const BORGE_FACTORS = [
  ...BORGE_TALENT_TOGGLES.map(([key]) => ({ key, kind: "talent" })),
  { key: "spartan_lineage", kind: "attribute" },
  { key: "helltouch_barrier", kind: "attribute" },
  { key: "lifedrain_inhalers", kind: "attribute" },
  { key: "explosive_punches", kind: "attribute" },
  { key: "book_of_baal", kind: "attribute" },
  { key: "superior_sensors", kind: "attribute" },
  { key: "atlas_protocol", kind: "attribute" },
  { key: "weakspot_analysis", kind: "attribute" },
  { key: "born_for_battle", kind: "attribute" },
];

/**
 * Levels for a skill that beat off in screen 1 but was not the largest drop.
 * The largest drop is locked. A skill that did not beat off is locked at 0.
 * Nothing here is pinned to one named skill.
 */
const SCREEN2_FINE_LEVELS = {
  death_is_my_companion: [0, 2],
  life_of_the_hunt: [0, 2, 5],
  unfair_advantage: [0, 2, 5],
  impeccable_impacts: [0, 5, 10],
  omen_of_defeat: [0, 5, 10],
  fires_of_war: [0, 5, 10, 15],
  helltouch_barrier: [0, 1],
  lifedrain_inhalers: [0, 4, 7, 10],
  explosive_punches: [0, 3, 6],
  book_of_baal: [0, 2, 4, 6],
  spartan_lineage: [0, 3, 6],
  superior_sensors: [0, 3, 6],
};

const SCREEN2_TALENT_KEYS = [
  "death_is_my_companion",
  "life_of_the_hunt",
  "unfair_advantage",
  "impeccable_impacts",
  "omen_of_defeat",
  "fires_of_war",
];

const SCREEN2_ATTR_KEYS = [
  "spartan_lineage",
  "lifedrain_inhalers",
  "explosive_punches",
  "book_of_baal",
  "superior_sensors",
  "atlas_protocol",
  "weakspot_analysis",
  "born_for_battle",
];

const SCREEN2_ATTR_PARENT = {
  lifedrain_inhalers: "helltouch_barrier",
  explosive_punches: "helltouch_barrier",
  superior_sensors: "book_of_baal",
  atlas_protocol: "superior_sensors",
  weakspot_analysis: "explosive_punches",
  born_for_battle: "spartan_lineage",
};

const SCREEN2_ATTR_COST = {
  spartan_lineage: 2,
  helltouch_barrier: 2,
  lifedrain_inhalers: 2,
  explosive_punches: 3,
  book_of_baal: 3,
  superior_sensors: 2,
  atlas_protocol: 3,
  weakspot_analysis: 2,
  born_for_battle: 5,
};

/** Shown when both sides take more than one level. Screen 2 wins if it is finer. */
const BOSS_SCREEN_PAIRS = [
  ["death_is_my_companion", "lifedrain_inhalers"],
  ["lifedrain_inhalers", "explosive_punches"],
  ["lifedrain_inhalers", "book_of_baal"],
];

/** Screen 2 stays near screen 1's build count. Extra steps on the smallest lifts go first. */
const SCREEN2_ROW_CAP = 1500;

function borgeTalentRows(budget) {
  const rows = [];
  const picked = [];
  const walk = (index, spent) => {
    if (index === BORGE_TALENT_TOGGLES.length) {
      const remainder = budget - spent;
      if (remainder < 0 || remainder > BORGE_TALENT_FILLER_MAX) return;
      const row = { call_me_lucky_loot: 0, [BORGE_TALENT_FILLER]: remainder };
      for (let i = 0; i < BORGE_TALENT_TOGGLES.length; i++) row[BORGE_TALENT_TOGGLES[i][0]] = picked[i];
      rows.push(row);
      return;
    }
    for (const level of BORGE_TALENT_TOGGLES[index][1]) {
      if (spent + level > budget) continue;
      picked[index] = level;
      walk(index + 1, spent + level);
    }
  };
  walk(0, 0);
  return rows;
}

/** Discrete attribute rows for `budget` points. Soul Of Ares takes the remainder. */
function borgeAttributeRows(budget) {
  const rows = [];
  for (const spartan of [0, 6]) {
    for (const hell of [0, 1]) {
      for (const life of hell ? [0, 10] : [0]) {
        for (const exp of hell ? [0, 6] : [0]) {
          for (const baal of [0, 3, 6]) {
            for (const sensors of baal ? [0, 6] : [0]) {
              for (const atlas of sensors ? [0, 2, 6] : [0]) {
                for (const weak of exp ? [0, 6] : [0]) {
                  for (const born of spartan ? [0, 3] : [0]) {
                    const high = 3 * atlas + 2 * weak + 5 * born;
                    if (high > budget) continue;
                    if ((atlas || weak || born) && budget - high < 75) continue;
                    const ylith = spartan ? 1 : 0;
                    const mid = spartan * 2 + hell * 2 + life * 2 + exp * 3 + baal * 3 + sensors * 2;
                    const ares = budget - high - mid - ylith;
                    const aresMin = ylith || hell || baal ? 1 : 0;
                    if (ares < aresMin) continue;
                    rows.push({
                      soul_of_ares: ares,
                      essence_of_ylith: ylith,
                      spartan_lineage: spartan,
                      timeless_mastery: 0,
                      book_of_baal: baal,
                      superior_sensors: sensors,
                      helltouch_barrier: hell,
                      lifedrain_inhalers: life,
                      explosive_punches: exp,
                      atlas_protocol: atlas,
                      weakspot_analysis: weak,
                      born_for_battle: born,
                      soul_of_the_minotaur: 0,
                      soul_of_hermes: 0,
                      soul_of_athena: 0,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return rows;
}

/**
 * Remaining boss HP in percent. Lower is closer to a kill.
 * The WASM getter is 0 both when the hunter never reaches the boss and when the
 * boss is already dead, so those two cases are split on the stage.
 */
function bossHpRemaining(sim, bossStage) {
  const hp = Number(sim.bossHpPercent);
  const avg = Number(sim.avgStage) || 0;
  const max = Number(sim.maxStage) || avg;
  if (max > bossStage + 0.05) return 0;
  if (max < bossStage - 0.05) return 100;
  if (!Number.isFinite(hp) || hp <= 0) return avg >= bossStage - 0.05 ? 0 : 100;
  return hp;
}

function screen2Plan(ranked) {
  const locks = new Map();
  const reasons = new Map();
  const open = new Map();
  const positive = ranked.factors.filter((factor) => factor.level > 0 && factor.lift > 0);
  const top = positive[0] || null;

  const lockAt = (key, level, reason) => {
    open.delete(key);
    locks.set(key, level);
    reasons.set(key, reason);
  };

  for (const factor of ranked.fixed) lockAt(factor.key, Number(factor.level) || 0, "fixed");
  for (const factor of ranked.factors) {
    const level = Number(factor.level) || 0;
    const lift = Number(factor.lift) || 0;
    if (!(level > 0) || !(lift > 0)) {
      lockAt(factor.key, 0, "off");
      continue;
    }
    if (top && factor.key === top.key) {
      lockAt(factor.key, level, "top");
      continue;
    }
    const fine = SCREEN2_FINE_LEVELS[factor.key];
    if (fine) open.set(factor.key, fine.slice());
    else lockAt(factor.key, level, "top");
  }

  const isOn = (key) => open.has(key) || (locks.get(key) || 0) > 0;
  if ((isOn("lifedrain_inhalers") || isOn("explosive_punches")) && reasons.get("helltouch_barrier") !== "top") {
    lockAt("helltouch_barrier", 1, "parent");
  }
  if ((locks.get("helltouch_barrier") || 0) <= 0 && !open.has("helltouch_barrier")) {
    if (isOn("lifedrain_inhalers")) lockAt("lifedrain_inhalers", 0, "off");
    if (isOn("explosive_punches")) lockAt("explosive_punches", 0, "off");
  }
  if (!isOn("book_of_baal") && isOn("superior_sensors")) lockAt("superior_sensors", 0, "off");
  if (!isOn("superior_sensors") && isOn("atlas_protocol")) lockAt("atlas_protocol", 0, "off");
  if (!isOn("explosive_punches") && isOn("weakspot_analysis")) lockAt("weakspot_analysis", 0, "off");
  if (!isOn("spartan_lineage") && isOn("born_for_battle")) lockAt("born_for_battle", 0, "off");

  return {
    locks,
    open,
    topKey: top ? top.key : null,
    lockList: [...locks.entries()].map(([key, level]) => ({
      key,
      level,
      reason: reasons.get(key) || "fixed",
    })),
  };
}

function borgeScreen2TalentRows(budget, plan) {
  const rows = [];
  const picked = {};
  const walk = (index, spent) => {
    if (index === SCREEN2_TALENT_KEYS.length) {
      const presence = budget - spent;
      if (presence < 0 || presence > BORGE_TALENT_FILLER_MAX) return;
      rows.push({
        ...picked,
        call_me_lucky_loot: 0,
        [BORGE_TALENT_FILLER]: presence,
      });
      return;
    }
    const key = SCREEN2_TALENT_KEYS[index];
    const choices = plan.open.has(key) ? plan.open.get(key) : [plan.locks.get(key) || 0];
    for (const level of choices) {
      if (spent + level > budget) continue;
      picked[key] = level;
      walk(index + 1, spent + level);
    }
  };
  walk(0, 0);
  return rows;
}

function borgeScreen2AttributeRows(budget, plan) {
  const rows = [];
  const picked = { helltouch_barrier: plan.locks.get("helltouch_barrier") || 0 };
  const walk = (index) => {
    if (index === SCREEN2_ATTR_KEYS.length) {
      const spartan = picked.spartan_lineage || 0;
      const ylith = spartan > 0 ? 1 : 0;
      const atlas = picked.atlas_protocol || 0;
      const weak = picked.weakspot_analysis || 0;
      const born = picked.born_for_battle || 0;
      const high = 3 * atlas + 2 * weak + 5 * born;
      if ((atlas || weak || born) && budget - high < 75) return;
      let spent = ylith;
      for (const [key, cost] of Object.entries(SCREEN2_ATTR_COST)) {
        spent += (picked[key] || 0) * cost;
      }
      const baal = picked.book_of_baal || 0;
      const hell = picked.helltouch_barrier || 0;
      const ares = budget - spent;
      const aresMin = ylith || hell || baal ? 1 : 0;
      if (ares < aresMin) return;
      rows.push({
        soul_of_ares: ares,
        essence_of_ylith: ylith,
        spartan_lineage: spartan,
        timeless_mastery: 0,
        book_of_baal: baal,
        superior_sensors: picked.superior_sensors || 0,
        helltouch_barrier: hell,
        lifedrain_inhalers: picked.lifedrain_inhalers || 0,
        explosive_punches: picked.explosive_punches || 0,
        atlas_protocol: atlas,
        weakspot_analysis: weak,
        born_for_battle: born,
        soul_of_the_minotaur: 0,
        soul_of_hermes: 0,
        soul_of_athena: 0,
      });
      return;
    }
    const key = SCREEN2_ATTR_KEYS[index];
    const choices = plan.open.has(key) ? plan.open.get(key) : [plan.locks.get(key) || 0];
    const parent = SCREEN2_ATTR_PARENT[key];
    for (const level of choices) {
      if (level > 0 && parent && !(picked[parent] > 0)) continue;
      picked[key] = level;
      walk(index + 1);
    }
  };
  walk(0);
  return rows;
}

function dropOneFineLevel(levels, bestLevel) {
  const extras = levels.filter((level) => level !== 0 && level !== bestLevel);
  if (!extras.length) return levels;
  const drop = extras[Math.floor(extras.length / 2)];
  return levels.filter((level) => level !== drop);
}

/** Shrink the finer grids, smallest screen-1 lift first, until the build count fits. */
function fitScreen2Rows(plan, ranked, talentBudget, attrBudget) {
  const bestLevel = new Map(ranked.factors.map((factor) => [factor.key, Number(factor.level) || 0]));
  const lift = new Map(ranked.factors.map((factor) => [factor.key, Number(factor.lift) || 0]));
  let talentRows = borgeScreen2TalentRows(talentBudget, plan);
  let attrRows = borgeScreen2AttributeRows(attrBudget, plan);
  const candidates = () => [...plan.open.keys()]
    .filter((key) => (plan.open.get(key) || []).length > 2)
    .sort((a, b) => (lift.get(a) || 0) - (lift.get(b) || 0) || a.localeCompare(b));
  while (talentRows.length * attrRows.length > SCREEN2_ROW_CAP) {
    const key = candidates()[0];
    if (!key) break;
    const next = dropOneFineLevel(plan.open.get(key), bestLevel.get(key) || 0);
    if (next.length === plan.open.get(key).length) break;
    plan.open.set(key, next);
    talentRows = borgeScreen2TalentRows(talentBudget, plan);
    attrRows = borgeScreen2AttributeRows(attrBudget, plan);
  }
  return { talentRows, attrRows };
}

function crossBudgetRows(talentRows, attrRows) {
  const rows = [];
  for (const talents of talentRows) {
    for (const attributes of attrRows) rows.push({ talents, attributes });
  }
  return rows;
}

function pairGrid(samples, keyA, keyB) {
  const cells = new Map();
  const levelsA = new Set();
  const levelsB = new Set();
  for (const sample of samples) {
    const a = Number(sample.points[keyA]) || 0;
    const b = Number(sample.points[keyB]) || 0;
    levelsA.add(a);
    levelsB.add(b);
    const id = `${a}|${b}`;
    let group = cells.get(id);
    if (!group) {
      group = { sum: 0, n: 0 };
      cells.set(id, group);
    }
    group.sum += sample.bossHp;
    group.n += 1;
  }
  if (levelsA.size < 2 || levelsB.size < 2) return null;
  const aLevels = [...levelsA].sort((a, b) => a - b);
  const bLevels = [...levelsB].sort((a, b) => a - b);
  let best = Infinity;
  const means = aLevels.map((a) => bLevels.map((b) => {
    const group = cells.get(`${a}|${b}`);
    if (!group?.n) return null;
    const mean = group.sum / group.n;
    if (mean < best) best = mean;
    return mean;
  }));
  return { keyA, keyB, aLevels, bLevels, means, best: Number.isFinite(best) ? best : null };
}

function collectPairs(samples, screenTitle) {
  const pairs = [];
  for (const [keyA, keyB] of BOSS_SCREEN_PAIRS) {
    const grid = pairGrid(samples, keyA, keyB);
    if (grid) pairs.push({ ...grid, screen: screenTitle });
  }
  return pairs;
}

function mergePairs(first, second) {
  const byKey = new Map();
  for (const pair of first) byKey.set(`${pair.keyA}|${pair.keyB}`, pair);
  for (const pair of second) {
    const id = `${pair.keyA}|${pair.keyB}`;
    const prev = byKey.get(id);
    const cells = pair.aLevels.length * pair.bLevels.length;
    const prevCells = prev ? prev.aLevels.length * prev.bLevels.length : -1;
    if (!prev || cells >= prevCells) byKey.set(id, pair);
  }
  return BOSS_SCREEN_PAIRS
    .map(([keyA, keyB]) => byKey.get(`${keyA}|${keyB}`))
    .filter(Boolean);
}

function screenFactorLifts(samples, factorList = BORGE_FACTORS) {
  const factors = [];
  const fixed = [];
  for (const spec of factorList) {
    const groups = new Map();
    for (const sample of samples) {
      const level = Number(sample.points[spec.key]) || 0;
      let group = groups.get(level);
      if (!group) {
        group = { sum: 0, n: 0 };
        groups.set(level, group);
      }
      group.sum += sample.bossHp;
      group.n += 1;
    }
    if (groups.size < 2) {
      fixed.push({ key: spec.key, kind: spec.kind, level: [...groups.keys()][0] || 0 });
      continue;
    }
    const off = groups.get(0);
    let baseLevel = 0;
    let baseMean;
    if (off) {
      baseMean = off.sum / off.n;
    } else {
      baseMean = -Infinity;
      for (const [level, group] of groups) {
        const mean = group.sum / group.n;
        if (mean > baseMean) {
          baseMean = mean;
          baseLevel = level;
        }
      }
    }
    let bestLevel = baseLevel;
    let bestMean = baseMean;
    for (const [level, group] of groups) {
      const mean = group.sum / group.n;
      if (mean < bestMean) {
        bestMean = mean;
        bestLevel = level;
      }
    }
    factors.push({
      key: spec.key,
      kind: spec.kind,
      level: bestLevel,
      mean: bestMean,
      baseMean,
      baseLevel,
      lift: baseMean - bestMean,
    });
  }
  factors.sort((a, b) => b.lift - a.lift || a.mean - b.mean || a.key.localeCompare(b.key));
  return { factors, fixed };
}

/** Cheap unlock steps screen 2 never tried. Atlas needs Sensors, Sensors need Baal. */
const REFINE_CHAIN = ["book_of_baal", "superior_sensors", "atlas_protocol"];

function recordedLevel(screen, key) {
  const factor = (screen?.factors || []).find((row) => row.key === key);
  if (factor) return factor;
  const lock = (screen?.locks || []).find((row) => row.key === key);
  if (lock) return lock;
  return (screen?.fixed || []).find((row) => row.key === key) || null;
}

function uniqLevels(levels) {
  return [...new Set(levels.map((level) => Number(level) || 0).filter((level) => level > 0))].sort((a, b) => a - b);
}

function uniqLevelsKeepZero(levels) {
  return [...new Set(levels.map((level) => Number(level) || 0))].sort((a, b) => a - b);
}

function championLevel(champion, key) {
  if (!champion) return 0;
  if (champion.talents && key in champion.talents) return Number(champion.talents[key]) || 0;
  if (champion.attributes && key in champion.attributes) return Number(champion.attributes[key]) || 0;
  return Number(champion.points?.[key]) || 0;
}

/** Put the current best build's levels back into the next grid so that row can still appear. */
function admitChampion(plan, champion) {
  if (!champion) return plan;
  const keys = [...SCREEN2_TALENT_KEYS, ...SCREEN2_ATTR_KEYS];
  for (const key of keys) {
    const level = championLevel(champion, key);
    if (plan.open.has(key)) {
      plan.open.set(key, uniqLevelsKeepZero([...plan.open.get(key), level]));
      continue;
    }
    const locked = Number(plan.locks.get(key)) || 0;
    if (locked === level) continue;
    plan.locks.delete(key);
    plan.open.set(key, uniqLevelsKeepZero([locked, level]));
  }
  if (Array.isArray(plan.lockList)) {
    plan.lockList = plan.lockList.filter((lock) => plan.locks.has(lock.key));
  }
  return plan;
}

function buildKey(row) {
  return JSON.stringify({ t: row.talents || {}, a: row.attributes || {} });
}

function includeChampion(rows, champion) {
  if (!champion?.talents || !champion?.attributes) return rows;
  const row = { talents: { ...champion.talents }, attributes: { ...champion.attributes } };
  const id = buildKey(row);
  if (rows.some((item) => buildKey(item) === id)) return rows;
  return [...rows, row];
}

function betterSample(current, next) {
  if (!current) return next || null;
  if (!next) return current;
  if (next.bossHp < current.bossHp) return next;
  if (next.bossHp === current.bossHp && (next.avgStage || 0) > (current.avgStage || 0)) return next;
  return current;
}

function asChampion(sample) {
  if (!sample?.talents || !sample?.attributes) return null;
  return {
    bossHp: sample.bossHp,
    avgStage: sample.avgStage || 0,
    talents: { ...sample.talents },
    attributes: { ...sample.attributes },
    points: { ...(sample.points || {}), ...sample.talents, ...sample.attributes },
  };
}

/** Later phase keeps the incumbent unless a new row leaves less boss HP. */
function publishFunnel(screen, incumbent) {
  const own = Number.isFinite(screen?.bossHp) ? {
    bossHp: screen.bossHp,
    avgStage: screen.avgStage,
    talents: screen.talents,
    attributes: screen.attributes,
  } : null;
  const chosen = betterSample(incumbent, own);
  return {
    ...screen,
    bossHp: chosen ? chosen.bossHp : null,
    avgStage: chosen ? chosen.avgStage : null,
    talents: chosen ? chosen.talents : null,
    attributes: chosen ? chosen.attributes : null,
    ownBossHp: screen?.bossHp ?? null,
    kept: !!(incumbent && chosen === incumbent),
  };
}

/**
 * Hold the best build so far. Step Baal, Sensors, and Atlas at the cheap levels
 * the earlier grids skipped, and keep that build's own level in the list.
 */
function refine1Plan(screen1, screen2, champion) {
  const locks = new Map();
  const reasons = new Map();
  const open = new Map();
  const chain = new Set(REFINE_CHAIN);
  const lockAt = (key, level, reason) => {
    open.delete(key);
    locks.set(key, level);
    reasons.set(key, reason);
  };

  for (const lock of screen2.locks || []) {
    if (!chain.has(lock.key)) lockAt(lock.key, Number(lock.level) || 0, lock.reason || "fixed");
  }
  for (const factor of screen2.factors || []) {
    if (chain.has(factor.key)) continue;
    const level = Number(factor.level) || 0;
    lockAt(factor.key, level, level > 0 && factor.lift > 0 ? "held" : "off");
  }
  for (const factor of screen2.fixed || []) {
    if (chain.has(factor.key) || locks.has(factor.key)) continue;
    lockAt(factor.key, Number(factor.level) || 0, "fixed");
  }

  const atlas = recordedLevel(screen1, "atlas_protocol") || recordedLevel(screen2, "atlas_protocol");
  const sensors = recordedLevel(screen2, "superior_sensors") || recordedLevel(screen1, "superior_sensors");
  const baal = recordedLevel(screen2, "book_of_baal") || recordedLevel(screen1, "book_of_baal");
  const atlasOn = !!(atlas && Number(atlas.level) > 0 && (Number(atlas.lift) > 0 || atlas.reason === "top" || atlas.reason === "held"));

  if (atlasOn) open.set("atlas_protocol", uniqLevels([1, 2, atlas.level]));
  else lockAt("atlas_protocol", 0, "off");

  const sensorsPay = sensors && Number(sensors.level) > 0 && (Number(sensors.lift) > 0 || sensors.reason === "top" || sensors.reason === "held");
  if (atlasOn || sensorsPay) open.set("superior_sensors", uniqLevels([1, 2, sensors?.level]));
  else lockAt("superior_sensors", 0, "off");

  const baalPay = baal && Number(baal.level) > 0 && (Number(baal.lift) > 0 || baal.reason === "top" || baal.reason === "held");
  if (atlasOn || baalPay) open.set("book_of_baal", uniqLevels([1, 2, baal?.level]));
  else lockAt("book_of_baal", 0, "off");

  if (champion) {
    for (const key of [...SCREEN2_TALENT_KEYS, ...SCREEN2_ATTR_KEYS, "helltouch_barrier"]) {
      if (REFINE_CHAIN.includes(key)) continue;
      lockAt(key, championLevel(champion, key), "incumbent");
    }
    for (const key of REFINE_CHAIN) {
      const level = championLevel(champion, key);
      if (open.has(key)) open.set(key, uniqLevelsKeepZero([...open.get(key), level]));
    }
  }

  return {
    locks,
    open,
    openList: [...open.entries()].map(([key, levels]) => ({ key, levels })),
    lockList: [...locks.entries()].map(([key, level]) => ({
      key,
      level,
      reason: reasons.get(key) || "held",
    })),
  };
}

function refine1TalentRows(budget, plan, screen2) {
  const rows = borgeScreen2TalentRows(budget, plan);
  if (rows.length) return rows;
  const relaxed = { locks: new Map(plan.locks), open: new Map(plan.open) };
  for (const factor of screen2.factors || []) {
    if (!SCREEN2_TALENT_KEYS.includes(factor.key)) continue;
    const fine = SCREEN2_FINE_LEVELS[factor.key];
    if (!fine) continue;
    relaxed.locks.delete(factor.key);
    relaxed.open.set(factor.key, fine.slice());
  }
  return borgeScreen2TalentRows(budget, relaxed);
}

function chainSteps(samples) {
  return REFINE_CHAIN.map((key) => {
    const groups = new Map();
    for (const sample of samples) {
      const level = Number(sample.points[key]) || 0;
      let group = groups.get(level);
      if (!group) {
        group = { sum: 0, n: 0 };
        groups.set(level, group);
      }
      group.sum += sample.bossHp;
      group.n += 1;
    }
    const levels = [...groups.keys()].sort((a, b) => a - b);
    if (levels.length < 2) return null;
    const cost = SCREEN2_ATTR_COST[key] || 1;
    const means = levels.map((level) => ({
      level,
      mean: groups.get(level).sum / groups.get(level).n,
      points: level * cost,
    }));
    const steps = [];
    for (let i = 1; i < means.length; i++) {
      const dPts = means[i].points - means[i - 1].points;
      const dHp = means[i - 1].mean - means[i].mean;
      steps.push({
        from: means[i - 1].level,
        to: means[i].level,
        dHp,
        dPts,
        perPoint: dPts ? dHp / dPts : 0,
      });
    }
    return { key, means, steps };
  }).filter(Boolean);
}

async function simulateBossScreen({
  rows, base, engine, hunter, bossStage, level, screen, screens, phase, floor, onProgress, isCancelled,
}) {
  const { wasmToSimResult } = hunter;
  const samples = [];
  let best = null;
  const total = rows.length;
  let done = 0;
  for (const row of rows) {
    if (isCancelled()) return { cancelled: true };
    const cfg = structuredClone(base);
    cfg.talents = { ...row.talents };
    cfg.attributes = { ...row.attributes };
    const validated = validateBudgets(cfg, hunter);
    done += 1;
    const phaseText = phase || `screen ${screen}/${screens}`;
    let shown = betterSample(floor, best);
    const bestText = shown ? ` · best ${shown.bossHp.toFixed(1)}% boss HP` : "";
    if (!validated.ok) {
      onProgress({
        msg: `level ${level} · boss ${bossStage} · ${phaseText} · ${done}/${total}${bestText}`,
        done,
        total,
        screen,
        screens,
        bossHp: shown?.bossHp ?? null,
      });
      continue;
    }
    await yieldToUi();
    if (isCancelled()) return { cancelled: true };
    const sim = wasmToSimResult(engine.evaluate(validated.config, FIRST_BOSS_SCREEN_SIMS), FIRST_BOSS_SCREEN_SIMS);
    const bossHp = bossHpRemaining(sim, bossStage);
    const sample = {
      bossHp,
      avgStage: Number(sim.avgStage) || 0,
      talents: { ...row.talents },
      attributes: { ...row.attributes },
      points: { ...row.talents, ...row.attributes },
    };
    samples.push(sample);
    if (
      !best ||
      sample.bossHp < best.bossHp ||
      (sample.bossHp === best.bossHp && sample.avgStage > best.avgStage)
    ) {
      best = sample;
    }
    shown = betterSample(floor, best);
    onProgress({
      msg: `level ${level} · boss ${bossStage} · ${phaseText} · ${done}/${total} · best ${shown.bossHp.toFixed(1)}% boss HP`,
      done,
      total,
      screen,
      screens,
      bossHp: shown.bossHp,
    });
  }
  return { cancelled: false, samples, best };
}

function packScreen(title, kind, run, ranked, extra = {}) {
  return {
    title,
    kind,
    rows: run.samples.length,
    bossHp: run.best ? run.best.bossHp : null,
    avgStage: run.best ? run.best.avgStage : null,
    talents: run.best ? run.best.talents : null,
    attributes: run.best ? run.best.attributes : null,
    factors: ranked.factors,
    fixed: ranked.fixed,
    ...extra,
  };
}

let bossP = null;

function ozzyBossProfile() {
  const talentToggles = [
    ["death_is_my_companion", [0, 2]],
    ["tricksters_boon", [0, 1]],
    ["unfair_advantage", [0, 5]],
    ["thousand_needles", [0, 10]],
    ["omen_of_decay", [0, 10]],
    ["crippling_shots", [0, 15]],
  ];
  const attrToggles = [
    ["exo_piercers", [0, 5]],
    ["wings_of_ibu", [0, 5]],
    ["shimmering_scorpions", [0, 5]],
    ["extermination_protocol", [0, 5]],
    ["soul_of_snek", [0, 5]],
    ["vectid_elixir", [0, 10]],
    ["gift_of_medusa", [0, 5]],
    ["cycle_of_death", [0, 5]],
    ["deal_with_death", [0, 3]],
    ["dance_of_dashes", [0, 4]],
    ["blessing_of_the_sisters", [0, 1]],
    ["blessing_of_the_scarab", [0, 5]],
    ["blessing_of_the_cat", [0, 5]],
  ];
  return {
    talentToggles,
    attrToggles,
    talentKeys: talentToggles.map(([key]) => key),
    attrKeys: attrToggles.map(([key]) => key),
    factors: [
      ...talentToggles.map(([key]) => ({ key, kind: "talent" })),
      ...attrToggles.map(([key]) => ({ key, kind: "attribute" })),
    ],
    fineLevels: {
      death_is_my_companion: [0, 2],
      tricksters_boon: [0, 1],
      unfair_advantage: [0, 2, 5],
      thousand_needles: [0, 5, 10],
      omen_of_decay: [0, 5, 10],
      crippling_shots: [0, 5, 10, 15],
      exo_piercers: [0, 2, 5],
      wings_of_ibu: [0, 2, 5],
      shimmering_scorpions: [0, 2, 5],
      extermination_protocol: [0, 2, 5],
      soul_of_snek: [0, 2, 5],
      vectid_elixir: [0, 5, 10],
      gift_of_medusa: [0, 2, 5],
      cycle_of_death: [0, 2, 5],
      deal_with_death: [0, 1, 3],
      dance_of_dashes: [0, 2, 4],
      blessing_of_the_sisters: [0, 1],
      blessing_of_the_scarab: [0, 2, 5],
      blessing_of_the_cat: [0, 2, 5],
    },
    attrParent: {
      shimmering_scorpions: "exo_piercers",
      extermination_protocol: "wings_of_ibu",
      soul_of_snek: "extermination_protocol",
      vectid_elixir: "extermination_protocol",
      gift_of_medusa: "extermination_protocol",
      cycle_of_death: "soul_of_snek",
      deal_with_death: "cycle_of_death",
      dance_of_dashes: "shimmering_scorpions",
      blessing_of_the_sisters: "deal_with_death",
      blessing_of_the_scarab: "gift_of_medusa",
      blessing_of_the_cat: "dance_of_dashes",
    },
    attrCost: {
      living_off_the_land: 1, exo_piercers: 1, shimmering_scorpions: 3, timeless_mastery: 3,
      wings_of_ibu: 2, extermination_protocol: 2, soul_of_snek: 3, vectid_elixir: 2,
      cycle_of_death: 3, deal_with_death: 5, gift_of_medusa: 3, dance_of_dashes: 3,
      blessing_of_the_sisters: 15, blessing_of_the_scarab: 2, blessing_of_the_cat: 2,
    },
    talentFiller: "echo_bullets",
    talentFillerMax: 20,
    attrFiller: "living_off_the_land",
    luckyKey: "call_me_lucky_loot",
    refineChain: ["wings_of_ibu", "extermination_protocol", "soul_of_snek"],
    pairs: [
      ["exo_piercers", "shimmering_scorpions"],
      ["wings_of_ibu", "extermination_protocol"],
      ["extermination_protocol", "soul_of_snek"],
    ],
  };
}

function knoxBossProfile() {
  const talentToggles = [
    ["death_is_my_companion", [0, 2]],
    ["calypsos_advantage", [0, 5]],
    ["unfair_advantage", [0, 5]],
    ["ghost_bullets", [0, 15]],
    ["omen_of_defeat", [0, 10]],
    ["presence_of_god", [0, 10]],
  ];
  const attrToggles = [
    ["soul_amplification", [0, 10]],
    ["dead_men_tell_no_tales", [0, 10]],
    ["space_pirate_armory", [0, 10]],
    ["pirates_life_for_knox", [0, 5]],
    ["searious_efficiency", [0, 5]],
    ["passive_charge_tank", [0, 5]],
    ["king_of_torpedos", [0, 5]],
    ["fortification_elixir", [0, 10]],
    ["shield_of_poseidon", [0, 5]],
  ];
  return {
    talentToggles,
    attrToggles,
    talentKeys: talentToggles.map(([key]) => key),
    attrKeys: attrToggles.map(([key]) => key),
    factors: [
      ...talentToggles.map(([key]) => ({ key, kind: "talent" })),
      ...attrToggles.map(([key]) => ({ key, kind: "attribute" })),
    ],
    fineLevels: {
      death_is_my_companion: [0, 2],
      calypsos_advantage: [0, 2, 5],
      unfair_advantage: [0, 2, 5],
      ghost_bullets: [0, 5, 10, 15],
      omen_of_defeat: [0, 5, 10],
      presence_of_god: [0, 5, 10],
      soul_amplification: [0, 5, 10],
      dead_men_tell_no_tales: [0, 5, 10],
      space_pirate_armory: [0, 5, 10],
      pirates_life_for_knox: [0, 2, 5],
      searious_efficiency: [0, 2, 5],
      passive_charge_tank: [0, 2, 5],
      king_of_torpedos: [0, 2, 5],
      fortification_elixir: [0, 5, 10],
      shield_of_poseidon: [0, 2, 5],
    },
    attrParent: {
      dead_men_tell_no_tales: "soul_amplification",
      pirates_life_for_knox: "space_pirate_armory",
      passive_charge_tank: "searious_efficiency",
      king_of_torpedos: "passive_charge_tank",
      shield_of_poseidon: "fortification_elixir",
    },
    attrCost: {
      release_the_kraken: 1, soul_amplification: 1, dead_men_tell_no_tales: 2, space_pirate_armory: 2,
      pirates_life_for_knox: 3, timeless_mastery: 3, searious_efficiency: 2, passive_charge_tank: 4,
      king_of_torpedos: 5, fortification_elixir: 2, shield_of_poseidon: 3,
    },
    talentFiller: "finishing_move",
    talentFillerMax: 15,
    attrFiller: "release_the_kraken",
    luckyKey: "call_me_lucky_loot",
    refineChain: ["searious_efficiency", "passive_charge_tank", "king_of_torpedos"],
    pairs: [
      ["soul_amplification", "dead_men_tell_no_tales"],
      ["space_pirate_armory", "pirates_life_for_knox"],
      ["searious_efficiency", "passive_charge_tank"],
    ],
  };
}

function bossProfileFor(hunterId) {
  if (hunterId === "ozzy") return ozzyBossProfile();
  if (hunterId === "knox") return knoxBossProfile();
  return null;
}

function profileBossTalentRows(budget, choiceOf) {
  const rows = [];
  const picked = {};
  const walk = (index, spent) => {
    if (index === bossP.talentKeys.length) {
      const filler = budget - spent;
      if (filler < 0 || filler > bossP.talentFillerMax) return;
      rows.push({ ...picked, [bossP.luckyKey]: 0, [bossP.talentFiller]: filler });
      return;
    }
    const key = bossP.talentKeys[index];
    for (const level of choiceOf(key)) {
      if (spent + level > budget) continue;
      picked[key] = level;
      walk(index + 1, spent + level);
    }
  };
  walk(0, 0);
  return rows;
}

function profileBossAttrRows(budget, choiceOf) {
  const rows = [];
  const picked = {};
  const walk = (index) => {
    if (index === bossP.attrKeys.length) {
      let spent = 0;
      for (const key of bossP.attrKeys) spent += (Number(picked[key]) || 0) * (bossP.attrCost[key] || 1);
      const filler = budget - spent;
      const anyOn = bossP.attrKeys.some((key) => Number(picked[key]) > 0);
      if (filler < (anyOn ? 1 : 0)) return;
      const row = { [bossP.attrFiller]: filler, timeless_mastery: 0 };
      for (const key of bossP.attrKeys) row[key] = Number(picked[key]) || 0;
      if (bossP.isLegal && !bossP.isLegal(row)) return;
      rows.push(row);
      return;
    }
    const key = bossP.attrKeys[index];
    const parent = bossP.attrParent[key];
    const choices = parent && parent !== bossP.attrFiller && !(Number(picked[parent]) > 0)
      ? [0]
      : choiceOf(key);
    for (const level of choices) {
      picked[key] = level;
      walk(index + 1);
    }
  };
  walk(0);
  return rows;
}

function profileScreen1Choice() {
  const talents = new Map(bossP.talentToggles);
  const attrs = new Map(bossP.attrToggles);
  return {
    talent: (key) => talents.get(key) || [0],
    attr: (key) => attrs.get(key) || [0],
  };
}

function profilePlanChoice(plan) {
  return (key) => (plan.open.has(key) ? plan.open.get(key) : [plan.locks.get(key) || 0]);
}

function profileRepairParents(isOn, lockAt, open, locks) {
  for (const [child, parent] of Object.entries(bossP.attrParent)) {
    if (!bossP.attrKeys.includes(parent) || !isOn(child)) continue;
    const childOpen = open.has(child) ? open.get(child) : null;
    if (childOpen && childOpen.includes(0)) continue;
    if (!isOn(parent)) lockAt(parent, 1, "parent");
  }
  for (const [child, parent] of Object.entries(bossP.attrParent)) {
    if (!bossP.attrKeys.includes(parent)) continue;
    if ((locks.get(parent) || 0) <= 0 && !open.has(parent) && isOn(child)) lockAt(child, 0, "off");
  }
}

function profileScreen2Plan(ranked) {
  const locks = new Map();
  const reasons = new Map();
  const open = new Map();
  const positive = ranked.factors.filter((factor) => factor.level > 0 && factor.lift > 0);
  const top = positive[0] || null;
  const lockAt = (key, level, reason) => {
    open.delete(key);
    locks.set(key, level);
    reasons.set(key, reason);
  };
  for (const factor of ranked.fixed) lockAt(factor.key, Number(factor.level) || 0, "fixed");
  for (const factor of ranked.factors) {
    const level = Number(factor.level) || 0;
    const lift = Number(factor.lift) || 0;
    if (!(level > 0) || !(lift > 0)) {
      lockAt(factor.key, 0, "off");
      continue;
    }
    if (top && factor.key === top.key) {
      lockAt(factor.key, level, "top");
      continue;
    }
    const fine = bossP.fineLevels[factor.key];
    if (fine) open.set(factor.key, fine.slice());
    else lockAt(factor.key, level, "top");
  }
  const isOn = (key) => open.has(key) || (locks.get(key) || 0) > 0;
  profileRepairParents(isOn, lockAt, open, locks);
  return {
    locks,
    open,
    topKey: top ? top.key : null,
    lockList: [...locks.entries()].map(([key, level]) => ({
      key,
      level,
      reason: reasons.get(key) || "fixed",
    })),
  };
}

function profileFitScreen2(plan, ranked, talentBudget, attrBudget) {
  const bestLevel = new Map(ranked.factors.map((factor) => [factor.key, Number(factor.level) || 0]));
  const lift = new Map(ranked.factors.map((factor) => [factor.key, Number(factor.lift) || 0]));
  const choice = profilePlanChoice(plan);
  let talentRows = profileBossTalentRows(talentBudget, choice);
  let attrRows = profileBossAttrRows(attrBudget, choice);
  const candidates = () => [...plan.open.keys()]
    .filter((key) => (plan.open.get(key) || []).length > 2)
    .sort((a, b) => (lift.get(a) || 0) - (lift.get(b) || 0) || a.localeCompare(b));
  while (talentRows.length * attrRows.length > SCREEN2_ROW_CAP) {
    const key = candidates()[0];
    if (!key) break;
    const next = dropOneFineLevel(plan.open.get(key), bestLevel.get(key) || 0);
    if (next.length === plan.open.get(key).length) break;
    plan.open.set(key, next);
    const fitted = profilePlanChoice(plan);
    talentRows = profileBossTalentRows(talentBudget, fitted);
    attrRows = profileBossAttrRows(attrBudget, fitted);
  }
  return { talentRows, attrRows };
}

function profileRefinePlan(screen1, screen2, champion) {
  const locks = new Map();
  const reasons = new Map();
  const open = new Map();
  const chain = new Set(bossP.refineChain);
  const lockAt = (key, level, reason) => {
    open.delete(key);
    locks.set(key, level);
    reasons.set(key, reason);
  };
  for (const lock of screen2.locks || []) {
    if (!chain.has(lock.key)) lockAt(lock.key, Number(lock.level) || 0, lock.reason || "fixed");
  }
  for (const factor of screen2.factors || []) {
    if (chain.has(factor.key)) continue;
    const level = Number(factor.level) || 0;
    lockAt(factor.key, level, level > 0 && factor.lift > 0 ? "held" : "off");
  }
  for (const factor of screen2.fixed || []) {
    if (chain.has(factor.key) || locks.has(factor.key)) continue;
    lockAt(factor.key, Number(factor.level) || 0, "fixed");
  }
  const recorded = bossP.refineChain.map((key) => recordedLevel(screen1, key) || recordedLevel(screen2, key));
  const pays = recorded.map((row) => !!(
    row && Number(row.level) > 0 && (Number(row.lift) > 0 || row.reason === "top" || row.reason === "held")
  ));
  let openParent = false;
  for (let i = bossP.refineChain.length - 1; i >= 0; i--) {
    const key = bossP.refineChain[i];
    if (pays[i] || openParent) {
      openParent = true;
      open.set(key, uniqLevels([1, 2, recorded[i]?.level]));
    } else {
      lockAt(key, 0, "off");
    }
  }
  if (champion) {
    for (const key of [...bossP.talentKeys, ...bossP.attrKeys]) {
      if (chain.has(key)) continue;
      lockAt(key, championLevel(champion, key), "incumbent");
    }
    for (const key of bossP.refineChain) {
      const level = championLevel(champion, key);
      if (open.has(key)) open.set(key, uniqLevelsKeepZero([...open.get(key), level]));
    }
  }
  return {
    locks,
    open,
    openList: [...open.entries()].map(([key, levels]) => ({ key, levels })),
    lockList: [...locks.entries()].map(([key, level]) => ({
      key,
      level,
      reason: reasons.get(key) || "held",
    })),
  };
}

function profileCollectPairs(samples, screenTitle) {
  const pairs = [];
  for (const [keyA, keyB] of bossP.pairs) {
    const grid = pairGrid(samples, keyA, keyB);
    if (grid) pairs.push({ ...grid, screen: screenTitle });
  }
  return pairs;
}

function profileMergePairs(first, second) {
  const byKey = new Map();
  for (const pair of first) byKey.set(`${pair.keyA}|${pair.keyB}`, pair);
  for (const pair of second) {
    const id = `${pair.keyA}|${pair.keyB}`;
    const prev = byKey.get(id);
    const cells = pair.aLevels.length * pair.bLevels.length;
    const prevCells = prev ? prev.aLevels.length * prev.bLevels.length : -1;
    if (!prev || cells >= prevCells) byKey.set(id, pair);
  }
  return bossP.pairs
    .map(([keyA, keyB]) => byKey.get(`${keyA}|${keyB}`))
    .filter(Boolean);
}

function profileChainSteps(samples) {
  return bossP.refineChain.map((key) => {
    const groups = new Map();
    for (const sample of samples) {
      const level = Number(sample.points[key]) || 0;
      let group = groups.get(level);
      if (!group) {
        group = { sum: 0, n: 0 };
        groups.set(level, group);
      }
      group.sum += sample.bossHp;
      group.n += 1;
    }
    const levels = [...groups.keys()].sort((a, b) => a - b);
    if (levels.length < 2) return null;
    const cost = bossP.attrCost[key] || 1;
    const means = levels.map((level) => ({
      level,
      mean: groups.get(level).sum / groups.get(level).n,
      points: level * cost,
    }));
    const steps = [];
    for (let i = 1; i < means.length; i++) {
      const dPts = means[i].points - means[i - 1].points;
      const dHp = means[i - 1].mean - means[i].mean;
      steps.push({
        from: means[i - 1].level,
        to: means[i].level,
        dHp,
        dPts,
        perPoint: dPts ? dHp / dPts : 0,
      });
    }
    return { key, means, steps };
  }).filter(Boolean);
}

async function findProfileBossKill(baseConfig, engine, hunter, optIn, hooks, ready) {
  bossP = bossProfileFor(hunter.id);
  if (!bossP) throw new Error("This boss screen is not set up for this hunter.");
  const { onProgress, isCancelled, bossStages } = ready;
  const base = structuredClone(baseConfig);
  const maxLevel = Math.max(0, Math.min(999, Math.floor(Number(optIn.maxLevel ?? 999))));
  const level = Math.max(0, Math.min(maxLevel, Math.floor(Number(base.meta?.level) || 0)));
  base.meta = { ...(base.meta || {}), level };
  const caps = pointBudgets(level);
  bossP.isLegal = (row) => hunter.attrs.attributesTreeValid(row, caps.attributes).ok;
  const choice = profileScreen1Choice();
  const talentRows = profileBossTalentRows(caps.talents, choice.talent);
  const attrRows = profileBossAttrRows(caps.attributes, choice.attr);
  if (!talentRows.length || !attrRows.length) {
    throw new Error(
      `No screening rows fit level ${level} (${caps.talents} talent points, ${caps.attributes} attribute points).`,
    );
  }

  const bossStage = bossStages[0];
  const screens = 3;
  const shared = { base, engine, hunter, bossStage, level, screens, onProgress, isCancelled };
  const firstRun = await simulateBossScreen({
    ...shared,
    rows: crossBudgetRows(talentRows, attrRows),
    screen: 1,
    phase: "screen 1/3",
  });
  if (firstRun.cancelled) return { cancelled: true };
  if (!firstRun.samples.length) {
    throw new Error(`No valid screening rows at level ${level}.`);
  }
  const ranked1 = screenFactorLifts(firstRun.samples, bossP.factors);
  const screen1 = packScreen("Screen 1", "screen1", firstRun, ranked1, {
    ownBossHp: firstRun.best?.bossHp ?? null,
    kept: false,
  });
  let champion = asChampion(firstRun.best);
  const plan = profileScreen2Plan(ranked1);
  const fitted = profileFitScreen2(plan, ranked1, caps.talents, caps.attributes);
  const secondRows = includeChampion(crossBudgetRows(fitted.talentRows, fitted.attrRows), champion);
  let screen2;
  let secondSamples = [];
  if (!secondRows.length) {
    screen2 = {
      title: "Screen 2",
      kind: "screen2",
      rows: 0,
      bossHp: null,
      avgStage: null,
      talents: null,
      attributes: null,
      factors: [],
      fixed: [],
      locks: plan.lockList,
      topKey: plan.topKey,
    };
  } else {
    const secondRun = await simulateBossScreen({
      ...shared,
      rows: secondRows,
      screen: 2,
      phase: "screen 2/3",
      floor: champion,
    });
    if (secondRun.cancelled) return { cancelled: true };
    secondSamples = secondRun.samples;
    const ranked2 = screenFactorLifts(secondRun.samples, bossP.factors);
    screen2 = publishFunnel(packScreen("Screen 2", "screen2", secondRun, ranked2, {
      locks: plan.lockList,
      topKey: plan.topKey,
    }), champion);
  }
  if (champion && !Number.isFinite(screen2.bossHp)) screen2 = publishFunnel(screen2, champion);
  champion = asChampion(screen2) || champion;

  let refine = {
    title: "Refinement",
    kind: "refine",
    rows: 0,
    bossHp: null,
    avgStage: null,
    talents: null,
    attributes: null,
    factors: [],
    fixed: [],
    locks: [],
    steps: [],
    pairs: [],
    openList: [],
  };
  if (screen2.rows > 0) {
    const refinePlan = profileRefinePlan(screen1, screen2, champion);
    const refineChoice = profilePlanChoice(refinePlan);
    const refineTalents = profileBossTalentRows(caps.talents, refineChoice);
    const refineAttrs = profileBossAttrRows(caps.attributes, refineChoice);
    const refineRows = includeChampion(crossBudgetRows(refineTalents, refineAttrs), champion);
    refine = {
      ...refine,
      locks: refinePlan.lockList,
      openList: refinePlan.openList,
    };
    if (refineRows.length) {
      const refineRun = await simulateBossScreen({
        ...shared,
        rows: refineRows,
        screen: 3,
        phase: "refinement",
        floor: champion,
      });
      if (refineRun.cancelled) return { cancelled: true };
      const rankedRefine = screenFactorLifts(refineRun.samples, bossP.factors);
      const refinePairs = [];
      const chain = bossP.refineChain;
      for (let i = 0; i < chain.length; i++) {
        for (let j = i + 1; j < chain.length; j++) {
          const grid = pairGrid(refineRun.samples, chain[i], chain[j]);
          if (grid) refinePairs.push({ ...grid, screen: "Refinement" });
        }
      }
      refine = publishFunnel(packScreen("Refinement", "refine", refineRun, rankedRefine, {
        locks: refinePlan.lockList,
        openList: refinePlan.openList,
        steps: profileChainSteps(refineRun.samples),
        pairs: refinePairs,
      }), champion);
    }
  }
  if (champion && !Number.isFinite(refine.bossHp)) refine = publishFunnel(refine, champion);

  const finished = [screen1, screen2, refine].filter((screen) => Number.isFinite(screen.bossHp));
  finished.sort((a, b) => a.bossHp - b.bossHp || (b.avgStage || 0) - (a.avgStage || 0));
  const winner = finished[0] || screen1;
  return {
    cancelled: false,
    level,
    sims: FIRST_BOSS_SCREEN_SIMS,
    rows: screen1.rows + screen2.rows + refine.rows,
    talentPoints: caps.talents,
    attributePoints: caps.attributes,
    bossStage,
    bossHp: winner.bossHp,
    avgStage: winner.avgStage,
    talents: winner.talents,
    attributes: winner.attributes,
    factors: screen1.factors,
    fixed: screen1.fixed,
    screens: [screen1, screen2, refine],
    pairs: profileMergePairs(profileCollectPairs(firstRun.samples, "Screen 1"), profileCollectPairs(secondSamples, "Screen 2")),
  };
}

/**
 * Boss screen at the hunter's current level.
 * Screen 1 toggles each skill. Screen 2 locks the largest drop and steps the rest.
 * Refinement holds those winners and steps the cheap levels of that hunter's chain.
 * 50 sims per build. Ranked by remaining boss HP. Call Me Lucky Loot and Timeless Mastery stay at 0.
 * Does not write the caller's config.
 */
export async function findFirstBossKill(baseConfig, engine, hunter, optIn = {}, hooks = {}) {
  const onProgress = hooks.onProgress || (() => {});
  const isCancelled = hooks.isCancelled || (() => false);
  const bossStages = normalizeBossStages(optIn.bossStages);
  if (!bossStages.length) {
    throw new Error("Select at least one boss (100 / 200 / 300).");
  }
  if (hunter.id !== "borge") {
    return findProfileBossKill(baseConfig, engine, hunter, optIn, hooks, { onProgress, isCancelled, bossStages });
  }

  const base = structuredClone(baseConfig);
  const maxLevel = Math.max(0, Math.min(999, Math.floor(Number(optIn.maxLevel ?? 999))));
  const level = Math.max(0, Math.min(maxLevel, Math.floor(Number(base.meta?.level) || 0)));
  base.meta = { ...(base.meta || {}), level };
  const caps = pointBudgets(level);
  const talentRows = borgeTalentRows(caps.talents);
  const attrRows = borgeAttributeRows(caps.attributes);
  if (!talentRows.length || !attrRows.length) {
    throw new Error(
      `No screening rows fit level ${level} (${caps.talents} talent points, ${caps.attributes} attribute points).`,
    );
  }

  const bossStage = bossStages[0];
  const screens = 3;
  const shared = { base, engine, hunter, bossStage, level, screens, onProgress, isCancelled };
  const firstRun = await simulateBossScreen({
    ...shared,
    rows: crossBudgetRows(talentRows, attrRows),
    screen: 1,
    phase: "screen 1/3",
  });
  if (firstRun.cancelled) return { cancelled: true };
  if (!firstRun.samples.length) {
    throw new Error(`No valid screening rows at level ${level}.`);
  }
  const ranked1 = screenFactorLifts(firstRun.samples);
  const screen1 = packScreen("Screen 1", "screen1", firstRun, ranked1, {
    ownBossHp: firstRun.best?.bossHp ?? null,
    kept: false,
  });
  let champion = asChampion(firstRun.best);
  const plan = screen2Plan(ranked1);
  admitChampion(plan, champion);
  const fitted = fitScreen2Rows(plan, ranked1, caps.talents, caps.attributes);
  const secondRows = includeChampion(crossBudgetRows(fitted.talentRows, fitted.attrRows), champion);
  let screen2;
  let secondSamples = [];
  if (!secondRows.length) {
    screen2 = {
      title: "Screen 2",
      kind: "screen2",
      rows: 0,
      bossHp: null,
      avgStage: null,
      talents: null,
      attributes: null,
      factors: [],
      fixed: [],
      locks: plan.lockList,
      topKey: plan.topKey,
    };
  } else {
    const secondRun = await simulateBossScreen({
      ...shared,
      rows: secondRows,
      screen: 2,
      phase: "screen 2/3",
      floor: champion,
    });
    if (secondRun.cancelled) return { cancelled: true };
    secondSamples = secondRun.samples;
    const ranked2 = screenFactorLifts(secondRun.samples);
    screen2 = publishFunnel(packScreen("Screen 2", "screen2", secondRun, ranked2, {
      locks: plan.lockList,
      topKey: plan.topKey,
    }), champion);
  }
  if (champion && !Number.isFinite(screen2.bossHp)) screen2 = publishFunnel(screen2, champion);
  champion = asChampion(screen2) || champion;

  let refine = {
    title: "Refinement",
    kind: "refine",
    rows: 0,
    bossHp: null,
    avgStage: null,
    talents: null,
    attributes: null,
    factors: [],
    fixed: [],
    locks: [],
    steps: [],
    pairs: [],
    openList: [],
  };
  if (screen2.rows > 0) {
    const refinePlan = refine1Plan(screen1, screen2, champion);
    const refineTalents = refine1TalentRows(caps.talents, refinePlan, screen2);
    const refineAttrs = borgeScreen2AttributeRows(caps.attributes, refinePlan);
    const refineRows = includeChampion(crossBudgetRows(refineTalents, refineAttrs), champion);
    refine = {
      ...refine,
      locks: refinePlan.lockList,
      openList: refinePlan.openList,
    };
    if (refineRows.length) {
      const refineRun = await simulateBossScreen({
        ...shared,
        rows: refineRows,
        screen: 3,
        phase: "refinement",
        floor: champion,
      });
      if (refineRun.cancelled) return { cancelled: true };
      const rankedRefine = screenFactorLifts(refineRun.samples);
      const refinePairs = [];
      for (const [keyA, keyB] of [
        ["atlas_protocol", "superior_sensors"],
        ["book_of_baal", "superior_sensors"],
        ["atlas_protocol", "book_of_baal"],
      ]) {
        const grid = pairGrid(refineRun.samples, keyA, keyB);
        if (grid) refinePairs.push({ ...grid, screen: "Refinement" });
      }
      refine = publishFunnel(packScreen("Refinement", "refine", refineRun, rankedRefine, {
        locks: refinePlan.lockList,
        openList: refinePlan.openList,
        steps: chainSteps(refineRun.samples),
        pairs: refinePairs,
      }), champion);
    }
  }
  if (champion && !Number.isFinite(refine.bossHp)) refine = publishFunnel(refine, champion);

  const finished = [screen1, screen2, refine].filter((screen) => Number.isFinite(screen.bossHp));
  finished.sort((a, b) => a.bossHp - b.bossHp || (b.avgStage || 0) - (a.avgStage || 0));
  const winner = finished[0] || screen1;
  return {
    cancelled: false,
    level,
    sims: FIRST_BOSS_SCREEN_SIMS,
    rows: screen1.rows + screen2.rows + refine.rows,
    talentPoints: caps.talents,
    attributePoints: caps.attributes,
    bossStage,
    bossHp: winner.bossHp,
    avgStage: winner.avgStage,
    talents: winner.talents,
    attributes: winner.attributes,
    factors: screen1.factors,
    fixed: screen1.fixed,
    screens: [screen1, screen2, refine],
    pairs: mergePairs(collectPairs(firstRun.samples, "Screen 1"), collectPairs(secondSamples, "Screen 2")),
  };
}

/** Sims per build on the stage / loot / bosses-day funnel. Final compare uses nRefine. */
const PUSH_SCREEN_SIMS = 100;
const PUSH_SCREEN1_CAP = 2200;
const PUSH_SCREEN2_CAP = 1500;
const PUSH_REFINE_CAP = 400;

const PUSH_FILLERS = new Set(["presence_of_god", "soul_of_ares"]);

const PUSH_TALENT_KEYS = [
  "death_is_my_companion",
  "life_of_the_hunt",
  "unfair_advantage",
  "impeccable_impacts",
  "omen_of_defeat",
  "fires_of_war",
  "call_me_lucky_loot",
];

const PUSH_ATTR_KEYS = [
  "spartan_lineage",
  "helltouch_barrier",
  "lifedrain_inhalers",
  "explosive_punches",
  "book_of_baal",
  "superior_sensors",
  "atlas_protocol",
  "weakspot_analysis",
  "born_for_battle",
  "timeless_mastery",
  "essence_of_ylith",
  "soul_of_the_minotaur",
  "soul_of_hermes",
  "soul_of_athena",
];

const PUSH_ATTR_PARENT = {
  lifedrain_inhalers: "helltouch_barrier",
  explosive_punches: "helltouch_barrier",
  superior_sensors: "book_of_baal",
  atlas_protocol: "superior_sensors",
  weakspot_analysis: "explosive_punches",
  born_for_battle: "spartan_lineage",
  timeless_mastery: "spartan_lineage",
  soul_of_athena: "born_for_battle",
  soul_of_the_minotaur: "atlas_protocol",
  soul_of_hermes: "weakspot_analysis",
};

const PUSH_ATTR_COST = {
  soul_of_ares: 1,
  essence_of_ylith: 1,
  spartan_lineage: 2,
  timeless_mastery: 3,
  helltouch_barrier: 2,
  lifedrain_inhalers: 2,
  explosive_punches: 3,
  book_of_baal: 3,
  superior_sensors: 2,
  atlas_protocol: 3,
  weakspot_analysis: 2,
  born_for_battle: 5,
  soul_of_the_minotaur: 2,
  soul_of_hermes: 2,
  soul_of_athena: 15,
};

const PUSH_ATTR_GATE = {
  atlas_protocol: 75,
  weakspot_analysis: 75,
  born_for_battle: 75,
  soul_of_the_minotaur: 150,
  soul_of_hermes: 150,
  soul_of_athena: 180,
};

const PUSH_GATED_KEYS = Object.keys(PUSH_ATTR_GATE);

const PUSH_FACTORS = [
  ...PUSH_TALENT_KEYS.map((key) => ({ key, kind: "talent" })),
  { key: "presence_of_god", kind: "talent" },
  ...PUSH_ATTR_KEYS.map((key) => ({ key, kind: "attribute" })),
  { key: "soul_of_ares", kind: "attribute" },
];

const PUSH_FINE_LEVELS = {
  death_is_my_companion: [0, 2],
  life_of_the_hunt: [0, 2, 5],
  unfair_advantage: [0, 2, 5],
  impeccable_impacts: [0, 5, 10],
  omen_of_defeat: [0, 5, 10],
  fires_of_war: [0, 5, 10, 15],
  call_me_lucky_loot: [0, 5, 10],
  helltouch_barrier: [0, 1],
  lifedrain_inhalers: [0, 4, 7, 10],
  explosive_punches: [0, 3, 6],
  book_of_baal: [0, 2, 4, 6],
  spartan_lineage: [0, 3, 6],
  superior_sensors: [0, 3, 6],
  timeless_mastery: [0, 2, 5],
  essence_of_ylith: [1, 3, 5],
  atlas_protocol: [0, 2, 6],
  weakspot_analysis: [0, 3, 6],
  born_for_battle: [0, 1, 3],
  soul_of_athena: [0, 1],
  soul_of_the_minotaur: [0, 5, 10],
  soul_of_hermes: [0, 5, 10],
};

const PUSH_REFINE_STEPS = {
  call_me_lucky_loot: [1, 2, 5, 7, 10],
  timeless_mastery: [1, 2, 3, 4, 5],
  essence_of_ylith: [1, 2, 3, 5],
  book_of_baal: [1, 2, 4, 6],
  superior_sensors: [1, 2, 3, 6],
  atlas_protocol: [1, 2, 4, 6],
  spartan_lineage: [1, 3, 6],
  helltouch_barrier: [1],
  lifedrain_inhalers: [1, 4, 7, 10],
  explosive_punches: [1, 3, 6],
  fires_of_war: [5, 10, 15],
  presence_of_god: [5, 10, 15],
};

const SCREEN1_ATTR_DROPS = [
  ["book_of_baal", [0, 6]],
  ["atlas_protocol", [0, 6]],
  ["essence_of_ylith", [1]],
];

const SCREEN1_TALENT_DROPS = [];

function pushScreen1Levels() {
  return {
    talents: {
      death_is_my_companion: [0, 2],
      life_of_the_hunt: [0, 5],
      unfair_advantage: [0, 5],
      impeccable_impacts: [0, 10],
      omen_of_defeat: [0, 10],
      fires_of_war: [0, 15],
      call_me_lucky_loot: [0, 10],
    },
    attributes: {
      spartan_lineage: [0, 6],
      helltouch_barrier: [0, 1],
      lifedrain_inhalers: [0, 10],
      explosive_punches: [0, 6],
      book_of_baal: [0, 3, 6],
      superior_sensors: [0, 6],
      atlas_protocol: [0, 2, 6],
      weakspot_analysis: [0, 6],
      born_for_battle: [0, 3],
      timeless_mastery: [0, 5],
      essence_of_ylith: [1, 5],
      soul_of_the_minotaur: [0, 5],
      soul_of_hermes: [0, 5],
      soul_of_athena: [0, 1],
    },
  };
}

let pushP = null;

function borgePushProfile() {
  return {
    fillers: PUSH_FILLERS,
    talentKeys: PUSH_TALENT_KEYS,
    attrKeys: PUSH_ATTR_KEYS,
    talentFiller: BORGE_TALENT_FILLER,
    talentFillerMax: BORGE_TALENT_FILLER_MAX,
    attrFiller: "soul_of_ares",
    attrParent: PUSH_ATTR_PARENT,
    attrCost: PUSH_ATTR_COST,
    attrGate: PUSH_ATTR_GATE,
    gatedKeys: PUSH_GATED_KEYS,
    factors: PUSH_FACTORS,
    fineLevels: PUSH_FINE_LEVELS,
    refineSteps: PUSH_REFINE_STEPS,
    screen1: pushScreen1Levels,
    attrDrops: SCREEN1_ATTR_DROPS,
    talentDrops: SCREEN1_TALENT_DROPS,
    tiedTo: { essence_of_ylith: "spartan_lineage" },
    luckyKey: "call_me_lucky_loot",
    luckyMax: 10,
    shiftAttr: "essence_of_ylith",
    shiftAttrMinChild: "spartan_lineage",
  };
}

function ozzyPushProfile() {
  const talentKeys = [
    "death_is_my_companion", "tricksters_boon", "unfair_advantage", "thousand_needles",
    "omen_of_decay", "call_me_lucky_loot", "crippling_shots",
  ];
  const attrKeys = [
    "exo_piercers", "wings_of_ibu", "shimmering_scorpions", "timeless_mastery",
    "extermination_protocol", "soul_of_snek", "vectid_elixir", "gift_of_medusa",
    "cycle_of_death", "deal_with_death", "dance_of_dashes", "blessing_of_the_sisters",
    "blessing_of_the_scarab", "blessing_of_the_cat",
  ];
  const attrCost = {
    living_off_the_land: 1, exo_piercers: 1, shimmering_scorpions: 3, timeless_mastery: 3,
    wings_of_ibu: 2, extermination_protocol: 2, soul_of_snek: 3, vectid_elixir: 2,
    cycle_of_death: 3, deal_with_death: 5, gift_of_medusa: 3, dance_of_dashes: 3,
    blessing_of_the_sisters: 15, blessing_of_the_scarab: 2, blessing_of_the_cat: 2,
  };
  const attrParent = {
    shimmering_scorpions: "exo_piercers",
    timeless_mastery: "exo_piercers",
    extermination_protocol: "wings_of_ibu",
    soul_of_snek: "extermination_protocol",
    vectid_elixir: "extermination_protocol",
    gift_of_medusa: "extermination_protocol",
    cycle_of_death: "soul_of_snek",
    deal_with_death: "cycle_of_death",
    dance_of_dashes: "shimmering_scorpions",
    blessing_of_the_sisters: "deal_with_death",
    blessing_of_the_scarab: "gift_of_medusa",
    blessing_of_the_cat: "dance_of_dashes",
  };
  const attrGate = {
    deal_with_death: 90, gift_of_medusa: 90, dance_of_dashes: 90,
    blessing_of_the_sisters: 180, blessing_of_the_scarab: 150, blessing_of_the_cat: 150,
  };
  return {
    fillers: new Set(["echo_bullets", "living_off_the_land"]),
    talentKeys,
    attrKeys,
    talentFiller: "echo_bullets",
    talentFillerMax: 20,
    attrFiller: "living_off_the_land",
    attrParent,
    attrCost,
    attrGate,
    gatedKeys: Object.keys(attrGate),
    factors: [
      ...talentKeys.map((key) => ({ key, kind: "talent" })),
      { key: "echo_bullets", kind: "talent" },
      ...attrKeys.map((key) => ({ key, kind: "attribute" })),
      { key: "living_off_the_land", kind: "attribute" },
    ],
    fineLevels: {
      death_is_my_companion: [0, 2], tricksters_boon: [0, 1], unfair_advantage: [0, 2, 5],
      thousand_needles: [0, 5, 10], omen_of_decay: [0, 5, 10], call_me_lucky_loot: [0, 5, 10],
      crippling_shots: [0, 5, 10, 15], exo_piercers: [0, 2, 5], wings_of_ibu: [0, 2, 5],
      shimmering_scorpions: [0, 2, 5], timeless_mastery: [0, 2, 5], extermination_protocol: [0, 2, 5],
      soul_of_snek: [0, 2, 5], vectid_elixir: [0, 5, 10], gift_of_medusa: [0, 2, 5],
      cycle_of_death: [0, 2, 5], deal_with_death: [0, 1, 3], dance_of_dashes: [0, 2, 4],
      blessing_of_the_sisters: [0, 1], blessing_of_the_scarab: [0, 5], blessing_of_the_cat: [0, 5],
    },
    refineSteps: {
      call_me_lucky_loot: [1, 2, 5, 7, 10], timeless_mastery: [1, 2, 3, 4, 5],
      exo_piercers: [1, 2, 3, 5], crippling_shots: [5, 10, 15], echo_bullets: [5, 10, 15, 20],
    },
    screen1: () => ({
      talents: {
        death_is_my_companion: [0, 2], tricksters_boon: [0, 1], unfair_advantage: [0, 5],
        thousand_needles: [0, 10], omen_of_decay: [0, 10], call_me_lucky_loot: [0, 10],
        crippling_shots: [0, 15],
      },
      attributes: {
        exo_piercers: [0, 5], wings_of_ibu: [0, 5], shimmering_scorpions: [0, 5],
        timeless_mastery: [0, 5], extermination_protocol: [0, 5], soul_of_snek: [0, 5],
        vectid_elixir: [0, 10], gift_of_medusa: [0, 5], cycle_of_death: [0, 5],
        deal_with_death: [0, 3], dance_of_dashes: [0, 4], blessing_of_the_sisters: [0, 1],
        blessing_of_the_scarab: [0, 5], blessing_of_the_cat: [0, 5],
      },
    }),
    attrDrops: [],
    talentDrops: [],
    tiedTo: {},
    luckyKey: "call_me_lucky_loot",
    luckyMax: 10,
    shiftAttr: "exo_piercers",
    shiftAttrMinChild: null,
  };
}

function knoxPushProfile() {
  const talentKeys = [
    "death_is_my_companion", "calypsos_advantage", "unfair_advantage", "ghost_bullets",
    "omen_of_defeat", "call_me_lucky_loot", "presence_of_god",
  ];
  const attrKeys = [
    "soul_amplification", "dead_men_tell_no_tales", "space_pirate_armory", "pirates_life_for_knox",
    "timeless_mastery", "searious_efficiency", "passive_charge_tank", "king_of_torpedos",
    "fortification_elixir", "shield_of_poseidon",
  ];
  const attrCost = {
    release_the_kraken: 1, soul_amplification: 1, dead_men_tell_no_tales: 2, space_pirate_armory: 2,
    pirates_life_for_knox: 3, timeless_mastery: 3, searious_efficiency: 2, passive_charge_tank: 4,
    king_of_torpedos: 5, fortification_elixir: 2, shield_of_poseidon: 3,
  };
  const attrParent = {
    dead_men_tell_no_tales: "soul_amplification",
    pirates_life_for_knox: "space_pirate_armory",
    timeless_mastery: "pirates_life_for_knox",
    passive_charge_tank: "searious_efficiency",
    king_of_torpedos: "passive_charge_tank",
    shield_of_poseidon: "fortification_elixir",
  };
  return {
    fillers: new Set(["finishing_move", "release_the_kraken"]),
    talentKeys,
    attrKeys,
    talentFiller: "finishing_move",
    talentFillerMax: 15,
    attrFiller: "release_the_kraken",
    attrParent,
    attrCost,
    attrGate: {},
    gatedKeys: [],
    factors: [
      ...talentKeys.map((key) => ({ key, kind: "talent" })),
      { key: "finishing_move", kind: "talent" },
      ...attrKeys.map((key) => ({ key, kind: "attribute" })),
      { key: "release_the_kraken", kind: "attribute" },
    ],
    fineLevels: {
      death_is_my_companion: [0, 2], calypsos_advantage: [0, 2, 5], unfair_advantage: [0, 2, 5],
      ghost_bullets: [0, 5, 10, 15], omen_of_defeat: [0, 5, 10], call_me_lucky_loot: [0, 5, 10],
      presence_of_god: [0, 5, 10], soul_amplification: [0, 5, 10], dead_men_tell_no_tales: [0, 5, 10],
      space_pirate_armory: [0, 5, 10], pirates_life_for_knox: [0, 5, 10], timeless_mastery: [0, 2, 5],
      searious_efficiency: [0, 2, 5], passive_charge_tank: [0, 2, 5], king_of_torpedos: [0, 2, 5],
      fortification_elixir: [0, 5, 10], shield_of_poseidon: [0, 5, 10],
    },
    refineSteps: {
      call_me_lucky_loot: [1, 2, 5, 7, 10], timeless_mastery: [1, 2, 3, 4, 5],
      soul_amplification: [1, 2, 5, 10], presence_of_god: [1, 5, 10], finishing_move: [5, 10, 15],
    },
    screen1: () => ({
      talents: {
        death_is_my_companion: [0, 2], calypsos_advantage: [0, 5], unfair_advantage: [0, 5],
        ghost_bullets: [0, 15], omen_of_defeat: [0, 10], call_me_lucky_loot: [0, 10],
        presence_of_god: [0, 10],
      },
      attributes: {
        soul_amplification: [0, 10], dead_men_tell_no_tales: [0, 10], space_pirate_armory: [0, 10],
        pirates_life_for_knox: [0, 5], timeless_mastery: [0, 5], searious_efficiency: [0, 5],
        passive_charge_tank: [0, 5], king_of_torpedos: [0, 5], fortification_elixir: [0, 10],
        shield_of_poseidon: [0, 5],
      },
    }),
    attrDrops: [],
    talentDrops: [],
    tiedTo: {},
    luckyKey: "call_me_lucky_loot",
    luckyMax: 10,
    shiftAttr: "soul_amplification",
    shiftAttrMinChild: null,
  };
}

function pushProfileFor(hunterId) {
  if (hunterId === "ozzy") return ozzyPushProfile();
  if (hunterId === "knox") return knoxPushProfile();
  if (hunterId === "borge") return borgePushProfile();
  return null;
}

function gatedAttrCost(picked, key, level) {
  let high = 0;
  for (const gated of pushP.gatedKeys) {
    const lvl = gated === key ? level : Number(picked[gated]) || 0;
    high += lvl * (pushP.attrCost[gated] || 1);
  }
  return high;
}

function constrainAttrChoices(key, choices, picked, budget) {
  const tiedChild = pushP.tiedTo?.[key];
  if (tiedChild) {
    if (!(Number(picked[tiedChild]) > 0)) return [0];
    const positive = choices.filter((level) => level >= 1);
    return positive.length ? positive : [1];
  }
  const parent = pushP.attrParent[key];
  if (parent && parent !== pushP.attrFiller && !(Number(picked[parent]) > 0)) return [0];
  const gate = pushP.attrGate[key] || 0;
  return choices.filter((level) => {
    if (level <= 0) return true;
    if (gate && budget - gatedAttrCost(picked, key, level) < gate) return false;
    return true;
  });
}

function finishAttrRow(budget, picked) {
  let spent = 0;
  for (const key of pushP.attrKeys) {
    spent += (Number(picked[key]) || 0) * (pushP.attrCost[key] || 1);
  }
  const filler = budget - spent;
  const anyOn = pushP.attrKeys.some((key) => Number(picked[key]) > 0);
  if (filler < (anyOn ? 1 : 0)) return null;
  const row = { [pushP.attrFiller]: filler };
  for (const key of pushP.attrKeys) row[key] = Number(picked[key]) || 0;
  return row;
}

function pushTalentRows(budget, choiceOf) {
  const rows = [];
  const picked = {};
  const walk = (index, spent) => {
    if (index === pushP.talentKeys.length) {
      const filler = budget - spent;
      if (filler < 0 || filler > pushP.talentFillerMax) return;
      rows.push({ ...picked, [pushP.talentFiller]: filler });
      return;
    }
    const key = pushP.talentKeys[index];
    for (const level of choiceOf(key)) {
      if (spent + level > budget) continue;
      picked[key] = level;
      walk(index + 1, spent + level);
    }
  };
  walk(0, 0);
  return rows;
}

function pushAttributeRows(budget, choiceOf, isLegal) {
  const rows = [];
  const picked = {};
  const walk = (index) => {
    if (index === pushP.attrKeys.length) {
      const row = finishAttrRow(budget, picked);
      if (!row) return;
      if (isLegal && !isLegal(row)) return;
      rows.push(row);
      return;
    }
    const key = pushP.attrKeys[index];
    const choices = constrainAttrChoices(key, choiceOf(key), picked, budget);
    for (const level of choices) {
      picked[key] = level;
      walk(index + 1);
    }
  };
  walk(0);
  return rows;
}

function buildPushScreen1(talentBudget, attrBudget, isLegal) {
  const levels = pushP.screen1();
  const dropped = [];
  const talentChoice = (key) => levels.talents[key] || [0];
  const attrChoice = (key) => levels.attributes[key] || [0];
  let talents = pushTalentRows(talentBudget, talentChoice);
  let attributes = pushAttributeRows(attrBudget, attrChoice, isLegal);
  const shrink = (table, drops, kind) => {
    for (const [key, next] of drops) {
      if (talents.length * attributes.length <= PUSH_SCREEN1_CAP) return;
      const prev = table[key];
      if (!prev || prev.length <= next.length && prev.every((level, i) => level === next[i])) continue;
      const saved = prev.slice();
      table[key] = next.slice();
      const nextTalents = kind === "talent" ? pushTalentRows(talentBudget, talentChoice) : talents;
      const nextAttributes = kind === "attribute" ? pushAttributeRows(attrBudget, attrChoice, isLegal) : attributes;
      if (!nextTalents.length || !nextAttributes.length) {
        table[key] = saved;
        continue;
      }
      talents = nextTalents;
      attributes = nextAttributes;
      dropped.push(key);
    }
  };
  shrink(levels.attributes, pushP.attrDrops, "attribute");
  shrink(levels.talents, pushP.talentDrops, "talent");
  return { talents, attributes, dropped };
}

function planChoice(plan) {
  return (key) => (plan.open.has(key) ? plan.open.get(key) : [plan.locks.get(key) || 0]);
}

function pushLockList(locks, reasons) {
  return [...locks.entries()].map(([key, level]) => ({
    key,
    level,
    reason: reasons.get(key) || "fixed",
  }));
}

function enforcePushParents(isOn, lockAt, open, locks) {
  for (const [child, parent] of Object.entries(pushP.attrParent)) {
    if (pushP.fillers.has(parent) || !isOn(child)) continue;
    const childOpen = open.has(child) ? open.get(child) : null;
    const childCanBeOff = !!(childOpen && childOpen.includes(0));
    if (childCanBeOff) continue;
    if (!isOn(parent)) {
      lockAt(parent, 1, "parent");
      continue;
    }
    if (open.has(parent)) {
      const levels = open.get(parent).filter((level) => level > 0);
      if (levels.length) open.set(parent, levels);
      else lockAt(parent, 1, "parent");
    } else if ((locks.get(parent) || 0) < 1) {
      lockAt(parent, 1, "parent");
    }
  }
  for (const [key, child] of Object.entries(pushP.tiedTo || {})) {
    if (isOn(child) && !isOn(key)) lockAt(key, 1, "parent");
  }
}

function pushScreen2Plan(ranked) {
  const locks = new Map();
  const reasons = new Map();
  const open = new Map();
  const controllable = ranked.factors.filter((factor) => !pushP.fillers.has(factor.key));
  const clear = controllable.filter((factor) => factor.level > 0 && factor.beats && factor.clear);
  const top = clear[0] || null;
  const lockAt = (key, level, reason) => {
    if (pushP.fillers.has(key)) return;
    open.delete(key);
    locks.set(key, level);
    reasons.set(key, reason);
  };

  for (const factor of ranked.fixed) lockAt(factor.key, Number(factor.level) || 0, "fixed");
  for (const factor of controllable) {
    const level = Number(factor.level) || 0;
    if (!(level > 0) || !factor.beats) {
      lockAt(factor.key, 0, "off");
      continue;
    }
    if (top && factor.key === top.key) {
      lockAt(factor.key, level, "top");
      continue;
    }
    const fine = pushP.fineLevels[factor.key];
    if (fine) open.set(factor.key, fine.slice());
    else lockAt(factor.key, level, "held");
  }

  const isOn = (key) => open.has(key) || (locks.get(key) || 0) > 0;
  enforcePushParents(isOn, lockAt, open, locks, reasons);

  return {
    locks,
    open,
    topKey: top ? top.key : null,
    lockList: pushLockList(locks, reasons),
  };
}

function admitPushChampion(plan, champion) {
  if (!champion) return plan;
  for (const key of [...pushP.talentKeys, ...pushP.attrKeys]) {
    const level = championLevel(champion, key);
    if (plan.open.has(key)) {
      plan.open.set(key, uniqLevelsKeepZero([...plan.open.get(key), level]));
      continue;
    }
    const locked = Number(plan.locks.get(key)) || 0;
    if (locked === level) continue;
    plan.locks.delete(key);
    plan.open.set(key, uniqLevelsKeepZero([locked, level]));
  }
  plan.lockList = pushLockList(plan.locks, new Map(plan.lockList.map((lock) => [lock.key, lock.reason])));
  return plan;
}

function fitPushOpen(plan, ranked, talentBudget, attrBudget, isLegal, cap) {
  const bestLevel = new Map(ranked.factors.map((factor) => [factor.key, Number(factor.level) || 0]));
  const lift = new Map(ranked.factors.map((factor) => [factor.key, Number(factor.lift) || 0]));
  const recount = () => {
    const talents = pushTalentRows(talentBudget, planChoice(plan));
    const attributes = pushAttributeRows(attrBudget, planChoice(plan), isLegal);
    return { talents, attributes };
  };
  let built = recount();
  const candidates = () => [...plan.open.keys()]
    .filter((key) => (plan.open.get(key) || []).length > 2)
    .sort((a, b) => (lift.get(a) || 0) - (lift.get(b) || 0) || a.localeCompare(b));
  while (built.talents.length * built.attributes.length > cap) {
    const key = candidates()[0];
    if (!key) break;
    const next = dropOneFineLevel(plan.open.get(key), bestLevel.get(key) || 0);
    if (next.length === plan.open.get(key).length) break;
    plan.open.set(key, next);
    built = recount();
  }
  return built;
}

function metricOf(score) {
  const objective = score?.objective || "stage";
  if (objective === "bosses") return { key: "boss", value: Number(score.bossesPerDay) || 0, unit: "bosses/day", digits: 2 };
  if (objective === "loot") return { key: "loot", value: Number(score.lootScore) || 0, unit: "loot/min", digits: 1 };
  return { key: "stage", value: Number(score.avgStage) || 0, unit: "stage", digits: 2 };
}

function decidingDelta(best, base) {
  const objective = best?.objective || base?.objective || "stage";
  if (objective === "bosses" && best.bossesPerDay !== base.bossesPerDay) {
    return { key: "boss", unit: "bosses/day", digits: 2, delta: best.bossesPerDay - base.bossesPerDay };
  }
  if (objective === "loot" && best.lootScore !== base.lootScore) {
    return { key: "loot", unit: "loot/min", digits: 1, delta: best.lootScore - base.lootScore };
  }
  if (objective === "stage" && best.avgStage !== base.avgStage) {
    return { key: "stage", unit: "stage", digits: 2, delta: best.avgStage - base.avgStage };
  }
  if (best.lootScore !== base.lootScore && objective !== "stage") {
    return { key: "loot", unit: "loot/min", digits: 1, delta: best.lootScore - base.lootScore };
  }
  if (best.avgStage !== base.avgStage) {
    return { key: "stage", unit: "stage", digits: 2, delta: best.avgStage - base.avgStage };
  }
  if (best.lootScore !== base.lootScore) {
    return { key: "loot", unit: "loot/min", digits: 1, delta: best.lootScore - base.lootScore };
  }
  return { key: "stage", unit: "stage", digits: 2, delta: 0 };
}

function pushFactorLifts(samples, objective) {
  const factors = [];
  const fixed = [];
  for (const spec of pushP.factors) {
    const groups = new Map();
    for (const sample of samples) {
      const level = Number(sample.points[spec.key]) || 0;
      let group = groups.get(level);
      if (!group) {
        group = {
          n: 0,
          sum: { stage: 0, loot: 0, boss: 0 },
          sumsq: { stage: 0, loot: 0, boss: 0 },
        };
        groups.set(level, group);
      }
      group.n += 1;
      group.sum.stage += sample.avgStage;
      group.sum.loot += sample.lootScore;
      group.sum.boss += sample.bossesPerDay;
      group.sumsq.stage += sample.avgStage * sample.avgStage;
      group.sumsq.loot += sample.lootScore * sample.lootScore;
      group.sumsq.boss += sample.bossesPerDay * sample.bossesPerDay;
    }
    if (groups.size < 2) {
      fixed.push({ key: spec.key, kind: spec.kind, level: [...groups.keys()][0] || 0 });
      continue;
    }
    const meanScore = (group) => ({
      avgStage: group.sum.stage / group.n,
      lootScore: group.sum.loot / group.n,
      bossesPerDay: group.sum.boss / group.n,
      objective,
    });
    let baseLevel = 0;
    let baseGroup = groups.get(0);
    if (!baseGroup) {
      baseGroup = null;
      for (const [level, group] of groups) {
        if (!baseGroup || scoreGt(meanScore(baseGroup), meanScore(group))) {
          baseGroup = group;
          baseLevel = level;
        }
      }
    }
    let bestLevel = baseLevel;
    let bestGroup = baseGroup;
    for (const [level, group] of groups) {
      if (scoreGt(meanScore(group), meanScore(bestGroup))) {
        bestGroup = group;
        bestLevel = level;
      }
    }
    const bestMean = meanScore(bestGroup);
    const baseMean = meanScore(baseGroup);
    const decision = decidingDelta(bestMean, baseMean);
    const variance = (group, key) => {
      if (!group || group.n < 2) return 0;
      const mean = group.sum[key] / group.n;
      return Math.max(0, group.sumsq[key] / group.n - mean * mean);
    };
    const se = Math.sqrt(variance(bestGroup, decision.key) / bestGroup.n + variance(baseGroup, decision.key) / baseGroup.n);
    const beats = scoreGt(bestMean, baseMean);
    factors.push({
      key: spec.key,
      kind: spec.kind,
      level: bestLevel,
      mean: metricOf(bestMean).value,
      baseMean: metricOf(baseMean).value,
      baseLevel,
      lift: decision.delta,
      unit: decision.unit,
      digits: decision.digits,
      primaryUnit: metricOf(bestMean).unit,
      beats,
      clear: beats && bestGroup.n >= 2 && baseGroup.n >= 2 && decision.delta > 2 * se,
    });
  }
  factors.sort((a, b) => {
    if (a.beats !== b.beats) return a.beats ? -1 : 1;
    if (a.clear !== b.clear) return a.clear ? -1 : 1;
    return b.lift - a.lift || a.key.localeCompare(b.key);
  });
  return { factors, fixed };
}

function betterPush(current, next) {
  if (!current) return next || null;
  if (!next) return current;
  if (scoreGt(next.score, current.score)) return next;
  return current;
}

function asPushChampion(sample) {
  if (!sample?.talents || !sample?.attributes || !sample.score) return null;
  return {
    score: sample.score,
    avgStage: sample.avgStage,
    lootScore: sample.lootScore,
    bossesPerDay: sample.bossesPerDay,
    talents: { ...sample.talents },
    attributes: { ...sample.attributes },
    points: { ...(sample.points || {}), ...sample.talents, ...sample.attributes },
  };
}

function publishPush(screen, incumbent) {
  const own = screen?.score ? {
    score: screen.score,
    avgStage: screen.avgStage,
    lootScore: screen.lootScore,
    bossesPerDay: screen.bossesPerDay,
    talents: screen.talents,
    attributes: screen.attributes,
  } : null;
  const chosen = betterPush(incumbent, own);
  return {
    ...screen,
    score: chosen ? chosen.score : null,
    avgStage: chosen ? chosen.avgStage : null,
    lootScore: chosen ? chosen.lootScore : null,
    bossesPerDay: chosen ? chosen.bossesPerDay : null,
    talents: chosen ? chosen.talents : null,
    attributes: chosen ? chosen.attributes : null,
    ownScore: screen?.score || null,
    kept: !!(incumbent && chosen === incumbent),
  };
}

function refineLevelsFor(key, winnerLevel, championLvl) {
  const cap = Math.max(Number(winnerLevel) || 0, Number(championLvl) || 0);
  if (cap <= 0) return [];
  const catalog = pushP.refineSteps[key] || [1, 2, 3, 4, 5];
  return uniqLevelsKeepZero([...catalog.filter((level) => level > 0 && level <= cap), winnerLevel, championLvl]);
}

function pushRefinePlan(ranked, champion) {
  const locks = new Map();
  const reasons = new Map();
  const open = new Map();
  const controllable = ranked.factors.filter((factor) => !pushP.fillers.has(factor.key) && factor.beats && factor.level > 0);
  const chain = controllable.slice(0, 3).map((factor) => factor.key);
  const lockAt = (key, level, reason) => {
    open.delete(key);
    locks.set(key, level);
    reasons.set(key, reason);
  };
  for (const key of [...pushP.talentKeys, ...pushP.attrKeys]) {
    lockAt(key, championLevel(champion, key), "incumbent");
  }
  for (const key of chain) {
    const levels = refineLevelsFor(key, controllable.find((factor) => factor.key === key)?.level, championLevel(champion, key));
    if (levels.length > 1) open.set(key, levels);
  }
  const isOn = (key) => open.has(key) || (locks.get(key) || 0) > 0;
  enforcePushParents(isOn, lockAt, open, locks);
  return {
    locks,
    open,
    chain,
    openList: [...open.entries()].map(([key, levels]) => ({ key, levels })),
    lockList: pushLockList(locks, reasons),
  };
}

function uniquePushRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const id = buildKey(row);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function fillerShiftRows(champion, talentBudget) {
  if (!champion?.talents || !champion?.attributes) return [];
  const rows = [];
  const add = (talents, attributes) => {
    const spent = Object.values(talents).reduce((sum, level) => sum + (Number(level) || 0), 0);
    if (spent !== talentBudget) return;
    rows.push({ talents, attributes });
  };
  const moveTalent = (from, to, points, maxTo) => {
    const talents = { ...champion.talents };
    if ((Number(talents[from]) || 0) < points) return;
    if ((Number(talents[to]) || 0) + points > maxTo) return;
    talents[from] = (Number(talents[from]) || 0) - points;
    talents[to] = (Number(talents[to]) || 0) + points;
    add(talents, { ...champion.attributes });
  };
  moveTalent(pushP.talentFiller, pushP.luckyKey, 5, pushP.luckyMax);
  moveTalent(pushP.luckyKey, pushP.talentFiller, 5, pushP.talentFillerMax);
  const attributes = { ...champion.attributes };
  const minChild = pushP.shiftAttrMinChild;
  const shiftMin = minChild && Number(attributes[minChild]) > 0 ? 1 : 0;
  const fillerMin = pushP.attrKeys.some((key) => Number(attributes[key]) > 0) ? 1 : 0;
  const moveAttr = (from, to, points, minFrom) => {
    if ((Number(attributes[from]) || 0) - points < minFrom) return;
    const next = { ...attributes };
    next[from] = (Number(next[from]) || 0) - points;
    next[to] = (Number(next[to]) || 0) + points;
    add({ ...champion.talents }, next);
  };
  moveAttr(pushP.attrFiller, pushP.shiftAttr, 5, fillerMin);
  moveAttr(pushP.shiftAttr, pushP.attrFiller, 5, shiftMin);
  return rows;
}

function pushSimsFor(builds) {
  if (builds <= 2500) return PUSH_SCREEN_SIMS;
  if (builds <= 5000) return 80;
  return 50;
}

async function simulatePushScreen({
  rows, base, engine, hunter, objective, bossStages, level, screen, screens, phase, floor, sims, onProgress, isCancelled,
}) {
  const { wasmToSimResult } = hunter;
  const samples = [];
  let best = null;
  const total = rows.length;
  let done = 0;
  for (const row of rows) {
    if (isCancelled()) return { cancelled: true };
    const cfg = structuredClone(base);
    cfg.talents = { ...row.talents };
    cfg.attributes = { ...row.attributes };
    const validated = validateBudgets(cfg, hunter);
    done += 1;
    const shown = betterPush(floor, best);
    if (!validated.ok) {
      onProgress({
        msg: `level ${level} · ${phase} · ${done}/${total}`,
        done,
        total,
        screen,
        screens,
        objective,
        bossStages,
        stage: shown?.avgStage ?? null,
        loot: shown?.lootScore ?? null,
        bossesPerDay: shown?.bossesPerDay ?? null,
      });
      continue;
    }
    await yieldToUi();
    if (isCancelled()) return { cancelled: true };
    const sim = wasmToSimResult(engine.evaluate(validated.config, sims), sims);
    const score = scoreOf(sim, objective, bossStages);
    const sample = {
      score,
      avgStage: score.avgStage,
      lootScore: score.lootScore,
      bossesPerDay: score.bossesPerDay,
      talents: { ...row.talents },
      attributes: { ...row.attributes },
      points: { ...row.talents, ...row.attributes },
    };
    samples.push(sample);
    best = betterPush(best, sample);
    const next = betterPush(floor, best);
    onProgress({
      msg: `level ${level} · ${phase} · ${done}/${total}`,
      done,
      total,
      screen,
      screens,
      objective,
      bossStages,
      stage: next.avgStage,
      loot: next.lootScore,
      bossesPerDay: next.bossesPerDay,
    });
  }
  return { cancelled: false, samples, best };
}

function packPushScreen(title, kind, run, ranked, extra = {}) {
  const best = run.best;
  return {
    title,
    kind,
    rows: run.samples.length,
    score: best ? best.score : null,
    avgStage: best ? best.avgStage : null,
    lootScore: best ? best.lootScore : null,
    bossesPerDay: best ? best.bossesPerDay : null,
    talents: best ? best.talents : null,
    attributes: best ? best.attributes : null,
    factors: ranked.factors,
    fixed: ranked.fixed,
    ...extra,
  };
}

/**
 * Stage, loot, and bosses/day funnel for Borge, Ozzy, and Knox.
 * Screen 1 is a coarse factorial. Screen 2 locks a clear gain and steps the rest.
 * Refinement holds that build and steps the cheap levels the chart ranked, plus a filler split.
 * Call Me Lucky Loot and Timeless Mastery are factors. Does not force either one on.
 */
export async function findPushBuild(baseConfig, engine, hunter, optIn = {}, hooks = {}) {
  const onProgress = hooks.onProgress || (() => {});
  const isCancelled = hooks.isCancelled || (() => false);
  pushP = pushProfileFor(hunter.id);
  if (!pushP) throw new Error("This push screen is not set up for this hunter.");
  const objective = normalizeObjective(optIn.objective);
  const bossStages = normalizeBossStages(optIn.bossStages);
  if (objective === "bosses" && !bossStages.length) {
    throw new Error("Select at least one boss (100 / 200 / 300).");
  }

  const base = structuredClone(baseConfig);
  const level = Math.max(0, Math.floor(Number(base.meta?.level) || 0));
  base.meta = { ...(base.meta || {}), level };
  const caps = pointBudgets(level);
  const isLegal = (row) => hunter.attrs.attributesTreeValid(row, caps.attributes).ok;
  const screen1Built = buildPushScreen1(caps.talents, caps.attributes, isLegal);
  if (!screen1Built.talents.length || !screen1Built.attributes.length) {
    throw new Error(
      `No screening rows fit level ${level} (${caps.talents} talent points, ${caps.attributes} attribute points).`,
    );
  }

  const screens = 3;
  const sims = pushSimsFor(screen1Built.talents.length * screen1Built.attributes.length);
  const shared = { base, engine, hunter, objective, bossStages, level, screens, sims, onProgress, isCancelled };
  const firstRun = await simulatePushScreen({
    ...shared,
    rows: crossBudgetRows(screen1Built.talents, screen1Built.attributes),
    screen: 1,
    phase: "screen 1/3",
  });
  if (firstRun.cancelled) return { cancelled: true };
  if (!firstRun.samples.length) {
    throw new Error(`No valid screening rows at level ${level}.`);
  }
  const ranked1 = pushFactorLifts(firstRun.samples, objective);
  const screen1 = packPushScreen("Screen 1", "screen1", firstRun, ranked1, {
    ownScore: firstRun.best?.score || null,
    kept: false,
    dropped: screen1Built.dropped,
  });
  let champion = asPushChampion(firstRun.best);
  const plan = pushScreen2Plan(ranked1);
  admitPushChampion(plan, champion);
  const fitted = fitPushOpen(plan, ranked1, caps.talents, caps.attributes, isLegal, PUSH_SCREEN2_CAP);
  const secondRows = includeChampion(crossBudgetRows(fitted.talents, fitted.attributes), champion);
  let screen2;
  if (!secondRows.length) {
    screen2 = publishPush({
      title: "Screen 2",
      kind: "screen2",
      rows: 0,
      score: null,
      factors: [],
      fixed: [],
      locks: plan.lockList,
      topKey: plan.topKey,
    }, champion);
  } else {
    const secondRun = await simulatePushScreen({
      ...shared,
      rows: secondRows,
      screen: 2,
      phase: "screen 2/3",
      floor: champion,
    });
    if (secondRun.cancelled) return { cancelled: true };
    const ranked2 = pushFactorLifts(secondRun.samples, objective);
    screen2 = publishPush(packPushScreen("Screen 2", "screen2", secondRun, ranked2, {
      locks: plan.lockList,
      topKey: plan.topKey,
    }), champion);
  }
  if (champion && !screen2.score) screen2 = publishPush(screen2, champion);
  champion = asPushChampion(screen2) || champion;

  let refine = {
    title: "Refinement",
    kind: "refine",
    rows: 0,
    score: null,
    avgStage: null,
    lootScore: null,
    bossesPerDay: null,
    talents: null,
    attributes: null,
    factors: [],
    fixed: [],
    locks: [],
    openList: [],
    chain: [],
  };
  if (screen2.rows > 0 && champion) {
    const refineRanked = screen2.factors?.length ? screen2 : screen1;
    const refinePlan = pushRefinePlan(refineRanked, champion);
    const fittedRefine = fitPushOpen(refinePlan, refineRanked, caps.talents, caps.attributes, isLegal, PUSH_REFINE_CAP);
    const refineRows = includeChampion(uniquePushRows([
      ...crossBudgetRows(fittedRefine.talents, fittedRefine.attributes),
      ...fillerShiftRows(champion, caps.talents),
    ]), champion);
    refine = { ...refine, locks: refinePlan.lockList, openList: refinePlan.openList, chain: refinePlan.chain };
    if (refineRows.length) {
      const refineRun = await simulatePushScreen({
        ...shared,
        rows: refineRows,
        screen: 3,
        phase: "refinement",
        floor: champion,
      });
      if (refineRun.cancelled) return { cancelled: true };
      const rankedRefine = pushFactorLifts(refineRun.samples, objective);
      refine = publishPush(packPushScreen("Refinement", "refine", refineRun, rankedRefine, {
        locks: refinePlan.lockList,
        openList: refinePlan.openList,
        chain: refinePlan.chain,
      }), champion);
    }
  }
  if (champion && !refine.score) refine = publishPush(refine, champion);
  champion = asPushChampion(refine) || champion;

  const nConfirm = Math.max(1, Math.floor(Number(optIn.nRefine) || DEFAULT_OPTIMIZE.nRefine));
  onProgress({
    msg: `Confirming the funnel winner (${nConfirm} sims)…`,
    done: 1,
    total: 2,
    screen: 3,
    screens: 3,
    objective,
    bossStages,
    stage: champion?.avgStage ?? null,
    loot: champion?.lootScore ?? null,
    bossesPerDay: champion?.bossesPerDay ?? null,
  });
  const current = validateBudgets(base, hunter);
  if (!current.ok) throw new Error(current.msg || "Invalid build");
  if (isCancelled()) return { cancelled: true };
  await yieldToUi();
  const baselineEval = hunter.wasmToSimResult(engine.evaluate(current.config, nConfirm), nConfirm);
  const baselineScore = scoreOf(baselineEval, objective, bossStages);
  let winnerEval = null;
  let winnerScore = null;
  let winnerConfig = null;
  if (champion?.talents && champion?.attributes) {
    const winnerCfg = structuredClone(base);
    winnerCfg.talents = { ...champion.talents };
    winnerCfg.attributes = { ...champion.attributes };
    const winnerOk = validateBudgets(winnerCfg, hunter);
    if (winnerOk.ok && !isCancelled()) {
      await yieldToUi();
      winnerEval = hunter.wasmToSimResult(engine.evaluate(winnerOk.config, nConfirm), nConfirm);
      winnerScore = scoreOf(winnerEval, objective, bossStages);
      winnerConfig = winnerOk.config;
    }
  }
  if (isCancelled()) return { cancelled: true };
  const improved = !!(winnerScore && scoreGt(winnerScore, baselineScore));
  const bestScore = improved ? winnerScore : baselineScore;
  const bestEval = improved ? winnerEval : baselineEval;
  const bestConfig = improved ? winnerConfig : current.config;
  const rowCount = screen1.rows + screen2.rows + refine.rows;
  return {
    cancelled: false,
    funnel: true,
    objective,
    bossStages,
    level,
    sims,
    talentFiller: pushP.talentFiller,
    attrFiller: pushP.attrFiller,
    luckyKey: pushP.luckyKey,
    shiftAttr: pushP.shiftAttr,
    rows: rowCount,
    talentPoints: caps.talents,
    attributePoints: caps.attributes,
    screens: [screen1, screen2, refine],
    bestConfig,
    bestScore,
    bestEval,
    baselineConfig: current.config,
    baselineScore,
    baselineEval,
    improved,
    evals: rowCount + 2,
    loops: 1,
    nSearch: sims,
    nRefine: nConfirm,
  };
}

/** Stats that are combat spendables for +1 marginal analysis (not progress metadata). */
const MARGINAL_STAT_SKIP = new Set(["highest_stage_reached"]);

/**
 * Shared +1 marginal sweep: baseline, then each key +1 vs baseline (no talent/attr search).
 * @param {{
 *   keys: string[],
 *   getLevel: (cfg: object, key: string) => number,
 *   getMax: (key: string) => number,
 *   withPlusOne: (cfg: object, key: string, next: number) => void,
 *   labelOf: (key: string) => string,
 * }} sweep
 */
async function marginalPlusOneGains(baseConfig, engine, hunter, optIn, hooks, sweep) {
  const { wasmToSimResult } = hunter;
  const n = Math.max(1, Number(optIn.n) || 1000);
  const onProgress = typeof hooks.onProgress === "function" ? hooks.onProgress : () => {};
  const isCancelled = typeof hooks.isCancelled === "function" ? hooks.isCancelled : () => false;

  const validated = validateBudgets(baseConfig, hunter);
  if (!validated.ok) {
    throw new Error(validated.msg || "Invalid build");
  }
  const baselineCfg = structuredClone(validated.config);
  const keys = sweep.keys;
  const total = 1 + keys.length;
  let done = 0;

  function notify(msg, stage, loot) {
    onProgress({ msg, done, total, stage, loot });
  }

  await yieldToUi();
  if (isCancelled()) return { cancelled: true, baselineScore: null, results: [] };

  const baseWasm = engine.evaluate(baselineCfg, n);
  const baselineEval = wasmToSimResult(baseWasm, n);
  const baselineScore = scoreOf(baselineEval);
  done = 1;
  notify("Baseline", baselineScore.avgStage, baselineScore.lootScore);

  const results = [];
  let bestKey = null;
  let bestScore = null;

  for (const key of keys) {
    if (isCancelled()) return { cancelled: true, baselineScore, results };
    const cur = sweep.getLevel(baselineCfg, key);
    const mx = sweep.getMax(key);
    const atCap = mx < 9999 && cur >= mx;
    const label = sweep.labelOf(key);

    if (atCap) {
      results.push({
        key,
        skipped: "max",
        avgStage: baselineScore.avgStage,
        lootScore: baselineScore.lootScore,
        dStage: 0,
        dLoot: 0,
        better: false,
      });
      done += 1;
      notify(`${label} (max)`, baselineScore.avgStage, baselineScore.lootScore);
      continue;
    }

    const cfg = structuredClone(baselineCfg);
    sweep.withPlusOne(cfg, key, cur + 1);
    await yieldToUi();
    if (isCancelled()) return { cancelled: true, baselineScore, results };

    const wasmRes = engine.evaluate(cfg, n);
    const res = wasmToSimResult(wasmRes, n);
    const sc = scoreOf(res);
    const better = sc.avgStage > baselineScore.avgStage;
    const entry = {
      key,
      skipped: null,
      avgStage: sc.avgStage,
      lootScore: sc.lootScore,
      dStage: sc.avgStage - baselineScore.avgStage,
      dLoot: sc.lootScore - baselineScore.lootScore,
      score: sc,
      better,
    };
    results.push(entry);
    if (better && (!bestScore || scoreGt(sc, bestScore))) {
      bestScore = sc;
      bestKey = key;
    }
    done += 1;
    notify(label, sc.avgStage, sc.lootScore);
  }

  return {
    cancelled: false,
    n,
    baselineScore,
    baselineEval,
    results,
    bestKey,
  };
}

/**
 * For the current build only: baseline sim, then each combat stat +1 vs baseline.
 * Does not redistribute talents/attributes.
 *
 * @param {object} baseConfig
 * @param {{ evaluate: Function }} engine
 * @param {import('./hunters/index.js').HUNTERS[string]} hunter
 * @param {{ n?: number }} [optIn]
 * @param {{ onProgress?: Function, isCancelled?: () => boolean }} [hooks]
 */
export async function marginalStatGains(baseConfig, engine, hunter, optIn = {}, hooks = {}) {
  const { costs } = hunter;
  return marginalPlusOneGains(baseConfig, engine, hunter, optIn, hooks, {
    keys: (costs.STAT_ORDER || []).filter((k) => !MARGINAL_STAT_SKIP.has(k)),
    getLevel: (cfg, key) => Number(cfg.stats?.[key] || 0),
    getMax: (key) => Number(costs.STAT_MAX?.[key] ?? 9999),
    withPlusOne: (cfg, key, next) => {
      cfg.stats = { ...cfg.stats, [key]: next };
    },
    labelOf: (key) => costs.STAT_LABELS[key] || key,
  });
}

/**
 * For the current build only: baseline sim, then each inscryption +1 vs baseline.
 * On-demand only — not part of talent/attribute optimize.
 *
 * @param {object} baseConfig
 * @param {{ evaluate: Function }} engine
 * @param {import('./hunters/index.js').HUNTERS[string]} hunter
 * @param {{ n?: number }} [optIn]
 * @param {{ onProgress?: Function, isCancelled?: () => boolean }} [hooks]
 */
export async function marginalInscryptionGains(baseConfig, engine, hunter, optIn = {}, hooks = {}) {
  const { costs } = hunter;
  const meta = costs.INSCRIPTION_META || {};
  return marginalPlusOneGains(baseConfig, engine, hunter, optIn, hooks, {
    keys: [...(costs.INSC_ORDER || [])],
    getLevel: (cfg, key) => Number(cfg.inscryptions?.[key] || 0),
    getMax: (key) => {
      const mx = costs.INSCRIPTION_COSTS?.[key]?.max;
      return mx == null || mx === Infinity ? 9999 : Number(mx);
    },
    withPlusOne: (cfg, key, next) => {
      cfg.inscryptions = { ...cfg.inscryptions, [key]: next };
    },
    labelOf: (key) => meta[key]?.title || key,
  });
}

/** UI spin max for relics/gems (same as build editor). */
const RELIC_GEM_MAX = 20;

/**
 * For the current build only: baseline sim, then each relic/gem +1 vs baseline.
 * On-demand only — not part of talent/attribute optimize. Keys are `relic.*` / `gem.*`.
 *
 * @param {object} baseConfig
 * @param {{ evaluate: Function }} engine
 * @param {import('./hunters/index.js').HUNTERS[string]} hunter
 * @param {{ n?: number }} [optIn]
 * @param {{ onProgress?: Function, isCancelled?: () => boolean }} [hooks]
 */
export async function marginalRelicGemGains(baseConfig, engine, hunter, optIn = {}, hooks = {}) {
  const { costs } = hunter;
  const keys = [
    ...(costs.RELIC_KEYS || []).map((k) => `relic.${k}`),
    ...(costs.GEM_KEYS || []).map((k) => `gem.${k}`),
  ];

  function parseKey(composite) {
    const dot = String(composite).indexOf(".");
    if (dot < 0) return { section: null, id: composite };
    return { section: composite.slice(0, dot), id: composite.slice(dot + 1) };
  }

  return marginalPlusOneGains(baseConfig, engine, hunter, optIn, hooks, {
    keys,
    getLevel: (cfg, composite) => {
      const { section, id } = parseKey(composite);
      if (section === "relic") return Number(cfg.relics?.[id] || 0);
      if (section === "gem") return Number(cfg.gems?.[id] || 0);
      return 0;
    },
    getMax: () => RELIC_GEM_MAX,
    withPlusOne: (cfg, composite, next) => {
      const { section, id } = parseKey(composite);
      if (section === "relic") cfg.relics = { ...cfg.relics, [id]: next };
      else if (section === "gem") cfg.gems = { ...cfg.gems, [id]: next };
    },
    labelOf: (composite) => parseKey(composite).id || composite,
  });
}
