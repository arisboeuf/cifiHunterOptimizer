/** Browser WASM bridge for Knox (`EVALKNOX_WASM`). */
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
  "block",
  "effect",
  "charge",
  "chargeGain",
  "reload",
  "proj",
  "revival",
  "calyp",
  "ua",
  "ghost",
  "omen",
  "ll",
  "pog",
  "finish",
  "kraken",
  "soul",
  "dead",
  "sear",
  "pl",
  "time",
  "kot",
  "pct",
  "spa",
  "fe",
  "sop",
  "upgrades.gadgets.anchor",
  "iterations",
  "upgrades.iap.travpack",
  "upgrades.diamondspecials.hunterloot",
  "upgrades.ultima.ulti",
  "glac",
  "quartz",
  "tess",
  "upgrades.diamondspecials.reviveboost",
  "respec",
  "bossLootRate",
  "iterative",
  "glacRate1",
  "quartzRate1",
  "tessRate1",
  "xpRate1",
  "hp1",
  "atk1",
  "regen1",
  "dr1",
  "block1",
  "effect1",
  "charge1",
  "chargeGain1",
  "reload1",
  "proj1",
  "gadget1",
  "lvl1",
  "time1",
  "upgrades.researches.res81",
  "upgrades.researches.res95",
  "upgrades.researches.res105",
  "upgrades.researches.res112",
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
  "upgrades.gems_nodes.creation_knoxGU",
  "upgrades.gems_nodes.evolution_gem2",
  "upgrades.gems_nodes.evolution_gem3",
  "upgrades.loopmods.stelzi",
  "upgrades.inscryptions.i105",
  "upgrades.gems_nodes.exodus_gem5",
  "upgrades.gems_nodes.exodus_attractionCreationCount",
  "upgrades.gems_nodes.exodus_gem4",
  "upgrades.cms.milestoneCount",
  "upgrades.gems_nodes.temporal_gem6",
  "upgrades.gems_nodes.innovation_gem5",
  "upgrades.gems_nodes.power_gem6",
  "upgrades.gems_nodes.creation_gem4",
  "upgrades.gems_nodes.creation_gem5",
  "upgrades.gems_nodes.creation_galvTrinketsCount",
  "upgrades.gems_nodes.evolution_gem6",
  "upgrades.gems_nodes.attraction_level",
  "upgrades.gems_nodes.attraction_catchUp2",
  "upgrades.gems_nodes.attraction_lootKnox",
  "upgrades.relics.t2r5",
  "upgrades.relics.t2r7",
  "upgrades.loopmods.roe",
  "upgrades.inscryptions.i114",
  "upgrades.inscryptions.i115",
  "upgrades.mats_exchange.tysconDrives",
];

const FLOAT_PARAM_INDEX = new Set(
  [
    "upgrades.diamondspecials.hunterloot",
    "upgrades.ultima.ulti",
    "bossLootRate",
    "glacRate1",
    "quartzRate1",
    "tessRate1",
    "xpRate1",
  ]
    .map((k) => EVAL_PARAMS.indexOf(k))
    .filter((i) => i >= 0),
);

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
  values.block = Number(stats.block_chance || 0);
  values.effect = Number(stats.effect_chance || 0);
  values.charge = Number(stats.special_chance || 0);
  values.chargeGain = Number(stats.special_damage || 0);
  values.reload = Number(stats.speed || 0);
  values.proj = Number(stats.projectiles || 0);

  values.revival = Number(talents.death_is_my_companion || 0);
  values.calyp = Number(talents.calypsos_advantage || 0);
  values.ua = Number(talents.unfair_advantage || 0);
  values.ghost = Number(talents.ghost_bullets || 0);
  values.omen = Number(talents.omen_of_defeat || 0);
  values.ll = Number(talents.call_me_lucky_loot || 0);
  values.pog = Number(talents.presence_of_god || 0);
  values.finish = Number(talents.finishing_move || 0);

  values.kraken = Number(attrs.release_the_kraken || 0);
  values.soul = Number(attrs.soul_amplification || 0);
  values.dead = Number(attrs.dead_men_tell_no_tales || 0);
  values.spa = Number(attrs.space_pirate_armory || 0);
  values.pl = Number(attrs.pirates_life_for_knox || 0);
  values.time = Number(attrs.timeless_mastery || 0);
  values.sear = Number(attrs.searious_efficiency || 0);
  values.pct = Number(attrs.passive_charge_tank || 0);
  values.kot = Number(attrs.king_of_torpedos || 0);
  values.fe = Number(attrs.fortification_elixir || 0);
  values.sop = Number(attrs.shield_of_poseidon || 0);

  for (const key of ["i105", "i114", "i115"]) {
    values[`upgrades.inscryptions.${key}`] = Number(insc[key] || 0);
  }

  values["upgrades.relics.t2r5"] = Number(relics.t2r5 || 0);
  values["upgrades.relics.t2r7"] = Number(relics.t2r7 || 0);

  values["upgrades.gems_nodes.attraction_level"] = Number(gems.attraction_gem || 0);
  values["upgrades.gems_nodes.attraction_catchUp2"] = Number(gems["attraction_catch-up"] || 0);
  values["upgrades.gems_nodes.creation_knoxGU"] = Number(gems.creation_knoxGU || 0);

  for (const [k, v] of Object.entries(wasmExtra)) {
    if (k in values) values[k] = v;
  }

  values.iterations = Math.max(1, Number(iterations) || 1);
  return values;
}

export class WasmKnoxEngine {
  constructor(exports) {
    this.ex = exports;
  }

  static fromExports(exports) {
    return new WasmKnoxEngine(exports);
  }

  evaluate(config, iterations) {
    const values = buildToEvalValues(config, iterations);
    const args = valuesToArgs(EVAL_PARAMS, values, FLOAT_PARAM_INDEX);
    const loot = Number(this.ex.EVALKNOX_WASM(...args));

    const stageCounts = collectProgress(
      this.ex,
      "getKnoxProgressSize",
      "getKnoxProgressStageAt",
      "getKnoxProgressCountAt",
    );
    const { firstRevive, secondRevive } = collectDeaths(
      this.ex,
      "getKnoxDeathsByStageAndReviveSize",
      "getKnoxDeathKeyAt",
      "getKnoxDeathCountAt",
    );

    return {
      lootPerMin: loot,
      avgStage: Number(this.ex.getLastKnoxAvgStage()),
      avgTime: Number(this.ex.getLastKnoxAvgTime()),
      minStage: Number(this.ex.getLastKnoxMinStage()),
      maxStage: Number(this.ex.getLastKnoxMaxStage()),
      bossHpPercent: Number(this.ex.getLastKnoxBossHpPercent()),
      bossKillRate: Number(this.ex.getLastKnoxBossKillRate()),
      mat1: Number(this.ex.getLastKnoxMat1()),
      mat2: Number(this.ex.getLastKnoxMat2()),
      mat3: Number(this.ex.getLastKnoxMat3()),
      minMat1: Number(this.ex.getLastMinKnoxMat1()),
      minMat2: Number(this.ex.getLastMinKnoxMat2()),
      minMat3: Number(this.ex.getLastMinKnoxMat3()),
      maxMat1: Number(this.ex.getLastMaxKnoxMat1()),
      maxMat2: Number(this.ex.getLastMaxKnoxMat2()),
      maxMat3: Number(this.ex.getLastMaxKnoxMat3()),
      xp: Number(this.ex.getLastKnoxXp()),
      stageCounts,
      firstRevive,
      secondRevive,
      buildStats: {
        max_hp: round2(Number(this.ex.getLastKnoxMaxHp())),
        atk_power: round2(Number(this.ex.getLastKnoxAtk())),
        hp_regen: round4(Number(this.ex.getLastKnoxRegen())),
        dmg_reduction: round2(Number(this.ex.getLastKnoxDr()) * 100),
        evade_chance: round2(Number(this.ex.getLastKnoxBlock()) * 100),
        effect_chance: round2(Number(this.ex.getLastKnoxEffect()) * 100),
        crit_chance: round2(Number(this.ex.getLastKnoxCharge()) * 100),
        crit_power: round2(Number(this.ex.getLastKnoxChargeGain())),
        atk_speed: round2(Number(this.ex.getLastKnoxReload())),
      },
    };
  }
}
