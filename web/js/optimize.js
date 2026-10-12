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
  /**
   * Two-sided α for Welch/z equality on the primary metric
   * (stage mean, loot/min, or bosses/day — see scoreGt).
   */
  stageTieAlpha: 0.05,
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
  let sumSq = 0;
  for (const [stageRaw, countRaw] of Object.entries(counts)) {
    const stage = Number(stageRaw);
    const c = Number(countRaw);
    if (!Number.isFinite(stage) || !Number.isFinite(c) || c <= 0) continue;
    n += c;
    sum += stage * c;
    sumSq += stage * stage * c;
  }
  if (n <= 0) {
    const avg = Number(res?.avgStage) || 0;
    const fallbackN = Math.max(1, Number(res?.n) || 1);
    return { n: fallbackN, mean: avg, variance: 0 };
  }
  const mean = sum / n;
  const variance = n > 1 ? Math.max(0, (sumSq - (sum * sum) / n) / (n - 1)) : 0;
  return { n, mean, variance };
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
  let sumSq = 0;
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
    sumSq += kills * kills * c;
  }
  if (n <= 0) {
    return { n: Math.max(1, Number(res?.n) || 1), mean: 0, variance: 0 };
  }
  const mean = sum / n;
  const variance = n > 1 ? Math.max(0, (sumSq - (sum * sum) / n) / (n - 1)) : 0;
  return { n, mean, variance };
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
  // WASM exposes mean loot/min only (no per-run loot). Approximate loot variance via
  // delta method under loot ∝ stage: Var(L) ≈ (L/S)² Var(S).
  const lootVariance =
    avgStage > 1e-9 ? st.variance * (lootScore / avgStage) * (lootScore / avgStage) : 0;
  return {
    avgStage,
    lootScore,
    lootVariance,
    n: st.n,
    variance: st.variance,
    bossesPerDay,
    bossesVariance: bossStats.variance * runsPerDay * runsPerDay,
    bossesN: bossStats.n,
    objective: normalizeObjective(objective),
    bossStages: normalizeBossStages(bossStages),
  };
}

function zCritForAlpha(alpha = 0.05) {
  return alpha <= 0.01 ? 2.57582930355 : alpha <= 0.05 ? 1.95996398454 : 1.64485362695;
}

function stagesSignificantlyDifferent(a, b, alpha = 0.05) {
  const n1 = Number(a.n) || 0;
  const n2 = Number(b.n) || 0;
  const diff = Number(a.avgStage) - Number(b.avgStage);
  if (n1 < 2 || n2 < 2) return Math.abs(diff) > 1e-9;

  const se2 = a.variance / n1 + b.variance / n2;
  if (!(se2 > 0)) return Math.abs(diff) > 1e-9;

  const z = Math.abs(diff) / Math.sqrt(se2);
  return z > zCritForAlpha(alpha);
}

function bossesSignificantlyDifferent(a, b, alpha = 0.05) {
  const n1 = Number(a.bossesN ?? a.n) || 0;
  const n2 = Number(b.bossesN ?? b.n) || 0;
  const diff = Number(a.bossesPerDay) - Number(b.bossesPerDay);
  if (n1 < 2 || n2 < 2) return Math.abs(diff) > 1e-9;

  const se2 = (Number(a.bossesVariance) || 0) / n1 + (Number(b.bossesVariance) || 0) / n2;
  if (!(se2 > 0)) return Math.abs(diff) > 1e-9;

  const z = Math.abs(diff) / Math.sqrt(se2);
  return z > zCritForAlpha(alpha);
}

function lootsSignificantlyDifferent(a, b, alpha = 0.05) {
  const n1 = Number(a.n) || 0;
  const n2 = Number(b.n) || 0;
  const diff = Number(a.lootScore) - Number(b.lootScore);
  if (n1 < 2 || n2 < 2) return Math.abs(diff) > 1e-9;

  const se2 = (Number(a.lootVariance) || 0) / n1 + (Number(b.lootVariance) || 0) / n2;
  if (!(se2 > 0)) return Math.abs(diff) > 1e-9;

  const z = Math.abs(diff) / Math.sqrt(se2);
  return z > zCritForAlpha(alpha);
}

function scoreGt(a, b, alpha = 0.05) {
  if (!a) return false;
  if (!b) return true;
  const objective = normalizeObjective(a.objective ?? b.objective);
  if (objective === "bosses") {
    if (bossesSignificantlyDifferent(a, b, alpha)) {
      return a.bossesPerDay > b.bossesPerDay;
    }
    if (a.lootScore !== b.lootScore) return a.lootScore > b.lootScore;
    if (a.bossesPerDay !== b.bossesPerDay) return a.bossesPerDay > b.bossesPerDay;
    return a.avgStage > b.avgStage;
  }
  if (objective === "loot") {
    // Mirror of stage push: primary = loot/min (Welch/z), secondary = Ø stage.
    if (lootsSignificantlyDifferent(a, b, alpha)) {
      return a.lootScore > b.lootScore;
    }
    if (a.avgStage !== b.avgStage) return a.avgStage > b.avgStage;
    return a.lootScore > b.lootScore;
  }
  if (stagesSignificantlyDifferent(a, b, alpha)) {
    return a.avgStage > b.avgStage;
  }
  if (a.lootScore !== b.lootScore) return a.lootScore > b.lootScore;
  return a.avgStage > b.avgStage;
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

function sortByScoreDesc(rows, alpha) {
  return rows.slice().sort((a, b) =>
    scoreGt(a.sc, b.sc, alpha) ? -1 : scoreGt(b.sc, a.sc, alpha) ? 1 : 0,
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

  const talentKeys = Object.keys(base.talents || {}).length
    ? Object.keys(base.talents)
    : [...costs.TALENT_ORDER];
  const attrKeys = Object.keys(base.attributes || {}).length
    ? Object.keys(base.attributes)
    : [...costs.ATTR_ORDER];

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
  } else if (prioritizeTm) {
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
    const ranked = sortByScoreDesc(screened, opt.stageTieAlpha);
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
      if (!prev || scoreGt(sc, prev.sc, opt.stageTieAlpha)) {
        screenedByKey.set(key, { sc, cfg: structuredClone(cfg), res });
      }
      if (scoreGt(sc, screenBestScore, opt.stageTieAlpha)) {
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
        const betterLocal = scoreGt(candScore, localScore, opt.stageTieAlpha);
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

    const screened = sortByScoreDesc([...screenedByKey.values()], opt.stageTieAlpha);
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
      if (scoreGt(rSc, refineBestScore, opt.stageTieAlpha)) {
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
    if (scoreGt(sc, searchBestScore, opt.stageTieAlpha)) {
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
      scoreGt(cur.sc, best.sc, opt.stageTieAlpha) ? cur : best,
    );
    searchBestCfg = ch.cfg;
    searchBestScore = ch.sc;
    searchBestEval = ch.res;
  }

  const improved =
    searchBestCfg != null && scoreGt(searchBestScore, baselineScore, opt.stageTieAlpha);
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

/** Lowest bosses/day that still counts as a clear. Below this, keep searching. */
const FIRST_BOSS_RATE_MIN = 0.2;

function fitTalentsToBudget(talents, cap, costs) {
  const keys = Object.keys(talents || {});
  const original = {};
  for (const key of keys) {
    const lvl = Math.max(0, Math.floor(Number(talents[key]) || 0));
    const mxRaw = Number(costs?.TALENT_COSTS?.[key]?.max);
    original[key] = Number.isFinite(mxRaw) ? Math.min(lvl, mxRaw) : lvl;
  }
  let spent = Object.values(original).reduce((sum, value) => sum + value, 0);
  if (spent <= cap) return { ...original };
  const scale = cap / spent;
  const out = {};
  spent = 0;
  for (const key of keys) {
    out[key] = Math.floor(original[key] * scale);
    spent += out[key];
  }
  const order = keys.slice().sort((a, b) => original[b] - original[a] || a.localeCompare(b));
  let guard = 0;
  while (spent < cap && guard < 10000) {
    let placed = false;
    for (const key of order) {
      if (spent >= cap) break;
      if (out[key] < original[key]) {
        out[key] += 1;
        spent += 1;
        placed = true;
      }
    }
    if (!placed) break;
    guard += 1;
  }
  return out;
}

function fitAttributesToBudget(attributes, budget, rules) {
  let out = rules.zeroOrphanDependents({ ...(attributes || {}) });
  const keys = Object.keys(out);
  const dependent = new Set();
  for (const key of keys) {
    for (const child of rules.dependentsOf(key)) dependent.add(child);
  }
  let guard = 0;
  while (guard < 10000) {
    guard += 1;
    out = rules.zeroOrphanDependents(out);
    const spent = rules.attrSpent(out);
    const tree = rules.attributesTreeValid(out, budget);
    if (tree.ok && spent <= budget) break;
    const candidates = keys.filter((key) => Number(out[key]) > 0);
    if (!candidates.length) break;
    candidates.sort((a, b) => {
      const aDep = dependent.has(a) ? 1 : 0;
      const bDep = dependent.has(b) ? 1 : 0;
      if (aDep !== bDep) return bDep - aDep;
      return Number(out[b]) - Number(out[a]);
    });
    out[candidates[0]] = Number(out[candidates[0]]) - 1;
  }
  return rules.zeroOrphanDependents(out);
}

const STAT_POINTS_PER_LEVEL = 3;

function materialStatClasses(hunter) {
  const slots = hunter.statResource || {};
  const grouped = { mat1: [], mat2: [], mat3: [] };
  for (const [stat, slot] of Object.entries(slots)) {
    if (grouped[slot]) grouped[slot].push(stat);
  }
  return ["mat1", "mat2", "mat3"].map((slot) => grouped[slot]).filter((keys) => keys.length);
}

/** Add `points` levels, each on a random stat in `classKeys` that is still under its cap. */
function grantClassPoints(stats, classKeys, statMax, random, points) {
  const next = { ...stats };
  for (let i = 0; i < points; i++) {
    const open = classKeys.filter((key) => {
      const mxRaw = Number(statMax?.[key]);
      const cap = Number.isFinite(mxRaw) ? mxRaw : 9999;
      return (Number(next[key]) || 0) < cap;
    });
    if (!open.length) break;
    const key = open[Math.floor(random() * open.length)];
    next[key] = (Number(next[key]) || 0) + 1;
  }
  return next;
}

/**
 * From `fromLevel` upward, each level puts STAT_POINTS_PER_LEVEL into one
 * material class chosen at random, then splits those points across that class.
 */
function statsAlongLevels(baseStats, fromLevel, toLevel, hunter, random) {
  const classes = materialStatClasses(hunter);
  const statMax = hunter.costs?.STAT_MAX || {};
  const byLevel = new Map();
  let stats = { ...(baseStats || {}) };
  byLevel.set(fromLevel, stats);
  for (let level = fromLevel + 1; level <= toLevel; level++) {
    if (classes.length) {
      const classKeys = classes[Math.floor(random() * classes.length)];
      stats = grantClassPoints(stats, classKeys, statMax, random, STAT_POINTS_PER_LEVEL);
    }
    byLevel.set(level, stats);
  }
  return byLevel;
}

/**
 * One optimize pass per hunter level, starting at the current level.
 * Each pass uses that level's talent/attribute budget (1 talent and 3 attribute
 * points per level). Combat stats gain 3 points per level inside one random material class.
 * Always 1 iteration per level, with many independent talent/attribute mixes.
 * Timeless Mastery is not locked. Levels are scanned +4, then down by 2, then up by 1.
 * 0.2 bosses/day is the floor. The reported level is the lowest that still reaches it.
 * Does not write the caller's config.
 */
export async function findFirstBossKill(baseConfig, engine, hunter, optIn = {}, hooks = {}) {
  const onProgress = hooks.onProgress || (() => {});
  const isCancelled = hooks.isCancelled || (() => false);
  const maxLevel = Math.max(0, Math.min(999, Math.floor(Number(optIn.maxLevel ?? 999))));
  const bossStages = normalizeBossStages(optIn.bossStages);
  const bossStage = bossStages[0];
  if (!bossStage) {
    throw new Error("Select at least one boss (100 / 200 / 300).");
  }

  const base = structuredClone(baseConfig);
  const baseLevel = Math.max(0, Math.min(maxLevel, Math.floor(Number(base.meta?.level) || 0)));
  base.meta = { ...(base.meta || {}), level: baseLevel };
  const stages = [bossStage];
  const loops = 1;
  const finderSearch = {
    loops,
    refineMin: 3,
    refineMax: 3,
    objective: "bosses",
    bossStages: stages,
    prioritizeTimelessMastery: false,
    coldStart: true,
    biasBlend: 0,
    restarts: 24,
    stagnationLimit: 6,
    maxEvals: 240,
    jumpChance: 0.45,
  };
  const rng = makeRng(optIn.seed == null ? Math.floor(Math.random() * 0x7fffffff) + 1 : optIn.seed);
  const statsByLevel = statsAlongLevels(base.stats, baseLevel, maxLevel, hunter, rng.random);
  let currentBossesPerDay = 0;
  let last = null;

  const finish = (row, found, similarStop = "") => {
    return {
      cancelled: false,
      found,
      baseLevel,
      level: row.level,
      levelsNeeded: Math.max(0, row.level - baseLevel),
      bossesPerDay: row.bossesPerDay,
      currentBossesPerDay,
      avgStage: row.avgStage,
      bossStage,
      runsPerDay: Number(row.runsPerDay) || 0,
      peakLevel: row.peakLevel ?? row.level,
      peakBossesPerDay: Number(row.peakBossesPerDay ?? row.bossesPerDay) || 0,
      peakAvgStage: Number(row.peakAvgStage ?? row.avgStage) || 0,
      peakRunsPerDay: Number(row.peakRunsPerDay ?? row.runsPerDay) || 0,
      similarStop,
      statsBefore: base.stats || {},
      statsAfter: row.cfg?.stats || {},
      talents: { ...(row.cfg?.talents || {}) },
      attributes: { ...(row.cfg?.attributes || {}) },
      loops,
    };
  };

  const searched = new Map();

  function stampPeak(row, peak) {
    if (!peak) return row;
    return {
      ...row,
      peakLevel: peak.level,
      peakBossesPerDay: peak.bossesPerDay,
      peakAvgStage: peak.avgStage,
      peakRunsPerDay: peak.runsPerDay,
    };
  }

  async function searchLevel(level, phase, seed) {
    const cached = searched.get(level);
    // A miss from the +4 scan is not final. Down/−2 and +1 search that level again.
    if (cached && (cached.bossesPerDay >= FIRST_BOSS_RATE_MIN || phase === "Up +4")) return cached;
    if (isCancelled()) return { cancelled: true };
    const grown = statsByLevel.get(level) || base.stats;
    const caps = pointBudgets(level);
    const cfg = structuredClone(base);
    cfg.meta = { ...(cfg.meta || {}), level };
    cfg.stats = { ...grown };
    if (seed?.cfg) {
      const fittedTalents = fitTalentsToBudget(seed.cfg.talents, caps.talents, hunter.costs);
      const fittedAttrs = fitAttributesToBudget(seed.cfg.attributes, caps.attributes, hunter.attrs);
      const talentKeys = Object.keys(base.talents || {}).length ? Object.keys(base.talents) : Object.keys(fittedTalents);
      const attrKeys = Object.keys(base.attributes || {}).length ? Object.keys(base.attributes) : Object.keys(fittedAttrs);
      cfg.talents = Object.fromEntries(talentKeys.map((key) => [key, Number(fittedTalents[key]) || 0]));
      cfg.attributes = Object.fromEntries(attrKeys.map((key) => [key, Number(fittedAttrs[key]) || 0]));
      const seeded = validateBudgets(cfg, hunter);
      if (!seeded.ok) {
        cfg.talents = structuredClone(base.talents || {});
        cfg.attributes = structuredClone(base.attributes || {});
      }
    }
    let optimized;
    try {
      optimized = await optimizeBuild(cfg, engine, hunter, finderSearch, {
        isCancelled,
        onProgress: (p) => {
          onProgress({
            ...p,
            msg: `${phase} · level ${level} · talents ${caps.talents} · attributes ${caps.attributes} · ${p.msg}`,
          });
        },
      });
    } catch (err) {
      if (isCancelled()) return { cancelled: true };
      throw err;
    }
    if (isCancelled()) return { cancelled: true };
    if (level === baseLevel) {
      currentBossesPerDay = Number(optimized.baselineScore?.bossesPerDay) || 0;
    }
    const best = optimized.bestScore || optimized.baselineScore;
    const bestEval = optimized.bestEval || optimized.baselineEval;
    const row = {
      level,
      bossesPerDay: Number(best?.bossesPerDay) || 0,
      avgStage: Number(best?.avgStage) || 0,
      runsPerDay: Number(bestEval?.runsPerDay) || 0,
      cfg: optimized.bestConfig || cfg,
      peakLevel: level,
      peakBossesPerDay: Number(best?.bossesPerDay) || 0,
      peakAvgStage: Number(best?.avgStage) || 0,
      peakRunsPerDay: Number(bestEval?.runsPerDay) || 0,
    };
    searched.set(level, row);
    last = row;
    return row;
  }

  let level = baseLevel;
  let firstHit = null;
  while (level <= maxLevel) {
    const row = await searchLevel(level, "Up +4");
    if (row?.cancelled) return { cancelled: true };
    if (row.bossesPerDay >= FIRST_BOSS_RATE_MIN) {
      firstHit = row;
      break;
    }
    if (level >= maxLevel) break;
    const next = Math.min(maxLevel, level + 4);
    if (next === level) break;
    level = next;
  }

  if (!firstHit) {
    return finish(last || { level: baseLevel, bossesPerDay: 0, avgStage: 0, cfg: base }, false);
  }

  let cursor = firstHit;
  let dropped = null;
  while (cursor.level - 2 >= baseLevel) {
    const row = await searchLevel(cursor.level - 2, "Down −2", cursor);
    if (row?.cancelled) return { cancelled: true };
    if (row.bossesPerDay < FIRST_BOSS_RATE_MIN) {
      dropped = row;
      break;
    }
    cursor = row;
  }

  if (!dropped) {
    return finish(stampPeak(cursor, firstHit), true, "grid");
  }

  for (let up = dropped.level + 1; up <= cursor.level; up++) {
    const row = await searchLevel(up, "Up +1", cursor);
    if (row?.cancelled) return { cancelled: true };
    if (row.bossesPerDay >= FIRST_BOSS_RATE_MIN) {
      return finish(stampPeak(row, firstHit), true, "step");
    }
  }

  return finish(stampPeak(cursor, firstHit), true, "step");
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
  const alpha = DEFAULT_OPTIMIZE.stageTieAlpha;

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
        significant: false,
        significantBenefit: false,
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
    const significant = stagesSignificantlyDifferent(sc, baselineScore, alpha);
    const significantBenefit = significant && sc.avgStage > baselineScore.avgStage;
    const entry = {
      key,
      skipped: null,
      avgStage: sc.avgStage,
      lootScore: sc.lootScore,
      dStage: sc.avgStage - baselineScore.avgStage,
      dLoot: sc.lootScore - baselineScore.lootScore,
      score: sc,
      significant,
      significantBenefit,
    };
    results.push(entry);
    if (significantBenefit && (!bestScore || scoreGt(sc, bestScore, alpha))) {
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
    stageTieAlpha: alpha,
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
