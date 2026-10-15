/**
 * Run cifi-tools release.wasm for a build JSON and print oracle metrics.
 * Optionally merges dumped combat finals into a copy of the build.
 *
 * Usage:
 *   node scripts/wasm_oracle.mjs --hunter borge --build sim/fixtures/borge_lvl14_example.json --n 200
 *   node scripts/wasm_oracle.mjs --hunter ozzy --build sim/fixtures/ozzy_default.json --n 100 --write-combat
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = { hunter: "borge", build: null, n: 100, writeCombat: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--hunter") out.hunter = argv[++i];
    else if (a === "--build") out.build = argv[++i];
    else if (a === "--n") out.n = Number(argv[++i]);
    else if (a === "--write-combat") out.writeCombat = true;
  }
  if (!out.build) {
    console.error("missing --build");
    process.exit(1);
  }
  return out;
}

async function loadEngine(hunter) {
  const modPath =
    hunter === "ozzy"
      ? path.join(ROOT, "web/js/hunters/ozzy/wasm-engine.js")
      : path.join(ROOT, "web/js/hunters/borge/wasm-engine.js");
  const mod = await import(pathToFileURL(modPath).href);
  const wasmPath = path.join(ROOT, "web/wasm/release.wasm");
  const buf = fs.readFileSync(wasmPath);
  const imports = { env: { abort() { throw new Error("abort"); } } };
  const { instance } = await WebAssembly.instantiate(buf, imports);
  const Engine = hunter === "ozzy" ? mod.WasmOzzyEngine : mod.WasmBorgeEngine;
  return { engine: Engine.fromExports(instance.exports), ex: instance.exports, mod };
}

const args = parseArgs(process.argv);
const hunter = args.hunter.toLowerCase();
if (hunter !== "borge" && hunter !== "ozzy") {
  console.error("hunter must be borge or ozzy");
  process.exit(1);
}

const buildPath = path.resolve(args.build);
const build = JSON.parse(fs.readFileSync(buildPath, "utf8"));
const { engine, ex } = await loadEngine(hunter);
const res = engine.evaluate(build, args.n);

const combat =
  hunter === "borge"
    ? {
        max_hp: Number(ex.getLastBorgeMaxHp()),
        atk_power: Number(ex.getLastBorgeAtk()),
        hp_regen: Number(ex.getLastBorgeRegen()),
        dmg_reduction: Number(ex.getLastBorgeDr()),
        evade_chance: Number(ex.getLastBorgeEvade()),
        effect_chance: Number(ex.getLastBorgeEffect()),
        crit_chance: Number(ex.getLastBorgeCritRate()),
        crit_power: Number(ex.getLastBorgeCritPower()),
        atk_interval: Number(ex.getLastBorgeReload()),
      }
    : {
        max_hp: Number(ex.getLastOzzyMaxHp()),
        atk_power: Number(ex.getLastOzzyAtk()),
        hp_regen: Number(ex.getLastOzzyRegen()),
        dmg_reduction: Number(ex.getLastOzzyDr()),
        evade_chance: Number(ex.getLastOzzyEvade()),
        effect_chance: Number(ex.getLastOzzyEffect()),
        crit_chance: Number(ex.getLastOzzyMultistrike()),
        crit_power: Number(ex.getLastOzzyMultistrikePower()),
        atk_interval: Number(ex.getLastOzzyReload()),
      };

const out = {
  source: "cifi-tools release.wasm",
  hunter,
  n: args.n,
  avgStage: res.avgStage,
  avgTimeMin: res.avgTime,
  minStage: res.minStage,
  maxStage: res.maxStage,
  bossHpPercent: res.bossHpPercent,
  bossKillRate: res.bossKillRate,
  lootPerMin: res.lootPerMin,
  stageCounts: res.stageCounts,
  combat,
  wasmBuildTimestamp: Number(ex.getWasmBuildTimestamp()),
};

console.log(JSON.stringify(out, null, 2));

if (args.writeCombat) {
  build.combat = combat;
  const dest = buildPath.replace(/\.json$/i, ".with_combat.json");
  fs.writeFileSync(dest, JSON.stringify(build, null, 2));
  console.error(`wrote combat dump -> ${dest}`);
}
