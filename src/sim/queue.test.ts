import { describe, expect, it } from "vitest";
import { DropTail } from "./queue";
import type { Packet } from "./types";

const pkt = (seq: number): Packet => ({ flow: 0, seq, sentAt: 0, retransmit: false });

describe("DropTail", () => {
  it("is FIFO", () => {
    const q = new DropTail(10);
    [1, 2, 3].forEach((s) => q.enqueue(pkt(s)));
    expect([q.dequeue()?.seq, q.dequeue()?.seq, q.dequeue()?.seq]).toEqual([1, 2, 3]);
    expect(q.dequeue()).toBeUndefined();
  });

  it("drops arrivals once full", () => {
    const q = new DropTail(2);
    expect(q.enqueue(pkt(1))).toBe(true);
    expect(q.enqueue(pkt(2))).toBe(true);
    expect(q.enqueue(pkt(3))).toBe(false);
    expect(q.length).toBe(2);
    q.dequeue();
    expect(q.enqueue(pkt(4))).toBe(true);
    expect(q.packets().map((p) => p.seq)).toEqual([2, 4]);
  });

  it("stays correct across internal compaction", () => {
    const q = new DropTail(5000);
    for (let i = 0; i < 4000; i++) q.enqueue(pkt(i));
    for (let i = 0; i < 3000; i++) expect(q.dequeue()?.seq).toBe(i);
    expect(q.length).toBe(1000);
    expect(q.packets()[0]?.seq).toBe(3000);
  });
});
