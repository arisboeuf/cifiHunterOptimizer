import {
  DEFAULT_HUNTER_ID,
  HUNTER_ORDER,
  HUNTERS,
  engineFor,
  getHunter,
  loadSharedWasm,
  storageKeyFor,
} from "./hunters/index.js";
import { downloadJson, formatDuration, validateBudgets, discardOverBudgetSpend } from "./build.js";
import { marginalInscryptionGains, marginalRelicGemGains, marginalStatGains, normalizeBossStages, optimizeBuild } from "./optimize.js";
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
  inscDeltas: null,
  miscDeltas: null,
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
function statResourceMap() {
  return hunter().statResource || {};
}

function resourceMeta(resourceId) {
  const mats = hunter().lootMats || [];
  return mats.find((m) => m.key === resourceId) || null;
}

function appendStatResourceHead(parent, resourceId) {
  const meta = resourceMeta(resourceId);
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

function clearInscDeltas() {
  state.inscDeltas = null;
  $$("#inscList .stat-delta").forEach((el) => el.remove());
}

function clearMiscDeltas() {
  state.miscDeltas = null;
  $$("#miscList .stat-delta").forEach((el) => el.remove());
}

function clearAllMarginalDeltas() {
  clearStatDeltas();
  clearInscDeltas();
  clearMiscDeltas();
}

const NEXT_BEST_BTN_IDS = {
  stats: "btnNextBest",
  insc: "btnNextBestInsc",
  misc: "btnNextBestMisc",
};

function nextBestButtons() {
  return Object.fromEntries(
    Object.entries(NEXT_BEST_BTN_IDS).map(([kind, id]) => [kind, document.getElementById(id)]),
  );
}

function setNextBestButtonsDisabled(disabled) {
  const off = !!disabled;
  for (const btn of Object.values(nextBestButtons())) {
    if (btn) btn.disabled = off;
  }
}

function optModeButtons() {
  return ["btnOptimize", "btnOptimizeLoot", "btnOptimizeBoss"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
}

function syncActionButtons() {
  const busy = state.running || state.optimizing || state.nextBestRunning;
  const ready = !!state.engine && !busy;
  $("#btnRun").disabled = !ready;
  for (const btn of optModeButtons()) {
    if (btn.id === "btnOptimizeBoss") {
      btn.disabled = !ready || selectedBossStages().length === 0;
    } else {
      btn.disabled = !ready;
    }
  }
  setOptBossChecksDisabled(busy);
  setNextBestButtonsDisabled(!ready);
}

function selectedBossStages() {
  return normalizeBossStages(
    [...document.querySelectorAll(".opt-boss:checked")].map((el) => el.value),
  );
}

function setOptBossChecksDisabled(disabled) {
  for (const el of document.querySelectorAll(".opt-boss")) {
    el.disabled = !!disabled;
  }
}

function setTimelessOptDisabled(disabled) {
  const el = $("#optForceTimeless");
  if (!el) return;
  el.disabled = !!disabled;
  const label = el.closest("label");
  if (label) label.classList.toggle("is-disabled", !!disabled);
}

function fmtDelta(n, digits = 2) {
  const v = Number(n) || 0;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}`;
}

/** Compact number like cifi-tools (1.2k / 3.4m). */
function formatCompact(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || Math.abs(v) < 0.01) return "0";
  if (Math.abs(v) < 1) return v.toFixed(2);
  const abs = Math.abs(v);
  const units = ["", "k", "m", "b", "t", "qa", "qu"];
  const exp = Math.min(units.length - 1, Math.floor(Math.log10(abs) / 3));
  const scaled = v / 10 ** (exp * 3);
  const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  return `${scaled.toFixed(digits)}${units[exp]}`;
}

/** WASM mats = avg drop per full run; avgTimeS is seconds (converted from WASM minutes). */
function matsPerHour(res) {
  const t = Number(res?.avgTimeS) || 0;
  const mats = res?.mats;
  if (!mats || t <= 0) return null;
  const scale = 3600 / t;
  return {
    mat1: (Number(mats.mat1) || 0) * scale,
    mat2: (Number(mats.mat2) || 0) * scale,
    mat3: (Number(mats.mat3) || 0) * scale,
  };
}

function syncMatsRowLabels() {
  const defs = hunter().lootMats || [];
  defs.forEach((def) => {
    const el = $(`.mat-metric[data-mat="${def.key}"]`);
    if (!el) return;
    const icon = el.querySelector(".mat-icon");
    const name = el.querySelector(".mat-name");
    if (icon) {
      icon.src = def.icon;
      icon.alt = def.label;
    }
    if (name) {
      name.textContent = def.short;
      name.title = def.label;
    }
  });
}

function renderMatsPerHour(res) {
  const rates = matsPerHour(res);
  $$(".mat-metric").forEach((el) => {
    const key = el.dataset.mat;
    const v = el.querySelector(".mat-v");
    if (!v) return;
    v.textContent = rates ? formatCompact(rates[key]) : "—";
  });
}

function renderMarginalDeltas(listSel, keyPrefix, data) {
  $$(`${listSel} .stat-delta`).forEach((el) => el.remove());
  if (!data?.results?.length) return;
  for (const entry of data.results) {
    const row = $(`${listSel} .spin[data-key="${keyPrefix}${entry.key}"]`);
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

function renderStatDeltas() {
  renderMarginalDeltas("#statsList", "stat.", state.statDeltas);
}

function renderInscDeltas() {
  renderMarginalDeltas("#inscList", "insc.", state.inscDeltas);
}

function renderMiscDeltas() {
  // Result keys already match data-key (`relic.*` / `gem.*`).
  renderMarginalDeltas("#miscList", "", state.miscDeltas);
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
  const resMap = statResourceMap();
  for (const k of STAT_ORDER) {
    const mx = STAT_MAX[k];
    const capped = cappedStats.includes(k);
    const resource = resMap[k] || null;
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
  renderInscDeltas();

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
  renderMiscDeltas();

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
  clearAllMarginalDeltas();
  refreshBudget();
  saveState();
}

/** Lowering level: drop talent/attr spends that no longer fit so optimize can start fresh. */
function onLevelChanged() {
  const prevLevel = Number(state.build.meta?.level ?? 0);
  syncMetaFromInputs();
  const nextLevel = Number(state.build.meta?.level ?? 0);
  if (nextLevel < prevLevel) {
    const fit = discardOverBudgetSpend(state.build, hunter());
    if (fit.any) {
      state.build = fit.config;
      buildLeftLists();
      const parts = [];
      if (fit.cleared.talents) parts.push("talents");
      if (fit.cleared.attributes) parts.push("attributes");
      $("#status").textContent = `Level lowered — ${parts.join(" & ")} reset for new budget`;
    }
  }
  onBuildChanged();
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
      // Prioritize Timeless defaults ON; only stay off if user previously unchecked it.
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
  syncMatsRowLabels();
}

function clearResultUi() {
  state.lastResult = null;
  clearAllMarginalDeltas();
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
  renderMatsPerHour(null);
}

const RESET_LABELS = ["Reset Stats etc", "Sure?", "Really?"];
let resetArmStep = 0;
let resetArmTimer = null;

function disarmResetButton() {
  resetArmStep = 0;
  if (resetArmTimer) {
    clearTimeout(resetArmTimer);
    resetArmTimer = null;
  }
  const btn = $("#btnReset");
  if (!btn) return;
  btn.textContent = RESET_LABELS[0];
  btn.classList.remove("is-confirm-1", "is-confirm-2");
}

function scheduleResetDisarm() {
  if (resetArmTimer) clearTimeout(resetArmTimer);
  resetArmTimer = setTimeout(() => disarmResetButton(), 4000);
}

function resetCurrentHunter() {
  const h = hunter();
  state.build = h.emptyBuild();
  clearResultUi();
  buildLeftLists();
  refreshBudget();
  saveState();
  $("#status").textContent = `${h.name} reset — all stats / talents / attributes cleared`;
}

function onResetClick() {
  if (state.running || state.optimizing || state.nextBestRunning) return;

  if (resetArmStep < 2) {
    resetArmStep += 1;
    const btn = $("#btnReset");
    if (btn) {
      btn.textContent = RESET_LABELS[resetArmStep];
      btn.classList.toggle("is-confirm-1", resetArmStep === 1);
      btn.classList.toggle("is-confirm-2", resetArmStep === 2);
    }
    scheduleResetDisarm();
    return;
  }

  disarmResetButton();
  resetCurrentHunter();
}

function switchHunter(hunterId) {
  if (state.running || state.optimizing || state.nextBestRunning) return;
  if (hunterId === state.hunterId) return;
  if (!HUNTERS[hunterId]) return;

  disarmResetButton();
  saveState();
  state.hunterId = hunterId;
  const h = hunter();
  const saved = loadHunterState(hunterId);
  state.build = saved ? { ...h.defaultBuild(), ...saved } : h.defaultBuild();
  // No prior session → Prioritize Timeless stays default ON.
  if (!saved) {
    const tmEl = $("#optForceTimeless");
    if (tmEl) tmEl.checked = true;
  }
  if (state.wasmExports) state.engine = engineFor(h, state.wasmExports);
  clearResultUi();

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
  renderMatsPerHour(res);
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
  syncActionButtons();
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
    syncActionButtons();
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
  $("#level").addEventListener("change", onLevelChanged);
  $("#reps").addEventListener("change", saveState);
  $("#optForceTimeless").addEventListener("change", saveState);
  $("#optLoops").addEventListener("change", saveState);
  $("#trample").addEventListener("change", onBuildChanged);
  $("#btnRun").addEventListener("click", runSim);
  $("#btnExport").addEventListener("click", exportBuild);
  $("#btnImport").addEventListener("click", () => $("#fileImport").click());
  $("#btnReset").addEventListener("click", onResetClick);
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
  $("#btnOptimize").addEventListener("click", () => runOptimize("stage"));
  $("#btnOptimizeLoot").addEventListener("click", () => runOptimize("loot"));
  $("#btnOptimizeBoss").addEventListener("click", () => runOptimize("bosses"));
  for (const el of document.querySelectorAll(".opt-boss")) {
    el.addEventListener("change", () => syncActionButtons());
  }
  $("#btnNextBest").addEventListener("click", () => runNextBest());
  $("#btnNextBestInsc").addEventListener("click", () => runNextBestInsc());
  $("#btnNextBestMisc").addEventListener("click", () => runNextBestMisc());
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
    syncActionButtons();
  } catch (err) {
    console.error(err);
    $("#status").textContent = `WASM load failed: ${err.message || err}`;
    syncActionButtons();
  }
}

function fmtOptDelta(best, base, digits = 1) {
  const d = Number(best) - Number(base);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-9) return { text: "—", cls: "" };
  return { text: fmtDelta(d, digits), cls: d > 0 ? "is-up" : "is-down" };
}

function optReportCell(value, cls = "") {
  return `<span class="v${cls ? ` ${cls}` : ""}">${value}</span>`;
}

/** Always-on post-optimize report. Returns true only if user applies an improved build. */
async function showOptReport({ mode, modeLabel, result, bossStages }) {
  const modal = $("#optConfirmModal");
  const body = $("#optConfirmBody");
  const btnClose = $("#btnOptReportClose");
  const btnDiscard = $("#btnOptDiscard");
  const btnApply = $("#btnOptApply");
  const baseSc = result.baselineScore;
  const bestSc = result.bestScore;
  const baseEv = result.baselineEval || {};
  const bestEv = result.bestEval || {};
  const improved = !!result.improved;

  const baseStage = Number(baseSc.avgStage) || 0;
  const bestStage = Number(bestSc.avgStage) || 0;
  const baseLoot = Number(baseSc.lootScore) || 0;
  const bestLoot = Number(bestSc.lootScore) || 0;
  const baseBosses = Number(baseSc.bossesPerDay) || 0;
  const bestBosses = Number(bestSc.bossesPerDay) || 0;
  const dStage = fmtOptDelta(bestStage, baseStage, 1);
  const dLoot = fmtOptDelta(bestLoot, baseLoot, 1);
  const dBosses = fmtOptDelta(bestBosses, baseBosses, 1);

  const baseBossPct = ((Number(baseEv.bossKillRate) || 0) * 100).toFixed(1);
  const bestBossPct = ((Number(bestEv.bossKillRate) || 0) * 100).toFixed(1);
  const baseRuns = Number(baseEv.runsPerDay) || 0;
  const bestRuns = Number(bestEv.runsPerDay) || 0;
  const dRuns = fmtOptDelta(bestRuns, baseRuns, 1);
  const baseTime = formatDuration(Number(baseEv.avgTimeS) || 0);
  const bestTime = formatDuration(Number(bestEv.avgTimeS) || 0);

  const baseMats = matsPerHour(baseEv);
  const bestMats = matsPerHour(bestEv);
  const matDefs = hunter().lootMats || [];
  const matRows = matDefs
    .map((def) => {
      const b = baseMats ? formatCompact(baseMats[def.key]) : "—";
      const n = bestMats ? formatCompact(bestMats[def.key]) : "—";
      const rawB = baseMats ? Number(baseMats[def.key]) || 0 : 0;
      const rawN = bestMats ? Number(bestMats[def.key]) || 0 : 0;
      const d = baseMats && bestMats ? fmtOptDelta(rawN, rawB, 0) : { text: "—", cls: "" };
      // Show absolute rates; delta class only when both exist.
      const deltaCls = d.cls;
      const deltaTxt =
        baseMats && bestMats && Number.isFinite(rawN - rawB) && Math.abs(rawN - rawB) >= 0.01
          ? fmtDelta(rawN - rawB, Math.abs(rawN - rawB) >= 100 ? 0 : 1)
          : "—";
      return `<span class="k">${def.short}/h</span>${optReportCell(b)}${optReportCell(
        `${n}${deltaTxt !== "—" ? ` (${deltaTxt})` : ""}`,
        deltaCls,
      )}`;
    })
    .join("");

  let primaryLine;
  if (mode === "bosses") {
    primaryLine = `Bosses/day ${bestBosses.toFixed(1)} (was ${baseBosses.toFixed(1)}, ${dBosses.text}) · targets ${(bossStages || []).join(", ") || "—"}`;
  } else if (mode === "loot") {
    primaryLine = `Loot ${bestLoot.toFixed(1)} (was ${baseLoot.toFixed(1)}, ${dLoot.text})`;
  } else {
    primaryLine = `Ø Stage ${bestStage.toFixed(1)} (was ${baseStage.toFixed(1)}, ${dStage.text})`;
  }

  $("#optConfirmTitle").textContent = improved ? `${modeLabel} — improvement found` : `${modeLabel} — report`;
  body.innerHTML = `
    <p class="opt-report-summary">
      <strong>${improved ? "Improved vs baseline" : "No significant improvement"}</strong><br />
      ${primaryLine}
    </p>
    <div class="opt-report-grid">
      <span class="h">Metric</span><span class="h">Baseline</span><span class="h">Best</span>
      <span class="k">Ø Stage</span>${optReportCell(baseStage.toFixed(1))}${optReportCell(
        `${bestStage.toFixed(1)} (${dStage.text})`,
        dStage.cls,
      )}
      <span class="k">Stage range</span>${optReportCell(
        `${(Number(baseEv.minStage) || 0).toFixed(0)}–${(Number(baseEv.maxStage) || 0).toFixed(0)}`,
      )}${optReportCell(
        `${(Number(bestEv.minStage) || 0).toFixed(0)}–${(Number(bestEv.maxStage) || 0).toFixed(0)}`,
      )}
      <span class="k">Loot</span>${optReportCell(baseLoot.toFixed(1))}${optReportCell(
        `${bestLoot.toFixed(1)} (${dLoot.text})`,
        dLoot.cls,
      )}
      <span class="k">Bosses/day</span>${optReportCell(baseBosses.toFixed(1))}${optReportCell(
        `${bestBosses.toFixed(1)} (${dBosses.text})`,
        dBosses.cls,
      )}
      <span class="k">Boss kill %</span>${optReportCell(`${baseBossPct}%`)}${optReportCell(`${bestBossPct}%`)}
      <span class="k">Runs/day</span>${optReportCell(baseRuns.toFixed(1))}${optReportCell(
        `${bestRuns.toFixed(1)} (${dRuns.text})`,
        dRuns.cls,
      )}
      <span class="k">Avg time</span>${optReportCell(baseTime)}${optReportCell(bestTime)}
      ${matRows}
    </div>
    <p class="opt-report-meta">
      ${result.evals} evals · ${result.loops || 1} iteration(s) · screen ${result.nSearch} / refine ${result.nRefine} sims
      ${mode === "bosses" ? `<br />Boss targets: ${(bossStages || []).join(", ") || "—"}` : ""}
      ${mode === "loot" ? "<br />Timeless Mastery 5: required" : ""}
    </p>
    ${improved ? `<p class="opt-report-ask">Apply talents &amp; attributes from the best build?</p>` : ""}
  `;

  btnClose.hidden = improved;
  btnDiscard.hidden = !improved;
  btnApply.hidden = !improved;
  modal.hidden = false;

  return new Promise((resolve) => {
    const finish = (ok) => {
      modal.hidden = true;
      btnApply.removeEventListener("click", onApply);
      btnDiscard.removeEventListener("click", onDiscard);
      btnClose.removeEventListener("click", onClose);
      modal.removeEventListener("click", onBackdrop);
      resolve(ok);
    };
    const onApply = () => finish(true);
    const onDiscard = () => finish(false);
    const onClose = () => finish(false);
    const onBackdrop = (e) => {
      if (e.target === modal) finish(false);
    };
    btnApply.addEventListener("click", onApply);
    btnDiscard.addEventListener("click", onDiscard);
    btnClose.addEventListener("click", onClose);
    modal.addEventListener("click", onBackdrop);
  });
}

function formatOptProgressExtra({ objective, stage, loot, bossesPerDay }) {
  if (objective === "bosses") {
    const parts = [];
    if (bossesPerDay != null) parts.push(`best ${Number(bossesPerDay).toFixed(1)} bosses/d`);
    if (stage != null) parts.push(`Ø ${Number(stage).toFixed(1)}`);
    if (loot != null) parts.push(`loot ${Number(loot).toFixed(1)}`);
    return parts.length ? ` · ${parts.join(" · ")}` : "";
  }
  if (objective === "loot") {
    const parts = [];
    if (loot != null) parts.push(`best loot ${Number(loot).toFixed(1)}`);
    if (stage != null) parts.push(`Ø ${Number(stage).toFixed(1)}`);
    return parts.length ? ` · ${parts.join(" · ")}` : "";
  }
  if (stage == null) return "";
  return ` · best Ø ${Number(stage).toFixed(1)}${loot != null ? ` · loot ${Number(loot).toFixed(1)}` : ""}`;
}

async function runMarginalNextBest({ kind, clearDeltas, runSweep, applyResult, bestLabelOf, unitLabel }) {
  if (!state.engine || state.running || state.optimizing || state.nextBestRunning) return;
  syncMetaFromInputs();
  const v = refreshBudget();
  if (!v.ok) {
    $("#status").textContent = `Invalid build: ${v.msg}`;
    return;
  }

  state.nextBestRunning = true;
  state.nextBestCancel = false;
  clearDeltas();
  const btns = nextBestButtons();
  for (const btn of Object.values(btns)) {
    if (btn) btn.disabled = true;
  }
  const activeBtn = btns[kind];
  if (activeBtn) activeBtn.textContent = "Running…";
  $("#btnRun").disabled = true;
  for (const btn of optModeButtons()) btn.disabled = true;
  setOptBossChecksDisabled(true);

  const n = Math.max(1, Number($("#reps").value) || 1000);
  const titleByKind = {
    stats: "Next-Best-Opti",
    insc: "Insc Next-Best-Opti",
    misc: "Relic/Gem Next-Best-Opti",
  };
  const title = titleByKind[kind] || "Next-Best-Opti";

  try {
    const result = await runSweep(
      state.build,
      state.engine,
      hunter(),
      { n },
      {
        isCancelled: () => state.nextBestCancel,
        onProgress: ({ msg, done, total, stage }) => {
          const pct = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
          const stageTxt = stage != null ? ` · Ø ${Number(stage).toFixed(1)}` : "";
          const line = `${title} ${done}/${total} (${pct}%) — ${msg}${stageTxt}`;
          $("#status").textContent = line;
          const optEl = $("#optStatus");
          if (optEl) optEl.textContent = line;
        },
      },
    );

    if (result.cancelled) {
      $("#status").textContent = `${title} cancelled.`;
      return;
    }

    applyResult(result);

    const best = result.results.find((r) => r.key === result.bestKey);
    const label = best ? bestLabelOf(best.key) : null;
    const d = best ? fmtDelta(best.dStage) : null;
    const sigN = result.results.filter((r) => r.significantBenefit).length;
    const doneMsg = best
      ? `${title} done · ${n} sims/${unitLabel} · ${sigN} significant · best +1: ${label} (${d} Ø)` +
        ` · Baseline Ø ${result.baselineScore.avgStage.toFixed(1)}`
      : `${title} done · ${n} sims/${unitLabel} · no significant +1` +
        ` · Baseline Ø ${result.baselineScore.avgStage.toFixed(1)}`;
    $("#status").textContent = doneMsg;
    const optEl = $("#optStatus");
    if (optEl) optEl.textContent = doneMsg;
  } catch (err) {
    console.error(err);
    const msg = `${title} error: ${err.message || err}`;
    $("#status").textContent = msg;
    const optEl = $("#optStatus");
    if (optEl) optEl.textContent = msg;
  } finally {
    state.nextBestRunning = false;
    state.nextBestCancel = false;
    for (const btn of Object.values(btns)) {
      if (btn) btn.textContent = "Next-Best-Opti";
    }
    syncActionButtons();
  }
}

async function runNextBest() {
  await runMarginalNextBest({
    kind: "stats",
    clearDeltas: clearStatDeltas,
    runSweep: marginalStatGains,
    applyResult: (result) => {
      state.statDeltas = result;
      renderStatDeltas();
    },
    bestLabelOf: (key) => hunter().costs.STAT_LABELS[key] || key,
    unitLabel: "stat",
  });
}

/** On-demand only — not chained after talent/attribute optimize. */
async function runNextBestInsc() {
  await runMarginalNextBest({
    kind: "insc",
    clearDeltas: clearInscDeltas,
    runSweep: marginalInscryptionGains,
    applyResult: (result) => {
      state.inscDeltas = result;
      renderInscDeltas();
    },
    bestLabelOf: (key) => hunter().costs.INSCRIPTION_META?.[key]?.title || key,
    unitLabel: "insc",
  });
}

/** On-demand only — not chained after talent/attribute optimize. */
async function runNextBestMisc() {
  await runMarginalNextBest({
    kind: "misc",
    clearDeltas: clearMiscDeltas,
    runSweep: marginalRelicGemGains,
    applyResult: (result) => {
      state.miscDeltas = result;
      renderMiscDeltas();
    },
    bestLabelOf: (key) => {
      const dot = String(key).indexOf(".");
      return dot >= 0 ? key.slice(dot + 1) : key;
    },
    unitLabel: "item",
  });
}

async function runOptimize(objective = "stage") {
  if (!state.engine || state.running || state.optimizing || state.nextBestRunning) return;
  const mode = objective === "bosses" || objective === "loot" ? objective : "stage";
  const bossStages = selectedBossStages();
  if (mode === "bosses" && !bossStages.length) {
    $("#optStatus").textContent = "Select at least one boss (100 / 200 / 300).";
    return;
  }
  syncMetaFromInputs();
  // Stale high-level talent/attr spends after a level drop: discard and re-plan.
  const fit = discardOverBudgetSpend(state.build, hunter());
  if (fit.any) {
    state.build = fit.config;
    buildLeftLists();
    saveState();
  }
  const v = refreshBudget();
  if (!v.ok) {
    $("#optStatus").textContent = `Invalid build: ${v.msg}`;
    return;
  }

  state.optimizing = true;
  state.optCancel = false;
  syncActionButtons();
  $("#btnOptCancel").hidden = false;
  $("#btnTalentClose").disabled = true;
  $("#optProgressBar").style.width = "0%";
  // Material/XP farm: Timeless Mastery 5 is mandatory; checkbox is inactive for this run.
  let tmCheckboxRestore = null;
  if (mode === "loot") {
    const tmEl = $("#optForceTimeless");
    if (tmEl) {
      tmCheckboxRestore = tmEl.checked;
      tmEl.checked = true;
    }
    setTimelessOptDisabled(true);
  }

  const loops = Math.max(1, Math.min(20, Math.floor(Number($("#optLoops").value) || 1)));
  $("#optLoops").value = String(loops);

  let runNextBestAfterApply = false;
  const modeLabel =
    mode === "bosses" ? "Boss Maximizer" : mode === "loot" ? "Push Material/XP" : "Push Average Stage";

  try {
    const result = await optimizeBuild(
      state.build,
      state.engine,
      hunter(),
      {
        loops,
        prioritizeTimelessMastery: mode === "loot" ? true : $("#optForceTimeless").checked,
        objective: mode,
        bossStages,
      },
      {
        isCancelled: () => state.optCancel,
        onProgress: (p) => {
          const pct = Math.min(100, Math.round((p.done / Math.max(1, p.total)) * 100));
          $("#optProgressBar").style.width = `${pct}%`;
          $("#optStatus").textContent = `${p.msg}${formatOptProgressExtra(p)}`;
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
    const baseBosses = Number(result.baselineScore.bossesPerDay) || 0;
    const bestBosses = Number(result.bestScore.bossesPerDay) || 0;
    const bossesLabel = bossStages.join(", ");
    const loopsN = result.loops || 1;

    const improvedLine =
      mode === "bosses"
        ? `${bestBosses.toFixed(1)} bosses/d (was ${baseBosses.toFixed(1)}) · bosses ${bossesLabel}`
        : mode === "loot"
          ? `loot ${bestLoot} (was ${baseLoot}) · Ø ${bestAvg}`
          : `Ø ${bestAvg} (was ${baseAvg}) · loot ${bestLoot} (was ${baseLoot})`;
    const noImproveLine =
      mode === "bosses"
        ? `${bestBosses.toFixed(1)} bosses/d (baseline ${baseBosses.toFixed(1)})`
        : mode === "loot"
          ? `loot ${bestLoot} (baseline ${baseLoot})`
          : `Ø ${bestAvg} (baseline ${baseAvg})`;
    const discardSuggest =
      mode === "bosses"
        ? `${bestBosses.toFixed(1)} bosses/d (current ${baseBosses.toFixed(1)})`
        : mode === "loot"
          ? `loot ${bestLoot} (current ${baseLoot})`
          : `Ø ${bestAvg} (current ${baseAvg})`;

    $("#optProgressBar").style.width = "100%";
    $("#optStatus").textContent = result.improved
      ? `Done · ${improvedLine} · ${result.evals} evals — report open`
      : `Done · no improvement · ${noImproveLine} · ${result.evals} evals — report open`;

    const apply = await showOptReport({ mode, modeLabel, result, bossStages });

    if (result.improved && apply) {
      state.build = {
        ...state.build,
        talents: { ...result.bestConfig.talents },
        attributes: { ...result.bestConfig.attributes },
      };
      buildLeftLists();
      onBuildChanged();
      if (result.bestEval) showResult(result.bestEval);
      if (mode === "stage") {
        $("#optStatus").textContent =
          `Applied · ${improvedLine} · ${result.evals} evals · ${loopsN} iteration(s) · Next-Best-Opti…`;
        $("#status").textContent =
          `${modeLabel}: Ø Stage ${bestAvg} (↑ from ${baseAvg}) — applied · Next-Best-Opti…`;
        runNextBestAfterApply = true;
      } else {
        $("#optStatus").textContent =
          `Applied · ${improvedLine} · ${result.evals} evals · ${loopsN} iteration(s)`;
        $("#status").textContent = `${modeLabel}: applied · ${improvedLine}`;
      }
    } else if (result.improved) {
      $("#optStatus").textContent =
        `Discarded · suggested ${discardSuggest} · ${result.evals} evals`;
      $("#status").textContent = `${modeLabel}: suggestion discarded (${discardSuggest})`;
    } else {
      $("#optStatus").textContent =
        `No improvement · ${noImproveLine} · ${result.evals} evals · ${loopsN} iteration(s)`;
      $("#status").textContent = `${modeLabel}: no improvement · see report`;
      if (result.baselineEval) showResult(result.baselineEval);
    }
  } catch (err) {
    console.error(err);
    $("#optStatus").textContent = `Optimizer error: ${err.message || err}`;
  } finally {
    state.optimizing = false;
    state.optCancel = false;
    setTimelessOptDisabled(false);
    if (mode === "loot" && tmCheckboxRestore != null) {
      const tmEl = $("#optForceTimeless");
      if (tmEl) tmEl.checked = tmCheckboxRestore;
    }
    syncActionButtons();
    $("#btnOptCancel").hidden = true;
    $("#btnTalentClose").disabled = false;
  }

  if (runNextBestAfterApply) {
    // Stats only — inscription next-best stays manual. Loot/boss optimize do not chain this.
    await runNextBest();
  }
}

$("#btnRun").disabled = true;
for (const btn of optModeButtons()) btn.disabled = true;
setNextBestButtonsDisabled(true);
init();
