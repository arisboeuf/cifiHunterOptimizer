/** Browser bridge to local Python OfflineHunt sim via launch.py `/api/sim`.

Same build as WASM (stats, talents, attrs, inscryptions, relics, gems).
Python computes combat finals via ported HuntStatistics (no WASM dump required).
Optional explicit `combat` on the request is stripped so Offline stays self-contained.
*/

const API = "/api/sim";

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * Adapt Python MonteCarloResult → same shape as Wasm*Engine.evaluate().
 */
function mcToWasmShape(mc, hunterId) {
  const avgTimeMin = Number(mc.avg_time_seconds || 0) / 60;
  const lootPerMin =
    avgTimeMin > 0 ? Number(mc.avg_loot || 0) / Math.max(avgTimeMin, 1e-9) : 0;
  const combat = mc.combat || {};
  const bossStages = Object.keys(mc.boss_kill_rate || {}).map(Number).sort((a, b) => a - b);
  const firstBoss = bossStages[0];
  const bossKillRate = firstBoss != null ? Number(mc.boss_kill_rate[firstBoss] || 0) : 0;
  let bossHpPercent = 0;
  if (firstBoss != null && mc.mean_boss_hp_percent) {
    bossHpPercent = Number(mc.mean_boss_hp_percent[firstBoss] || 0);
  }

  const stageCounts = {};
  for (const [k, v] of Object.entries(mc.stage_counts || {})) {
    stageCounts[Number(k)] = Number(v);
  }

  const buildStats = {
    max_hp: round2(Number(combat.max_hp || 0)),
    atk_power: round2(Number(combat.atk_power || 0)),
    hp_regen: round4(Number(combat.hp_regen || 0)),
    dmg_reduction: round2(
      (Number(combat.dmg_reduction) || 0) > 1
        ? Number(combat.dmg_reduction)
        : Number(combat.dmg_reduction || 0) * 100,
    ),
    evade_chance: round2(
      (Number(combat.evade_chance) || 0) > 1
        ? Number(combat.evade_chance)
        : Number(combat.evade_chance || 0) * 100,
    ),
    effect_chance: round2(
      (Number(combat.effect_chance) || 0) > 1
        ? Number(combat.effect_chance)
        : Number(combat.effect_chance || 0) * 100,
    ),
    crit_chance: round2(
      (Number(combat.crit_chance) || 0) > 1
        ? Number(combat.crit_chance)
        : Number(combat.crit_chance || 0) * 100,
    ),
    crit_power: round2(Number(combat.crit_power || 0)),
    atk_speed: round2(Number(combat.atk_interval || combat.atk_speed || 0)),
  };

  return {
    lootPerMin,
    avgStage: Number(mc.avg_stage),
    avgTime: avgTimeMin,
    minStage: Number(mc.min_stage),
    maxStage: Number(mc.max_stage),
    bossHpPercent,
    bossKillRate,
    mat1: Number(mc.mat1 || 0),
    mat2: Number(mc.mat2 || 0),
    mat3: Number(mc.mat3 || 0),
    xp: Number(mc.xp || 0),
    stageCounts,
    firstRevive: {},
    secondRevive: {},
    buildStats,
    engine: "offline",
    hunterId,
  };
}

export class OfflineHuntEngine {
  /**
   * @param {string} hunterId
   * @param {{ evaluate: Function } | null} _wasmEngine unused (kept for call-site compat)
   */
  constructor(hunterId, _wasmEngine = null) {
    this.hunterId = hunterId;
    this.wasmEngine = null;
    this.label = "offline";
  }

  static forHunter(hunterId, wasmEngine = null) {
    return new OfflineHuntEngine(hunterId, wasmEngine);
  }

  clearCombatCache() {}

  /**
   * Async evaluate — callers must `await Promise.resolve(engine.evaluate(...))`.
   */
  async evaluate(config, iterations) {
    const { combat: _drop, ...rest } = config || {};
    const build = { ...rest };

    const body = {
      hunter: this.hunterId,
      build,
      n: Math.max(1, Number(iterations) || 1),
      seed: 1,
    };
    let res;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Offline sim API unreachable (${err.message || err}). Start the app with launch.py (not a plain static server).`,
      );
    }
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const errBody = await res.json();
        detail = errBody.error || detail;
      } catch {
        /* ignore */
      }
      throw new Error(`Offline sim failed: ${detail}`);
    }
    const mc = await res.json();
    return mcToWasmShape(mc, this.hunterId);
  }
}

export async function probeOfflineApi() {
  try {
    const res = await fetch("/api/health", { method: "GET" });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.ok === true && data?.offline_sim === true;
  } catch {
    return false;
  }
}
