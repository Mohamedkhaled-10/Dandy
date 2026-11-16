// src/utils/server-rate-limit.ts
import crypto from 'node:crypto';
import net from 'node:net';
import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from './rate-limit.js';

export type RateLimitSource = 'upstash' | 'firebase-rtdb' | 'unavailable';
export type RateLimitReason = 'limit_exceeded' | 'store_unavailable';

export interface ServerRateLimitOptions {
  namespace: string;
  key: string;
  maxRequests: number;
  windowMs: number;
  adminDb?: any;
  redis?: any;
}

export interface ServerRateLimitResult {
  allowed: boolean;
  available: boolean;
  reason?: RateLimitReason;
  remaining: number;
  limit: number;
  resetAt?: number;
  retryAfterSeconds?: number;
  source: RateLimitSource;
}

export interface ClientIpContext {
  request: Request;
  clientAddress?: string | null;
  trustedProxy?: boolean;
  trustedProxyIps?: string[];
  trustRealIpHeader?: boolean;
  isVercel?: boolean;
}

const upstashLimiterCacheByClient = new WeakMap<object, Map<string, any>>();
const ASTRO_CLIENT_ADDRESS_SYMBOL = Symbol.for('astro.clientAddress');

export function hashRateLimitKey(namespace: string, key: string): string {
  return crypto
    .createHash('sha256')
    .update(`${namespace}:${key}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

/**
 * Validates and normalizes a single IPv4 or IPv6 literal using node:net isIP.
 * Rejects comma-separated chains, whitespace, host:port strings, and malformed values.
 */
export function normalizeAndValidateIp(rawIp: unknown): string | null {
  if (typeof rawIp !== 'string') return null;
  const trimmed = rawIp.trim();
  if (!trimmed || trimmed.length > 64 || trimmed.includes(',') || /\s/.test(trimmed)) {
    return null;
  }

  // Unwrap IPv4-mapped IPv6 literals (common on dual-stack Node sockets: ::ffff:127.0.0.1)
  if (trimmed.toLowerCase().startsWith('::ffff:')) {
    const mappedV4 = trimmed.slice(7);
    if (net.isIP(mappedV4) === 4) {
      return mappedV4;
    }
  }

  const version = net.isIP(trimmed);
  if (version === 4) {
    return trimmed;
  }
  if (version === 6) {
    return trimmed.toLowerCase();
  }
  return null;
}

function isLoopbackIp(ip: string | null): boolean {
  return ip === '127.0.0.1' || ip === '::1';
}

function isPrivateOrLocalIp(ip: string | null): boolean {
  if (!ip) return false;
  if (isLoopbackIp(ip)) return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const secondOctet = Number(ip.split('.')[1]);
    if (Number.isInteger(secondOctet) && secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) {
    return true;
  }
  return false;
}

function parseTrustedProxyAllowlist(overrideList?: string[]): Set<string> {
  const rawEntries = Array.isArray(overrideList)
    ? overrideList
    : (process.env.TRUSTED_PROXY_IPS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  const allowlist = new Set<string>();
  for (const entry of rawEntries) {
    const valid = normalizeAndValidateIp(entry);
    if (valid) {
      allowlist.add(valid);
    }
  }
  return allowlist;
}

/**
 * Safely resolves the client IP without trusting client-spoofable forwarding headers:
 * - On Vercel (strictly `process.env.VERCEL === '1'`): reads edge-overwritten `x-real-ip`
 *   (same source as @vercel/functions `ipAddress`) or `x-vercel-forwarded-for`, never falling back
 *   to `x-forwarded-for[0]` or `cf-connecting-ip`.
 * - On local / standalone Node: relies on Astro's `clientAddress` (TCP socket remoteAddress)
 *   and ignores forwarding headers unless `TRUST_PROXY` is enabled AND `socketIp` belongs to an
 *   explicitly configured `TRUSTED_PROXY_IPS` allowlist (or loopback if no list is configured).
 *   Even under `TRUST_PROXY`, `x-real-ip` is ignored unless `TRUST_X_REAL_IP=true` is explicitly set.
 * - Never collapses missing production IPs to a shared `127.0.0.1` fallback.
 */
export function getSafeClientIp(input: Request | ClientIpContext): string | null {
  const ctx: ClientIpContext = input instanceof Request ? { request: input } : input;
  const { request } = ctx;
  if (!request || !request.headers) {
    return null;
  }

  const isVercel =
    typeof ctx.isVercel === 'boolean'
      ? ctx.isVercel
      : process.env.VERCEL === '1';

  if (isVercel) {
    // Vercel Edge sets `x-real-ip` to the true client IP (used by @vercel/functions ipAddress()).
    const realIp = normalizeAndValidateIp(request.headers.get('x-real-ip'));
    if (realIp) {
      return realIp;
    }

    // Secondary Vercel-managed header (single valid IP only; reject multi-value chains)
    const vercelForwarded = normalizeAndValidateIp(
      request.headers.get('x-vercel-forwarded-for')
    );
    if (vercelForwarded) {
      return vercelForwarded;
    }

    // Do NOT fall back to @astrojs/vercel's clientAddress (which reads x-forwarded-for[0])
    return null;
  }

  // Non-Vercel (local dev / standalone Node / custom proxy):
  const rawSocketAddress =
    ctx.clientAddress !== undefined
      ? ctx.clientAddress
      : (Reflect.get(request, ASTRO_CLIENT_ADDRESS_SYMBOL) as string | undefined);
  const socketIp = normalizeAndValidateIp(rawSocketAddress);

  const trustedProxyEnabled =
    typeof ctx.trustedProxy === 'boolean'
      ? ctx.trustedProxy
      : process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';

  if (trustedProxyEnabled && socketIp) {
    const trustedAllowlist = parseTrustedProxyAllowlist(ctx.trustedProxyIps);
    const isVerifiedProxyHop =
      trustedAllowlist.size > 0
        ? trustedAllowlist.has(socketIp)
        : isLoopbackIp(socketIp);

    if (isVerifiedProxyHop) {
      const allowRealIpHeader =
        typeof ctx.trustRealIpHeader === 'boolean'
          ? ctx.trustRealIpHeader
          : process.env.TRUST_X_REAL_IP === 'true';

      if (allowRealIpHeader) {
        const proxyRealIp = normalizeAndValidateIp(request.headers.get('x-real-ip'));
        if (proxyRealIp) {
          return proxyRealIp;
        }
      }

      // Read rightmost non-trusted-proxy IP from x-forwarded-for; never trust [0]
      const xff = request.headers.get('x-forwarded-for');
      if (xff) {
        const parts = xff.split(',').map((entry) => entry.trim()).filter(Boolean);
        for (let i = parts.length - 1; i >= 0; i--) {
          const candidate = normalizeAndValidateIp(parts[i]);
          if (
            candidate &&
            !trustedAllowlist.has(candidate) &&
            !isPrivateOrLocalIp(candidate)
          ) {
            return candidate;
          }
        }
      }
    }
  }

  return socketIp;
}

/**
 * Helper to extract Astro `clientAddress` safely without triggering AstroError
 * in runtimes where `context.clientAddress` getter throws when unavailable.
 */
export function extractAstroClientAddress(context: any): string | undefined {
  if (!context || typeof context !== 'object') return undefined;
  try {
    return typeof context.clientAddress === 'string' ? context.clientAddress : undefined;
  } catch {
    return undefined;
  }
}

function getUpstashSlidingLimiter(
  redis: any,
  namespace: string,
  maxRequests: number,
  windowMs: number
) {
  let clientCache = upstashLimiterCacheByClient.get(redis);
  if (!clientCache) {
    clientCache = new Map<string, any>();
    upstashLimiterCacheByClient.set(redis, clientCache);
  }

  const cacheKey = `${namespace}:${maxRequests}:${windowMs}`;
  if (!clientCache.has(cacheKey)) {
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    clientCache.set(
      cacheKey,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`),
        prefix: `ratelimit:${namespace}`
      })
    );
  }
  return clientCache.get(cacheKey);
}

/**
 * Fail-closed serverless-safe distributed rate limiter:
 * 1. Uses Upstash Redis if configured (or injected).
 * 2. Falls back to atomic Firebase RTDB transactions on `privateRateLimits/*`.
 * 3. NEVER falls back to in-process memory or fail-open: if both stores fail or are unavailable,
 *    returns `{ allowed: false, available: false, reason: 'store_unavailable', source: 'unavailable' }`
 *    so callers can return HTTP 503 cleanly.
 */
export async function checkServerRateLimit(
  options: ServerRateLimitOptions
): Promise<ServerRateLimitResult> {
  const { namespace, key, maxRequests, windowMs, adminDb, redis: injectedRedis } = options;

  if (
    typeof namespace !== 'string' ||
    !namespace ||
    typeof key !== 'string' ||
    !key ||
    !Number.isFinite(maxRequests) ||
    maxRequests <= 0 ||
    !Number.isFinite(windowMs) ||
    windowMs <= 0
  ) {
    return {
      allowed: false,
      available: false,
      reason: 'store_unavailable',
      remaining: 0,
      limit: Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : 0,
      source: 'unavailable'
    };
  }

  const hashedKey = hashRateLimitKey(namespace, key);
  const now = Date.now();

  // 1. Primary: Upstash Redis (if configured or injected)
  try {
    const redisClient = injectedRedis !== undefined ? injectedRedis : getRedis();
    if (redisClient) {
      const res =
        typeof redisClient.limit === 'function'
          ? await redisClient.limit(hashedKey)
          : await getUpstashSlidingLimiter(redisClient, namespace, maxRequests, windowMs).limit(
              hashedKey
            );

      if (!res || typeof res.success !== 'boolean') {
        throw new Error('INVALID_UPSTASH_RESPONSE');
      }

      const hasValidReset = typeof res.reset === 'number' && Number.isFinite(res.reset);
      const resetAt = hasValidReset ? res.reset : undefined;
      const retryAfterSeconds = res.success
        ? 0
        : hasValidReset && res.reset > now
          ? Math.max(1, Math.ceil((res.reset - now) / 1000))
          : undefined;

      if (res.success) {
        return {
          allowed: true,
          available: true,
          remaining:
            typeof res.remaining === 'number' && Number.isFinite(res.remaining)
              ? Math.max(0, res.remaining)
              : Math.max(0, maxRequests - 1),
          limit:
            typeof res.limit === 'number' && Number.isFinite(res.limit) ? res.limit : maxRequests,
          ...(resetAt !== undefined ? { resetAt } : {}),
          retryAfterSeconds: 0,
          source: 'upstash'
        };
      }

      return {
        allowed: false,
        available: true,
        reason: 'limit_exceeded',
        remaining: 0,
        limit:
          typeof res.limit === 'number' && Number.isFinite(res.limit) ? res.limit : maxRequests,
        ...(resetAt !== undefined ? { resetAt } : {}),
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
        source: 'upstash'
      };
    }
  } catch (redisErr: any) {
    console.warn(
      `[ServerRateLimit] Upstash unavailable for ${namespace}, falling back to RTDB:`,
      redisErr?.code || redisErr?.name || 'store_error'
    );
  }

  // 2. Distributed Serverless Fallback: Firebase Admin RTDB Atomic Transaction
  if (adminDb && typeof adminDb.ref === 'function') {
    try {
      const bucketRef = adminDb.ref(`privateRateLimits/${namespace}/${hashedKey}`);
      const txNow = Date.now();
      const txResult = await bucketRef.transaction((current: any) => {
        if (
          !current ||
          typeof current !== 'object' ||
          typeof current.resetAt !== 'number' ||
          !Number.isFinite(current.resetAt) ||
          current.resetAt <= txNow
        ) {
          return {
            count: 1,
            resetAt: txNow + windowMs,
            updatedAt: txNow
          };
        }

        const currentCount = Number(current.count) || 0;
        return {
          count: currentCount + 1,
          resetAt: current.resetAt,
          updatedAt: txNow
        };
      });

      if (txResult && txResult.committed !== false) {
        const record = txResult?.snapshot?.val?.() ?? txResult?.val?.() ?? null;
        if (
          record &&
          typeof record.count === 'number' &&
          Number.isFinite(record.count) &&
          typeof record.resetAt === 'number' &&
          Number.isFinite(record.resetAt)
        ) {
          const allowed = record.count <= maxRequests;

          if (allowed) {
            return {
              allowed: true,
              available: true,
              remaining: Math.max(0, maxRequests - record.count),
              limit: maxRequests,
              resetAt: record.resetAt,
              retryAfterSeconds: 0,
              source: 'firebase-rtdb'
            };
          }

          const waitSeconds =
            record.resetAt > txNow ? Math.max(1, Math.ceil((record.resetAt - txNow) / 1000)) : undefined;

          return {
            allowed: false,
            available: true,
            reason: 'limit_exceeded',
            remaining: 0,
            limit: maxRequests,
            resetAt: record.resetAt,
            ...(waitSeconds !== undefined ? { retryAfterSeconds: waitSeconds } : {}),
            source: 'firebase-rtdb'
          };
        }
      }
    } catch (rtdbErr: any) {
      console.warn(
        `[ServerRateLimit] RTDB fallback unavailable for ${namespace}:`,
        rtdbErr?.code || rtdbErr?.name || 'store_error'
      );
    }
  }

  // 3. Fail-Closed: Neither Redis nor RTDB could enforce rate limits
  return {
    allowed: false,
    available: false,
    reason: 'store_unavailable',
    remaining: 0,
    limit: maxRequests,
    source: 'unavailable'
  };
}

