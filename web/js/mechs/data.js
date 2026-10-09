import {
  COST_FORMULA_SOURCE,
  MECH_COST_PARAMS,
  calculateMissionMultiplier,
  calculateMultiCost,
  calculateNextUnitCost,
  calculateTimerCost,
  calculateTimerMinutes,
  calculateTokensPerMission,
  inferMultiLevelFromMultiplier,
  inferMultiLevelFromTokens,
  inferTimerLevel,
  multiPerMechFromLevel,
  timerReductionMinutes,
} from "./costs.js";

export const STORAGE_KEY = "cifi_mechs_state_v4";
export const LEGACY_STORAGE_KEYS = [
  "cifi_mechs_state_v3",
  "cifi_mechs_state_v2",
  "cifi_mechs_state_v1",
];
export const COST_SOURCE = COST_FORMULA_SOURCE;

/** Level fields are the editable source of truth; display values are derived. */
export const PERSIST_KEYS = ["units", "multiLevel", "timerLevel"];

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
 * Apply units / multiLevel / timerLevel → display stats + emerald costs.
 * Levels are the editable source of truth.
 */
export function syncDerivedFields(mech) {
  const p = MECH_COST_PARAMS[mech.id];
  if (!p) return mech;

  mech.units = Math.max(0, Math.floor(Number(mech.units) || 0));
  mech.multiLevel = Math.max(0, Math.floor(Number(mech.multiLevel) || 0));
  mech.timerLevel = Math.max(0, Math.floor(Number(mech.timerLevel) || 0));

  mech.multiUpgradeIncrement = p.multiBonusPerLevel;
  mech.timerReductionMinutes = timerReductionMinutes(p);
  mech.timerMinutes = Math.round(calculateTimerMinutes(p, mech.timerLevel));

  if (mech.mode === "token") {
    mech.tokensPerMech = p.multiBonusPerLevel;
    mech.tokensPerMission = calculateTokensPerMission(p, mech.units, mech.multiLevel);
    mech.missionMultiplier = 0;
    mech.multiPerMech = 0;
  } else {
    mech.tokensPerMech = 0;
    mech.tokensPerMission = 0;
    mech.missionMultiplier = calculateMissionMultiplier(p, mech.units, mech.multiLevel);
    mech.multiPerMech = multiPerMechFromLevel(p, mech.multiLevel);
  }

  mech.costs = {
    unit: calculateNextUnitCost(p, mech.units),
    multi: calculateMultiCost(p, mech.multiLevel),
    timer: calculateTimerCost(p, mech.timerLevel),
  };
  return mech;
}

/** Migrate older saves that stored multiplier/timer instead of levels. */
export function hydrateMechFromLegacy(mech, src) {
  const p = MECH_COST_PARAMS[mech.id];
  if (!p || !src || typeof src !== "object") return syncDerivedFields(mech);

  const hasLevels =
    Number.isFinite(Number(src.multiLevel)) || Number.isFinite(Number(src.timerLevel));
  if (Number.isFinite(Number(src.units))) mech.units = Number(src.units);

  if (hasLevels) {
    if (Number.isFinite(Number(src.multiLevel))) mech.multiLevel = Number(src.multiLevel);
    if (Number.isFinite(Number(src.timerLevel))) mech.timerLevel = Number(src.timerLevel);
    return syncDerivedFields(mech);
  }

  if (Number.isFinite(Number(src.timerMinutes))) {
    mech.timerLevel = inferTimerLevel(p, Number(src.timerMinutes));
  }
  if (mech.mode === "token" && Number.isFinite(Number(src.tokensPerMission))) {
    mech.multiLevel = inferMultiLevelFromTokens(p, mech.units, Number(src.tokensPerMission));
  } else if (Number.isFinite(Number(src.missionMultiplier))) {
    mech.multiLevel = inferMultiLevelFromMultiplier(
      p,
      mech.units,
      Number(src.missionMultiplier),
    );
  }
  return syncDerivedFields(mech);
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
