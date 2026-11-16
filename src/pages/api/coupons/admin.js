export const prerender = false;

// src/pages/api/coupons/admin.js
// Protected Server-Side Admin API for DANDY Coupon Definitions (GROUP 2A.5)
import { getAdminDb } from '../../../utils/firebase-admin.ts';
import { verifyAdminRequest, adminUnauthorizedResponse } from '../../../utils/admin-auth.js';
import { getCouponCategoryOptions } from '../../../utils/categories.ts';
import {
  COUPON_SCHEMA_VERSION,
  normalizeCouponCode,
  validateCouponDefinition
} from '../../../utils/coupons.ts';

const COUPONS_RTDB_PATH = 'settings/coupons';
const VALID_COUPON_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const PRIVATE_NO_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: PRIVATE_NO_CACHE_HEADERS
  });
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function getNowMs(_deps) {
  if (typeof _deps?.now === 'function') {
    const val = _deps.now();
    if (Number.isFinite(val) && val > 0) return Math.trunc(val);
  }
  return Date.now();
}

function normalizeStoredCouponRecord(id, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const cleanId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : String(id || '').trim();
  const normalizedCode = normalizeCouponCode(raw.code);
  if (!cleanId || !normalizedCode) {
    return null;
  }

  return {
    id: cleanId,
    code: normalizedCode,
    discountType: raw.discountType === 'fixed' ? 'fixed' : 'percentage',
    discountValue: Number(raw.discountValue) || 0,
    scope: raw.scope === 'category' ? 'category' : 'all',
    categorySlug: raw.scope === 'category' ? (raw.categorySlug || null) : null,
    minimumSubtotal: raw.minimumSubtotal ?? null,
    maximumDiscount: raw.discountType === 'percentage' ? (raw.maximumDiscount ?? null) : null,
    startsAt: raw.startsAt ?? null,
    expiresAt: raw.expiresAt ?? null,
    isActive: raw.isActive === true,
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || 0,
    createdBy: typeof raw.createdBy === 'string' ? raw.createdBy : '',
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : '',
    schemaVersion: Number(raw.schemaVersion) || COUPON_SCHEMA_VERSION
  };
}

function sortCoupons(list) {
  return [...list].sort((a, b) => {
    const createdDiff = (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
    if (createdDiff !== 0) return createdDiff;
    return String(a.code || '').localeCompare(String(b.code || ''));
  });
}

function extractCouponConfigInput(body) {
  if (body.coupon !== undefined) {
    return body.coupon;
  }
  const rest = { ...body };
  delete rest.action;
  delete rest.id;
  return rest;
}

export async function GET({ request, _deps = undefined }) {
  const authResult = await verifyAdminRequest(request, _deps);
  if (!authResult.authorized) {
    return adminUnauthorizedResponse(authResult);
  }

  try {
    const adminDb = _deps?.adminDb || getAdminDb();
    const snap = await adminDb.ref(COUPONS_RTDB_PATH).once('value');
    const rawVal = snap && typeof snap.val === 'function' ? snap.val() : null;

    const coupons = [];
    if (rawVal && typeof rawVal === 'object' && !Array.isArray(rawVal)) {
      for (const [key, entry] of Object.entries(rawVal)) {
        const normalized = normalizeStoredCouponRecord(key, entry);
        if (normalized) {
          coupons.push(normalized);
        }
      }
    }

    const sortedCoupons = sortCoupons(coupons);
    const categories = getCouponCategoryOptions();

    return jsonResponse(
      {
        success: true,
        coupons: sortedCoupons,
        categories,
        meta: {
          count: sortedCoupons.length,
          schemaVersion: COUPON_SCHEMA_VERSION,
          generatedAt: getNowMs(_deps)
        }
      },
      200
    );
  } catch (err) {
    console.error('[Coupons Admin API GET] Internal error:', err?.code || err?.name || 'unknown');
    return jsonResponse(
      {
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'تعذر تحميل قائمة الكوبونات. يرجى المحاولة مرة أخرى.'
      },
      500
    );
  }
}

export async function POST({ request, _deps = undefined }) {
  const authResult = await verifyAdminRequest(request, _deps);
  if (!authResult.authorized) {
    return adminUnauthorizedResponse(authResult);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        success: false,
        error: 'INVALID_JSON',
        message: 'صيغة البيانات المرسلة غير صالحة.'
      },
      400
    );
  }

  if (!isPlainObject(body)) {
    return jsonResponse(
      {
        success: false,
        error: 'INVALID_PAYLOAD',
        message: 'بيانات الطلب غير صالحة.'
      },
      400
    );
  }

  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const adminEmail =
    typeof authResult.admin?.email === 'string'
      ? authResult.admin.email.trim().toLowerCase()
      : '';
  const nowMs = getNowMs(_deps);

  try {
    const adminDb = _deps?.adminDb || getAdminDb();
    const couponsRef = adminDb.ref(COUPONS_RTDB_PATH);

    if (action === 'create') {
      const couponInput = extractCouponConfigInput(body);
      const validation = validateCouponDefinition(couponInput);
      if (!validation.valid || !validation.value) {
        return jsonResponse(
          {
            success: false,
            error: validation.error || 'INVALID_COUPON_DEFINITION',
            field: validation.field || null,
            message: validation.message || 'إعدادات الكوبون غير صالحة.'
          },
          400
        );
      }

      const pushRef = couponsRef.push();
      const generatedId = typeof pushRef?.key === 'string' ? pushRef.key.trim() : '';
      if (!generatedId || !VALID_COUPON_ID_PATTERN.test(generatedId)) {
        return jsonResponse(
          {
            success: false,
            error: 'ID_GENERATION_FAILED',
            message: 'تعذر إنشاء معرف مستقر للكوبون.'
          },
          500
        );
      }

      const newCoupon = {
        id: generatedId,
        ...validation.value,
        createdAt: nowMs,
        updatedAt: nowMs,
        createdBy: adminEmail,
        updatedBy: adminEmail,
        schemaVersion: COUPON_SCHEMA_VERSION
      };

      let txOutcome = null;
      const txResult = await couponsRef.transaction((currentData) => {
        // Reset per-attempt outcome cleanly in case Firebase retries the transaction
        txOutcome = null;
        const map =
          currentData && typeof currentData === 'object' && !Array.isArray(currentData)
            ? { ...currentData }
            : {};

        for (const existing of Object.values(map)) {
          if (!existing || typeof existing !== 'object') continue;
          const existingCode = normalizeCouponCode(existing.code);
          if (existingCode && existingCode === newCoupon.code) {
            txOutcome = {
              ok: false,
              status: 409,
              error: 'COUPON_CODE_EXISTS',
              message: `كود الكوبون "${newCoupon.code}" مستخدم بالفعل.`
            };
            return;
          }
        }

        map[generatedId] = newCoupon;
        txOutcome = { ok: true, coupon: newCoupon };
        return map;
      });

      if (txOutcome && !txOutcome.ok) {
        return jsonResponse(
          {
            success: false,
            error: txOutcome.error,
            message: txOutcome.message
          },
          txOutcome.status
        );
      }

      if (!txResult || txResult.committed === false || !txOutcome?.ok) {
        return jsonResponse(
          {
            success: false,
            error: 'TRANSACTION_ABORTED',
            message: 'تعذر حفظ الكوبون بسبب تعارض متزامن. يرجى المحاولة مرة أخرى.'
          },
          409
        );
      }

      return jsonResponse(
        {
          success: true,
          message: `تم إنشاء الكوبون "${newCoupon.code}" بنجاح.`,
          coupon: txOutcome.coupon
        },
        200
      );
    }

    if (action === 'update') {
      const couponId = typeof body.id === 'string' ? body.id.trim() : '';
      if (!couponId || !VALID_COUPON_ID_PATTERN.test(couponId)) {
        return jsonResponse(
          {
            success: false,
            error: 'INVALID_COUPON_ID',
            message: 'معرف الكوبون غير صالح.'
          },
          400
        );
      }

      const couponInput = extractCouponConfigInput(body);
      const validation = validateCouponDefinition(couponInput);
      if (!validation.valid || !validation.value) {
        return jsonResponse(
          {
            success: false,
            error: validation.error || 'INVALID_COUPON_DEFINITION',
            field: validation.field || null,
            message: validation.message || 'إعدادات الكوبون غير صالحة.'
          },
          400
        );
      }

      let txOutcome = null;
      const txResult = await couponsRef.transaction((currentData) => {
        txOutcome = null;
        const map =
          currentData && typeof currentData === 'object' && !Array.isArray(currentData)
            ? { ...currentData }
            : {};

        const existing = map[couponId];
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
          txOutcome = {
            ok: false,
            status: 404,
            error: 'COUPON_NOT_FOUND',
            message: 'الكوبون المطلوب غير موجود.'
          };
          return;
        }

        for (const [otherId, other] of Object.entries(map)) {
          if (otherId === couponId || !other || typeof other !== 'object') continue;
          const otherCode = normalizeCouponCode(other.code);
          if (otherCode && otherCode === validation.value.code) {
            txOutcome = {
              ok: false,
              status: 409,
              error: 'COUPON_CODE_EXISTS',
              message: `كود الكوبون "${validation.value.code}" مستخدم بالفعل في كوبون آخر.`
            };
            return;
          }
        }

        const updatedCoupon = {
          id: typeof existing.id === 'string' && existing.id.trim() ? existing.id.trim() : couponId,
          ...validation.value,
          createdAt: Number(existing.createdAt) || nowMs,
          updatedAt: nowMs,
          createdBy:
            typeof existing.createdBy === 'string' && existing.createdBy.trim()
              ? existing.createdBy.trim().toLowerCase()
              : adminEmail,
          updatedBy: adminEmail,
          schemaVersion: COUPON_SCHEMA_VERSION
        };

        map[couponId] = updatedCoupon;
        txOutcome = { ok: true, coupon: updatedCoupon };
        return map;
      });

      if (txOutcome && !txOutcome.ok) {
        return jsonResponse(
          {
            success: false,
            error: txOutcome.error,
            message: txOutcome.message
          },
          txOutcome.status
        );
      }

      if (!txResult || txResult.committed === false || !txOutcome?.ok) {
        return jsonResponse(
          {
            success: false,
            error: 'TRANSACTION_ABORTED',
            message: 'تعذر تحديث الكوبون بسبب تعارض متزامن. يرجى المحاولة مرة أخرى.'
          },
          409
        );
      }

      return jsonResponse(
        {
          success: true,
          message: `تم تحديث الكوبون "${txOutcome.coupon.code}" بنجاح.`,
          coupon: txOutcome.coupon
        },
        200
      );
    }

    if (action === 'set_active') {
      const couponId = typeof body.id === 'string' ? body.id.trim() : '';
      if (!couponId || !VALID_COUPON_ID_PATTERN.test(couponId)) {
        return jsonResponse(
          {
            success: false,
            error: 'INVALID_COUPON_ID',
            message: 'معرف الكوبون غير صالح.'
          },
          400
        );
      }

      if (typeof body.isActive !== 'boolean') {
        return jsonResponse(
          {
            success: false,
            error: 'INVALID_ACTIVE_STATE',
            message: 'قيمة التفعيل يجب أن تكون boolean صريحة (true أو false).'
          },
          400
        );
      }

      const targetActive = body.isActive;
      let txOutcome = null;
      const txResult = await couponsRef.transaction((currentData) => {
        txOutcome = null;
        const map =
          currentData && typeof currentData === 'object' && !Array.isArray(currentData)
            ? { ...currentData }
            : {};

        const existing = map[couponId];
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
          txOutcome = {
            ok: false,
            status: 404,
            error: 'COUPON_NOT_FOUND',
            message: 'الكوبون المطلوب غير موجود.'
          };
          return;
        }

        const updatedCoupon = {
          id: typeof existing.id === 'string' && existing.id.trim() ? existing.id.trim() : couponId,
          code: normalizeCouponCode(existing.code) || existing.code,
          discountType: existing.discountType === 'fixed' ? 'fixed' : 'percentage',
          discountValue: Number(existing.discountValue) || 0,
          scope: existing.scope === 'category' ? 'category' : 'all',
          categorySlug: existing.scope === 'category' ? (existing.categorySlug || null) : null,
          minimumSubtotal: existing.minimumSubtotal ?? null,
          maximumDiscount: existing.discountType === 'percentage' ? (existing.maximumDiscount ?? null) : null,
          startsAt: existing.startsAt ?? null,
          expiresAt: existing.expiresAt ?? null,
          isActive: targetActive,
          createdAt: Number(existing.createdAt) || nowMs,
          updatedAt: nowMs,
          createdBy:
            typeof existing.createdBy === 'string' && existing.createdBy.trim()
              ? existing.createdBy.trim().toLowerCase()
              : adminEmail,
          updatedBy: adminEmail,
          schemaVersion: COUPON_SCHEMA_VERSION
        };

        map[couponId] = updatedCoupon;
        txOutcome = { ok: true, coupon: updatedCoupon };
        return map;
      });

      if (txOutcome && !txOutcome.ok) {
        return jsonResponse(
          {
            success: false,
            error: txOutcome.error,
            message: txOutcome.message
          },
          txOutcome.status
        );
      }

      if (!txResult || txResult.committed === false || !txOutcome?.ok) {
        return jsonResponse(
          {
            success: false,
            error: 'TRANSACTION_ABORTED',
            message: 'تعذر تغيير حالة الكوبون بسبب تعارض متزامن. يرجى المحاولة مرة أخرى.'
          },
          409
        );
      }

      return jsonResponse(
        {
          success: true,
          message: targetActive
            ? `تم تفعيل الكوبون "${txOutcome.coupon.code}" بنجاح.`
            : `تم تعطيل الكوبون "${txOutcome.coupon.code}" بنجاح.`,
          coupon: txOutcome.coupon
        },
        200
      );
    }

    return jsonResponse(
      {
        success: false,
        error: 'UNKNOWN_ACTION',
        message: 'الإجراء المطلوب غير مدعوم.'
      },
      400
    );
  } catch (err) {
    console.error('[Coupons Admin API POST] Internal error:', err?.code || err?.name || 'unknown');
    return jsonResponse(
      {
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'حدث خطأ داخلي أثناء معالجة الطلب.'
      },
      500
    );
  }
}

export async function ALL() {
  return jsonResponse(
    {
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'طريقة الطلب غير مدعومة.'
    },
    405
  );
}
