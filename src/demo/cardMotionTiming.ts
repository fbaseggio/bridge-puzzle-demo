/** One presentation timeline shared by all redraws of a played-card batch. */
export class CardMotionTiming {
  readonly starts: number[];
  readonly endsAt: number;

  constructor(
    readonly startedAt: number,
    readonly duration: number,
    autoplay: readonly boolean[],
    readonly gap = 300
  ) {
    let next = autoplay[0] ? gap : 0;
    this.starts = autoplay.map(() => {
      const start = next;
      next += duration + gap;
      return start;
    });
    this.endsAt = startedAt + (this.starts.at(-1) ?? 0) + duration;
  }

  elapsed(now: number): number { return Math.max(0, now - this.startedAt); }
  remaining(now: number): number { return Math.max(0, this.endsAt - now); }
  autoplayDelay(now: number): number { return Math.max(this.gap, this.endsAt + this.gap - now); }
}
