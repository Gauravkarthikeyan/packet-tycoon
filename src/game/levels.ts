import { Network } from "../sim/network";
import { DropTail } from "../sim/queue";

export interface Level {
  id: number;
  title: string;
  /** One or two sentences shown before the level starts. */
  brief: string;
  /** Bulk NewReno flows. */
  flows: number;
  /** Constant-bit-rate flows (pkt/s each), numbered after the Reno flows. */
  cbr?: number[];
  buffer: number;
  durationMs: number;
  /** Suggested game speed (simulated ms per frame); lower = more time to click. */
  speed: number;
  goal: {
    /** 95th percentile queueing delay must stay at or below this (ms). */
    maxP95Delay: number;
    /** Link utilisation must reach at least this (0..1). */
    minUtilization: number;
    /** If set, the delay and loss goals apply to this flow only. */
    flow?: number;
    /** If set, at most this fraction (0..1) of the goal flow's packets may be lost. */
    maxLoss?: number;
  };
}

// Same link as the sandbox: 1000 pkt/s, 40 ms RTT, so the BDP is 40 packets.
const LINK = { rate: 1000, propDelay: 20, ackDelay: 20 };

export const LEVELS: readonly Level[] = [
  {
    id: 1,
    title: "Keep it under 50 ms",
    brief:
      "Someone gave this router a 200-packet buffer. Left alone it fills up and every packet waits over 100 ms. Click packets to drop them, but keep the link busy.",
    flows: 1,
    buffer: 200,
    durationMs: 30_000,
    speed: 8,
    goal: { maxP95Delay: 50, minUtilization: 0.9 },
  },
  {
    id: 2,
    title: "One at a time",
    brief:
      "Four senders share the link now. Drop a burst and they all halve their windows together, and the link goes quiet. Drop one packet, then give it a round trip (40 ms) to work before the next.",
    flows: 4,
    buffer: 120,
    durationMs: 20_000,
    speed: 4,
    goal: { maxP95Delay: 30, minUtilization: 0.96 },
  },
  {
    id: 3,
    title: "Don't drop the call",
    brief:
      "Two big downloads and a video call (green) share a 200-packet buffer. The call needs its packets within 40 ms and can't stand losing more than 1 % of them. The downloads don't care.",
    flows: 2,
    cbr: [100],
    buffer: 200,
    durationMs: 25_000,
    speed: 4,
    goal: { maxP95Delay: 40, minUtilization: 0.92, flow: 2, maxLoss: 0.01 },
  },
];

export function startLevel(level: Level): Network {
  return new Network({
    ...LINK,
    queue: new DropTail(level.buffer),
    flows: level.flows,
    cbr: level.cbr,
  });
}

export interface Result {
  passed: boolean;
  /**
   * 0 = failed, 1 = passed, 2 = tail delay within 90 % of the limit,
   * 3 = within 80 % and >= 97 % utilisation. With one Reno flow you can't beat
   * the buffer-size trade-off (see the README tables), so the stars reward
   * hugging it closely rather than escaping it.
   */
  stars: 0 | 1 | 2 | 3;
  /** p95 queueing delay of the goal flow (or all packets). */
  p95Delay: number;
  /** Loss of the goal flow, when the level has a loss goal. */
  loss?: number;
  utilization: number;
  playerDrops: number;
}

export function evaluate(net: Network, level: Level): Result {
  const { flow, maxLoss } = level.goal;
  const p95Delay = flow === undefined ? net.delayPercentile(0.95) : net.flowDelayPercentile(flow, 0.95);
  const loss = flow === undefined || maxLoss === undefined ? undefined : net.flowLoss(flow);
  const utilization = net.utilization;
  const { maxP95Delay, minUtilization } = level.goal;
  const passed =
    p95Delay <= maxP95Delay && utilization >= minUtilization && (loss === undefined || loss <= maxLoss!);
  const stars = !passed
    ? 0
    : p95Delay <= 0.8 * maxP95Delay && utilization >= 0.97
      ? 3
      : p95Delay <= 0.9 * maxP95Delay
        ? 2
        : 1;
  return { passed, stars, p95Delay, loss, utilization, playerDrops: net.playerDrops };
}
