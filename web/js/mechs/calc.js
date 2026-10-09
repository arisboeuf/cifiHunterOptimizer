/** Continuous daily-factor model from the mech RE spec (§4.1 / §4.3 / §9). */

const MINUTES_PER_DAY = 1440;

/**
 * @typedef {'unit' | 'multi' | 'timer'} UpgradeKind
 */

/**
 * @param {import('./data.js').MechDef} mech
 * @param {UpgradeKind} kind
 */
export function applyUpgrade(mech, kind) {
  if (mech.mode === "token") {
    let tokensPerMission = mech.tokensPerMission;
    let timerMinutes = mech.timerMinutes;
    let units = mech.units;
    if (kind === "unit") {
      units += 1;
      tokensPerMission += mech.tokensPerMech;
    } else if (kind === "multi") {
      tokensPerMission += mech.units * mech.tokensPerMech;
    } else if (kind === "timer") {
      timerMinutes -= mech.timerReductionMinutes;
    }
    return { units, tokensPerMission, timerMinutes, missionMultiplier: 0 };
  }

  let missionMultiplier = mech.missionMultiplier;
  let timerMinutes = mech.timerMinutes;
  let units = mech.units;
  let multiPerMech = mech.multiPerMech;

  if (kind === "unit") {
    units += 1;
    missionMultiplier += mech.multiPerMech;
  } else if (kind === "multi") {
    multiPerMech += mech.multiUpgradeIncrement;
    missionMultiplier += mech.units * mech.multiUpgradeIncrement;
  } else if (kind === "timer") {
    timerMinutes -= mech.timerReductionMinutes;
  }

  return { units, missionMultiplier, multiPerMech, timerMinutes, tokensPerMission: 0 };
}

/**
 * @param {number} M
 * @param {number} T
 */
export function logDailyFactor(M, T) {
  return (MINUTES_PER_DAY / T) * Math.log(M);
}

/**
 * @param {import('./data.js').MechDef} mech
 * @param {UpgradeKind} kind
 */
export function evaluateMultiplierUpgrade(mech, kind) {
  const cost = mech.costs[kind];
  const next = applyUpgrade(mech, kind);
  const M = mech.missionMultiplier;
  const T = mech.timerMinutes;
  const newM = next.missionMultiplier;
  const newT = next.timerMinutes;

  if (!(M > 0) || !(newM > 0) || !(T > 0) || !(newT > 0) || !(cost > 0)) {
    return {
      kind,
      cost,
      ok: false,
      error: "Invalid multiplier, timer, or cost",
      newMissionMultiplier: newM,
      newTimerMinutes: newT,
      missionsPerDay: newT > 0 ? MINUTES_PER_DAY / newT : 0,
      percentDailyFactorGain: 0,
      percentDailyFactorGainPerEmerald: 0,
      logDailyGrowthGainPerEmerald: 0,
      score: -Infinity,
      scoreLabel: "% / 1000 emeralds",
    };
  }

  const oldLog = logDailyFactor(M, T);
  const newLog = logDailyFactor(newM, newT);
  const deltaLog = newLog - oldLog;
  const pct = 100 * Math.expm1(deltaLog);

  return {
    kind,
    cost,
    ok: true,
    error: null,
    newMissionMultiplier: newM,
    newTimerMinutes: newT,
    missionsPerDay: MINUTES_PER_DAY / newT,
    percentDailyFactorGain: pct,
    percentDailyFactorGainPerEmerald: pct / cost,
    logDailyGrowthGainPerEmerald: deltaLog / cost,
    score: pct / cost,
    scoreLabel: "% / 1000 emeralds",
  };
}

/**
 * @param {import('./data.js').MechDef} mech
 * @param {UpgradeKind} kind
 */
export function evaluateTokenUpgrade(mech, kind) {
  const cost = mech.costs[kind];
  const next = applyUpgrade(mech, kind);
  const oldTpd = (mech.tokensPerMission * MINUTES_PER_DAY) / mech.timerMinutes;
  const newTpd = (next.tokensPerMission * MINUTES_PER_DAY) / next.timerMinutes;
  const delta = newTpd - oldTpd;

  if (!(mech.timerMinutes > 0) || !(next.timerMinutes > 0) || !(cost > 0)) {
    return {
      kind,
      cost,
      ok: false,
      error: "Invalid timer or cost",
      tokensPerDay: newTpd,
      deltaTokensPerDay: delta,
      deltaTokensPerDayPerEmerald: 0,
      newTokensPerMission: next.tokensPerMission,
      newTimerMinutes: next.timerMinutes,
      score: -Infinity,
      scoreLabel: "tokens/day / emerald",
    };
  }

  return {
    kind,
    cost,
    ok: true,
    error: null,
    tokensPerDay: newTpd,
    deltaTokensPerDay: delta,
    deltaTokensPerDayPerEmerald: delta / cost,
    newTokensPerMission: next.tokensPerMission,
    newTimerMinutes: next.timerMinutes,
    score: delta / cost,
    scoreLabel: "tokens/day / emerald",
  };
}

/**
 * @param {import('./data.js').MechDef} mech
 */
export function evaluateAll(mech) {
  /** @type {UpgradeKind[]} */
  const kinds = ["unit", "multi", "timer"];
  const rows =
    mech.mode === "token"
      ? kinds.map((k) => evaluateTokenUpgrade(mech, k))
      : kinds.map((k) => evaluateMultiplierUpgrade(mech, k));

  const ranked = [...rows].sort((a, b) => b.score - a.score);
  return { rows, ranked, best: ranked[0] ?? null };
}

export function formatNum(n, digits = 4) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return n.toExponential(4);
  return n.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatCost(n) {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** Minutes (may be fractional) → hh:mm:ss */
export function formatTimer(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  const totalSec = Math.round(minutes * 60);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Parse hh:mm:ss, h:mm:ss, mm:ss, or plain minutes → minutes.
 * @returns {number | null}
 */
export function parseTimer(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const parts = raw.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (m >= 60 || s >= 60) return null;
    return h * 60 + m + s / 60;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    if (s >= 60) return null;
    return m + s / 60;
  }
  return null;
}

/** Higher score = better → green (hm-1) … red (hm-5). */
export function scoreHeatClass(score, peers) {
  const vals = peers.filter((c) => Number.isFinite(c) && c > -Infinity);
  if (!vals.length || !Number.isFinite(score)) return "hm-3";
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max <= min) return "hm-1";
  const t = (max - score) / (max - min);
  if (t < 0.2) return "hm-1";
  if (t < 0.4) return "hm-2";
  if (t < 0.6) return "hm-3";
  if (t < 0.8) return "hm-4";
  return "hm-5";
}

export const UPGRADE_LABELS = {
  unit: "Unit",
  multi: "Multi",
  timer: "Timer",
};
