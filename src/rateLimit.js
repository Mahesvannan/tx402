/**
 * Minimal in-memory per-IP fixed-window rate limiter.
 *
 * No external dependency on purpose — this service does one job and
 * doesn't need a full rate-limiting library for it. State is per-process,
 * so this is not suitable for a horizontally-scaled deployment; swap for
 * a shared-store limiter (Redis, etc.) if you ever run more than one
 * instance behind a load balancer.
 */

export function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, resetAt }

  return function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message || 'Too many requests. Try again shortly.' });
    }

    next();
  };
}
