import {
  TR12_FLAT,
  TR12_FORMULA_START,
  TR12_LIFETIME_FRAC,
  TR12_MULTI_PER_TR,
  evaluateTraversalPlan,
  formatOO,
  formatPct,
} from "./calc.js";

export const STORAGE_KEY = "cifi_tr_state_v1";

/** @typedef {{ trCount: number, lifetimeOO: number, thisTrOO: number, allTimeIncludesThisTr: boolean, hasExo3: boolean }} TrState */

/** @returns {TrState} */
function defaultState() {
  return {
    trCount: 12,
    lifetimeOO: 0,
    thisTrOO: 0,
    allTimeIncludesThisTr: true,
    hasExo3: true,
  };
}

/** @returns {TrState} */
function loadState() {
  const base = defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return base;
    return {
      trCount: Math.max(0, Math.floor(Number(data.trCount) || 0)),
      lifetimeOO: Math.max(0, Number(data.lifetimeOO) || 0),
      thisTrOO: Math.max(0, Number(data.thisTrOO) || 0),
      allTimeIncludesThisTr: data.allTimeIncludesThisTr !== false,
      hasExo3: data.hasExo3 !== false,
    };
  } catch {
    return base;
  }
}

/** @param {TrState} state */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numAttr(n) {
  if (!Number.isFinite(n) || n === 0) return "";
  return String(n);
}

/** @param {ReturnType<typeof import('./calc.js').wyrmholeRequirementTr12> | null} breakdown @param {string} title */
function breakdownHtml(breakdown, title) {
  if (!breakdown) {
    return `
      <div class="tr-card tr-card-muted">
        <h3>${esc(title)}</h3>
        <p class="tr-muted">TR12+ formula does not apply yet (needs Traversals ≥ ${TR12_FORMULA_START}). Early Wyrmhole curve is TR-count-only and not modelled here.</p>
      </div>`;
  }
  return `
    <div class="tr-card">
      <h3>${esc(title)}</h3>
      <div class="tr-req-hero" aria-live="polite">${esc(formatOO(breakdown.requirement))}</div>
      <dl class="tr-breakdown">
        <div><dt>TRCount</dt><dd>${esc(String(breakdown.trCount))}</dd></div>
        <div><dt>Lifetime OO</dt><dd>${esc(formatOO(breakdown.lifetimeOO))}</dd></div>
        <div><dt>Base</dt><dd>${esc(formatOO(breakdown.base))}</dd></div>
        <div><dt>+ Flat ${TR12_FLAT.toLocaleString("de-DE")}</dt><dd>${esc(formatOO(breakdown.afterFlat))}</dd></div>
        <div><dt>+ ${(TR12_LIFETIME_FRAC * 100).toFixed(0)}% lifetime</dt><dd>+${esc(formatOO(breakdown.lifetimeAdd))} → ${esc(formatOO(breakdown.afterLifetime))}</dd></div>
        <div><dt>× ${TR12_MULTI_PER_TR}<sup>${esc(String(breakdown.multiExp))}</sup></dt><dd>×${esc(breakdown.multi.toFixed(4))} → <strong>${esc(formatOO(breakdown.requirement))}</strong></dd></div>
      </dl>
    </div>`;
}

let root = null;
/** @type {TrState} */
let state = defaultState();

function readFormIntoState() {
  const tr = root.querySelector("#trCount");
  const life = root.querySelector("#trLifetimeOO");
  const cur = root.querySelector("#trThisOO");
  const incl = root.querySelector("#trAllTimeIncludes");
  const exo = root.querySelector("#trHasExo3");
  state = {
    trCount: Math.max(0, Math.floor(Number(tr?.value) || 0)),
    lifetimeOO: Math.max(0, Number(life?.value) || 0),
    thisTrOO: Math.max(0, Number(cur?.value) || 0),
    allTimeIncludesThisTr: !!incl?.checked,
    hasExo3: !!exo?.checked,
  };
}

function renderResults() {
  const mount = root.querySelector("#trResults");
  if (!mount) return;
  const plan = evaluateTraversalPlan(state);

  const statusBits = [];
  if (plan.hasExo3) {
    statusBits.push("Exodus Q3 — Time Battery off; only Wyrmhole gates Traversal");
  } else {
    statusBits.push("Time Battery still active (no Exo3) — orb gate is only half of the requirement");
  }

  let currentStatus = "";
  if (plan.current) {
    const ready = plan.canTraverseOrbs;
    currentStatus = `
      <div class="tr-status ${ready ? "is-ready" : "is-short"}">
        <div class="tr-status-main">
          <div class="label">This Traversal — Wyrmhole fill</div>
          <div class="value">${esc(formatPct(plan.filledPct))} · ${esc(formatOO(plan.thisTrOO))} / ${esc(formatOO(plan.current.requirement))}</div>
        </div>
        <div class="tr-status-side">
          <div class="label">${ready ? "Ready to TR (orbs)" : "Still needed"}</div>
          <div class="value">${ready ? "0 OO" : esc(formatOO(plan.remaining))}</div>
        </div>
      </div>
      <div class="tr-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${esc(String(Math.round(plan.filledPct || 0)))}">
        <div class="tr-meter-fill" style="width:${esc(String(Math.min(100, plan.filledPct || 0)))}%"></div>
      </div>`;
  } else {
    currentStatus = `
      <div class="tr-status is-muted">
        <div class="tr-status-main">
          <div class="label">This Traversal</div>
          <div class="value">Pre-TR12 Wyrmhole not modelled — check the in-game device.</div>
        </div>
      </div>`;
  }

  mount.innerHTML = `
    <p class="tr-muted">${statusBits.map(esc).join(" · ")}</p>
    ${currentStatus}
    <div class="tr-cards">
      ${breakdownHtml(plan.current, `Current battery (TR ${plan.trCount})`)}
      ${breakdownHtml(
        plan.afterNow,
        `If you TR now → next battery (TR ${plan.nextTrCount})`,
      )}
    </div>
    <p class="tr-muted tr-footnote">
      TR12+ formula from the in-game tip: base = 5 × ((1.2 + TRCount×0.008)^TRCount), then +${TR12_FLAT.toLocaleString("de-DE")},
      then +${(TR12_LIFETIME_FRAC * 100).toFixed(0)}% of all-time OO, then ×${TR12_MULTI_PER_TR} per TR from ${TR12_FORMULA_START} inclusive.
      Lifetime should match Stats → <em>Ouro Orbs - Total ALL TIME</em>. Small display differences vs the game can come from rounding.
    </p>
  `;
}

function shellHtml(s) {
  return `
    <section class="tr-hero">
      <h2>Traversal / Wyrmhole</h2>
      <p class="tr-muted">Enter your current Traversals count and orb totals. See how full the Wyrmhole Battery is now, and what the next Traversal will require if you TR with your current orbs.</p>
    </section>
    <section class="tr-form" aria-label="Traversal inputs">
      <div class="tr-fields">
        <label class="tr-field">
          <span class="label">Traversals count</span>
          <input id="trCount" type="number" min="0" step="1" inputmode="numeric" value="${esc(String(s.trCount))}" aria-label="Current Traversals count" />
        </label>
        <label class="tr-field">
          <span class="label">All-time OO</span>
          <input id="trLifetimeOO" type="number" min="0" step="any" inputmode="decimal" value="${esc(numAttr(s.lifetimeOO))}" placeholder="0" aria-label="All-time Ouroboros Orbs" />
        </label>
        <label class="tr-field">
          <span class="label">OO this Traversal</span>
          <input id="trThisOO" type="number" min="0" step="any" inputmode="decimal" value="${esc(numAttr(s.thisTrOO))}" placeholder="0" aria-label="Ouroboros Orbs this Traversal" />
        </label>
      </div>
      <div class="tr-checks">
        <label class="tr-check">
          <input id="trAllTimeIncludes" type="checkbox" ${s.allTimeIncludesThisTr ? "checked" : ""} />
          <span>All-time already includes this Traversal</span>
        </label>
        <label class="tr-check">
          <input id="trHasExo3" type="checkbox" ${s.hasExo3 ? "checked" : ""} />
          <span>Exodus Q3 (Time Battery removed)</span>
        </label>
      </div>
      <div class="tr-actions">
        <button type="button" class="btn" id="trReset">Reset inputs</button>
        <span class="tr-save-hint">Saved in this browser</span>
      </div>
    </section>
    <section id="trResults" class="tr-results" aria-live="polite"></section>
  `;
}

function onChange() {
  readFormIntoState();
  saveState(state);
  renderResults();
}

function bind() {
  ["trCount", "trLifetimeOO", "trThisOO"].forEach((id) => {
    root.querySelector(`#${id}`)?.addEventListener("input", onChange);
  });
  ["trAllTimeIncludes", "trHasExo3"].forEach((id) => {
    root.querySelector(`#${id}`)?.addEventListener("change", onChange);
  });
  root.querySelector("#trReset")?.addEventListener("click", () => {
    state = defaultState();
    saveState(state);
    root.innerHTML = shellHtml(state);
    bind();
    renderResults();
  });
}

export function persistTrState() {
  if (!root) return;
  readFormIntoState();
  saveState(state);
}

export function initTrModule(container) {
  root = container;
  state = loadState();
  root.innerHTML = shellHtml(state);
  bind();
  renderResults();
}
