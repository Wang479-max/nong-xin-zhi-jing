import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';

export interface ApiRateLimiterOptions {
  limit: number;
  windowMs: number;
  maxBuckets?: number;
  trustProxy?: boolean;
}

export interface ApiRateLimiter extends RequestHandler {
  readonly bucketCount: number;
}

const DEFAULT_MAX_BUCKETS = 10_000;
const MAX_BUCKETS_UPPER_BOUND = 100_000;
const MAX_KEY_LENGTH = 128;

export function createApiRateLimiter(options: ApiRateLimiterOptions): ApiRateLimiter {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1) {
    throw new Error('API rate limit must be a positive integer.');
  }
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs < 1) {
    throw new Error('API rate-limit window must be a positive integer.');
  }
  const maxBuckets = options.maxBuckets ?? DEFAULT_MAX_BUCKETS;
  if (!Number.isSafeInteger(maxBuckets) || maxBuckets < 1 || maxBuckets > MAX_BUCKETS_UPPER_BOUND) {
    throw new Error(`API rate-limit bucket cap must be between 1 and ${MAX_BUCKETS_UPPER_BOUND}.`);
  }

  const buckets = new Map<string, number[]>();
  setInterval(() => {
    const cutoff = Date.now() - options.windowMs;
    for (const [ip, hits] of buckets) {
      const kept = hits.filter((time) => time > cutoff);
      if (kept.length) buckets.set(ip, kept); else buckets.delete(ip);
    }
  }, options.windowMs).unref?.();

  const limiter = ((request, response, next) => {
    if (request.path === '/health') return next();
    const clientAddress = options.trustProxy ? request.ip : request.socket.remoteAddress;
    const key = normalizedClientKey(clientAddress);
    const now = Date.now();
    const current = buckets.get(key);
    if (!current && buckets.size >= maxBuckets) {
      return rateLimited(response, request.path, options);
    }
    const hits = (current || []).filter((time) => time > now - options.windowMs);
    hits.push(now);
    buckets.set(key, hits);
    response.setHeader('X-RateLimit-Limit', String(options.limit));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.limit - hits.length)));
    if (hits.length <= options.limit) return next();
    return rateLimited(response, request.path, options);
  }) as ApiRateLimiter;
  Object.defineProperty(limiter, 'bucketCount', { get: () => buckets.size });
  return limiter;
}

function normalizedClientKey(address: string | undefined): string {
  const normalized = address?.trim().toLowerCase() || 'unknown';
  if (normalized.length <= MAX_KEY_LENGTH) return normalized;
  return `sha256:${createHash('sha256').update(normalized).digest('hex')}`;
}

function rateLimited(
  response: Parameters<RequestHandler>[1],
  requestPath: string,
  options: ApiRateLimiterOptions,
) {
  response.setHeader('X-RateLimit-Limit', String(options.limit));
  response.setHeader('X-RateLimit-Remaining', '0');
  response.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1_000)));
  if (/^\/v1(?:\/|$)/.test(requestPath)) {
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
}
