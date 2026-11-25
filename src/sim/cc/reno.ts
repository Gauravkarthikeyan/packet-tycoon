import type { Ack, Packet } from "../types";

const MIN_RTO = 200;
const MAX_RTO = 60_000;
const INITIAL_RTO = 1000;
const DUP_ACK_THRESHOLD = 3;

/**
 * A bulk-transfer sender running TCP NewReno, simplified to whole packets.
 *
 * - slow start: cwnd += 1 per newly acked packet (doubles each RTT)
 * - congestion avoidance: cwnd += 1/cwnd per ack (+1 per RTT)
 * - 3 dup ACKs: fast retransmit, halve cwnd, fast recovery; partial ACKs
 *   retransmit the next hole (the "New" in NewReno)
 * - RTO (RFC 6298 estimator, exponential backoff): cwnd = 1, go-back-N
 *
 * Simplification: no window inflation during recovery, so the sender goes
 * quiet for about an RTT after a loss instead of trickling new data.
 */
export class RenoSender {
  readonly algorithm = "reno";

  cwnd = 1;
  ssthresh = 64;

  /** Oldest unacknowledged sequence number. */
  sndUna = 0;
  /** Next new sequence number to send. */
  sndNxt = 0;

  private dupAcks = 0;
  private inRecovery = false;
  private recover = 0;
  private retransmits: number[] = [];
  /** Highest sequence ever sent + 1, so go-back-N resends are marked as retransmissions. */
  private maxSent = 0;

  srtt: number | undefined;
  private rttvar = 0;
  rto = INITIAL_RTO;
  /** When the retransmission timer was (re)armed; undefined = not running. */
  private timerArmedAt: number | undefined;

  readonly stats = { sent: 0, retransmitted: 0, fastRetransmits: 0, timeouts: 0 };

  constructor(readonly flow: number) {}

  get inFlight(): number {
    return this.sndNxt - this.sndUna;
  }

  /** Packets this sender wants to put on the wire at time `now`. */
  poll(now: number): Packet[] {
    this.checkTimeout(now);
    const out: Packet[] = [];
    for (const seq of this.retransmits) {
      out.push({ flow: this.flow, seq, sentAt: now, retransmit: true });
      this.stats.retransmitted++;
    }
    this.retransmits = [];
    while (this.inFlight < Math.floor(this.cwnd)) {
      const seq = this.sndNxt++;
      const retransmit = seq < this.maxSent;
      out.push({ flow: this.flow, seq, sentAt: now, retransmit });
      if (retransmit) this.stats.retransmitted++;
      else this.stats.sent++;
    }
    this.maxSent = Math.max(this.maxSent, this.sndNxt);
    if (out.length > 0 && this.timerArmedAt === undefined) this.timerArmedAt = now;
    return out;
  }

  onAck(ack: Ack, now: number): void {
    if (ack.ack > this.sndUna) this.onNewAck(ack, now);
    else if (ack.ack === this.sndUna && this.inFlight > 0) this.onDupAck();
  }

  private onNewAck(ack: Ack, now: number): void {
    const newlyAcked = ack.ack - this.sndUna;
    this.sndUna = ack.ack;
    // After a go-back-N, the receiver may already hold data we're about to resend.
    if (this.sndNxt < this.sndUna) this.sndNxt = this.sndUna;
    this.dupAcks = 0;

    if (this.inRecovery) {
      if (ack.ack >= this.recover) {
        this.inRecovery = false;
        this.cwnd = this.ssthresh;
      } else {
        this.retransmits.push(this.sndUna); // partial ACK: next hole
      }
    } else {
      // Karn's rule, roughly: don't take RTT samples while repairing losses.
      this.sampleRtt(now - ack.echo);
      for (let i = 0; i < newlyAcked; i++) {
        this.cwnd += this.cwnd < this.ssthresh ? 1 : 1 / this.cwnd;
      }
    }
    this.timerArmedAt = this.inFlight > 0 ? now : undefined;
  }

  private onDupAck(): void {
    this.dupAcks++;
    if (this.dupAcks !== DUP_ACK_THRESHOLD || this.inRecovery) return;
    this.ssthresh = Math.max(this.inFlight / 2, 2);
    this.cwnd = this.ssthresh;
    this.inRecovery = true;
    this.recover = this.sndNxt;
    this.retransmits.push(this.sndUna);
    this.stats.fastRetransmits++;
  }

  private checkTimeout(now: number): void {
    if (this.timerArmedAt === undefined || now - this.timerArmedAt < this.rto) return;
    this.stats.timeouts++;
    this.ssthresh = Math.max(this.inFlight / 2, 2);
    this.cwnd = 1;
    this.sndNxt = this.sndUna; // go-back-N
    this.inRecovery = false;
    this.dupAcks = 0;
    this.retransmits = [];
    this.rto = Math.min(this.rto * 2, MAX_RTO);
    this.timerArmedAt = undefined;
  }

  /** RFC 6298 smoothed RTT and RTO. */
  private sampleRtt(rtt: number): void {
    if (this.srtt === undefined) {
      this.srtt = rtt;
      this.rttvar = rtt / 2;
    } else {
      this.rttvar = 0.75 * this.rttvar + 0.25 * Math.abs(this.srtt - rtt);
      this.srtt = 0.875 * this.srtt + 0.125 * rtt;
    }
    this.rto = Math.min(Math.max(this.srtt + 4 * this.rttvar, MIN_RTO), MAX_RTO);
  }
}
