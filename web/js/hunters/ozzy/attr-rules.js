/** Ozzy attribute tree (cifi-tools ATTRIBUTE_DEPENDENCIES / MIN_VALUE). */
import {
  ATTRIBUTE_COSTS,
  ATTRIBUTE_LABELS,
} from "./costs.js";
import { makeAttrRules } from "../attr-rules-factory.js";

export const ATTRIBUTE_DEPENDENCIES = {
  exo_piercers: ["living_off_the_land"],
  wings_of_ibu: ["living_off_the_land"],
  shimmering_scorpions: ["exo_piercers"],
  timeless_mastery: ["exo_piercers"],
  extermination_protocol: ["wings_of_ibu"],
  soul_of_snek: ["extermination_protocol"],
  vectid_elixir: ["extermination_protocol"],
  cycle_of_death: ["soul_of_snek"],
  deal_with_death: ["cycle_of_death"],
  gift_of_medusa: ["extermination_protocol"],
  dance_of_dashes: ["shimmering_scorpions"],
  blessing_of_the_sisters: ["deal_with_death"],
  blessing_of_the_scarab: ["gift_of_medusa"],
  blessing_of_the_cat: ["dance_of_dashes"],
};

export const ATTRIBUTE_MIN_VALUE = {
  living_off_the_land: 0,
  exo_piercers: 0,
  shimmering_scorpions: 0,
  timeless_mastery: 0,
  wings_of_ibu: 0,
  extermination_protocol: 0,
  soul_of_snek: 0,
  vectid_elixir: 0,
  cycle_of_death: 0,
  deal_with_death: 90,
  gift_of_medusa: 90,
  dance_of_dashes: 90,
  blessing_of_the_sisters: 180,
  blessing_of_the_scarab: 150,
  blessing_of_the_cat: 150,
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
