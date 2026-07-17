import type { RequestHandler } from 'express';

export interface ApiRateLimiterOptions {
  limit: number;
  windowMs: number;
}

export function createApiRateLimiter(options: ApiRateLimiterOptions): RequestHandler {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1) {
    throw new Error('API rate limit must be a positive integer.');
  }
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs < 1) {
    throw new Error('API rate-limit window must be a positive integer.');
  }

  const buckets = new Map<string, number[]>();
  setInterval(() => {
    const cutoff = Date.now() - options.windowMs;
    for (const [ip, hits] of buckets) {
      const kept = hits.filter((time) => time > cutoff);
      if (kept.length) buckets.set(ip, kept); else buckets.delete(ip);
    }
  }, options.windowMs).unref?.();

  return (request, response, next) => {
    if (request.path === '/health') return next();
    const ip = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || request.ip || request.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const hits = (buckets.get(ip) || []).filter((time) => time > now - options.windowMs);
    hits.push(now);
    buckets.set(ip, hits);
    response.setHeader('X-RateLimit-Limit', String(options.limit));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.limit - hits.length)));
    if (hits.length <= options.limit) return next();

    response.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1_000)));
    if (/^\/v1(?:\/|$)/.test(request.path)) {
      return response.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' },
      });
    }
    return response.status(429).json({
      success: false,
      error: '请求过于频繁，请稍后再试',
      code: 'RATE_LIMITED',
    });
  };
}
