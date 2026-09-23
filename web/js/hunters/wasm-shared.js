/** Shared WASM helpers. */

export async function loadWasmExports(wasmUrl = "./wasm/release.wasm") {
  const imports = {
    env: {
      abort(_msg, _file, line, col) {
        throw new Error(`WASM abort at ${line}:${col}`);
      },
    },
  };
  let result;
  try {
    result = await WebAssembly.instantiateStreaming(fetch(wasmUrl), imports);
  } catch {
    const buf = await fetch(wasmUrl).then((r) => {
      if (!r.ok) throw new Error(`Failed to load WASM: ${r.status}`);
      return r.arrayBuffer();
    });
    result = await WebAssembly.instantiate(buf, imports);
  }
  return result.instance.exports;
}

export function valuesToArgs(params, values, floatIndices) {
  return params.map((key, i) => {
    const raw = values[key] ?? 0;
    return floatIndices.has(i) ? Number(raw) : Math.trunc(Number(raw));
  });
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function oddsFromCounts(counts) {
  const n = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!n) return {};
  const stages = Object.keys(counts).map(Number);
  const lo = Math.min(...stages);
  const hi = Math.max(...stages);
  const odds = {};
  for (let s = lo; s <= hi; s++) {
    let cum = 0;
    for (const [stage, c] of Object.entries(counts)) {
      if (Number(stage) >= s) cum += c;
    }
    odds[s] = cum / n;
  }
  return odds;
}

export function wasmToSimResult(wasmRes, repetitions) {
  const counts = Object.fromEntries(
    Object.entries(wasmRes.stageCounts).map(([k, v]) => [Number(k), Number(v)]),
  );
  const n = Object.values(counts).reduce((a, b) => a + b, 0) || repetitions;
  const avgTime = Number(wasmRes.avgTime);
  const lootPerMin = Number(wasmRes.lootPerMin);
  const lootScore = Math.round(lootPerMin * 10) / 10;
  const runsPerDay = avgTime > 0 ? 86400 / avgTime : 0;
  const odds = oddsFromCounts(counts);

  return {
    n,
    avgStage: wasmRes.avgStage,
    minStage: wasmRes.minStage,
    maxStage: wasmRes.maxStage,
    stageCounts: counts,
    stageOdds: odds,
    avgTimeS: avgTime,
    runsPerDay,
    lootScore,
    firstRevive: wasmRes.firstRevive,
    secondRevive: wasmRes.secondRevive,
    bossKillRate: wasmRes.bossKillRate,
    buildStats: wasmRes.buildStats,
    mats: { mat1: wasmRes.mat1, mat2: wasmRes.mat2, mat3: wasmRes.mat3 },
    xp: wasmRes.xp,
    engine: "wasm",
  };
}

export function collectProgress(ex, sizeFn, stageFn, countFn) {
  const stageCounts = {};
  const nprog = Number(ex[sizeFn]());
  for (let i = 0; i < nprog; i++) {
    const stageF = Number(ex[stageFn](i));
    const count = Number(ex[countFn](i));
    const key = Math.round(stageF);
    stageCounts[key] = (stageCounts[key] || 0) + count;
  }
  return Object.fromEntries(Object.entries(stageCounts).sort((a, b) => Number(a[0]) - Number(b[0])));
}

export function collectDeaths(ex, sizeFn, keyFn, countFn) {
  const firstRevive = {};
  const secondRevive = {};
  const ndeath = Number(ex[sizeFn]());
  for (let i = 0; i < ndeath; i++) {
    const key = Number(ex[keyFn](i));
    const count = Number(ex[countFn](i));
    const stage = Math.trunc(key / 1000);
    const reviveI = key % 1000;
    if (reviveI === 1) firstRevive[stage] = (firstRevive[stage] || 0) + count;
    else if (reviveI === 2) secondRevive[stage] = (secondRevive[stage] || 0) + count;
  }
  return { firstRevive, secondRevive };
}
