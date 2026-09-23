/** Browser WASM bridge for Borge (`EVALBORGE_WASM`). */

export const EVAL_PARAMS = [
  "lvl",
  "stage",
  "hp",
  "atk",
  "regen",
  "dr",
  "evade",
  "effect",
  "critchance",
  "critpower",
  "atkspeed",
  "revival",
  "loth",
  "ua",
  "impeccable",
  "omen",
  "ll",
  "pog",
  "ultima",
  "tfow",
  "ares",
  "ylith",
  "spartan",
  "timeless",
  "battle",
  "athena",
  "baal",
  "sensors",
  "atlas",
  "mino",
  "htb",
  "exp",
  "weak",
  "hermes",
  "lfin",
  "upgrades.gadgets.wrench",
  "upgrades.iap.travpack",
  "upgrades.diamondspecials.hunterloot",
  "upgrades.ultima.ulti",
  "upgrades.diamondspecials.reviveboost",
  "upgrades.loopmods.trample",
  "upgrades.loopmods.scavenger",
  "upgrades.shardmilestones.m0",
  "upgrades.relics.r4",
  "upgrades.relics.r7",
  "upgrades.relics.r16",
  "upgrades.relics.r19",
  "upgrades.inscryptions.i3",
  "upgrades.inscryptions.i4",
  "upgrades.inscryptions.i11",
  "upgrades.inscryptions.i13",
  "upgrades.inscryptions.i14",
  "upgrades.inscryptions.i23",
  "upgrades.inscryptions.i24",
  "upgrades.inscryptions.i27",
  "upgrades.inscryptions.i44",
  "upgrades.inscryptions.i60",
  "upgrades.inscryptions.i80",
  "upgrades.inscryptions.i84",
  "upgrades.inscryptions.i87",
  "upgrades.inscryptions.i88",
  "upgrades.inscryptions.i89",
  "upgrades.inscryptions.i91",
  "upgrades.gems_nodes.creation_gem1",
  "upgrades.gems_nodes.creation_gem2",
  "upgrades.gems_nodes.creation_gem3",
  "upgrades.gems_nodes.innovation_gem3",
  "upgrades.gems_nodes.attraction_gem2",
  "upgrades.gems_nodes.attraction_gem3",
  "upgrades.gems_nodes.attraction_level",
  "upgrades.gems_nodes.attraction_catchUp",
  "upgrades.gems_nodes.attraction_lootBorge",
  "upgrades.diamondcards.gaiden",
  "upgrades.researches.res81",
  "upgrades.researches.res95",
  "upgrades.researches.res105",
  "iterations",
  "upgrades.cms.cm46",
  "upgrades.cms.cm47",
  "upgrades.cms.cm48",
  "upgrades.cms.cm51",
  "upgrades.cms.cm53",
  "upgrades.cms.cm54",
  "upgrades.cms.cm57",
  "upgrades.cms.cm58",
  "upgrades.cms.cm_ultima",
  "upgrades.cms.cm_ultimas",
  "upgrades.gems_nodes.creation_borgeGU",
  "upgrades.gems_nodes.evolution_gem2",
  "upgrades.gems_nodes.evolution_gem3",
  "upgrades.gems_nodes.temporal_gem4",
  "upgrades.loopmods.stelzi",
  "upgrades.inscryptions.i103",
  "upgrades.gems_nodes.exodus_gem1",
  "upgrades.gems_nodes.exodus_temporalEvolutionCount",
  "upgrades.gems_nodes.exodus_gem4",
  "upgrades.cms.milestoneCount",
  "upgrades.gems_nodes.temporal_gem6",
  "upgrades.gems_nodes.innovation_gem5",
  "upgrades.gems_nodes.creation_gem4",
  "upgrades.gems_nodes.creation_gem5",
  "upgrades.gems_nodes.creation_galvTrinketsCount",
  "upgrades.gems_nodes.evolution_gem6",
  "upgrades.relics.t2r7",
  "upgrades.loopmods.roe",
  "upgrades.mats_exchange.tysconDrives",
];

const FLOAT_PARAM_INDEX = new Set([37, 38]);

export function buildToEvalValues(config, iterations) {
  const meta = config.meta || {};
  const stats = config.stats || {};
  const talents = config.talents || {};
  const attrs = config.attributes || {};
  const insc = config.inscryptions || {};
  const relics = config.relics || {};
  const gems = config.gems || {};
  const mods = config.mods || {};
  const wasmExtra = config.wasm || {};

  const values = Object.fromEntries(EVAL_PARAMS.map((k) => [k, 0]));
  values.lvl = Number(meta.level || 0);
  values.stage = Number(stats.highest_stage_reached || 0);
  values.hp = Number(stats.hp || 0);
  values.atk = Number(stats.power || 0);
  values.regen = Number(stats.regen || 0);
  values.dr = Number(stats.damage_reduction || 0);
  values.evade = Number(stats.evade_chance || 0);
  values.effect = Number(stats.effect_chance || 0);
  values.critchance = Number(stats.special_chance || 0);
  values.critpower = Number(stats.special_damage || 0);
  values.atkspeed = Number(stats.speed || 0);

  values.revival = Number(talents.death_is_my_companion || 0);
  values.loth = Number(talents.life_of_the_hunt || 0);
  values.ua = Number(talents.unfair_advantage || 0);
  values.impeccable = Number(talents.impeccable_impacts || 0);
  values.omen = Number(talents.omen_of_defeat || 0);
  values.ll = Number(talents.call_me_lucky_loot || 0);
  values.pog = Number(talents.presence_of_god || 0);
  values.ultima = Number(talents.legacy_of_ultima || wasmExtra.ultima || 0);
  values.tfow = Number(talents.fires_of_war || 0);

  values.ares = Number(attrs.soul_of_ares || 0);
  values.ylith = Number(attrs.essence_of_ylith || 0);
  values.spartan = Number(attrs.spartan_lineage || 0);
  values.timeless = Number(attrs.timeless_mastery || 0);
  values.battle = Number(attrs.born_for_battle || 0);
  values.athena = Number(attrs.soul_of_athena || 0);
  values.baal = Number(attrs.book_of_baal || 0);
  values.sensors = Number(attrs.superior_sensors || 0);
  values.atlas = Number(attrs.atlas_protocol || 0);
  values.mino = Number(attrs.soul_of_the_minotaur || 0);
  values.htb = Number(attrs.helltouch_barrier || 0);
  values.exp = Number(attrs.explosive_punches || 0);
  values.weak = Number(attrs.weakspot_analysis || 0);
  values.hermes = Number(attrs.soul_of_hermes || 0);
  values.lfin = Number(attrs.lifedrain_inhalers || 0);

  for (const key of [
    "i3", "i4", "i11", "i13", "i14", "i23", "i24", "i27", "i44", "i60",
    "i80", "i84", "i87", "i88", "i89", "i91", "i103",
  ]) {
    values[`upgrades.inscryptions.${key}`] = Number(insc[key] || 0);
  }

  values["upgrades.loopmods.trample"] = mods.trample ? 1 : 0;
  values["upgrades.relics.r4"] = Number(relics.disk_of_dawn || 0);
  values["upgrades.relics.r7"] = Number(relics.long_range_artillery_crawler || 0);
  values["upgrades.relics.t2r7"] = Number(relics.t2r7 || wasmExtra.t2r7 || 0);

  values["upgrades.gems_nodes.creation_gem1"] = Number(gems["creation_node_#1"] || 0);
  values["upgrades.gems_nodes.creation_gem2"] = Number(gems["creation_node_#2"] || 0);
  values["upgrades.gems_nodes.creation_gem3"] = Number(gems["creation_node_#3"] || 0);
  values["upgrades.gems_nodes.innovation_gem3"] = Number(gems["innovation_node_#3"] || 0);
  values["upgrades.gems_nodes.attraction_gem3"] = Number(gems["attraction_node_#3"] || 0);
  values["upgrades.gems_nodes.attraction_level"] = Number(gems.attraction_gem || 0);
  values["upgrades.gems_nodes.attraction_catchUp"] = Number(gems["attraction_catch-up"] || 0);

  for (const [k, v] of Object.entries(wasmExtra)) {
    if (k in values) values[k] = v;
  }

  values.iterations = Math.max(1, Number(iterations) || 1);
  return values;
}

function valuesToArgs(values) {
  return EVAL_PARAMS.map((key, i) => {
    const raw = values[key] ?? 0;
    return FLOAT_PARAM_INDEX.has(i) ? Number(raw) : Math.trunc(Number(raw));
  });
}

export class WasmBorgeEngine {
  constructor(exports) {
    this.ex = exports;
  }

  static fromExports(exports) {
    return new WasmBorgeEngine(exports);
  }

  static async load(wasmUrl = "./wasm/release.wasm") {
    const { loadWasmExports } = await import("../wasm-shared.js");
    return WasmBorgeEngine.fromExports(await loadWasmExports(wasmUrl));
  }

  evaluate(config, iterations) {
    const values = buildToEvalValues(config, iterations);
    const args = valuesToArgs(values);
    const loot = Number(this.ex.EVALBORGE_WASM(...args));

    const stageCounts = {};
    const nprog = Number(this.ex.getProgressSize());
    for (let i = 0; i < nprog; i++) {
      const stageF = Number(this.ex.getProgressStageAt(i));
      const count = Number(this.ex.getProgressCountAt(i));
      const key = Math.round(stageF);
      stageCounts[key] = (stageCounts[key] || 0) + count;
    }

    const firstRevive = {};
    const secondRevive = {};
    const ndeath = Number(this.ex.getDeathsByStageAndReviveSize());
    for (let i = 0; i < ndeath; i++) {
      const key = Number(this.ex.getDeathKeyAt(i));
      const count = Number(this.ex.getDeathCountAt(i));
      const stage = Math.trunc(key / 1000);
      const reviveI = key % 1000;
      if (reviveI === 1) firstRevive[stage] = (firstRevive[stage] || 0) + count;
      else if (reviveI === 2) secondRevive[stage] = (secondRevive[stage] || 0) + count;
    }

    return {
      lootPerMin: loot,
      avgStage: Number(this.ex.getLastAvgStage()),
      avgTime: Number(this.ex.getLastAvgTime()),
      minStage: Number(this.ex.getLastMinStage()),
      maxStage: Number(this.ex.getLastMaxStage()),
      bossHpPercent: Number(this.ex.getLastBossHpPercent()),
      bossKillRate: Number(this.ex.getLastBossKillRate()),
      mat1: Number(this.ex.getLastMat1()),
      mat2: Number(this.ex.getLastMat2()),
      mat3: Number(this.ex.getLastMat3()),
      minMat1: Number(this.ex.getLastMinMat1()),
      minMat2: Number(this.ex.getLastMinMat2()),
      minMat3: Number(this.ex.getLastMinMat3()),
      maxMat1: Number(this.ex.getLastMaxMat1()),
      maxMat2: Number(this.ex.getLastMaxMat2()),
      maxMat3: Number(this.ex.getLastMaxMat3()),
      xp: Number(this.ex.getLastXp()),
      stageCounts: Object.fromEntries(Object.entries(stageCounts).sort((a, b) => Number(a[0]) - Number(b[0]))),
      firstRevive,
      secondRevive,
      buildStats: {
        max_hp: round2(Number(this.ex.getLastBorgeMaxHp())),
        atk_power: round2(Number(this.ex.getLastBorgeAtk())),
        hp_regen: round4(Number(this.ex.getLastBorgeRegen())),
        dmg_reduction: round2(Number(this.ex.getLastBorgeDr()) * 100),
        evade_chance: round2(Number(this.ex.getLastBorgeEvade()) * 100),
        effect_chance: round2(Number(this.ex.getLastBorgeEffect()) * 100),
        crit_chance: round2(Number(this.ex.getLastBorgeCritRate()) * 100),
        crit_power: round2(Number(this.ex.getLastBorgeCritPower())),
        atk_speed: round2(Number(this.ex.getLastBorgeReload())),
      },
    };
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

export function wasmToSimResult(wasmRes, repetitions) {
  const counts = Object.fromEntries(
    Object.entries(wasmRes.stageCounts).map(([k, v]) => [Number(k), Number(v)]),
  );
  const n = Object.values(counts).reduce((a, b) => a + b, 0) || repetitions;
  const avgTime = Number(wasmRes.avgTime);
  const lootPerMin = Number(wasmRes.lootPerMin);
  const lootScore = Math.round(lootPerMin * 10) / 10;
  // WASM avgTime is minutes (same as cifi-tools: runs/day = 1440 / avgTime).
  const runsPerDay = avgTime > 0 ? 1440 / avgTime : 0;
  const odds = oddsFromCounts(counts);

  return {
    n,
    avgStage: wasmRes.avgStage,
    minStage: wasmRes.minStage,
    maxStage: wasmRes.maxStage,
    stageCounts: counts,
    stageOdds: odds,
    avgTimeS: avgTime * 60, // seconds for formatDuration / mats/h
    avgTimeMin: avgTime,
    runsPerDay,
    lootScore,
    firstRevive: wasmRes.firstRevive,
    secondRevive: wasmRes.secondRevive,
    bossKillRate: wasmRes.bossKillRate,
    buildStats: wasmRes.buildStats,
    mats: { mat1: wasmRes.mat1, mat2: wasmRes.mat2, mat3: wasmRes.mat3 },
    matsMin: { mat1: wasmRes.minMat1, mat2: wasmRes.minMat2, mat3: wasmRes.minMat3 },
    matsMax: { mat1: wasmRes.maxMat1, mat2: wasmRes.maxMat2, mat3: wasmRes.maxMat3 },
    xp: wasmRes.xp,
    engine: "wasm",
  };
}

function oddsFromCounts(counts) {
  const n = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!n) return {};
  const stages = Object.keys(counts).map(Number);
  const lo = Math.min(...stages);
  const hi = Math.max(...stages);
  const odds = {};
  for (let s = lo; s <= hi; s++) {
    let cum = 0;
    for (const [stage, c] of Object.entries(counts)) {
      if (Number(stage) >= s) cum += c;
    }
    odds[s] = cum / n;
  }
  return odds;
}
