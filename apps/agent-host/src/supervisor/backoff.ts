export interface RestartPolicyOptions {
  baseMs: number;
  maxMs: number;
  maxAttempts: number;
  /** Fraction of the delay applied as symmetric jitter. Default 0.2. */
  jitterRatio?: number;
  random?: () => number;
}

/**
 * Exponential backoff with jitter and a hard attempt cap. `nextDelay` returns
 * null when the circuit opens, which the caller surfaces as the `failed` state.
 */
export class RestartPolicy {
  private attempts = 0;

  constructor(private readonly options: RestartPolicyOptions) {}

  get attemptsUsed(): number {
    return this.attempts;
  }

  reset(): void {
    this.attempts = 0;
  }

  nextDelay(): number | null {
    if (this.attempts >= this.options.maxAttempts) return null;
    const exponential = Math.min(
      this.options.maxMs,
      this.options.baseMs * 2 ** this.attempts,
    );
    this.attempts += 1;
    const ratio = this.options.jitterRatio ?? 0.2;
    const random = (this.options.random ?? Math.random)();
    const jitter = exponential * ratio * (random * 2 - 1);
    return Math.max(0, Math.round(exponential + jitter));
  }
}