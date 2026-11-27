import { describe, expect, it } from "vitest";
import type { Network } from "../sim/network";
import { LEVELS, evaluate, startLevel, type Level } from "./levels";

const level1 = LEVELS[0]!;
const level2 = LEVELS[1]!;
const level3 = LEVELS[2]!;

function play(dropAbove: number | undefined) {
  const net = startLevel(level1);
  for (let t = 0; t < level1.durationMs; t++) {
    net.tick();
    // A scripted "player" who drops the newest packet whenever the queue is too long.
    if (dropAbove !== undefined) {
      while (net.queue.length > dropAbove) net.dropAt(net.queue.length - 1);
    }
  }
  return evaluate(net, level1);
}

describe("level 1: Keep it under 50 ms", () => {
  it("fails if you just watch: the big buffer bloats", () => {
    const r = play(undefined);
    expect(r.passed).toBe(false);
    expect(r.stars).toBe(0);
    expect(r.p95Delay).toBeGreaterThan(level1.goal.maxP95Delay);
  });

  it("passes if you keep the queue around the bandwidth-delay product", () => {
    const r = play(40);
    expect(r.passed).toBe(true);
    expect(r.stars).toBeGreaterThanOrEqual(1);
    expect(r.playerDrops).toBeGreaterThan(0);
  });

  it("fails the other way if you drop everything: the link goes idle", () => {
    const r = play(2);
    expect(r.passed).toBe(false);
    expect(r.utilization).toBeLessThan(level1.goal.minUtilization);
  });
});

describe("evaluate", () => {
  it("gives more stars for hugging the limit closely", () => {
    expect(play(48).stars).toBe(1);
    expect(play(44).stars).toBe(2);
    expect(play(40).stars).toBe(3);
  });
});

/** Plays `level`, calling `player` after every tick. */
function playWith(level: Level, player: (net: Network) => void) {
  const net = startLevel(level);
  for (let t = 0; t < level.durationMs; t++) {
    net.tick();
    player(net);
  }
  return evaluate(net, level);
}

describe("level 2: One at a time", () => {
  it("fails if you just watch", () => {
    expect(playWith(level2, () => {}).passed).toBe(false);
  });

  it("fails if you drop everything above a line: flows back off together", () => {
    const r = playWith(level2, (net) => {
      while (net.queue.length > 30) net.dropAt(net.queue.length - 1);
    });
    expect(r.p95Delay).toBeLessThanOrEqual(level2.goal.maxP95Delay);
    expect(r.utilization).toBeLessThan(level2.goal.minUtilization);
  });

  it("passes with one drop per round trip, oldest packet first", () => {
    let last = -Infinity;
    const r = playWith(level2, (net) => {
      if (net.queue.length > 28 && net.now - last >= 40) {
        net.dropAt(0);
        last = net.now;
      }
    });
    expect(r.passed).toBe(true);
  });
});

describe("level 3: Don't drop the call", () => {
  const VIDEO = level3.goal.flow!;
  const newestExcept = (net: Network, flow: number) => {
    const pkts = net.queue.packets();
    for (let i = pkts.length - 1; i >= 0; i--) if (pkts[i]!.flow !== flow) return i;
    return -1;
  };

  it("fails if you just watch: the call waits behind the downloads", () => {
    const r = playWith(level3, () => {});
    expect(r.passed).toBe(false);
    expect(r.p95Delay).toBeGreaterThan(level3.goal.maxP95Delay);
  });

  it("fails if you clip the queue blindly: you drop the call's packets too", () => {
    const r = playWith(level3, (net) => {
      while (net.queue.length > 35) net.dropAt(net.queue.length - 1);
    });
    expect(r.p95Delay).toBeLessThanOrEqual(level3.goal.maxP95Delay);
    expect(r.loss!).toBeGreaterThan(level3.goal.maxLoss!);
    expect(r.passed).toBe(false);
  });

  it("passes if you drop only the downloads' packets", () => {
    const r = playWith(level3, (net) => {
      while (net.queue.length > 35) {
        const i = newestExcept(net, VIDEO);
        if (i < 0) break;
        net.dropAt(i);
      }
    });
    expect(r.loss).toBe(0);
    expect(r.passed).toBe(true);
  });
});
