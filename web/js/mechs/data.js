import {
  COST_FORMULA_SOURCE,
  MECH_COST_PARAMS,
  calculateMissionMultiplier,
  calculateTokensPerMission,
  calculateTimerMinutes,
  computeCostsForState,
  multiPerMechFromLevel,
  timerReductionMinutes,
} from "./costs.js";

export const STORAGE_KEY = "cifi_mechs_state_v3";
export const LEGACY_STORAGE_KEYS = ["cifi_mechs_state_v2", "cifi_mechs_state_v1"];
export const COST_SOURCE = COST_FORMULA_SOURCE;

/** Editable numeric fields persisted per mech (costs are derived). */
export const PERSIST_KEYS = [
  "units",
  "missionMultiplier",
  "multiPerMech",
  "multiUpgradeIncrement",
  "tokensPerMission",
  "tokensPerMech",
  "timerMinutes",
  "multiLevel",
  "timerLevel",
];

export const MECH_ORDER = ["cradler", "zag", "demshah", "techUp", "token"];

/** Screenshot baseline levels (2026-10-09), matched to Helper cost params. */
const BASELINE_LEVELS = {
  cradler: { units: 16, multiLevel: 8, timerLevel: 39 },
  zag: { units: 10, multiLevel: 5, timerLevel: 17 },
  demshah: { units: 3, multiLevel: 1, timerLevel: 0 },
  techUp: { units: 2, multiLevel: 1, timerLevel: 0 },
  token: { units: 2, multiLevel: 1, timerLevel: 0 },
};

/** @typedef {'multiplier' | 'token'} MechMode */

/**
 * @typedef {object} MechDef
 * @property {string} id
 * @property {string} name
 * @property {string} output
 * @property {MechMode} mode
 * @property {number} units
 * @property {number} multiLevel
 * @property {number} timerLevel
 * @property {number} missionMultiplier
 * @property {number} multiPerMech
 * @property {number} multiUpgradeIncrement
 * @property {number} tokensPerMission
 * @property {number} tokensPerMech
 * @property {number} timerMinutes
 * @property {number} timerReductionMinutes
 * @property {{ unit: number, multi: number, timer: number }} costs
 * @property {string} note
 */

function buildDefaultMech(id, meta) {
  const p = MECH_COST_PARAMS[id];
  const levels = BASELINE_LEVELS[id];
  const mode = id === "token" ? "token" : "multiplier";
  const units = levels.units;
  const multiLevel = levels.multiLevel;
  const timerLevel = levels.timerLevel;
  const timerMinutes = calculateTimerMinutes(p, timerLevel);
  const missionMultiplier =
    mode === "token" ? 0 : calculateMissionMultiplier(p, units, multiLevel);
  const tokensPerMission =
    mode === "token" ? calculateTokensPerMission(p, units, multiLevel) : 0;

  /** @type {MechDef} */
  const mech = {
    id,
    name: meta.name,
    output: meta.output,
    mode,
    units,
    multiLevel,
    timerLevel,
    missionMultiplier,
    multiPerMech: mode === "token" ? 0 : multiPerMechFromLevel(p, multiLevel),
    multiUpgradeIncrement: p.multiBonusPerLevel,
    tokensPerMission,
    tokensPerMech: mode === "token" ? p.multiBonusPerLevel : 0,
    timerMinutes,
    timerReductionMinutes: timerReductionMinutes(p),
    costs: { unit: 0, multi: 0, timer: 0 },
    note: meta.note || "",
  };
  syncDerivedFields(mech);
  return mech;
}

/**
 * Refresh emerald costs + upgrade gains from Helper formulas.
 * Keeps user-facing units / mission multiplier (or tokens) / timer as source of truth
 * and infers multi/timer levels for the cost curves.
 */
export function syncDerivedFields(mech) {
  const p = MECH_COST_PARAMS[mech.id];
  if (!p) return mech;

  const computed = computeCostsForState(mech.id, {
    units: mech.units,
    missionMultiplier: mech.missionMultiplier,
    tokensPerMission: mech.tokensPerMission,
    timerMinutes: mech.timerMinutes,
    mode: mech.mode,
  });
  if (!computed.ok) return mech;

  mech.costs = { ...computed.costs };
  mech.multiLevel = computed.multiLevel;
  mech.timerLevel = computed.timerLevel;
  mech.multiUpgradeIncrement = computed.multiUpgradeIncrement;
  mech.timerReductionMinutes = computed.timerReductionMinutes;
  mech.tokensPerMech = mech.mode === "token" ? p.multiBonusPerLevel : 0;
  if (mech.mode === "multiplier") {
    mech.multiPerMech = computed.multiPerMech;
  }
  return mech;
}

/** @type {Record<string, MechDef>} */
export const DEFAULT_MECHS = {
  cradler: buildDefaultMech("cradler", { name: "Cradler MK1", output: "Cells" }),
  zag: buildDefaultMech("zag", { name: "Zag MK1", output: "Mod Points" }),
  demshah: buildDefaultMech("demshah", { name: "Demshah MK1", output: "Shards" }),
  techUp: buildDefaultMech("techUp", {
    name: "Tech-Up (Auxbot-S)",
    output: "Software Tech",
    note: "Helper title: Auxbot-S.",
  }),
  token: buildDefaultMech("token", {
    name: "Token MK1",
    output: "Tokens",
    note: "Additive token output — ranked by tokens/day per emerald, not % daily factor.",
  }),
};

export function cloneMech(mech) {
  const next = {
    ...mech,
    costs: { ...mech.costs },
  };
  return syncDerivedFields(next);
}

export function defaultState() {
  /** @type {Record<string, MechDef>} */
  const mechs = {};
  for (const id of MECH_ORDER) {
    mechs[id] = cloneMech(DEFAULT_MECHS[id]);
  }
  return { activeId: "cradler", mechs };
}
