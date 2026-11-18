import {
  GEM_NODES,
  GEM_NODES_UNLOCK_EXODUS_Q,
  GEM_ORDER,
  GU_DEFS,
  QUALITY_CHAIN,
} from "./data.js";

/** Cost of purchasing GU level `level` (1-based), using SirRed early formula. */
export function guCost(def, level) {
  if (level < 1) return 0;
  return def.base * def.multi ** (level - 1);
}

/** Default horizon for the expandable “next N costs” table. */
export const GU_COST_HORIZON = 30;

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
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const suffixes = [
    [1e24, "sp"],
    [1e21, "sx"],
    [1e18, "qu"],
    [1e15, "qa"],
    [1e12, "t"],
    [1e9, "b"],
    [1e6, "m"],
    [1e3, "k"],
  ];
  for (const [div, suf] of suffixes) {
    if (abs >= div) {
      return `${(n / div).toFixed(2)}${suf} OO`;
    }
  }
  return `${n.toFixed(2)} OO`;
}

export function gemNodesUnlocked(progress) {
  return (progress.qualities?.Exodus || 0) >= GEM_NODES_UNLOCK_EXODUS_Q;
}

export function nodeOwned(progress, gem, nodeId) {
  return !!progress.nodes?.[gem]?.[nodeId];
}

/**
 * Planner groups: each owned gem with its active GUs and (if Exodus Q3+) gem nodes.
 */
export function activeGemGroups(progress) {
  const nodesOn = gemNodesUnlocked(progress);
  const groups = [];
  for (const gem of GEM_ORDER) {
    const q = progress.qualities[gem] || 0;
    if (q <= 0) continue;
    const guRows = [];
    for (const def of GU_DEFS[gem] || []) {
      if (def.fromQ > q) continue;
      const current = progress.upgrades[gem]?.[def.id] ?? 0;
      guRows.push({
        gem,
        quality: q,
        def,
        current,
        next: nextThreeCosts(def, current, 3),
      });
    }
    const nodes = nodesOn
      ? (GEM_NODES[gem] || []).map((n) => ({
          ...n,
          gem,
          owned: nodeOwned(progress, gem, n.id),
        }))
      : [];
    if (!guRows.length && !nodes.length) continue;
    groups.push({ gem, quality: q, guRows, nodes });
  }
  return groups;
}

/**
 * Full OO amount without k/m/b rounding — used for plan totals ≥ 1k.
 * German grouping (1.234,56), always 2 fraction digits. Below 1k falls back to formatOO.
 */
export function formatOOExact(value) {
  if (value == null || Number.isNaN(value)) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1e3) return formatOO(n);
  return `${n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} OO`;
}

/**
 * Heatmap vs a fixed red ceiling (usually Next Gem Quality cost).
 * Linear 0 → redMax; at/above redMax is full red (hm-5).
 */
export function heatClass(cost, redMax) {
  if (!Number.isFinite(cost) || cost <= 0) return "hm-1";
  if (!Number.isFinite(redMax) || redMax <= 0) return "hm-1";
  if (cost >= redMax) return "hm-5";
  const t = cost / redMax;
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

/** Stable id for a quality chain node (used by Next Quality dropdown / plan picks). */
export function qualityOptionKey(node) {
  if (!node?.gem || node.quality == null) return "";
  return `${node.gem}:Q${node.quality}`;
}

function enrichNextQuality(node, blocked, blockReason) {
  const guDef = node.unlocksGu
    ? GU_DEFS[node.unlocksGu.gem]?.find((g) => g.id === node.unlocksGu.id)
    : null;
  const firstGu = !blocked && guDef ? nextThreeCosts(guDef, 0, 3) : [];
  return {
    ...node,
    key: qualityOptionKey(node),
    blocked: !!blocked,
    blockReason: blockReason || null,
    requirementMet: !blocked,
    requirementLabel: node.req ? `${node.req.gem} Q${node.req.quality}` : "None",
    unlocksLabel: guDef ? guDef.name : null,
    guEffect: guDef ? guDef.effect : null,
    firstGuCosts: firstGu,
  };
}

/**
 * All quality unlocks that are currently reachable (req met, not yet owned).
 * After Exodus Q3 this includes Exodus Q4, Creation Q2, and Power Q1 together.
 */
export function findNextQualities(progress) {
  const out = [];
  for (const node of QUALITY_CHAIN) {
    if (qualityOwned(progress, node.gem, node.quality)) continue;
    if (node.req && !qualityOwned(progress, node.req.gem, node.req.quality)) continue;
    if (node.guGate && !guOwned(progress, node.guGate.gem, node.guGate.id, node.guGate.level)) {
      out.push(
        enrichNextQuality(
          node,
          true,
          `${node.guGate.gem} ${node.guGate.id} Lv${node.guGate.level} required`,
        ),
      );
      continue;
    }
    out.push(enrichNextQuality(node, false, null));
  }
  out.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return GEM_ORDER.indexOf(a.gem) - GEM_ORDER.indexOf(b.gem);
  });
  return out;
}

/**
 * Preferred next quality from the reachable set (dropdown selection or cheapest).
 */
export function findNextQuality(progress, preferredKey = null) {
  const options = findNextQualities(progress);
  if (!options.length) return null;
  if (preferredKey) {
    const hit = options.find((n) => n.key === preferredKey);
    if (hit) return hit;
  }
  return options[0];
}

/** Active GUs for the player's owned qualities. */
export function activeGuRows(progress) {
  return activeGemGroups(progress).flatMap((g) => g.guRows);
}

/**
 * Red reference for OO heatmap: Next Gem Quality cost when known.
 * Fallback = max visible GU / near node cost across all gems.
 */
export function heatmapRedMax(groupsOrRows, nextQuality) {
  if (nextQuality?.cost > 0 && Number.isFinite(nextQuality.cost)) {
    return nextQuality.cost;
  }
  const groups =
    Array.isArray(groupsOrRows) && groupsOrRows[0] && "guRows" in groupsOrRows[0]
      ? groupsOrRows
      : null;
  const rows = groups ? groups.flatMap((g) => g.guRows) : groupsOrRows || [];
  let max = 0;
  for (const row of rows) {
    for (const step of row.next || []) {
      if (step.cost > max) max = step.cost;
    }
  }
  if (groups) {
    for (const g of groups) {
      for (const n of g.nodes || []) {
        if (n.owned) continue;
        if (n.cost == null || !Number.isFinite(n.cost) || n.cost <= 0) continue;
        if (n.cost > max) max = n.cost;
      }
    }
  }
  return max > 0 ? max : 1;
}

