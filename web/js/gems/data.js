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
  Exodus: "Q1: Cells Bonus · Q2: Shard Bonus · Q3: RP Bonus · Q4: MP + AP Bonus · Q5: Materials + Orbs Bonus; plus new gem upgrades/nodes.",
  Temporality: "Q1: MP (Loop Mods) · Q2: MP (Ticks) · Q3: Zag Rank, Low Tier, Zag Crew, Loop Reset GUs + new Loop Mods/Boons.",
  Innovation: "Q1: Studies per Study · Q2: Cells/MP/Shards/RP/AP · Q3: Materials, Bonus Blueprints, Bonus Innovation Cores.",
  Attraction: "Q1: Borge Loot · Q2: Ozzy Loot · Q3: Catch-Up Power Borge/Ozzy · Q4: Knox Loot, Knox Catch-Up, Ship Evolution + Eternal Milestone Bonus 5.",
  Creation: "Q1: Mech Cap · Q2: Hardware/Software · Q3: Cells/MP/Shards/RP · Q4: F-Trinket Tier + Borge/Ozzy/Knox Stats + 3 Mechs/4 Trinkets.",
  Power: "Q1 installs Power gem upgrades incl. ship-rank bonuses, Blueprints and Innovation Cores. Q2 unlocks 12 Construction Milestones.",
  Evolution: "Q1: All Gens Output, LP Bonus, MK9 Core Stability, MK9 Core Resonance + MK9 Generator. No cross-gem gate attested in SirRed v0.018.",
};

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
      { gem: "Exodus", title: "Exodus Q3", q: "Q3", cost: 5e3, gateNote: "Gate: Att Q3", desc: "Unlocks RP Bonus GU: ×8 RP per GU level.", req: "Attraction Q3" },
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
  };
}

export const STORAGE_KEY = "cifi_gem_progress_v1";
export const PLAN_STORAGE_KEY = "cifi_gem_plan_v1";
