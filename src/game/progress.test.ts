import { describe, expect, it } from "vitest";
import { loadBest, recordStars } from "./progress";

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("progress", () => {
  it("round-trips and never lowers a best score", () => {
    const s = memory();
    let best = recordStars({}, 1, 2, s);
    best = recordStars(best, 1, 1, s);
    best = recordStars(best, 2, 3, s);
    expect(loadBest(s)).toEqual({ 1: 2, 2: 3 });
  });

  it("ignores garbage and broken storage", () => {
    expect(loadBest({ getItem: () => "not json" })).toEqual({});
    expect(loadBest({ getItem: () => '{"1": 9, "2": "x", "3": 2}' })).toEqual({ 3: 2 });
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadBest(throwing)).toEqual({});
    expect(recordStars({}, 1, 2, throwing)).toEqual({ 1: 2 });
    expect(loadBest(undefined)).toEqual({});
  });
});
