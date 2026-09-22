/** Build helpers: defaults, clamp, budgets, validate. */
import {
  ATTRIBUTE_COSTS,
  ATTR_ORDER,
  GEM_KEYS,
  INSC_ORDER,
  INSCRIPTION_COSTS,
  RELIC_KEYS,
  STAT_MAX,
  STAT_ORDER,
  TALENT_COSTS,
  TALENT_ORDER,
} from "./hunters/borge/costs.js";
import { attrSpent, attributesTreeValid, zeroOrphanDependents } from "./hunters/borge/attr-rules.js";

export function defaultBuild() {
  return {
    build_name: "Lvl 14 Example",
    meta: { hunter: "Borge", level: 14 },
    stats: {
      hp: 109,
      power: 86,
      regen: 52,
      damage_reduction: 19,
      evade_chance: 20,
      effect_chance: 19,
      special_chance: 29,
      special_damage: 25,
      speed: 14,
      highest_stage_reached: 46,
    },
    talents: {
      death_is_my_companion: 2,
      life_of_the_hunt: 5,
      unfair_advantage: 4,
      impeccable_impacts: 1,
      omen_of_defeat: 0,
      call_me_lucky_loot: 1,
      presence_of_god: 1,
      fires_of_war: 0,
    },
    attributes: {
      soul_of_ares: 1,
      essence_of_ylith: 3,
      spartan_lineage: 1,
      timeless_mastery: 5,
      book_of_baal: 1,
      superior_sensors: 6,
      helltouch_barrier: 1,
      lifedrain_inhalers: 2,
      explosive_punches: 0,
      atlas_protocol: 0,
      weakspot_analysis: 0,
      born_for_battle: 0,
      soul_of_the_minotaur: 0,
      soul_of_hermes: 0,
      soul_of_athena: 0,
    },
    inscryptions: Object.fromEntries(INSC_ORDER.map((k) => [k, 0])),
    mods: { trample: false },
    relics: Object.fromEntries(RELIC_KEYS.map((k) => [k, 0])),
    gems: Object.fromEntries(GEM_KEYS.map((k) => [k, 0])),
  };
}

export function emptyBuild() {
  const b = defaultBuild();
  b.build_name = "New Build";
  b.meta.level = 1;
  for (const k of STAT_ORDER) b.stats[k] = 0;
  for (const k of TALENT_ORDER) b.talents[k] = 0;
  for (const k of ATTR_ORDER) b.attributes[k] = 0;
  return b;
}

export function clampLevels(config) {
  const cfg = structuredClone(config);
  for (const [section, costs] of [
    ["talents", TALENT_COSTS],
    ["attributes", ATTRIBUTE_COSTS],
    ["inscryptions", INSCRIPTION_COSTS],
  ]) {
    const data = cfg[section] || {};
    for (const [key, lvl] of Object.entries(data)) {
      if (!costs[key]) continue;
      const mx = costs[key].max === Infinity ? 9999 : Number(costs[key].max);
      data[key] = Math.max(0, Math.min(Number(lvl) || 0, mx));
    }
    cfg[section] = data;
  }
  cfg.stats = cfg.stats || {};
  for (const [key, mx] of Object.entries(STAT_MAX)) {
    if (key in cfg.stats) {
      cfg.stats[key] = Math.max(0, Math.min(Number(cfg.stats[key]) || 0, mx));
    }
  }
  cfg.attributes = zeroOrphanDependents(cfg.attributes || {});
  return cfg;
}

export function pointBudgets(level) {
  const lvl = Math.max(0, Number(level) || 0);
  return { talents: lvl, attributes: lvl * 3 };
}

export function talentPointsSpent(config) {
  return Object.values(config.talents || {}).reduce((a, v) => a + Number(v || 0), 0);
}

export function validateBudgets(config) {
  const cfg = clampLevels(config);
  const level = Number(cfg.meta?.level || 0);
  const caps = pointBudgets(level);
  const tal = talentPointsSpent(cfg);
  const attr = attrSpent(cfg.attributes || {});

  for (const [key, lvl] of Object.entries(cfg.talents || {})) {
    const mx = TALENT_COSTS[key]?.max;
    if (mx != null && Number(lvl) > Number(mx)) {
      return { ok: false, msg: `Over max level: ${key}`, config: cfg };
    }
  }
  for (const [key, lvl] of Object.entries(cfg.inscryptions || {})) {
    const mx = INSCRIPTION_COSTS[key]?.max;
    if (mx != null && Number(lvl) > Number(mx)) {
      return { ok: false, msg: `Inscryption over max: ${key}>${mx}`, config: cfg };
    }
  }
  if (tal > caps.talents) {
    return { ok: false, msg: `Talents ${tal}/${caps.talents} (Level ${level})`, config: cfg };
  }
  if (attr > caps.attributes) {
    return { ok: false, msg: `Attributes ${attr}/${caps.attributes} (Level ${level})`, config: cfg };
  }
  const tree = attributesTreeValid(cfg.attributes || {}, caps.attributes);
  if (!tree.ok) return { ok: false, msg: tree.msg, config: cfg };

  return {
    ok: true,
    msg: `Level ${level}  ·  Talents ${tal}/${caps.talents} (${caps.talents - tal} frei)  ·  Attributes ${attr}/${caps.attributes} (${caps.attributes - attr} frei)`,
    config: cfg,
    spent: { talents: tal, attributes: attr },
    caps,
  };
}

export function formatDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
