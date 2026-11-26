import { describe, expect, it } from "vitest";
import { LEVELS, evaluate, startLevel } from "./levels";

const level1 = LEVELS[0]!;

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
