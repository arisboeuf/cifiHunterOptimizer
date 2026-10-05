import {
  GEM_ORDER,
  GU_DEFS,
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

  let nextHtml = `<div class="gem-next-quality"><div class="gem-muted">No further quality in the modelled early chain.</div></div>`;
  if (nextQ) {
    const hm = heatClass(nextQ.cost, peers);
    const guChips = (nextQ.firstGuCosts || [])
      .map((s, i) => {
        const label = i === 0 && nextQ.unlocksLabel ? `${nextQ.unlocksLabel} Lv${s.level}` : `Lv${s.level}`;
        return `<span class="oo-cost ${heatClass(s.cost, peers)}">${esc(label)} · <b>${esc(formatOO(s.cost))}</b></span>`;
      })
      .join("");
    const reqOk = !nextQ.blocked;
    nextHtml = `<div class="gem-next-quality" aria-label="Next unlockable gem quality">
      <div><div class="label">Next Gem Quality</div><div class="value">${esc(nextQ.gem)} Q${nextQ.quality}</div></div>
      <div><div class="label">Cost</div><div class="value oo-cost ${hm}">${esc(formatOO(nextQ.cost))}</div></div>
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
      if (!step) return `<td class="oo-cost">—</td>`;
      const bold = i === 0 ? " <b>" : " ";
      const boldEnd = i === 0 ? "</b>" : "";
      return `<td class="oo-cost ${heatClass(step.cost, peers)}">Lv${step.level} ·${bold}${esc(formatOO(step.cost))}${boldEnd}</td>`;
    });
    tableRows.push(`<tr>
      ${gemCell}
      <td>${esc(row.def.name)}</td>
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

  el.innerHTML = `
    <div class="gem-status-head">
      <h2>My current progress</h2>
      <p class="gem-muted">Edit qualities and GU levels — next three single-level costs update live. Saved in this browser.</p>
      <div class="gem-actions">
        <button type="button" class="btn" id="gemResetDefaults">Reset to starter snapshot</button>
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

  el.querySelector("#gemResetDefaults")?.addEventListener("click", () => {
    progress = defaultProgress();
    saveProgress();
    renderStatus();
  });
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
