import {
  COST_SOURCE,
  DEFAULT_MECHS,
  LEGACY_STORAGE_KEYS,
  MECH_ORDER,
  PERSIST_KEYS,
  STORAGE_KEY,
  cloneMech,
  defaultState,
  syncDerivedFields,
} from "./data.js";
import { formatEmeraldCost } from "./costs.js";
import {
  UPGRADE_LABELS,
  evaluateAll,
  formatCost,
  formatNum,
  formatTimer,
  parseTimer,
  scoreHeatClass,
} from "./calc.js";

let root = null;
let state = defaultState();
let persistBound = false;

function readStorageRaw() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return current;
    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) return legacy;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function applyPersistedMech(id, src) {
  const next = cloneMech(DEFAULT_MECHS[id]);
  if (!src || typeof src !== "object") return next;
  for (const key of PERSIST_KEYS) {
    if (key === "multiLevel" || key === "timerLevel") continue;
    const n = Number(src[key]);
    if (Number.isFinite(n)) next[key] = n;
  }
  return syncDerivedFields(next);
}

/** Clean snapshot of every editable field for all mechs. */
function serializeState() {
  /** @type {Record<string, object>} */
  const mechs = {};
  for (const id of MECH_ORDER) {
    const m = state.mechs[id] || DEFAULT_MECHS[id];
    const row = {
      costs: {
        unit: Number(m.costs.unit),
        multi: Number(m.costs.multi),
        timer: Number(m.costs.timer),
      },
    };
    for (const key of PERSIST_KEYS) {
      row[key] = Number(m[key]);
    }
    mechs[id] = row;
  }
  return {
    version: 2,
    activeId: state.activeId,
    mechs,
  };
}

function loadState() {
  try {
    const raw = readStorageRaw();
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    const base = defaultState();
    if (!data || typeof data !== "object") return base;
    if (typeof data.activeId === "string" && MECH_ORDER.includes(data.activeId)) {
      base.activeId = data.activeId;
    }
    if (data.mechs && typeof data.mechs === "object") {
      for (const id of MECH_ORDER) {
        base.mechs[id] = applyPersistedMech(id, data.mechs[id]);
      }
    }
    return base;
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    const payload = JSON.stringify(serializeState());
    localStorage.setItem(STORAGE_KEY, payload);
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
    updateSaveHint(true);
  } catch {
    updateSaveHint(false);
  }
}

function updateSaveHint(ok) {
  const el = root?.querySelector("#mechSaveHint");
  if (!el) return;
  el.textContent = ok ? "Saved in this browser" : "Could not save (storage blocked)";
  el.dataset.ok = ok ? "1" : "0";
}

function bindPersistHooks() {
  if (persistBound) return;
  persistBound = true;
  window.addEventListener("beforeunload", () => {
    saveState();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveState();
  });
}

/** Flush current planner values to localStorage (e.g. when leaving the module). */
export function persistMechsState() {
  if (!state?.mechs) return;
  saveState();
}

function activeMech() {
  return state.mechs[state.activeId];
}

function shellHtml() {
  return `
    <div class="mech-tabs" id="mechTabs" role="tablist" aria-label="Mech"></div>

    <div class="mech-layout">
      <aside class="panel mech-inputs" id="mechInputs"></aside>
      <section class="panel mech-results" id="mechResults"></section>
    </div>

    <div class="mech-toolbar">
      <button type="button" class="btn" id="mechReset">Reset this mech to screenshot baseline</button>
      <button type="button" class="btn" id="mechResetAll">Reset all mechs</button>
      <span class="mech-save-hint" id="mechSaveHint" data-ok="1">Saved in this browser</span>
    </div>
    <p class="footer-note" id="mechFooter"></p>
  `;
}

function numField(id, label, value, step = "any") {
  return `
    <label class="mech-field">
      <span>${label}</span>
      <input type="number" id="${id}" value="${value}" step="${step}" />
    </label>
  `;
}

function timerField(id, label, minutes) {
  return `
    <label class="mech-field">
      <span>${label}</span>
      <input type="text" id="${id}" value="${formatTimer(minutes)}" inputmode="numeric" placeholder="hh:mm:ss" spellcheck="false" />
    </label>
  `;
}

function staticField(label, value, derivedKey = "") {
  const attr = derivedKey ? ` data-derived="${derivedKey}"` : "";
  return `
    <div class="mech-field mech-field-static">
      <span>${label}</span>
      <div class="mech-static-value"${attr}>${value}</div>
    </div>
  `;
}

function refreshDerivedLabels() {
  const m = activeMech();
  const el = root?.querySelector("#mechInputs");
  if (!el) return;
  const set = (key, text) => {
    const node = el.querySelector(`[data-derived="${key}"]`);
    if (node) node.textContent = text;
  };
  set("multiPerMech", formatNum(m.multiPerMech, 3));
  set("tokensPerMech", formatNum(m.tokensPerMech, 0));
  set("unitGain", m.mode === "multiplier"
    ? `+1 unit (+${formatNum(m.multiPerMech, 3)} multi)`
    : `+1 unit (+${formatNum(m.tokensPerMech, 0)} tokens)`);
  set("multiGain", m.mode === "multiplier"
    ? `+${formatNum(m.multiUpgradeIncrement, 3)}`
    : `+${formatNum(m.tokensPerMech, 0)} tokens × units`);
  set("timerGain", `−${formatNum(m.timerReductionMinutes, 0)} min`);
  set("unitCost", formatEmeraldCost(m.costs.unit));
  set("multiCost", formatEmeraldCost(m.costs.multi));
  set("timerCost", formatEmeraldCost(m.costs.timer));
  set(
    "gainsHint",
    `From Helper MechData (multi L${m.multiLevel}, timer L${m.timerLevel})`,
  );
}

function afterStateChange() {
  const m = activeMech();
  syncDerivedFields(m);
  saveState();
  refreshDerivedLabels();
  renderResults();
  renderFooter();
}

function renderInputs() {
  const m = activeMech();
  syncDerivedFields(m);
  const el = root.querySelector("#mechInputs");
  if (!el) return;

  const currentStateFields =
    m.mode === "multiplier"
      ? `
        ${numField("mech_units", "Units", m.units, "1")}
        ${numField("mech_missionMultiplier", "Mission multiplier (shown)", m.missionMultiplier, "0.001")}
        ${staticField("Multi per mech", formatNum(m.multiPerMech, 3), "multiPerMech")}
        ${timerField("mech_timerMinutes", "Mission timer (hh:mm:ss)", m.timerMinutes)}
      `
      : `
        ${numField("mech_units", "Units", m.units, "1")}
        ${numField("mech_tokensPerMission", "Tokens / mission", m.tokensPerMission, "1")}
        ${staticField("Tokens / mech", formatNum(m.tokensPerMech, 0), "tokensPerMech")}
        ${timerField("mech_timerMinutes", "Mission timer (hh:mm:ss)", m.timerMinutes)}
      `;

  const upgradeGainFields =
    m.mode === "multiplier"
      ? `
        ${staticField("Unit gain", `+1 unit (+${formatNum(m.multiPerMech, 3)} multi)`, "unitGain")}
        ${staticField("Multi upgrade (+per mech)", `+${formatNum(m.multiUpgradeIncrement, 3)}`, "multiGain")}
        ${staticField("Timer upgrade", `−${formatNum(m.timerReductionMinutes, 0)} min`, "timerGain")}
      `
      : `
        ${staticField("Unit gain", `+1 unit (+${formatNum(m.tokensPerMech, 0)} tokens)`, "unitGain")}
        ${staticField("Multi upgrade", `+${formatNum(m.tokensPerMech, 0)} tokens × units`, "multiGain")}
        ${staticField("Timer upgrade", `−${formatNum(m.timerReductionMinutes, 0)} min`, "timerGain")}
      `;

  el.innerHTML = `
    <h3 class="section-title">${m.name}</h3>
    <p class="mech-muted">Output: <strong>${m.output}</strong>${m.note ? ` — ${m.note}` : ""}</p>
    <div class="mech-input-rows">
      <div class="mech-row mech-row-state">
        <div class="mech-row-head">
          <h4 class="mech-col-title">Current state</h4>
          <p class="mech-col-hint">Edit units, shown multiplier/tokens, and timer — levels inferred for costs</p>
        </div>
        <div class="mech-fields mech-fields-row">${currentStateFields}</div>
      </div>
      <div class="mech-row mech-row-gains">
        <div class="mech-row-head">
          <h4 class="mech-col-title">Upgrade gains</h4>
          <p class="mech-col-hint" data-derived="gainsHint">From Helper MechData (multi L${m.multiLevel}, timer L${m.timerLevel})</p>
        </div>
        <div class="mech-fields mech-fields-row">${upgradeGainFields}</div>
      </div>
      <div class="mech-row mech-row-costs">
        <div class="mech-row-head">
          <h4 class="mech-col-title">Emerald costs</h4>
          <p class="mech-col-hint">${COST_SOURCE}</p>
        </div>
        <div class="mech-fields mech-fields-row">
          ${staticField("Unit cost", formatEmeraldCost(m.costs.unit), "unitCost")}
          ${staticField("Multi cost", formatEmeraldCost(m.costs.multi), "multiCost")}
          ${staticField("Timer cost", formatEmeraldCost(m.costs.timer), "timerCost")}
        </div>
      </div>
    </div>
  `;

  el.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", onInputChange);
    input.addEventListener("change", onInputChange);
    if (input.id === "mech_timerMinutes") {
      input.addEventListener("blur", onTimerBlur);
    }
  });
}

function onTimerBlur(ev) {
  const m = activeMech();
  const parsed = parseTimer(ev.target.value);
  if (parsed == null) {
    ev.target.value = formatTimer(m.timerMinutes);
    return;
  }
  m.timerMinutes = parsed;
  ev.target.value = formatTimer(parsed);
  afterStateChange();
}

function onInputChange(ev) {
  const m = activeMech();
  const id = ev.target.id;

  if (id === "mech_timerMinutes") {
    const parsed = parseTimer(ev.target.value);
    if (parsed == null) return;
    m.timerMinutes = parsed;
    afterStateChange();
    return;
  }

  const v = Number(ev.target.value);
  if (!Number.isFinite(v)) return;

  const map = {
    mech_units: () => {
      m.units = v;
    },
    mech_missionMultiplier: () => {
      m.missionMultiplier = v;
    },
    mech_tokensPerMission: () => {
      m.tokensPerMission = v;
    },
  };
  if (!map[id]) return;
  map[id]();
  afterStateChange();
}

function renderMechTabs() {
  const bar = root.querySelector("#mechTabs");
  if (!bar) return;
  bar.innerHTML = "";
  for (const id of MECH_ORDER) {
    const m = state.mechs[id];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mech-tab";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(id === state.activeId));
    btn.dataset.mech = id;
    btn.innerHTML = `<span class="mech-tab-name">${m.name}</span><span class="mech-tab-out">${m.output}</span>`;
    btn.addEventListener("click", () => {
      state.activeId = id;
      saveState();
      render();
    });
    bar.appendChild(btn);
  }
}

function scoreCell(score, peers, formatted, isBest) {
  const heat = scoreHeatClass(score, peers);
  return `<td class="mech-score ${heat}${isBest ? " is-top" : ""}">${formatted}</td>`;
}

function renderResults() {
  const m = activeMech();
  syncDerivedFields(m);
  const el = root.querySelector("#mechResults");
  if (!el) return;

  const { ranked, best } = evaluateAll(m);
  const bestKind = best?.ok ? best.kind : null;
  const peers = ranked.filter((r) => r.ok).map((r) => r.score);

  if (m.mode === "token") {
    el.innerHTML = `
      <div class="mech-pick ${bestKind ? "is-ready" : ""}">
        <div class="k">Best buy now</div>
        <div class="v">${bestKind ? UPGRADE_LABELS[bestKind] : "—"}</div>
        <div class="mech-pick-sub">
          ${
            best?.ok
              ? `${formatNum(best.deltaTokensPerDayPerEmerald, 6)} tokens/day per emerald`
              : best?.error || "Enter valid values"
          }
        </div>
      </div>
      <div class="mech-table-wrap">
        <table class="mech-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Upgrade</th>
              <th>Cost</th>
              <th>After</th>
              <th>Δ tokens/day</th>
              <th>Tokens/day / emerald</th>
            </tr>
          </thead>
          <tbody>
            ${ranked
              .map((r, i) => {
                const after =
                  r.kind === "timer"
                    ? formatTimer(r.newTimerMinutes)
                    : `${formatNum(r.newTokensPerMission, 0)} tok/mission`;
                const scoreFmt = r.ok ? formatNum(r.deltaTokensPerDayPerEmerald, 6) : r.error || "—";
                return `
                  <tr class="${r.kind === bestKind ? "is-best" : ""} ${r.ok ? "" : "is-bad"}">
                    <td>${i + 1}</td>
                    <td><strong>${UPGRADE_LABELS[r.kind]}</strong></td>
                    <td>${formatCost(r.cost)}</td>
                    <td>${after}</td>
                    <td>${r.ok ? formatNum(r.deltaTokensPerDay, 2) : "—"}</td>
                    ${scoreCell(r.score, peers, scoreFmt, r.kind === bestKind)}
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="mech-pick ${bestKind ? "is-ready" : ""}">
      <div class="k">Best buy now</div>
      <div class="v">${bestKind ? UPGRADE_LABELS[bestKind] : "—"}</div>
      <div class="mech-pick-sub">
        ${
          best?.ok
            ? `${formatNum(best.percentDailyFactorGainPerEmerald, 8)} % / emerald`
            : best?.error || "Enter valid values"
        }
      </div>
    </div>
    <div class="mech-table-wrap">
      <table class="mech-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Upgrade</th>
            <th>Cost</th>
            <th>New multi</th>
            <th>New timer</th>
            <th>Missions/day</th>
            <th>Δ daily factor %</th>
            <th>% / emerald</th>
          </tr>
        </thead>
        <tbody>
          ${ranked
            .map((r, i) => {
              const scoreFmt = r.ok
                ? formatNum(r.percentDailyFactorGainPerEmerald, 8)
                : r.error || "—";
              return `
                <tr class="${r.kind === bestKind ? "is-best" : ""} ${r.ok ? "" : "is-bad"}">
                  <td>${i + 1}</td>
                  <td><strong>${UPGRADE_LABELS[r.kind]}</strong></td>
                  <td>${formatCost(r.cost)}</td>
                  <td>${formatNum(r.newMissionMultiplier, 3)}</td>
                  <td>${formatTimer(r.newTimerMinutes)}</td>
                  <td>${r.ok ? formatNum(r.missionsPerDay, 3) : "—"}</td>
                  <td>${r.ok ? formatNum(r.percentDailyFactorGain, 4) : "—"}</td>
                  ${scoreCell(r.score, peers, scoreFmt, r.kind === bestKind)}
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderFooter() {
  const foot = root.querySelector("#mechFooter");
  if (!foot) return;
  const m = activeMech();
  foot.textContent =
    m.mode === "token"
      ? "Costs: Helper IL formulas. Token ranking uses tokens/day per emerald — not comparable to % daily-factor on other mechs."
      : "Costs: Helper IL formulas (base×mult^level). Growth model dailyFactor ≈ M^(1440/T). Do not cross-rank resource types.";
}

function render() {
  renderMechTabs();
  renderInputs();
  renderResults();
  renderFooter();
}

function bindToolbar() {
  root.querySelector("#mechReset")?.addEventListener("click", () => {
    state.mechs[state.activeId] = cloneMech(DEFAULT_MECHS[state.activeId]);
    saveState();
    render();
  });
  root.querySelector("#mechResetAll")?.addEventListener("click", () => {
    state = defaultState();
    saveState();
    render();
  });
}

export function initMechsModule(container) {
  root = container;
  state = loadState();
  root.innerHTML = shellHtml();
  bindToolbar();
  bindPersistHooks();
  render();
  saveState();
}
