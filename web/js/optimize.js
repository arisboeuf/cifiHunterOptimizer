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
  seed: null,
  forceTimelessMastery5: false,
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

function scoreOf(res) {
  return [Number(res.avgStage), Number(res.lootScore)];
}

function scoreGt(a, b) {
  if (a[0] !== b[0]) return a[0] > b[0];
  return a[1] > b[1];
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

  const totalBudget = Math.max(1, opt.maxEvals + opt.topK + 1);
  let evals = 0;
  const history = [];
  let top = [];
  let searchBestCfg = null;
  let searchBestScore = [-1, -1];
  let searchBestEval = null;

  const notify = (msg, done, stage = null, loot = null) => {
    onProgress({
      msg,
      done,
      total: totalBudget,
      stage,
      loot,
      evals,
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

  const considerSearch = (cfg, res) => {
    const sc = scoreOf(res);
    history.push(sc);
    top.push({ sc, cfg: structuredClone(cfg), res });
    top.sort((a, b) => (scoreGt(a.sc, b.sc) ? -1 : scoreGt(b.sc, a.sc) ? 1 : 0));
    top = top.slice(0, opt.topK);
    if (scoreGt(sc, searchBestScore)) {
      searchBestScore = sc;
      searchBestCfg = structuredClone(cfg);
      searchBestEval = res;
    }
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
  const baselineScore = scoreOf(baselineEval);
  notify("Baseline fertig", evals, baselineScore[0], baselineScore[1]);

  for (let restart = 0; restart < opt.restarts; restart++) {
    if (isCancelled() || evals >= opt.maxEvals + 1) break;

    let tal = randomTalents(rng, talentKeys, talCap);
    let attr = randomAttributes(rng, attrKeys, attrCap, forceTm);
    let localCfg = applyPoints(base, tal, attr);
    let localRes = await evaluate(localCfg, opt.nSearch, forceTm);
    if (!localRes) continue;
    evals += 1;
    considerSearch(localCfg, localRes);
    let localScore = scoreOf(localRes);
    let stagnant = 0;
    const show = searchBestScore[0] >= 0 ? searchBestScore : localScore;
    notify(`Suche Start ${restart + 1}/${opt.restarts}`, evals, show[0], show[1]);

    while (stagnant < opt.stagnationLimit && evals < opt.maxEvals + 1) {
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
      const candScore = scoreOf(candRes);
      considerSearch(cand, candRes);
      const betterLocal = scoreGt(candScore, localScore);
      const accept =
        betterLocal ||
        (stagnant > 4 && candScore[0] >= localScore[0] - 0.5 && rng.random() < 0.12);
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
      notify(
        `Suche r${restart + 1} eval ${evals}`,
        evals,
        searchBestScore[0],
        searchBestScore[1],
      );
    }
  }

  const refinePool = top.slice(0, opt.topK);
  for (let i = 0; i < refinePool.length; i++) {
    if (isCancelled()) break;
    const { sc, cfg } = refinePool[i];
    notify(`Refine ${i + 1}/${refinePool.length}…`, evals, sc[0], sc[1]);
    const r = await evaluate(cfg, opt.nRefine, forceTm);
    if (!r) continue;
    evals += 1;
    considerSearch(cfg, r);
    notify(`Refined ${i + 1}`, evals, searchBestScore[0], searchBestScore[1]);
  }

  const improved = searchBestCfg != null && scoreGt(searchBestScore, baselineScore);
  const bestCfg = improved ? searchBestCfg : structuredClone(baselineCfg);
  const bestScore = improved ? searchBestScore : baselineScore;
  const bestEval = improved ? searchBestEval : baselineEval;

  notify("Done", totalBudget, bestScore[0], bestScore[1]);

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
  };
}
