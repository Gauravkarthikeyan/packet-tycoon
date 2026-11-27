/** A data packet. Every packet is one MSS, so sizes are implicit. */
export interface Packet {
  flow: number;
  seq: number;
  /** Time (ms) the sender put it on the wire; used for RTT samples. */
  sentAt: number;
  retransmit: boolean;
  /** Set by the router when the packet joins its queue. */
  enqueuedAt?: number;
}

/** A cumulative ACK: "I have everything below `ack`". */
export interface Ack {
  flow: number;
  ack: number;
  /** Echo of the sentAt of the packet that triggered this ACK. */
  echo: number;
}

/** The interface every queue discipline (drop-tail, RED, CoDel, FQ...) implements. */
export interface QueueDiscipline {
  readonly name: string;
  /** Returns false if the packet was dropped. */
  enqueue(pkt: Packet, now: number): boolean;
  dequeue(now: number): Packet | undefined;
  /** Remove the packet at `index` (0 = front), e.g. when the player clicks it. */
  remove(index: number): Packet | undefined;
  readonly length: number;
  readonly capacity: number;
  /** Snapshot for rendering, front of the queue first. */
  packets(): readonly Packet[];
}

/** Anything that sends packets into the network and listens to ACKs. */
export interface Sender {
  readonly flow: number;
  /** Short name for the UI: "reno", "cbr", ... */
  readonly algorithm: string;
  /** Congestion window, or for senders without one, packets currently in flight. */
  readonly cwnd: number;
  readonly stats: { sent: number; retransmitted: number; fastRetransmits: number; timeouts: number };
  poll(now: number): Packet[];
  onAck(ack: Ack, now: number): void;
}
