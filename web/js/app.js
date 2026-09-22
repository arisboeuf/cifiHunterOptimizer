import {
  ATTRIBUTE_COSTS,
  ATTRIBUTE_LABELS,
  ATTR_ORDER,
  GEM_KEYS,
  INSC_ORDER,
  INSCRIPTION_COSTS,
  INSCRIPTION_META,
  RELIC_KEYS,
  STAT_LABELS,
  STAT_MAX,
  STAT_ORDER,
  TALENT_COSTS,
  TALENT_LABELS,
  TALENT_ORDER,
} from "./costs.js";
import {
  attributeTreeEntries,
  attributeUnlockState,
  zeroOrphanDependents,
} from "./attr-rules.js";
import { defaultBuild, downloadJson, formatDuration, validateBudgets } from "./build.js";
import { optimizeBuild } from "./optimize.js";
import { WasmBorgeEngine, wasmToSimResult } from "./wasm-engine.js";
import { drawBarChart, drawEmpty, drawOddsChart, drawReviveChart } from "./charts.js";

const STORAGE_KEY = "borge_sim_web_state_v1";

const state = {
  build: defaultBuild(),
  engine: null,
  running: false,
  optimizing: false,
  optCancel: false,
  lastResult: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function spinRow(parent, { key, label, hint, value, max, onChange, depth = 0, locked = false }) {
  const row = document.createElement("div");
  row.className = "spin";
  if (depth > 0) row.classList.add("spin-nested");
  if (locked) row.classList.add("spin-locked");
  row.dataset.key = key;
  row.style.setProperty("--spin-depth", String(depth));
  const hi = max === Infinity ? 9999 : Number(max);
  row.innerHTML = `
    <div class="label">${label}${hint ? `<span class="hint">${hint}</span>` : ""}</div>
    <div class="spin-controls">
      <button type="button" class="btn btn-sm" data-act="-" ${locked ? "disabled" : ""}>−</button>
      <input type="number" min="0" max="${hi}" value="${value}" ${locked ? "disabled" : ""} />
      <button type="button" class="btn btn-sm" data-act="+" ${locked ? "disabled" : ""}>+</button>
    </div>
    <div class="spin-max">
      ${hi < 9999 ? `<button type="button" class="btn btn-primary btn-sm" data-act="max" ${locked ? "disabled" : ""}>Max</button>` : ""}
    </div>`;
  const input = row.querySelector("input");
  const setVal = (v) => {
    if (locked) return;
    const n = Math.max(0, Math.min(hi, Number(v) || 0));
    input.value = String(n);
    onChange(n);
  };
  row.querySelector('[data-act="-"]').addEventListener("click", () => setVal(Number(input.value) - 1));
  row.querySelector('[data-act="+"]').addEventListener("click", () => setVal(Number(input.value) + 1));
  const maxBtn = row.querySelector('[data-act="max"]');
  if (maxBtn) maxBtn.addEventListener("click", () => setVal(hi));
  input.addEventListener("change", () => setVal(input.value));
  parent.appendChild(row);
  return { setVal, input };
}

function buildLeftLists() {
  const statsList = $("#statsList");
  const inscList = $("#inscList");
  const miscList = $("#miscList");
  const talentList = $("#talentList");
  statsList.innerHTML = "";
  inscList.innerHTML = "";
  miscList.innerHTML = "";
  talentList.innerHTML = "";

  for (const k of STAT_ORDER) {
    const mx = STAT_MAX[k];
    const capped = ["damage_reduction", "evade_chance", "effect_chance", "special_chance", "special_damage", "speed"].includes(k);
    spinRow(statsList, {
      key: `stat.${k}`,
      label: capped ? `${STAT_LABELS[k]}  /${mx}` : STAT_LABELS[k],
      value: state.build.stats[k] ?? 0,
      max: mx,
      onChange: (n) => {
        state.build.stats[k] = n;
        onBuildChanged();
      },
    });
  }

  for (const k of INSC_ORDER) {
    const meta = INSCRIPTION_META[k];
    const mx = INSCRIPTION_COSTS[k].max;
    spinRow(inscList, {
      key: `insc.${k}`,
      label: `${meta.title}  ·  ${meta.effect}`,
      hint: `/${mx}`,
      value: state.build.inscryptions[k] ?? 0,
      max: mx,
      onChange: (n) => {
        state.build.inscryptions[k] = n;
        onBuildChanged();
      },
    });
  }

  for (const k of RELIC_KEYS) {
    spinRow(miscList, {
      key: `relic.${k}`,
      label: k,
      value: state.build.relics[k] ?? 0,
      max: 20,
      onChange: (n) => {
        state.build.relics[k] = n;
        onBuildChanged();
      },
    });
  }
  for (const k of GEM_KEYS) {
    spinRow(miscList, {
      key: `gem.${k}`,
      label: k,
      value: state.build.gems[k] ?? 0,
      max: 20,
      onChange: (n) => {
        state.build.gems[k] = n;
        onBuildChanged();
      },
    });
  }

  for (const k of TALENT_ORDER) {
    spinRow(talentList, {
      key: `tal.${k}`,
      label: TALENT_LABELS[k],
      hint: `max ${TALENT_COSTS[k].max}`,
      value: state.build.talents[k] ?? 0,
      max: TALENT_COSTS[k].max,
      onChange: (n) => {
        state.build.talents[k] = n;
        onBuildChanged();
      },
    });
  }

  buildAttrList();

  $("#trample").checked = !!state.build.mods?.trample;
  $("#buildName").value = state.build.build_name || "";
  $("#level").value = String(state.build.meta?.level ?? 0);
}

function buildAttrList() {
  const attrList = $("#attrList");
  if (!attrList) return;
  attrList.innerHTML = "";
  state.build.attributes = zeroOrphanDependents(state.build.attributes || {});
  const attrs = state.build.attributes;

  for (const { key: k, depth } of attributeTreeEntries(ATTR_ORDER)) {
    const cost = ATTRIBUTE_COSTS[k];
    if (!cost) continue;
    const unlock = attributeUnlockState(attrs, k);
    const hints = [`cost ${cost.cost} · max ${cost.max === Infinity ? "∞" : cost.max}`];
    if (unlock.locked && unlock.reason) hints.push(unlock.reason);
    spinRow(attrList, {
      key: `attr.${k}`,
      label: ATTRIBUTE_LABELS[k],
      hint: hints.join(" · "),
      value: attrs[k] ?? 0,
      max: cost.max,
      depth,
      locked: unlock.locked,
      onChange: (n) => {
        state.build.attributes[k] = n;
        state.build.attributes = zeroOrphanDependents(state.build.attributes);
        buildAttrList();
        onBuildChanged();
      },
    });
  }
}

function syncMetaFromInputs() {
  state.build.build_name = $("#buildName").value.trim() || "Build";
  state.build.meta = state.build.meta || {};
  state.build.meta.hunter = "Borge";
  state.build.meta.level = Math.max(0, Number($("#level").value) || 0);
  state.build.mods = { trample: $("#trample").checked };
}

function onBuildChanged() {
  syncMetaFromInputs();
  refreshBudget();
  saveState();
}

function refreshBudget() {
  syncMetaFromInputs();
  const v = validateBudgets(state.build);
  state.build = { ...state.build, ...v.config, build_name: state.build.build_name };
  const el = $("#budget");
  el.textContent = v.msg;
  el.classList.toggle("ok", v.ok);
  el.classList.toggle("bad", !v.ok);
  return v;
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ config: state.build, reps: Number($("#reps").value) || 6000 }),
    );
  } catch {
    /* ignore quota */
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data?.config && typeof data.config === "object") {
      state.build = { ...defaultBuild(), ...data.config };
      if (data.reps) $("#reps").value = String(data.reps);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function setupTabs() {
  $$("#leftPanel .tab[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#leftPanel .tab[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      $$("#leftPanel .tab-panel").forEach((p) => {
        p.hidden = p.dataset.panel !== btn.dataset.tab;
      });
    });
  });

  $$('.tab[data-rtab]').forEach((btn) => {
    btn.addEventListener("click", () => {
      $$('.tab[data-rtab]').forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      $$("[data-rpanel]").forEach((p) => {
        p.hidden = p.dataset.rpanel !== btn.dataset.rtab;
      });
      redrawCharts();
    });
  });

  $$('.tab[data-mtab]').forEach((btn) => {
    btn.addEventListener("click", () => {
      $$('.tab[data-mtab]').forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      $$("[data-mpanel]").forEach((p) => {
        p.hidden = p.dataset.mpanel !== btn.dataset.mtab;
      });
    });
  });
}

function renderBuildStats(stats) {
  const grid = $("#buildStatsGrid");
  const items = [
    ["max_hp", "MAX HP", (v) => String(v)],
    ["atk_power", "ATK Power", (v) => String(v)],
    ["hp_regen", "HP Regen", (v) => `${v} /s`],
    ["dmg_reduction", "DMG Reduction", (v) => `${v} %`],
    ["evade_chance", "Evade Chance", (v) => `${v} %`],
    ["effect_chance", "Effect Chance", (v) => `${v} %`],
    ["crit_chance", "Crit Chance", (v) => `${v} %`],
    ["crit_power", "Crit Power", (v) => `${v} x`],
    ["atk_speed", "ATK Speed", (v) => `${v} s`],
  ];
  grid.innerHTML = items
    .map(
      ([key, title, fmt]) => `
      <div class="stat-card">
        <div class="k">${title}</div>
        <div class="v">${stats ? fmt(stats[key] ?? "—") : "—"}</div>
      </div>`,
    )
    .join("");
}

function showResult(res) {
  state.lastResult = res;
  $("#mLoot").textContent = String(res.lootScore);
  $("#mStage").textContent = `${res.avgStage.toFixed(1)}  (${res.minStage.toFixed(0)}–${res.maxStage.toFixed(0)})`;
  $("#mTime").textContent = `${formatDuration(res.avgTimeS)}  (${res.runsPerDay.toFixed(1)})`;
  $("#mBoss").textContent = `${(res.bossKillRate * 100).toFixed(1)}%`;
  $("#sMin").textContent = res.minStage.toFixed(1);
  $("#sAvg").textContent = res.avgStage.toFixed(1);
  $("#sMax").textContent = res.maxStage.toFixed(1);
  renderBuildStats(res.buildStats);
  redrawCharts();
  $("#status").textContent = `Done — ${res.n} runs (${res.engine})`;
  $("#progressBar").style.width = "100%";
}

function redrawCharts() {
  const res = state.lastResult;
  if (!res) {
    drawEmpty($("#chartDist"));
    drawEmpty($("#chartOdds"));
    drawEmpty($("#chartRev"));
    return;
  }
  drawBarChart($("#chartDist"), res.stageCounts);
  drawOddsChart($("#chartOdds"), res.stageOdds);
  drawReviveChart($("#chartRev"), res.firstRevive, res.secondRevive);
}

async function runSim() {
  if (!state.engine || state.running || state.optimizing) return;
  const v = refreshBudget();
  if (!v.ok) {
    $("#status").textContent = `Invalid build: ${v.msg}`;
    return;
  }
  const n = Math.max(1, Number($("#reps").value) || 1);
  state.running = true;
  $("#btnRun").disabled = true;
  $("#progressBar").style.width = "15%";
  $("#status").textContent = `Running ${n} sims (wasm)…`;
  saveState();

  try {
    // Yield so UI updates before heavy WASM call
    await new Promise((r) => setTimeout(r, 30));
    $("#progressBar").style.width = "55%";
    const wasmRes = state.engine.evaluate(v.config, n);
    const res = wasmToSimResult(wasmRes, n);
    showResult(res);
  } catch (err) {
    console.error(err);
    $("#status").textContent = `Sim error: ${err.message || err}`;
    $("#progressBar").style.width = "0%";
  } finally {
    state.running = false;
    $("#btnRun").disabled = false;
  }
}

function exportBuild() {
  syncMetaFromInputs();
  const name = (state.build.build_name || "borge_build").replace(/[^\w.-]+/g, "_");
  downloadJson(`${name}.json`, state.build);
}

async function importBuild(file) {
  const text = await file.text();
  let data;
  if (/\.ya?ml$/i.test(file.name)) {
    // Minimal YAML subset via dynamic import of js-yaml CDN if available; else try JSON
    try {
      const mod = await import("https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm");
      data = mod.load(text);
    } catch {
      throw new Error("YAML import failed (network/CDN). Export/import JSON instead.");
    }
  } else {
    data = JSON.parse(text);
  }
  if (!data || typeof data !== "object") throw new Error("Invalid build file");
  state.build = { ...defaultBuild(), ...data };
  buildLeftLists();
  refreshBudget();
  saveState();
  $("#status").textContent = `Imported ${file.name}`;
}

async function init() {
  setupTabs();
  renderBuildStats(null);
  drawEmpty($("#chartDist"));
  drawEmpty($("#chartOdds"));
  drawEmpty($("#chartRev"));

  const restored = loadState();
  buildLeftLists();
  refreshBudget();
  $("#status").textContent = restored ? "Restored last session · loading WASM…" : "Loading WASM…";

  $("#buildName").addEventListener("change", onBuildChanged);
  $("#level").addEventListener("change", onBuildChanged);
  $("#reps").addEventListener("change", saveState);
  $("#trample").addEventListener("change", onBuildChanged);
  $("#btnRun").addEventListener("click", runSim);
  $("#btnExport").addEventListener("click", exportBuild);
  $("#btnImport").addEventListener("click", () => $("#fileImport").click());
  $("#fileImport").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await importBuild(file);
    } catch (err) {
      $("#status").textContent = `Import error: ${err.message || err}`;
    }
  });
  $("#btnInscMax").addEventListener("click", () => {
    for (const k of INSC_ORDER) state.build.inscryptions[k] = INSCRIPTION_COSTS[k].max;
    buildLeftLists();
    onBuildChanged();
  });
  $("#btnInscClear").addEventListener("click", () => {
    for (const k of INSC_ORDER) state.build.inscryptions[k] = 0;
    buildLeftLists();
    onBuildChanged();
  });
  $("#btnTalents").addEventListener("click", () => {
    $("#talentModal").hidden = false;
  });
  $("#btnTalentClose").addEventListener("click", () => {
    if (state.optimizing) return;
    $("#talentModal").hidden = true;
  });
  $("#talentModal").addEventListener("click", (e) => {
    if (e.target === $("#talentModal") && !state.optimizing) $("#talentModal").hidden = true;
  });
  $("#btnOptimize").addEventListener("click", () => runOptimize());
  $("#btnOptCancel").addEventListener("click", () => {
    state.optCancel = true;
    $("#optStatus").textContent = "Abbruch…";
  });
  window.addEventListener("resize", () => redrawCharts());

  try {
    state.engine = await WasmBorgeEngine.load("./wasm/release.wasm");
    $("#status").textContent = restored
      ? "Restored last session · WASM ready"
      : "WASM ready — edit build and Run Simulation";
    $("#btnRun").disabled = false;
    $("#btnOptimize").disabled = false;
  } catch (err) {
    console.error(err);
    $("#status").textContent = `WASM load failed: ${err.message || err}`;
    $("#btnRun").disabled = true;
    $("#btnOptimize").disabled = true;
  }
}

async function runOptimize() {
  if (!state.engine || state.running || state.optimizing) return;
  syncMetaFromInputs();
  const v = refreshBudget();
  if (!v.ok) {
    $("#optStatus").textContent = `Invalid build: ${v.msg}`;
    return;
  }

  state.optimizing = true;
  state.optCancel = false;
  $("#btnOptimize").disabled = true;
  $("#btnOptCancel").hidden = false;
  $("#btnTalentClose").disabled = true;
  $("#optProgressBar").style.width = "0%";

  const nBaseline = Math.max(1, Number($("#reps").value) || 6000);

  try {
    const result = await optimizeBuild(
      state.build,
      state.engine,
      {
        nBaseline,
        forceTimelessMastery5: $("#optForceTimeless").checked,
      },
      {
        isCancelled: () => state.optCancel,
        onProgress: ({ msg, done, total, stage, loot }) => {
          const pct = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
          $("#optProgressBar").style.width = `${pct}%`;
          const extra =
            stage != null
              ? ` · best Ø ${Number(stage).toFixed(1)}${loot != null ? ` · loot ${Number(loot).toFixed(1)}` : ""}`
              : "";
          $("#optStatus").textContent = `${msg}${extra}`;
        },
      },
    );

    if (state.optCancel) {
      $("#optStatus").textContent = "Optimierung abgebrochen.";
      return;
    }

    const baseAvg = result.baselineScore[0].toFixed(1);
    const bestAvg = result.bestScore[0].toFixed(1);
    const baseLoot = result.baselineScore[1].toFixed(1);
    const bestLoot = result.bestScore[1].toFixed(1);

    if (result.improved) {
      state.build = {
        ...state.build,
        talents: { ...result.bestConfig.talents },
        attributes: { ...result.bestConfig.attributes },
      };
      buildLeftLists();
      onBuildChanged();
      if (result.bestEval) showResult(result.bestEval);
      $("#optStatus").textContent =
        `Verbessert · Ø ${bestAvg} (war ${baseAvg}) · loot ${bestLoot} (war ${baseLoot}) · ${result.evals} evals — angewandt`;
      $("#status").textContent = `Optimizer: Ø Stage ${bestAvg} (↑ von ${baseAvg})`;
    } else {
      $("#optStatus").textContent =
        `Keine Verbesserung · Ø ${bestAvg} (Baseline ${baseAvg}) · ${result.evals} evals`;
      $("#status").textContent = `Optimizer: keine Verbesserung (Ø ${baseAvg})`;
    }
    $("#optProgressBar").style.width = "100%";
  } catch (err) {
    console.error(err);
    $("#optStatus").textContent = `Optimizer-Fehler: ${err.message || err}`;
  } finally {
    state.optimizing = false;
    state.optCancel = false;
    $("#btnOptimize").disabled = !state.engine;
    $("#btnOptCancel").hidden = true;
    $("#btnTalentClose").disabled = false;
  }
}

$("#btnRun").disabled = true;
$("#btnOptimize").disabled = true;
init();
