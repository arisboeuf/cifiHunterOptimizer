/** Adapt OfflineHunt / Rust MonteCarloResult JSON → Wasm*Engine.evaluate() shape. */

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * @param {object} mc — Python/Rust MonteCarloResult (+ combat, mats)
 * @param {string} hunterId
 * @param {string} engineLabel — "offline" | "rust"
 */
export function mcToWasmShape(mc, hunterId, engineLabel = "offline") {
  const avgTimeMin = Number(mc.avg_time_seconds || 0) / 60;
  const lootPerMin =
    avgTimeMin > 0 ? Number(mc.avg_loot || 0) / Math.max(avgTimeMin, 1e-9) : 0;
  const combat = mc.combat || {};
  const bossStages = Object.keys(mc.boss_kill_rate || {})
    .map(Number)
    .sort((a, b) => a - b);
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
    engine: engineLabel,
    hunterId,
  };
}
