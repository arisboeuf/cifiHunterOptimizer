/** Lightweight canvas charts (no external deps). */

const COLORS = {
  accent: "#4263eb",
  accentFill: "rgba(66, 99, 235, 0.28)",
  green: "#22c55e",
  yellow: "#eab308",
  pink: "#f472b6",
  grid: "rgba(148, 163, 184, 0.22)",
  text: "#e2e8f0",
  muted: "#94a3b8",
  bg: "#0b1220",
};

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(280, Math.floor(rect.width));
  const h = Math.max(200, Math.floor(rect.height || 240));
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);
  return { ctx, w, h, pad: { l: 54, r: 14, t: 14, b: 46 } };
}

function emptyMessage(canvas, msg) {
  const { ctx, w, h } = setup(canvas);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(msg || "Run Simulation to see results", w / 2, h / 2);
}

function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  if (n <= 1) return 1 * pow;
  if (n <= 2) return 2 * pow;
  if (n <= 2.5) return 2.5 * pow;
  if (n <= 5) return 5 * pow;
  return 10 * pow;
}

function formatTick(v, { percent = false, digits = 0 } = {}) {
  if (percent) return `${Math.round(v)}%`;
  if (digits > 0) return Number(v).toFixed(digits);
  return String(Math.round(v));
}

function axesFrame(ctx, w, h, pad, xLabel, yLabel) {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, h - pad.b);
  ctx.lineTo(w - pad.r, h - pad.b);
  ctx.stroke();
  ctx.fillStyle = COLORS.muted;
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(xLabel, (pad.l + w - pad.r) / 2, h - 6);
  ctx.save();
  ctx.translate(12, (pad.t + h - pad.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

/** Discrete stage ticks (bar charts). Aim for many labels. */
function drawXTicksDiscrete(ctx, w, h, pad, minX, maxX, span) {
  const plotW = w - pad.l - pad.r;
  const count = Math.max(1, Math.floor(maxX - minX) + 1);
  const maxLabels = Math.max(8, Math.floor(plotW / 18));
  const step = Math.max(1, Math.ceil(count / maxLabels));
  const lo = Math.round(minX);
  const hi = Math.round(maxX);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let x = lo; x <= hi; x++) {
    if (x !== lo && x !== hi && (x - lo) % step !== 0) continue;
    const px = pad.l + ((x - minX + 0.5) / span) * plotW;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(px, h - pad.b);
    ctx.lineTo(px, h - pad.b + 3);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(String(x), px, h - pad.b + 4);
  }
}

/** Continuous x ticks (line charts). */
function drawXTicksContinuous(ctx, w, h, pad, minX, maxX) {
  const plotW = w - pad.l - pad.r;
  const span = Math.max(1e-9, maxX - minX);
  const approxLabels = Math.max(8, Math.floor(plotW / 22));
  const step = Math.max(1, niceStep(span / approxLabels));
  const start = Math.ceil(minX / step) * step;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let x = start; x <= maxX + 1e-9; x += step) {
    const px = pad.l + ((x - minX) / span) * plotW;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(px, h - pad.b);
    ctx.lineTo(px, h - pad.b + 3);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(String(Math.round(x)), px, h - pad.b + 4);
  }
  // ensure endpoints if missing
  for (const edge of [minX, maxX]) {
    const near = Math.abs(edge - start) < step * 0.25 || Math.abs(edge - (start + Math.floor((maxX - start) / step) * step)) < step * 0.25;
    if (near && edge !== minX && edge !== maxX) continue;
    if (Math.abs(edge - minX) < 1e-9 || Math.abs(edge - maxX) < 1e-9) {
      const px = pad.l + ((edge - minX) / span) * plotW;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(String(Math.round(edge)), px, h - pad.b + 4);
    }
  }
}

/** Y-axis ticks + horizontal grid. `mapY` maps value → canvas y. */
function drawYTicks(ctx, w, h, pad, minY, maxY, mapY, fmt = {}) {
  const plotH = h - pad.t - pad.b;
  const approxLabels = Math.max(5, Math.floor(plotH / 28));
  const span = Math.max(1e-9, maxY - minY);
  const step = niceStep(span / approxLabels);
  const start = Math.ceil(minY / step) * step;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = start; y <= maxY + step * 0.01; y += step) {
    if (y < minY - 1e-9) continue;
    const py = mapY(y);
    if (py < pad.t - 2 || py > h - pad.b + 2) continue;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(pad.l, py);
    ctx.lineTo(w - pad.r, py);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(formatTick(y, fmt), pad.l - 6, py);
  }
}

export function drawEmpty(canvas) {
  emptyMessage(canvas);
}

export function drawBarChart(canvas, counts, { color = COLORS.accent, labelY = "Frequency" } = {}) {
  const entries = Object.entries(counts || {}).map(([k, v]) => [Number(k), Number(v)]);
  if (!entries.length) return emptyMessage(canvas);
  const { ctx, w, h, pad } = setup(canvas);
  axesFrame(ctx, w, h, pad, "Stage", labelY);
  const xs = entries.map((e) => e[0]);
  const ys = entries.map((e) => e[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys, 1);
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const span = Math.max(1, maxX - minX + 1);
  const barW = Math.max(2, (plotW / span) * 0.75);
  const mapY = (y) => h - pad.b - (y / maxY) * plotH;

  drawYTicks(ctx, w, h, pad, 0, maxY, mapY);
  ctx.fillStyle = color;
  for (const [x, y] of entries) {
    const px = pad.l + ((x - minX + 0.5) / span) * plotW - barW / 2;
    const ph = (y / maxY) * plotH;
    ctx.fillRect(px, h - pad.b - ph, barW, ph);
  }
  drawXTicksDiscrete(ctx, w, h, pad, minX, maxX, span);
}

export function drawOddsChart(canvas, odds) {
  const entries = Object.entries(odds || {}).map(([k, v]) => [Number(k), Number(v) * 100]);
  if (!entries.length) return emptyMessage(canvas);
  const { ctx, w, h, pad } = setup(canvas);
  axesFrame(ctx, w, h, pad, "Stage", "Odds %");
  const xs = entries.map((e) => e[0]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const span = Math.max(1e-9, maxX - minX);

  const mapX = (x) => pad.l + ((x - minX) / span) * plotW;
  const mapY = (y) => h - pad.b - (y / 105) * plotH;

  drawYTicks(ctx, w, h, pad, 0, 100, mapY, { percent: true });

  for (const [thr, col] of [
    [90, COLORS.green],
    [50, COLORS.yellow],
    [10, COLORS.pink],
  ]) {
    ctx.strokeStyle = col;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.l, mapY(thr));
    ctx.lineTo(w - pad.r, mapY(thr));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.beginPath();
  entries.forEach(([x, y], i) => {
    const px = mapX(x);
    const py = mapY(y);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.lineTo(mapX(entries[entries.length - 1][0]), h - pad.b);
  ctx.lineTo(mapX(entries[0][0]), h - pad.b);
  ctx.closePath();
  ctx.fillStyle = COLORS.accentFill;
  ctx.fill();
  drawXTicksContinuous(ctx, w, h, pad, minX, maxX);
}

export function drawReviveChart(canvas, first, second) {
  const stages = [...new Set([...Object.keys(first || {}), ...Object.keys(second || {})].map(Number))].sort(
    (a, b) => a - b,
  );
  if (!stages.length) return emptyMessage(canvas);
  const { ctx, w, h, pad } = setup(canvas);
  axesFrame(ctx, w, h, pad, "Stage", "Frequency");
  const f1 = stages.map((s) => Number(first[s] || 0));
  const f2 = stages.map((s) => Number(second[s] || 0));
  const maxY = Math.max(...f1.map((a, i) => a + f2[i]), 1);
  const minX = stages[0];
  const maxX = stages[stages.length - 1];
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const span = Math.max(1, maxX - minX + 1);
  const barW = Math.max(2, (plotW / span) * 0.7);
  const mapY = (y) => h - pad.b - (y / maxY) * plotH;

  drawYTicks(ctx, w, h, pad, 0, maxY, mapY);
  stages.forEach((x, i) => {
    const px = pad.l + ((x - minX + 0.5) / span) * plotW - barW / 2;
    const h1 = (f1[i] / maxY) * plotH;
    const h2 = (f2[i] / maxY) * plotH;
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(px, h - pad.b - h1, barW, h1);
    ctx.fillStyle = COLORS.yellow;
    ctx.fillRect(px, h - pad.b - h1 - h2, barW, h2);
  });
  drawXTicksDiscrete(ctx, w, h, pad, minX, maxX, span);
}
