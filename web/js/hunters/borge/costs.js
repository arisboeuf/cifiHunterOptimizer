/** Borge talent / attribute / inscryption costs. */
export const TALENT_COSTS = {
  death_is_my_companion: { cost: 1, max: 2 },
  life_of_the_hunt: { cost: 1, max: 5 },
  unfair_advantage: { cost: 1, max: 5 },
  impeccable_impacts: { cost: 1, max: 10 },
  omen_of_defeat: { cost: 1, max: 10 },
  call_me_lucky_loot: { cost: 1, max: 10 },
  presence_of_god: { cost: 1, max: 15 },
  fires_of_war: { cost: 1, max: 15 },
};

export const ATTRIBUTE_COSTS = {
  soul_of_ares: { cost: 1, max: Infinity },
  essence_of_ylith: { cost: 1, max: Infinity },
  spartan_lineage: { cost: 2, max: 6 },
  timeless_mastery: { cost: 3, max: 5 },
  helltouch_barrier: { cost: 2, max: 10 },
  lifedrain_inhalers: { cost: 2, max: 10 },
  explosive_punches: { cost: 3, max: 6 },
  book_of_baal: { cost: 3, max: 6 },
  superior_sensors: { cost: 2, max: 6 },
  atlas_protocol: { cost: 3, max: 6 },
  weakspot_analysis: { cost: 2, max: 6 },
  born_for_battle: { cost: 5, max: 3 },
  soul_of_the_minotaur: { cost: 2, max: 20 },
  soul_of_hermes: { cost: 2, max: 20 },
  soul_of_athena: { cost: 15, max: 1 },
};

export const INSCRIPTION_COSTS = {
  i3: { cost: 1, max: 8 },
  i4: { cost: 1, max: 6 },
  i11: { cost: 1, max: 3 },
  i13: { cost: 1, max: 8 },
  i14: { cost: 1, max: 5 },
  i23: { cost: 1, max: 5 },
  i24: { cost: 1, max: 8 },
  i27: { cost: 1, max: 10 },
  i44: { cost: 1, max: 10 },
  i60: { cost: 1, max: 10 },
  i80: { cost: 1, max: 10 },
  i84: { cost: 1, max: 10 },
  i87: { cost: 1, max: 10 },
  i88: { cost: 1, max: 7 },
  i89: { cost: 1, max: 7 },
  i91: { cost: 1, max: 7 },
  i103: { cost: 1, max: 8 },
};

export const STAT_MAX = {
  hp: 9999,
  power: 9999,
  regen: 9999,
  damage_reduction: 40,
  evade_chance: 50,
  effect_chance: 50,
  special_chance: 100,
  special_damage: 100,
  speed: 100,
  highest_stage_reached: 9999,
};

export const STAT_LABELS = {
  hp: "MAX HP",
  power: "ATK Power",
  regen: "HP Regen",
  damage_reduction: "DMG Reduction",
  evade_chance: "Evade Chance",
  effect_chance: "Effect Chance",
  special_chance: "Crit Chance",
  special_damage: "Crit Power",
  speed: "ATK Speed",
  highest_stage_reached: "Highest Stage Reached",
};

export const STAT_ORDER = Object.keys(STAT_LABELS);

export const TALENT_LABELS = {
  death_is_my_companion: "Death Is My Companion",
  life_of_the_hunt: "Life of the Hunt",
  unfair_advantage: "The Unfair Advantage",
  impeccable_impacts: "Impeccable Impacts",
  omen_of_defeat: "The Omen Of Defeat",
  call_me_lucky_loot: "Call Me Lucky Loot",
  presence_of_god: "Presence Of A God",
  fires_of_war: "The Fires of War",
};

export const ATTRIBUTE_LABELS = {
  soul_of_ares: "Soul Of Ares",
  essence_of_ylith: "Essence Of Ylith",
  spartan_lineage: "Spartan Lineage",
  timeless_mastery: "Timeless Mastery",
  book_of_baal: "Book Of Baal",
  superior_sensors: "Superior Sensors",
  helltouch_barrier: "Helltouch Barrier",
  lifedrain_inhalers: "Lifedrain Inhaler",
  explosive_punches: "Explosive Punches",
  atlas_protocol: "The Atlas Protocol",
  weakspot_analysis: "Weakspot Analysis",
  born_for_battle: "Born For Battle",
  soul_of_the_minotaur: "Soul Of The Minotaur",
  soul_of_hermes: "Soul Of Hermes",
  soul_of_athena: "Soul Of Athena",
};

export const TALENT_ORDER = Object.keys(TALENT_LABELS);
export const ATTR_ORDER = Object.keys(ATTRIBUTE_LABELS);

/** Effect blurbs (from hunter-sim / cifi-tools combat rules), per level unless noted. */
export const TALENT_TIPS = {
  death_is_my_companion: "Each level: +1 revive at 80% Max HP.",
  life_of_the_hunt: "On hit (effect chance): heal for 6% of damage dealt per level.",
  unfair_advantage: "On kill (effect chance): heal for 2% Max HP per level.",
  impeccable_impacts: "On hit (effect chance): stun (~0.1s × level). Also +2 flat ATK Power per level.",
  omen_of_defeat: "Enemy regen −8% per level.",
  call_me_lucky_loot: "On kill (effect chance): +20% loot per level for that drop.",
  presence_of_god: "Enemies start with −4% Max HP per level.",
  fires_of_war: "On hit (effect chance): attack speed buff for 0.1s × level.",
};

export const ATTRIBUTE_TIPS = {
  soul_of_ares: "+1% Max HP and +0.2% ATK Power per level (multiplicative).",
  essence_of_ylith: "+0.04 HP Regen and +0.9% Max HP per level.",
  spartan_lineage: "+1.5% Damage Reduction per level.",
  timeless_mastery: "+14% loot per level.",
  helltouch_barrier: "+8% reflected damage per level.",
  lifedrain_inhalers: "+0.08% missing-HP regen per level.",
  explosive_punches: "+4.4% Crit Chance and +8% Crit Power per level.",
  book_of_baal: "+1.11% lifesteal per level.",
  superior_sensors: "+1.6% Evade and +1.2% Effect Chance per level.",
  atlas_protocol:
    "+0.7% DR, +1.4% Effect Chance, +2.5% Crit Chance per level; bosses: −4% ATK Speed per level.",
  weakspot_analysis: "−11% crit damage taken per level.",
  born_for_battle: "+0.1% ATK Power per 1% missing HP, per level.",
  soul_of_the_minotaur: "+1% ATK Power and +1% Damage Reduction per level.",
  soul_of_hermes: "+0.4% Crit Chance, +0.4% Effect Chance, +1% Crit Power per level.",
  soul_of_athena: "Unlocks 1 heavy attack (×1.5 damage, ×6 charge, always crits).",
};

export const INSCRIPTION_META = {
  i3: { title: "Inscryption #3", effect: "Max HP +6" },
  i4: { title: "Inscryption #4", effect: "Crit Chance +0.65%" },
  i11: { title: "Inscryption #11", effect: "Effect Chance +2%" },
  i13: { title: "Inscryption #13", effect: "ATK Power +1" },
  i14: { title: "Inscryption #14", effect: "Loot ×1.1" },
  i23: { title: "Inscryption #23", effect: "ATK Speed −0.04s" },
  i24: { title: "Inscryption #24", effect: "DMG Reduction +0.4%" },
  i27: { title: "Inscryption #27", effect: "Max HP +24" },
  i44: { title: "Inscryption #44", effect: "Loot ×1.08" },
  i60: { title: "Inscryption #60", effect: "ATK/HP/Loot +3%" },
  i80: { title: "Inscryption #80", effect: "Loot ×1.1" },
  i84: { title: "Inscryption #84", effect: "Max HP +5%" },
  i87: { title: "Inscryption #87", effect: "ATK Power ×1.05" },
  i88: { title: "Inscryption #88", effect: "Crit Chance +0.4%" },
  i89: { title: "Inscryption #89", effect: "Effect Chance +0.2%" },
  i91: { title: "Inscryption #91", effect: "DMG Reduction +0.2%" },
  i103: { title: "Inscryption #103", effect: "Loot ×1.08" },
};

export const INSC_ORDER = Object.keys(INSCRIPTION_META);

export const RELIC_KEYS = ["disk_of_dawn", "long_range_artillery_crawler"];
export const GEM_KEYS = [
  "attraction_gem",
  "attraction_catch-up",
  "attraction_node_#3",
  "innovation_node_#3",
  "creation_node_#1",
  "creation_node_#2",
  "creation_node_#3",
];
