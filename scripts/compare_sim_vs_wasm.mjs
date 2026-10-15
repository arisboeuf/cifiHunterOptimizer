/**
 * Side-by-side: Python offline sim MC vs WASM oracle for one build.
 *
 * Usage:
 *   node scripts/compare_sim_vs_wasm.mjs --hunter borge --build sim/fixtures/borge_lvl14_example.with_combat.json --n 100
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PY =
  process.env.PYTHON ||
  path.join(process.env.LOCALAPPDATA || "", "Programs/Python/Python310/python.exe");

function parseArgs(argv) {
  const out = { hunter: "borge", build: null, n: 100, seed: 1 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--hunter") out.hunter = argv[++i];
    else if (a === "--build") out.build = argv[++i];
    else if (a === "--n") out.n = Number(argv[++i]);
    else if (a === "--seed") out.seed = Number(argv[++i]);
  }
  if (!out.build) {
    console.error("missing --build");
    process.exit(1);
  }
  return out;
}

const args = parseArgs(process.argv);
const build = path.resolve(args.build);

const py = spawnSync(
  PY,
  ["-m", "sim", "mc", "--build", build, "--n", String(args.n), "--seed", String(args.seed)],
  { cwd: ROOT, encoding: "utf8" },
);
if (py.status !== 0) {
  console.error(py.stderr || py.stdout);
  process.exit(py.status || 1);
}
const sim = JSON.parse(py.stdout);

const wasm = spawnSync(
  "node",
  [
    path.join(ROOT, "scripts/wasm_oracle.mjs"),
    "--hunter",
    args.hunter,
    "--build",
    build,
    "--n",
    String(args.n),
  ],
  { cwd: ROOT, encoding: "utf8" },
);
if (wasm.status !== 0) {
  console.error(wasm.stderr || wasm.stdout);
  process.exit(wasm.status || 1);
}
const oracle = JSON.parse(wasm.stdout);

const report = {
  n: args.n,
  build,
  sim: {
    avg_stage: sim.avg_stage,
    min_stage: sim.min_stage,
    max_stage: sim.max_stage,
    boss_kill_rate: sim.boss_kill_rate,
    mean_boss_hp_percent: sim.mean_boss_hp_percent,
    avg_time_seconds: sim.avg_time_seconds,
    engine: sim.engine,
    parity: sim.parity,
  },
  wasm: {
    avgStage: oracle.avgStage,
    minStage: oracle.minStage,
    maxStage: oracle.maxStage,
    bossKillRate: oracle.bossKillRate,
    bossHpPercent: oracle.bossHpPercent,
    avgTimeMin: oracle.avgTimeMin,
  },
  delta_avg_stage: sim.avg_stage - oracle.avgStage,
};
console.log(JSON.stringify(report, null, 2));
