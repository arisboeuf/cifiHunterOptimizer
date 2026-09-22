/** Monte-Carlo local search over talent/attribute budgets (WASM eval). */
import {
  ATTRIBUTE_COSTS,
  ATTR_ORDER,
  TALENT_COSTS,
  TALENT_ORDER,
} from "./hunters/borge/costs.js";
import {
  attrSpent,
  attributesTreeValid,
  canIncreaseAttribute,
  dependentsOf,
  zeroOrphanDependents,
} from "./hunters/borge/attr-rules.js";
import { pointBudgets, validateBudgets } from "./build.js";
import { wasmToSimResult } from "./hunters/borge/wasm-engine.js";

export const DEFAULT_OPTIMIZE = {
  nSearch: 250,
  nRefine: 1000,
  nBaseline: 200,
  maxEvals: 200,
  restarts: 8,
  stagnationLimit: 18,
  topK: 5,
  /** Independent full search passes; champions are compared statistically at the end. */
  loops: 1,
  seed: null,
  forceTimelessMastery5: false,
  /** Two-sided α for Welch/z stage-mean equality (loot tie-break when not different). */
  stageTieAlpha: 0.05,
};

const TIMELESS_KEY = "timeless_mastery";
const TIMELESS_PARENT_MIN = {
  soul_of_ares: 1,
  essence_of_ylith: 1,
  spartan_lineage: 1,
};

function talentMax(key) {
  return Number(TALENT_COSTS[key]?.max ?? 0);
}

function attrCost(key) {
  return Number(ATTRIBUTE_COSTS[key]?.cost ?? 1);
}

function attrMax(key) {
  const mx = ATTRIBUTE_COSTS[key]?.max;
  return mx === Infinity ? 9999 : Number(mx ?? 0);
}

function attrsValid(attrs, budget) {
  return attributesTreeValid(attrs, budget).ok;
}

function ensureTimelessLock(attrs, keys) {
  const out = Object.fromEntries(keys.map((k) => [k, Number(attrs[k] ?? 0)]));
  for (const [k, mn] of Object.entries(TIMELESS_PARENT_MIN)) {
    if (k in out) out[k] = Math.max(Number(out[k] ?? 0), mn);
  }
  if (TIMELESS_KEY in out || keys.includes(TIMELESS_KEY)) out[TIMELESS_KEY] = 5;
  return zeroOrphanDependents(out);
}

function timelessLockCost() {
  let cost = 5 * attrCost(TIMELESS_KEY);
  for (const [k, mn] of Object.entries(TIMELESS_PARENT_MIN)) {
    cost += mn * attrCost(k);
  }
  return cost;
}

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

/** Score used for ranking: Ø stage primary, loot on statistical stage-tie. */
function scoreOf(res) {
  const st = stageStatsFromCounts(res);
  return {
    avgStage: Number(res.avgStage) || st.mean,
    lootScore: Number(res.lootScore) || 0,
    n: st.n,
    variance: st.variance,
  };
}

/**
 * Welch two-sample test (normal/z approx for large n): are means different at `alpha`?
 * Default α=0.05 → critical |z| ≈ 1.96.
 */
function stagesSignificantlyDifferent(a, b, alpha = 0.05) {
  const n1 = Number(a.n) || 0;
  const n2 = Number(b.n) || 0;
  const diff = Number(a.avgStage) - Number(b.avgStage);
  if (n1 < 2 || n2 < 2) return Math.abs(diff) > 1e-9;

  const se2 = a.variance / n1 + b.variance / n2;
  if (!(se2 > 0)) return Math.abs(diff) > 1e-9;

  const z = Math.abs(diff) / Math.sqrt(se2);
  // two-sided normal critical value
  const zCrit =
    alpha <= 0.01 ? 2.57582930355 : alpha <= 0.05 ? 1.95996398454 : 1.64485362695;
  return z > zCrit;
}

/** True if `a` is better than `b` (statistically higher stage, else higher loot). */
function scoreGt(a, b, alpha = 0.05) {
  if (!a) return false;
  if (!b) return true;
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
  };
}

function yieldToUi() {
  return new Promise((r) => setTimeout(r, 0));
}

function randomTalents(rng, keys, budget) {
  const levels = Object.fromEntries(keys.map((k) => [k, 0]));
  let remaining = budget;
  while (remaining > 0) {
    const candidates = keys.filter((k) => levels[k] < talentMax(k));
    if (!candidates.length) break;
    levels[rng.choice(candidates)] += 1;
    remaining -= 1;
  }
  return levels;
}

function randomAttributes(rng, keys, budget, forceTimeless5) {
  let levels = Object.fromEntries(keys.map((k) => [k, 0]));
  if (forceTimeless5) {
    levels = ensureTimelessLock(levels, keys);
    if (attrSpent(levels) > budget) return levels;
  }
  let remaining = budget - attrSpent(levels);
  for (let i = 0; i < budget * 6; i++) {
    if (remaining <= 0) break;
    const candidates = keys.filter(
      (k) =>
        (!forceTimeless5 || k !== TIMELESS_KEY) &&
        attrCost(k) <= remaining &&
        canIncreaseAttribute(levels, k),
    );
    if (!candidates.length) break;
    const k = rng.choice(candidates);
    levels[k] = Number(levels[k] ?? 0) + 1;
    remaining -= attrCost(k);
  }
  if (forceTimeless5) levels = ensureTimelessLock(levels, keys);
  return levels;
}

function neighborTalents(rng, talents, keys) {
  const donors = keys.filter((k) => Number(talents[k] ?? 0) > 0);
  const receivers = keys.filter((k) => Number(talents[k] ?? 0) < talentMax(k));
  if (!donors.length || !receivers.length) return null;
  for (let i = 0; i < 24; i++) {
    const a = rng.choice(donors);
    const b = rng.choice(receivers);
    if (a === b) continue;
    const out = { ...talents };
    out[a] = Number(out[a]) - 1;
    out[b] = Number(out[b] ?? 0) + 1;
    return out;
  }
  return null;
}

function neighborAttributes(rng, attrs, keys, budget, forceTimeless5) {
  const lockedFloor = forceTimeless5 ? { ...TIMELESS_PARENT_MIN, [TIMELESS_KEY]: 5 } : {};
  const donors = keys.filter((k) => Number(attrs[k] ?? 0) > (lockedFloor[k] ?? 0));
  if (!donors.length) return null;
  const baseSnap = Object.fromEntries(keys.map((k) => [k, Number(attrs[k] ?? 0)]));
  for (let i = 0; i < 48; i++) {
    const a = rng.choice(donors);
    let out = { ...baseSnap };
    const floor = lockedFloor[a] ?? 0;
    out[a] = Math.max(floor, Number(out[a]) - 1);
    if (out[a] <= 0 && !(a in lockedFloor)) {
      out[a] = 0;
      for (const dep of dependentsOf(a)) {
        if (dep in lockedFloor) continue;
        out[dep] = 0;
      }
    }
    out = forceTimeless5 ? ensureTimelessLock(out, keys) : zeroOrphanDependents(out);
    const remaining = budget - attrSpent(out);
    const receivers = keys.filter(
      (k) =>
        k !== a &&
        (!forceTimeless5 || k !== TIMELESS_KEY) &&
        canIncreaseAttribute(out, k) &&
        attrCost(k) <= remaining,
    );
    if (receivers.length) {
      const b = rng.choice(receivers);
      out[b] = Number(out[b] ?? 0) + 1;
    }
    if (forceTimeless5) out = ensureTimelessLock(out, keys);
    const changed = keys.some((k) => Number(out[k] ?? 0) !== baseSnap[k]);
    if (attrsValid(out, budget) && changed) return out;
  }
  return null;
}

function applyPoints(base, talents, attrs) {
  const cfg = structuredClone(base);
  cfg.talents = Object.fromEntries(
    Object.keys(base.talents || {}).map((k) => [k, Number(talents[k] ?? 0)]),
  );
  for (const [k, v] of Object.entries(talents)) cfg.talents[k] = Number(v);
  let cleaned = zeroOrphanDependents(
    Object.fromEntries(Object.keys(base.attributes || {}).map((k) => [k, Number(attrs[k] ?? 0)])),
  );
  for (const [k, v] of Object.entries(attrs)) cleaned[k] = Number(v);
  cleaned = zeroOrphanDependents(cleaned);
  cfg.attributes = Object.fromEntries(
    Object.keys(base.attributes || {}).map((k) => [k, Number(cleaned[k] ?? 0)]),
  );
  for (const [k, v] of Object.entries(cleaned)) cfg.attributes[k] = Number(v);
  return cfg;
}

/**
 * @param {object} baseConfig
 * @param {import('./hunters/borge/wasm-engine.js').WasmBorgeEngine} engine
 * @param {Partial<typeof DEFAULT_OPTIMIZE>} [optIn]
 * @param {{ onProgress?: Function, isCancelled?: () => boolean }} [hooks]
 */
export async function optimizeBuild(baseConfig, engine, optIn = {}, hooks = {}) {
  const opt = { ...DEFAULT_OPTIMIZE, ...optIn };
  const rng = makeRng(opt.seed);
  const forceTm = !!opt.forceTimelessMastery5;
  const onProgress = hooks.onProgress || (() => {});
  const isCancelled = hooks.isCancelled || (() => false);

  const base = structuredClone(baseConfig);
  const level = Number(base.meta?.level ?? 0);
  const caps = pointBudgets(level);
  const talCap = caps.talents;
  const attrCap = caps.attributes;

  const talentKeys = Object.keys(base.talents || {}).length
    ? Object.keys(base.talents)
    : [...TALENT_ORDER];
  const attrKeys = Object.keys(base.attributes || {}).length
    ? Object.keys(base.attributes)
    : [...ATTR_ORDER];

  if (forceTm && timelessLockCost() > attrCap) {
    throw new Error(
      `Timeless Mastery 5 braucht mind. ${timelessLockCost()} Path Points (Level ${level} hat ${attrCap}).`,
    );
  }

  const loops = Math.max(1, Math.floor(Number(opt.loops) || 1));
  const perLoopBudget = Math.max(1, opt.maxEvals + opt.topK);
  const totalBudget = Math.max(1, 1 + loops * perLoopBudget + loops);
  let evals = 0;
  let globalDone = 0;
  const history = [];
  const loopChampions = [];

  const notify = (msg, done, stage = null, loot = null) => {
    onProgress({
      msg,
      done: done ?? globalDone,
      total: totalBudget,
      stage,
      loot,
      evals,
      loop: null,
      loops,
    });
  };

  const evaluate = async (cfg, n, enforceTimeless) => {
    if (isCancelled()) return null;
    if (enforceTimeless && Number(cfg.attributes?.[TIMELESS_KEY] ?? 0) !== 5) return null;
    const v = validateBudgets(cfg);
    if (!v.ok) return null;
    await yieldToUi();
    if (isCancelled()) return null;
    const wasmRes = engine.evaluate(v.config, Math.max(1, Number(n) || 1));
    return wasmToSimResult(wasmRes, n);
  };

  const curTal = Object.fromEntries(talentKeys.map((k) => [k, Number(base.talents?.[k] ?? 0)]));
  const curAttr = zeroOrphanDependents(
    Object.fromEntries(attrKeys.map((k) => [k, Number(base.attributes?.[k] ?? 0)])),
  );
  const baselineCfg = applyPoints(base, curTal, curAttr);

  notify(`Simuliere aktuellen Build (${opt.nBaseline} sims)…`, 0);
  const baselineEval = await evaluate(baselineCfg, opt.nBaseline, false);
  if (!baselineEval) {
    throw new Error("Aktueller Build konnte nicht simuliert werden (ungültig oder abgebrochen).");
  }
  evals += 1;
  globalDone = 1;
  const baselineScore = scoreOf(baselineEval);
  notify("Baseline fertig", globalDone, baselineScore.avgStage, baselineScore.lootScore);

  for (let loop = 0; loop < loops; loop++) {
    if (isCancelled()) break;

    let top = [];
    let searchBestCfg = null;
    let searchBestScore = null;
    let searchBestEval = null;
    let loopEvals = 0;
    const loopOffset = 1 + loop * perLoopBudget;

    const loopNotify = (msg, stage = null, loot = null) => {
      globalDone = Math.min(totalBudget, loopOffset + loopEvals);
      const prefix = loops > 1 ? `Schleife ${loop + 1}/${loops} · ` : "";
      onProgress({
        msg: `${prefix}${msg}`,
        done: globalDone,
        total: totalBudget,
        stage,
        loot,
        evals,
        loop: loop + 1,
        loops,
      });
    };

    const considerSearch = (cfg, res) => {
      const sc = scoreOf(res);
      history.push(sc);
      top.push({ sc, cfg: structuredClone(cfg), res });
      top.sort((a, b) =>
        scoreGt(a.sc, b.sc, opt.stageTieAlpha)
          ? -1
          : scoreGt(b.sc, a.sc, opt.stageTieAlpha)
            ? 1
            : 0,
      );
      top = top.slice(0, opt.topK);
      if (scoreGt(sc, searchBestScore, opt.stageTieAlpha)) {
        searchBestScore = sc;
        searchBestCfg = structuredClone(cfg);
        searchBestEval = res;
      }
    };

    loopNotify("Suche…");

    for (let restart = 0; restart < opt.restarts; restart++) {
      if (isCancelled() || loopEvals >= opt.maxEvals) break;

      let tal = randomTalents(rng, talentKeys, talCap);
      let attr = randomAttributes(rng, attrKeys, attrCap, forceTm);
      let localCfg = applyPoints(base, tal, attr);
      let localRes = await evaluate(localCfg, opt.nSearch, forceTm);
      if (!localRes) continue;
      evals += 1;
      loopEvals += 1;
      considerSearch(localCfg, localRes);
      let localScore = scoreOf(localRes);
      let stagnant = 0;
      const show = searchBestScore || localScore;
      loopNotify(
        `Suche r${restart + 1}/${opt.restarts}`,
        show.avgStage,
        show.lootScore,
      );

      while (stagnant < opt.stagnationLimit && loopEvals < opt.maxEvals) {
        if (isCancelled()) break;
        let nxtTal;
        let nxtAttr;
        if (rng.random() < 0.5) {
          nxtTal = neighborTalents(rng, tal, talentKeys);
          nxtAttr = attr;
          if (!nxtTal) {
            nxtAttr = neighborAttributes(rng, attr, attrKeys, attrCap, forceTm);
            nxtTal = tal;
          }
        } else {
          nxtAttr = neighborAttributes(rng, attr, attrKeys, attrCap, forceTm);
          nxtTal = tal;
          if (!nxtAttr) {
            nxtTal = neighborTalents(rng, tal, talentKeys);
            nxtAttr = attr;
          }
        }
        if (!nxtTal && !nxtAttr) break;
        if (!nxtTal) nxtTal = tal;
        if (!nxtAttr) nxtAttr = attr;

        const cand = applyPoints(base, nxtTal, nxtAttr);
        const candRes = await evaluate(cand, opt.nSearch, forceTm);
        if (!candRes) {
          if (isCancelled()) break;
          stagnant += 1;
          continue;
        }
        evals += 1;
        loopEvals += 1;
        const candScore = scoreOf(candRes);
        considerSearch(cand, candRes);
        const betterLocal = scoreGt(candScore, localScore, opt.stageTieAlpha);
        const accept =
          betterLocal ||
          (stagnant > 4 &&
            candScore.avgStage >= localScore.avgStage - 0.5 &&
            rng.random() < 0.12);
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
          `Suche r${restart + 1} eval ${loopEvals}`,
          searchBestScore?.avgStage,
          searchBestScore?.lootScore,
        );
      }
    }

    const refinePool = top.slice(0, opt.topK);
    for (let i = 0; i < refinePool.length; i++) {
      if (isCancelled()) break;
      const { sc, cfg } = refinePool[i];
      loopNotify(`Refine ${i + 1}/${refinePool.length}…`, sc.avgStage, sc.lootScore);
      const r = await evaluate(cfg, opt.nRefine, forceTm);
      if (!r) continue;
      evals += 1;
      loopEvals += 1;
      considerSearch(cfg, r);
      loopNotify(
        `Refined ${i + 1}`,
        searchBestScore?.avgStage,
        searchBestScore?.lootScore,
      );
    }

    globalDone = Math.min(totalBudget, 1 + (loop + 1) * perLoopBudget);
    if (searchBestCfg && searchBestEval) {
      loopChampions.push({
        loop: loop + 1,
        cfg: searchBestCfg,
        res: searchBestEval,
        sc: searchBestScore,
      });
      loopNotify(
        `Champion Ø ${searchBestScore.avgStage.toFixed(1)}`,
        searchBestScore.avgStage,
        searchBestScore.lootScore,
      );
    }
  }

  // Final tournament: fair re-sim of loop champions, then statistical pick.
  let searchBestCfg = null;
  let searchBestScore = null;
  let searchBestEval = null;

  const unique = [];
  const seen = new Set();
  for (const ch of loopChampions) {
    const key = JSON.stringify({ t: ch.cfg.talents, a: ch.cfg.attributes });
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(ch);
  }

  for (let i = 0; i < unique.length; i++) {
    if (isCancelled()) break;
    const ch = unique[i];
    globalDone = Math.min(totalBudget, 1 + loops * perLoopBudget + i + 1);
    const prefix = loops > 1 ? `Finale ${i + 1}/${unique.length} · ` : "Finale · ";
    notify(
      `${prefix}Vergleich (${opt.nRefine} sims)…`,
      globalDone,
      ch.sc?.avgStage,
      ch.sc?.lootScore,
    );
    const r = await evaluate(ch.cfg, opt.nRefine, forceTm);
    if (!r) continue;
    evals += 1;
    const sc = scoreOf(r);
    history.push(sc);
    if (scoreGt(sc, searchBestScore, opt.stageTieAlpha)) {
      searchBestScore = sc;
      searchBestCfg = structuredClone(ch.cfg);
      searchBestEval = r;
    }
    notify(
      `${prefix}Ø ${sc.avgStage.toFixed(1)} · loot ${sc.lootScore.toFixed(1)}`,
      globalDone,
      searchBestScore?.avgStage,
      searchBestScore?.lootScore,
    );
  }

  // Single-loop fallback if finale produced nothing but a champion exists
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

  notify("Done", totalBudget, bestScore.avgStage, bestScore.lootScore);

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
  };
}
