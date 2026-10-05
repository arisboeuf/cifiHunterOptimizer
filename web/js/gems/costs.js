import { GU_DEFS, QUALITY_CHAIN } from "./data.js";

/** Cost of purchasing GU level `level` (1-based), using SirRed early formula. */
export function guCost(def, level) {
  if (level < 1) return 0;
  return def.base * def.multi ** (level - 1);
}

/** Next `count` single-level purchase costs starting after `currentLevel`. */
export function nextThreeCosts(def, currentLevel, count = 3) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const level = currentLevel + i;
    if (def.max != null && level > def.max) break;
    out.push({ level, cost: guCost(def, level) });
  }
  return out;
}

export function formatOO(value) {
  if (value == null || Number.isNaN(value)) return "—";
  const n = Number(value);
  const abs = Math.abs(n);
  const suffixes = [
    [1e15, "qa"],
    [1e12, "t"],
    [1e9, "b"],
    [1e6, "m"],
    [1e3, "k"],
  ];
  for (const [div, suf] of suffixes) {
    if (abs >= div) {
      const v = n / div;
      const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
      return `${trimNum(v, digits)}${suf} OO`;
    }
  }
  return `${trimNum(n, n >= 100 ? 1 : 4)} OO`;
}

function trimNum(n, maxDigits) {
  const s = Number(n).toFixed(maxDigits);
  return s.replace(/\.?0+$/, "");
}

/** Relative heatmap class for a cost among peers (current buy horizon). */
export function heatClass(cost, peers) {
  const vals = peers.filter((c) => c > 0 && Number.isFinite(c));
  if (!vals.length || !Number.isFinite(cost) || cost <= 0) return "hm-1";
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max <= min) return "hm-1";
  const t = Math.log(cost / min) / Math.log(max / min);
  if (t < 0.2) return "hm-1";
  if (t < 0.4) return "hm-2";
  if (t < 0.6) return "hm-3";
  if (t < 0.8) return "hm-4";
  return "hm-5";
}

function qualityOwned(progress, gem, quality) {
  return (progress.qualities[gem] || 0) >= quality;
}

function guOwned(progress, gem, id, level) {
  return (progress.upgrades[gem]?.[id] || 0) >= level;
}

/**
 * First quality in the planner chain that is not yet owned
 * but whose requirement (and optional GU gate) is met.
 */
export function findNextQuality(progress) {
  for (const node of QUALITY_CHAIN) {
    if (qualityOwned(progress, node.gem, node.quality)) continue;
    if (node.req && !qualityOwned(progress, node.req.gem, node.req.quality)) continue;
    if (node.guGate && !guOwned(progress, node.guGate.gem, node.guGate.id, node.guGate.level)) {
      return {
        ...node,
        blocked: true,
        blockReason: `${node.guGate.gem} ${node.guGate.id} Lv${node.guGate.level} required`,
      };
    }
    const guDef = node.unlocksGu
      ? GU_DEFS[node.unlocksGu.gem]?.find((g) => g.id === node.unlocksGu.id)
      : null;
    const firstGu = guDef ? nextThreeCosts(guDef, 0, 3) : [];
    return {
      ...node,
      blocked: false,
      requirementMet: true,
      requirementLabel: node.req ? `${node.req.gem} Q${node.req.quality}` : "None",
      unlocksLabel: guDef ? guDef.name : null,
      guEffect: guDef ? guDef.effect : null,
      firstGuCosts: firstGu,
    };
  }
  return null;
}

/** Active GUs for the player's owned qualities. */
export function activeGuRows(progress) {
  const rows = [];
  for (const [gem, defs] of Object.entries(GU_DEFS)) {
    const q = progress.qualities[gem] || 0;
    if (q <= 0) continue;
    for (const def of defs) {
      if (def.fromQ > q) continue;
      const current = progress.upgrades[gem]?.[def.id] ?? 0;
      rows.push({
        gem,
        quality: q,
        def,
        current,
        next: nextThreeCosts(def, current, 3),
      });
    }
  }
  return rows;
}

export function allDisplayedCosts(rows, nextQuality) {
  const costs = [];
  for (const row of rows) {
    for (const step of row.next) costs.push(step.cost);
  }
  if (nextQuality) {
    costs.push(nextQuality.cost);
    for (const step of nextQuality.firstGuCosts || []) costs.push(step.cost);
  }
  return costs;
}
