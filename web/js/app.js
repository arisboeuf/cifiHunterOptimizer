import {
  DEFAULT_HUNTER_ID,
  HUNTER_ORDER,
  HUNTERS,
  engineFor,
  getHunter,
  loadSharedWasm,
  storageKeyFor,
} from "./hunters/index.js";
import { downloadJson, formatDuration, validateBudgets } from "./build.js";
import { marginalStatGains, optimizeBuild } from "./optimize.js";
import { drawBarChart, drawEmpty, drawOddsChart, drawReviveChart } from "./charts.js";

const LEGACY_STORAGE_KEYS = ["hunter_sim_web_state_v1", "borge_sim_web_state_v1"];

const state = {
  hunterId: DEFAULT_HUNTER_ID,
  build: null,
  wasmExports: null,
  engine: null,
  running: false,
  optimizing: false,
  nextBestRunning: false,
  nextBestCancel: false,
  optCancel: false,
  lastResult: null,
  statDeltas: null,
  hideMaxed: true,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function hunter() {
  return getHunter(state.hunterId);
}

function isCappedMax(value, hi) {
  return hi < 9999 && Number(value) >= hi;
}

function applyHideMaxed() {
  const hide = !!state.hideMaxed;
  const hideEl = $("#hideMaxed");
  if (hideEl) hideEl.checked = hide;
  for (const listId of ["statsList", "inscList", "miscList"]) {
    $$(`#${listId} .spin[data-can-max='1']`).forEach((row) => {
      const maxed = row.dataset.maxed === "1";
      row.hidden = hide && maxed;
    });
  }
  for (const listId of ["talentList", "attrList"]) {
    $$(`#${listId} .spin`).forEach((row) => {
      row.hidden = false;
    });
  }
}

function setHideMaxed(on) {
  state.hideMaxed = !!on;
  applyHideMaxed();
}

function spinRow(parent, { key, label, hint, tip, value, max, onChange, depth = 0, locked = false, resource = null }) {
  const row = document.createElement("div");
  row.className = "spin";
  if (depth > 0) row.classList.add("spin-nested");
  if (locked) row.classList.add("spin-locked");
  if (resource) row.classList.add(`res-${resource}`);
  row.dataset.key = key;
  row.style.setProperty("--spin-depth", String(depth));
  if (tip) {
    row.dataset.tip = tip;
    row.setAttribute("aria-label", `${label}. ${tip}`);
  }
  const hi = max === Infinity ? 9999 : Number(max);
  const canMax = hi < 9999;
  if (canMax) row.dataset.canMax = "1";
  const markMaxed = (n) => {
    if (!canMax) {
      row.classList.remove("spin-maxed");
      return;
    }
    const maxed = isCappedMax(n, hi);
    row.dataset.maxed = maxed ? "1" : "0";
    row.classList.toggle("spin-maxed", maxed);
    const inLeft =
      parent?.id === "statsList" || parent?.id === "inscList" || parent?.id === "miscList";
    row.hidden = inLeft && state.hideMaxed && maxed;
  };
  markMaxed(value);
  row.innerHTML = `
    <div class="label">${label}${hint ? `<span class="hint">${hint}</span>` : ""}</div>
    <div class="spin-controls">
      <button type="button" class="btn btn-sm" data-act="-" ${locked ? "disabled" : ""}>−</button>
      <input type="number" min="0" max="${hi}" value="${value}" ${locked ? "disabled" : ""} />
      <button type="button" class="btn btn-sm" data-act="+" ${locked ? "disabled" : ""}>+</button>
    </div>
    <div class="spin-max">
      ${canMax ? `<button type="button" class="btn btn-primary btn-sm" data-act="max" ${locked ? "disabled" : ""}>Max</button>` : ""}
    </div>`;
  const input = row.querySelector("input");
  const setVal = (v) => {
    if (locked) return;
    const n = Math.max(0, Math.min(hi, Number(v) || 0));
    input.value = String(n);
    markMaxed(n);
    onChange(n);
  };
  row.querySelector('[data-act="-"]').addEventListener("click", () => setVal(Number(input.value) - 1));
  row.querySelector('[data-act="+"]').addEventListener("click", () => setVal(Number(input.value) + 1));
  const maxBtn = row.querySelector('[data-act="max"]');
  if (maxBtn) maxBtn.addEventListener("click", () => setVal(hi));
  input.addEventListener("change", () => setVal(input.value));
  parent.appendChild(row);
  return { setVal, input, row };
}

/** Combat stats that share an upgrade resource (subtle UI grouping). */
const STAT_RESOURCE = {
  hp: "obsidian",
  power: "obsidian",
  regen: "obsidian",
  damage_reduction: "behlium",
  evade_chance: "behlium",
  block_chance: "behlium",
  effect_chance: "behlium",
  special_chance: "hbm",
  special_damage: "hbm",
  speed: "hbm",
};

const RESOURCE_META = {
  obsidian: { label: "Obsidian", icon: "./img/obsidian.png" },
  behlium: { label: "Behlium", icon: "./img/behlium.png" },
  hbm: { label: "HBM", icon: "./img/hbm.png" },
};

function appendStatResourceHead(parent, resourceId) {
  const meta = RESOURCE_META[resourceId];
  if (!meta) return;
  const head = document.createElement("div");
  head.className = "stat-res-head";
  head.dataset.res = resourceId;
  head.innerHTML = `<img src="${meta.icon}" alt="" width="18" height="18" /><span>${meta.label}</span>`;
  parent.appendChild(head);
}

function clearStatDeltas() {
  state.statDeltas = null;
  $$("#statsList .stat-delta").forEach((el) => el.remove());
}

function fmtDelta(n, digits = 2) {
  const v = Number(n) || 0;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}`;
}

function renderStatDeltas() {
  $$("#statsList .stat-delta").forEach((el) => el.remove());
  const data = state.statDeltas;
  if (!data?.results?.length) return;
  for (const entry of data.results) {
    const row = $(`#statsList .spin[data-key="stat.${entry.key}"]`);
    if (!row) continue;
    const label = row.querySelector(".label");
    if (!label) continue;
    const span = document.createElement("span");
    span.className = "stat-delta";
    if (entry.skipped === "max") {
      span.classList.add("is-skip");
      span.textContent = "max";
      span.title = "Already at cap";
    } else if (entry.significantBenefit) {
      span.textContent = `${fmtDelta(entry.dStage)} Ø`;
      span.title =
        `Significantly better (α=${data.stageTieAlpha ?? 0.05})` +
        ` · Δ Stage ${fmtDelta(entry.dStage)} · Δ Loot ${fmtDelta(entry.dLoot, 1)}`;
      if (entry.key === data.bestKey) span.classList.add("is-best");
    } else {
      span.classList.add("is-skip");
      span.textContent = "(n.s.)";
      span.title =
        `Not significant vs baseline (α=${data.stageTieAlpha ?? 0.05})` +
        ` · Raw Δ Stage ${fmtDelta(entry.dStage)} · Δ Loot ${fmtDelta(entry.dLoot, 1)}` +
        ` — often just sim noise`;
    }
    label.appendChild(span);
  }
}

function onStatValueChange(key, n) {
  state.build.stats[key] = n;
  onBuildChanged();
}

function buildLeftLists() {
  const h = hunter();
  const {
    STAT_ORDER,
    STAT_LABELS,
    STAT_MAX,
    INSC_ORDER,
    INSCRIPTION_META,
    INSCRIPTION_COSTS,
    RELIC_KEYS,
    GEM_KEYS,
    TALENT_ORDER,
    TALENT_LABELS,
    TALENT_TIPS,
    TALENT_COSTS,
    ATTR_ORDER,
    ATTRIBUTE_COSTS,
    ATTRIBUTE_LABELS,
    ATTRIBUTE_TIPS,
  } = h.costs;

  const statsList = $("#statsList");
  const inscList = $("#inscList");
  const miscList = $("#miscList");
  const talentList = $("#talentList");
  statsList.innerHTML = "";
  inscList.innerHTML = "";
  miscList.innerHTML = "";
  talentList.innerHTML = "";

  const cappedStats = [
    "damage_reduction",
    "evade_chance",
    "block_chance",
    "effect_chance",
    "special_chance",
    "special_damage",
    "speed",
    "projectiles",
  ];

  let lastRes = null;
  for (const k of STAT_ORDER) {
    const mx = STAT_MAX[k];
    const capped = cappedStats.includes(k);
    const resource = STAT_RESOURCE[k] || null;
    if (resource && resource !== lastRes) {
      appendStatResourceHead(statsList, resource);
      lastRes = resource;
    } else if (!resource) {
      lastRes = null;
    }
    spinRow(statsList, {
      key: `stat.${k}`,
      label: capped ? `${STAT_LABELS[k]}  /${mx}` : STAT_LABELS[k],
      value: state.build.stats[k] ?? 0,
      max: mx,
      resource,
      onChange: (n) => onStatValueChange(k, n),
    });
  }
  renderStatDeltas();

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
      tip: TALENT_TIPS[k],
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

  const trampleRow = $("#trampleRow");
  if (trampleRow) trampleRow.hidden = !h.showTrample;
  $("#trample").checked = !!state.build.mods?.trample;
  $("#buildName").value = state.build.build_name || "";
  $("#level").value = String(state.build.meta?.level ?? 0);
  applyHideMaxed();
}

function buildAttrList() {
  const h = hunter();
  const { ATTR_ORDER, ATTRIBUTE_COSTS, ATTRIBUTE_LABELS, ATTRIBUTE_TIPS } = h.costs;
  const attrList = $("#attrList");
  if (!attrList) return;
  attrList.innerHTML = "";
  state.build.attributes = h.attrs.zeroOrphanDependents(state.build.attributes || {});
  const attributes = state.build.attributes;

  for (const { key: k, depth } of h.attrs.attributeTreeEntries(ATTR_ORDER)) {
    const cost = ATTRIBUTE_COSTS[k];
    if (!cost) continue;
    const unlock = h.attrs.attributeUnlockState(attributes, k);
    const hints = [`cost ${cost.cost} · max ${cost.max === Infinity ? "∞" : cost.max}`];
    if (unlock.locked && unlock.reason) hints.push(unlock.reason);
    spinRow(attrList, {
      key: `attr.${k}`,
      label: ATTRIBUTE_LABELS[k],
      tip: ATTRIBUTE_TIPS[k],
      hint: hints.join(" · "),
      value: attributes[k] ?? 0,
      max: cost.max,
      depth,
      locked: unlock.locked,
      onChange: (n) => {
        state.build.attributes[k] = n;
        state.build.attributes = h.attrs.zeroOrphanDependents(state.build.attributes);
        buildAttrList();
        onBuildChanged();
      },
    });
  }
  applyHideMaxed();
}

function syncMetaFromInputs() {
  const h = hunter();
  state.build.build_name = $("#buildName").value.trim() || "Build";
  state.build.meta = state.build.meta || {};
  state.build.meta.hunter = h.name;
  state.build.meta.level = Math.max(0, Number($("#level").value) || 0);
  state.build.mods = { trample: h.showTrample ? $("#trample").checked : false };
}

function onBuildChanged() {
  syncMetaFromInputs();
  clearStatDeltas();
  refreshBudget();
  saveState();
}

function refreshBudget() {
  syncMetaFromInputs();
  const v = validateBudgets(state.build, hunter());
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
      storageKeyFor(state.hunterId),
      JSON.stringify({
        config: state.build,
        reps: Number($("#reps").value) || 6000,
        optForceTimeless: $("#optForceTimeless")?.checked !== false,
        optLoops: Math.max(1, Number($("#optLoops")?.value) || 3),
      }),
    );
  } catch {
    /* ignore quota */
  }
}

function loadHunterState(hunterId) {
  try {
    let raw = localStorage.getItem(storageKeyFor(hunterId));
    if (!raw && hunterId === "borge") {
      for (const key of LEGACY_STORAGE_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) {
          localStorage.setItem(storageKeyFor("borge"), raw);
          break;
        }
      }
    }
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.config && typeof data.config === "object") {
      if (data.reps) $("#reps").value = String(data.reps);
      // Timeless lock defaults ON; only stay off if user previously unchecked it.
      const tmEl = $("#optForceTimeless");
      if (tmEl) tmEl.checked = data.optForceTimeless !== false;
      if (data.optLoops != null && $("#optLoops")) {
        $("#optLoops").value = String(Math.max(1, Math.min(20, Number(data.optLoops) || 3)));
      }
      return data.config;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function applyHunterTheme() {
  const h = hunter();
  document.body.dataset.hunter = h.theme;
  $$(".hunter-tab").forEach((btn) => {
    btn.setAttribute("aria-selected", String(btn.dataset.hunter === state.hunterId));
  });
  const note = $("#hunterNote");
  if (note) note.innerHTML = `Active: <strong>${h.name}</strong>. Builds persist per hunter in this browser.`;
}

function switchHunter(hunterId) {
  if (state.running || state.optimizing || state.nextBestRunning) return;
  if (hunterId === state.hunterId) return;
  if (!HUNTERS[hunterId]) return;

  saveState();
  state.hunterId = hunterId;
  const h = hunter();
  const saved = loadHunterState(hunterId);
  state.build = saved ? { ...h.defaultBuild(), ...saved } : h.defaultBuild();
  // No prior session → Timeless lock stays default ON.
  if (!saved) {
    const tmEl = $("#optForceTimeless");
    if (tmEl) tmEl.checked = true;
  }
  if (state.wasmExports) state.engine = engineFor(h, state.wasmExports);
  state.lastResult = null;
  clearStatDeltas();
  renderBuildStats(null);
  drawEmpty($("#chartDist"));
  drawEmpty($("#chartOdds"));
  drawEmpty($("#chartRev"));
  $("#mLoot").textContent = "—";
  $("#mStage").textContent = "—";
  $("#mTime").textContent = "—";
  $("#mBoss").textContent = "—";
  $("#sMin").textContent = "—";
  $("#sAvg").textContent = "—";
  $("#sMax").textContent = "—";

  applyHunterTheme();
  buildLeftLists();
  refreshBudget();
  saveState();
  $("#status").textContent = `${h.name} ready`;
}

function setupHunterTabs() {
  const bar = $("#hunterTabs");
  if (!bar) return;
  bar.innerHTML = "";
  for (const id of HUNTER_ORDER) {
    const h = HUNTERS[id];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hunter-tab";
    btn.dataset.hunter = id;
    btn.setAttribute("role", "tab");
    btn.textContent = h.name;
    btn.addEventListener("click", () => switchHunter(id));
    bar.appendChild(btn);
  }
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

  $$(".tab[data-rtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab[data-rtab]").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      $$("[data-rpanel]").forEach((p) => {
        p.hidden = p.dataset.rpanel !== btn.dataset.rtab;
      });
      redrawCharts();
    });
  });

  $$(".tab[data-mtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab[data-mtab]").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      $$("[data-mpanel]").forEach((p) => {
        p.hidden = p.dataset.mpanel !== btn.dataset.mtab;
      });
    });
  });
}

function renderBuildStats(stats) {
  const grid = $("#buildStatsGrid");
  const items = hunter().costs.BUILD_STATS_LABELS;
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
  $("#status").textContent = `Done — ${res.n} runs (${res.engine}) · ${hunter().name}`;
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
  if (!state.engine || state.running || state.optimizing || state.nextBestRunning) return;
  const v = refreshBudget();
  if (!v.ok) {
    $("#status").textContent = `Invalid build: ${v.msg}`;
    return;
  }
  const n = Math.max(1, Number($("#reps").value) || 1);
  state.running = true;
  $("#btnRun").disabled = true;
  $("#btnNextBest").disabled = true;
  $("#progressBar").style.width = "15%";
  $("#status").textContent = `Running ${n} sims (wasm · ${hunter().name})…`;
  saveState();

  try {
    await new Promise((r) => setTimeout(r, 30));
    $("#progressBar").style.width = "55%";
    const wasmRes = state.engine.evaluate(v.config, n);
    const res = hunter().wasmToSimResult(wasmRes, n);
    showResult(res);
  } catch (err) {
    console.error(err);
    $("#status").textContent = `Sim error: ${err.message || err}`;
    $("#progressBar").style.width = "0%";
  } finally {
    state.running = false;
    $("#btnRun").disabled = !state.engine;
    $("#btnNextBest").disabled = !state.engine || state.optimizing || state.nextBestRunning;
  }
}

function exportBuild() {
  syncMetaFromInputs();
  const name = (state.build.build_name || "hunter_build").replace(/[^\w.-]+/g, "_");
  downloadJson(`${name}.json`, state.build);
}

async function importBuild(file) {
  const text = await file.text();
  let data;
  if (/\.ya?ml$/i.test(file.name)) {
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

  const hunterName = String(data.meta?.hunter || "").toLowerCase();
  const matchId = HUNTER_ORDER.find((id) => HUNTERS[id].name.toLowerCase() === hunterName);
  if (matchId && matchId !== state.hunterId) {
    switchHunter(matchId);
  }

  state.build = { ...hunter().defaultBuild(), ...data };
  buildLeftLists();
  refreshBudget();
  saveState();
  $("#status").textContent = `Imported ${file.name}`;
}

async function init() {
  setupHunterTabs();
  setupTabs();

  // Always start on Borge
  state.hunterId = DEFAULT_HUNTER_ID;
  const saved = loadHunterState(state.hunterId);
  state.build = saved ? { ...hunter().defaultBuild(), ...saved } : hunter().defaultBuild();
  state.hideMaxed = true;

  applyHunterTheme();
  renderBuildStats(null);
  drawEmpty($("#chartDist"));
  drawEmpty($("#chartOdds"));
  drawEmpty($("#chartRev"));
  buildLeftLists();
  refreshBudget();
  $("#status").textContent = saved ? "Restored Borge session · loading WASM…" : "Loading WASM…";

  $("#buildName").addEventListener("change", onBuildChanged);
  $("#level").addEventListener("change", onBuildChanged);
  $("#reps").addEventListener("change", saveState);
  $("#optForceTimeless").addEventListener("change", saveState);
  $("#optLoops").addEventListener("change", saveState);
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
    const { INSC_ORDER, INSCRIPTION_COSTS } = hunter().costs;
    for (const k of INSC_ORDER) state.build.inscryptions[k] = INSCRIPTION_COSTS[k].max;
    buildLeftLists();
    onBuildChanged();
  });
  $("#btnInscClear").addEventListener("click", () => {
    const { INSC_ORDER } = hunter().costs;
    for (const k of INSC_ORDER) state.build.inscryptions[k] = 0;
    buildLeftLists();
    onBuildChanged();
  });
  $("#hideMaxed").addEventListener("change", (e) => setHideMaxed(e.target.checked));
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
  $("#btnNextBest").addEventListener("click", () => runNextBest());
  $("#btnOptCancel").addEventListener("click", () => {
    state.optCancel = true;
    $("#optStatus").textContent = "Cancelling…";
  });
  window.addEventListener("resize", () => redrawCharts());

  try {
    state.wasmExports = await loadSharedWasm("./wasm/release.wasm");
    state.engine = engineFor(hunter(), state.wasmExports);
    $("#status").textContent = saved
      ? "Restored Borge session · WASM ready"
      : "WASM ready — edit build and Run Simulation";
    $("#btnRun").disabled = false;
    $("#btnOptimize").disabled = false;
    $("#btnNextBest").disabled = false;
  } catch (err) {
    console.error(err);
    $("#status").textContent = `WASM load failed: ${err.message || err}`;
    $("#btnRun").disabled = true;
    $("#btnOptimize").disabled = true;
    $("#btnNextBest").disabled = true;
  }
}

async function askApplyOptimize({ baseAvg, bestAvg, baseLoot, bestLoot, evals }) {
  const modal = $("#optConfirmModal");
  $("#optConfirmBody").textContent =
    `Ø Stage ${bestAvg} (was ${baseAvg})\nLoot ${bestLoot} (was ${baseLoot})\n${evals} evals\n\nApply talents & attributes?`;
  modal.hidden = false;
  return new Promise((resolve) => {
    const finish = (ok) => {
      modal.hidden = true;
      $("#btnOptApply").removeEventListener("click", onApply);
      $("#btnOptDiscard").removeEventListener("click", onDiscard);
      modal.removeEventListener("click", onBackdrop);
      resolve(ok);
    };
    const onApply = () => finish(true);
    const onDiscard = () => finish(false);
    const onBackdrop = (e) => {
      if (e.target === modal) finish(false);
    };
    $("#btnOptApply").addEventListener("click", onApply);
    $("#btnOptDiscard").addEventListener("click", onDiscard);
    modal.addEventListener("click", onBackdrop);
  });
}

async function runNextBest() {
  if (!state.engine || state.running || state.optimizing || state.nextBestRunning) return;
  syncMetaFromInputs();
  const v = refreshBudget();
  if (!v.ok) {
    $("#status").textContent = `Invalid build: ${v.msg}`;
    return;
  }

  state.nextBestRunning = true;
  state.nextBestCancel = false;
  clearStatDeltas();
  const btn = $("#btnNextBest");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Rechnet…";
  }
  $("#btnRun").disabled = true;
  $("#btnOptimize").disabled = true;

  const n = Math.max(1, Number($("#reps").value) || 1000);

  try {
    const result = await marginalStatGains(
      state.build,
      state.engine,
      hunter(),
      { n },
      {
        isCancelled: () => state.nextBestCancel,
        onProgress: ({ msg, done, total, stage }) => {
          const pct = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
          const stageTxt = stage != null ? ` · Ø ${Number(stage).toFixed(1)}` : "";
          const line = `Next-Best-Opti ${done}/${total} (${pct}%) — ${msg}${stageTxt}`;
          $("#status").textContent = line;
          const optEl = $("#optStatus");
          if (optEl) optEl.textContent = line;
        },
      },
    );

    if (result.cancelled) {
      $("#status").textContent = "Next-Best-Opti cancelled.";
      return;
    }

    state.statDeltas = result;
    renderStatDeltas();

    const best = result.results.find((r) => r.key === result.bestKey);
    const label = best ? hunter().costs.STAT_LABELS[best.key] || best.key : null;
    const d = best ? fmtDelta(best.dStage) : null;
    const sigN = result.results.filter((r) => r.significantBenefit).length;
    const doneMsg = best
      ? `Next-Best-Opti done · ${n} sims/stat · ${sigN} significant · best +1: ${label} (${d} Ø)` +
        ` · Baseline Ø ${result.baselineScore.avgStage.toFixed(1)}`
      : `Next-Best-Opti done · ${n} sims/stat · no significant +1` +
        ` · Baseline Ø ${result.baselineScore.avgStage.toFixed(1)}`;
    $("#status").textContent = doneMsg;
    const optEl = $("#optStatus");
    if (optEl) optEl.textContent = doneMsg;
  } catch (err) {
    console.error(err);
    const msg = `Next-Best-Opti error: ${err.message || err}`;
    $("#status").textContent = msg;
    const optEl = $("#optStatus");
    if (optEl) optEl.textContent = msg;
  } finally {
    state.nextBestRunning = false;
    state.nextBestCancel = false;
    if (btn) {
      btn.disabled = !state.engine;
      btn.textContent = "Next-Best-Opti";
    }
    $("#btnRun").disabled = !state.engine;
    $("#btnOptimize").disabled = !state.engine;
  }
}

async function runOptimize() {
  if (!state.engine || state.running || state.optimizing || state.nextBestRunning) return;
  syncMetaFromInputs();
  const v = refreshBudget();
  if (!v.ok) {
    $("#optStatus").textContent = `Invalid build: ${v.msg}`;
    return;
  }

  state.optimizing = true;
  state.optCancel = false;
  $("#btnOptimize").disabled = true;
  $("#btnNextBest").disabled = true;
  $("#btnOptCancel").hidden = false;
  $("#btnTalentClose").disabled = true;
  $("#optProgressBar").style.width = "0%";

  const loops = Math.max(1, Math.min(20, Math.floor(Number($("#optLoops").value) || 1)));
  $("#optLoops").value = String(loops);

  let runNextBestAfterApply = false;

  try {
    const result = await optimizeBuild(
      state.build,
      state.engine,
      hunter(),
      {
        loops,
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
      $("#optStatus").textContent = "Optimization cancelled.";
      return;
    }

    const baseAvg = result.baselineScore.avgStage.toFixed(1);
    const bestAvg = result.bestScore.avgStage.toFixed(1);
    const baseLoot = result.baselineScore.lootScore.toFixed(1);
    const bestLoot = result.bestScore.lootScore.toFixed(1);

    if (result.improved) {
      $("#optStatus").textContent =
        `Improved · Ø ${bestAvg} (was ${baseAvg}) · loot ${bestLoot} (was ${baseLoot}) · ${result.evals} evals — waiting for confirmation`;
      $("#optProgressBar").style.width = "100%";

      const apply = await askApplyOptimize({
        baseAvg,
        bestAvg,
        baseLoot,
        bestLoot,
        evals: result.evals,
      });

      if (apply) {
        state.build = {
          ...state.build,
          talents: { ...result.bestConfig.talents },
          attributes: { ...result.bestConfig.attributes },
        };
        buildLeftLists();
        onBuildChanged();
        if (result.bestEval) showResult(result.bestEval);
        $("#optStatus").textContent =
          `Applied · Ø ${bestAvg} (was ${baseAvg}) · loot ${bestLoot} (was ${baseLoot}) · ${result.evals} evals · ${result.loops || 1} iteration(s) · Next-Best-Opti…`;
        $("#status").textContent = `Optimizer: Ø Stage ${bestAvg} (↑ from ${baseAvg}) — applied · Next-Best-Opti…`;
        runNextBestAfterApply = true;
      } else {
        $("#optStatus").textContent =
          `Discarded · suggested Ø ${bestAvg} (current ${baseAvg}) · ${result.evals} evals`;
        $("#status").textContent = `Optimizer: suggestion discarded (Ø ${bestAvg})`;
      }
    } else {
      $("#optStatus").textContent =
        `No improvement · Ø ${bestAvg} (baseline ${baseAvg}) · ${result.evals} evals · ${result.loops || 1} iteration(s)`;
      $("#status").textContent = `Optimizer: no improvement (Ø ${baseAvg})`;
      $("#optProgressBar").style.width = "100%";
    }
  } catch (err) {
    console.error(err);
    $("#optStatus").textContent = `Optimizer error: ${err.message || err}`;
  } finally {
    state.optimizing = false;
    state.optCancel = false;
    $("#btnOptimize").disabled = !state.engine;
    $("#btnNextBest").disabled = !state.engine || state.running || state.nextBestRunning;
    $("#btnOptCancel").hidden = true;
    $("#btnTalentClose").disabled = false;
  }

  if (runNextBestAfterApply) {
    await runNextBest();
  }
}

$("#btnRun").disabled = true;
$("#btnOptimize").disabled = true;
$("#btnNextBest").disabled = true;
init();
