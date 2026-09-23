/** Knox attribute tree (cifi-tools ATTRIBUTE_DEPENDENCIES / MIN_VALUE). */
import {
  ATTRIBUTE_COSTS,
  ATTRIBUTE_LABELS,
} from "./costs.js";
import { makeAttrRules } from "../attr-rules-factory.js";

export const ATTRIBUTE_DEPENDENCIES = {
  soul_amplification: ["release_the_kraken"],
  dead_men_tell_no_tales: ["soul_amplification"],
  space_pirate_armory: ["release_the_kraken"],
  pirates_life_for_knox: ["space_pirate_armory"],
  timeless_mastery: ["pirates_life_for_knox"],
  searious_efficiency: ["release_the_kraken"],
  passive_charge_tank: ["searious_efficiency"],
  king_of_torpedos: ["passive_charge_tank"],
  fortification_elixir: ["release_the_kraken"],
  shield_of_poseidon: ["fortification_elixir"],
};

export const ATTRIBUTE_MIN_VALUE = {
  release_the_kraken: 0,
  soul_amplification: 0,
  dead_men_tell_no_tales: 0,
  space_pirate_armory: 0,
  pirates_life_for_knox: 0,
  timeless_mastery: 0,
  searious_efficiency: 0,
  passive_charge_tank: 0,
  king_of_torpedos: 0,
  fortification_elixir: 0,
  shield_of_poseidon: 0,
};

export const {
  attrSpent,
  attributesTreeValid,
  zeroOrphanDependents,
  canIncreaseAttribute,
  dependentsOf,
  attributeTreeEntries,
  attributeUnlockState,
} = makeAttrRules({
  ATTRIBUTE_COSTS,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_DEPENDENCIES,
  ATTRIBUTE_MIN_VALUE,
});
