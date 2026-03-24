export class Deduper {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  shouldNotify(key: string): boolean {
    const ts = this.now();
    const prev = this.seen.get(key);

    if (typeof prev === 'number' && ts - prev < this.ttlMs) {
      return false;
    }

    this.seen.set(key, ts);
    this.gc(ts);
    return true;
  }

  private gc(ts: number): void {
    for (const [key, at] of this.seen.entries()) {
      if (ts - at >= this.ttlMs) {
        this.seen.delete(key);
      }
    }
  }
}
