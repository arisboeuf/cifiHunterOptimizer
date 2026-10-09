import {
  COST_SOURCE,
  DEFAULT_MECHS,
  LEGACY_STORAGE_KEYS,
  MECH_ORDER,
  PERSIST_KEYS,
  STORAGE_KEY,
  cloneMech,
  defaultState,
  hydrateMechFromLegacy,
  syncDerivedFields,
} from "./data.js";
import {
  MECH_COST_PARAMS,
  formatEmeraldCost,
  inferTimerLevel,
  maxTimerLevelForPositiveTime,
  timerReductionMinutes,
} from "./costs.js";
import {
  UPGRADE_LABELS,
  evaluateAll,
  formatCost,
  formatNum,
  formatTimer,
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
  return hydrateMechFromLegacy(cloneMech(DEFAULT_MECHS[id]), src);
}

/** Clean snapshot of every editable field for all mechs. */
function serializeState() {
  /** @type {Record<string, object>} */
  const mechs = {};
  for (const id of MECH_ORDER) {
    const m = state.mechs[id] || DEFAULT_MECHS[id];
    /** @type {Record<string, number>} */
    const row = {};
    for (const key of PERSIST_KEYS) {
      row[key] = Number(m[key]);
    }
    mechs[id] = row;
  }
  return {
    version: 4,
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

function levelLimits(mech, kind) {
  const p = MECH_COST_PARAMS[mech.id];
  if (kind === "units") return { min: 0, max: 999 };
  if (kind === "multi") return { min: 0, max: p?.maxMultiLevel ?? 99 };
  if (kind === "timer") {
    // Soft formula max can be exceeded (surcharge), but keep timer > 0 with fixed minute steps.
    const byTime = p ? maxTimerLevelForPositiveTime(p) : 99;
    const soft = p?.maxTimerLevel ?? 99;
    return { min: 0, max: Math.max(byTime, soft) };
  }
  return { min: 0, max: 99 };
}

function timerStepMinutes(mech) {
  const p = MECH_COST_PARAMS[mech.id];
  return p ? timerReductionMinutes(p) : Math.round(mech.timerReductionMinutes || 2);
}

function upgradeCard(mech, kind) {
  const limits = levelLimits(mech, kind);
  const level =
    kind === "units" ? mech.units : kind === "multi" ? mech.multiLevel : mech.timerLevel;
  const cost =
    kind === "units" ? mech.costs.unit : kind === "multi" ? mech.costs.multi : mech.costs.timer;
  const atMax = level >= limits.max;
  const atMin = level <= limits.min;
  const stepMin = timerStepMinutes(mech);

  let gain = "";
  let stateLine = "";
  let inputValue = String(level);
  let inputLabel = `${UPGRADE_LABELS[kind === "units" ? "unit" : kind]} level`;
  let inputStep = "1";
  if (kind === "units") {
    gain =
      mech.mode === "token"
        ? `+1 unit (+${formatNum(mech.tokensPerMech, 0)} tokens)`
        : `+1 unit (+${formatNum(mech.multiPerMech, 3)} multi)`;
    stateLine =
      mech.mode === "token"
        ? `${formatNum(mech.tokensPerMission, 0)} tokens / mission`
        : `Multi ${formatNum(mech.missionMultiplier, 3)} · ${formatNum(mech.multiPerMech, 3)}/mech`;
  } else if (kind === "multi") {
    gain =
      mech.mode === "token"
        ? `+${formatNum(mech.tokensPerMech, 0)} tokens × units`
        : `+${formatNum(mech.multiUpgradeIncrement, 3)} per mech`;
    stateLine = `Level ${level}${limits.max < 999 ? ` / ${MECH_COST_PARAMS[mech.id]?.maxMultiLevel ?? "—"}` : ""}`;
  } else {
    gain = `Each upgrade −${stepMin} min (fixed)`;
    stateLine = formatTimer(mech.timerMinutes);
    inputValue = String(Math.round(mech.timerMinutes));
    inputLabel = "Mission timer (minutes)";
    inputStep = String(stepMin);
  }

  const title = UPGRADE_LABELS[kind === "units" ? "unit" : kind];
  // Timer: − lengthens (undo), + shortens (buy upgrade) — same as level −/+.
  return `
    <div class="mech-upgrade-card" data-kind="${kind}">
      <div class="mech-upgrade-title">${title}</div>
      <div class="mech-upgrade-spin">
        <button type="button" class="btn mech-step" data-kind="${kind}" data-delta="-1" ${atMin ? "disabled" : ""} aria-label="${kind === "timer" ? `Lengthen timer by ${stepMin} min` : `Decrease ${title}`}">−</button>
        <input type="number" class="mech-level-input" data-kind="${kind}" value="${inputValue}" step="${inputStep}" aria-label="${inputLabel}" />
        <button type="button" class="btn mech-step" data-kind="${kind}" data-delta="1" ${atMax ? "disabled" : ""} aria-label="${kind === "timer" ? `Shorten timer by ${stepMin} min` : `Increase ${title}`}">+</button>
      </div>
      <div class="mech-upgrade-gain" data-derived="${kind}Gain">${gain}</div>
      <div class="mech-upgrade-state" data-derived="${kind}State">${stateLine}</div>
      <div class="mech-upgrade-cost"><span class="k">Next cost</span> <span data-derived="${kind}Cost">${formatEmeraldCost(cost)}</span></div>
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
  set(
    "unitsGain",
    m.mode === "token"
      ? `+1 unit (+${formatNum(m.tokensPerMech, 0)} tokens)`
      : `+1 unit (+${formatNum(m.multiPerMech, 3)} multi)`,
  );
  set(
    "unitsState",
    m.mode === "token"
      ? `${formatNum(m.tokensPerMission, 0)} tokens / mission`
      : `Multi ${formatNum(m.missionMultiplier, 3)} · ${formatNum(m.multiPerMech, 3)}/mech`,
  );
  set(
    "multiGain",
    m.mode === "token"
      ? `+${formatNum(m.tokensPerMech, 0)} tokens × units`
      : `+${formatNum(m.multiUpgradeIncrement, 3)} per mech`,
  );
  set(
    "multiState",
    `Level ${m.multiLevel}${
      MECH_COST_PARAMS[m.id] ? ` / ${MECH_COST_PARAMS[m.id].maxMultiLevel}` : ""
    }`,
  );
  const stepMin = timerStepMinutes(m);
  set("timerGain", `Each upgrade −${stepMin} min (fixed)`);
  set("timerState", formatTimer(m.timerMinutes));
  set("unitsCost", formatEmeraldCost(m.costs.unit));
  set("multiCost", formatEmeraldCost(m.costs.multi));
  set("timerCost", formatEmeraldCost(m.costs.timer));

  for (const kind of ["units", "multi", "timer"]) {
    const limits = levelLimits(m, kind);
    const level =
      kind === "units" ? m.units : kind === "multi" ? m.multiLevel : m.timerLevel;
    const input = el.querySelector(`.mech-level-input[data-kind="${kind}"]`);
    if (input && document.activeElement !== input) {
      input.value = kind === "timer" ? String(Math.round(m.timerMinutes)) : String(level);
      if (kind === "timer") input.step = String(stepMin);
    }
    el.querySelectorAll(`.mech-step[data-kind="${kind}"]`).forEach((btn) => {
      const delta = Number(btn.dataset.delta);
      btn.disabled = delta < 0 ? level <= limits.min : level >= limits.max;
    });
  }
}

function afterStateChange() {
  const m = activeMech();
  syncDerivedFields(m);
  saveState();
  refreshDerivedLabels();
  renderResults();
  renderFooter();
}

function setLevel(kind, value) {
  const m = activeMech();
  const limits = levelLimits(m, kind);
  const p = MECH_COST_PARAMS[m.id];

  if (kind === "timer") {
    // Value is mission timer in whole minutes; snap to the fixed step grid.
    const step = timerStepMinutes(m);
    const baseMin = p ? Math.round(p.timerBaseSeconds / 60) : Math.round(m.timerMinutes);
    let minutes = Math.round(Number(value) || 0);
    if (step > 0) {
      const stepsFromBase = Math.round((baseMin - minutes) / step);
      minutes = baseMin - stepsFromBase * step;
    }
    minutes = Math.max(step, minutes); // keep at least one step of time
    m.timerLevel = p ? inferTimerLevel(p, minutes) : Math.max(0, Math.round((baseMin - minutes) / step));
    m.timerLevel = Math.max(limits.min, Math.min(limits.max, m.timerLevel));
    afterStateChange();
    return;
  }

  const n = Math.max(limits.min, Math.min(limits.max, Math.floor(Number(value) || 0)));
  if (kind === "units") m.units = n;
  else m.multiLevel = n;
  afterStateChange();
}

function stepLevel(kind, delta) {
  const m = activeMech();
  if (kind === "timer") {
    // +1 = buy upgrade (shorter by fixed minutes), −1 = undo (longer).
    setLevel("timer", Math.round(m.timerMinutes) - delta * timerStepMinutes(m));
    return;
  }
  const cur = kind === "units" ? m.units : m.multiLevel;
  setLevel(kind, cur + delta);
}

function renderInputs() {
  const m = activeMech();
  syncDerivedFields(m);
  const el = root.querySelector("#mechInputs");
  if (!el) return;

  el.innerHTML = `
    <h3 class="section-title">${m.name}</h3>
    <p class="mech-muted">Output: <strong>${m.output}</strong>${m.note ? ` — ${m.note}` : ""}</p>
    <p class="mech-muted">${COST_SOURCE}. Timer steps in fixed whole minutes per mech (e.g. Cradler −2, Zag −3).</p>
    <div class="mech-upgrade-grid">
      ${upgradeCard(m, "units")}
      ${upgradeCard(m, "multi")}
      ${upgradeCard(m, "timer")}
    </div>
  `;

  el.querySelectorAll(".mech-step").forEach((btn) => {
    btn.addEventListener("click", () => {
      stepLevel(btn.dataset.kind, Number(btn.dataset.delta));
    });
  });
  el.querySelectorAll(".mech-level-input").forEach((input) => {
    input.addEventListener("change", () => setLevel(input.dataset.kind, input.value));
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        setLevel(input.dataset.kind, input.value);
        input.blur();
      }
    });
  });
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
            ? `${formatNum(best.percentDailyFactorGainPerEmerald * 1000, 5)} % / 1000 emeralds`
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
            <th>% / 1000 emeralds</th>
          </tr>
        </thead>
        <tbody>
          ${ranked
            .map((r, i) => {
              const scoreFmt = r.ok
                ? formatNum(r.percentDailyFactorGainPerEmerald * 1000, 5)
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
