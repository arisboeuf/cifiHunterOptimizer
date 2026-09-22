/** Lightweight canvas charts (no external deps). */

const COLORS = {
  accent: "#4263eb",
  accentFill: "rgba(66, 99, 235, 0.28)",
  green: "#22c55e",
  yellow: "#eab308",
  pink: "#f472b6",
  grid: "rgba(148, 163, 184, 0.25)",
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
  return { ctx, w, h, pad: { l: 44, r: 16, t: 16, b: 36 } };
}

function emptyMessage(canvas, msg) {
  const { ctx, w, h } = setup(canvas);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(msg || "Run Simulation to see results", w / 2, h / 2);
}

function axes(ctx, w, h, pad, xLabel, yLabel) {
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
  ctx.fillText(xLabel, (pad.l + w - pad.r) / 2, h - 10);
  ctx.save();
  ctx.translate(14, (pad.t + h - pad.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

export function drawEmpty(canvas) {
  emptyMessage(canvas);
}

export function drawBarChart(canvas, counts, { color = COLORS.accent, labelY = "Frequency" } = {}) {
  const entries = Object.entries(counts || {}).map(([k, v]) => [Number(k), Number(v)]);
  if (!entries.length) return emptyMessage(canvas);
  const { ctx, w, h, pad } = setup(canvas);
  axes(ctx, w, h, pad, "Stage", labelY);
  const xs = entries.map((e) => e[0]);
  const ys = entries.map((e) => e[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys, 1);
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const span = Math.max(1, maxX - minX + 1);
  const barW = Math.max(2, (plotW / span) * 0.75);

  ctx.fillStyle = color;
  for (const [x, y] of entries) {
    const px = pad.l + ((x - minX + 0.5) / span) * plotW - barW / 2;
    const ph = (y / maxY) * plotH;
    ctx.fillRect(px, h - pad.b - ph, barW, ph);
  }
}

export function drawOddsChart(canvas, odds) {
  const entries = Object.entries(odds || {}).map(([k, v]) => [Number(k), Number(v) * 100]);
  if (!entries.length) return emptyMessage(canvas);
  const { ctx, w, h, pad } = setup(canvas);
  axes(ctx, w, h, pad, "Stage", "Odds %");
  const xs = entries.map((e) => e[0]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const span = Math.max(1, maxX - minX);

  const mapX = (x) => pad.l + ((x - minX) / span) * plotW;
  const mapY = (y) => h - pad.b - (y / 105) * plotH;

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
}

export function drawReviveChart(canvas, first, second) {
  const stages = [...new Set([...Object.keys(first || {}), ...Object.keys(second || {})].map(Number))].sort(
    (a, b) => a - b,
  );
  if (!stages.length) return emptyMessage(canvas);
  const { ctx, w, h, pad } = setup(canvas);
  axes(ctx, w, h, pad, "Stage", "Frequency");
  const f1 = stages.map((s) => Number(first[s] || 0));
  const f2 = stages.map((s) => Number(second[s] || 0));
  const maxY = Math.max(...f1.map((a, i) => a + f2[i]), 1);
  const minX = stages[0];
  const maxX = stages[stages.length - 1];
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const span = Math.max(1, maxX - minX + 1);
  const barW = Math.max(2, (plotW / span) * 0.7);

  stages.forEach((x, i) => {
    const px = pad.l + ((x - minX + 0.5) / span) * plotW - barW / 2;
    const h1 = (f1[i] / maxY) * plotH;
    const h2 = (f2[i] / maxY) * plotH;
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(px, h - pad.b - h1, barW, h1);
    ctx.fillStyle = COLORS.yellow;
    ctx.fillRect(px, h - pad.b - h1 - h2, barW, h2);
  });
}
