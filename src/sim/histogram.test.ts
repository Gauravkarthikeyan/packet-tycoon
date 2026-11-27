import { describe, expect, it } from "vitest";
import { Histogram } from "./histogram";

describe("Histogram", () => {
  it("gives exact percentiles", () => {
    const h = new Histogram();
    for (let v = 1; v <= 100; v++) h.add(v);
    expect(h.percentile(0.5)).toBe(50);
    expect(h.percentile(0.95)).toBe(95);
    expect(h.percentile(1)).toBe(100);
    expect(h.percentile(0)).toBe(1);
  });

  it("is 0 when empty", () => {
    expect(new Histogram().percentile(0.95)).toBe(0);
  });
});
