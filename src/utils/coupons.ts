// src/utils/coupons.ts
// Centralized Coupon Data Model, Validation, Status Derivation & Pure Business-Rule Helpers
// Scope: GROUP 2A.5 Foundation (checkout / order / analytics integration belong to GROUP 2A.6 & 2A.7)

import {
  getStrictCategorySlugForProduct,
  isValidCanonicalCategorySlug
} from './categories.ts';

export const COUPON_SCHEMA_VERSION = 1 as const;
export const COUPON_CODE_MIN_LENGTH = 3;
export const COUPON_CODE_MAX_LENGTH = 32;
export const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;
export const MAX_COUPON_TIMESTAMP_MS = 253402300799999; // 9999-12-31T23:59:59.999Z

export type CouponDiscountType = 'percentage' | 'fixed';
export type CouponScope = 'all' | 'category';
export type CouponStatus = 'active' | 'scheduled' | 'expired' | 'disabled';

export interface CouponConfig {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  scope: CouponScope;
  categorySlug: string | null;
  minimumSubtotal: number | null;
  maximumDiscount: number | null;
  startsAt: number | null;
  expiresAt: number | null;
  isActive: boolean;
}

export interface CouponRecord extends CouponConfig {
  id: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  updatedBy: string;
  schemaVersion: typeof COUPON_SCHEMA_VERSION;
}

export interface CouponCodeValidationResult {
  valid: boolean;
  normalizedCode: string | null;
  error?: string;
  message?: string;
}

export interface CouponDefinitionValidationResult {
  valid: boolean;
  value: CouponConfig | null;
  error?: string;
  message?: string;
  field?: string;
}

export interface CouponOrderItemInput {
  id?: string | null;
  productId?: string | null;
  category?: string | null;
  categorySlug?: string | null;
  price?: number | string | null;
  unitPrice?: number | string | null;
  finalPrice?: number | string | null;
  lineTotal?: number | string | null;
  quantity?: number | string | null;
  qty?: number | string | null;
  isPinkFriday?: boolean;
  isPinkFridayOffer?: boolean;
  isCollection?: boolean;
  collectionId?: string | null;
  type?: string | null;
  product?: {
    id?: string | null;
    category?: string | null;
  } | null;
}

export interface ResolvedCouponOrderLine {
  productId: string;
  categorySlug: string | null;
  quantity: number;
  lineSubtotal: number;
  isPinkFridayItem: boolean;
  eligible: boolean;
  item: CouponOrderItemInput;
}

export interface CouponEligibilityResolution {
  eligibleItems: ResolvedCouponOrderLine[];
  ineligibleItems: ResolvedCouponOrderLine[];
  eligibleSubtotal: number;
  ineligibleSubtotal: number;
  orderProductSubtotal: number;
  hasPinkFridayItem: boolean;
}

export interface CouponEligibilityEvaluation {
  eligible: boolean;
  reason:
    | 'APPLIED'
    | 'COUPON_NOT_FOUND'
    | 'COUPON_DISABLED'
    | 'COUPON_NOT_STARTED'
    | 'COUPON_EXPIRED'
    | 'PINK_FRIDAY_NOT_COMBINABLE'
    | 'EMPTY_ELIGIBLE_SUBTOTAL'
    | 'NO_ELIGIBLE_CATEGORY_ITEMS'
    | 'MINIMUM_SUBTOTAL_NOT_MET';
  status: CouponStatus | null;
  discountAmount: number;
  eligibleSubtotal: number;
  orderProductSubtotal: number;
  discountedProductSubtotal: number;
  eligibleItems: ResolvedCouponOrderLine[];
  ineligibleItems: ResolvedCouponOrderLine[];
}

const ALLOWED_DEFINITION_FIELDS = new Set([
  'code',
  'discountType',
  'discountValue',
  'scope',
  'categorySlug',
  'minimumSubtotal',
  'maximumDiscount',
  'startsAt',
  'expiresAt',
  'isActive'
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function roundCurrency(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Single shared coupon-code normalization helper.
 * Trims surrounding whitespace, converts to uppercase, and validates allowed characters & length.
 * Returns null if invalid.
 */
export function normalizeCouponCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  if (!COUPON_CODE_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function validateCouponCode(raw: unknown): CouponCodeValidationResult {
  if (typeof raw !== 'string') {
    return {
      valid: false,
      normalizedCode: null,
      error: 'COUPON_CODE_REQUIRED',
      message: 'يرجى إدخال كود الكوبون.'
    };
  }

  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) {
    return {
      valid: false,
      normalizedCode: null,
      error: 'COUPON_CODE_REQUIRED',
      message: 'يرجى إدخال كود الكوبون.'
    };
  }

  if (trimmed.length < COUPON_CODE_MIN_LENGTH || trimmed.length > COUPON_CODE_MAX_LENGTH) {
    return {
      valid: false,
      normalizedCode: null,
      error: 'COUPON_CODE_LENGTH',
      message: `يجب أن يكون طول كود الكوبون بين ${COUPON_CODE_MIN_LENGTH} و ${COUPON_CODE_MAX_LENGTH} حرفاً.`
    };
  }

  if (!COUPON_CODE_PATTERN.test(trimmed)) {
    return {
      valid: false,
      normalizedCode: null,
      error: 'COUPON_CODE_INVALID_CHARS',
      message: 'كود الكوبون يجب أن يحتوي على حروف إنجليزية وأرقام وشرطة (-) أو (_) فقط.'
    };
  }

  return {
    valid: true,
    normalizedCode: trimmed
  };
}

function parseFiniteMonetaryNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseOptionalMonetaryThreshold(
  raw: unknown
): { ok: true; value: number | null } | { ok: false } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw === 'string' && raw.trim() === '') {
    return { ok: true, value: null };
  }

  const parsed = parseFiniteMonetaryNumber(raw);
  if (parsed === null || parsed <= 0) {
    return { ok: false };
  }

  const rounded = roundCurrency(parsed);
  if (rounded <= 0) {
    return { ok: false };
  }

  return { ok: true, value: rounded };
}

function parseOptionalTimestampMs(
  raw: unknown
): { ok: true; value: number | null } | { ok: false } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw === 'string' && raw.trim() === '') {
    return { ok: true, value: null };
  }

  let numeric: number;
  if (typeof raw === 'number') {
    numeric = raw;
  } else if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    numeric = Number(raw.trim());
  } else {
    return { ok: false };
  }

  if (
    !Number.isFinite(numeric) ||
    !Number.isInteger(numeric) ||
    numeric <= 0 ||
    numeric > MAX_COUPON_TIMESTAMP_MS
  ) {
    return { ok: false };
  }

  return { ok: true, value: numeric };
}

export function validateCouponDefinition(input: unknown): CouponDefinitionValidationResult {
  if (!isPlainObject(input)) {
    return {
      valid: false,
      value: null,
      error: 'INVALID_COUPON_PAYLOAD',
      message: 'بيانات الكوبون غير صالحة.'
    };
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_DEFINITION_FIELDS.has(key)) {
      return {
        valid: false,
        value: null,
        error: 'UNEXPECTED_COUPON_FIELD',
        field: key,
        message: `تم إرسال حقل غير مدعوم في إعدادات الكوبون: ${key}`
      };
    }
  }

  // 1. Code
  const codeCheck = validateCouponCode(input.code);
  if (!codeCheck.valid || !codeCheck.normalizedCode) {
    return {
      valid: false,
      value: null,
      error: codeCheck.error,
      field: 'code',
      message: codeCheck.message
    };
  }

  // 2. Discount type
  const discountType = input.discountType;
  if (discountType !== 'percentage' && discountType !== 'fixed') {
    return {
      valid: false,
      value: null,
      error: 'INVALID_DISCOUNT_TYPE',
      field: 'discountType',
      message: 'نوع الخصم غير صالح. يجب اختيار نسبة مئوية أو مبلغ ثابت.'
    };
  }

  // 3. Discount value
  const rawDiscountVal = parseFiniteMonetaryNumber(input.discountValue);
  if (rawDiscountVal === null) {
    return {
      valid: false,
      value: null,
      error: 'INVALID_DISCOUNT_VALUE',
      field: 'discountValue',
      message: 'قيمة الخصم غير صالحة.'
    };
  }
  const discountValue = roundCurrency(rawDiscountVal);
  if (discountValue <= 0) {
    return {
      valid: false,
      value: null,
      error: 'NON_POSITIVE_DISCOUNT_VALUE',
      field: 'discountValue',
      message: 'يجب أن تكون قيمة الخصم أكبر من صفر.'
    };
  }
  if (discountType === 'percentage' && discountValue > 100) {
    return {
      valid: false,
      value: null,
      error: 'INVALID_PERCENTAGE_VALUE',
      field: 'discountValue',
      message: 'نسبة الخصم يجب أن تكون أكبر من 0 ولا تتجاوز 100%.'
    };
  }

  // 4. Scope & category
  const scope = input.scope;
  if (scope !== 'all' && scope !== 'category') {
    return {
      valid: false,
      value: null,
      error: 'INVALID_COUPON_SCOPE',
      field: 'scope',
      message: 'نطاق الكوبون غير صالح. يجب اختيار جميع المنتجات أو قسم محدد.'
    };
  }

  let categorySlug: string | null = null;
  if (scope === 'category') {
    if (typeof input.categorySlug !== 'string' || !input.categorySlug.trim()) {
      return {
        valid: false,
        value: null,
        error: 'MISSING_CATEGORY_SLUG',
        field: 'categorySlug',
        message: 'يرجى اختيار القسم المستهدف للكوبون.'
      };
    }
    const candidateSlug = input.categorySlug.trim().toLowerCase();
    if (!isValidCanonicalCategorySlug(candidateSlug)) {
      return {
        valid: false,
        value: null,
        error: 'UNSUPPORTED_CATEGORY_SLUG',
        field: 'categorySlug',
        message: 'القسم المختار غير مدعوم ضمن أقسام المتجر المعتمدة.'
      };
    }
    categorySlug = candidateSlug;
  } else {
    const hasUnexpectedCategory =
      input.categorySlug !== undefined &&
      input.categorySlug !== null &&
      !(typeof input.categorySlug === 'string' && input.categorySlug.trim() === '');
    if (hasUnexpectedCategory) {
      return {
        valid: false,
        value: null,
        error: 'UNEXPECTED_CATEGORY_FOR_ALL_SCOPE',
        field: 'categorySlug',
        message: 'لا يمكن تحديد قسم معين عندما يكون نطاق الكوبون لجميع المنتجات.'
      };
    }
    categorySlug = null;
  }

  // 5. Minimum subtotal
  const minSubParsed = parseOptionalMonetaryThreshold(input.minimumSubtotal);
  if (!minSubParsed.ok) {
    return {
      valid: false,
      value: null,
      error: 'INVALID_MINIMUM_SUBTOTAL',
      field: 'minimumSubtotal',
      message: 'الحد الأدنى لقيمة الطلب يجب أن يكون رقماً موجباً أكبر من صفر.'
    };
  }

  // 6. Maximum discount
  let maximumDiscount: number | null = null;
  if (discountType === 'fixed') {
    const hasMaxDiscount =
      input.maximumDiscount !== undefined &&
      input.maximumDiscount !== null &&
      !(typeof input.maximumDiscount === 'string' && input.maximumDiscount.trim() === '');
    if (hasMaxDiscount) {
      return {
        valid: false,
        value: null,
        error: 'MAXIMUM_DISCOUNT_NOT_ALLOWED_FOR_FIXED',
        field: 'maximumDiscount',
        message: 'لا يمكن تحديد حد أقصى للخصم في كوبونات المبلغ الثابت.'
      };
    }
    maximumDiscount = null;
  } else {
    const maxDiscParsed = parseOptionalMonetaryThreshold(input.maximumDiscount);
    if (!maxDiscParsed.ok) {
      return {
        valid: false,
        value: null,
        error: 'INVALID_MAXIMUM_DISCOUNT',
        field: 'maximumDiscount',
        message: 'الحد الأقصى للخصم يجب أن يكون رقماً موجباً أكبر من صفر.'
      };
    }
    maximumDiscount = maxDiscParsed.value;
  }

  // 7. Validity timestamps
  const startsAtParsed = parseOptionalTimestampMs(input.startsAt);
  if (!startsAtParsed.ok) {
    return {
      valid: false,
      value: null,
      error: 'INVALID_START_TIMESTAMP',
      field: 'startsAt',
      message: 'تاريخ بداية الصلاحية غير صالح.'
    };
  }

  const expiresAtParsed = parseOptionalTimestampMs(input.expiresAt);
  if (!expiresAtParsed.ok) {
    return {
      valid: false,
      value: null,
      error: 'INVALID_EXPIRY_TIMESTAMP',
      field: 'expiresAt',
      message: 'تاريخ انتهاء الصلاحية غير صالح.'
    };
  }

  const startsAt = startsAtParsed.value;
  const expiresAt = expiresAtParsed.value;
  if (startsAt !== null && expiresAt !== null && startsAt >= expiresAt) {
    return {
      valid: false,
      value: null,
      error: 'EXPIRY_MUST_BE_AFTER_START',
      field: 'expiresAt',
      message: 'تاريخ انتهاء الصلاحية يجب أن يكون بعد تاريخ البداية.'
    };
  }

  // 8. Activation state
  let isActive = true;
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') {
      return {
        valid: false,
        value: null,
        error: 'INVALID_ACTIVE_STATE',
        field: 'isActive',
        message: 'حالة تفعيل الكوبون يجب أن تكون قيمة منطقية (مفعل أو معطل).'
      };
    }
    isActive = input.isActive;
  }

  return {
    valid: true,
    value: {
      code: codeCheck.normalizedCode,
      discountType,
      discountValue,
      scope,
      categorySlug,
      minimumSubtotal: minSubParsed.value,
      maximumDiscount,
      startsAt,
      expiresAt,
      isActive
    }
  };
}

/**
 * Derives display/runtime coupon status without storing a duplicated time-dependent status field.
 * Boundaries:
 * - startsAt !== null && now < startsAt -> 'scheduled' (active precisely at startsAt)
 * - expiresAt !== null && now >= expiresAt -> 'expired' (expires precisely at expiresAt)
 */
export function getCouponStatus(
  coupon: Partial<Pick<CouponConfig, 'isActive' | 'startsAt' | 'expiresAt'>> | null | undefined,
  now: number = Date.now()
): CouponStatus {
  if (!coupon || coupon.isActive !== true) {
    return 'disabled';
  }

  const nowMs = Number.isFinite(now) ? now : Date.now();
  if (typeof coupon.startsAt === 'number' && Number.isFinite(coupon.startsAt) && nowMs < coupon.startsAt) {
    return 'scheduled';
  }
  if (typeof coupon.expiresAt === 'number' && Number.isFinite(coupon.expiresAt) && nowMs >= coupon.expiresAt) {
    return 'expired';
  }

  return 'active';
}

function lookupProductForLine(
  item: CouponOrderItemInput,
  productsMap?: Record<string, { id?: string; category?: string | null }> | Map<string, { id?: string; category?: string | null }>
): { id?: string | null; category?: string | null } | null {
  const pid = String(item.productId || item.id || item.product?.id || '').trim();
  if (productsMap) {
    const fromMap =
      productsMap instanceof Map ? productsMap.get(pid) : productsMap[pid];
    if (fromMap && typeof fromMap === 'object') {
      return {
        id: fromMap.id ?? pid,
        category: fromMap.category ?? null
      };
    }
  }

  // Never trust browser-supplied categorySlug; resolve strictly via product id + source category.
  if (item.product && typeof item.product === 'object') {
    return {
      id: item.product.id ?? pid,
      category: item.product.category ?? null
    };
  }

  return {
    id: pid,
    category: item.category ?? null
  };
}

function resolveTrustedLineSubtotal(item: CouponOrderItemInput): { quantity: number; lineSubtotal: number } {
  const rawQty = parseFiniteMonetaryNumber(item.quantity ?? item.qty ?? 1);
  const quantity = rawQty !== null && rawQty > 0 ? Math.floor(rawQty) : 0;
  if (quantity <= 0) {
    return { quantity: 0, lineSubtotal: 0 };
  }

  if (item.lineTotal !== undefined && item.lineTotal !== null) {
    const explicitTotal = parseFiniteMonetaryNumber(item.lineTotal);
    if (explicitTotal !== null && explicitTotal > 0) {
      return { quantity, lineSubtotal: roundCurrency(explicitTotal) };
    }
    return { quantity, lineSubtotal: 0 };
  }

  const unitPrice = parseFiniteMonetaryNumber(
    item.unitPrice ?? item.finalPrice ?? item.price ?? 0
  );
  if (unitPrice === null || unitPrice <= 0) {
    return { quantity, lineSubtotal: 0 };
  }

  return {
    quantity,
    lineSubtotal: roundCurrency(unitPrice * quantity)
  };
}

function isPinkFridayLine(item: CouponOrderItemInput): boolean {
  return Boolean(
    item.isPinkFriday === true ||
    item.isPinkFridayOffer === true ||
    item.isCollection === true ||
    item.type === 'collection' ||
    (typeof item.collectionId === 'string' && item.collectionId.trim() !== '')
  );
}

/**
 * Pure helper (ready for GROUP 2A.6) that partitions order items into eligible vs ineligible lines
 * using trusted product pricing and strict non-fallback category classification.
 */
export function resolveCouponEligibleProducts(
  coupon: Pick<CouponConfig, 'scope' | 'categorySlug'>,
  items: CouponOrderItemInput[] = [],
  options?: {
    productsMap?:
      | Record<string, { id?: string; category?: string | null }>
      | Map<string, { id?: string; category?: string | null }>;
  }
): CouponEligibilityResolution {
  const eligibleItems: ResolvedCouponOrderLine[] = [];
  const ineligibleItems: ResolvedCouponOrderLine[] = [];
  let eligibleSubtotal = 0;
  let ineligibleSubtotal = 0;
  let orderProductSubtotal = 0;
  let hasPinkFridayItem = false;

  const safeItems = Array.isArray(items) ? items : [];
  for (const item of safeItems) {
    if (!item || typeof item !== 'object') continue;
    const productForCategory = lookupProductForLine(item, options?.productsMap);
    const productId = String(productForCategory?.id || item.productId || item.id || '').trim();
    const resolvedCategorySlug = getStrictCategorySlugForProduct(productForCategory);
    const { quantity, lineSubtotal } = resolveTrustedLineSubtotal(item);
    const pinkFridayItem = isPinkFridayLine(item);
    if (pinkFridayItem) {
      hasPinkFridayItem = true;
    }

    orderProductSubtotal = roundCurrency(orderProductSubtotal + lineSubtotal);

    const matchesScope =
      lineSubtotal > 0 &&
      (coupon.scope === 'all' ||
        (coupon.scope === 'category' &&
          Boolean(coupon.categorySlug) &&
          resolvedCategorySlug === coupon.categorySlug));

    const lineRecord: ResolvedCouponOrderLine = {
      productId,
      categorySlug: resolvedCategorySlug,
      quantity,
      lineSubtotal,
      isPinkFridayItem: pinkFridayItem,
      eligible: matchesScope,
      item
    };

    if (matchesScope) {
      eligibleItems.push(lineRecord);
      eligibleSubtotal = roundCurrency(eligibleSubtotal + lineSubtotal);
    } else {
      ineligibleItems.push(lineRecord);
      ineligibleSubtotal = roundCurrency(ineligibleSubtotal + lineSubtotal);
    }
  }

  return {
    eligibleItems,
    ineligibleItems,
    eligibleSubtotal,
    ineligibleSubtotal,
    orderProductSubtotal,
    hasPinkFridayItem
  };
}

/**
 * Pure discount calculation helper on eligible product subtotal only (never shipping).
 */
export function calculateCouponDiscount(
  coupon: Pick<CouponConfig, 'discountType' | 'discountValue' | 'maximumDiscount'> | null | undefined,
  eligibleSubtotal: number
): number {
  if (!coupon || !Number.isFinite(eligibleSubtotal) || eligibleSubtotal <= 0) {
    return 0;
  }

  const safeEligibleSubtotal = roundCurrency(eligibleSubtotal);
  if (safeEligibleSubtotal <= 0) {
    return 0;
  }

  if (coupon.discountType === 'percentage') {
    const pct = Number(coupon.discountValue);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return 0;
    }
    let discount = roundCurrency((safeEligibleSubtotal * pct) / 100);
    if (
      typeof coupon.maximumDiscount === 'number' &&
      Number.isFinite(coupon.maximumDiscount) &&
      coupon.maximumDiscount > 0
    ) {
      discount = Math.min(discount, roundCurrency(coupon.maximumDiscount));
    }
    return roundCurrency(Math.max(0, Math.min(discount, safeEligibleSubtotal)));
  }

  if (coupon.discountType === 'fixed') {
    const fixed = Number(coupon.discountValue);
    if (!Number.isFinite(fixed) || fixed <= 0) {
      return 0;
    }
    return roundCurrency(Math.max(0, Math.min(roundCurrency(fixed), safeEligibleSubtotal)));
  }

  return 0;
}

/**
 * Full pure eligibility evaluation ready for GROUP 2A.6 checkout integration.
 */
export function evaluateCouponEligibility(params: {
  coupon: CouponConfig | null | undefined;
  items?: CouponOrderItemInput[];
  hasPinkFridayInOrder?: boolean;
  productsMap?:
    | Record<string, { id?: string; category?: string | null }>
    | Map<string, { id?: string; category?: string | null }>;
  now?: number;
}): CouponEligibilityEvaluation {
  const { coupon, items = [], hasPinkFridayInOrder = false, productsMap, now = Date.now() } = params || {};

  if (!coupon) {
    return {
      eligible: false,
      reason: 'COUPON_NOT_FOUND',
      status: null,
      discountAmount: 0,
      eligibleSubtotal: 0,
      orderProductSubtotal: 0,
      discountedProductSubtotal: 0,
      eligibleItems: [],
      ineligibleItems: []
    };
  }

  const resolution = resolveCouponEligibleProducts(coupon, items, { productsMap });
  const status = getCouponStatus(coupon, now);

  const reject = (reason: CouponEligibilityEvaluation['reason']): CouponEligibilityEvaluation => ({
    eligible: false,
    reason,
    status,
    discountAmount: 0,
    eligibleSubtotal: resolution.eligibleSubtotal,
    orderProductSubtotal: resolution.orderProductSubtotal,
    discountedProductSubtotal: resolution.orderProductSubtotal,
    eligibleItems: resolution.eligibleItems,
    ineligibleItems: resolution.ineligibleItems
  });

  if (status === 'disabled') return reject('COUPON_DISABLED');
  if (status === 'scheduled') return reject('COUPON_NOT_STARTED');
  if (status === 'expired') return reject('COUPON_EXPIRED');

  if (hasPinkFridayInOrder === true || resolution.hasPinkFridayItem) {
    return reject('PINK_FRIDAY_NOT_COMBINABLE');
  }

  if (resolution.eligibleSubtotal <= 0) {
    return reject(
      coupon.scope === 'category' ? 'NO_ELIGIBLE_CATEGORY_ITEMS' : 'EMPTY_ELIGIBLE_SUBTOTAL'
    );
  }

  if (
    typeof coupon.minimumSubtotal === 'number' &&
    Number.isFinite(coupon.minimumSubtotal) &&
    resolution.eligibleSubtotal < coupon.minimumSubtotal
  ) {
    return reject('MINIMUM_SUBTOTAL_NOT_MET');
  }

  const discountAmount = calculateCouponDiscount(coupon, resolution.eligibleSubtotal);
  const discountedProductSubtotal = roundCurrency(
    Math.max(0, resolution.orderProductSubtotal - discountAmount)
  );

  return {
    eligible: true,
    reason: 'APPLIED',
    status,
    discountAmount,
    eligibleSubtotal: resolution.eligibleSubtotal,
    orderProductSubtotal: resolution.orderProductSubtotal,
    discountedProductSubtotal,
    eligibleItems: resolution.eligibleItems,
    ineligibleItems: resolution.ineligibleItems
  };
}
