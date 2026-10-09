/**
 * Mech emerald costs — formulas decompiled from Helper v0.03.02 Assembly-CSharp
 * (MechData.CalculateNextUnitCost / CalculateMultiCost / CalculateTimerCost).
 * Constants extracted from Unity level0 MechData MonoBehaviours.
 *
 * unitCost(units) = unitCostBase * unitCostMultiplier^units
 * multiCost(level) = multiCostBase * multiCostMultiplier^level
 * timerCost(level) = timerCostBase * timerCostExponent^level
 *   (+ over-maxTimerLevel surcharge: *1.5^over and extra *1.5^(over-5i) loops)
 *
 * Timer fields in assets are seconds; UI uses minutes.
 */

/** @typedef {object} MechCostParams
 * @property {string} title
 * @property {number} unitCostBase
 * @property {number} unitCostMultiplier
 * @property {number} multiBonusBase
 * @property {number} multiBonusPerLevel
 * @property {number} multiCostBase
 * @property {number} multiCostMultiplier
 * @property {number} maxMultiLevel
 * @property {number} timerBaseSeconds
 * @property {number} timerReductionSeconds
 * @property {number} timerCostBase
 * @property {number} timerCostExponent
 * @property {number} maxTimerLevel
 */

/** @type {Record<string, MechCostParams>} */
export const MECH_COST_PARAMS = {
  cradler: {
    title: "Cradler",
    unitCostBase: 3,
    unitCostMultiplier: 1.8,
    multiBonusBase: 0.05,
    multiBonusPerLevel: 0.027,
    multiCostBase: 2,
    multiCostMultiplier: 3.6,
    maxMultiLevel: 10,
    timerBaseSeconds: 21600,
    timerReductionSeconds: 120,
    timerCostBase: 2,
    timerCostExponent: 1.2,
    maxTimerLevel: 90,
  },
  zag: {
    title: "Zag",
    unitCostBase: 100,
    unitCostMultiplier: 2,
    multiBonusBase: 0.04,
    multiBonusPerLevel: 0.026,
    multiCostBase: 100,
    multiCostMultiplier: 4.8,
    maxMultiLevel: 7,
    timerBaseSeconds: 36000,
    timerReductionSeconds: 180,
    timerCostBase: 200,
    timerCostExponent: 1.25,
    maxTimerLevel: 60,
  },
  demshah: {
    title: "Demshah",
    unitCostBase: 20000,
    unitCostMultiplier: 2,
    multiBonusBase: 0.03,
    multiBonusPerLevel: 0.016,
    multiCostBase: 10000,
    multiCostMultiplier: 10,
    maxMultiLevel: 6,
    timerBaseSeconds: 43200,
    timerReductionSeconds: 240,
    timerCostBase: 20000,
    timerCostExponent: 1.25,
    maxTimerLevel: 30,
  },
  techUp: {
    title: "Auxbot-S",
    unitCostBase: 50000,
    unitCostMultiplier: 2,
    multiBonusBase: 0.03,
    multiBonusPerLevel: 0.018,
    multiCostBase: 10000,
    multiCostMultiplier: 50,
    maxMultiLevel: 5,
    timerBaseSeconds: 57600,
    timerReductionSeconds: 300,
    timerCostBase: 300000,
    timerCostExponent: 1.25,
    maxTimerLevel: 30,
  },
  token: {
    title: "Token",
    unitCostBase: 100000,
    unitCostMultiplier: 1.8,
    multiBonusBase: 0,
    multiBonusPerLevel: 10000,
    multiCostBase: 80000,
    multiCostMultiplier: 10,
    maxMultiLevel: 10,
    timerBaseSeconds: 86400,
    timerReductionSeconds: 600,
    timerCostBase: 100000,
    timerCostExponent: 1.5,
    maxTimerLevel: 72,
  },
};

export const COST_FORMULA_SOURCE = "Helper-IL-verified (v0.03.02)";

/** @param {MechCostParams} p @param {number} units */
export function calculateNextUnitCost(p, units) {
  const u = Math.max(0, Math.floor(Number(units) || 0));
  return p.unitCostBase * p.unitCostMultiplier ** u;
}

/** @param {MechCostParams} p @param {number} multiLevel */
export function calculateMultiCost(p, multiLevel) {
  const level = Math.max(0, Math.floor(Number(multiLevel) || 0));
  return p.multiCostBase * p.multiCostMultiplier ** level;
}

/**
 * @param {MechCostParams} p
 * @param {number} timerLevel
 */
export function calculateTimerCost(p, timerLevel) {
  const level = Math.max(0, Math.floor(Number(timerLevel) || 0));
  let cost = p.timerCostBase * p.timerCostExponent ** level;
  if (level > p.maxTimerLevel) {
    const over = level - p.maxTimerLevel;
    cost *= 1.5 ** over;
    const chunks = Math.floor(over / 5);
    for (let i = 1; i <= chunks; i += 1) {
      const rem = over - i * 5;
      cost *= 1.5 ** rem;
    }
  }
  return cost;
}

/** Mission multiplier for non-token mechs (Helper CalculateMultiBonus). */
export function calculateMissionMultiplier(p, units, multiLevel) {
  const u = Math.max(0, Number(units) || 0);
  const ml = Math.max(0, Number(multiLevel) || 0);
  return 1 + p.multiBonusBase + p.multiBonusPerLevel * ml * u;
}

/** Tokens per mission (Token mech). */
export function calculateTokensPerMission(p, units, multiLevel) {
  return p.multiBonusPerLevel * Math.max(0, Number(multiLevel) || 0) * Math.max(0, Number(units) || 0);
}

/** Timer in whole minutes from timer level (no Creation1 gem offset). */
export function calculateTimerMinutes(p, timerLevel) {
  const level = Math.max(0, Number(timerLevel) || 0);
  const seconds = p.timerBaseSeconds - p.timerReductionSeconds * level;
  return Math.max(0, Math.round(seconds / 60));
}

/** Fixed whole-minute step per timer upgrade (from Helper timerReductionPerLevel). */
export function timerReductionMinutes(p) {
  return Math.round(p.timerReductionSeconds / 60);
}

/** Max timer level while mission time stays > 0 with fixed minute steps. */
export function maxTimerLevelForPositiveTime(p) {
  const step = p.timerReductionSeconds;
  if (!(step > 0)) return 0;
  return Math.max(0, Math.floor((p.timerBaseSeconds - step) / step));
}

/** Displayed “multi per mech” = multiBonusPerLevel * multiLevel (unit upgrade gain). */
export function multiPerMechFromLevel(p, multiLevel) {
  return p.multiBonusPerLevel * Math.max(0, Number(multiLevel) || 0);
}

/**
 * Infer multi level from shown mission multiplier (non-token).
 * @returns {number}
 */
export function inferMultiLevelFromMultiplier(p, units, missionMultiplier) {
  const u = Number(units);
  if (!(u > 0) || !(p.multiBonusPerLevel > 0)) return 0;
  const raw = (Number(missionMultiplier) - 1 - p.multiBonusBase) / (p.multiBonusPerLevel * u);
  return Math.max(0, Math.round(raw));
}

export function inferMultiLevelFromTokens(p, units, tokensPerMission) {
  const u = Number(units);
  if (!(u > 0) || !(p.multiBonusPerLevel > 0)) return 0;
  return Math.max(0, Math.round(Number(tokensPerMission) / (p.multiBonusPerLevel * u)));
}

export function inferTimerLevel(p, timerMinutes) {
  if (!(p.timerReductionSeconds > 0)) return 0;
  const seconds = Number(timerMinutes) * 60;
  const raw = (p.timerBaseSeconds - seconds) / p.timerReductionSeconds;
  return Math.max(0, Math.round(raw));
}

/**
 * @param {string} mechId
 * @param {{ units: number, missionMultiplier?: number, tokensPerMission?: number, timerMinutes: number, mode?: string }} state
 */
export function computeCostsForState(mechId, state) {
  const p = MECH_COST_PARAMS[mechId];
  if (!p) {
    return {
      ok: false,
      error: "Unknown mech",
      costs: { unit: 0, multi: 0, timer: 0 },
      multiLevel: 0,
      timerLevel: 0,
    };
  }

  const units = Math.max(0, Math.floor(Number(state.units) || 0));
  const multiLevel =
    state.mode === "token"
      ? inferMultiLevelFromTokens(p, units, state.tokensPerMission)
      : inferMultiLevelFromMultiplier(p, units, state.missionMultiplier);
  const timerLevel = inferTimerLevel(p, state.timerMinutes);

  return {
    ok: true,
    error: null,
    costs: {
      unit: calculateNextUnitCost(p, units),
      multi: calculateMultiCost(p, multiLevel),
      timer: calculateTimerCost(p, timerLevel),
    },
    multiLevel,
    timerLevel,
    params: p,
    multiUpgradeIncrement: p.multiBonusPerLevel,
    timerReductionMinutes: timerReductionMinutes(p),
    multiPerMech: multiPerMechFromLevel(p, multiLevel),
  };
}

export function formatEmeraldCost(n) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e6) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 100) return Math.round(n).toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
