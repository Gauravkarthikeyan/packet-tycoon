import { describe, expect, it } from "vitest";
import { Network } from "./network";
import { DropTail } from "./queue";

// 1000 pkt/s bottleneck, 40 ms RTT -> bandwidth-delay product of 40 packets.
const base = { rate: 1000, propDelay: 20, ackDelay: 20 };

describe("Network (end-to-end behaviour)", () => {
  it("a single Reno flow fills the link and shows the loss sawtooth", () => {
    const net = new Network({ ...base, queue: new DropTail(40), flows: 1 });
    net.run(30_000);
    const s = net.senders[0]!;
    expect(net.utilization).toBeGreaterThan(0.9);
    expect(s.stats.fastRetransmits).toBeGreaterThan(3); // repeated cwnd halving
    expect(net.flowStats[0]!.delivered).toBeGreaterThan(27_000);
  });

  it("a huge buffer causes bufferbloat: same throughput, far more delay", () => {
    const small = new Network({ ...base, queue: new DropTail(40), flows: 1 });
    const huge = new Network({ ...base, queue: new DropTail(2000), flows: 1 });
    small.run(30_000);
    huge.run(30_000);
    expect(huge.utilization).toBeGreaterThan(0.9);
    expect(huge.avgQueueDelay).toBeGreaterThan(5 * small.avgQueueDelay);
  });

  it("competing Reno flows share the link roughly fairly", () => {
    const net = new Network({ ...base, queue: new DropTail(60), flows: 4 });
    net.run(60_000);
    expect(net.utilization).toBeGreaterThan(0.9);
    expect(net.fairness).toBeGreaterThan(0.85);
  });

  it("never delivers more than the link can carry", () => {
    const net = new Network({ ...base, rate: 250, queue: new DropTail(20), flows: 3 });
    net.run(10_000);
    const total = net.flowStats.reduce((a, f) => a + f.delivered, 0);
    expect(total).toBeLessThanOrEqual(2500);
  });

  it("p95 delay tracks the buffer: tiny buffer, tiny tail", () => {
    const small = new Network({ ...base, queue: new DropTail(10), flows: 1 });
    const big = new Network({ ...base, queue: new DropTail(200), flows: 1 });
    small.run(20_000);
    big.run(20_000);
    expect(small.delayPercentile(0.95)).toBeLessThanOrEqual(10);
    expect(big.delayPercentile(0.95)).toBeGreaterThan(100);
    expect(big.delayPercentile(0.5)).toBeLessThanOrEqual(big.delayPercentile(0.95));
  });

  it("a player drop counts as a loss and the sender reacts to it", () => {
    const net = new Network({ ...base, queue: new DropTail(200), flows: 1 });
    net.run(5_000);
    const before = net.senders[0]!.stats.fastRetransmits + net.senders[0]!.stats.timeouts;
    expect(net.dropAt(net.queue.length - 1)).toBe(true);
    expect(net.dropAt(10_000)).toBe(false);
    net.run(1_000);
    const after = net.senders[0]!.stats.fastRetransmits + net.senders[0]!.stats.timeouts;
    expect(net.playerDrops).toBe(1);
    expect(net.flowStats[0]!.drops).toBeGreaterThanOrEqual(1);
    expect(after).toBeGreaterThan(before);
  });
});
