import {
  GEM_ORDER,
  GU_DEFS,
  PLAN_STORAGE_KEY,
  QUALITY_COSTS,
  QUALITY_UNLOCKS,
  STORAGE_KEY,
  UNLOCK_FORK,
  UNLOCK_MAP,
  defaultProgress,
} from "./data.js";
import {
  activeGuRows,
  allDisplayedCosts,
  findNextQuality,
  formatOO,
  heatClass,
} from "./costs.js";

let root = null;
let progress = defaultProgress();
let filter = "all";
/** @type {Map<string, number>} plan pick id → OO cost */
let planPicks = new Map();
/** Already banked OO (subtracted from planned total). */
let bankedOO = 0;

const GEM_RESET_LABELS = ["Reset to starter snapshot", "Sure?", "Really?"];
let gemResetArmStep = 0;
let gemResetArmTimer = null;

function disarmGemResetButton() {
  gemResetArmStep = 0;
  if (gemResetArmTimer) {
    clearTimeout(gemResetArmTimer);
    gemResetArmTimer = null;
  }
  const btn = root?.querySelector("#gemResetDefaults");
  if (!btn) return;
  btn.textContent = GEM_RESET_LABELS[0];
  btn.classList.remove("is-confirm-1", "is-confirm-2");
}

function scheduleGemResetDisarm() {
  if (gemResetArmTimer) clearTimeout(gemResetArmTimer);
  gemResetArmTimer = setTimeout(() => disarmGemResetButton(), 4000);
}

function onGemResetClick() {
  if (gemResetArmStep < 2) {
    gemResetArmStep += 1;
    const btn = root?.querySelector("#gemResetDefaults");
    if (btn) {
      btn.textContent = GEM_RESET_LABELS[gemResetArmStep];
      btn.classList.toggle("is-confirm-1", gemResetArmStep === 1);
      btn.classList.toggle("is-confirm-2", gemResetArmStep === 2);
    }
    scheduleGemResetDisarm();
    return;
  }

  disarmGemResetButton();
  progress = defaultProgress();
  planPicks = new Map();
  saveProgress();
  savePlan();
  renderStatus();
}

function loadPlan() {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return { picks: new Map(), banked: 0 };
    const data = JSON.parse(raw);
    const map = new Map();
    let banked = 0;
    if (data && typeof data === "object") {
      // New shape: { picks, banked } — old shape was id→cost map.
      const picksObj =
        data.picks && typeof data.picks === "object" && !Array.isArray(data.picks)
          ? data.picks
          : data.banked == null && data.picks == null
            ? data
            : {};
      for (const [id, cost] of Object.entries(picksObj)) {
        if (id === "picks" || id === "banked") continue;
        const n = Number(cost);
        if (id && Number.isFinite(n) && n > 0) map.set(id, n);
      }
      const b = Number(data.banked);
      if (Number.isFinite(b) && b > 0) banked = b;
    }
    return { picks: map, banked };
  } catch {
    return { picks: new Map(), banked: 0 };
  }
}

function savePlan() {
  try {
    localStorage.setItem(
      PLAN_STORAGE_KEY,
      JSON.stringify({ picks: Object.fromEntries(planPicks), banked: bankedOO }),
    );
  } catch {
    /* ignore */
  }
}

function planSum() {
  let sum = 0;
  for (const c of planPicks.values()) sum += c;
  return sum;
}

function planRemaining() {
  return Math.max(0, planSum() - bankedOO);
}

function ooTap(cost, peers, id, extraClass = "") {
  const selected = planPicks.has(id);
  const cls = [
    "oo-num",
    "oo-tap",
    heatClass(cost, peers),
    extraClass,
    selected ? "is-planned" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<button type="button" class="${cls}" data-plan-id="${esc(id)}" data-plan-cost="${cost}"
    title="${selected ? "Remove from planned OO" : "Add to planned OO"}" aria-pressed="${selected}">${esc(formatOO(cost))}</button>`;
}

function cloneProgress(p) {
  return JSON.parse(JSON.stringify(p));
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    const data = JSON.parse(raw);
    const base = defaultProgress();
    return {
      qualities: { ...base.qualities, ...(data.qualities || {}) },
      upgrades: Object.fromEntries(
        Object.keys(base.upgrades).map((gem) => [
          gem,
          { ...base.upgrades[gem], ...(data.upgrades?.[gem] || {}) },
        ]),
      ),
    };
  } catch {
    return defaultProgress();
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* ignore quota */
  }
}

function nodeHtml(n) {
  const cls = ["gem-node"];
  if (n.gate) cls.push("gate");
  if (n.branch) cls.push("branch");
  if (filter !== "all" && n.gem !== filter) cls.push("dim");
  return `<button type="button" class="${cls.join(" ")}" data-gem="${n.gem}"
      data-title="${esc(n.title)}" data-desc="${esc(n.desc)}" data-req="${esc(n.req)}" data-cost="${esc(formatOO(n.cost))}">
    <div class="gem-label">${esc(n.gem)}${n.gate ? " · gate" : ""}</div>
    <div class="gem-q">${esc(n.q)}</div>
    <div class="gem-cost${n.gate ? " warn" : ""}">${esc(formatOO(n.cost))}</div>
    ${n.gateNote ? `<div class="gem-gate-note">${esc(n.gateNote)}</div>` : ""}
  </button>`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function qualityCostLine(gem) {
  const costs = QUALITY_COSTS[gem] || {};
  return Object.entries(costs)
    .map(([q, c]) => `Q${q} ${formatOO(c).replace(" OO", "")}`)
    .join(" · ");
}

function renderMap() {
  const map = root.querySelector("#gemMap");
  if (!map) return;
  const parts = [];
  UNLOCK_MAP.forEach((block, i) => {
    if (i > 0) parts.push(`<div class="gem-arrow-down">↓</div>`);
    parts.push(
      `<div class="gem-map-row">${block.row
        .map((n, j) => `${j ? '<span class="gem-arrow">→</span>' : ""}${nodeHtml(n)}`)
        .join("")}</div>`,
    );
  });
  parts.push(`<div class="gem-arrow-down">↓</div>`);
  parts.push(
    `<div class="gem-fork">${UNLOCK_FORK.map((n) => nodeHtml(n)).join("")}</div>`,
  );
  parts.push(
    `<p class="gem-map-note">Further quality tiers exist; SirRed v0.018 does not model all of them as a strict cross-gem chain. Costs and GUs are listed below.</p>`,
  );
  map.innerHTML = parts.join("");

  map.querySelectorAll(".gem-node").forEach((btn) => {
    btn.addEventListener("click", () => showDetail(btn));
  });
}

function showDetail(btn) {
  const panel = root.querySelector("#gemDetail");
  if (!panel) return;
  panel.querySelector("#gemDt").textContent = btn.dataset.title || "";
  panel.querySelector("#gemDd").textContent = btn.dataset.desc || "";
  panel.querySelector("#gemDc").textContent = btn.dataset.cost || "";
  panel.querySelector("#gemDr").textContent = btn.dataset.req || "";
  panel.hidden = false;
}

function renderFilters() {
  const bar = root.querySelector("#gemFilters");
  if (!bar) return;
  const items = ["all", ...GEM_ORDER];
  bar.innerHTML = items
    .map(
      (f) =>
        `<button type="button" class="btn gem-filter${filter === f ? " active" : ""}" data-filter="${f}">${
          f === "all" ? "All" : f
        }</button>`,
    )
    .join("");
  bar.querySelectorAll(".gem-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      renderFilters();
      applyFilterDim();
      renderQualityCards();
      renderUpgradeCards();
    });
  });
}

function applyFilterDim() {
  root.querySelectorAll("[data-gem]").forEach((el) => {
    el.classList.toggle("dim", filter !== "all" && el.dataset.gem !== filter);
  });
}

function renderQualityCards() {
  const el = root.querySelector("#gemQualityCards");
  if (!el) return;
  el.innerHTML = GEM_ORDER.map((gem) => {
    const dim = filter !== "all" && filter !== gem ? " dim" : "";
    return `<article class="gem-card${dim}" data-gem="${gem}">
      <h3>${gem}</h3>
      <div class="gem-quality-line">${esc(qualityCostLine(gem))} OO</div>
      <p>${esc(QUALITY_UNLOCKS[gem] || "")}</p>
    </article>`;
  }).join("");
}

function renderUpgradeCards() {
  const el = root.querySelector("#gemUpgradeCards");
  if (!el) return;
  el.innerHTML = GEM_ORDER.map((gem) => {
    const defs = GU_DEFS[gem] || [];
    const dim = filter !== "all" && filter !== gem ? " dim" : "";
    if (!defs.length) {
      return `<article class="gem-card${dim}" data-gem="${gem}">
        <h3>${gem} GUs</h3>
        <p class="gem-muted">No costed GU rows modelled yet (effects not fully attested).</p>
      </article>`;
    }
    const rows = defs
      .map(
        (d) => `<div class="gem-upgrade">
        <div class="gem-uhead"><span class="gem-uname">${esc(d.name)}</span><span class="gem-tag">from Q${d.fromQ}</span></div>
        <div class="gem-effect">${esc(d.effect)}</div>
        <div class="gem-costline">Lv1: ${esc(formatOO(d.base))} · cost multi ×${d.multi}</div>
      </div>`,
      )
      .join("");
    return `<article class="gem-card${dim}" data-gem="${gem}">
      <h3>${gem} GUs</h3>
      <div class="gem-quality-line">Early-level formulas from SirRed v0.018</div>
      ${rows}
    </article>`;
  }).join("");
}

function renderStatus() {
  const el = root.querySelector("#gemStatus");
  if (!el) return;

  // Rebuilding the panel clears the button DOM; drop any in-progress confirm.
  if (gemResetArmTimer) {
    clearTimeout(gemResetArmTimer);
    gemResetArmTimer = null;
  }
  gemResetArmStep = 0;

  const rows = activeGuRows(progress);
  const nextQ = findNextQuality(progress);
  const peers = allDisplayedCosts(rows, nextQ);

  const qualityEditors = GEM_ORDER.map((gem) => {
    const maxQ = Object.keys(QUALITY_COSTS[gem] || {}).length;
    const val = progress.qualities[gem] || 0;
    return `<div class="gem-q-edit" data-q-gem="${gem}">
      <div class="gem-q-name">${gem}</div>
      <div class="gem-stepper">
        <button type="button" class="btn btn-sm" data-act="-" aria-label="${gem} quality minus" ${val <= 0 ? "disabled" : ""}>−</button>
        <span class="gem-step-val" aria-live="polite">${val} <span class="gem-muted">/ ${maxQ}</span></span>
        <button type="button" class="btn btn-sm" data-act="+" aria-label="${gem} quality plus" ${val >= maxQ ? "disabled" : ""}>+</button>
      </div>
    </div>`;
  }).join("");

  const validPlanIds = new Set();

  let nextHtml = `<div class="gem-next-quality"><div class="gem-muted">No further quality in the modelled early chain.</div></div>`;
  if (nextQ) {
    const qId = `nq:${nextQ.gem}:Q${nextQ.quality}`;
    validPlanIds.add(qId);
    const guChips = (nextQ.firstGuCosts || [])
      .map((s, i) => {
        const pid = `nqgu:${nextQ.gem}:${nextQ.unlocksGu?.id || "gu"}:Lv${s.level}`;
        validPlanIds.add(pid);
        const label = i === 0 && nextQ.unlocksLabel ? `${nextQ.unlocksLabel} Lv${s.level}` : `Lv${s.level}`;
        return `<span class="oo-chip">${esc(label)} · ${ooTap(s.cost, peers, pid)}</span>`;
      })
      .join("");
    const reqOk = !nextQ.blocked;
    nextHtml = `<div class="gem-next-quality" aria-label="Next unlockable gem quality">
      <div><div class="label">Next Gem Quality</div><div class="value">${esc(nextQ.gem)} Q${nextQ.quality}</div></div>
      <div><div class="label">Cost</div><div class="value">${ooTap(nextQ.cost, peers, qId)}</div></div>
      <div>
        <div class="label">Requirement</div>
        <div class="value">${esc(nextQ.requirementLabel || "—")} ${reqOk ? "✓" : "✗"}</div>
        ${
          nextQ.blocked
            ? `<div class="gem-muted">${esc(nextQ.blockReason)}</div>`
            : nextQ.unlocksLabel
              ? `<div class="gem-muted">Unlocks ${esc(nextQ.unlocksLabel)}${nextQ.guEffect ? ` (${esc(nextQ.guEffect)})` : ""}.</div>`
              : ""
        }
      </div>
      <div>
        <div class="label">First 3 GU costs after purchase</div>
        <div class="gem-chips">${guChips || '<span class="gem-muted">No GU modelled for this quality</span>'}</div>
        ${guChips ? `<div class="gem-muted">GU costs only; quality itself costs ${esc(formatOO(nextQ.cost))} extra.</div>` : ""}
      </div>
    </div>`;
  }

  const tableRows = [];
  let lastGemQ = "";
  for (const row of rows) {
    const key = `${row.gem} Q${row.quality}`;
    const showGem = key !== lastGemQ;
    lastGemQ = key;
    const sameGemCount = rows.filter((r) => r.gem === row.gem && r.quality === row.quality).length;
    const gemCell = showGem
      ? `<td rowspan="${sameGemCount}"><b>${esc(row.gem)} Q${row.quality}</b></td>`
      : "";
    const cells = [0, 1, 2].map((i) => {
      const step = row.next[i];
      if (!step) return `<td>—</td>`;
      const pid = `gu:${row.gem}:${row.def.id}:Lv${step.level}`;
      validPlanIds.add(pid);
      return `<td>Lv${step.level} · ${ooTap(step.cost, peers, pid, i === 0 ? "is-next" : "")}</td>`;
    });
    const stack = row.def.stacking === "additive" ? "additive" : "multi";
    tableRows.push(`<tr>
      ${gemCell}
      <td class="gem-gu-name">${esc(row.def.name)}<sup class="gem-stack gem-stack-${stack}" title="${stack === "multi" ? "Multiplicative stacking" : "Additive stacking"}">${stack}</sup></td>
      <td class="gem-level-cell" data-gu-gem="${row.gem}" data-gu-id="${row.def.id}">
        <div class="gem-stepper gem-stepper-inline">
          <button type="button" class="btn btn-sm" data-act="-" aria-label="${esc(row.def.name)} minus" ${row.current <= 0 ? "disabled" : ""}>−</button>
          <span class="gem-step-val" aria-live="polite">${row.current} <span class="gem-muted">/ ${row.def.max}</span></span>
          <button type="button" class="btn btn-sm" data-act="+" aria-label="${esc(row.def.name)} plus" ${row.current >= row.def.max ? "disabled" : ""}>+</button>
        </div>
      </td>
      ${cells.join("")}
      <td>${esc(row.def.effect)}</td>
    </tr>`);
  }

  if (!tableRows.length) {
    tableRows.push(
      `<tr><td colspan="7" class="gem-muted">Set at least one gem quality above to see active GUs and next costs.</td></tr>`,
    );
  }

  // Drop plan picks that are no longer on screen (levels moved on).
  for (const id of [...planPicks.keys()]) {
    if (!validPlanIds.has(id)) planPicks.delete(id);
  }
  savePlan();

  const picks = planPicks.size;
  const sum = planSum();
  const remaining = planRemaining();
  const bankedDisplay = bankedOO > 0 ? String(bankedOO) : "";

  el.innerHTML = `
    <div class="gem-status-head">
      <h2>My current progress</h2>
      <p class="gem-muted">Edit qualities and GU levels — next three single-level costs update live. Tap color-coded OO amounts to build your planned total for the next Traversal.</p>
      <div class="gem-planned" aria-live="polite">
        <div class="gem-planned-main">
          <div class="label">Still needed for next Traversal</div>
          <div class="value">${esc(formatOO(remaining))}${
            picks || bankedOO
              ? ` <span class="gem-muted">· plan ${esc(formatOO(sum))}${bankedOO ? ` − banked ${esc(formatOO(bankedOO))}` : ""}${picks ? ` · ${picks} pick${picks === 1 ? "" : "s"}` : ""}</span>`
              : ""
          }</div>
        </div>
        <label class="gem-banked">
          <span class="label">Banked OO</span>
          <input id="gemBankedOO" type="number" min="0" step="any" inputmode="decimal" placeholder="0" value="${esc(bankedDisplay)}" aria-label="Banked Ouroboros Orbs" />
        </label>
        <button type="button" class="btn btn-sm" id="gemClearPlan" ${picks ? "" : "disabled"}>Clear plan</button>
      </div>
      <div class="gem-actions">
        <button type="button" class="btn btn-danger" id="gemResetDefaults" title="Reset gem progress to starter snapshot (triple confirm)">Reset to starter snapshot</button>
      </div>
    </div>
    <div class="gem-q-grid">${qualityEditors}</div>
    ${nextHtml}
    <div class="gem-table-wrap">
      <table class="gem-table">
        <thead>
          <tr>
            <th>Gem / Quality</th>
            <th>GU</th>
            <th>Current</th>
            <th>Next GU</th>
            <th>After</th>
            <th>3rd next</th>
            <th>GU effect</th>
          </tr>
        </thead>
        <tbody>${tableRows.join("")}</tbody>
      </table>
    </div>
    <p class="gem-muted gem-footnote">Heatmap is relative to your current buy horizon. GU costs use SirRed v0.018 early formulas (base × multi^(level−1)); high-level extra scaling is not modelled. Wiki: <a href="https://cifi.game-vault.net/wiki/Ouroboros_Gems_Collection" target="_blank" rel="noopener">Ouroboros Gems Collection</a>.</p>
  `;

  el.querySelectorAll(".gem-q-edit [data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const box = btn.closest(".gem-q-edit");
      const gem = box?.dataset.qGem;
      if (!gem) return;
      const maxQ = Object.keys(QUALITY_COSTS[gem] || {}).length;
      const delta = btn.dataset.act === "+" ? 1 : -1;
      const n = Math.max(0, Math.min(maxQ, (progress.qualities[gem] || 0) + delta));
      progress.qualities[gem] = n;
      pruneUpgradesForQuality(gem);
      saveProgress();
      renderStatus();
    });
  });

  el.querySelectorAll(".gem-level-cell [data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cell = btn.closest(".gem-level-cell");
      const gem = cell?.dataset.guGem;
      const id = cell?.dataset.guId;
      if (!gem || !id) return;
      const def = GU_DEFS[gem]?.find((g) => g.id === id);
      const hi = def?.max ?? 999;
      const delta = btn.dataset.act === "+" ? 1 : -1;
      const cur = progress.upgrades[gem]?.[id] ?? 0;
      if (!progress.upgrades[gem]) progress.upgrades[gem] = {};
      progress.upgrades[gem][id] = Math.max(0, Math.min(hi, cur + delta));
      saveProgress();
      renderStatus();
    });
  });

  el.querySelectorAll(".oo-tap").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.planId;
      const cost = Number(btn.dataset.planCost);
      if (!id || !Number.isFinite(cost)) return;
      if (planPicks.has(id)) planPicks.delete(id);
      else planPicks.set(id, cost);
      savePlan();
      renderStatus();
    });
  });

  el.querySelector("#gemClearPlan")?.addEventListener("click", () => {
    planPicks = new Map();
    savePlan();
    renderStatus();
  });

  const bankedInput = el.querySelector("#gemBankedOO");
  if (bankedInput) {
    const commitBanked = () => {
      const n = Number(bankedInput.value);
      bankedOO = Number.isFinite(n) && n > 0 ? n : 0;
      savePlan();
      renderStatus();
      const again = root.querySelector("#gemBankedOO");
      if (again) {
        again.focus();
        const len = again.value.length;
        again.setSelectionRange(len, len);
      }
    };
    bankedInput.addEventListener("change", commitBanked);
    bankedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitBanked();
      }
    });
  }

  el.querySelector("#gemResetDefaults")?.addEventListener("click", onGemResetClick);
}

function pruneUpgradesForQuality(gem) {
  const q = progress.qualities[gem] || 0;
  const defs = GU_DEFS[gem] || [];
  for (const def of defs) {
    if (def.fromQ > q) {
      if (progress.upgrades[gem]) progress.upgrades[gem][def.id] = 0;
    }
  }
}

function shellHtml() {
  return `
    <div class="gem-hero">
      <h2>Ouroboros Gem Progression</h2>
      <p class="gem-muted">Edit your gem qualities and GU levels below — next three upgrade costs and the next unlockable quality update live. Unlock chain from SirRed Gem Costings v0.018; effects cross-checked with the 2026 wiki where available.</p>
      <div class="gem-note"><b>Version note:</b> SirRed v0.018 marks itself as unmaintained and points to Adam’s newer planner. Cross-gem gates here follow <b>Planner v0.018 logic</b>.</div>
    </div>
    <section class="gem-section gem-status-section gem-status-top" id="gemStatus"></section>
    <div class="gem-toolbar" id="gemFilters" role="toolbar" aria-label="Filter gems"></div>
    <section class="gem-section">
      <h3>Unlock map</h3>
      <div class="gem-legend">
        <span><i class="gem-dot accent"></i>OO purchase price</span>
        <span><i class="gem-dot accent2"></i>Cross-gem gate</span>
        <span><i class="gem-dot warn"></i>Mandatory GU step</span>
      </div>
      <div class="gem-map" id="gemMap"></div>
    </section>
    <section class="gem-section">
      <h3>Quality → what unlocks?</h3>
      <div class="gem-cards" id="gemQualityCards"></div>
    </section>
    <section class="gem-section">
      <h3>Gem upgrades: effect + start costs</h3>
      <div class="gem-cards" id="gemUpgradeCards"></div>
    </section>
    <div class="gem-detail" id="gemDetail" hidden>
      <button type="button" class="gem-detail-close" id="gemDetailClose" aria-label="Close">×</button>
      <h3 id="gemDt"></h3>
      <p id="gemDd"></p>
      <p><b>Cost:</b> <span id="gemDc"></span></p>
      <p><b>Requirement:</b> <span id="gemDr"></span></p>
    </div>
  `;
}

export function initGemsModule(container) {
  root = container;
  progress = loadProgress();
  const plan = loadPlan();
  planPicks = plan.picks;
  bankedOO = plan.banked;
  root.innerHTML = shellHtml();
  root.querySelector("#gemDetailClose")?.addEventListener("click", () => {
    root.querySelector("#gemDetail").hidden = true;
  });
  renderFilters();
  renderMap();
  renderQualityCards();
  renderUpgradeCards();
  renderStatus();
}

export function getGemProgress() {
  return cloneProgress(progress);
}
