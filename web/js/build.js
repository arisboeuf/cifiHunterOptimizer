/** Build helpers: defaults, clamp, budgets, validate (hunter-aware). */

export function pointBudgets(level) {
  const lvl = Math.max(0, Number(level) || 0);
  return { talents: lvl, attributes: lvl * 3 };
}

export function talentPointsSpent(config) {
  return Object.values(config.talents || {}).reduce((a, v) => a + Number(v || 0), 0);
}

export function clampLevels(config, hunter) {
  const { costs, attrs } = hunter;
  const cfg = structuredClone(config);
  for (const [section, costTable] of [
    ["talents", costs.TALENT_COSTS],
    ["attributes", costs.ATTRIBUTE_COSTS],
    ["inscryptions", costs.INSCRIPTION_COSTS],
  ]) {
    const data = cfg[section] || {};
    for (const [key, lvl] of Object.entries(data)) {
      if (!costTable[key]) continue;
      const mx = costTable[key].max === Infinity ? 9999 : Number(costTable[key].max);
      data[key] = Math.max(0, Math.min(Number(lvl) || 0, mx));
    }
    cfg[section] = data;
  }
  cfg.stats = cfg.stats || {};
  for (const [key, mx] of Object.entries(costs.STAT_MAX)) {
    if (key in cfg.stats) {
      cfg.stats[key] = Math.max(0, Math.min(Number(cfg.stats[key]) || 0, mx));
    }
  }
  cfg.attributes = attrs.zeroOrphanDependents(cfg.attributes || {});
  return cfg;
}

export function validateBudgets(config, hunter) {
  const { costs, attrs } = hunter;
  const cfg = clampLevels(config, hunter);
  const level = Number(cfg.meta?.level || 0);
  const caps = pointBudgets(level);
  const tal = talentPointsSpent(cfg);
  const attr = attrs.attrSpent(cfg.attributes || {});

  for (const [key, lvl] of Object.entries(cfg.talents || {})) {
    const mx = costs.TALENT_COSTS[key]?.max;
    if (mx != null && Number(lvl) > Number(mx)) {
      return { ok: false, msg: `Over max level: ${key}`, config: cfg };
    }
  }
  for (const [key, lvl] of Object.entries(cfg.inscryptions || {})) {
    const mx = costs.INSCRIPTION_COSTS[key]?.max;
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
  const tree = attrs.attributesTreeValid(cfg.attributes || {}, caps.attributes);
  if (!tree.ok) return { ok: false, msg: tree.msg, config: cfg };

  return {
    ok: true,
    msg: `Level ${level}  ·  Talents ${tal}/${caps.talents} (${caps.talents - tal} free)  ·  Attributes ${attr}/${caps.attributes} (${caps.attributes - attr} free)`,
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
