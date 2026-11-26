import { queueLayout } from "./layout";
import type { Network } from "./sim/network";

export const FLOW_COLORS = ["#ff6b6b", "#4dabf7", "#51cf66", "#fcc419", "#cc5de8", "#ff922b"];

const BG = "#0f1117";
const FG = "#e6e6e6";
const MUTED = "#6b7280";

/** Rolling cwnd history per flow, sampled every frame. */
export class History {
  readonly cwnd: number[][];
  readonly queue: number[] = [];
  constructor(flows: number, readonly max = 600) {
    this.cwnd = Array.from({ length: flows }, () => []);
  }
  sample(net: Network): void {
    net.senders.forEach((s, i) => push(this.cwnd[i]!, s.cwnd, this.max));
    push(this.queue, net.queue.length, this.max);
  }
}

function push(arr: number[], v: number, max: number): void {
  arr.push(v);
  if (arr.length > max) arr.shift();
}

export function draw(ctx: CanvasRenderingContext2D, net: Network, hist: History): void {
  const { width: w, height: h } = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = w / dpr;
  const H = h / dpr;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // --- the router queue: a column of packets, front of the queue at the bottom
  const cap = net.queue.capacity;
  const { x: qx, width: qw, top: qTop, bottom: qBottom, cell } = queueLayout(H, cap);
  ctx.strokeStyle = MUTED;
  ctx.strokeRect(qx - 0.5, qTop - 0.5, qw + 1, qBottom - qTop + 1);
  net.queue.packets().forEach((p, i) => {
    ctx.fillStyle = FLOW_COLORS[p.flow % FLOW_COLORS.length]!;
    ctx.globalAlpha = p.retransmit ? 0.45 : 1;
    ctx.fillRect(qx, qBottom - (i + 1) * cell, qw, Math.max(cell - (cell > 3 ? 1 : 0), 0.5));
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = FG;
  ctx.font = "13px ui-monospace, monospace";
  ctx.fillText("YOUR QUEUE", qx - 4, 24);
  ctx.fillStyle = MUTED;
  ctx.fillText(`${net.queue.length}/${cap}`, qx, 40);

  // --- cwnd chart (the sawtooth)
  const cx = qx + qw + 48;
  const cw = W - cx - 24;
  const chartH = (H - 120) * 0.65;
  plot(ctx, hist.cwnd, cx, 48, cw, chartH, "cwnd per flow (packets)");

  // --- queue occupancy chart
  const q2y = 48 + chartH + 40;
  plot(ctx, [hist.queue], cx, q2y, cw, H - q2y - 32, "queue length", ["#adb5bd"], cap);

  // --- stats line
  const s = net.senders;
  const drops = net.flowStats.reduce((a, f) => a + f.drops, 0);
  ctx.fillStyle = FG;
  ctx.fillText(
    `t=${(net.now / 1000).toFixed(1)}s  util=${(net.utilization * 100).toFixed(0)}%  ` +
      `avg queue delay=${net.avgQueueDelay.toFixed(0)}ms  drops=${drops}  ` +
      `fairness=${net.fairness.toFixed(2)}  timeouts=${s.reduce((a, x) => a + x.stats.timeouts, 0)}`,
    cx,
    24,
  );
}

function plot(
  ctx: CanvasRenderingContext2D,
  series: number[][],
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  colors = FLOW_COLORS,
  fixedMax?: number,
): void {
  const max = fixedMax ?? Math.max(4, ...series.flatMap((s) => s)) * 1.1;
  ctx.strokeStyle = "#252a36";
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = MUTED;
  ctx.fillText(label, x + 6, y + 16);
  ctx.fillText(max.toFixed(0), x - 30, y + 10);
  series.forEach((s, i) => {
    if (s.length < 2) return;
    ctx.strokeStyle = colors[i % colors.length]!;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    s.forEach((v, j) => {
      const px = x + (j / (s.length - 1)) * w;
      const py = y + h - (Math.min(v, max) / max) * h;
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });
}
