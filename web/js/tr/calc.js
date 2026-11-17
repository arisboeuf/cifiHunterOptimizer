/** Wyrmhole (Ouro Orb) Traversal requirement — in-game TR12+ tip. */

export const TR12_FLAT = 5000;
export const TR12_LIFETIME_FRAC = 0.12;
export const TR12_MULTI_PER_TR = 1.015;
/** First TR count that uses the TR12+ formula (inclusive). */
export const TR12_FORMULA_START = 12;

/**
 * Base term from the TR12+ tip:
 * 5 * ((1.2 + TRCount * 0.008) ^ TRCount)
 * @param {number} trCount
 */
export function tr12BaseRequirement(trCount) {
  const tr = Math.max(0, Number(trCount) || 0);
  return 5 * (1.2 + tr * 0.008) ** tr;
}

/**
 * Multiplier stack: ×1.015 for every TR done from 12 inclusive.
 * TR12 → ^1, TR13 → ^2, …
 * @param {number} trCount
 */
export function tr12MultiExponent(trCount) {
  const tr = Math.floor(Number(trCount) || 0);
  return Math.max(0, tr - (TR12_FORMULA_START - 1));
}

/**
 * Full Wyrmhole OO requirement for a given TR count + lifetime OO.
 * Only valid for TRCount ≥ 12; callers should gate on that.
 *
 * @param {number} trCount Traversals count shown on the device (formula TRCount)
 * @param {number} lifetimeOO All-time Ouro Orbs gained
 * @returns {{
 *   ok: true,
 *   trCount: number,
 *   lifetimeOO: number,
 *   base: number,
 *   afterFlat: number,
 *   lifetimeAdd: number,
 *   afterLifetime: number,
 *   multiExp: number,
 *   multi: number,
 *   requirement: number,
 * }}
 */
export function wyrmholeRequirementTr12(trCount, lifetimeOO) {
  const tr = Math.max(0, Number(trCount) || 0);
  const life = Math.max(0, Number(lifetimeOO) || 0);
  const base = tr12BaseRequirement(tr);
  const afterFlat = base + TR12_FLAT;
  const lifetimeAdd = life * TR12_LIFETIME_FRAC;
  const afterLifetime = afterFlat + lifetimeAdd;
  const multiExp = tr12MultiExponent(tr);
  const multi = TR12_MULTI_PER_TR ** multiExp;
  const requirement = afterLifetime * multi;
  return {
    ok: true,
    trCount: tr,
    lifetimeOO: life,
    base,
    afterFlat,
    lifetimeAdd,
    afterLifetime,
    multiExp,
    multi,
    requirement,
  };
}

/**
 * @param {object} input
 * @param {number} input.trCount Current Traversals count on device
 * @param {number} input.lifetimeOO All-time OO (Stats)
 * @param {number} [input.thisTrOO] OO accumulated this Traversal
 * @param {boolean} [input.allTimeIncludesThisTr] Default true (matches in-game ALL TIME)
 * @param {boolean} [input.hasExo3] Time battery removed
 */
export function evaluateTraversalPlan(input) {
  const trCount = Math.max(0, Math.floor(Number(input.trCount) || 0));
  const thisTrOO = Math.max(0, Number(input.thisTrOO) || 0);
  const lifetimeRaw = Math.max(0, Number(input.lifetimeOO) || 0);
  const allTimeIncludesThisTr = input.allTimeIncludesThisTr !== false;
  const hasExo3 = !!input.hasExo3;

  /** Lifetime used by the current-battery formula. */
  const lifetimeNow = lifetimeRaw;
  /** Lifetime after banking this TR if you traverse now. */
  const lifetimeAfter = allTimeIncludesThisTr
    ? lifetimeRaw
    : lifetimeRaw + thisTrOO;

  const currentSupported = trCount >= TR12_FORMULA_START;
  const nextTrCount = trCount + 1;
  const nextSupported = nextTrCount >= TR12_FORMULA_START;

  const current = currentSupported
    ? wyrmholeRequirementTr12(trCount, lifetimeNow)
    : null;
  const afterNow = nextSupported
    ? wyrmholeRequirementTr12(nextTrCount, lifetimeAfter)
    : null;

  let remaining = null;
  let filledPct = null;
  if (current) {
    remaining = Math.max(0, current.requirement - thisTrOO);
    filledPct =
      current.requirement > 0
        ? Math.min(100, (thisTrOO / current.requirement) * 100)
        : 100;
  }

  return {
    trCount,
    nextTrCount,
    thisTrOO,
    lifetimeNow,
    lifetimeAfter,
    allTimeIncludesThisTr,
    hasExo3,
    currentSupported,
    nextSupported,
    current,
    afterNow,
    remaining,
    filledPct,
    canTraverseOrbs: current ? thisTrOO >= current.requirement : null,
  };
}

export function formatOO(value) {
  if (value == null || Number.isNaN(value)) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1e3) {
    return `${n.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} OO`;
  }
  return `${n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} OO`;
}

export function formatPct(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}
