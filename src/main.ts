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

let net: Network;
let hist: History;

function reset(): void {
  const flows = Number(controls.flows.value);
  net = new Network({
    rate: 1000,
    propDelay: 20,
    ackDelay: 20,
    queue: new DropTail(Number(controls.buffer.value)),
    flows,
  });
  hist = new History(flows);
  for (const [k, el] of Object.entries(controls)) $(`${k}-value`).textContent = el.value;
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
}

function frame(): void {
  net.run(Number(controls.speed.value));
  hist.sample(net);
  draw(ctx, net, hist);
  requestAnimationFrame(frame);
}

controls.buffer.addEventListener("input", reset);
controls.flows.addEventListener("input", reset);
controls.speed.addEventListener("input", () => {
  $("speed-value").textContent = controls.speed.value;
});
$("reset").addEventListener("click", reset);
window.addEventListener("resize", resize);

// Click (or tap) a packet in the queue to drop it.
canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const layout = queueLayout(rect.height, net.queue.capacity);
  const index = packetAt(layout, net.queue.length, e.clientX - rect.left, e.clientY - rect.top);
  if (index !== undefined) net.dropAt(index);
});

resize();
reset();
requestAnimationFrame(frame);
