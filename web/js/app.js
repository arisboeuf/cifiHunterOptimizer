import {
  DEFAULT_HUNTER_ID,
  HUNTER_ORDER,
  HUNTERS,
  engineFor,
  evaluateBuild,
  getHunter,
  loadSharedWasm,
  probeOfflineApi,
  probeRustSim,
  storageKeyFor,
} from "./hunters/index.js?v=engine16";
import { downloadJson, formatDuration, validateBudgets, discardOverBudgetSpend } from "./build.js?v=engine16";
import { bossHpRemaining, findFirstBossKill, findPushBuild, marginalInscryptionGains, marginalRelicGemGains, marginalStatGains, normalizeBossStages } from "./optimize.js?v=engine16";
import { drawBarChart, drawEmpty, drawOddsChart, drawReviveChart } from "./charts.js?v=engine16";
import { initGemsModule } from "./gems/ui.js?v=engine16";
import { initMechsModule, persistMechsState } from "./mechs/ui.js?v=engine16";

const LEGACY_STORAGE_KEYS = ["hunter_sim_web_state_v1", "borge_sim_web_state_v1"];
const MODULE_STORAGE_KEY = "cifi_web_module_v1";
const ENGINE_STORAGE_KEY = "cifi_combat_engine_v1";
const MODULE_IDS = new Set(["hunters", "gems", "mechs"]);
/** Flip to true to re-enable Python / Rust/WASM in the Engine dropdown. */
const OWN_ENGINES_ENABLED = false;

const state = {
  hunterId: DEFAULT_HUNTER_ID,
  module: "hunters",
  gemsReady: false,
  mechsReady: false,
  build: null,
  wasmExports: null,
  engine: null,
  engineMode: "wasm", // "wasm" | "offline" | "rust"
  offlineApiOk: false,
  rustSimOk: false,
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
  return ["btnOptimize", "btnOptimizeLoot", "btnOptimizeBoss", "btnFirstBoss"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
}

function syncActionButtons() {
  const busy = state.running || state.optimizing || state.nextBestRunning;
  const ready = !!state.engine && !busy;
  $("#btnRun").disabled = !ready;
  for (const btn of optModeButtons()) {
    if (btn.id === "btnOptimizeBoss" || btn.id === "btnFirstBoss") {
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
    } else if (entry.better) {
      span.textContent = `${fmtDelta(entry.dStage)} Ø`;
      span.title =
        `Higher average stage` +
        ` · Δ Stage ${fmtDelta(entry.dStage)} · Δ Loot ${fmtDelta(entry.dLoot, 1)}`;
      if (entry.key === data.bestKey) span.classList.add("is-best");
    } else {
      span.classList.add("is-skip");
      span.textContent = `${fmtDelta(entry.dStage)} Ø`;
      span.title =
        `Not above baseline` +
        ` · Δ Stage ${fmtDelta(entry.dStage)} · Δ Loot ${fmtDelta(entry.dLoot, 1)}`;
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
  const card = h.diamondCard;
  const cardSlot = $("#diamondCardSlot");
  if (cardSlot) {
    cardSlot.hidden = !card;
    cardSlot.innerHTML = "";
    if (card) {
      const raw = state.build.mods?.[card.mod];
      const on = raw === true || Number(raw) > 0;
      const row = document.createElement("label");
      row.className = "check-row diamond-card-row";
      const hint = card.bonuses ? `<span class="hint"> · ${card.bonuses}</span>` : "";
      row.innerHTML = `<input id="diamondCard" type="checkbox"${on ? " checked" : ""} /><span><span class="diamond-card-name">${card.label}</span>${hint}</span>`;
      row.querySelector("input").addEventListener("change", onBuildChanged);
      cardSlot.appendChild(row);
    }
  }
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
  const mods = { trample: h.showTrample ? $("#trample").checked : false };
  if (h.diamondCard) {
    mods[h.diamondCard.mod] = $("#diamondCard")?.checked ? 1 : 0;
  }
  state.build.mods = mods;
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
        optShowBossReport: $("#optShowBossReport")?.checked !== false,
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
      const reportEl = $("#optShowBossReport");
      if (reportEl) reportEl.checked = data.optShowBossReport !== false;
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
  syncEngineUi();
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
  if ($("#mBossHp")) $("#mBossHp").textContent = "—";
  $("#sMin").textContent = "—";
  $("#sAvg").textContent = "—";
  $("#sMax").textContent = "—";
  renderMatsPerHour(null);
  syncResultEngineBadge();
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
  clearResultUi();
  applyHunterTheme();
  buildLeftLists();
  refreshBudget();
  saveState();
  applyEngineMode(state.engineMode, { silent: true });
  const modeLabel =
    state.engineMode === "offline" ? "Python" : state.engineMode === "rust" ? "Rust/WASM" : "WASM";
  $("#status").textContent = `${h.name} ready · ${modeLabel}`;
}

function engineModeLabel(mode = state.engineMode) {
  if (mode === "offline") return "Python";
  if (mode === "rust") return "Rust/WASM";
  return "WASM (cifi-tools)";
}

/** Normalize engine tags from results / toggles → wasm | offline | rust */
function normalizeEngineId(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "offline" || s === "python" || s.includes("offline") || s.includes("python")) {
    return "offline";
  }
  if (s === "rust" || s.includes("rust")) return "rust";
  return "wasm";
}

function resultEngineLabel(res) {
  return engineModeLabel(normalizeEngineId(res?.engine));
}

function syncResultEngineBadge() {
  const el = $("#resultEngineBadge");
  if (!el) return;
  const res = state.lastResult;
  if (!res) {
    el.textContent = "No results yet";
    el.removeAttribute("data-engine");
    el.classList.remove("is-stale");
    return;
  }
  const resultId = normalizeEngineId(res.engine);
  const selectedId = normalizeEngineId(state.engineMode);
  const label = engineModeLabel(resultId);
  el.dataset.engine = resultId;
  if (resultId !== selectedId) {
    el.classList.add("is-stale");
    el.textContent = `Plot: ${label} · selected ${engineModeLabel(selectedId)} — Run Simulation to refresh`;
  } else {
    el.classList.remove("is-stale");
    el.textContent = `Plot: ${label}`;
  }
}

function syncEngineUi() {
  const field = $("#engineModeField");
  if (field) field.hidden = !OWN_ENGINES_ENABLED;
  const sel = $("#engineMode");
  if (sel) {
    sel.value = OWN_ENGINES_ENABLED ? state.engineMode : "wasm";
    sel.disabled = !OWN_ENGINES_ENABLED;
  }
  const note = $("#hunterNote");
  if (!note) return;
  const h = hunter();
  if (OWN_ENGINES_ENABLED && state.engineMode === "offline") {
    note.innerHTML = `Combat via <strong>OfflineHunt</strong> for <em>Run Simulation</em> (Python HuntStatistics + fight loop). Push/Finder/Next-Best always use cifi-tools WASM. Active: <strong>${h.name}</strong>.`;
  } else if (OWN_ENGINES_ENABLED && state.engineMode === "rust") {
    note.innerHTML = `Combat via our <strong>Rust/WASM</strong> OfflineHunt port for <em>Run Simulation</em>. Push/Finder/Next-Best always use cifi-tools WASM. Active: <strong>${h.name}</strong>.`;
  } else {
    note.innerHTML = `Combat via <code>release.wasm</code> (same engine as
      <a href="https://cifi-tools.com/borge" rel="noopener" target="_blank">cifi-tools</a>).
      Active: <strong>${h.name}</strong>. Builds persist per hunter in this browser.`;
  }
  const sub = $("#appSubtitle");
  if (sub && state.module === "hunters") {
    if (OWN_ENGINES_ENABLED && state.engineMode === "offline") {
      sub.textContent = "Compare builds — OfflineHunt Python sim (extraction port)";
    } else if (OWN_ENGINES_ENABLED && state.engineMode === "rust") {
      sub.textContent = "Compare builds — own Rust/WASM OfflineHunt port";
    } else {
      sub.textContent = "Compare builds and optimize your performance — same WASM engine as cifi-tools";
    }
  }
}

/**
 * Optimizer / Next-Best run thousands of evals.
 * Always use cifi-tools WASM for search; Python / Rust stay for Run Simulation only (v1).
 */
function searchEngine() {
  if (state.wasmExports) {
    try {
      return engineFor(hunter(), state.wasmExports, "wasm");
    } catch {
      /* fall through */
    }
  }
  return state.engine;
}

function applyEngineMode(mode, { silent = false } = {}) {
  let want = "wasm";
  if (OWN_ENGINES_ENABLED) {
    if (mode === "offline") want = "offline";
    else if (mode === "rust") want = "rust";
  } else if (!silent && (mode === "offline" || mode === "rust")) {
    $("#status").textContent = "Python and Rust/WASM are temporarily disabled — using WASM (cifi-tools)";
  }

  if (want === "offline") {
    if (state.hunterId === "knox") {
      if (!silent) {
        $("#status").textContent = "Python sim: Knox not supported yet — staying on WASM";
      }
      state.engineMode = "wasm";
    } else if (!state.offlineApiOk) {
      if (!silent) {
        $("#status").textContent =
          "Python API not available — start with launch.py (not a plain static server)";
      }
      state.engineMode = "wasm";
    } else {
      state.engineMode = "offline";
    }
  } else if (want === "rust") {
    if (state.hunterId === "knox") {
      if (!silent) {
        $("#status").textContent = "Rust/WASM sim: Knox not supported yet — staying on WASM";
      }
      state.engineMode = "wasm";
    } else if (!state.rustSimOk) {
      if (!silent) {
        $("#status").textContent =
          "Rust/WASM sim not available — rebuild rust-sim or pick another engine";
      }
      state.engineMode = "wasm";
    } else {
      state.engineMode = "rust";
    }
  } else {
    state.engineMode = "wasm";
  }

  try {
    if (state.engineMode === "offline") {
      state.engine = engineFor(hunter(), state.wasmExports, "offline");
    } else if (state.engineMode === "rust") {
      state.engine = engineFor(hunter(), state.wasmExports, "rust");
    } else if (state.wasmExports) {
      state.engine = engineFor(hunter(), state.wasmExports, "wasm");
    } else {
      state.engine = null;
    }
  } catch (err) {
    state.engineMode = "wasm";
    state.engine = state.wasmExports ? engineFor(hunter(), state.wasmExports, "wasm") : null;
    if (!silent) $("#status").textContent = err.message || String(err);
  }

  try {
    localStorage.setItem(ENGINE_STORAGE_KEY, state.engineMode);
  } catch {
    /* ignore */
  }
  syncEngineUi();
  syncResultEngineBadge();
  syncActionButtons();
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

function switchModule(moduleId) {
  const id = MODULE_IDS.has(moduleId) ? moduleId : "hunters";
  if (state.module === "mechs" && id !== "mechs" && state.mechsReady) {
    persistMechsState();
  }
  state.module = id;
  document.body.dataset.module = id;

  const huntersEl = $("#moduleHunters");
  const gemsEl = $("#moduleGems");
  const mechsEl = $("#moduleMechs");
  if (huntersEl) huntersEl.hidden = id !== "hunters";
  if (gemsEl) gemsEl.hidden = id !== "gems";
  if (mechsEl) mechsEl.hidden = id !== "mechs";

  $$("#moduleTabs .module-tab").forEach((btn) => {
    btn.setAttribute("aria-selected", String(btn.dataset.module === id));
  });

  const title = $("#appTitle");
  const sub = $("#appSubtitle");
  if (id === "gems") {
    if (title) title.textContent = "Gem Progression";
    if (sub) {
      sub.textContent =
        "Live Ouroboros quality & GU costs — edit your levels, see the next three upgrades and the next unlock";
    }
    if (!state.gemsReady && gemsEl) {
      initGemsModule(gemsEl);
      state.gemsReady = true;
    }
  } else if (id === "mechs") {
    if (title) title.textContent = "Mech Upgrades";
    if (sub) {
      sub.textContent =
        "Compare Unit / Multi / Timer for each mech. Ranked by daily-factor gain per emerald (Tokens: tokens/day per emerald). Emerald costs from Helper v0.03.02 formulas.";
    }
    if (!state.mechsReady && mechsEl) {
      initMechsModule(mechsEl);
      state.mechsReady = true;
    }
  } else {
    if (title) title.textContent = "Hunter Sim";
    syncEngineUi();
  }

  try {
    localStorage.setItem(MODULE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

function setupModuleTabs() {
  $$("#moduleTabs .module-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchModule(btn.dataset.module));
  });
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
  const bossStage = selectedBossStages()[0];
  const bossHpEl = $("#mBossHp");
  if (bossHpEl) {
    if (bossStage == null) {
      bossHpEl.textContent = "—";
    } else {
      const closeness = bossHpRemaining(res, bossStage).toFixed(1);
      const bounds = bossHpRunBounds(res);
      if (bounds && (bounds.worst != null || bounds.best != null)) {
        const w = bounds.worst != null ? Number(bounds.worst).toFixed(1) : "—";
        const b = bounds.best != null ? Number(bounds.best).toFixed(1) : "—";
        bossHpEl.textContent = `${closeness}% · worst ${w}% / best ${b}%`;
      } else {
        bossHpEl.textContent = `${closeness}%`;
      }
    }
  }
  $("#sMin").textContent = res.minStage.toFixed(1);
  $("#sAvg").textContent = res.avgStage.toFixed(1);
  $("#sMax").textContent = res.maxStage.toFixed(1);
  renderMatsPerHour(res);
  renderBuildStats(res.buildStats);
  syncResultEngineBadge();
  redrawCharts();
  const engName = resultEngineLabel(res);
  $("#status").textContent = `Done — ${res.n} runs (${engName}) · ${hunter().name}`;
  $("#progressBar").style.width = "100%";
}

function redrawCharts() {
  const res = state.lastResult;
  if (!res) {
    drawEmpty($("#chartDist"));
    drawEmpty($("#chartOdds"));
    drawEmpty($("#chartRev"));
    syncResultEngineBadge();
    return;
  }
  const engineLabel = resultEngineLabel(res);
  drawBarChart($("#chartDist"), res.stageCounts, { engineLabel });
  drawOddsChart($("#chartOdds"), res.stageOdds, { engineLabel });
  drawReviveChart($("#chartRev"), res.firstRevive, res.secondRevive, { engineLabel });
}

async function runSim() {
  if (!state.engine || state.running || state.optimizing || state.nextBestRunning) return;
  const v = refreshBudget();
  if (!v.ok) {
    $("#status").textContent = `Invalid build: ${v.msg}`;
    return;
  }
  let n = Math.max(1, Number($("#reps").value) || 1);
  const offline = state.engineMode === "offline" || state.engine?.label === "offline";
  const rust = state.engineMode === "rust" || state.engine?.label === "rust";
  // Python is much slower than WASM; keep Run usable. Rust has no 500 cap.
  if (offline && n > 500) {
    $("#status").textContent = `Python caps Sims at 500 for Run Simulation (was ${n}). Use WASM or Rust/WASM for large batches.`;
    n = 500;
    $("#reps").value = "500";
  }
  state.running = true;
  syncActionButtons();
  $("#progressBar").style.width = "15%";
  const engLabel = offline ? "offline" : rust ? "rust" : "wasm";
  $("#status").textContent = offline
    ? `Running ${n} sims (Python · ${hunter().name}) — please wait…`
    : rust
      ? `Running ${n} sims (Rust/WASM · ${hunter().name})…`
      : `Running ${n} sims (wasm · ${hunter().name})…`;
  saveState();

  let pulse = null;
  try {
    await new Promise((r) => setTimeout(r, 30));
    $("#progressBar").style.width = "40%";
    if (offline) {
      let p = 40;
      pulse = setInterval(() => {
        p = Math.min(90, p + 2);
        $("#progressBar").style.width = `${p}%`;
      }, 400);
    } else {
      $("#progressBar").style.width = "55%";
    }
    const wasmRes = await evaluateBuild(state.engine, v.config, n);
    if (pulse) {
      clearInterval(pulse);
      pulse = null;
    }
    const res = hunter().wasmToSimResult(wasmRes, n);
    // Prefer real engine tag (avoid stale cached wasmToSimResult hardcoding "wasm")
    // Keep a stable tag for the plot badge (wasm | offline | rust).
    res.engine = engLabel || wasmRes.engine || state.engine?.label || res.engine || "wasm";
    showResult(res);
  } catch (err) {
    console.error(err);
    $("#status").textContent = `Sim error: ${err.message || err}`;
    $("#progressBar").style.width = "0%";
  } finally {
    if (pulse) clearInterval(pulse);
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
  setupModuleTabs();
  setupHunterTabs();
  setupTabs();

  let savedModule = "hunters";
  try {
    const m = localStorage.getItem(MODULE_STORAGE_KEY);
    if (MODULE_IDS.has(m)) savedModule = m;
  } catch {
    /* ignore */
  }

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
  $("#optShowBossReport").addEventListener("change", saveState);
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
  $("#btnFirstBoss").addEventListener("click", () => runFirstBossFinder());
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
  $("#engineMode")?.addEventListener("change", (e) => {
    applyEngineMode(e.target.value);
    $("#status").textContent = `Engine: ${engineModeLabel()}`;
  });
  window.addEventListener("resize", () => redrawCharts());

  if (OWN_ENGINES_ENABLED) {
    state.offlineApiOk = await probeOfflineApi();
    state.rustSimOk = await probeRustSim();
  } else {
    state.offlineApiOk = false;
    state.rustSimOk = false;
  }
  let preferred = "wasm";
  if (OWN_ENGINES_ENABLED) {
    try {
      const stored = localStorage.getItem(ENGINE_STORAGE_KEY);
      if (stored === "offline" || stored === "wasm" || stored === "rust") preferred = stored;
    } catch {
      /* ignore */
    }
  }

  try {
    state.wasmExports = await loadSharedWasm("./wasm/release.wasm");
    applyEngineMode(preferred, { silent: true });
    const eng = engineModeLabel();
    const notes = [];
    if (OWN_ENGINES_ENABLED) {
      if (!state.offlineApiOk) notes.push("Python API offline (use launch.py)");
      if (!state.rustSimOk) notes.push("Rust/WASM missing");
    }
    const apiNote = notes.length ? ` · ${notes.join(" · ")}` : "";
    $("#status").textContent = saved
      ? `Restored session · ${eng} ready${apiNote}`
      : `${eng} ready — edit build and Run Simulation${apiNote}`;
    syncActionButtons();
  } catch (err) {
    console.error(err);
    $("#status").textContent = `WASM load failed: ${err.message || err}`;
    syncActionButtons();
  }

  switchModule(savedModule);
}

function fmtOptDelta(best, base, digits = 1) {
  const d = Number(best) - Number(base);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-9) return { text: "—", cls: "" };
  return { text: fmtDelta(d, digits), cls: d > 0 ? "is-up" : "is-down" };
}

function optReportCell(value, cls = "") {
  return `<span class="v${cls ? ` ${cls}` : ""}">${value}</span>`;
}

function pushLiftText(factor) {
  const lift = Number(factor.lift) || 0;
  const digits = Number.isFinite(Number(factor.digits)) ? Number(factor.digits) : 1;
  if (lift > 0.0001) return `+${lift.toFixed(digits)}`;
  if (lift < -0.0001) return lift.toFixed(digits);
  return "0";
}

function pushFactorPlotMarkup(factors, labels) {
  const primary = factors.filter((factor) => factor.unit && factor.unit === factor.primaryUnit);
  const maxLift = primary.reduce((mx, factor) => Math.max(mx, Number(factor.lift) || 0), 0);
  return factors.map((factor) => {
    const lift = Number(factor.lift) || 0;
    const sameUnit = !factor.primaryUnit || factor.unit === factor.primaryUnit;
    const pct = sameUnit && maxLift > 0 ? Math.max(0, lift) / maxLift * 100 : (lift > 0 ? 18 : 0);
    const level = factor.level > 0 ? String(factor.level) : "off";
    const unit = factor.unit ? ` ${escapeReportText(factor.unit)}` : "";
    return `<div class="factor-plot-row">
      <span class="factor-plot-name">${factorName(labels, factor.key)}</span>
      <span class="factor-plot-lvl">${escapeReportText(level)}</span>
      <span class="factor-plot-track" aria-hidden="true"><span class="factor-plot-bar" style="width:${pct.toFixed(1)}%"></span></span>
      <span class="factor-plot-lift${lift > 0 ? " is-up" : ""}">${pushLiftText(factor)}${unit}</span>
    </div>`;
  }).join("");
}

function pushBestLine(factors, kind, title, labels) {
  const factor = factors.find((row) => row.kind === kind && row.beats && row.level > 0);
  if (!factor) return `<p class="boss-find-lead">${title}: none beat off.</p>`;
  const base = Number(factor.baseLevel) || 0;
  const vs = base > 0 ? `level ${base}` : "off";
  return `<p class="boss-find-lead">${title}: ${factorName(labels, factor.key)} at ${factor.level} · ${pushLiftText(factor)} ${escapeReportText(factor.unit || "")} vs ${vs}</p>`;
}

function pushLockNote(screen, labels) {
  const locks = Array.isArray(screen.locks) ? screen.locks : [];
  const tops = locks.filter((lock) => lock.reason === "top" && lock.level > 0);
  const parents = locks.filter((lock) => lock.reason === "parent");
  const off = locks.filter((lock) => lock.reason === "off");
  const parts = [];
  if (tops.length) {
    const [first] = tops;
    parts.push(`${labels[first.key] || first.key} stays at ${first.level} because it was the largest clear gain in screen 1.`);
  } else {
    parts.push("Screen 1 had no clear gain, so nothing was locked on.");
  }
  if (parents.length) {
    parts.push(`${parents.map((lock) => `${labels[lock.key] || lock.key} stays at ${lock.level}`).join(", ")} so a skill that needs it can be screened.`);
  }
  if (off.length) {
    parts.push(`Left off after screen 1: ${off.map((lock) => labels[lock.key] || lock.key).join(", ")}.`);
  }
  return parts.join(" ");
}

function pushScreenRank(screen, objective) {
  if (objective === "bosses" && screen?.rankBy === "bossHp") return "bossHp";
  return objective;
}

function pushMetricText(screen, objective) {
  if (!screen) return "—";
  if (pushScreenRank(screen, objective) === "bossHp") {
    const value = Number(screen.bossHp);
    return Number.isFinite(value) ? `${value.toFixed(1)} boss HP` : "—";
  }
  if (objective === "bosses") {
    const value = Number(screen.bossesPerDay);
    return Number.isFinite(value) ? `${value.toFixed(2)} bosses/day` : "—";
  }
  if (objective === "loot") {
    const value = Number(screen.lootScore);
    return Number.isFinite(value) ? `${value.toFixed(1)} loot/min` : "—";
  }
  const value = Number(screen.avgStage);
  return Number.isFinite(value) ? `Ø ${value.toFixed(2)}` : "—";
}

function pushPhaseValue(screen, objective) {
  if (!screen) return null;
  if (pushScreenRank(screen, objective) === "bossHp") return Number(screen.bossHp);
  if (objective === "bosses") return Number(screen.bossesPerDay);
  if (objective === "loot") return Number(screen.lootScore);
  return Number(screen.avgStage);
}

function pushCompare(screens, objective) {
  const rows = (screens || []).filter((screen) => Number.isFinite(pushPhaseValue(screen, objective)) && screen.rows);
  if (rows.length < 2) return "";
  const first = pushPhaseValue(rows[0], objective);
  const values = rows.map((screen) => pushPhaseValue(screen, objective));
  const hpMode = rows.some((screen) => pushScreenRank(screen, objective) === "bossHp");
  const best = hpMode ? Math.min(...values) : Math.max(...values);
  const span = hpMode
    ? Math.max(0.0001, Math.max(...values) - best)
    : Math.max(0.0001, best);
  const body = rows.map((screen) => {
    const value = pushPhaseValue(screen, objective);
    const delta = hpMode ? first - value : value - first;
    const shown = delta > 0.0001 ? `+${delta.toFixed(2)}` : delta < -0.0001 ? delta.toFixed(2) : "0";
    const cls = delta > 0.0001 ? "is-up" : delta < -0.0001 ? "is-down" : "";
    const width = hpMode
      ? Math.max(0, (Math.max(...values) - value) / span) * 100
      : Math.max(0, value) / span * 100;
    const deltaCell = screen === rows[0] ? "<td>—</td>" : `<td class="${cls}">${shown}</td>`;
    return `<tr>
      <th>${escapeReportText(screen.title || "Screen")}</th>
      <td>${pushMetricText(screen, objective)}</td>
      ${deltaCell}
      <td><span class="factor-plot-track"><span class="factor-plot-bar" style="width:${width.toFixed(1)}%"></span></span></td>
    </tr>`;
  }).join("");
  return `<h3 class="factor-screen-title">Funnel</h3>
    <table class="boss-find-table">
      <thead><tr><th></th><th>Best</th><th>vs first</th><th></th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="boss-find-note">Best is the running champion. It stays or goes up. Higher is better.</p>`;
}

function pushBuildBlock(screen, labels, costs, objective) {
  if (!screen?.talents || !screen?.attributes) return "";
  const talents = spendRows(
    orderedSpendKeys(costs.TALENT_ORDER, screen.talents),
    screen.talents,
    costs.TALENT_COSTS || {},
    labels,
  );
  const attrs = spendRows(
    orderedSpendKeys(costs.ATTR_ORDER, screen.attributes),
    screen.attributes,
    costs.ATTRIBUTE_COSTS || {},
    labels,
  );
  const talentBody = talents.lines.length
    ? `<tr class="sec"><th colspan="3">Talents</th></tr>${talents.lines.join("")}`
    : `<tr class="sec"><th colspan="3">Talents</th></tr><tr><th colspan="3">None on</th></tr>`;
  const attrBody = attrs.lines.length
    ? `<tr class="sec"><th colspan="3">Attributes</th></tr>${attrs.lines.join("")}`
    : `<tr class="sec"><th colspan="3">Attributes</th></tr><tr><th colspan="3">None on</th></tr>`;
  return `<h3 class="factor-screen-title">Best build</h3>
    <p class="boss-find-lead">${pushMetricText(screen, objective)} · ${talents.points} talent points · ${attrs.points} attribute points</p>
    <table class="boss-find-table">
      <thead><tr><th>Skill</th><th>Level</th><th>Points</th></tr></thead>
      <tbody>${talentBody}${attrBody}</tbody>
    </table>
    <p class="boss-find-note">${screen.kept ? "This is the running champion carried into this phase. This phase did not beat it." : "This is the best row in the last phase."} Apply writes it onto the hunter.</p>`;
}

function pushScreenBlock(screen, labels, result) {
  const factors = Array.isArray(screen.factors) ? screen.factors : [];
  const metric = pushMetricText(screen, result.objective);
  if (!screen.rows) {
    return `<h3 class="factor-screen-title">${escapeReportText(screen.title || "Screen")}</h3>
      <p class="boss-find-lead">No legal builds at this budget.</p>
      <p class="boss-find-note">${escapeReportText(pushLockNote(screen, labels))}</p>`;
  }
  const dropped = Array.isArray(screen.dropped) ? screen.dropped : [];
  const droppedText = dropped.length
    ? ` Intermediate levels left out of this grid: ${dropped.map((key) => labels[key] || key).join(", ")}.`
    : "";
  const talentDump = factorName(labels, result.talentFiller);
  const attrDump = factorName(labels, result.attrFiller);
  const leftover = `Leftover talent points go to ${talentDump}. Leftover attribute points go to ${attrDump}.`;
  const note = screen.kind === "screen2"
    ? `${pushLockNote(screen, labels)} Other skills that beat off are stepped. ${result.sims} sims per build. ${leftover}`
    : screen.kind === "refine"
      ? `Holds the running champion and steps the cheap levels of the skills this funnel ranked, plus a 5-point split between ${talentDump} and ${factorName(labels, result.luckyKey)} and between ${attrDump} and ${factorName(labels, result.shiftAttr)}. ${result.sims} sims per build.`
      : `Bars are the gain versus off, largest clear gain first. ${result.sims} sims per build. Call Me Lucky Loot and Timeless Mastery are free factors. ${leftover}`;
  const summary = factors.length
    ? `${pushBestLine(factors, "talent", "Talent", labels)}
    ${pushBestLine(factors, "attribute", "Attribute", labels)}`
    : `<p class="boss-find-lead">No skill still moves in this screen.</p>`;
  const costs = hunter().costs || {};
  return `<h3 class="factor-screen-title">${escapeReportText(screen.title || "Screen")}</h3>
    <p class="boss-find-lead">${screen.rows} builds · best ${escapeReportText(metric)}</p>
    ${summary}
    <div class="factor-plot" role="img" aria-label="${escapeReportText(screen.title || "Screen")} skills ranked by gain versus off">${pushFactorPlotMarkup(factors, labels)}</div>
    <p class="boss-find-note">${escapeReportText(note)}${droppedText ? ` ${escapeReportText(droppedText.trim())}` : ""}</p>
    ${screen.kind === "refine" ? `${pushCompare(result.screens, result.objective)}${pushBuildBlock(screen, labels, costs, result.objective)}` : ""}`;
}

function pushScreenReport(result) {
  const costs = hunter().costs || {};
  const labels = { ...(costs.TALENT_LABELS || {}), ...(costs.ATTRIBUTE_LABELS || {}) };
  const screens = Array.isArray(result.screens) ? result.screens : [];
  return screens.map((screen) => pushScreenBlock(screen, labels, result)).join("");
}

/** Always-on post-optimize report. Returns true only if user applies an improved build. */
async function showOptReport({ mode, modeLabel, result, bossStages, showPlots = true }) {
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

  const noiseBlocked = !!result.noiseBlocked;
  const confirmRank = result.confirmRank || mode;
  const baseHp = Number(baseSc.bossHp);
  const bestHp = Number(bestSc.bossHp);
  const dHp =
    Number.isFinite(baseHp) && Number.isFinite(bestHp) ? fmtOptDelta(baseHp, bestHp, 1) : { text: "—", cls: "" };

  let primaryLine;
  if (mode === "bosses" && confirmRank === "bossHp") {
    primaryLine = `Boss HP ${Number.isFinite(bestHp) ? bestHp.toFixed(1) : "—"} (was ${Number.isFinite(baseHp) ? baseHp.toFixed(1) : "—"}, ${dHp.text}) · cold-start (no clears yet) · targets ${(bossStages || []).join(", ") || "—"}`;
  } else if (mode === "bosses") {
    primaryLine = `Bosses/day ${bestBosses.toFixed(1)} (was ${baseBosses.toFixed(1)}, ${dBosses.text}) · targets ${(bossStages || []).join(", ") || "—"}`;
  } else if (mode === "loot") {
    primaryLine = `Loot ${bestLoot.toFixed(1)} (was ${baseLoot.toFixed(1)}, ${dLoot.text})`;
  } else {
    primaryLine = `Ø Stage ${bestStage.toFixed(1)} (was ${baseStage.toFixed(1)}, ${dStage.text})`;
  }

  const noise = result.noise;
  const noiseLine = noiseBlocked && noise
    ? `<p class="opt-report-meta">Funnel winner looked better by raw mean (gain ${Number(noise.gain).toFixed(2)}), but that is within simulation noise (need &gt; ${Number(noise.need).toFixed(2)}, SE ${Number(noise.se).toFixed(2)}). Not offered to apply.</p>`
    : "";

  $("#optConfirmTitle").textContent = improved ? `${modeLabel} — improvement found` : `${modeLabel} — report`;
  body.classList.remove("is-boss-find");
  body.innerHTML = `
    <p class="opt-report-summary">
      <strong>${improved ? "Improved vs baseline" : noiseBlocked ? "Within simulation noise" : "No improvement"}</strong><br />
      ${primaryLine}
    </p>
    ${noiseLine}
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
      ${result.funnel
        ? `${result.rows} builds · ${result.sims} sims each · confirm ${result.nRefine} sims`
        : `${result.evals} evals · ${result.loops || 1} iteration(s) · screen ${result.nSearch} / refine ${result.nRefine} sims`}
      ${mode === "bosses" ? `<br />Boss targets: ${(bossStages || []).join(", ") || "—"}` : ""}
      ${mode === "loot" && !result.funnel ? "<br />Timeless Mastery 5: required" : ""}
    </p>
    ${result.funnel && showPlots ? pushScreenReport(result) : ""}
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

function formatOptProgressExtra({ objective, stage, loot, bossesPerDay, bossHp }) {
  if (objective === "bosses") {
    const parts = [];
    if (bossHp != null && (bossesPerDay == null || Number(bossesPerDay) <= 1e-12)) {
      parts.push(`best ${Number(bossHp).toFixed(1)} boss HP`);
    } else if (bossesPerDay != null) {
      parts.push(`best ${Number(bossesPerDay).toFixed(1)} bosses/d`);
    }
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
      searchEngine(),
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
    const betterN = result.results.filter((r) => r.better).length;
    const doneMsg = best
      ? `${title} done · ${n} sims/${unitLabel} · ${betterN} above baseline · best +1: ${label} (${d} Ø)` +
        ` · Baseline Ø ${result.baselineScore.avgStage.toFixed(1)}`
      : `${title} done · ${n} sims/${unitLabel} · no +1 above baseline` +
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

function escapeReportText(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function factorName(labels, key) {
  return escapeReportText(labels[key] || key);
}

function factorPlotMarkup(factors, labels) {
  const maxLift = factors.reduce((mx, factor) => Math.max(mx, Number(factor.lift) || 0), 0);
  return factors.map((factor) => {
    const lift = Number(factor.lift) || 0;
    const pct = maxLift > 0 ? Math.max(0, lift) / maxLift * 100 : 0;
    const level = factor.level > 0 ? String(factor.level) : "off";
    const liftText = lift > 0 ? `−${lift.toFixed(1)}%` : "0";
    return `<div class="factor-plot-row">
      <span class="factor-plot-name">${factorName(labels, factor.key)}</span>
      <span class="factor-plot-lvl">${escapeReportText(level)}</span>
      <span class="factor-plot-track" aria-hidden="true"><span class="factor-plot-bar" style="width:${pct.toFixed(1)}%"></span></span>
      <span class="factor-plot-lift${lift > 0 ? " is-up" : ""}">${liftText}</span>
    </div>`;
  }).join("");
}

function factorBestLine(factors, kind, title, labels) {
  const rows = factors.filter((row) => row.kind === kind);
  if (!rows.length) return "";
  const factor = rows.find((row) => row.level > 0 && row.lift > 0);
  if (!factor) return `<p class="boss-find-lead">${title}: none beat the baseline.</p>`;
  const base = Number(factor.baseLevel) || 0;
  const vs = base > 0 ? `level ${base}` : "off";
  return `<p class="boss-find-lead">${title}: ${factorName(labels, factor.key)} at ${factor.level} · −${factor.lift.toFixed(1)}% boss HP vs ${vs}</p>`;
}

function screen2LockNote(screen, labels) {
  const locks = Array.isArray(screen.locks) ? screen.locks : [];
  const tops = locks.filter((lock) => lock.reason === "top" && lock.level > 0);
  const parents = locks.filter((lock) => lock.reason === "parent");
  const off = locks.filter((lock) => lock.reason === "off");
  const fixed = locks.filter((lock) => lock.reason === "fixed" && Number(lock.level) === 0);
  const parts = [];
  if (tops.length) {
    const [first, ...rest] = tops;
    parts.push(`${labels[first.key] || first.key} stays at ${first.level} because it was the largest drop in screen 1.`);
    if (rest.length) {
      parts.push(`Held at the screen-1 level: ${rest.map((lock) => `${labels[lock.key] || lock.key} at ${lock.level}`).join(", ")}.`);
    }
  } else {
    parts.push("Screen 1 had no skill that beat off, so nothing was locked on.");
  }
  if (parents.length) {
    parts.push(`${parents.map((lock) => `${labels[lock.key] || lock.key} stays at ${lock.level}`).join(", ")} so a skill that needs it can be screened.`);
  }
  if (off.length) {
    parts.push(`Left off after screen 1: ${off.map((lock) => labels[lock.key] || lock.key).join(", ")}.`);
  }
  if (fixed.length) {
    parts.push(`Stays at 0 at this budget: ${fixed.map((lock) => labels[lock.key] || lock.key).join(", ")}.`);
  }
  return parts.join(" ");
}

function pairLevelLabel(level) {
  return level > 0 ? String(level) : "off";
}

function pairSection(pairs, labels, title = "Pairs") {
  if (!pairs.length) return "";
  const tables = pairs.map((pair) => {
    const head = pair.bLevels.map((level) => `<th>${escapeReportText(pairLevelLabel(level))}</th>`).join("");
    const body = pair.aLevels.map((level, row) => {
      const cells = pair.bLevels.map((unused, col) => {
        const mean = pair.means[row][col];
        if (!Number.isFinite(mean)) return "<td>—</td>";
        const best = Number.isFinite(pair.best) && Math.abs(mean - pair.best) < 0.05;
        return `<td class="${best ? "is-best" : ""}">${mean.toFixed(1)}%</td>`;
      }).join("");
      return `<tr><th>${escapeReportText(pairLevelLabel(level))}</th>${cells}</tr>`;
    }).join("");
    return `<div class="factor-pair">
      <p class="boss-find-lead">${factorName(labels, pair.keyA)} × ${factorName(labels, pair.keyB)} · ${escapeReportText(pair.screen)}</p>
      <table class="boss-find-table">
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
  }).join("");
  return `<h3 class="factor-screen-title">${escapeReportText(title)}</h3>
    <p class="boss-find-note">Mean boss HP still left. The lowest cell is closest to the kill. A pair is shown from the screen where both skills actually vary.</p>
    ${tables}`;
}

function signedHp(delta) {
  const abs = Math.abs(delta).toFixed(1);
  if (delta > 0.05) return { text: `−${abs}%`, cls: "is-up" };
  if (delta < -0.05) return { text: `+${abs}%`, cls: "is-down" };
  return { text: "0", cls: "" };
}

function refineStepBlock(screen, labels) {
  const steps = Array.isArray(screen.steps) ? screen.steps : [];
  if (!steps.length) return "";
  const flat = steps.flatMap((row) => row.steps.map((step) => ({ ...step, key: row.key })));
  const maxPer = flat.reduce((mx, step) => Math.max(mx, step.perPoint), 0);
  const rows = flat.map((step) => {
    const hp = signedHp(step.dHp);
    const per = signedHp(step.perPoint);
    const width = maxPer > 0 ? Math.max(0, step.perPoint) / maxPer * 100 : 0;
    return `<div class="factor-plot-row">
      <span class="factor-plot-name">${factorName(labels, step.key)} ${step.from} → ${step.to}</span>
      <span class="factor-plot-lvl">${step.dPts}</span>
      <span class="factor-plot-track" aria-hidden="true"><span class="factor-plot-bar" style="width:${width.toFixed(1)}%"></span></span>
      <span class="factor-plot-lift ${per.cls}">${per.text}/pt</span>
    </div>
    <p class="boss-find-note">${hp.text} boss HP for ${step.dPts} points.</p>`;
  }).join("");
  return `<h3 class="factor-screen-title">Steps</h3>
    <p class="boss-find-note">Boss HP removed per attribute point on each step up. A longer bar is a better purchase. A red figure means that step left more boss HP.</p>
    <div class="factor-plot" role="img" aria-label="Boss HP removed per point on each refinement step">${rows}</div>`;
}

function bossHpCompare(screens) {
  const rows = (screens || []).filter((screen) => Number.isFinite(Number(screen.bossHp)) && screen.rows);
  if (rows.length < 2) return "";
  const first = Number(rows[0].bossHp);
  const worst = Math.max(...rows.map((screen) => Number(screen.bossHp)));
  const body = rows.map((screen) => {
    const hp = Number(screen.bossHp);
    const own = Number.isFinite(Number(screen.ownBossHp)) ? Number(screen.ownBossHp) : hp;
    const delta = hp - first;
    const shown = signedHp(-delta);
    const width = worst > 0 ? hp / worst * 100 : 0;
    const deltaCell = screen === rows[0] ? "<td>—</td>" : `<td class="${shown.cls}">${shown.text}</td>`;
    const ownText = `${own.toFixed(1)}%`;
    return `<tr>
      <th>${escapeReportText(screen.title || "Screen")}</th>
      <td>${hp.toFixed(1)}%</td>
      <td>${ownText}</td>
      ${deltaCell}
      <td><span class="factor-plot-track"><span class="factor-plot-bar" style="width:${width.toFixed(1)}%"></span></span></td>
    </tr>`;
  }).join("");
  return `<h3 class="factor-screen-title">Boss HP</h3>
    <table class="boss-find-table">
      <thead><tr><th></th><th>Best</th><th>This phase</th><th>vs first</th><th></th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="boss-find-note">Best is the running champion. It stays or goes down. This phase is what that grid found on its own. Lower boss HP is closer to the kill.</p>`;
}

function orderedSpendKeys(order, spend) {
  const seen = new Set();
  const keys = [];
  for (const key of order || []) {
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  for (const key of Object.keys(spend || {})) {
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

function spendRows(keys, spend, costMap, labels) {
  const lines = [];
  let points = 0;
  for (const key of keys) {
    const level = Number(spend[key]) || 0;
    if (!level) continue;
    const pts = level * Number(costMap[key]?.cost || 1);
    points += pts;
    lines.push(`<tr><th>${factorName(labels, key)}</th><td>${level}</td><td>${pts}</td></tr>`);
  }
  return { lines, points };
}

function winningBuildBlock(screen, labels, costs, heading = "Best build", note) {
  if (!screen?.talents || !screen?.attributes) return "";
  const talentCost = costs.TALENT_COSTS || {};
  const attrCost = costs.ATTRIBUTE_COSTS || {};
  const talents = spendRows(
    orderedSpendKeys(costs.TALENT_ORDER, screen.talents),
    screen.talents,
    talentCost,
    labels,
  );
  const attrs = spendRows(
    orderedSpendKeys(costs.ATTR_ORDER, screen.attributes),
    screen.attributes,
    attrCost,
    labels,
  );
  const talentBody = talents.lines.length
    ? `<tr class="sec"><th colspan="3">Talents</th></tr>${talents.lines.join("")}`
    : `<tr class="sec"><th colspan="3">Talents</th></tr><tr><th colspan="3">None on</th></tr>`;
  const attrBody = attrs.lines.length
    ? `<tr class="sec"><th colspan="3">Attributes</th></tr>${attrs.lines.join("")}`
    : `<tr class="sec"><th colspan="3">Attributes</th></tr><tr><th colspan="3">None on</th></tr>`;
  const hp = Number(screen.bossHp);
  const hpText = Number.isFinite(hp) ? `${hp.toFixed(1)}% boss HP` : "the refinement winner";
  const noteText = note || `${screen.kept ? "This is the running champion carried into this phase. This phase did not beat it." : "This is the lowest remaining boss HP, not the average of the bars."} Apply, when offered, writes the highest bosses/day build instead.`;
  return `<h3 class="factor-screen-title">${escapeReportText(heading)}</h3>
    <p class="boss-find-lead">${hpText} · ${talents.points} talent points · ${attrs.points} attribute points</p>
    <table class="boss-find-table">
      <thead><tr><th>Skill</th><th>Level</th><th>Points</th></tr></thead>
      <tbody>${talentBody}${attrBody}</tbody>
    </table>
    <p class="boss-find-note">${escapeReportText(noteText)}</p>`;
}

function bossLeftoverNote(result, labels) {
  const talentDump = factorName(labels, result.talentFiller || "presence_of_god");
  const attrDump = factorName(labels, result.attrFiller || "soul_of_ares");
  return `Leftover talent points go to ${talentDump}. Leftover attribute points go to ${attrDump}.`;
}

function bossRefineNote(result, labels) {
  const names = (Array.isArray(result.refineChain) ? result.refineChain : [])
    .map((key) => factorName(labels, key));
  const chainText = names.length
    ? `Holds each screen-2 winner and steps the cheap levels of ${names.join(", ")}.`
    : "Holds each screen-2 winner and steps the cheap levels those grids skipped.";
  return `${chainText} ${result.sims} sims per build. ${bossLeftoverNote(result, labels)}`;
}

function factorScreenBlock(screen, labels, result) {
  const bossHp = Number(screen.bossHp);
  const bossHpText = Number.isFinite(bossHp) ? `${bossHp.toFixed(1)}%` : "—";
  const day = Number(screen.bossesPerDay);
  const dayText = Number.isFinite(day) ? ` · ${day.toFixed(1)} bosses/d in this screen` : "";
  const factors = Array.isArray(screen.factors) ? screen.factors : [];
  if (!screen.rows) {
    const emptyNote = screen.kind === "refine"
      ? "No legal builds for the cheap chain steps at this budget."
      : screen2LockNote(screen, labels);
    return `<h3 class="factor-screen-title">${escapeReportText(screen.title || "Screen")}</h3>
      <p class="boss-find-lead">No legal builds at this budget.</p>
      <p class="boss-find-note">${escapeReportText(emptyNote)}</p>`;
  }
  const costs = hunter().costs || {};
  const leftover = bossLeftoverNote(result, labels);
  const note = screen.kind === "screen2"
    ? `${screen2LockNote(screen, labels)} Other skills that beat off are stepped. Same score, ${result.sims} sims per build. ${leftover} Bosses/day is recorded and does not change these locks.`
    : screen.kind === "refine"
      ? `${bossRefineNote(result, labels)} Bosses/day is recorded and does not change these locks.`
      : `Bars are closeness to the kill versus off, largest drop first. Lower is better. Clears pull the score toward 0%. Never reaching boss ${result.bossStage} stays high. A WASM 0% while still on the boss uses how many runs reached it instead. ${result.sims} sims per build. ${leftover} Bosses/day is recorded and does not change these locks.`;
  const fixed = screen.kind === "screen1"
    ? (screen.fixed || []).filter((factor) => Number(factor.level) === 0)
    : [];
  const fixedText = fixed.length
    ? ` Stays at 0 here: ${fixed.map((factor) => labels[factor.key] || factor.key).join(", ")}.`
    : "";
  const summary = factors.length
    ? `${factorBestLine(factors, "talent", "Talent", labels)}
    ${factorBestLine(factors, "attribute", "Attribute", labels)}`
    : `<p class="boss-find-lead">No skill still moves in this screen.</p>`;
  const ownHp = Number(screen.ownBossHp);
  const keptLine = screen.kept && Number.isFinite(ownHp) && ownHp > Number(screen.bossHp) + 0.05
    ? `<p class="boss-find-note">Kept the previous best at ${Number(screen.bossHp).toFixed(1)}% boss HP. This phase's own best was ${ownHp.toFixed(1)}%.</p>`
    : "";
  return `<h3 class="factor-screen-title">${escapeReportText(screen.title || "Screen")}</h3>
    <p class="boss-find-lead">${screen.rows} builds · best ${bossHpText} boss HP${dayText}</p>
    ${bossHpRunStatsHtml(screen, result.bossStage, "Screen winner")}
    ${keptLine}
    ${summary}
    <div class="factor-plot" role="img" aria-label="${escapeReportText(screen.title || "Screen")} skills ranked by boss HP removed versus off">${factorPlotMarkup(factors, labels)}</div>
    <p class="boss-find-note">${escapeReportText(note)}${fixedText ? ` ${escapeReportText(fixedText.trim())}` : ""}</p>
    ${screen.kind === "refine" ? `${refineStepBlock(screen, labels)}${bossHpCompare(result.screens)}${winningBuildBlock(screen, labels, costs)}${pairSection(screen.pairs || [], labels, "Refinement pairs")}` : ""}`;
}

/** WASM per-batch min/max remaining boss HP (percent). Null when missing. */
function bossHpRunBounds(row) {
  if (!row) return null;
  const worst = Number(row.bossHpWorst);
  const best = Number(row.bossHpBest);
  const killRate = Number(row.bossKillRate) || Number(row.clearRate) || 0;
  const hasWorst = Number.isFinite(worst) && worst >= 0;
  const hasBest = Number.isFinite(best) && best >= 0;
  if (!hasWorst && !hasBest && !(killRate > 0)) return null;
  return {
    worst: hasWorst ? worst : killRate > 0 ? 0 : null,
    best: killRate > 0 ? 0 : hasBest ? best : null,
    killed: killRate > 0,
  };
}

function bossHpRunStatsHtml(row, bossStage, title = null) {
  const bounds = bossHpRunBounds(row);
  if (!bounds) return "";
  const stage = bossStage != null ? `Boss ${bossStage}` : "Boss";
  const head = title ? `${escapeReportText(title)} · ${stage}` : stage;
  const worst =
    bounds.worst != null ? `${Number(bounds.worst).toFixed(1)}% HP left` : "—";
  const best =
    bounds.best != null ? `${Number(bounds.best).toFixed(1)}% HP left` : "—";
  return `<div class="boss-hp-runs">
    <div class="boss-hp-runs-title">${head}</div>
    <div class="boss-hp-runs-row"><span class="k">Worst run</span><span class="v">${worst}</span></div>
    <div class="boss-hp-runs-row"><span class="k">Best run</span><span class="v">${best}</span></div>
  </div>`;
}

function bossConfirmTable(result) {
  const confirms = Array.isArray(result.confirm) ? result.confirm : [];
  const base = result.baselineConfirm;
  if (!confirms.length && !base) return "";
  const sims = Number(result.confirmSims) || 500;
  const rowHtml = (row, label) => {
    if (!row) return "";
    const clears = Number(row.clearRuns) || 0;
    const total = Number(row.sims) || sims;
    const hp = Number(row.bossHp);
    const day = Number(row.bossesPerDay) || 0;
    const pick = result.pick && row === result.pick ? " ★" : "";
    const bounds = bossHpRunBounds(row);
    const range = bounds
      ? `${bounds.worst != null ? Number(bounds.worst).toFixed(1) : "—"} / ${bounds.best != null ? Number(bounds.best).toFixed(1) : "—"}`
      : "—";
    return `<tr><th>${escapeReportText(label)}${pick}</th><td>${clears}/${total}</td><td>${Number.isFinite(hp) ? `${hp.toFixed(1)}%` : "—"}</td><td>${range}</td><td>${day.toFixed(2)}</td></tr>`;
  };
  const body = [
    rowHtml(base, "Current"),
    ...confirms.map((row, index) => rowHtml(row, `Candidate ${index + 1}`)),
  ].join("");
  const pickStats = bossHpRunStatsHtml(result.pick || result, result.bossStage, result.pick ? "Confirm pick" : "Screen winner");
  const baseStats = bossHpRunStatsHtml(base, result.bossStage, "Current");
  return `<h3 class="factor-screen-title">500-sim confirm</h3>
    <p class="boss-find-lead">Clears are runs that ended past boss ${result.bossStage}. Boss HP is a closeness score (lower better): clear rate, then real remaining HP when WASM reports it, else how many runs reached the boss. Worst/Best run are raw remaining HP left on the boss across the confirm batch. Screening used ${result.sims} sims.</p>
    <div class="boss-hp-runs-grid">${baseStats}${pickStats}</div>
    <table class="boss-find-table">
      <thead><tr><th>Build</th><th>Clears</th><th>Boss HP</th><th>Worst / Best</th><th>Bosses/day</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function factorScreenReport(result) {
  const costs = hunter().costs || {};
  const labels = { ...(costs.TALENT_LABELS || {}), ...(costs.ATTRIBUTE_LABELS || {}) };
  const screens = Array.isArray(result.screens) && result.screens.length
    ? result.screens
    : [{ ...result, title: "Screen 1", kind: "screen1" }];
  const main = screens.filter((screen) => screen.kind !== "refine");
  const refine = screens.filter((screen) => screen.kind === "refine");
  const blocks = main.map((screen) => factorScreenBlock(screen, labels, result)).join("");
  const refineBlocks = refine.map((screen) => factorScreenBlock(screen, labels, result)).join("");
  const farmDay = Number(result.farm?.bossesPerDay);
  const baseDay = Number(result.baselineBossesPerDay);
  const farmText = Number.isFinite(farmDay) ? farmDay.toFixed(1) : "—";
  const baseText = Number.isFinite(baseDay) ? baseDay.toFixed(1) : "—";
  const pick = result.pick;
  const pickClears = pick ? `${Number(pick.clearRuns) || 0}/${Number(pick.sims) || result.confirmSims || 500}` : "—";
  const baseClears = result.baselineConfirm
    ? `${Number(result.baselineConfirm.clearRuns) || 0}/${Number(result.baselineConfirm.sims) || result.confirmSims || 500}`
    : "—";
  const noise = result.noise;
  const verdict = result.confirmImproved
    ? "That confirm winner can be applied. Skills were still locked by remaining boss HP during the screens. Apply requires a clear-rate gain above simulation noise."
    : result.noiseBlocked
      ? `Confirm looked better by raw clears, but the gain is within simulation noise (need &gt; ${(Number(noise?.need) * 100).toFixed(1)}% clear rate). Nothing is written.`
      : "Confirm did not beat the current hunter, so nothing is written. Skills were ranked by remaining boss HP.";
  return `
    <p class="boss-find-lead">Level ${result.level} · boss ${result.bossStage} · ${result.talentPoints} talent points · ${result.attributePoints} attribute points</p>
    ${bossConfirmTable(result)}
    <p class="boss-find-lead">Best confirm clears: ${pickClears} (current ${baseClears}). Screening bosses/day high: ${farmText} (current ${baseText}). ${verdict}</p>
    ${pick ? winningBuildBlock(pick, labels, costs, "Confirm pick", `${pickClears} clears · ${(Number(pick.bossesPerDay) || 0).toFixed(2)} bosses/day at ${Number(pick.sims) || result.confirmSims || 500} sims. Apply writes this build when it beats the current hunter.`) : ""}
    ${result.farm ? winningBuildBlock(result.farm, labels, costs, "Highest bosses/day (screening)", `${farmText} bosses/day at ${result.sims} sims. Not used to lock skills.`) : ""}
    ${blocks}
    ${pairSection(Array.isArray(result.pairs) ? result.pairs : [], labels)}
    ${refineBlocks}
  `;
}

/** Boss-finder report. Returns true only when the user applies the confirm pick. */
async function showBossFinderReport({ result, showPlots, offerApply }) {
  const modal = $("#optConfirmModal");
  const body = $("#optConfirmBody");
  const btnClose = $("#btnOptReportClose");
  const btnDiscard = $("#btnOptDiscard");
  const btnApply = $("#btnOptApply");
  const pick = result.pick;
  const pickClears = pick ? `${Number(pick.clearRuns) || 0}/${Number(pick.sims) || result.confirmSims || 500}` : "—";
  const baseClears = result.baselineConfirm
    ? `${Number(result.baselineConfirm.clearRuns) || 0}/${Number(result.baselineConfirm.sims) || result.confirmSims || 500}`
    : "—";
  const ask = offerApply
    ? `<p class="opt-report-ask">Apply talents &amp; attributes from the confirm pick (${pickClears} clears)?</p>`
    : "";
  const plots = showPlots ? factorScreenReport(result) : "";
  const summary = offerApply && !showPlots
    ? `<p class="opt-report-summary"><strong>Stronger confirm</strong><br />${pickClears} clears (current ${baseClears}) · ${(Number(pick?.bossesPerDay) || 0).toFixed(2)} bosses/d. Screens still ranked by remaining boss HP.</p>${bossConfirmTable(result)}`
    : !showPlots && pick
      ? bossConfirmTable(result)
      : "";
  $("#optConfirmTitle").textContent = offerApply ? "First Bosskill Finder — confirm pick" : "First Bosskill Finder";
  body.classList.toggle("is-boss-find", !!showPlots);
  body.innerHTML = `${summary}${plots}${ask}`;
  btnClose.hidden = !!offerApply;
  btnDiscard.hidden = !offerApply;
  btnApply.hidden = !offerApply;
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

async function runFirstBossFinder() {
  if (!state.engine || state.running || state.optimizing || state.nextBestRunning) return;
  const bossStages = selectedBossStages();
  if (!bossStages.length) {
    $("#optStatus").textContent = "Select at least one boss (100 / 200 / 300).";
    return;
  }
  syncMetaFromInputs();
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
  const startLevel = Math.max(0, Math.floor(Number(state.build.meta?.level) || 0));
  $("#optStatus").textContent =
    `First Bosskill Finder · ${hunter().name} · level ${startLevel} · screen 1 of 4`;

  try {
    const result = await findFirstBossKill(
      state.build,
      searchEngine(),
      hunter(),
      {
        bossStages,
      },
      {
        isCancelled: () => state.optCancel,
        onProgress: (p) => {
          const screens = Math.max(1, Number(p.screens) || 1);
          const screen = Math.max(1, Number(p.screen) || 1);
          const frac = ((screen - 1) + (p.done / Math.max(1, p.total))) / screens;
          const pct = Math.min(95, Math.round(frac * 100));
          $("#optProgressBar").style.width = `${pct}%`;
          $("#optStatus").textContent = `First Bosskill Finder · ${p.msg}`;
        },
      },
    );

    if (result.cancelled || state.optCancel) {
      $("#optStatus").textContent = "First Bosskill Finder cancelled.";
      return;
    }

    $("#optProgressBar").style.width = "100%";
    $("#btnOptCancel").hidden = true;
    const screens = Array.isArray(result.screens) ? result.screens : [];
    const hpText = (screen) => {
      const hp = Number(screen?.bossHp);
      return Number.isFinite(hp) ? `${hp.toFixed(1)}%` : "—";
    };
    const pick = result.pick;
    const pickClears = pick ? `${Number(pick.clearRuns) || 0}/${Number(pick.sims) || result.confirmSims || 500}` : "—";
    const baseClears = result.baselineConfirm
      ? `${Number(result.baselineConfirm.clearRuns) || 0}/${Number(result.baselineConfirm.sims) || result.confirmSims || 500}`
      : "—";
    const status = `First Bosskill Finder · level ${result.level} · boss ${result.bossStage} · screen 1 ${hpText(screens[0])} · screen 2 ${hpText(screens[1])} · refinement ${hpText(screens[2])} boss HP · ${result.rows} builds · confirm ${pickClears} clears (current ${baseClears})`;
    const showPlots = $("#optShowBossReport")?.checked !== false;
    const offerApply = !!result.confirmImproved;

    $("#optStatus").textContent = offerApply
      ? `${status} — ${showPlots ? "report open" : "apply open"}`
      : `${status} · build unchanged${showPlots ? " — report open" : ""}`;
    $("#status").textContent = status;

    const apply = offerApply || showPlots
      ? await showBossFinderReport({ result, showPlots, offerApply })
      : false;

    if (offerApply && apply && result.pick) {
      state.build = {
        ...state.build,
        talents: { ...result.pick.talents },
        attributes: { ...result.pick.attributes },
      };
      buildLeftLists();
      onBuildChanged();
      const h = hunter();
      const confirmSims = Number(result.confirmSims) || 500;
      const sim = h.wasmToSimResult(await evaluateBuild(state.engine, state.build, confirmSims), confirmSims);
      showResult(sim);
      $("#optStatus").textContent =
        `Applied · ${pickClears} clears (was ${baseClears}) · boss ${result.bossStage}`;
      $("#status").textContent =
        `First Bosskill Finder: applied ${pickClears} clears (was ${baseClears})`;
    } else if (offerApply) {
      $("#optStatus").textContent =
        `Discarded · suggested ${pickClears} clears (current ${baseClears})`;
      $("#status").textContent =
        `First Bosskill Finder: suggestion discarded (${pickClears} clears, current ${baseClears})`;
    } else {
      $("#optStatus").textContent = `${status} · build unchanged`;
    }
  } catch (err) {
    console.error(err);
    $("#optStatus").textContent = `First Bosskill Finder error: ${err.message || err}`;
  } finally {
    state.optimizing = false;
    state.optCancel = false;
    syncActionButtons();
    $("#btnOptCancel").hidden = true;
    $("#btnTalentClose").disabled = false;
  }
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

  let runNextBestAfterApply = false;
  const modeLabel =
    mode === "bosses" ? "Boss Maximizer" : mode === "loot" ? "Push Material/XP" : "Push Average Stage";

  try {
    const result = await findPushBuild(
      state.build,
      searchEngine(),
      hunter(),
      { objective: mode, bossStages },
      {
        isCancelled: () => state.optCancel,
        onProgress: (p) => {
          const screens = Math.max(1, Number(p.screens) || 1);
          const screen = Math.max(1, Number(p.screen) || 1);
          const frac = ((screen - 1) + (p.done / Math.max(1, p.total))) / screens;
          const pct = Math.min(95, Math.round(frac * 100));
          $("#optProgressBar").style.width = `${pct}%`;
          $("#optStatus").textContent = `${modeLabel} · ${p.msg}${formatOptProgressExtra(p)}`;
        },
      },
    );

    if (result.cancelled || state.optCancel) {
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
    const noiseLine = result.noiseBlocked
      ? `within noise (gain ${Number(result.noise?.gain || 0).toFixed(2)}, need ${Number(result.noise?.need || 0).toFixed(2)})`
      : noImproveLine;

    const effort = `${result.rows} builds · ${result.sims} sims`;
    const showPlots = $("#optShowBossReport")?.checked !== false;

    $("#optProgressBar").style.width = "100%";
    $("#optStatus").textContent = result.improved
      ? `Done · ${improvedLine} · ${effort} — ${showPlots ? "report open" : "apply open"}`
      : result.noiseBlocked
        ? `Done · ${noiseLine} · ${effort}${showPlots ? " — report open" : ""}`
        : `Done · no improvement · ${noImproveLine} · ${effort}${showPlots ? " — report open" : ""}`;

    const apply = result.improved || showPlots || result.noiseBlocked
      ? await showOptReport({ mode, modeLabel, result, bossStages, showPlots })
      : false;

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
          `Applied · ${improvedLine} · ${effort} · Next-Best-Opti…`;
        $("#status").textContent =
          `${modeLabel}: Ø Stage ${bestAvg} (↑ from ${baseAvg}) — applied · Next-Best-Opti…`;
        runNextBestAfterApply = true;
      } else {
        $("#optStatus").textContent =
          `Applied · ${improvedLine} · ${effort}`;
        $("#status").textContent = `${modeLabel}: applied · ${improvedLine}`;
      }
    } else if (result.improved) {
      $("#optStatus").textContent =
        `Discarded · suggested ${discardSuggest} · ${effort}`;
      $("#status").textContent = `${modeLabel}: suggestion discarded (${discardSuggest})`;
    } else if (result.noiseBlocked) {
      $("#optStatus").textContent =
        `Within noise · ${noiseLine} · ${effort}`;
      $("#status").textContent = showPlots
        ? `${modeLabel}: within simulation noise · see report`
        : `${modeLabel}: within simulation noise · ${noiseLine}`;
      if (result.baselineEval) showResult(result.baselineEval);
    } else {
      $("#optStatus").textContent =
        `No improvement · ${noImproveLine} · ${effort}`;
      $("#status").textContent = showPlots
        ? `${modeLabel}: no improvement · see report`
        : `${modeLabel}: no improvement · ${noImproveLine}`;
      if (result.baselineEval) showResult(result.baselineEval);
    }
  } catch (err) {
    console.error(err);
    $("#optStatus").textContent = `Optimizer error: ${err.message || err}`;
  } finally {
    state.optimizing = false;
    state.optCancel = false;
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
