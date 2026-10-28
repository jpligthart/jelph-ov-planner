/**
 * Shared request budget to protect the upstream API quota (NS / Transitous).
 *
 * Deliberately global (not per IP): the app has a handful of trusted users,
 * and the goal is to cap total upstream usage, e.g. against a runaway loop.
 * Sliding window, kept in memory; resets when the API restarts.
 */
export type BudgetResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export class RequestBudget {
  private timestamps: number[] = [];

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  take(now = Date.now()): BudgetResult {
    this.timestamps = this.timestamps.filter((t) => t > now - this.windowMs);
    if (this.timestamps.length >= this.limit) {
      const oldest = this.timestamps[0]!;
      return {
        ok: false,
        retryAfterSeconds: Math.ceil((oldest + this.windowMs - now) / 1000),
      };
    }
    this.timestamps.push(now);
    return { ok: true };
  }
}

export function limitFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
