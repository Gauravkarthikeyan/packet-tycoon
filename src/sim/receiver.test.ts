import { describe, expect, it } from "vitest";
import { Receiver } from "./receiver";

const pkt = (seq: number) => ({ flow: 7, seq, sentAt: seq * 10, retransmit: false });

describe("Receiver", () => {
  it("acks cumulatively in order", () => {
    const r = new Receiver(7);
    expect([0, 1, 2].map((s) => r.receive(pkt(s)).ack)).toEqual([1, 2, 3]);
    expect(r.delivered).toBe(3);
  });

  it("produces duplicate acks after a hole, then jumps when it is filled", () => {
    const r = new Receiver(7);
    r.receive(pkt(0));
    // packet 1 lost
    const dupes = [2, 3, 4].map((s) => r.receive(pkt(s)).ack);
    expect(dupes).toEqual([1, 1, 1]);
    expect(r.receive(pkt(1)).ack).toBe(5);
    expect(r.delivered).toBe(5);
  });

  it("re-acks spurious retransmissions without double counting", () => {
    const r = new Receiver(7);
    r.receive(pkt(0));
    r.receive(pkt(1));
    const a = r.receive(pkt(0));
    expect(a).toEqual({ flow: 7, ack: 2, echo: 0 });
    expect(r.delivered).toBe(2);
  });
});
