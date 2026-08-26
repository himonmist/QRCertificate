import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '@/lib/rateLimit';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the configured limit', () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.check('1.2.3.4').allowed).toBe(true);
    expect(limiter.check('1.2.3.4').allowed).toBe(true);
    expect(limiter.check('1.2.3.4').allowed).toBe(true);
  });

  it('blocks requests beyond the limit within the window', () => {
    const limiter = new RateLimiter({ limit: 2, windowMs: 60_000 });
    limiter.check('1.2.3.4');
    limiter.check('1.2.3.4');
    const third = limiter.check('1.2.3.4');
    expect(third.allowed).toBe(false);
  });

  it('tracks each key independently', () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('resets the window after it elapses', () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('reports remaining count', () => {
    const limiter = new RateLimiter({ limit: 5, windowMs: 60_000 });
    expect(limiter.check('a').remaining).toBe(4);
    expect(limiter.check('a').remaining).toBe(3);
  });
});
