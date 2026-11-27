import { CbrSender } from "./cc/cbr";
import { RenoSender } from "./cc/reno";
import { Histogram } from "./histogram";
import { Receiver } from "./receiver";
import type { Ack, Packet, QueueDiscipline, Sender } from "./types";

export interface NetworkConfig {
  /** Bottleneck link rate in packets per second. */
  rate: number;
  /** One-way propagation delay of the bottleneck link (ms). */
  propDelay: number;
  /** Delay of the (uncongested) ACK path back to the senders (ms). */
  ackDelay: number;
  queue: QueueDiscipline;
  /** Number of NewReno flows. */
  flows: number;
  /** Extra constant-bit-rate flows (pkt/s each), numbered after the Reno ones. */
  cbr?: number[];
}

export interface FlowStats {
  delivered: number;
  drops: number;
}

/**
 * The whole dumbbell: N senders -> router queue -> bottleneck link -> receivers,
 * with ACKs flowing back. Time advances in 1 ms ticks.
 *
 * Each path has a constant delay, so packets on it arrive in send order and a
 * plain FIFO is enough to model everything in flight — no event heap needed.
 */
export class Network {
  now = 0;
  readonly senders: Sender[];
  readonly receivers: Receiver[];
  readonly flowStats: FlowStats[];
  readonly queue: QueueDiscipline;

  private readonly txTime: number;
  private linkFreeAt = 0;
  private busyTime = 0;
  private onLink: { at: number; pkt: Packet }[] = [];
  private onAckPath: { at: number; ack: Ack }[] = [];

  /** Sum and count of queueing delays, for the average. */
  private delaySum = 0;
  private delayCount = 0;
  private delay = new Histogram();
  private flowDelay: Histogram[];
  /** Packets the player removed by hand. */
  playerDrops = 0;

  constructor(readonly config: NetworkConfig) {
    this.queue = config.queue;
    this.txTime = 1000 / config.rate;
    const reno = Array.from({ length: config.flows }, (_, i): Sender => new RenoSender(i));
    const cbr = (config.cbr ?? []).map((rate, i): Sender => new CbrSender(config.flows + i, rate));
    this.senders = [...reno, ...cbr];
    const n = this.senders.length;
    this.receivers = Array.from({ length: n }, (_, i) => new Receiver(i));
    this.flowStats = Array.from({ length: n }, () => ({ delivered: 0, drops: 0 }));
    this.flowDelay = Array.from({ length: n }, () => new Histogram());
  }

  /** Advance the simulation by `ticks` milliseconds. */
  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.tick();
  }

  tick(): void {
    const now = ++this.now;

    while (this.onAckPath.length > 0 && this.onAckPath[0]!.at <= now) {
      const { ack } = this.onAckPath.shift()!;
      this.senders[ack.flow]!.onAck(ack, now);
    }

    for (const sender of this.senders) {
      for (const pkt of sender.poll(now)) {
        pkt.enqueuedAt = now;
        if (!this.queue.enqueue(pkt, now)) this.flowStats[pkt.flow]!.drops++;
      }
    }

    // The link may finish several packets per tick when rate > 1000 pkt/s.
    while (this.linkFreeAt <= now) {
      const pkt = this.queue.dequeue(now);
      if (!pkt) break;
      const waited = now - (pkt.enqueuedAt ?? now);
      this.delaySum += waited;
      this.delayCount++;
      this.delay.add(waited);
      this.flowDelay[pkt.flow]!.add(waited);
      this.linkFreeAt = Math.max(this.linkFreeAt, now - 1) + this.txTime;
      this.busyTime += this.txTime;
      this.onLink.push({ at: this.linkFreeAt + this.config.propDelay, pkt });
    }

    while (this.onLink.length > 0 && this.onLink[0]!.at <= now) {
      const { pkt } = this.onLink.shift()!;
      const ack = this.receivers[pkt.flow]!.receive(pkt);
      this.flowStats[pkt.flow]!.delivered = this.receivers[pkt.flow]!.delivered;
      this.onAckPath.push({ at: now + this.config.ackDelay, ack });
    }
  }

  /**
   * The player drops the packet at `index` in the router queue (0 = next to
   * leave). The sender sees it exactly like an overflow drop.
   */
  dropAt(index: number): boolean {
    const pkt = this.queue.remove(index);
    if (!pkt) return false;
    this.flowStats[pkt.flow]!.drops++;
    this.playerDrops++;
    return true;
  }

  /** The `p`-th percentile (0..1) of queueing delay so far, in ms. */
  delayPercentile(p: number): number {
    return this.delay.percentile(p);
  }

  /** Same, for one flow's packets only. */
  flowDelayPercentile(flow: number, p: number): number {
    return this.flowDelay[flow]!.percentile(p);
  }

  /** Fraction of a flow's packets dropped at the router (by overflow or by you). */
  flowLoss(flow: number): number {
    const sent = this.senders[flow]!.stats.sent;
    return sent === 0 ? 0 : this.flowStats[flow]!.drops / sent;
  }

  /** Fraction of time the bottleneck link was busy. */
  get utilization(): number {
    return this.now === 0 ? 0 : Math.min(this.busyTime / this.now, 1);
  }

  /** Average time packets spent waiting in the router queue (ms). */
  get avgQueueDelay(): number {
    return this.delayCount === 0 ? 0 : this.delaySum / this.delayCount;
  }

  /** Jain's fairness index over delivered packets: 1 = perfectly fair, 1/n = one flow hogs. */
  get fairness(): number {
    const x = this.flowStats.map((f) => f.delivered);
    const sum = x.reduce((a, b) => a + b, 0);
    const sumSq = x.reduce((a, b) => a + b * b, 0);
    return sumSq === 0 ? 1 : (sum * sum) / (x.length * sumSq);
  }
}
