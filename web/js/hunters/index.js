/** Hunter registry — order: Borge → Ozzy → Knox. */
import * as borgeCosts from "./borge/costs.js";
import * as borgeAttrs from "./borge/attr-rules.js";
import { WasmBorgeEngine, wasmToSimResult as borgeWasmToSim } from "./borge/wasm-engine.js";

import * as ozzyCosts from "./ozzy/costs.js";
import * as ozzyAttrs from "./ozzy/attr-rules.js";
import { WasmOzzyEngine, wasmToSimResult as ozzyWasmToSim } from "./ozzy/wasm-engine.js";

import * as knoxCosts from "./knox/costs.js";
import * as knoxAttrs from "./knox/attr-rules.js";
import { WasmKnoxEngine, wasmToSimResult as knoxWasmToSim } from "./knox/wasm-engine.js";

import { loadWasmExports } from "./wasm-shared.js";

function emptySection(keys, fill = 0) {
  return Object.fromEntries(keys.map((k) => [k, fill]));
}

function makeDefaultBuild(costs, hunterName, extras = {}) {
  return {
    build_name: `${hunterName} Build`,
    meta: { hunter: hunterName, level: 14 },
    stats: { ...emptySection(costs.STAT_ORDER), ...(extras.stats || {}) },
    talents: { ...emptySection(costs.TALENT_ORDER), ...(extras.talents || {}) },
    attributes: { ...emptySection(costs.ATTR_ORDER), ...(extras.attributes || {}) },
    inscryptions: emptySection(costs.INSC_ORDER),
    mods: { ...(extras.mods || {}) },
    relics: emptySection(costs.RELIC_KEYS),
    gems: emptySection(costs.GEM_KEYS),
  };
}

const borgeExample = {
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
  },
  mods: { trample: false },
};

export const HUNTER_ORDER = ["borge", "ozzy", "knox"];

export const HUNTERS = {
  borge: {
    id: "borge",
    name: "Borge",
    theme: "borge",
    costs: borgeCosts,
    attrs: borgeAttrs,
    Engine: WasmBorgeEngine,
    wasmToSimResult: borgeWasmToSim,
    showTrample: true,
    defaultBuild: () => {
      const b = makeDefaultBuild(borgeCosts, "Borge", borgeExample);
      b.build_name = "Lvl 14 Example";
      return b;
    },
    emptyBuild: () => {
      const b = makeDefaultBuild(borgeCosts, "Borge");
      b.meta.level = 0;
      return b;
    },
  },
  ozzy: {
    id: "ozzy",
    name: "Ozzy",
    theme: "ozzy",
    costs: ozzyCosts,
    attrs: ozzyAttrs,
    Engine: WasmOzzyEngine,
    wasmToSimResult: ozzyWasmToSim,
    showTrample: false,
    defaultBuild: () =>
      makeDefaultBuild(ozzyCosts, "Ozzy", {
        stats: {
          hp: 100,
          power: 80,
          regen: 40,
          damage_reduction: 20,
          evade_chance: 15,
          effect_chance: 20,
          special_chance: 25,
          special_damage: 20,
          speed: 18,
          highest_stage_reached: 40,
        },
        talents: {
          death_is_my_companion: 2,
          tricksters_boon: 1,
          unfair_advantage: 3,
          thousand_needles: 2,
          call_me_lucky_loot: 1,
        },
        attributes: {
          living_off_the_land: 4,
          exo_piercers: 4,
          timeless_mastery: 5,
          wings_of_ibu: 2,
        },
      }),
    emptyBuild: () => {
      const b = makeDefaultBuild(ozzyCosts, "Ozzy");
      b.meta.level = 0;
      return b;
    },
  },
  knox: {
    id: "knox",
    name: "Knox",
    theme: "knox",
    costs: knoxCosts,
    attrs: knoxAttrs,
    Engine: WasmKnoxEngine,
    wasmToSimResult: knoxWasmToSim,
    showTrample: false,
    defaultBuild: () =>
      makeDefaultBuild(knoxCosts, "Knox", {
        stats: {
          hp: 100,
          power: 80,
          regen: 40,
          damage_reduction: 18,
          block_chance: 15,
          effect_chance: 18,
          special_chance: 25,
          special_damage: 20,
          speed: 16,
          projectiles: 1,
          highest_stage_reached: 40,
        },
        talents: {
          death_is_my_companion: 2,
          calypsos_advantage: 2,
          unfair_advantage: 3,
          call_me_lucky_loot: 1,
          presence_of_god: 1,
        },
        attributes: {
          release_the_kraken: 5,
          space_pirate_armory: 2,
          pirates_life_for_knox: 1,
          timeless_mastery: 5,
        },
      }),
    emptyBuild: () => {
      const b = makeDefaultBuild(knoxCosts, "Knox");
      b.meta.level = 0;
      return b;
    },
  },
};

export const DEFAULT_HUNTER_ID = "borge";

export function getHunter(id) {
  return HUNTERS[id] || HUNTERS[DEFAULT_HUNTER_ID];
}

export function storageKeyFor(hunterId) {
  return `hunter_sim_web_state_v1_${hunterId}`;
}

export async function loadSharedWasm(wasmUrl = "./wasm/release.wasm") {
  return loadWasmExports(wasmUrl);
}

export function engineFor(hunter, wasmExports) {
  return hunter.Engine.fromExports(wasmExports);
}
