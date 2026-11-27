import { describe, expect, it } from "vitest";
import { CbrSender } from "./cbr";

describe("CbrSender", () => {
  it("sends at its rate, including fractional rates", () => {
    const s = new CbrSender(0, 150);
    let sent = 0;
    for (let t = 1; t <= 2000; t++) sent += s.poll(t).length;
    expect(sent).toBe(300);
  });

  it("never backs off and never retransmits", () => {
    const s = new CbrSender(0, 100);
    for (let t = 1; t <= 1000; t++) s.poll(t);
    // No ACKs at all (everything lost): it keeps going at the same rate.
    let next = 0;
    for (let t = 1001; t <= 2000; t++) next += s.poll(t).length;
    expect(next).toBe(100);
    expect(s.stats.retransmitted).toBe(0);
  });

  it("reports rate x RTT as its window", () => {
    const s = new CbrSender(0, 100);
    s.onAck({ flow: 0, ack: 1, echo: 1000 }, 1040);
    expect(s.cwnd).toBeCloseTo(4);
    s.onAck({ flow: 0, ack: 2, echo: 1100 }, 1300);
    expect(s.cwnd).toBeCloseTo(20);
  });
});
