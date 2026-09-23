/** Knox talent / attribute / inscryption costs. */
export const TALENT_COSTS = {
  death_is_my_companion: { cost: 1, max: 2 },
  calypsos_advantage: { cost: 1, max: 5 },
  unfair_advantage: { cost: 1, max: 5 },
  ghost_bullets: { cost: 1, max: 15 },
  omen_of_defeat: { cost: 1, max: 10 },
  call_me_lucky_loot: { cost: 1, max: 10 },
  presence_of_god: { cost: 1, max: 10 },
  finishing_move: { cost: 1, max: 15 },
};

export const ATTRIBUTE_COSTS = {
  release_the_kraken: { cost: 1, max: Infinity },
  soul_amplification: { cost: 1, max: 100 },
  dead_men_tell_no_tales: { cost: 2, max: 10 },
  space_pirate_armory: { cost: 2, max: 50 },
  pirates_life_for_knox: { cost: 3, max: 10 },
  timeless_mastery: { cost: 3, max: 5 },
  searious_efficiency: { cost: 2, max: 5 },
  passive_charge_tank: { cost: 4, max: 10 },
  king_of_torpedos: { cost: 5, max: 5 },
  fortification_elixir: { cost: 2, max: 10 },
  shield_of_poseidon: { cost: 3, max: 10 },
};

export const INSCRIPTION_COSTS = {
  i105: { cost: 1, max: 8 },
  i114: { cost: 1, max: 3 },
  i115: { cost: 1, max: 7 },
};

export const STAT_MAX = {
  hp: 9999,
  power: 9999,
  regen: 9999,
  damage_reduction: 50,
  block_chance: 50,
  effect_chance: 50,
  special_chance: 100,
  special_damage: 100,
  speed: 100,
  projectiles: 5,
  highest_stage_reached: 9999,
};

export const STAT_LABELS = {
  hp: "MAX HP",
  power: "ATK Power",
  regen: "HP Regen",
  damage_reduction: "DMG Reduction",
  block_chance: "Block Chance",
  effect_chance: "Effect Chance",
  special_chance: "Charge Chance",
  special_damage: "Charge Gained",
  speed: "Reload Time",
  projectiles: "Projectiles Per Salvo",
  highest_stage_reached: "Highest Stage Reached",
};

export const STAT_ORDER = Object.keys(STAT_LABELS);

export const TALENT_LABELS = {
  death_is_my_companion: "Death Is My Companion",
  calypsos_advantage: "Calypso's Advantage",
  unfair_advantage: "The Unfair Advantage",
  ghost_bullets: "Ghost Bullets",
  omen_of_defeat: "The Omen Of Defeat",
  call_me_lucky_loot: "Call Me Lucky Loot",
  presence_of_god: "Presence Of A God",
  finishing_move: "Finishing Move",
};

export const ATTRIBUTE_LABELS = {
  release_the_kraken: "Release The Kraken",
  soul_amplification: "Soul Amplification",
  dead_men_tell_no_tales: "Dead Men Tell No Tales",
  space_pirate_armory: "Space Pirate Armory",
  pirates_life_for_knox: "A Pirate's Life for Knox",
  timeless_mastery: "Timeless Mastery",
  searious_efficiency: "Searious Efficiency",
  passive_charge_tank: "Passive Charge Tank",
  king_of_torpedos: "King Of Torpedos",
  fortification_elixir: "Fortification Elixir",
  shield_of_poseidon: "Shield of Poseidon",
};

export const TALENT_ORDER = Object.keys(TALENT_LABELS);
export const ATTR_ORDER = Object.keys(ATTRIBUTE_LABELS);

export const TALENT_TIPS = {
  death_is_my_companion: "Each level: +1 revive at 80% Max HP.",
  calypsos_advantage: "Sustain / shield-oriented advantage talent.",
  unfair_advantage: "On kill (effect chance): heal for 2% Max HP per level.",
  ghost_bullets: "Ghost projectile talent — more damage through defenses.",
  omen_of_defeat: "Enemy regen −8% per level.",
  call_me_lucky_loot: "On kill (effect chance): +20% loot per level for that drop.",
  presence_of_god: "Enemy ATK Power −3% per level.",
  finishing_move: "Finisher talent for charged / high-damage shots.",
};

export const ATTRIBUTE_TIPS = {
  release_the_kraken: "Core Knox attribute path root.",
  soul_amplification: "Amplifies soul / special scaling.",
  dead_men_tell_no_tales: "Defensive / sustain branch off Soul Amplification.",
  space_pirate_armory: "Offense / armory branch.",
  pirates_life_for_knox: "Loot / pirate-life branch toward Timeless.",
  timeless_mastery: "+loot per level (Timeless Mastery).",
  searious_efficiency: "Efficiency branch toward charge tank.",
  passive_charge_tank: "Passive charge generation.",
  king_of_torpedos: "Torpedo / heavy shot branch.",
  fortification_elixir: "Defensive fortification branch.",
  shield_of_poseidon: "Shield / block branch off Fortification Elixir.",
};

export const INSCRIPTION_META = {
  i105: { title: "Inscryption #105", effect: "Loot ×1.08" },
  i114: { title: "Inscryption #114", effect: "Base ATK Power +0.6" },
  i115: { title: "Inscryption #115", effect: "Flat DMG Reduction +0.12%" },
};

export const INSC_ORDER = Object.keys(INSCRIPTION_META);

export const RELIC_KEYS = ["t2r5", "t2r7"];
export const GEM_KEYS = [
  "attraction_gem",
  "attraction_catch-up",
  "creation_knoxGU",
];

export const BUILD_STATS_LABELS = [
  ["max_hp", "MAX HP", (v) => String(v)],
  ["atk_power", "ATK Power", (v) => String(v)],
  ["hp_regen", "HP Regen", (v) => `${v} /s`],
  ["dmg_reduction", "DMG Reduction", (v) => `${v} %`],
  ["evade_chance", "Block Chance", (v) => `${v} %`],
  ["effect_chance", "Effect Chance", (v) => `${v} %`],
  ["crit_chance", "Charge Chance", (v) => `${v} %`],
  ["crit_power", "Charge Gained", (v) => `${v} x`],
  ["atk_speed", "Reload Time", (v) => `${v} s`],
];

export const TIMELESS_KEY = "timeless_mastery";
export const TIMELESS_PARENT_MIN = {
  release_the_kraken: 1,
  space_pirate_armory: 1,
  pirates_life_for_knox: 1,
};
