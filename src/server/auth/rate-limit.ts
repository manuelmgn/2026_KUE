export interface AuthRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface Bucket {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(maxAttempts: number, windowMs: number, now: () => number = Date.now) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.now = now;
  }

  check(key: string): AuthRateLimitResult {
    const current = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const cutoff = current - this.windowMs;
    bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);
    if (bucket.timestamps.length === 0) {
      this.buckets.delete(key);
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (bucket.timestamps.length >= this.maxAttempts) {
      const oldest = bucket.timestamps[0] ?? current;
      const retryAfterMs = Math.max(1_000, oldest + this.windowMs - current);
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1_000) };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  record(key: string): void {
    const current = this.now();
    const cutoff = current - this.windowMs;
    const bucket = this.buckets.get(key);
    if (!bucket) {
      this.buckets.set(key, { timestamps: [current] });
    } else {
      bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);
      bucket.timestamps.push(current);
    }

    // Prevent unbounded memory growth under spray attacks
    if (this.buckets.size > 10_000) {
      for (const [k, b] of this.buckets) {
        if (b.timestamps.every((ts) => ts <= cutoff)) {
          this.buckets.delete(k);
        }
      }
    }
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

const globalForAuthLimiter = globalThis as typeof globalThis & {
  kueLoginLimiter?: SlidingWindowRateLimiter;
  kueRegisterLimiter?: SlidingWindowRateLimiter;
  kueAvatarLimiter?: SlidingWindowRateLimiter;
  kueFriendActionLimiter?: SlidingWindowRateLimiter;
};

export function getLoginRateLimiter(): SlidingWindowRateLimiter {
  // 8 failed attempts per 15 minutes
  globalForAuthLimiter.kueLoginLimiter ??= new SlidingWindowRateLimiter(8, 15 * 60 * 1000);
  return globalForAuthLimiter.kueLoginLimiter;
}

export function getRegisterRateLimiter(): SlidingWindowRateLimiter {
  // 5 registrations per hour per IP
  globalForAuthLimiter.kueRegisterLimiter ??= new SlidingWindowRateLimiter(5, 60 * 60 * 1000);
  return globalForAuthLimiter.kueRegisterLimiter;
}

export function getAvatarUploadRateLimiter(): SlidingWindowRateLimiter {
  // 6 avatar uploads per 15 minutes per user/IP
  globalForAuthLimiter.kueAvatarLimiter ??= new SlidingWindowRateLimiter(6, 15 * 60 * 1000);
  return globalForAuthLimiter.kueAvatarLimiter;
}

export function getFriendActionRateLimiter(): SlidingWindowRateLimiter {
  // 30 friend requests per 15 minutes per user
  globalForAuthLimiter.kueFriendActionLimiter ??= new SlidingWindowRateLimiter(30, 15 * 60 * 1000);
  return globalForAuthLimiter.kueFriendActionLimiter;
}

export function extractClientIp(headerStore: { get(name: string): string | null }): string {
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return headerStore.get("x-real-ip")?.trim() || "local";
}
