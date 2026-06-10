/**
 * Per-IP sliding-window rate limiter (in-memory, best effort).
 * On serverless this is per-instance — it still stops tight abuse loops,
 * which is the realistic threat model for an unauthenticated demo API.
 */

interface Window {
  timestamps: number[];
}

const windows = new Map<string, Window>();
const MAX_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  let win = windows.get(key);
  if (!win) {
    if (windows.size >= MAX_KEYS) windows.clear(); // crude flood reset
    win = { timestamps: [] };
    windows.set(key, win);
  }

  win.timestamps = win.timestamps.filter((t) => now - t < windowMs);

  if (win.timestamps.length >= maxRequests) {
    const oldest = win.timestamps[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  win.timestamps.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Extract a stable client key from a Request (works on Vercel + local dev). */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/** Standard 429 response. */
export function rateLimitResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Too many requests. Slow down." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
