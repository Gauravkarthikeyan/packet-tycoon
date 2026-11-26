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
