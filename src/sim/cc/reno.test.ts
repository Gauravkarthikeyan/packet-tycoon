import { describe, expect, it } from "vitest";
import { RenoSender } from "./reno";

const ack = (n: number, echo = 0) => ({ flow: 0, ack: n, echo });

describe("RenoSender", () => {
  it("doubles its window every RTT in slow start", () => {
    const s = new RenoSender(0);
    expect(s.poll(0)).toHaveLength(1);
    s.onAck(ack(1), 100);
    expect(s.poll(100)).toHaveLength(2);
    s.onAck(ack(3), 200);
    expect(s.poll(200)).toHaveLength(4);
    expect(s.cwnd).toBe(4);
  });

  it("grows by about one packet per RTT in congestion avoidance", () => {
    const s = new RenoSender(0);
    s.cwnd = 10;
    s.ssthresh = 10;
    s.poll(0);
    s.onAck(ack(10), 100); // one full window acked
    expect(s.cwnd).toBeGreaterThan(10.9);
    expect(s.cwnd).toBeLessThan(11);
  });

  it("fast-retransmits on the third duplicate ACK and halves cwnd", () => {
    const s = new RenoSender(0);
    s.cwnd = 16;
    s.ssthresh = 100;
    s.poll(0); // seq 0..15 in flight
    s.onAck(ack(1), 50); // packet 1 is lost; 2.. arrive and produce dup acks
    s.onAck(ack(1), 51);
    s.onAck(ack(1), 52);
    expect(s.stats.fastRetransmits).toBe(0);
    s.onAck(ack(1), 53);
    expect(s.stats.fastRetransmits).toBe(1);
    expect(s.cwnd).toBe(s.ssthresh);
    const out = s.poll(53);
    expect(out[0]).toMatchObject({ seq: 1, retransmit: true });
  });

  it("retransmits the next hole on a partial ACK (NewReno)", () => {
    const s = new RenoSender(0);
    s.cwnd = 16;
    s.poll(0);
    for (let i = 0; i < 4; i++) s.onAck(ack(0), 10 + i); // seq 0 lost
    s.poll(20); // retransmit 0
    s.onAck(ack(5), 30); // 0 repaired, but 5 was lost too
    expect(s.poll(30)[0]).toMatchObject({ seq: 5, retransmit: true });
  });

  it("collapses to cwnd = 1 and goes back on a timeout", () => {
    const s = new RenoSender(0);
    s.cwnd = 8;
    s.poll(0); // 0..7 in flight, all lost
    const out = s.poll(1000); // initial RTO is 1 s
    expect(s.stats.timeouts).toBe(1);
    expect(s.cwnd).toBe(1);
    expect(out).toEqual([{ flow: 0, seq: 0, sentAt: 1000, retransmit: true }]);
    expect(s.rto).toBe(2000); // exponential backoff
  });

  it("estimates RTT", () => {
    const s = new RenoSender(0);
    s.poll(0);
    s.onAck(ack(1, 0), 80);
    expect(s.srtt).toBe(80);
    expect(s.rto).toBe(240); // srtt + 4 * (srtt / 2)
  });
});
