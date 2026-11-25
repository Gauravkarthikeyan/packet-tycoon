import { RenoSender } from "./cc/reno";
import { Receiver } from "./receiver";
import type { Ack, Packet, QueueDiscipline } from "./types";

export interface NetworkConfig {
  /** Bottleneck link rate in packets per second. */
  rate: number;
  /** One-way propagation delay of the bottleneck link (ms). */
  propDelay: number;
  /** Delay of the (uncongested) ACK path back to the senders (ms). */
  ackDelay: number;
  queue: QueueDiscipline;
  flows: number;
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
  readonly senders: RenoSender[];
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

  constructor(readonly config: NetworkConfig) {
    this.queue = config.queue;
    this.txTime = 1000 / config.rate;
    this.senders = Array.from({ length: config.flows }, (_, i) => new RenoSender(i));
    this.receivers = Array.from({ length: config.flows }, (_, i) => new Receiver(i));
    this.flowStats = Array.from({ length: config.flows }, () => ({ delivered: 0, drops: 0 }));
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
      this.delaySum += now - (pkt.enqueuedAt ?? now);
      this.delayCount++;
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
