import { AppError } from "./errors";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const MAX_BUCKETS = 1_000;
const buckets = new Map<string, number[]>();
let lastSweepAt = 0;

function sweepExpired(now: number, force = false): void {
  if (!force && now - lastSweepAt < WINDOW_MS && buckets.size <= MAX_BUCKETS) return;
  const cutoff = now - WINDOW_MS;
  for (const [key, timestamps] of buckets) {
    const recent = timestamps.filter((timestamp) => timestamp > cutoff);
    if (recent.length === 0) buckets.delete(key);
    else buckets.set(key, recent);
  }
  lastSweepAt = now;
}

export function enforceModelRateLimit(identifier: string, now = Date.now()): void {
  sweepExpired(now, buckets.size > MAX_BUCKETS);
  if (!buckets.has(identifier) && buckets.size >= MAX_BUCKETS) {
    let oldestKey: string | undefined;
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    for (const [key, timestamps] of buckets) {
      const firstTimestamp = timestamps[0] ?? Number.NEGATIVE_INFINITY;
      if (firstTimestamp < oldestTimestamp) {
        oldestTimestamp = firstTimestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) buckets.delete(oldestKey);
  }
  const cutoff = now - WINDOW_MS;
  const recent = (buckets.get(identifier) ?? []).filter((timestamp) => timestamp > cutoff);
  if (recent.length >= MAX_REQUESTS) {
    buckets.set(identifier, recent);
    const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1_000));
    throw new AppError("RATE_LIMITED", "生成请求过于频繁，请稍后再试。", 429, true, { retryAfterSeconds });
  }
  recent.push(now);
  buckets.set(identifier, recent);
}

export function resetModelRateLimitForTests(): void {
  buckets.clear();
  lastSweepAt = 0;
}
