/** Ouroboros gem progression data (SirRed v0.018 + wiki-aligned effects). */

export const GEM_ORDER = [
  "Exodus",
  "Temporality",
  "Innovation",
  "Attraction",
  "Creation",
  "Power",
  "Evolution",
];

/** Quality purchase costs in OO. */
export const QUALITY_COSTS = {
  Exodus: { 1: 1, 2: 5, 3: 5e3, 4: 2e5, 5: 95e12 },
  Temporality: { 1: 5, 2: 18, 3: 3e9 },
  Innovation: { 1: 12, 2: 10e9, 3: 8e12 },
  Attraction: { 1: 30, 2: 150, 3: 1e3, 4: 20e12 },
  Creation: { 1: 555, 2: 2e5, 3: 4e5, 4: 6e12 },
  Power: { 1: 150e6, 2: 1e12, 3: 1.2e15 },
  Evolution: { 1: 50e12 },
};

/** What each quality unlocks (short English blurbs). */
export const QUALITY_UNLOCKS = {
  Exodus: "Q1: Cells Bonus · Q2: Shard Bonus · Q3: RP Bonus + unlocks Gem Nodes · Q4: MP + AP Bonus · Q5: Materials + Orbs Bonus; plus new gem upgrades/nodes.",
  Temporality: "Q1: MP (Loop Mods) · Q2: MP (Ticks) · Q3: Zag Rank, Low Tier, Zag Crew, Loop Reset GUs + new Loop Mods/Boons.",
  Innovation: "Q1: Studies per Study · Q2: Cells/MP/Shards/RP/AP · Q3: Materials, Bonus Blueprints, Bonus Innovation Cores.",
  Attraction: "Q1: Borge Loot · Q2: Ozzy Loot · Q3: Catch-Up Power Borge/Ozzy · Q4: Knox Loot, Knox Catch-Up, Ship Evolution + Eternal Milestone Bonus 5.",
  Creation: "Q1: Mech Cap · Q2: Hardware/Software · Q3: Cells/MP/Shards/RP · Q4: F-Trinket Tier + Borge/Ozzy/Knox Stats + 3 Mechs/4 Trinkets.",
  Power: "Q1 installs Power gem upgrades incl. ship-rank bonuses, Blueprints and Innovation Cores. Q2 unlocks 12 Construction Milestones.",
  Evolution: "Q1: All Gens Output, LP Bonus, MK9 Core Stability, MK9 Core Resonance + MK9 Generator. No cross-gem gate attested in SirRed v0.018.",
};

/**
 * One-time Gem Node purchases (wiki costs). Available after Exodus Q3.
 * `cost: null` = free / gated (see `note`).
 */
export const GEM_NODES = {
  Exodus: [
    { id: 1, cost: 100e12, effect: "+0.2% Borge Loot per Evolution & Temporal GU; +1 Max Meltdown / 20 manual MK9; uncap final Evolution crews" },
    { id: 2, cost: 1e15, effect: "×1.035 mats per Temporal & Innovation GU; +1% All Fragments / 10k Loop Mods; alters Ship Evolution bonuses" },
    { id: 3, cost: 10e15, effect: "+0.3% Ozzy Loot per Innovation & Power GU; +1 tier-1 relic max / 250k Ultima Research (cap 5); retain Ship Evolutions through TR" },
    { id: 4, cost: 100e15, effect: "/30 m0 cost per Power & Attraction GU; +0.01s hunter AS / 3 CMs (cap 0.25s); retain Ship Crewmates through LR" },
    { id: 5, cost: 10e18, effect: "/30 m0 cost per Attraction & Creation GU; Ozzy boss kill ×1.2 mech cap (cap 1e200); retain Ship Ranks through LR" },
    { id: 6, cost: 1e21, effect: "+0.2% Catch-Up Timer Cap per Creation & Evolution GU (cap 40%); /1e3 MK9 manual cost per Mech; retain Ship Installs through LR" },
  ],
  Temporality: [
    { id: 1, cost: 1, effect: "Start each TR with 1e100 MP, 100 free Loops Filled / LR, and 100 free Loop Resets (bonus scaling only)" },
    { id: 2, cost: 9e3, effect: "+3% Shards / +2% RP / +1% AP per Loop Reset done this TR (multiplicative)" },
    { id: 3, cost: 7e6, effect: "+5% All Gens Output / +0.5% Academy Mission Materials per Loop Reset this TR" },
    { id: 4, cost: null, note: "Free with Exodus Q5", effect: "~23% Borge Loot · 300 free Loops Filled · 400 free LRs" },
    { id: 5, cost: 1e18, effect: "×4 MP per Zag Rank · ×1.1 MP per Zag Install · 10 free Zag Ranks · OO ×1.1" },
    { id: 6, cost: 100e21, effect: "Borge/Ozzy/Knox ATK, Max HP & Loot +3% · OO ×1.15 · ×1.00066 MP & AP per 4 ticks (cap e250)" },
  ],
  Innovation: [
    { id: 1, cost: 7e3, effect: "Koios rank progress ×1.5 · start TR with early researches (≤20) · Research Bulk Buy" },
    { id: 2, cost: 3e6, effect: "RP ×1e25 · Ozzy +25% HP regen" },
    { id: 3, cost: 12e3, effect: "Borge +3% ATK & effect chance · Ozzy +3% ATK & multistrike chance" },
    { id: 4, cost: 700e12, effect: "×1.02 Cells/All Gens/MP/Shards/RP/AP/Mats per Koios Rank · OO ×1.1 · 10 free Koios Ranks" },
    { id: 5, cost: 100e18, effect: "×1.02 mats / Research Level · ×1.15 mats / completed research · ×1.3 hunter Loot" },
    { id: 6, cost: 10e21, effect: "×1.00002 Cells, MP, AP per 10 studies" },
  ],
  Attraction: [
    { id: 1, cost: 500e3, effect: "Campaign Fragments ×1.5 · +10% Shards per Demeter Crew" },
    { id: 2, cost: 200e3, effect: "Esoteric Exchange costs /1e10 · Borge +50% EXP & Lucky Looter max +2" },
    { id: 3, cost: 60e3, effect: "+0.1% Cells/All Gens/RP/Shards per Operation Retained (cap e333) · Borge & Ozzy Loot +25%" },
    { id: 4, cost: 110e12, effect: "Campaign & Farm Fragments ×1.25 · Shard Milestone 0 third bonus → ×2 / level" },
    { id: 5, cost: 100e18, effect: "×1.75 Shards per Demeter Rank · Operations ×3 toward Demeter ranks · 10 free Demeter Ranks" },
    { id: 6, cost: 1e24, effect: "Attraction Node #3 Operation Retention cap raised to 1e555" },
  ],
  Creation: [
    { id: 1, cost: 800e3, effect: "All Mech Mission Timers −30 min · Borge Max HP +20%" },
    { id: 2, cost: 500e6, effect: "Cradle MK1/MK2 bonus cap ×1e1000 · Borge stats +2% · retain Claimed Reward Lanes on TR" },
    { id: 3, cost: 33e3, effect: "+1% AP & Mats per Mech · Borge level-ups from Lv40: +1.5% Max HP / +1% ATK / +0.5% Regen" },
    { id: 4, cost: 17e15, effect: "×1.01 Cells / Tech Upgrade · Knox HP & Regen +8% · hunters +3% secondary DR · ×1.015 Mats / Mech" },
    { id: 5, cost: 3e21, effect: "Mech Cap ×1e50 · +0.1% All Frags / Mech · hunters Max HP +0.1% / Galvarium Trinket Lv (cap 2×)" },
    { id: 6, cost: 10e21, effect: "+1% daily Tokens / Mech · Ozzy level bonuses from Lv70 · ×1.005 daily MP / Farahyte Trinket Lv" },
  ],
  Power: [
    { id: 1, cost: 750e6, effect: "+50 Innovation Cores & +500 Mining Pods / TR · Mining Pods +1 Mission Power · Relic 5/6 max +3" },
    { id: 2, cost: 3e9, effect: "+160 Blueprints & +300 Fireteam Carriers / TR · FTC +2 Mission Power · Campaign Fragments ×2" },
    { id: 3, cost: 10e9, effect: "Projects 200% faster · project cost /100 · Storage Facility +1× · Farm Fragments +0.012" },
    { id: 4, cost: 20e15, effect: "+50 Innovation Cores · +150 Titan Haulers · Titan Haulers +3 Mission Power · Farm Fragments ×2" },
    { id: 5, cost: 4e21, effect: "+180 Blueprints · +100 Combat Corvettes · Corvettes +4 Mission Power · +3 Cores / Innovation-Core campaign" },
    { id: 6, cost: 100e21, effect: "Tech Samples/Fuel/Data bonus ×1.11 · Tokenium ×1.25 value & ×3 cap · Storage/Transfer wire bonuses · Knox level bonuses from Lv30" },
  ],
  Evolution: [
    { id: 1, cost: null, note: "Free", effect: "OO Catch-Up Cap ×4 · OO Catch-Up Speed ×1.66" },
    { id: 2, cost: 115e12, effect: "Player Levels +1 LP · spend LP on RP (doubles every 80) · hunter Loot +10%" },
    { id: 3, cost: 400e12, effect: "×1e10 Cells / manual MK9 · +0.025 Meltdown Power · hunter Max HP & Regen +7.77%" },
    { id: 4, cost: 1.15e15, effect: "OO Catch-Up Cap ×8 · OO Catch-Up Speed ×1.33" },
    { id: 5, cost: 1e18, effect: "+1 LP / Cradle Rank · LP Cell/MP/Shard doubler every 9 LP · LP RP doubler every 70 LP" },
    { id: 6, cost: 1e24, effect: "×1e2000 Cells · +0.040 Meltdown Power · +2% Borge Crit / Ozzy Multistrike / Knox Charge" },
  ],
};

/** Exodus quality that unlocks the Gem Node purchase board. */
export const GEM_NODES_UNLOCK_EXODUS_Q = 3;

/**
 * GU cost models: cost(level) = base * multi^(level-1)
 * (SirRed early-level formulas; high-level extra scaling not modelled.)
 */
/** stacking: "multi" | "additive" — how levels stack (from wiki-aligned effect wording). */
export const GU_DEFS = {
  Exodus: [
    { id: "cells", name: "Cells Multi Bonus", fromQ: 1, max: 999, base: 1, multi: 1.2, stacking: "multi", effect: "×4 Cells per GU level" },
    { id: "shards", name: "Shards Multi Bonus", fromQ: 2, max: 999, base: 2, multi: 1.8, stacking: "multi", effect: "×5 Shards per GU level" },
    { id: "rp", name: "RP Bonus", fromQ: 3, max: 999, base: 500, multi: 1.9, stacking: "multi", effect: "×8 RP per GU level" },
    { id: "mp", name: "MP Bonus", fromQ: 4, max: 999, base: 1e4, multi: 2, stacking: "multi", effect: "×4 Mod Points per GU level" },
    { id: "ap", name: "AP Bonus", fromQ: 4, max: 999, base: 1e6, multi: 2.1, stacking: "multi", effect: "×1.6 Academy Points per GU level" },
  ],
  Temporality: [
    { id: "mp_loop", name: "MP (Loop Mods) Bonus", fromQ: 1, max: 50, base: 1.5, multi: 1.5, stacking: "additive", effect: "+1% MP per GU level per Loop Mod" },
    { id: "mp_ticks", name: "MP (Ticks) Bonus", fromQ: 2, max: 50, base: 1.5, multi: 4, stacking: "additive", effect: "+0.05% MP per GU level per Tick" },
  ],
  Innovation: [
    { id: "studies", name: "Studies / Study Bonus", fromQ: 1, max: 50, base: 3, multi: 2, stacking: "additive", effect: "+2 Studies per Study per GU level" },
  ],
  Attraction: [
    { id: "borge_loot", name: "Borge Loot", fromQ: 1, max: 999, base: 5, multi: 2.5, stacking: "multi", effect: "×1.07 Borge Loot per GU level" },
    { id: "ozzy_loot", name: "Ozzy Loot", fromQ: 2, max: 999, base: 20, multi: 2.5, stacking: "multi", effect: "×1.04 Ozzy Loot per GU level" },
    { id: "catchup", name: "Catch-Up Power (Borge/Ozzy)", fromQ: 3, max: 5, base: 1, multi: 100, stacking: "multi", effect: "×1.08 ATK Power & Speed per level (until Frogbloth/Benchy)" },
  ],
  Creation: [
    { id: "mech_cap", name: "Mechs Bonus Cap", fromQ: 1, max: 999, base: 1, multi: 10, stacking: "multi", effect: "×1e8 Mech bonus cap per GU level" },
    { id: "hardware", name: "Hardware Bonus", fromQ: 2, max: 999, base: 1e3, multi: 3, stacking: "multi", effect: "×10 Hardware tech output per GU level" },
    { id: "software", name: "Software Bonus", fromQ: 2, max: 999, base: 1e4, multi: 4, stacking: "multi", effect: "×50 Software tech output per GU level" },
  ],
  Power: [
    { id: "blueprints", name: "Blueprints", fromQ: 1, max: 999, base: 1, multi: 10, stacking: "additive", effect: "+8 Blueprints at start of each Traversal per level" },
    { id: "cores", name: "Innovation Cores", fromQ: 1, max: 999, base: 1, multi: 10, stacking: "additive", effect: "+4 Innovation Cores at start of each Traversal per level" },
  ],
  Evolution: [],
};

/** Early unlock chain nodes for the map (Planner v0.018). */
export const UNLOCK_MAP = [
  {
    row: [
      { gem: "Exodus", title: "Exodus Q1", q: "Q1", cost: 1, desc: "Start of the Ouroboros gem progression.", req: "None" },
      { gem: "Exodus", title: "Cells GU Lv.1", q: "Cells Lv.1", cost: 1, gate: true, gateNote: "before Exodus Q2", desc: "Mandatory planner gate. Effect: ×4 Cells per GU level.", req: "Exodus Q1" },
      { gem: "Exodus", title: "Exodus Q2", q: "Q2", cost: 5, desc: "Unlocks Shard Bonus GU.", req: "Exodus Q1 + Cells GU Lv.1" },
      { gem: "Temporality", title: "Temporality Q1", q: "Q1", cost: 5, gateNote: "Gate: Exodus Q2", desc: "Unlocks MP Bonus (Loop Mods).", req: "Exodus Q2" },
    ],
  },
  {
    row: [
      { gem: "Innovation", title: "Innovation Q1", q: "Q1", cost: 12, gateNote: "Gate: Temp Q1", desc: "Unlocks Studies per Study: +2 Studies per GU level.", req: "Temporality Q1" },
      { gem: "Temporality", title: "Temporality Q2", q: "Q2", cost: 18, gateNote: "Gate: Inno Q1", desc: "Unlocks MP Bonus (Ticks).", req: "Innovation Q1" },
      { gem: "Attraction", title: "Attraction Q1", q: "Q1", cost: 30, gateNote: "Gate: Temp Q2", desc: "Unlocks Borge Loot GU: ×1.07 Borge Loot per level.", req: "Temporality Q2" },
      { gem: "Attraction", title: "Attraction Q2", q: "Q2", cost: 150, desc: "Unlocks Ozzy Loot GU: ×1.04 Ozzy Loot per level.", req: "Attraction Q1" },
    ],
  },
  {
    row: [
      { gem: "Creation", title: "Creation Q1", q: "Q1", cost: 555, gateNote: "Gate: Att Q2", desc: "Unlocks Mechs Bonus Cap GU: ×1e8 Mech bonus cap per level.", req: "Attraction Q2" },
      { gem: "Attraction", title: "Attraction Q3", q: "Q3", cost: 1e3, gateNote: "Gate: Creation Q1", desc: "Unlocks Borge/Ozzy Catch-Up Power: ×1.08 ATK Power & Speed per level.", req: "Creation Q1" },
      { gem: "Exodus", title: "Exodus Q3", q: "Q3", cost: 5e3, gateNote: "Gate: Att Q3", desc: "Unlocks RP Bonus GU (×8 RP / level) and the Gem Node purchase board for all gems.", req: "Attraction Q3" },
    ],
  },
];

export const UNLOCK_FORK = [
  { gem: "Creation", title: "Creation Q2", q: "Q2", cost: 2e5, branch: true, gateNote: "Gate: Exodus Q3", desc: "Unlocks Hardware ×10 and Software ×50 per GU level.", req: "Exodus Q3" },
  { gem: "Power", title: "Power Q1", q: "Q1", cost: 150e6, branch: true, gateNote: "Gate: Exodus Q3", desc: "Unlocks ship-rank bonuses plus +8 Blueprints / +4 Innovation Cores per GU level.", req: "Exodus Q3" },
];

/**
 * Ordered quality unlocks with prerequisites (for "next quality" detection).
 * `guGate` = mandatory GU that must be owned (id under gem).
 */
export const QUALITY_CHAIN = [
  { gem: "Exodus", quality: 1, cost: 1, req: null },
  { gem: "Exodus", quality: 2, cost: 5, req: { gem: "Exodus", quality: 1 }, guGate: { gem: "Exodus", id: "cells", level: 1 } },
  { gem: "Temporality", quality: 1, cost: 5, req: { gem: "Exodus", quality: 2 } },
  { gem: "Innovation", quality: 1, cost: 12, req: { gem: "Temporality", quality: 1 } },
  { gem: "Temporality", quality: 2, cost: 18, req: { gem: "Innovation", quality: 1 } },
  { gem: "Attraction", quality: 1, cost: 30, req: { gem: "Temporality", quality: 2 }, unlocksGu: { gem: "Attraction", id: "borge_loot" } },
  { gem: "Attraction", quality: 2, cost: 150, req: { gem: "Attraction", quality: 1 }, unlocksGu: { gem: "Attraction", id: "ozzy_loot" } },
  { gem: "Creation", quality: 1, cost: 555, req: { gem: "Attraction", quality: 2 }, unlocksGu: { gem: "Creation", id: "mech_cap" } },
  { gem: "Attraction", quality: 3, cost: 1e3, req: { gem: "Creation", quality: 1 }, unlocksGu: { gem: "Attraction", id: "catchup" } },
  { gem: "Exodus", quality: 3, cost: 5e3, req: { gem: "Attraction", quality: 3 } },
  { gem: "Creation", quality: 2, cost: 2e5, req: { gem: "Exodus", quality: 3 } },
  { gem: "Power", quality: 1, cost: 150e6, req: { gem: "Exodus", quality: 3 } },
];

/** Default personal progress (matches gem-progression/current_state.json). */
export function defaultProgress() {
  return {
    qualities: {
      Exodus: 2,
      Temporality: 2,
      Innovation: 1,
      Attraction: 0,
      Creation: 0,
      Power: 0,
      Evolution: 0,
    },
    upgrades: {
      Exodus: { cells: 2, shards: 1, rp: 0, mp: 0, ap: 0 },
      Temporality: { mp_loop: 1, mp_ticks: 1 },
      Innovation: { studies: 0 },
      Attraction: { borge_loot: 0, ozzy_loot: 0, catchup: 0 },
      Creation: { mech_cap: 0, hardware: 0, software: 0 },
      Power: { blueprints: 0, cores: 0 },
      Evolution: {},
    },
    /** Owned one-time gem nodes: gem → { [nodeId]: true }. */
    nodes: Object.fromEntries(GEM_ORDER.map((gem) => [gem, {}])),
  };
}

export const STORAGE_KEY = "cifi_gem_progress_v1";
export const PLAN_STORAGE_KEY = "cifi_gem_plan_v1";
