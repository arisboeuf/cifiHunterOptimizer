/** Browser WASM bridge for Ozzy (`EVALOZZY_WASM`). */
import {
  collectDeaths,
  collectProgress,
  round2,
  round4,
  valuesToArgs,
  wasmToSimResult,
} from "../wasm-shared.js";

export { wasmToSimResult };

export const EVAL_PARAMS = [
  "lvl",
  "stage",
  "hp",
  "atk",
  "regen",
  "dr",
  "evade",
  "effect",
  "multichance",
  "multipower",
  "atkspeed",
  "revival",
  "boon",
  "ua",
  "needles",
  "omen",
  "ll",
  "crip",
  "ultima",
  "echo",
  "lotl",
  "exo",
  "scorp",
  "dance",
  "cat",
  "timeless",
  "ibu",
  "exterm",
  "medusa",
  "scarab",
  "vect",
  "snek",
  "cycle",
  "deal",
  "sisters",
  "upgrades.gadgets.zaptron",
  "upgrades.iap.travpack",
  "upgrades.diamondspecials.hunterloot",
  "upgrades.ultima.ulti",
  "upgrades.diamondspecials.reviveboost",
  "upgrades.loopmods.scavenger2",
  "upgrades.shardmilestones.m0",
  "upgrades.relics.r4",
  "upgrades.relics.r7",
  "upgrades.relics.r17",
  "upgrades.inscryptions.i31",
  "upgrades.inscryptions.i32",
  "upgrades.inscryptions.i33",
  "upgrades.inscryptions.i36",
  "upgrades.inscryptions.i37",
  "upgrades.inscryptions.i40",
  "upgrades.inscryptions.i81",
  "upgrades.inscryptions.i86",
  "upgrades.inscryptions.i92",
  "upgrades.gems_nodes.innovation_gem2",
  "upgrades.gems_nodes.innovation_gem3",
  "upgrades.gems_nodes.attraction_gem3",
  "upgrades.gems_nodes.attraction_level",
  "upgrades.gems_nodes.attraction_catchUp",
  "upgrades.gems_nodes.attraction_lootOzzy",
  "upgrades.diamondcards.iridian",
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
  "upgrades.gems_nodes.creation_ozzyGU",
  "upgrades.gems_nodes.evolution_gem2",
  "upgrades.gems_nodes.evolution_gem3",
  "upgrades.loopmods.stelzi",
  "upgrades.inscryptions.i104",
  "upgrades.gems_nodes.exodus_gem3",
  "upgrades.gems_nodes.exodus_powerInnovationCount",
  "upgrades.gems_nodes.exodus_gem4",
  "upgrades.cms.milestoneCount",
  "upgrades.gems_nodes.temporal_gem6",
  "upgrades.gems_nodes.innovation_gem5",
  "upgrades.gems_nodes.creation_gem4",
  "upgrades.gems_nodes.creation_gem5",
  "upgrades.gems_nodes.creation_galvTrinketsCount",
  "upgrades.gems_nodes.creation_gem6",
  "upgrades.gems_nodes.evolution_gem6",
  "upgrades.relics.t2r7",
  "upgrades.loopmods.roe",
  "upgrades.mats_exchange.tysconDrives",
];

/** hunterloot + ulti — same float slots as Borge relative to those keys. */
const FLOAT_PARAM_INDEX = new Set([
  EVAL_PARAMS.indexOf("upgrades.diamondspecials.hunterloot"),
  EVAL_PARAMS.indexOf("upgrades.ultima.ulti"),
]);

export function buildToEvalValues(config, iterations) {
  const meta = config.meta || {};
  const stats = config.stats || {};
  const talents = config.talents || {};
  const attrs = config.attributes || {};
  const insc = config.inscryptions || {};
  const relics = config.relics || {};
  const gems = config.gems || {};
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
  values.multichance = Number(stats.special_chance || 0);
  values.multipower = Number(stats.special_damage || 0);
  values.atkspeed = Number(stats.speed || 0);

  values.revival = Number(talents.death_is_my_companion || 0);
  values.boon = Number(talents.tricksters_boon || 0);
  values.ua = Number(talents.unfair_advantage || 0);
  values.needles = Number(talents.thousand_needles || 0);
  values.omen = Number(talents.omen_of_decay || 0);
  values.ll = Number(talents.call_me_lucky_loot || 0);
  values.crip = Number(talents.crippling_shots || 0);
  values.echo = Number(talents.echo_bullets || 0);
  values.ultima = Number(talents.legacy_of_ultima || wasmExtra.ultima || 0);

  values.lotl = Number(attrs.living_off_the_land || 0);
  values.exo = Number(attrs.exo_piercers || 0);
  values.scorp = Number(attrs.shimmering_scorpions || 0);
  values.timeless = Number(attrs.timeless_mastery || 0);
  values.ibu = Number(attrs.wings_of_ibu || 0);
  values.exterm = Number(attrs.extermination_protocol || 0);
  values.snek = Number(attrs.soul_of_snek || 0);
  values.vect = Number(attrs.vectid_elixir || 0);
  values.cycle = Number(attrs.cycle_of_death || 0);
  values.deal = Number(attrs.deal_with_death || 0);
  values.medusa = Number(attrs.gift_of_medusa || 0);
  values.dance = Number(attrs.dance_of_dashes || 0);
  values.sisters = Number(attrs.blessing_of_the_sisters || 0);
  values.scarab = Number(attrs.blessing_of_the_scarab || 0);
  values.cat = Number(attrs.blessing_of_the_cat || 0);

  for (const key of ["i31", "i32", "i33", "i36", "i37", "i40", "i81", "i86", "i92", "i104"]) {
    values[`upgrades.inscryptions.${key}`] = Number(insc[key] || 0);
  }

  values["upgrades.relics.r4"] = Number(relics.disk_of_dawn || 0);
  values["upgrades.relics.r7"] = Number(relics.long_range_artillery_crawler || 0);
  values["upgrades.relics.r17"] = Number(relics.bee_gone_companion_drone || 0);
  values["upgrades.relics.t2r7"] = Number(relics.t2r7 || wasmExtra.t2r7 || 0);

  values["upgrades.gems_nodes.innovation_gem2"] = Number(gems["innovation_node_#2"] || 0);
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

export class WasmOzzyEngine {
  constructor(exports) {
    this.ex = exports;
  }

  static fromExports(exports) {
    return new WasmOzzyEngine(exports);
  }

  evaluate(config, iterations) {
    const values = buildToEvalValues(config, iterations);
    const args = valuesToArgs(EVAL_PARAMS, values, FLOAT_PARAM_INDEX);
    const loot = Number(this.ex.EVALOZZY_WASM(...args));

    const stageCounts = collectProgress(
      this.ex,
      "getOzzyProgressSize",
      "getOzzyProgressStageAt",
      "getOzzyProgressCountAt",
    );
    const { firstRevive, secondRevive } = collectDeaths(
      this.ex,
      "getOzzyDeathsByStageAndReviveSize",
      "getOzzyDeathKeyAt",
      "getOzzyDeathCountAt",
    );

    return {
      lootPerMin: loot,
      avgStage: Number(this.ex.getLastOzzyAvgStage()),
      avgTime: Number(this.ex.getLastOzzyAvgTime()),
      minStage: Number(this.ex.getLastOzzyMinStage()),
      maxStage: Number(this.ex.getLastOzzyMaxStage()),
      bossHpPercent: Number(this.ex.getLastOzzyBossHpPercent()),
      bossKillRate: Number(this.ex.getLastOzzyBossKillRate()),
      mat1: Number(this.ex.getLastOzzyMat1()),
      mat2: Number(this.ex.getLastOzzyMat2()),
      mat3: Number(this.ex.getLastOzzyMat3()),
      minMat1: Number(this.ex.getLastMinOzzyMat1()),
      minMat2: Number(this.ex.getLastMinOzzyMat2()),
      minMat3: Number(this.ex.getLastMinOzzyMat3()),
      maxMat1: Number(this.ex.getLastMaxOzzyMat1()),
      maxMat2: Number(this.ex.getLastMaxOzzyMat2()),
      maxMat3: Number(this.ex.getLastMaxOzzyMat3()),
      xp: Number(this.ex.getLastOzzyXp()),
      stageCounts,
      firstRevive,
      secondRevive,
      buildStats: {
        max_hp: round2(Number(this.ex.getLastOzzyMaxHp())),
        atk_power: round2(Number(this.ex.getLastOzzyAtk())),
        hp_regen: round4(Number(this.ex.getLastOzzyRegen())),
        dmg_reduction: round2(Number(this.ex.getLastOzzyDr()) * 100),
        evade_chance: round2(Number(this.ex.getLastOzzyEvade()) * 100),
        effect_chance: round2(Number(this.ex.getLastOzzyEffect()) * 100),
        crit_chance: round2(Number(this.ex.getLastOzzyMultistrike()) * 100),
        crit_power: round2(Number(this.ex.getLastOzzyMultistrikePower())),
        atk_speed: round2(Number(this.ex.getLastOzzyReload())),
      },
    };
  }
}
