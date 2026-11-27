/** Counts of whole-millisecond values; exact percentiles without storing samples. */
export class Histogram {
  private counts: number[] = [];
  count = 0;

  add(ms: number): void {
    this.counts[ms] = (this.counts[ms] ?? 0) + 1;
    this.count++;
  }

  /** The `p`-th percentile (0..1); 0 when empty. */
  percentile(p: number): number {
    if (this.count === 0) return 0;
    const rank = Math.max(1, Math.ceil(p * this.count));
    let seen = 0;
    for (let v = 0; v < this.counts.length; v++) {
      seen += this.counts[v] ?? 0;
      if (seen >= rank) return v;
    }
    return this.counts.length - 1;
  }
}
