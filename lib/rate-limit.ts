type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();

export function takeRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  now = Date.now(),
) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const entry = { count: 1, resetAt: now + options.windowMs };
    buckets.set(key, entry);
    return { allowed: true, remaining: options.limit - 1, resetAt: entry.resetAt };
  }
  if (current.count >= options.limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }
  current.count += 1;
  return {
    allowed: true,
    remaining: options.limit - current.count,
    resetAt: current.resetAt,
  };
}

export function clearRateLimitsForTests() {
  buckets.clear();
}
