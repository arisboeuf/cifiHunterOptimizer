/** Attribute tree rules matching cifi-tools ATTRIBUTE_DEPENDENCIES / MIN_VALUE. */
import { ATTRIBUTE_COSTS } from "./costs.js";

export const ATTRIBUTE_DEPENDENCIES = {
  essence_of_ylith: ["soul_of_ares"],
  book_of_baal: ["soul_of_ares"],
  helltouch_barrier: ["soul_of_ares"],
  explosive_punches: ["helltouch_barrier"],
  spartan_lineage: ["essence_of_ylith"],
  timeless_mastery: ["spartan_lineage"],
  superior_sensors: ["book_of_baal"],
  lifedrain_inhalers: ["helltouch_barrier"],
  atlas_protocol: ["superior_sensors"],
  weakspot_analysis: ["explosive_punches"],
  born_for_battle: ["spartan_lineage"],
  soul_of_athena: ["born_for_battle"],
  soul_of_the_minotaur: ["atlas_protocol"],
  soul_of_hermes: ["weakspot_analysis"],
};

export const ATTRIBUTE_MIN_VALUE = {
  soul_of_ares: 0,
  essence_of_ylith: 0,
  spartan_lineage: 0,
  timeless_mastery: 0,
  book_of_baal: 0,
  superior_sensors: 0,
  helltouch_barrier: 0,
  lifedrain_inhalers: 0,
  explosive_punches: 0,
  atlas_protocol: 75,
  weakspot_analysis: 75,
  born_for_battle: 75,
  soul_of_the_minotaur: 150,
  soul_of_hermes: 150,
  soul_of_athena: 180,
};

function attrCost(key) {
  return Number(ATTRIBUTE_COSTS[key]?.cost ?? 1);
}

function attrMax(key) {
  const mx = ATTRIBUTE_COSTS[key]?.max;
  return mx === Infinity ? 9999 : Number(mx ?? 0);
}

export function attrSpent(attrs) {
  let total = 0;
  for (const [k, lvl] of Object.entries(attrs || {})) {
    if (ATTRIBUTE_COSTS[k]) total += Number(lvl) * attrCost(k);
  }
  return total;
}

export function minValueSpentOk(attrs, key) {
  const need = Number(ATTRIBUTE_MIN_VALUE[key] ?? 0);
  if (need <= 0) return true;
  let spent = 0;
  for (const [k, lvl] of Object.entries(attrs || {})) {
    if (Number(lvl) <= 0) continue;
    if (Number(ATTRIBUTE_MIN_VALUE[k] ?? 0) < need) {
      spent += Number(lvl) * attrCost(k);
    }
  }
  return spent >= need;
}

export function dependenciesOk(attrs, key) {
  const parents = ATTRIBUTE_DEPENDENCIES[key] || [];
  return parents.every((p) => Number(attrs[p] ?? 0) > 0);
}

export function canIncreaseAttribute(attrs, key) {
  if (Number(attrs[key] ?? 0) >= attrMax(key)) return false;
  if (!dependenciesOk(attrs, key)) return false;
  if (!minValueSpentOk(attrs, key)) return false;
  return true;
}

export function attributesTreeValid(attrs, budget = null) {
  for (const [k, lvlRaw] of Object.entries(attrs || {})) {
    if (!ATTRIBUTE_COSTS[k]) continue;
    const lvl = Number(lvlRaw);
    if (lvl < 0 || lvl > attrMax(k)) return { ok: false, msg: `${k} level ${lvl} invalid` };
    if (lvl > 0) {
      if (!dependenciesOk(attrs, k)) {
        return { ok: false, msg: `${k} needs parent(s): ${(ATTRIBUTE_DEPENDENCIES[k] || []).join(", ")}` };
      }
      if (!minValueSpentOk(attrs, k)) {
        return { ok: false, msg: `${k} needs ${ATTRIBUTE_MIN_VALUE[k]} path points in lower-tier attributes` };
      }
    }
  }
  const spent = attrSpent(attrs);
  if (budget != null && spent > budget) return { ok: false, msg: `Attributes ${spent}/${budget}` };
  return { ok: true, msg: "ok" };
}

export function zeroOrphanDependents(attrs) {
  const out = Object.fromEntries(Object.entries(attrs || {}).map(([k, v]) => [k, Number(v)]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [child, parents] of Object.entries(ATTRIBUTE_DEPENDENCIES)) {
      if (Number(out[child] ?? 0) <= 0) continue;
      if (parents.some((p) => Number(out[p] ?? 0) <= 0)) {
        out[child] = 0;
        changed = true;
      }
    }
  }
  return out;
}
