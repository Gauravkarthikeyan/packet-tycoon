import type { Ack, Packet, Sender } from "../types";

/**
 * Constant bit rate: sends at a fixed rate no matter what, like a video call
 * or a game's state updates. It never slows down for loss or delay, so it can't
 * cause a sawtooth, but it suffers from whoever else fills the queue. A late
 * video frame is as bad as a lost one, so it never retransmits either.
 */
export class CbrSender implements Sender {
  readonly algorithm = "cbr";
  readonly stats = { sent: 0, retransmitted: 0, fastRetransmits: 0, timeouts: 0 };
  private nextSeq = 0;
  /** rate × latest RTT sample: the window this flow effectively has open. */
  private window = 0;
  /** Fractional packets owed; carries over so any rate is hit exactly on average. */
  private credit = 0;

  constructor(
    readonly flow: number,
    /** Packets per second. */
    readonly rate: number,
  ) {}

  /**
   * No real window, so report rate × RTT: packets in flight at this rate. It
   * rises when the queue makes the call laggy, which is what the chart is for.
   */
  get cwnd(): number {
    return this.window;
  }

  poll(now: number): Packet[] {
    this.credit += this.rate / 1000;
    const out: Packet[] = [];
    while (this.credit >= 1) {
      this.credit -= 1;
      out.push({ flow: this.flow, seq: this.nextSeq++, sentAt: now, retransmit: false });
    }
    this.stats.sent += out.length;
    return out;
  }

  onAck(ack: Ack, now: number): void {
    this.window = ((now - ack.echo) * this.rate) / 1000;
  }
}
