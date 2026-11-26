// Reproduces the tables in the README: `npm run experiments`.
// The simulation is deterministic, so the numbers come out the same every run.
import { Network } from "../src/sim/network";
import { DropTail } from "../src/sim/queue";

// 1000 pkt/s bottleneck, 40 ms RTT -> bandwidth-delay product of 40 packets.
const base = { rate: 1000, propDelay: 20, ackDelay: 20 };
const SECONDS = 30;

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const ms = (x: number) => `${x.toFixed(x < 10 ? 1 : 0)} ms`;

function run(buffer: number, flows: number) {
  const net = new Network({ ...base, queue: new DropTail(buffer), flows });
  net.run(SECONDS * 1000);
  const drops = net.flowStats.reduce((a, f) => a + f.drops, 0);
  const timeouts = net.senders.reduce((a, s) => a + s.stats.timeouts, 0);
  return { net, drops, timeouts };
}

console.log(`## Buffer size, 1 flow, ${SECONDS} s\n`);
console.log("| Router buffer | Link utilisation | Avg. queueing delay |");
console.log("|---:|---:|---:|");
for (const buffer of [10, 40, 200, 2000]) {
  const { net } = run(buffer, 1);
  console.log(`| ${buffer} packets | ${pct(net.utilization)} | ${ms(net.avgQueueDelay)} |`);
}

console.log(`\n## Number of flows, 40-packet buffer, ${SECONDS} s\n`);
console.log("| Flows | Link utilisation | Avg. queueing delay | Jain fairness | Drops | Timeouts |");
console.log("|---:|---:|---:|---:|---:|---:|");
for (const flows of [1, 2, 4, 8, 16, 32]) {
  const { net, drops, timeouts } = run(40, flows);
  console.log(
    `| ${flows} | ${pct(net.utilization)} | ${ms(net.avgQueueDelay)} | ${net.fairness.toFixed(3)} | ${drops} | ${timeouts} |`,
  );
}

// How you drop matters more than which flow you drop from. Four flows, a
// 120-packet buffer, 20 s, and a "player" who keeps the queue near 30 packets.
type Player = (net: Network, last: { at: number }) => void;
const paced =
  (pick: (net: Network) => number): Player =>
  (net, last) => {
    if (net.queue.length > 28 && net.now - last.at >= 40) {
      net.dropAt(pick(net));
      last.at = net.now;
    }
  };
const biggestFlowNewest = (net: Network): number => {
  const pkts = net.queue.packets();
  const counts = new Map<number, number>();
  for (const p of pkts) counts.set(p.flow, (counts.get(p.flow) ?? 0) + 1);
  const hog = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
  return pkts.map((p) => p.flow).lastIndexOf(hog);
};
const players: [string, Player][] = [
  ["do nothing", () => {}],
  [
    "drop everything above 30",
    (net) => {
      while (net.queue.length > 30) net.dropAt(net.queue.length - 1);
    },
  ],
  ["one drop per RTT, newest packet", paced((net) => net.queue.length - 1)],
  ["one drop per RTT, biggest flow", paced(biggestFlowNewest)],
  ["one drop per RTT, oldest packet", paced(() => 0)],
];

console.log("\n## Four flows, 120-packet buffer: how you drop, 20 s\n");
console.log("| Strategy | p95 queueing delay | Link utilisation | Drops | Timeouts |");
console.log("|---|---:|---:|---:|---:|");
for (const [name, player] of players) {
  const net = new Network({ ...base, queue: new DropTail(120), flows: 4 });
  const last = { at: -Infinity };
  for (let t = 0; t < 20_000; t++) {
    net.tick();
    player(net, last);
  }
  const drops = net.flowStats.reduce((a, f) => a + f.drops, 0);
  const timeouts = net.senders.reduce((a, s) => a + s.stats.timeouts, 0);
  console.log(`| ${name} | ${net.delayPercentile(0.95)} ms | ${pct(net.utilization)} | ${drops} | ${timeouts} |`);
}
