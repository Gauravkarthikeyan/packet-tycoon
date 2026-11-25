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
  readonly length: number;
  readonly capacity: number;
  /** Snapshot for rendering, front of the queue first. */
  packets(): readonly Packet[];
}
