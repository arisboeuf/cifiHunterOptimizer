/**
 * Compare APK extraction enemy_stats formulas with documented cifi-tools / WASM
 * boss table (docs/monster_stats/bosses.csv) and scan release.wasm for boss
 * multiplier constants.
 *
 * Usage: node scripts/compare_wasm_boss_stats.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const RAMPS = {
  borge: [
    [150, 0.006], [200, 0.006], [250, 0.006], [300, 0.006], [310, 0.003],
    [320, 0.003], [330, 0.004], [340, 0.004], [350, 0.005], [360, 0.005],
    [370, 0.006], [380, 0.006], [390, 0.007], [401, 0.005], [411, 0.005],
    [421, 0.005], [431, 0.004], [441, 0.004], [451, 0.004], [461, 0.006],
    [471, 0.006], [481, 0.006], [491, 0.006],
  ],
  ozzy: [
    [150, 0.006], [200, 0.006], [250, 0.006], [300, 0.006], [310, 0.003],
    [320, 0.003], [330, 0.004], [340, 0.004], [350, 0.005], [360, 0.005],
    [370, 0.006], [380, 0.006], [390, 0.007],
  ],
  knox: [
    [50, 0.006], [100, 0.006], [120, 0.01], [130, 0.008], [140, 0.006],
    [150, 0.006], [160, 0.006], [170, 0.006], [180, 0.006], [190, 0.006],
    [200, 0.006], [220, 0.02], [250, 0.006], [300, 0.006], [310, 0.003],
    [320, 0.02], [330, 0.004], [340, 0.004], [350, 0.005], [360, 0.005],
    [370, 0.006], [380, 0.006], [390, 0.007],
  ],
};
const POWER_ANCHOR = { borge: 350, ozzy: 300, knox: 200 };

function stageScaling(hunter, stage) {
  let k = 1;
  for (const [start, slope] of RAMPS[hunter]) {
    if (stage >= start) k += (stage - start + 1) * slope;
  }
  return k * 1.01 ** Math.max(stage - POWER_ANCHOR[hunter], 0);
}

/** Port of docs/.../enemy_stats.py (Android 0.7.3.42 OfflineHunt). */
function enemyStats(hunter, stage) {
  const n = stage - 1;
  const b = stage >= 101 ? Math.floor(n / 100) : 0;
  const k = stageScaling(hunter, stage);
  let hp, atk, regen, evade, crit, power, interval;
  if (hunter === "borge") {
    hp = (13 + 4 * n) * 2.85 ** b * k;
    atk = (3.2 + 0.7 * n) * 2.85 ** b * k;
    regen = 0.08 * Math.max(n, 0) * 1.052 ** b * k;
    evade = stage >= 100 ? 0.004 * (1 + Math.max(b - 1, 0)) : 0;
    crit = Math.min(0.0326 + 0.0004 * n, 0.25);
    power = Math.min(1.22 + 0.008 * n, 2.5);
    interval = Math.max(4.52 - 0.006 * n, 0.5);
  } else if (hunter === "ozzy") {
    hp = (17 + 6 * n) * 2.9 ** b * k;
    atk = (2.1 + 0.75 * n) * 2.7 ** b * k;
    regen = (0.02 + 0.1 * Math.max(n, 0)) * 1.25 ** b * k;
    evade = stage >= 100 ? 0.01 * (1 + Math.max(b - 1, 0)) : 0;
    crit = Math.min(0.1 + 0.0006 * n, 0.25);
    power = Math.min(1.038 + 0.008 * n, 2.5);
    interval = Math.max(3.2 - 0.004 * n, 0.5);
  } else {
    hp = (16 + 9 * n) * 2.85 ** b * k;
    atk = (3.8 + 1.4 * n) * 2.85 ** b * k;
    regen = 0.04 * stage * 1.052 ** b * k;
    evade = stage >= 100 ? 0.01 * (1 + Math.max(b - 1, 0)) : 0;
    crit = Math.min(0.1 + 0.0006 * n, 0.25);
    power = Math.min(1.04 + 0.008 * n, 2.5);
    interval = Math.max(6 - 0.005 * n, 0.5);
  }
  let dr = stage >= 200 ? 0.04 + 0.02 * Math.max(b - 2, 0) : 0;
  let effect = stage >= 300 ? 0.04 + 0.01 * Math.max(b - 3, 0) : 0;
  const boss = stage % 100 === 0;
  if (boss) {
    if (hunter === "borge") {
      hp *= 90;
      atk *= 3.63;
      regen *= 1.92;
      dr += 0.05;
      if (stage >= 300) effect += 0.04;
      crit = Math.min(crit + 0.04, 0.25);
      power = Math.min(power + 0.25, 2.5);
      interval *= 2.42;
    } else if (hunter === "ozzy") {
      hp *= 48;
      atk *= 3;
      regen *= 6;
      dr += 0.05;
      crit = 0.25;
      interval *= 2.45;
      if (stage >= 300) effect += 0.04;
    } else {
      hp *= 12;
      atk *= 4;
      regen *= 2;
      dr += 0.05;
      if (stage >= 300) effect += 0.04;
      crit = Math.min(crit + 0.13, 0.25);
      interval *= 2.85;
    }
  }
  return { hunter, stage, boss, hp, atk, regen, dr, evade, effect, crit, power, interval };
}

function pct(a, b) {
  if (b === 0) return a === 0 ? 0 : Infinity;
  return ((a - b) / b) * 100;
}

function findF64(buf, target, eps = 1e-9) {
  const offs = [];
  for (let i = 0; i + 8 <= buf.length; i++) {
    const v = buf.readDoubleLE(i);
    if (Number.isFinite(v) && Math.abs(v - target) < eps) offs.push(i);
  }
  return offs;
}

const bossesPath = path.join(ROOT, "docs/monster_stats/bosses.csv");
const rows = fs
  .readFileSync(bossesPath, "utf8")
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const p = line.split(",");
    return {
      hunter: p[0].toLowerCase(),
      stage: +p[1],
      name: p[2],
      hp: +p[3],
      power: +p[4],
      regen: +p[5],
      dr: +p[6],
      evade: +p[7],
      crit: +p[8],
      critpow: +p[9],
      speed: +p[10],
      speed2: p[11] ? +p[11] : null,
    };
  });

console.log("extraction (0.7.3.42) vs docs/monster_stats/bosses.csv (WASM / EnemyStatsDebug notes)\n");
for (const row of rows) {
  const e = enemyStats(row.hunter, row.stage);
  const line = [
    `${row.hunter} ${row.stage} (${row.name})`,
    `HP csv=${row.hp} ext=${e.hp.toFixed(2)} (${pct(e.hp, row.hp).toFixed(2)}%)`,
    `ATK csv=${row.power} ext=${e.atk.toFixed(2)} (${pct(e.atk, row.power).toFixed(2)}%)`,
    `REGEN csv=${row.regen} ext=${e.regen.toFixed(2)} (${pct(e.regen, row.regen).toFixed(2)}%)`,
    `IV csv=${row.speed} ext=${e.interval.toFixed(4)}`,
    row.speed2 != null ? `speed2=${row.speed2} (~primary*1.8=${(e.interval * 1.8).toFixed(2)})` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  console.log(line);
}

const wasmPath = path.join(ROOT, "web/wasm/release.wasm");
const buf = fs.readFileSync(wasmPath);
const imports = { env: { abort() { throw new Error("abort"); } } };
const { instance } = await WebAssembly.instantiate(buf, imports);
const ts = instance.exports.getWasmBuildTimestamp();
console.log(`\nWASM build timestamp: ${ts}  size=${buf.length}`);

const constants = [
  ["borge HP×", 90],
  ["borge ATK×", 3.63],
  ["borge regen×", 1.92],
  ["borge interval×", 2.42],
  ["ozzy HP×", 48],
  ["ozzy interval×", 2.45],
  ["knox HP× (WASM table)", 120],
  ["knox HP× (extraction)", 12],
  ["shared band 2.85", 2.85],
  ["secondary ×1.8", 1.8],
  ["harden period 25", 25],
];
console.log("\nBoss-related f64 constants in release.wasm:");
for (const [label, v] of constants) {
  const offs = findF64(buf, v);
  console.log(`  ${label} ${v}: ${offs.length ? `yes @ ${offs.join(",")}` : "NOT FOUND"}`);
}

console.log(`
Notes:
- Borge/Ozzy base boss stats match extraction within rounding; WASM embeds ×90/×48/×3.63/×2.42/×2.45.
- Knox bosses.csv uses EnemyStatsDebug (HP×120, different band bases); extraction OfflineHunt uses HP×12.
- Knox 100 HP ratio csv/ext ≈ 10 (= 120/12). Knox 200 also differs in ATK/regen bands.
- Borge 200 speed2 ≈ primary interval × 1.8 (secondary attack). Ozzy 200 speed2 ≈ 25 (Harden period).
- Combat enrage/furious/abilities are not fully exposed by WASM getters; only getLast*BossHpPercent / KillRate.
`);
