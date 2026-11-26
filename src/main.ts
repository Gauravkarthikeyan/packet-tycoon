import { evaluate, LEVELS, startLevel, type Level, type Result } from "./game/levels";
import { packetAt, queueLayout } from "./layout";
import { draw, History } from "./render";
import { Network } from "./sim/network";
import { DropTail } from "./sim/queue";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const controls = {
  buffer: $<HTMLInputElement>("buffer"),
  flows: $<HTMLInputElement>("flows"),
  speed: $<HTMLInputElement>("speed"),
};
const modeSelect = $<HTMLSelectElement>("mode");
const hud = $("hud");
const overlay = {
  root: $("overlay"),
  title: $("overlay-title"),
  body: $("overlay-body"),
  actions: $("overlay-actions"),
};

/** Sandbox runs forever; a level goes brief -> playing -> done. */
type Phase = "sandbox" | "brief" | "playing" | "done";

let net: Network;
let hist: History;
let level: Level | undefined;
let phase: Phase = "sandbox";

for (const [value, text] of [
  ["sandbox", "sandbox"],
  ...LEVELS.map((l) => [String(l.id), `level ${l.id} · ${l.title}`]),
]) {
  modeSelect.add(new Option(text, value));
}

function reset(): void {
  level = LEVELS.find((l) => String(l.id) === modeSelect.value);
  if (level) {
    net = startLevel(level);
    controls.speed.value = String(level.speed);
    phase = "brief";
    showBrief(level);
  } else {
    net = new Network({
      rate: 1000,
      propDelay: 20,
      ackDelay: 20,
      queue: new DropTail(Number(controls.buffer.value)),
      flows: Number(controls.flows.value),
    });
    phase = "sandbox";
    overlay.root.hidden = true;
  }
  hist = new History(net.senders.length);
  hud.hidden = !level;
  document.querySelectorAll<HTMLElement>(".sandbox-only").forEach((el) => {
    el.setAttribute("aria-disabled", String(Boolean(level)));
    el.querySelector("input")!.disabled = Boolean(level);
  });
  for (const [k, el] of Object.entries(controls)) $(`${k}-value`).textContent = el.value;
}

function showOverlay(title: string, body: string | Node, actions: [string, () => void][]): void {
  overlay.title.textContent = title;
  overlay.body.replaceChildren(body);
  overlay.actions.replaceChildren(
    ...actions.map(([label, onClick], i) => {
      const b = document.createElement("button");
      b.textContent = label;
      if (i === 0) b.className = "primary";
      b.addEventListener("click", onClick);
      return b;
    }),
  );
  overlay.root.hidden = false;
  (overlay.actions.firstElementChild as HTMLElement | null)?.focus();
}

function showBrief(l: Level): void {
  const goal = `Goal: 95 % of packets wait ≤ ${l.goal.maxP95Delay} ms, and the link stays ≥ ${l.goal.minUtilization * 100} % busy, for ${l.durationMs / 1000} simulated seconds.`;
  showOverlay(`Level ${l.id}: ${l.title}`, `${l.brief} ${goal}`, [
    [
      "Start",
      () => {
        overlay.root.hidden = true;
        phase = "playing";
      },
    ],
  ]);
}

function showResult(l: Level, r: Result): void {
  const card = document.createDocumentFragment();
  const stars = document.createElement("div");
  stars.className = "stars";
  stars.setAttribute("aria-label", `${r.stars} of 3 stars`);
  stars.textContent = "★".repeat(r.stars) + "☆".repeat(3 - r.stars);
  const verdict = document.createElement("p");
  verdict.textContent = r.passed
    ? "The queue stayed short and the link stayed busy."
    : r.p95Delay > l.goal.maxP95Delay
      ? "Too much waiting. The queue grew past the line; drop a packet before it gets there."
      : "The link sat idle. Every drop halves a sender's window, so drop less often.";
  const table = document.createElement("table");
  for (const [k, v] of [
    ["p95 queueing delay", `${r.p95Delay} ms (goal ≤ ${l.goal.maxP95Delay})`],
    ["link utilisation", `${(r.utilization * 100).toFixed(1)} % (goal ≥ ${l.goal.minUtilization * 100})`],
    ["packets you dropped", String(r.playerDrops)],
  ]) {
    table.insertRow().append(...[k, v].map((t) => Object.assign(document.createElement("td"), { textContent: t })));
  }
  card.append(stars, verdict, table);
  showOverlay(r.passed ? "Level complete" : "Not quite", card, [
    ["Try again", reset],
    [
      "Sandbox",
      () => {
        modeSelect.value = "sandbox";
        reset();
      },
    ],
  ]);
}

function updateHud(l: Level): void {
  const p95 = net.delayPercentile(0.95);
  const util = net.utilization;
  const left = Math.max(0, (l.durationMs - net.now) / 1000);
  const item = (text: string, ok: boolean) => `<span class="${ok ? "ok" : "bad"}">${text}</span>`;
  hud.innerHTML =
    `<span>${left.toFixed(1)} s left</span>` +
    item(`p95 ${p95} ms`, p95 <= l.goal.maxP95Delay) +
    item(`util ${(util * 100).toFixed(0)} %`, util >= l.goal.minUtilization);
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
}

function frame(): void {
  if (phase === "sandbox" || phase === "playing") {
    const ticks = Number(controls.speed.value);
    // Never run past the end of a level, so the score covers exactly its duration.
    const n = level ? Math.min(ticks, level.durationMs - net.now) : ticks;
    net.run(n);
    hist.sample(net);
  }
  if (level) {
    updateHud(level);
    if (phase === "playing" && net.now >= level.durationMs) {
      phase = "done";
      showResult(level, evaluate(net, level));
    }
  }
  // At 1000 packets/s, one queued packet is one millisecond of waiting.
  const goal = level && { packets: level.goal.maxP95Delay, label: `${level.goal.maxP95Delay} ms` };
  draw(ctx, net, hist, goal);
  requestAnimationFrame(frame);
}

modeSelect.addEventListener("change", reset);
controls.buffer.addEventListener("input", reset);
controls.flows.addEventListener("input", reset);
controls.speed.addEventListener("input", () => {
  $("speed-value").textContent = controls.speed.value;
});
$("reset").addEventListener("click", reset);
window.addEventListener("resize", resize);

// Click (or tap) a packet in the queue to drop it.
canvas.addEventListener("pointerdown", (e) => {
  if (phase !== "sandbox" && phase !== "playing") return;
  const rect = canvas.getBoundingClientRect();
  const layout = queueLayout(rect.height, net.queue.capacity);
  const index = packetAt(layout, net.queue.length, e.clientX - rect.left, e.clientY - rect.top);
  if (index !== undefined) net.dropAt(index);
});

resize();
reset();
requestAnimationFrame(frame);
