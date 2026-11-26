import { describe, expect, it } from "vitest";
import { packetAt, queueLayout } from "./layout";

// 448 px of queue for 200 slots -> 2.24 px per packet.
const l = queueLayout(528, 200);

describe("packetAt", () => {
  it("bottom of the column is the front of the queue", () => {
    expect(packetAt(l, 50, l.x + 10, l.bottom - 1)).toBe(0);
    expect(packetAt(l, 50, l.x + 10, l.bottom - 10 * l.cell - 1)).toBe(10);
  });

  it("just above the stack still hits the newest packet", () => {
    const stackTop = l.bottom - 50 * l.cell;
    expect(packetAt(l, 50, l.x + 10, stackTop - 5)).toBe(49);
    expect(packetAt(l, 50, l.x + 10, stackTop - 40)).toBeUndefined();
  });

  it("misses outside the column or on an empty queue", () => {
    expect(packetAt(l, 50, l.x + l.width + 40, l.bottom - 1)).toBeUndefined();
    expect(packetAt(l, 0, l.x + 10, l.bottom - 1)).toBeUndefined();
    expect(packetAt(l, 50, l.x + 10, l.bottom + 5)).toBeUndefined();
  });
});
