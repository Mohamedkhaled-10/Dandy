// src/utils/admin-auth.js
// Unified server-side Admin Authorization helper for DANDY API routes.
import { getAdminAuth } from './firebase-admin.ts';

export const ADMIN_EMAIL = 'admin@dandy.com';

const AUTH_SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

/**
 * Extracts Bearer ID token strictly from the Authorization header.
 * Never accepts email/role/token from JSON body or query string.
 */
export function extractBearerToken(request) {
  const authHeader =
    request?.headers?.get?.('authorization') ||
    request?.headers?.get?.('Authorization') ||
    '';
  if (typeof authHeader !== 'string') return null;

  const match = authHeader.trim().match(/^Bearer\s+([^\s]+)$/i);
  if (!match || !match[1]) return null;

  const token = match[1].trim();
  if (token.length < 10 || token.length > 8192) return null;
  return token;
}

/**
 * Checks whether decoded Firebase ID token claims belong to the verified DANDY admin.
 */
export function isVerifiedAdminClaims(decoded) {
  return Boolean(
    decoded &&
      typeof decoded.email === 'string' &&
      decoded.email.trim().toLowerCase() === ADMIN_EMAIL &&
      decoded.email_verified === true
  );
}

/**
 * Verifies Authorization: Bearer <Firebase ID Token> via Firebase Admin SDK,
 * enforcing admin@dandy.com AND email_verified === true.
 * Never logs raw tokens or sensitive user data.
 */
export async function verifyAdminRequest(request, _deps = undefined) {
  const idToken = extractBearerToken(request);
  if (!idToken) {
    return {
      authorized: false,
      status: 401,
      error: 'UNAUTHORIZED',
      reason: 'MISSING_OR_MALFORMED_TOKEN',
      message: 'غير مصرح بالوصول. يجب تسجيل الدخول بحساب الإدارة المعتمد.'
    };
  }

  const hasInjectedAuth = _deps?.adminAuth !== undefined && _deps.adminAuth !== null;
  if (!hasInjectedAuth && !_deps?.simulateMissingAuth) {
    // Real Firebase ID tokens are always 3-segment compact JWS strings; reject malformed strings early as 401
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken)) {
      return {
        authorized: false,
        status: 401,
        error: 'UNAUTHORIZED',
        reason: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'انتهت جلسة الإدارة أو الرمز غير صالح. يرجى إعادة تسجيل الدخول.'
      };
    }
  }

  let adminAuth = _deps?.adminAuth !== undefined ? _deps.adminAuth : null;
  if (!adminAuth && !_deps?.simulateMissingAuth) {
    try {
      adminAuth = getAdminAuth();
    } catch {
      adminAuth = null;
    }
  }

  if (!adminAuth || typeof adminAuth.verifyIdToken !== 'function') {
    return {
      authorized: false,
      status: 503,
      error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
      reason: 'AUTH_SERVICE_UNAVAILABLE',
      message: 'خدمة التحقق الإداري غير متاحة مؤقتاً.'
    };
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch (err) {
    console.warn('[AdminAuth] Token verification rejected:', err?.code || 'invalid_or_expired_token');
    return {
      authorized: false,
      status: 401,
      error: 'UNAUTHORIZED',
      reason: 'INVALID_OR_EXPIRED_TOKEN',
      message: 'انتهت جلسة الإدارة أو الرمز غير صالح. يرجى إعادة تسجيل الدخول.'
    };
  }

  const email = typeof decoded?.email === 'string' ? decoded.email.trim().toLowerCase() : '';
  if (email !== ADMIN_EMAIL) {
    return {
      authorized: false,
      status: 403,
      error: 'FORBIDDEN',
      reason: 'NOT_ADMIN_EMAIL',
      message: 'غير مصرح: هذه العملية مخصصة لحساب الإدارة (admin@dandy.com) فقط.'
    };
  }

  if (decoded?.email_verified !== true) {
    return {
      authorized: false,
      status: 403,
      error: 'ADMIN_EMAIL_NOT_VERIFIED',
      reason: 'EMAIL_NOT_VERIFIED',
      message: 'غير مصرح: يجب توثيق البريد الإلكتروني لحساب الإدارة قبل تنفيذ هذه العملية.'
    };
  }

  return {
    authorized: true,
    admin: decoded
  };
}

/**
 * Convenience response builder for rejected admin requests.
 */
export function adminUnauthorizedResponse(authResult) {
  const status = authResult?.status || 401;
  return new Response(
    JSON.stringify({
      success: false,
      error: authResult?.error || 'UNAUTHORIZED',
      message: authResult?.message || 'غير مصرح بالوصول.'
    }),
    {
      status,
      headers: AUTH_SECURITY_HEADERS
    }
  );
}
