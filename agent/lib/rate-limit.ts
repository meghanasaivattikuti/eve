// Fixed-window per-key limiter held in instance memory. On serverless each warm
// instance keeps its own counters, so this bounds abuse per instance rather than
// globally; swap the Map for Redis (INCR + EXPIRE) for a strict global limit.
const windows = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 10_000;

export function hitRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || entry.resetAt <= now) {
    if (windows.size >= MAX_KEYS) {
      for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
      if (windows.size >= MAX_KEYS) windows.clear();
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}
