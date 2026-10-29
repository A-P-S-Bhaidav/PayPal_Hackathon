import crypto from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

// ============================================================================
// AEGISPAY INDUSTRY SECURITY, RATE-LIMITING & ZERO-TRUST MIDDLEWARE
// ============================================================================

const SECRET_PATTERNS: RegExp[] = [
  /AQ\.[A-Za-z0-9_-]{12,}/g,
  /gsk_[A-Za-z0-9_-]{12,}/g,
  /GOCSPX-[A-Za-z0-9_-]{10,}/g,
  /aegis_sess_[A-Za-z0-9._-]{16,}/g,
  /Bearer\s+[A-Za-z0-9._-]{16,}/gi,
];

export function redactSecrets(input: unknown): string {
  let text = typeof input === 'string' ? input : JSON.stringify(input ?? '');
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, '[REDACTED_SECRET]');
  }
  return text;
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isSecure =
    process.env.NODE_ENV === 'production' ||
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `aegis_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=43200',
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    'aegis_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  );
}

/**
 * Recursively strips null bytes and blocks prototype-pollution keys.
 */
function sanitizeValue(val: unknown, depth = 0): unknown {
  if (depth > 8) return undefined;
  if (typeof val === 'string') {
    return val.replace(/\0/g, '');
  }
  if (Array.isArray(val)) {
    return val.slice(0, 500).map((item) => sanitizeValue(item, depth + 1));
  }
  if (val !== null && typeof val === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
        continue;
      }
      clean[k] = sanitizeValue(v, depth + 1);
    }
    return clean;
  }
  return val;
}

export const sanitizePayloadMiddleware: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body, 0);
  }
  next();
};

export const securityHeadersMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const reqId =
    (typeof req.headers['x-request-id'] === 'string' &&
      req.headers['x-request-id'].slice(0, 64)) ||
    crypto.randomUUID();

  res.setHeader('X-Request-Id', reqId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), usb=(), payment=(self "https://www.paypal.com" "https://www.sandbox.paypal.com")'
  );
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.paypal.com https://www.sandbox.paypal.com https://www.paypalobjects.com https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://*.paypal.com https://*.paypalobjects.com https://*.googleusercontent.com",
      "connect-src 'self' https://*.paypal.com https://*.sandbox.paypal.com https://accounts.google.com",
      "frame-src 'self' https://*.paypal.com https://*.sandbox.paypal.com https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  );
  next();
};

export interface RateLimitTierOptions {
  tierName: 'AUTH' | 'MUTATION' | 'READ';
  windowMs: number;
  maxRequests: number;
  maxTrackedBuckets?: number;
}

interface BucketRecord {
  timestamps: number[];
  lastSeenMs: number;
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, BucketRecord>();
  private readonly options: Required<RateLimitTierOptions>;
  private totalBlocked = 0;

  constructor(options: RateLimitTierOptions) {
    this.options = {
      maxTrackedBuckets: 10_000,
      ...options,
    };
  }

  public getStats(): {
    tierName: string;
    windowMs: number;
    maxRequests: number;
    activeBuckets: number;
    totalBlocked: number;
  } {
    return {
      tierName: this.options.tierName,
      windowMs: this.options.windowMs,
      maxRequests: this.options.maxRequests,
      activeBuckets: this.buckets.size,
      totalBlocked: this.totalBlocked,
    };
  }

  private resolveClientKey(req: Request): string {
    const authUser = (req as unknown as { operator?: { id?: string } }).operator?.id;
    if (authUser) {
      return `usr:${authUser}`;
    }
    const forwarded = req.headers['x-forwarded-for'];
    const rawIp =
      (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return `ip:${rawIp.slice(0, 64)}`;
  }

  private evictIfNeeded(now: number): void {
    if (this.buckets.size < this.options.maxTrackedBuckets) return;
    const cutoff = now - this.options.windowMs;
    for (const [k, rec] of this.buckets.entries()) {
      if (rec.lastSeenMs < cutoff) {
        this.buckets.delete(k);
      }
      if (this.buckets.size < this.options.maxTrackedBuckets * 0.85) break;
    }
    // Strict LRU fallback if all buckets are recent
    while (this.buckets.size >= this.options.maxTrackedBuckets) {
      const oldestKey = this.buckets.keys().next().value;
      if (!oldestKey) break;
      this.buckets.delete(oldestKey);
    }
  }

  public middleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      const now = Date.now();
      const windowStart = now - this.options.windowMs;
      const key = this.resolveClientKey(req);

      let bucket = this.buckets.get(key);
      if (bucket) {
        // Refresh LRU order
        this.buckets.delete(key);
        bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);
        bucket.lastSeenMs = now;
      } else {
        this.evictIfNeeded(now);
        bucket = { timestamps: [], lastSeenMs: now };
      }

      const windowSec = Math.ceil(this.options.windowMs / 1000);
      res.setHeader(
        'RateLimit-Policy',
        `${this.options.maxRequests};w=${windowSec};tier=${this.options.tierName}`
      );
      res.setHeader('RateLimit-Limit', String(this.options.maxRequests));

      if (bucket.timestamps.length >= this.options.maxRequests) {
        this.buckets.set(key, bucket);
        this.totalBlocked += 1;
        const oldestInWindow = bucket.timestamps[0] || now;
        const retryAfterSec = Math.max(
          1,
          Math.ceil((oldestInWindow + this.options.windowMs - now) / 1000)
        );
        res.setHeader('RateLimit-Remaining', '0');
        res.setHeader('RateLimit-Reset', String(retryAfterSec));
        res.setHeader('Retry-After', String(retryAfterSec));
        res.status(429).json({
          error: `Rate limit exceeded for ${this.options.tierName} tier. Please retry in ${retryAfterSec}s.`,
          code: 'RATE_LIMIT_EXCEEDED',
          tier: this.options.tierName,
          retryAfterSeconds: retryAfterSec,
        });
        return;
      }

      bucket.timestamps.push(now);
      this.buckets.set(key, bucket);

      const remaining = Math.max(0, this.options.maxRequests - bucket.timestamps.length);
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String(windowSec));
      next();
    };
  }
}
