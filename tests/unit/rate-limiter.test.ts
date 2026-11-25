import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "@/server/rate-limiter";

describe("server/rate-limiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serializes concurrent calls and enforces minIntervalMs between starts", async () => {
    const starts: number[] = [];
    const limiter = createRateLimiter(1100);

    const p1 = limiter.schedule(async () => {
      starts.push(Date.now());
      return "a";
    });
    const p2 = limiter.schedule(async () => {
      starts.push(Date.now());
      return "b";
    });
    const p3 = limiter.schedule(async () => {
      starts.push(Date.now());
      return "c";
    });

    await vi.runAllTimersAsync();
    expect(await Promise.all([p1, p2, p3])).toEqual(["a", "b", "c"]);

    const [t0, t1, t2] = starts;
    if (t0 === undefined || t1 === undefined || t2 === undefined) {
      throw new Error("Expected 3 start timestamps");
    }
    expect(t1 - t0).toBeGreaterThanOrEqual(1100);
    expect(t2 - t1).toBeGreaterThanOrEqual(1100);
  });

  it("continues processing subsequent tasks when an earlier task rejects", async () => {
    const limiter = createRateLimiter(500);

    const failing = limiter.schedule(async () => {
      throw new Error("boom");
    });
    const succeeding = limiter.schedule(async () => "ok");

    // Attach rejection handler before advancing timers so Node doesn't warn about unhandled rejection
    const failureCheck = expect(failing).rejects.toThrow("boom");
    await vi.runAllTimersAsync();
    await failureCheck;
    expect(await succeeding).toBe("ok");
  });
});
