/** Ozzy talent / attribute / inscryption costs. */
export const TALENT_COSTS = {
  death_is_my_companion: { cost: 1, max: 2 },
  tricksters_boon: { cost: 1, max: 1 },
  unfair_advantage: { cost: 1, max: 5 },
  thousand_needles: { cost: 1, max: 10 },
  omen_of_decay: { cost: 1, max: 10 },
  call_me_lucky_loot: { cost: 1, max: 10 },
  crippling_shots: { cost: 1, max: 15 },
  echo_bullets: { cost: 1, max: 20 },
};

export const ATTRIBUTE_COSTS = {
  living_off_the_land: { cost: 1, max: Infinity },
  exo_piercers: { cost: 1, max: Infinity },
  shimmering_scorpions: { cost: 3, max: 5 },
  timeless_mastery: { cost: 3, max: 5 },
  wings_of_ibu: { cost: 2, max: 5 },
  extermination_protocol: { cost: 2, max: 5 },
  soul_of_snek: { cost: 3, max: 5 },
  vectid_elixir: { cost: 2, max: 10 },
  cycle_of_death: { cost: 3, max: 5 },
  deal_with_death: { cost: 5, max: 3 },
  gift_of_medusa: { cost: 3, max: 5 },
  dance_of_dashes: { cost: 3, max: 4 },
  blessing_of_the_sisters: { cost: 15, max: 1 },
  blessing_of_the_scarab: { cost: 2, max: 20 },
  blessing_of_the_cat: { cost: 2, max: 20 },
};

export const INSCRIPTION_COSTS = {
  i31: { cost: 1, max: 10 },
  i32: { cost: 1, max: 8 },
  i33: { cost: 1, max: 6 },
  i36: { cost: 1, max: 5 },
  i37: { cost: 1, max: 7 },
  i40: { cost: 1, max: 10 },
  i81: { cost: 1, max: 10 },
  i86: { cost: 1, max: 7 },
  i92: { cost: 1, max: 7 },
  i104: { cost: 1, max: 8 },
};

export const STAT_MAX = {
  hp: 9999,
  power: 9999,
  regen: 9999,
  damage_reduction: 70,
  evade_chance: 40,
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
  special_chance: "Multistrike Chance",
  special_damage: "Multistrike Power",
  speed: "ATK Speed",
  highest_stage_reached: "Highest Stage Reached",
};

export const STAT_ORDER = Object.keys(STAT_LABELS);

export const TALENT_LABELS = {
  death_is_my_companion: "Death Is My Companion",
  tricksters_boon: "Trickster's Boon",
  unfair_advantage: "The Unfair Advantage",
  thousand_needles: "Thousand Needles",
  omen_of_decay: "The Omen Of Decay",
  call_me_lucky_loot: "Call Me Lucky Loot",
  crippling_shots: "Crippling Shots",
  echo_bullets: "Echo Bullets",
};

export const ATTRIBUTE_LABELS = {
  living_off_the_land: "Living Off The Land",
  exo_piercers: "Exo Piercers",
  shimmering_scorpions: "Shimmering Scorpions",
  timeless_mastery: "Timeless Mastery",
  wings_of_ibu: "Wings Of Ibu",
  extermination_protocol: "Extermination Protocol",
  soul_of_snek: "Soul Of Snek",
  vectid_elixir: "Vectid Elixir",
  cycle_of_death: "The Cycle Of Death",
  deal_with_death: "A Deal With Death",
  gift_of_medusa: "Gift Of Medusa",
  dance_of_dashes: "Dance Of Dashes",
  blessing_of_the_sisters: "Blessing Of The Sisters",
  blessing_of_the_scarab: "Blessing Of The Scarab",
  blessing_of_the_cat: "Blessing Of The Cat",
};

export const TALENT_ORDER = Object.keys(TALENT_LABELS);
export const ATTR_ORDER = Object.keys(ATTRIBUTE_LABELS);

export const TALENT_TIPS = {
  death_is_my_companion: "Each level: +1 revive at 80% Max HP.",
  tricksters_boon: "Chance (½ effect chance) on attack: +1 trickster charge (auto-evade).",
  unfair_advantage: "On kill (effect chance): heal for 2% Max HP per level.",
  thousand_needles: "On hit (effect chance): stun (~0.05s × level). Also −0.06s ATK Speed per level.",
  omen_of_decay: "On hit: deal 0.8% of enemy current HP per level as bonus damage.",
  call_me_lucky_loot: "On kill (effect chance): +20% loot per level for that drop.",
  crippling_shots: "On hit (effect chance): next hit deals +3% damage per level stacked.",
  echo_bullets: "Chance (½ effect chance) on hit: echo shot for 5% ATK Power × level.",
};

export const ATTRIBUTE_TIPS = {
  living_off_the_land: "+2% Max HP and +2% HP Regen per level (multiplicative).",
  exo_piercers: "+1.2% ATK Power per level (multiplicative).",
  shimmering_scorpions: "+3.3% lifesteal per level.",
  timeless_mastery: "+16% loot per level.",
  wings_of_ibu: "+2.6% Damage Reduction and +0.5% Evade per level.",
  extermination_protocol: "+2.8% Effect Chance per level.",
  soul_of_snek: "Enemy regen −8.8% per level.",
  vectid_elixir: "After Unfair Advantage: +15% regen for 5 ticks per level.",
  cycle_of_death: "+2.3% Multistrike Chance and +2% Multistrike Power per revive used, per level.",
  deal_with_death: "+2% ATK Power and +1.6% DR per revive used, per level.",
  gift_of_medusa: "Enemy regen −5% of hunter regen × level.",
  dance_of_dashes: "On taking a crit: 15% × level chance to gain a trickster charge.",
  blessing_of_the_sisters: "Unlocks advanced sisters blessing (1 rank).",
  blessing_of_the_scarab: "Late-game scarab blessing path.",
  blessing_of_the_cat: "Late-game cat blessing path.",
};

export const INSCRIPTION_META = {
  i31: { title: "Inscryption #31", effect: "Effect Chance +0.6%" },
  i32: { title: "Inscryption #32", effect: "Loot ×1.5" },
  i33: { title: "Inscryption #33", effect: "XP ×1.75" },
  i36: { title: "Inscryption #36", effect: "ATK Speed −0.03s" },
  i37: { title: "Inscryption #37", effect: "DMG Reduction +1.11%" },
  i40: { title: "Inscryption #40", effect: "Multistrike Chance +0.5%" },
  i81: { title: "Inscryption #81", effect: "Loot ×1.1" },
  i86: { title: "Inscryption #86", effect: "DMG Reduction +0.2%" },
  i92: { title: "Inscryption #92", effect: "Effect Chance +0.2%" },
  i104: { title: "Inscryption #104", effect: "Loot ×1.08" },
};

export const INSC_ORDER = Object.keys(INSCRIPTION_META);

export const RELIC_KEYS = ["disk_of_dawn", "long_range_artillery_crawler", "bee_gone_companion_drone"];
export const GEM_KEYS = [
  "attraction_gem",
  "attraction_catch-up",
  "attraction_node_#3",
  "innovation_node_#2",
  "innovation_node_#3",
];

export const BUILD_STATS_LABELS = [
  ["max_hp", "MAX HP", (v) => String(v)],
  ["atk_power", "ATK Power", (v) => String(v)],
  ["hp_regen", "HP Regen", (v) => `${v} /s`],
  ["dmg_reduction", "DMG Reduction", (v) => `${v} %`],
  ["evade_chance", "Evade Chance", (v) => `${v} %`],
  ["effect_chance", "Effect Chance", (v) => `${v} %`],
  ["crit_chance", "Multistrike Chance", (v) => `${v} %`],
  ["crit_power", "Multistrike Power", (v) => `${v} x`],
  ["atk_speed", "ATK Speed", (v) => `${v} s`],
];

/** Optimizer: Timeless Mastery key + required parent floors (prioritize path). */
export const TIMELESS_KEY = "timeless_mastery";
export const TIMELESS_PARENT_MIN = {
  living_off_the_land: 1,
  exo_piercers: 1,
};
