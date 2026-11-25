export interface RateLimiter {
  /** Runs `task` serialized after every previously scheduled task, spaced by the min interval. */
  schedule<T>(task: () => Promise<T>): Promise<T>;
  setMinInterval(ms: number): void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Serializing rate limiter: guarantees at least `minIntervalMs` between the *start* of any
 * two scheduled tasks and never runs two tasks concurrently. Failures do not block the chain.
 */
export function createRateLimiter(
  minIntervalMs: number,
  now: () => number = Date.now,
): RateLimiter {
  let interval = Math.max(0, minIntervalMs);
  let lastStartedAt: number | null = null;
  let tail: Promise<unknown> = Promise.resolve();

  return {
    schedule<T>(task: () => Promise<T>): Promise<T> {
      const run = async (): Promise<T> => {
        if (lastStartedAt !== null) {
          const wait = interval - (now() - lastStartedAt);
          if (wait > 0) {
            await sleep(wait);
          }
        }
        lastStartedAt = now();
        return task();
      };

      const result = tail.then(run, run);
      tail = result.catch(() => undefined);
      return result;
    },
    setMinInterval(ms: number) {
      interval = Math.max(0, ms);
    },
  };
}
