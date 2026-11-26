import { describe, expect, it } from "vitest";
import { SlidingWindowRateLimiter } from "@/server/auth/rate-limit";

describe("SlidingWindowRateLimiter", () => {
  it("blocks after maxAttempts within the window and recovers after window expiry or reset", () => {
    let clock = 100_000;
    const limiter = new SlidingWindowRateLimiter(3, 60_000, () => clock);

    expect(limiter.check("ip:1").allowed).toBe(true);
    limiter.record("ip:1");
    limiter.record("ip:1");
    expect(limiter.check("ip:1").allowed).toBe(true);

    limiter.record("ip:1");
    const blocked = limiter.check("ip:1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);

    // Other keys remain unaffected
    expect(limiter.check("ip:2").allowed).toBe(true);

    // Advance clock past window
    clock += 61_000;
    expect(limiter.check("ip:1").allowed).toBe(true);

    // Manual reset clears immediately
    limiter.record("ip:1");
    limiter.record("ip:1");
    limiter.record("ip:1");
    expect(limiter.check("ip:1").allowed).toBe(false);
    limiter.reset("ip:1");
    expect(limiter.check("ip:1").allowed).toBe(true);
  });
});
