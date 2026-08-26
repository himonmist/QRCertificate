interface RateLimiterOptions {
  limit: number;
  windowMs: number;
}

interface CheckResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

/**
 * Simple in-process fixed-window rate limiter. Good enough for a single
 * Node instance; behind multiple instances/replicas this should be swapped
 * for a shared store (e.g. Redis) — see SECURITY.md.
 */
export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: RateLimiterOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
  }

  check(key: string): CheckResult {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || now - existing.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.limit - 1, resetAt: now + this.windowMs };
    }

    if (existing.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: existing.windowStart + this.windowMs,
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: this.limit - existing.count,
      resetAt: existing.windowStart + this.windowMs,
    };
  }
}

export const publicVerifyRateLimiter = new RateLimiter({ limit: 30, windowMs: 60_000 });
export const loginRateLimiter = new RateLimiter({ limit: 10, windowMs: 5 * 60_000 });
