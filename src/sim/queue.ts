import type { Packet, QueueDiscipline } from "./types";

/**
 * The simplest possible router queue: accept until full, then drop whatever
 * arrives. It's what most of the internet ran for decades, and it's the root of
 * bufferbloat — a big drop-tail buffer stays full and adds latency forever.
 */
export class DropTail implements QueueDiscipline {
  readonly name = "drop-tail";
  private buf: Packet[] = [];
  private head = 0;

  constructor(readonly capacity: number) {
    if (!(capacity >= 1)) throw new RangeError("capacity must be >= 1");
  }

  get length(): number {
    return this.buf.length - this.head;
  }

  enqueue(pkt: Packet): boolean {
    if (this.length >= this.capacity) return false;
    this.buf.push(pkt);
    return true;
  }

  dequeue(): Packet | undefined {
    if (this.head >= this.buf.length) return undefined;
    const pkt = this.buf[this.head++];
    // Compact occasionally so the array doesn't grow without bound.
    if (this.head > 1024 && this.head * 2 > this.buf.length) {
      this.buf = this.buf.slice(this.head);
      this.head = 0;
    }
    return pkt;
  }

  remove(index: number): Packet | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) return undefined;
    return this.buf.splice(this.head + index, 1)[0];
  }

  packets(): readonly Packet[] {
    return this.buf.slice(this.head);
  }
}
