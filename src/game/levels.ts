import { Network } from "../sim/network";
import { DropTail } from "../sim/queue";

export interface Level {
  id: number;
  title: string;
  /** One or two sentences shown before the level starts. */
  brief: string;
  flows: number;
  buffer: number;
  durationMs: number;
  goal: {
    /** 95th percentile queueing delay must stay at or below this (ms). */
    maxP95Delay: number;
    /** Link utilisation must reach at least this (0..1). */
    minUtilization: number;
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
    goal: { maxP95Delay: 50, minUtilization: 0.9 },
  },
];

export function startLevel(level: Level): Network {
  return new Network({ ...LINK, queue: new DropTail(level.buffer), flows: level.flows });
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
  p95Delay: number;
  utilization: number;
  playerDrops: number;
}

export function evaluate(net: Network, level: Level): Result {
  const p95Delay = net.delayPercentile(0.95);
  const utilization = net.utilization;
  const { maxP95Delay, minUtilization } = level.goal;
  const passed = p95Delay <= maxP95Delay && utilization >= minUtilization;
  const stars = !passed
    ? 0
    : p95Delay <= 0.8 * maxP95Delay && utilization >= 0.97
      ? 3
      : p95Delay <= 0.9 * maxP95Delay
        ? 2
        : 1;
  return { passed, stars, p95Delay, utilization, playerDrops: net.playerDrops };
}
