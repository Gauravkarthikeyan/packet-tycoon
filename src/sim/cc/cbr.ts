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
  /**
   * Packets owed, in thousandths. Integer on purpose: adding 0.1 twenty
   * thousand times in floating point comes out just under 2000.
   */
  private credit = 0;

  constructor(
    readonly flow: number,
    /** Packets per second (a whole number). */
    readonly rate: number,
  ) {
    if (!Number.isInteger(rate) || rate < 0) throw new RangeError("rate must be a whole number >= 0");
  }

  /**
   * No real window, so report rate × RTT: packets in flight at this rate. It
   * rises when the queue makes the call laggy, which is what the chart is for.
   */
  get cwnd(): number {
    return this.window;
  }

  poll(now: number): Packet[] {
    this.credit += this.rate;
    const out: Packet[] = [];
    while (this.credit >= 1000) {
      this.credit -= 1000;
      out.push({ flow: this.flow, seq: this.nextSeq++, sentAt: now, retransmit: false });
    }
    this.stats.sent += out.length;
    return out;
  }

  onAck(ack: Ack, now: number): void {
    this.window = ((now - ack.echo) * this.rate) / 1000;
  }
}
