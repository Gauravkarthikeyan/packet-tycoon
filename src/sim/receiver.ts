import type { Ack, Packet } from "./types";

/**
 * Per-flow receiver that answers every packet with a cumulative ACK.
 *
 * Out-of-order packets are buffered, so when one packet is lost every later
 * arrival produces the *same* ACK number again — the duplicate ACKs that tell
 * a Reno sender "something in the middle went missing".
 */
export class Receiver {
  private expected = 0;
  private outOfOrder = new Set<number>();
  delivered = 0;

  constructor(readonly flow: number) {}

  receive(pkt: Packet): Ack {
    if (pkt.seq === this.expected) {
      this.expected++;
      this.delivered++;
      while (this.outOfOrder.delete(this.expected)) {
        this.expected++;
        this.delivered++;
      }
    } else if (pkt.seq > this.expected) {
      this.outOfOrder.add(pkt.seq);
    }
    // seq < expected: a spurious retransmission; just re-ACK.
    return { flow: this.flow, ack: this.expected, echo: pkt.sentAt };
  }
}
