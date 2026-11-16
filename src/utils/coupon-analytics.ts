// src/utils/coupon-analytics.ts
// Pure, Deterministic Coupon Analytics Aggregation & CSV Export Utility (GROUP 2A.7)
// Reads historical persisted order coupon snapshots + sanitized current coupon definitions.
// Zero Firebase runtime dependencies. Zero writes. Zero customer PII exposure.

import {
  CATEGORY_TAXONOMY,
  getCouponCategoryOptions,
  isValidCanonicalCategorySlug
} from './categories.ts';
import {
  getCouponStatus,
  normalizeCouponCode,
  roundCurrency,
  validateCouponDefinition,
  type CouponConfig,
  type CouponDiscountType,
  type CouponScope,
  type CouponStatus
} from './coupons.ts';
import { normalizeEgyptianPhone } from './phone.ts';

export const CAIRO_TIMEZONE = 'Africa/Cairo';
export const MAX_RECENT_USES = 50;
export const LINE_RECONCILIATION_TOLERANCE = 0.05;

export const ANALYTICS_ORDER_STATUSES = [
  'new',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'unknown'
] as const;

export type AnalyticsOrderStatus = (typeof ANALYTICS_ORDER_STATUSES)[number];

export const VALID_ANALYTICS_PERIODS = [
  'today',
  '7d',
  '30d',
  '90d',
  'this_month',
  'prev_month',
  'all',
  'custom'
] as const;

export type AnalyticsPeriod = (typeof VALID_ANALYTICS_PERIODS)[number];

export const VALID_CSV_DATASETS = ['coupons', 'uses', 'products', 'categories'] as const;
export type AnalyticsCsvDataset = (typeof VALID_CSV_DATASETS)[number];

export interface AnalyticsFilterInput {
  period?: unknown;
  from?: unknown;
  to?: unknown;
  couponId?: unknown;
  categorySlug?: unknown;
  status?: unknown;
  scope?: unknown;
  discountType?: unknown;
}

export interface ValidatedAnalyticsFilters {
  period: AnalyticsPeriod;
  from: string | null;
  to: string | null;
  couponId: string | null;
  categorySlug: string | null;
  status: AnalyticsOrderStatus | null;
  scope: CouponScope | null;
  discountType: CouponDiscountType | null;
}

export interface CairoPeriodWindow {
  period: AnalyticsPeriod;
  from: string | null;
  to: string | null;
  dayCount: number | null;
  previousFrom: string | null;
  previousTo: string | null;
  comparisonAvailable: boolean;
}

export interface OrderTimestampResolution {
  timestampMs: number | null;
  cairoDateKey: string | null;
  usedAppliedAtFallback: boolean;
  timestampMissing: boolean;
}

export interface ValidatedEligibleProductLine {
  productId: string;
  categorySlug: string | null;
  quantity: number;
  lineSubtotal: number;
}

export interface ValidatedCouponSnapshot {
  valid: boolean;
  reason?: string;
  groupKey: string;
  couponId: string | null;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  scope: CouponScope;
  categorySlug: string | null;
  minimumSubtotal: number | null;
  maximumDiscount: number | null;
  eligibleSubtotal: number;
  discountAmount: number;
  appliedAt: number | null;
  eligibleProductLines: ValidatedEligibleProductLine[];
  lineAllocationIncomplete: boolean;
}

export interface SanitizedCurrentCouponDefinition {
  id: string;
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
  status: CouponStatus;
}

export interface CouponHistoricalConfigVariant {
  configKey: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  scope: CouponScope;
  categorySlug: string | null;
  minimumSubtotal: number | null;
  maximumDiscount: number | null;
  couponOrders: number;
  eligibleSubtotal: number;
  discountAmount: number;
  eligibleNetSales: number;
}

export interface CouponPerformanceSummary {
  groupKey: string;
  couponId: string | null;
  currentCode: string;
  historicalCodes: string[];
  historicalConfigs: CouponHistoricalConfigVariant[];
  hasCurrentDefinition: boolean;
  currentDefinition: SanitizedCurrentCouponDefinition | null;
  currentStatus: CouponStatus | 'unavailable';
  couponOrders: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  repeatCustomerRatePct: number;
  avgOrdersPerCustomer: number;
  eligibleSubtotal: number;
  discountAmount: number;
  eligibleNetSales: number;
  associatedFinalOrderValue: number;
  avgDiscountPerOrder: number;
  avgEligibleSubtotalPerOrder: number;
  avgFinalOrderValue: number;
  effectiveDiscountRatePct: number;
  deliveredOrders: number;
  deliveredOrderValue: number;
  pipelineOrders: number;
  pipelineValue: number;
  cancelledOrders: number;
  cancelledOrderValue: number;
  unknownStatusOrders: number;
  unknownStatusValue: number;
  allTimeOrders: number;
  allTimeDiscountAmount: number;
  allTimeEligibleSubtotal: number;
  allTimeHistoricalCodes: string[];
  categoryBreakdown: CategoryBreakdownRow[];
  productBreakdown: ProductBreakdownRow[];
  trend: TrendBucketRow[];
  recentUses: RecentCouponUseRow[];
}

export interface CategoryBreakdownRow {
  categorySlug: string;
  arabicName: string;
  eligibleQuantity: number;
  eligibleSubtotal: number;
  couponOrders: number;
  uniqueCustomers: number;
  sharePct: number;
}

export interface ProductBreakdownRow {
  productId: string;
  productName: string;
  categorySlug: string;
  categoryArabicName: string;
  eligibleQuantity: number;
  eligibleSubtotal: number;
  couponOrders: number;
  uniqueCustomers: number;
  hasMissingHistoricalName: boolean;
}

export interface StatusBreakdownRow {
  status: AnalyticsOrderStatus;
  arabicLabel: string;
  orders: number;
  orderValue: number;
  discountAmount: number;
  sharePct: number;
}

export interface TrendBucketRow {
  bucketKey: string;
  label: string;
  granularity: 'daily' | 'weekly' | 'monthly';
  couponOrders: number;
  uniqueCustomers: number;
  eligibleSubtotal: number;
  discountAmount: number;
  eligibleNetSales: number;
}

export interface RecentCouponUseRow {
  invoiceCode: string;
  timestampMs: number | null;
  cairoDateKey: string | null;
  cairoDateTime: string;
  groupKey: string;
  couponId: string | null;
  couponCode: string;
  discountType: CouponDiscountType;
  discountValue: number;
  scope: CouponScope;
  categorySlug: string | null;
  eligibleSubtotal: number;
  discountAmount: number;
  totalAmount: number;
  status: AnalyticsOrderStatus;
  lineAllocationIncomplete: boolean;
}

export interface PeriodComparisonMetric {
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
}

export interface AnalyticsComparisonResult {
  available: boolean;
  previousFrom: string | null;
  previousTo: string | null;
  metrics: {
    couponOrders: PeriodComparisonMetric;
    uniqueCustomers: PeriodComparisonMetric;
    eligibleSubtotal: PeriodComparisonMetric;
    discountAmount: PeriodComparisonMetric;
    eligibleNetSales: PeriodComparisonMetric;
    deliveredOrders: PeriodComparisonMetric;
  } | null;
}

export interface AnalyticsDataQuality {
  ordersScanned: number;
  ordersWithoutCoupon: number;
  couponOrdersIncluded: number;
  invalidCouponSnapshots: number;
  invalidCurrentCoupons: number;
  missingCustomerIdentities: number;
  missingTimestamps: number;
  appliedAtFallbacks: number;
  snapshotLineMismatches: number;
  unknownOrderStatuses: number;
  missingHistoricalProductNames: number;
}

export interface AnalyticsSummary {
  couponOrders: number;
  uniqueCustomers: number;
  repeatCustomers: number;
  repeatCustomerRatePct: number;
  avgOrdersPerCustomer: number;
  activeCouponsUsedCount: number;
  eligibleSubtotal: number;
  discountAmount: number;
  eligibleNetSales: number;
  associatedFinalOrderValue: number;
  avgDiscountPerOrder: number;
  avgEligibleSubtotalPerOrder: number;
  avgFinalOrderValue: number;
  effectiveDiscountRatePct: number;
  deliveredOrders: number;
  deliveredOrderValue: number;
  deliveredOrderRatePct: number;
  pipelineOrders: number;
  pipelineValue: number;
  cancelledOrders: number;
  cancelledOrderValue: number;
  cancelledOrderRatePct: number;
  unknownStatusOrders: number;
  unknownStatusValue: number;
}

export interface CouponAnalyticsReport {
  success: true;
  timezone: typeof CAIRO_TIMEZONE;
  generatedAt: number;
  generatedAtCairo: string;
  filters: ValidatedAnalyticsFilters;
  window: CairoPeriodWindow;
  summary: AnalyticsSummary;
  comparison: AnalyticsComparisonResult;
  coupons: CouponPerformanceSummary[];
  categoryBreakdown: CategoryBreakdownRow[];
  productBreakdown: ProductBreakdownRow[];
  statusBreakdown: StatusBreakdownRow[];
  trend: TrendBucketRow[];
  recentUses: RecentCouponUseRow[];
  categories: Array<{ slug: string; name: string; arabicName: string }>;
  dataQuality: AnalyticsDataQuality;
}

const STATUS_LABELS_AR: Record<AnalyticsOrderStatus, string> = {
  new: 'جديد',
  processing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
  unknown: 'غير محدد / أخرى'
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function parseFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseTimestampMsValue(raw: unknown): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0 || raw > 253402300799999) return null;
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      return Number.isFinite(n) && n > 0 && n <= 253402300799999 ? n : null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 253402300799999 ? parsed : null;
  }
  return null;
}

/**
 * Analytics-specific strict order status normalizer.
 * NEVER defaults unrecognized statuses to "new".
 */
export function normalizeAnalyticsOrderStatus(rawStatus: unknown): AnalyticsOrderStatus {
  if (typeof rawStatus !== 'string') return 'unknown';
  const trimmed = rawStatus.trim();
  if (!trimmed) return 'unknown';
  const lower = trimmed.toLowerCase();

  if (trimmed === 'جديد' || lower === 'new') return 'new';
  if (trimmed === 'قيد التجهيز' || trimmed === 'تم التواصل' || lower === 'processing') {
    return 'processing';
  }
  if (trimmed === 'تم الشحن' || trimmed === 'جاري الشحن' || lower === 'shipped') {
    return 'shipped';
  }
  if (
    trimmed === 'تم التوصيل' ||
    trimmed === 'مكتمل' ||
    lower === 'delivered' ||
    lower === 'completed'
  ) {
    return 'delivered';
  }
  if (trimmed === 'ملغي' || lower === 'cancelled' || lower === 'canceled') {
    return 'cancelled';
  }

  return 'unknown';
}

export function isPipelineStatus(status: AnalyticsOrderStatus): boolean {
  return status === 'new' || status === 'processing' || status === 'shipped';
}

/**
 * Formats UTC epoch ms into YYYY-MM-DD in Africa/Cairo timezone.
 */
export function getCairoDateKey(utcMs: number): string | null {
  if (typeof utcMs !== 'number' || !Number.isFinite(utcMs)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: CAIRO_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date(utcMs));
    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') map[part.type] = part.value;
    }
    if (!map.year || !map.month || !map.day) return null;
    return `${map.year}-${map.month}-${map.day}`;
  } catch {
    return null;
  }
}

export function formatCairoDateTimeLabel(utcMs: number | null | undefined): string {
  if (typeof utcMs !== 'number' || !Number.isFinite(utcMs)) return 'غير متاح';
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      timeZone: CAIRO_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(new Date(utcMs));
  } catch {
    return new Date(utcMs).toISOString();
  }
}

export function parseStrictDateKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
}

export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = String(dt.getUTCFullYear()).padStart(4, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function countInclusiveCalendarDays(fromKey: string, toKey: string): number {
  const [y1, m1, d1] = fromKey.split('-').map(Number);
  const [y2, m2, d2] = toKey.split('-').map(Number);
  const startUtc = Date.UTC(y1, m1 - 1, d1);
  const endUtc = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((endUtc - startUtc) / 86400000) + 1;
}

export function getMonthWeekBucketStart(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  // Week starts Saturday (Egypt business week): Saturday=6 -> offset 0, Sunday=0 -> 1, ..., Friday=5 -> 6
  const dow = utcDate.getUTCDay();
  const diffToSaturday = (dow + 1) % 7;
  return addDaysToDateKey(dateKey, -diffToSaturday);
}

/**
 * Validates and normalizes analytics query filters. Rejects malformed inputs safely.
 */
export function parseAnalyticsFilters(
  rawInput: AnalyticsFilterInput = {},
  nowMs: number = Date.now()
): { valid: true; filters: ValidatedAnalyticsFilters; window: CairoPeriodWindow } | { valid: false; error: string; message: string } {
  const input = isPlainObject(rawInput) ? rawInput : {};

  // 1. Period
  let period: AnalyticsPeriod = 'all';
  if (input.period !== undefined && input.period !== null && String(input.period).trim() !== '') {
    const rawPeriod = String(input.period).trim();
    if (!(VALID_ANALYTICS_PERIODS as readonly string[]).includes(rawPeriod)) {
      return {
        valid: false,
        error: 'INVALID_PERIOD',
        message: 'الفترة الزمنية المطلوبة غير مدعومة.'
      };
    }
    period = rawPeriod as AnalyticsPeriod;
  } else if (
    (input.from !== undefined && input.from !== null && String(input.from).trim() !== '') ||
    (input.to !== undefined && input.to !== null && String(input.to).trim() !== '')
  ) {
    period = 'custom';
  }

  // 2. Custom dates
  let customFrom: string | null = null;
  let customTo: string | null = null;
  const rawFromStr = input.from !== undefined && input.from !== null ? String(input.from).trim() : '';
  const rawToStr = input.to !== undefined && input.to !== null ? String(input.to).trim() : '';

  if (period === 'custom') {
    customFrom = parseStrictDateKey(rawFromStr);
    customTo = parseStrictDateKey(rawToStr);
    if (!customFrom || !customTo) {
      return {
        valid: false,
        error: 'INVALID_DATE_RANGE',
        message: 'يرجى تحديد تاريخ البداية والنهاية بصيغة صحيحة (YYYY-MM-DD).'
      };
    }
    if (customFrom > customTo) {
      return {
        valid: false,
        error: 'INVALID_DATE_ORDER',
        message: 'تاريخ البداية يجب أن يكون قبل أو مساوياً لتاريخ النهاية.'
      };
    }
  } else if (rawFromStr || rawToStr) {
    // Reject dangling malformed dates even if another period was passed
    if ((rawFromStr && !parseStrictDateKey(rawFromStr)) || (rawToStr && !parseStrictDateKey(rawToStr))) {
      return {
        valid: false,
        error: 'INVALID_DATE_FORMAT',
        message: 'صيغة التاريخ غير صالحة. يجب أن تكون YYYY-MM-DD.'
      };
    }
  }

  // 3. couponId
  let couponId: string | null = null;
  if (input.couponId !== undefined && input.couponId !== null && String(input.couponId).trim() !== '') {
    const cid = String(input.couponId).trim();
    if (cid !== 'all') {
      if (cid.length > 140 || /[\u0000-\u001F\u007F]/.test(cid)) {
        return {
          valid: false,
          error: 'INVALID_COUPON_FILTER',
          message: 'معرّف الكوبون المحدد غير صالح.'
        };
      }
      couponId = cid;
    }
  }

  // 4. categorySlug
  let categorySlug: string | null = null;
  if (
    input.categorySlug !== undefined &&
    input.categorySlug !== null &&
    String(input.categorySlug).trim() !== ''
  ) {
    const rawCat = String(input.categorySlug).trim().toLowerCase();
    if (rawCat !== 'all') {
      if (rawCat !== 'unknown' && !isValidCanonicalCategorySlug(rawCat)) {
        return {
          valid: false,
          error: 'INVALID_CATEGORY_FILTER',
          message: 'القسم المحدد في التصفية غير مدعوم.'
        };
      }
      categorySlug = rawCat;
    }
  }

  // 5. status
  let status: AnalyticsOrderStatus | null = null;
  if (input.status !== undefined && input.status !== null && String(input.status).trim() !== '') {
    const rawStatus = String(input.status).trim().toLowerCase();
    if (rawStatus !== 'all') {
      if (!(ANALYTICS_ORDER_STATUSES as readonly string[]).includes(rawStatus)) {
        return {
          valid: false,
          error: 'INVALID_STATUS_FILTER',
          message: 'حالة الطلب المحددة في التصفية غير صالحة.'
        };
      }
      status = rawStatus as AnalyticsOrderStatus;
    }
  }

  // 6. scope
  let scope: CouponScope | null = null;
  if (input.scope !== undefined && input.scope !== null && String(input.scope).trim() !== '') {
    const rawScope = String(input.scope).trim().toLowerCase();
    if (rawScope !== 'all_scopes' && rawScope !== 'any') {
      if (rawScope !== 'all' && rawScope !== 'category') {
        return {
          valid: false,
          error: 'INVALID_SCOPE_FILTER',
          message: 'نطاق الكوبون المحدد في التصفية غير صالح.'
        };
      }
      scope = rawScope as CouponScope;
    }
  }

  // 7. discountType
  let discountType: CouponDiscountType | null = null;
  if (
    input.discountType !== undefined &&
    input.discountType !== null &&
    String(input.discountType).trim() !== ''
  ) {
    const rawType = String(input.discountType).trim().toLowerCase();
    if (rawType !== 'all') {
      if (rawType !== 'percentage' && rawType !== 'fixed') {
        return {
          valid: false,
          error: 'INVALID_DISCOUNT_TYPE_FILTER',
          message: 'نوع الخصم المحدد في التصفية غير صالح.'
        };
      }
      discountType = rawType as CouponDiscountType;
    }
  }

  const filters: ValidatedAnalyticsFilters = {
    period,
    from: customFrom,
    to: customTo,
    couponId,
    categorySlug,
    status,
    scope,
    discountType
  };

  const window = resolveCairoPeriodWindow(filters, nowMs);
  filters.from = window.from;
  filters.to = window.to;

  return { valid: true, filters, window };
}

export function resolveCairoPeriodWindow(
  filters: Pick<ValidatedAnalyticsFilters, 'period' | 'from' | 'to'>,
  nowMs: number = Date.now()
): CairoPeriodWindow {
  const todayKey = getCairoDateKey(nowMs) || getCairoDateKey(Date.now()) || '1970-01-01';
  const { period } = filters;

  if (period === 'all') {
    return {
      period: 'all',
      from: null,
      to: null,
      dayCount: null,
      previousFrom: null,
      previousTo: null,
      comparisonAvailable: false
    };
  }

  let fromKey: string;
  let toKey: string;

  if (period === 'today') {
    fromKey = todayKey;
    toKey = todayKey;
  } else if (period === '7d') {
    fromKey = addDaysToDateKey(todayKey, -6);
    toKey = todayKey;
  } else if (period === '30d') {
    fromKey = addDaysToDateKey(todayKey, -29);
    toKey = todayKey;
  } else if (period === '90d') {
    fromKey = addDaysToDateKey(todayKey, -89);
    toKey = todayKey;
  } else if (period === 'this_month') {
    fromKey = `${todayKey.slice(0, 8)}01`;
    toKey = todayKey;
  } else if (period === 'prev_month') {
    const [y, m] = todayKey.split('-').map(Number);
    const prevLastDay = new Date(Date.UTC(y, m - 1, 0));
    const py = String(prevLastDay.getUTCFullYear()).padStart(4, '0');
    const pm = String(prevLastDay.getUTCMonth() + 1).padStart(2, '0');
    const pd = String(prevLastDay.getUTCDate()).padStart(2, '0');
    fromKey = `${py}-${pm}-01`;
    toKey = `${py}-${pm}-${pd}`;
  } else {
    // custom
    fromKey = filters.from || todayKey;
    toKey = filters.to || todayKey;
  }

  const dayCount = countInclusiveCalendarDays(fromKey, toKey);
  const previousTo = addDaysToDateKey(fromKey, -1);
  const previousFrom = addDaysToDateKey(fromKey, -dayCount);

  return {
    period,
    from: fromKey,
    to: toKey,
    dayCount,
    previousFrom,
    previousTo,
    comparisonAvailable: true
  };
}

/**
 * Resolves the order reporting timestamp strictly in Africa/Cairo timezone.
 * Primary: order.timestamp; Fallback: order.coupon.appliedAt.
 */
export function resolveOrderTimestampInfo(order: Record<string, unknown>): OrderTimestampResolution {
  const primaryTs = parseTimestampMsValue(order?.timestamp);
  if (primaryTs !== null) {
    return {
      timestampMs: primaryTs,
      cairoDateKey: getCairoDateKey(primaryTs),
      usedAppliedAtFallback: false,
      timestampMissing: false
    };
  }

  const couponObj = isPlainObject(order?.coupon) ? order.coupon : null;
  const fallbackTs = couponObj ? parseTimestampMsValue(couponObj.appliedAt) : null;
  if (fallbackTs !== null) {
    return {
      timestampMs: fallbackTs,
      cairoDateKey: getCairoDateKey(fallbackTs),
      usedAppliedAtFallback: true,
      timestampMissing: false
    };
  }

  return {
    timestampMs: null,
    cairoDateKey: null,
    usedAppliedAtFallback: false,
    timestampMissing: true
  };
}

/**
 * Ephemeral in-memory customer identity deduplication key.
 * NEVER stored, logged, or returned in any response or CSV.
 */
export function extractEphemeralCustomerKey(order: Record<string, unknown>): string | null {
  const normalizedPhone = normalizeEgyptianPhone(order?.phone);
  if (normalizedPhone) {
    return `phone:${normalizedPhone}`;
  }
  if (typeof order?.customerId === 'string') {
    const cleanCid = order.customerId.trim();
    if (cleanCid.length > 0 && cleanCid.length <= 160) {
      return `uid:${cleanCid}`;
    }
  }
  return null;
}

export function buildStableCouponGroupKey(params: {
  couponId?: unknown;
  normalizedCode: string;
}): { groupKey: string; couponId: string | null } {
  if (typeof params.couponId === 'string') {
    const cleanId = params.couponId.trim();
    if (cleanId.length > 0 && cleanId.length <= 128) {
      return { groupKey: `id:${cleanId}`, couponId: cleanId };
    }
  }
  return { groupKey: `code:${params.normalizedCode}`, couponId: null };
}

/**
 * Strictly validates an order's persisted coupon snapshot without rewriting historical discounts.
 */
export function validateOrderCouponSnapshot(rawSnapshot: unknown): ValidatedCouponSnapshot | null {
  if (!isPlainObject(rawSnapshot)) return null;

  const code = normalizeCouponCode(rawSnapshot.code);
  if (!code) return null;

  // Reject explicitly non-string malformed ID if present (e.g., object/boolean)
  if (
    rawSnapshot.id !== undefined &&
    rawSnapshot.id !== null &&
    typeof rawSnapshot.id !== 'string'
  ) {
    return null;
  }

  const { groupKey, couponId } = buildStableCouponGroupKey({
    couponId: rawSnapshot.id,
    normalizedCode: code
  });

  const discountType = rawSnapshot.discountType;
  if (discountType !== 'percentage' && discountType !== 'fixed') {
    return null;
  }

  const rawDiscountVal = parseFiniteNumber(rawSnapshot.discountValue);
  if (rawDiscountVal === null || rawDiscountVal <= 0) {
    return null;
  }
  const discountValue = roundCurrency(rawDiscountVal);
  if (discountValue <= 0 || (discountType === 'percentage' && discountValue > 100)) {
    return null;
  }

  const scope = rawSnapshot.scope;
  if (scope !== 'all' && scope !== 'category') {
    return null;
  }

  let categorySlug: string | null = null;
  if (scope === 'category') {
    if (typeof rawSnapshot.categorySlug !== 'string' || !rawSnapshot.categorySlug.trim()) {
      return null;
    }
    const normalizedCatSlug = rawSnapshot.categorySlug.trim().toLowerCase();
    if (!isValidCanonicalCategorySlug(normalizedCatSlug)) {
      return null;
    }
    categorySlug = normalizedCatSlug;
  } else if (rawSnapshot.categorySlug !== undefined && rawSnapshot.categorySlug !== null) {
    return null;
  }

  const rawEligibleSubtotal = parseFiniteNumber(rawSnapshot.eligibleSubtotal);
  if (rawEligibleSubtotal === null || rawEligibleSubtotal <= 0) {
    return null;
  }
  const eligibleSubtotal = roundCurrency(rawEligibleSubtotal);
  if (eligibleSubtotal <= 0) {
    return null;
  }

  const rawDiscountAmount = parseFiniteNumber(rawSnapshot.discountAmount);
  if (rawDiscountAmount === null || rawDiscountAmount < 0) {
    return null;
  }
  const discountAmount = roundCurrency(rawDiscountAmount);
  if (discountAmount < 0 || discountAmount > eligibleSubtotal) {
    return null;
  }

  let minimumSubtotal: number | null = null;
  if (rawSnapshot.minimumSubtotal !== undefined && rawSnapshot.minimumSubtotal !== null) {
    const minSub = parseFiniteNumber(rawSnapshot.minimumSubtotal);
    if (minSub === null || minSub <= 0) return null;
    minimumSubtotal = roundCurrency(minSub);
  }

  let maximumDiscount: number | null = null;
  if (rawSnapshot.maximumDiscount !== undefined && rawSnapshot.maximumDiscount !== null) {
    if (discountType === 'fixed') {
      return null;
    }
    const maxDisc = parseFiniteNumber(rawSnapshot.maximumDiscount);
    if (maxDisc === null || maxDisc <= 0) return null;
    maximumDiscount = roundCurrency(maxDisc);
  }

  const appliedAt = parseTimestampMsValue(rawSnapshot.appliedAt);

  // Validate eligibleProductLines gently: if top-level snapshot is valid but lines are malformed
  // or fail to reconcile, preserve top-level summary totals and mark allocation incomplete.
  const rawLines = rawSnapshot.eligibleProductLines;
  const parsedLines: ValidatedEligibleProductLine[] = [];
  let lineAllocationIncomplete = false;
  let linesSubtotalSum = 0;

  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    lineAllocationIncomplete = true;
  } else {
    for (const rawLine of rawLines) {
      if (!isPlainObject(rawLine)) {
        lineAllocationIncomplete = true;
        continue;
      }
      const productId =
        typeof rawLine.productId === 'string' && rawLine.productId.trim()
          ? rawLine.productId.trim()
          : '';
      const qtyNum = parseFiniteNumber(rawLine.quantity);
      const lineSubNum = parseFiniteNumber(rawLine.lineSubtotal);

      if (
        !productId ||
        qtyNum === null ||
        !Number.isInteger(qtyNum) ||
        qtyNum <= 0 ||
        lineSubNum === null ||
        lineSubNum <= 0
      ) {
        lineAllocationIncomplete = true;
        continue;
      }

      const lineSubtotal = roundCurrency(lineSubNum);
      if (lineSubtotal <= 0) {
        lineAllocationIncomplete = true;
        continue;
      }

      const lineCatRaw =
        typeof rawLine.categorySlug === 'string' && rawLine.categorySlug.trim()
          ? rawLine.categorySlug.trim().toLowerCase()
          : null;
      const lineCatSlug =
        lineCatRaw && isValidCanonicalCategorySlug(lineCatRaw) ? lineCatRaw : null;

      parsedLines.push({
        productId,
        categorySlug: lineCatSlug,
        quantity: qtyNum,
        lineSubtotal
      });
      linesSubtotalSum = roundCurrency(linesSubtotalSum + lineSubtotal);
    }

    if (
      parsedLines.length === 0 ||
      Math.abs(linesSubtotalSum - eligibleSubtotal) > LINE_RECONCILIATION_TOLERANCE
    ) {
      lineAllocationIncomplete = true;
    }
  }

  return {
    valid: true,
    groupKey,
    couponId,
    code,
    discountType,
    discountValue,
    scope,
    categorySlug,
    minimumSubtotal,
    maximumDiscount,
    eligibleSubtotal,
    discountAmount,
    appliedAt,
    eligibleProductLines: parsedLines,
    lineAllocationIncomplete
  };
}

/**
 * Extracts and strictly validates current coupon definitions from settings/coupons,
 * stripping createdBy / updatedBy / audit metadata.
 */
export function extractSanitizedCurrentCoupons(
  rawCoupons: unknown,
  nowMs: number = Date.now()
): {
  couponsByGroupKey: Map<string, SanitizedCurrentCouponDefinition>;
  invalidCurrentCoupons: number;
} {
  const couponsByGroupKey = new Map<string, SanitizedCurrentCouponDefinition>();
  let invalidCurrentCoupons = 0;

  if (!isPlainObject(rawCoupons)) {
    return { couponsByGroupKey, invalidCurrentCoupons };
  }

  for (const [key, rawEntry] of Object.entries(rawCoupons)) {
    if (!isPlainObject(rawEntry)) {
      invalidCurrentCoupons++;
      continue;
    }

    const strictInput: Record<string, unknown> = {
      code: rawEntry.code,
      discountType: rawEntry.discountType,
      discountValue: rawEntry.discountValue,
      scope: rawEntry.scope,
      categorySlug: rawEntry.categorySlug,
      minimumSubtotal: rawEntry.minimumSubtotal,
      maximumDiscount: rawEntry.maximumDiscount,
      startsAt: rawEntry.startsAt,
      expiresAt: rawEntry.expiresAt,
      isActive: rawEntry.isActive === undefined ? null : rawEntry.isActive
    };

    const validated = validateCouponDefinition(strictInput);
    if (!validated.valid || !validated.value) {
      invalidCurrentCoupons++;
      continue;
    }

    const id =
      typeof rawEntry.id === 'string' && rawEntry.id.trim() ? rawEntry.id.trim() : key;
    if (!id) {
      invalidCurrentCoupons++;
      continue;
    }

    const cfg: CouponConfig = validated.value;
    const status = getCouponStatus(cfg, nowMs);
    const groupKey = `id:${id}`;

    couponsByGroupKey.set(groupKey, {
      id,
      code: cfg.code,
      discountType: cfg.discountType,
      discountValue: cfg.discountValue,
      scope: cfg.scope,
      categorySlug: cfg.categorySlug,
      minimumSubtotal: cfg.minimumSubtotal,
      maximumDiscount: cfg.maximumDiscount,
      startsAt: cfg.startsAt,
      expiresAt: cfg.expiresAt,
      isActive: cfg.isActive,
      status
    });
  }

  return { couponsByGroupKey, invalidCurrentCoupons };
}

function buildHistoricalProductNameLookup(
  rawProducts: unknown
): Map<string, string> {
  const map = new Map<string, string>();
  const items: unknown[] = Array.isArray(rawProducts)
    ? rawProducts
    : isPlainObject(rawProducts)
      ? Object.values(rawProducts)
      : [];

  for (const item of items) {
    if (!isPlainObject(item)) continue;
    const pid =
      typeof item.id === 'string' && item.id.trim()
        ? item.id.trim()
        : typeof item.productId === 'string' && item.productId.trim()
          ? item.productId.trim()
          : '';
    if (!pid) continue;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (name) {
      map.set(pid, name);
    }
  }
  return map;
}

interface ParsedOrderCouponEntry {
  orderKey: string;
  invoiceCode: string;
  snapshot: ValidatedCouponSnapshot;
  status: AnalyticsOrderStatus;
  totalAmount: number;
  timestampMs: number | null;
  cairoDateKey: string | null;
  usedAppliedAtFallback: boolean;
  timestampMissing: boolean;
  ephemeralCustomerKey: string | null;
  productNamesMap: Map<string, string>;
}

function matchesStaticCouponFilters(
  snapshotOrDef: {
    groupKey: string;
    couponId: string | null;
    scope: CouponScope;
    categorySlug: string | null;
    discountType: CouponDiscountType;
    eligibleProductLines?: ValidatedEligibleProductLine[];
    lineAllocationIncomplete?: boolean;
  },
  filters: ValidatedAnalyticsFilters
): boolean {
  if (filters.couponId) {
    const matchesId =
      snapshotOrDef.groupKey === filters.couponId ||
      snapshotOrDef.groupKey === `id:${filters.couponId}` ||
      snapshotOrDef.couponId === filters.couponId;
    if (!matchesId) return false;
  }

  if (filters.scope && snapshotOrDef.scope !== filters.scope) {
    return false;
  }

  if (filters.discountType && snapshotOrDef.discountType !== filters.discountType) {
    return false;
  }

  if (filters.categorySlug) {
    const targetCat = filters.categorySlug;
    if (
      !snapshotOrDef.lineAllocationIncomplete &&
      snapshotOrDef.eligibleProductLines &&
      snapshotOrDef.eligibleProductLines.length > 0
    ) {
      const hasMatchingLine = snapshotOrDef.eligibleProductLines.some(
        (line) => (line.categorySlug || 'unknown') === targetCat
      );
      const topCat =
        snapshotOrDef.scope === 'category'
          ? isValidCanonicalCategorySlug(snapshotOrDef.categorySlug)
            ? snapshotOrDef.categorySlug
            : 'unknown'
          : null;
      if (!hasMatchingLine && topCat !== targetCat) {
        return false;
      }
    } else {
      if (snapshotOrDef.scope !== 'category') return false;
      const topCat = isValidCanonicalCategorySlug(snapshotOrDef.categorySlug)
        ? snapshotOrDef.categorySlug
        : 'unknown';
      if (topCat !== targetCat) return false;
    }
  }

  return true;
}

function matchesOrderFilters(
  entry: ParsedOrderCouponEntry,
  filters: ValidatedAnalyticsFilters,
  dateFrom: string | null,
  dateTo: string | null
): boolean {
  if (dateFrom !== null && dateTo !== null) {
    if (!entry.cairoDateKey) return false;
    if (entry.cairoDateKey < dateFrom || entry.cairoDateKey > dateTo) return false;
  }

  if (filters.status && entry.status !== filters.status) {
    return false;
  }

  return matchesStaticCouponFilters(entry.snapshot, filters);
}

interface MutableCategoryAccum {
  categorySlug: string;
  arabicName: string;
  eligibleQuantity: number;
  eligibleSubtotal: number;
  orderKeys: Set<string>;
  customerKeys: Set<string>;
}

interface MutableProductAccum {
  productId: string;
  productName: string;
  categorySlug: string;
  eligibleQuantity: number;
  eligibleSubtotal: number;
  orderKeys: Set<string>;
  customerKeys: Set<string>;
  hasMissingHistoricalName: boolean;
}

interface MutableTrendAccum {
  bucketKey: string;
  label: string;
  granularity: 'daily' | 'weekly' | 'monthly';
  couponOrders: number;
  customerKeys: Set<string>;
  eligibleSubtotal: number;
  discountAmount: number;
}

interface MutableVariantAccum {
  configKey: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  scope: CouponScope;
  categorySlug: string | null;
  minimumSubtotal: number | null;
  maximumDiscount: number | null;
  couponOrders: number;
  eligibleSubtotal: number;
  discountAmount: number;
}

interface MutableCouponGroupAccum {
  groupKey: string;
  couponId: string | null;
  currentDefinition: SanitizedCurrentCouponDefinition | null;
  historicalCodes: Set<string>;
  variants: Map<string, MutableVariantAccum>;
  entries: ParsedOrderCouponEntry[];
  allTimeOrders: number;
  allTimeDiscountAmount: number;
  allTimeEligibleSubtotal: number;
  allTimeHistoricalCodes: Set<string>;
}

function determineTrendGranularity(
  window: CairoPeriodWindow,
  entries: ParsedOrderCouponEntry[]
): 'daily' | 'weekly' | 'monthly' {
  if (window.dayCount !== null) {
    if (window.dayCount <= 35) return 'daily';
    if (window.dayCount <= 120) return 'weekly';
    return 'monthly';
  }
  const keys = entries
    .map((e) => e.cairoDateKey)
    .filter((k): k is string => Boolean(k))
    .sort();
  if (keys.length >= 2) {
    const span = countInclusiveCalendarDays(keys[0], keys[keys.length - 1]);
    if (span <= 35) return 'daily';
    if (span <= 120) return 'weekly';
  }
  return 'monthly';
}

function buildBreakdownAndTrendForEntries(
  entries: ParsedOrderCouponEntry[],
  window: CairoPeriodWindow,
  recentUsesLimit: number = MAX_RECENT_USES
): {
  summary: AnalyticsSummary;
  categoryBreakdown: CategoryBreakdownRow[];
  productBreakdown: ProductBreakdownRow[];
  statusBreakdown: StatusBreakdownRow[];
  trend: TrendBucketRow[];
  recentUses: RecentCouponUseRow[];
} {
  let couponOrders = 0;
  let eligibleSubtotal = 0;
  let discountAmount = 0;
  let associatedFinalOrderValue = 0;

  let deliveredOrders = 0;
  let deliveredOrderValue = 0;
  let pipelineOrders = 0;
  let pipelineValue = 0;
  let cancelledOrders = 0;
  let cancelledOrderValue = 0;
  let unknownStatusOrders = 0;
  let unknownStatusValue = 0;

  const customerOrderCounts = new Map<string, number>();
  const statusBuckets = new Map<
    AnalyticsOrderStatus,
    { orders: number; orderValue: number; discountAmount: number }
  >();
  for (const st of ANALYTICS_ORDER_STATUSES) {
    statusBuckets.set(st, { orders: 0, orderValue: 0, discountAmount: 0 });
  }

  const categoryAccums = new Map<string, MutableCategoryAccum>();
  for (const cat of Object.values(CATEGORY_TAXONOMY)) {
    categoryAccums.set(cat.slug, {
      categorySlug: cat.slug,
      arabicName: cat.arabicName,
      eligibleQuantity: 0,
      eligibleSubtotal: 0,
      orderKeys: new Set(),
      customerKeys: new Set()
    });
  }
  categoryAccums.set('unknown', {
    categorySlug: 'unknown',
    arabicName: 'غير مصنف',
    eligibleQuantity: 0,
    eligibleSubtotal: 0,
    orderKeys: new Set(),
    customerKeys: new Set()
  });

  const productAccums = new Map<string, MutableProductAccum>();
  const granularity = determineTrendGranularity(window, entries);
  const trendAccums = new Map<string, MutableTrendAccum>();

  if (granularity === 'daily' && window.from && window.to && window.dayCount && window.dayCount <= 35) {
    let cursor = window.from;
    for (let i = 0; i < window.dayCount; i++) {
      trendAccums.set(cursor, {
        bucketKey: cursor,
        label: cursor.slice(5),
        granularity: 'daily',
        couponOrders: 0,
        customerKeys: new Set(),
        eligibleSubtotal: 0,
        discountAmount: 0
      });
      cursor = addDaysToDateKey(cursor, 1);
    }
  }

  for (const entry of entries) {
    const snap = entry.snapshot;
    couponOrders++;
    eligibleSubtotal = roundCurrency(eligibleSubtotal + snap.eligibleSubtotal);
    discountAmount = roundCurrency(discountAmount + snap.discountAmount);
    associatedFinalOrderValue = roundCurrency(associatedFinalOrderValue + entry.totalAmount);

    if (entry.status === 'delivered') {
      deliveredOrders++;
      deliveredOrderValue = roundCurrency(deliveredOrderValue + entry.totalAmount);
    } else if (isPipelineStatus(entry.status)) {
      pipelineOrders++;
      pipelineValue = roundCurrency(pipelineValue + entry.totalAmount);
    } else if (entry.status === 'cancelled') {
      cancelledOrders++;
      cancelledOrderValue = roundCurrency(cancelledOrderValue + entry.totalAmount);
    } else {
      unknownStatusOrders++;
      unknownStatusValue = roundCurrency(unknownStatusValue + entry.totalAmount);
    }

    const stBucket = statusBuckets.get(entry.status)!;
    stBucket.orders++;
    stBucket.orderValue = roundCurrency(stBucket.orderValue + entry.totalAmount);
    stBucket.discountAmount = roundCurrency(stBucket.discountAmount + snap.discountAmount);

    if (entry.ephemeralCustomerKey) {
      customerOrderCounts.set(
        entry.ephemeralCustomerKey,
        (customerOrderCounts.get(entry.ephemeralCustomerKey) || 0) + 1
      );
    }

    // Eligible product lines -> category & product breakdown (only when line allocation is complete)
    if (!snap.lineAllocationIncomplete) {
      for (const line of snap.eligibleProductLines) {
        const catSlug = line.categorySlug || 'unknown';
        const catAccum = categoryAccums.get(catSlug) || categoryAccums.get('unknown')!;
        catAccum.eligibleQuantity += line.quantity;
        catAccum.eligibleSubtotal = roundCurrency(catAccum.eligibleSubtotal + line.lineSubtotal);
        catAccum.orderKeys.add(entry.orderKey);
        if (entry.ephemeralCustomerKey) {
          catAccum.customerKeys.add(entry.ephemeralCustomerKey);
        }

        const histName = entry.productNamesMap.get(line.productId) || '';
        const hasMissingName = !histName;
        const resolvedName = histName || line.productId;
        const productKey = `${line.productId}::${catSlug}`;
        let prodAccum = productAccums.get(productKey);
        if (!prodAccum) {
          prodAccum = {
            productId: line.productId,
            productName: resolvedName,
            categorySlug: catSlug,
            eligibleQuantity: 0,
            eligibleSubtotal: 0,
            orderKeys: new Set(),
            customerKeys: new Set(),
            hasMissingHistoricalName: hasMissingName
          };
          productAccums.set(productKey, prodAccum);
        } else if (prodAccum.hasMissingHistoricalName && histName) {
          prodAccum.productName = histName;
          prodAccum.hasMissingHistoricalName = false;
        }

        prodAccum.eligibleQuantity += line.quantity;
        prodAccum.eligibleSubtotal = roundCurrency(prodAccum.eligibleSubtotal + line.lineSubtotal);
        prodAccum.orderKeys.add(entry.orderKey);
        if (entry.ephemeralCustomerKey) {
          prodAccum.customerKeys.add(entry.ephemeralCustomerKey);
        }
      }
    }

    // Trend buckets
    if (entry.cairoDateKey) {
      let bucketKey: string;
      let label: string;
      if (granularity === 'daily') {
        bucketKey = entry.cairoDateKey;
        label = entry.cairoDateKey.slice(5);
      } else if (granularity === 'weekly') {
        bucketKey = getMonthWeekBucketStart(entry.cairoDateKey);
        label = `أسبوع ${bucketKey.slice(5)}`;
      } else {
        bucketKey = entry.cairoDateKey.slice(0, 7);
        label = bucketKey;
      }

      let tAccum = trendAccums.get(bucketKey);
      if (!tAccum) {
        tAccum = {
          bucketKey,
          label,
          granularity,
          couponOrders: 0,
          customerKeys: new Set(),
          eligibleSubtotal: 0,
          discountAmount: 0
        };
        trendAccums.set(bucketKey, tAccum);
      }
      tAccum.couponOrders++;
      if (entry.ephemeralCustomerKey) {
        tAccum.customerKeys.add(entry.ephemeralCustomerKey);
      }
      tAccum.eligibleSubtotal = roundCurrency(tAccum.eligibleSubtotal + snap.eligibleSubtotal);
      tAccum.discountAmount = roundCurrency(tAccum.discountAmount + snap.discountAmount);
    }
  }

  const eligibleNetSales = roundCurrency(Math.max(0, eligibleSubtotal - discountAmount));
  const uniqueCustomers = customerOrderCounts.size;
  let repeatCustomers = 0;
  let identifiableOrdersCount = 0;
  for (const count of customerOrderCounts.values()) {
    identifiableOrdersCount += count;
    if (count > 1) repeatCustomers++;
  }

  const repeatCustomerRatePct =
    uniqueCustomers > 0 ? roundCurrency((repeatCustomers / uniqueCustomers) * 100) : 0;
  const avgOrdersPerCustomer =
    uniqueCustomers > 0 ? roundCurrency(identifiableOrdersCount / uniqueCustomers) : 0;

  const summary: AnalyticsSummary = {
    couponOrders,
    uniqueCustomers,
    repeatCustomers,
    repeatCustomerRatePct,
    avgOrdersPerCustomer,
    activeCouponsUsedCount: new Set(entries.map((e) => e.snapshot.groupKey)).size,
    eligibleSubtotal,
    discountAmount,
    eligibleNetSales,
    associatedFinalOrderValue,
    avgDiscountPerOrder: couponOrders > 0 ? roundCurrency(discountAmount / couponOrders) : 0,
    avgEligibleSubtotalPerOrder:
      couponOrders > 0 ? roundCurrency(eligibleSubtotal / couponOrders) : 0,
    avgFinalOrderValue:
      couponOrders > 0 ? roundCurrency(associatedFinalOrderValue / couponOrders) : 0,
    effectiveDiscountRatePct:
      eligibleSubtotal > 0 ? roundCurrency((discountAmount / eligibleSubtotal) * 100) : 0,
    deliveredOrders,
    deliveredOrderValue,
    deliveredOrderRatePct:
      couponOrders > 0 ? roundCurrency((deliveredOrders / couponOrders) * 100) : 0,
    pipelineOrders,
    pipelineValue,
    cancelledOrders,
    cancelledOrderValue,
    cancelledOrderRatePct:
      couponOrders > 0 ? roundCurrency((cancelledOrders / couponOrders) * 100) : 0,
    unknownStatusOrders,
    unknownStatusValue
  };

  let totalAllocatedCatSubtotal = 0;
  for (const acc of categoryAccums.values()) {
    totalAllocatedCatSubtotal = roundCurrency(totalAllocatedCatSubtotal + acc.eligibleSubtotal);
  }

  const categoryBreakdown: CategoryBreakdownRow[] = [];
  for (const acc of categoryAccums.values()) {
    if (acc.categorySlug === 'unknown' && acc.orderKeys.size === 0) continue;
    categoryBreakdown.push({
      categorySlug: acc.categorySlug,
      arabicName: acc.arabicName,
      eligibleQuantity: acc.eligibleQuantity,
      eligibleSubtotal: acc.eligibleSubtotal,
      couponOrders: acc.orderKeys.size,
      uniqueCustomers: acc.customerKeys.size,
      sharePct:
        totalAllocatedCatSubtotal > 0
          ? roundCurrency((acc.eligibleSubtotal / totalAllocatedCatSubtotal) * 100)
          : 0
    });
  }
  categoryBreakdown.sort((a, b) => b.eligibleSubtotal - a.eligibleSubtotal);

  const productBreakdown: ProductBreakdownRow[] = Array.from(productAccums.values())
    .map((p) => ({
      productId: p.productId,
      productName: p.productName,
      categorySlug: p.categorySlug,
      categoryArabicName:
        CATEGORY_TAXONOMY[p.categorySlug]?.arabicName || 'غير مصنف',
      eligibleQuantity: p.eligibleQuantity,
      eligibleSubtotal: p.eligibleSubtotal,
      couponOrders: p.orderKeys.size,
      uniqueCustomers: p.customerKeys.size,
      hasMissingHistoricalName: p.hasMissingHistoricalName
    }))
    .sort((a, b) => b.eligibleSubtotal - a.eligibleSubtotal || b.eligibleQuantity - a.eligibleQuantity);

  const statusBreakdown: StatusBreakdownRow[] = ANALYTICS_ORDER_STATUSES.map((st) => {
    const b = statusBuckets.get(st)!;
    return {
      status: st,
      arabicLabel: STATUS_LABELS_AR[st],
      orders: b.orders,
      orderValue: b.orderValue,
      discountAmount: b.discountAmount,
      sharePct: couponOrders > 0 ? roundCurrency((b.orders / couponOrders) * 100) : 0
    };
  });

  const trend: TrendBucketRow[] = Array.from(trendAccums.values())
    .sort((a, b) => a.bucketKey.localeCompare(b.bucketKey))
    .map((t) => ({
      bucketKey: t.bucketKey,
      label: t.label,
      granularity: t.granularity,
      couponOrders: t.couponOrders,
      uniqueCustomers: t.customerKeys.size,
      eligibleSubtotal: t.eligibleSubtotal,
      discountAmount: t.discountAmount,
      eligibleNetSales: roundCurrency(Math.max(0, t.eligibleSubtotal - t.discountAmount))
    }));

  const sortedUses = [...entries].sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  const boundedUses =
    typeof recentUsesLimit === 'number' && recentUsesLimit > 0
      ? sortedUses.slice(0, recentUsesLimit)
      : sortedUses;

  const recentUses: RecentCouponUseRow[] = boundedUses.map((entry) => ({
      invoiceCode: entry.invoiceCode,
      timestampMs: entry.timestampMs,
      cairoDateKey: entry.cairoDateKey,
      cairoDateTime: formatCairoDateTimeLabel(entry.timestampMs),
      groupKey: entry.snapshot.groupKey,
      couponId: entry.snapshot.couponId,
      couponCode: entry.snapshot.code,
      discountType: entry.snapshot.discountType,
      discountValue: entry.snapshot.discountValue,
      scope: entry.snapshot.scope,
      categorySlug: entry.snapshot.categorySlug,
      eligibleSubtotal: entry.snapshot.eligibleSubtotal,
      discountAmount: entry.snapshot.discountAmount,
      totalAmount: entry.totalAmount,
      status: entry.status,
      lineAllocationIncomplete: entry.snapshot.lineAllocationIncomplete
    }));

  return {
    summary,
    categoryBreakdown,
    productBreakdown,
    statusBreakdown,
    trend,
    recentUses
  };
}

function buildComparisonMetric(currentVal: number, previousVal: number): PeriodComparisonMetric {
  const current = roundCurrency(currentVal);
  const previous = roundCurrency(previousVal);
  const delta = roundCurrency(current - previous);
  const deltaPct = previous > 0 ? roundCurrency((delta / previous) * 100) : null;
  return { current, previous, delta, deltaPct };
}

/**
 * Pure single-pass analytics aggregation entry point.
 */
export function aggregateCouponAnalytics(params: {
  orders: unknown;
  rawCoupons?: unknown;
  filters?: AnalyticsFilterInput;
  nowMs?: number;
  includeAllUsesForCsv?: boolean;
}): CouponAnalyticsReport {
  const nowMs =
    typeof params.nowMs === 'number' && Number.isFinite(params.nowMs)
      ? params.nowMs
      : Date.now();

  const parsedFilterRes = parseAnalyticsFilters(params.filters || {}, nowMs);
  if (!parsedFilterRes.valid) {
    throw new Error(parsedFilterRes.message);
  }
  const { filters, window } = parsedFilterRes;

  const { couponsByGroupKey, invalidCurrentCoupons } = extractSanitizedCurrentCoupons(
    params.rawCoupons,
    nowMs
  );

  const dataQuality: AnalyticsDataQuality = {
    ordersScanned: 0,
    ordersWithoutCoupon: 0,
    couponOrdersIncluded: 0,
    invalidCouponSnapshots: 0,
    invalidCurrentCoupons,
    missingCustomerIdentities: 0,
    missingTimestamps: 0,
    appliedAtFallbacks: 0,
    snapshotLineMismatches: 0,
    unknownOrderStatuses: 0,
    missingHistoricalProductNames: 0
  };

  const validParsedEntries: ParsedOrderCouponEntry[] = [];
  const rawOrdersObj = isPlainObject(params.orders)
    ? params.orders
    : Array.isArray(params.orders)
      ? Object.fromEntries(params.orders.map((o, idx) => [String(idx), o]))
      : {};

  for (const [orderKey, rawOrder] of Object.entries(rawOrdersObj)) {
    dataQuality.ordersScanned++;
    if (!isPlainObject(rawOrder)) continue;

    if (rawOrder.coupon === undefined || rawOrder.coupon === null) {
      dataQuality.ordersWithoutCoupon++;
      continue;
    }

    const snapshot = validateOrderCouponSnapshot(rawOrder.coupon);
    if (!snapshot) {
      dataQuality.invalidCouponSnapshots++;
      continue;
    }

    const status = normalizeAnalyticsOrderStatus(rawOrder.status);
    const tsInfo = resolveOrderTimestampInfo(rawOrder);
    const ephemeralCustomerKey = extractEphemeralCustomerKey(rawOrder);
    const rawTotal = parseFiniteNumber(rawOrder.totalAmount);
    const totalAmount = rawTotal !== null && rawTotal >= 0 ? roundCurrency(rawTotal) : 0;
    const invoiceCode =
      typeof rawOrder.invoiceCode === 'string' && rawOrder.invoiceCode.trim()
        ? rawOrder.invoiceCode.trim()
        : '—';
    const productNamesMap = buildHistoricalProductNameLookup(rawOrder.products);

    validParsedEntries.push({
      orderKey,
      invoiceCode,
      snapshot,
      status,
      totalAmount,
      timestampMs: tsInfo.timestampMs,
      cairoDateKey: tsInfo.cairoDateKey,
      usedAppliedAtFallback: tsInfo.usedAppliedAtFallback,
      timestampMissing: tsInfo.timestampMissing,
      ephemeralCustomerKey,
      productNamesMap
    });
  }

  // Group all-time metadata per stable coupon group AND match current period + comparison period
  const couponGroupAccums = new Map<string, MutableCouponGroupAccum>();

  for (const [groupKey, currentDef] of couponsByGroupKey.entries()) {
    const matchesCurrentDefFilters = matchesStaticCouponFilters(
      {
        groupKey,
        couponId: currentDef.id,
        scope: currentDef.scope,
        categorySlug: currentDef.categorySlug,
        discountType: currentDef.discountType
      },
      filters
    );
    if (matchesCurrentDefFilters) {
      couponGroupAccums.set(groupKey, {
        groupKey,
        couponId: currentDef.id,
        currentDefinition: currentDef,
        historicalCodes: new Set(),
        variants: new Map(),
        entries: [],
        allTimeOrders: 0,
        allTimeDiscountAmount: 0,
        allTimeEligibleSubtotal: 0,
        allTimeHistoricalCodes: new Set()
      });
    }
  }

  const filteredEntries: ParsedOrderCouponEntry[] = [];
  const previousEntries: ParsedOrderCouponEntry[] = [];

  for (const entry of validParsedEntries) {
    const snap = entry.snapshot;
    const existingDef = couponsByGroupKey.get(snap.groupKey) || null;

    // Ensure historical coupon groups with any all-time presence are tracked when matching static filters
    if (!couponGroupAccums.has(snap.groupKey)) {
      if (matchesStaticCouponFilters(snap, filters)) {
        couponGroupAccums.set(snap.groupKey, {
          groupKey: snap.groupKey,
          couponId: snap.couponId,
          currentDefinition: existingDef,
          historicalCodes: new Set(),
          variants: new Map(),
          entries: [],
          allTimeOrders: 0,
          allTimeDiscountAmount: 0,
          allTimeEligibleSubtotal: 0,
          allTimeHistoricalCodes: new Set()
        });
      }
    }

    const accum = couponGroupAccums.get(snap.groupKey);
    if (accum) {
      accum.allTimeOrders++;
      accum.allTimeDiscountAmount = roundCurrency(accum.allTimeDiscountAmount + snap.discountAmount);
      accum.allTimeEligibleSubtotal = roundCurrency(
        accum.allTimeEligibleSubtotal + snap.eligibleSubtotal
      );
      accum.allTimeHistoricalCodes.add(snap.code);
    }

    if (matchesOrderFilters(entry, filters, window.from, window.to)) {
      filteredEntries.push(entry);
      dataQuality.couponOrdersIncluded++;
      if (!entry.ephemeralCustomerKey) dataQuality.missingCustomerIdentities++;
      if (entry.timestampMissing) dataQuality.missingTimestamps++;
      if (entry.usedAppliedAtFallback) dataQuality.appliedAtFallbacks++;
      if (snap.lineAllocationIncomplete) dataQuality.snapshotLineMismatches++;
      if (entry.status === 'unknown') dataQuality.unknownOrderStatuses++;

      if (!snap.lineAllocationIncomplete) {
        for (const line of snap.eligibleProductLines) {
          if (!entry.productNamesMap.has(line.productId)) {
            dataQuality.missingHistoricalProductNames++;
          }
        }
      }

      if (accum) {
        accum.entries.push(entry);
        accum.historicalCodes.add(snap.code);

        const variantKey = `${snap.code}|${snap.discountType}|${snap.discountValue}|${snap.scope}|${snap.categorySlug || ''}|${snap.minimumSubtotal || ''}|${snap.maximumDiscount || ''}`;
        let variant = accum.variants.get(variantKey);
        if (!variant) {
          variant = {
            configKey: variantKey,
            code: snap.code,
            discountType: snap.discountType,
            discountValue: snap.discountValue,
            scope: snap.scope,
            categorySlug: snap.categorySlug,
            minimumSubtotal: snap.minimumSubtotal,
            maximumDiscount: snap.maximumDiscount,
            couponOrders: 0,
            eligibleSubtotal: 0,
            discountAmount: 0
          };
          accum.variants.set(variantKey, variant);
        }
        variant.couponOrders++;
        variant.eligibleSubtotal = roundCurrency(variant.eligibleSubtotal + snap.eligibleSubtotal);
        variant.discountAmount = roundCurrency(variant.discountAmount + snap.discountAmount);
      }
    } else if (
      window.comparisonAvailable &&
      window.previousFrom &&
      window.previousTo &&
      matchesOrderFilters(entry, filters, window.previousFrom, window.previousTo)
    ) {
      previousEntries.push(entry);
    }
  }

  const mainAgg = buildBreakdownAndTrendForEntries(
    filteredEntries,
    window,
    params.includeAllUsesForCsv ? 0 : MAX_RECENT_USES
  );

  let comparison: AnalyticsComparisonResult;
  if (window.comparisonAvailable && window.previousFrom && window.previousTo) {
    const prevWindow: CairoPeriodWindow = {
      ...window,
      from: window.previousFrom,
      to: window.previousTo
    };
    const prevAgg = buildBreakdownAndTrendForEntries(previousEntries, prevWindow);
    comparison = {
      available: true,
      previousFrom: window.previousFrom,
      previousTo: window.previousTo,
      metrics: {
        couponOrders: buildComparisonMetric(
          mainAgg.summary.couponOrders,
          prevAgg.summary.couponOrders
        ),
        uniqueCustomers: buildComparisonMetric(
          mainAgg.summary.uniqueCustomers,
          prevAgg.summary.uniqueCustomers
        ),
        eligibleSubtotal: buildComparisonMetric(
          mainAgg.summary.eligibleSubtotal,
          prevAgg.summary.eligibleSubtotal
        ),
        discountAmount: buildComparisonMetric(
          mainAgg.summary.discountAmount,
          prevAgg.summary.discountAmount
        ),
        eligibleNetSales: buildComparisonMetric(
          mainAgg.summary.eligibleNetSales,
          prevAgg.summary.eligibleNetSales
        ),
        deliveredOrders: buildComparisonMetric(
          mainAgg.summary.deliveredOrders,
          prevAgg.summary.deliveredOrders
        )
      }
    };
  } else {
    comparison = {
      available: false,
      previousFrom: null,
      previousTo: null,
      metrics: null
    };
  }

  const coupons: CouponPerformanceSummary[] = [];
  for (const accum of couponGroupAccums.values()) {
    // Keep current coupon definitions (even with 0 uses) and historical-only coupons that have uses
    // in the selected period or when period is all-time / explicitly filtered by couponId
    const shouldInclude =
      accum.currentDefinition !== null ||
      accum.entries.length > 0 ||
      filters.period === 'all' ||
      Boolean(filters.couponId);

    if (!shouldInclude) continue;

    const perCouponAgg = buildBreakdownAndTrendForEntries(accum.entries, window);
    const allHistCodes = Array.from(
      new Set([...accum.historicalCodes, ...accum.allTimeHistoricalCodes])
    );
    const currentCode =
      accum.currentDefinition?.code ||
      allHistCodes[allHistCodes.length - 1] ||
      accum.groupKey.replace(/^code:/, '');

    const variants: CouponHistoricalConfigVariant[] = Array.from(accum.variants.values()).map(
      (v) => ({
        ...v,
        eligibleNetSales: roundCurrency(Math.max(0, v.eligibleSubtotal - v.discountAmount))
      })
    );

    coupons.push({
      groupKey: accum.groupKey,
      couponId: accum.couponId,
      currentCode,
      historicalCodes: Array.from(accum.historicalCodes),
      historicalConfigs: variants,
      hasCurrentDefinition: accum.currentDefinition !== null,
      currentDefinition: accum.currentDefinition,
      currentStatus: accum.currentDefinition ? accum.currentDefinition.status : 'unavailable',
      couponOrders: perCouponAgg.summary.couponOrders,
      uniqueCustomers: perCouponAgg.summary.uniqueCustomers,
      repeatCustomers: perCouponAgg.summary.repeatCustomers,
      repeatCustomerRatePct: perCouponAgg.summary.repeatCustomerRatePct,
      avgOrdersPerCustomer: perCouponAgg.summary.avgOrdersPerCustomer,
      eligibleSubtotal: perCouponAgg.summary.eligibleSubtotal,
      discountAmount: perCouponAgg.summary.discountAmount,
      eligibleNetSales: perCouponAgg.summary.eligibleNetSales,
      associatedFinalOrderValue: perCouponAgg.summary.associatedFinalOrderValue,
      avgDiscountPerOrder: perCouponAgg.summary.avgDiscountPerOrder,
      avgEligibleSubtotalPerOrder: perCouponAgg.summary.avgEligibleSubtotalPerOrder,
      avgFinalOrderValue: perCouponAgg.summary.avgFinalOrderValue,
      effectiveDiscountRatePct: perCouponAgg.summary.effectiveDiscountRatePct,
      deliveredOrders: perCouponAgg.summary.deliveredOrders,
      deliveredOrderValue: perCouponAgg.summary.deliveredOrderValue,
      pipelineOrders: perCouponAgg.summary.pipelineOrders,
      pipelineValue: perCouponAgg.summary.pipelineValue,
      cancelledOrders: perCouponAgg.summary.cancelledOrders,
      cancelledOrderValue: perCouponAgg.summary.cancelledOrderValue,
      unknownStatusOrders: perCouponAgg.summary.unknownStatusOrders,
      unknownStatusValue: perCouponAgg.summary.unknownStatusValue,
      allTimeOrders: accum.allTimeOrders,
      allTimeDiscountAmount: accum.allTimeDiscountAmount,
      allTimeEligibleSubtotal: accum.allTimeEligibleSubtotal,
      allTimeHistoricalCodes: Array.from(accum.allTimeHistoricalCodes),
      categoryBreakdown: perCouponAgg.categoryBreakdown,
      productBreakdown: perCouponAgg.productBreakdown,
      trend: perCouponAgg.trend,
      recentUses: perCouponAgg.recentUses
    });
  }

  coupons.sort(
    (a, b) =>
      b.couponOrders - a.couponOrders ||
      b.discountAmount - a.discountAmount ||
      a.currentCode.localeCompare(b.currentCode)
  );

  return {
    success: true,
    timezone: CAIRO_TIMEZONE,
    generatedAt: nowMs,
    generatedAtCairo: formatCairoDateTimeLabel(nowMs),
    filters,
    window,
    summary: mainAgg.summary,
    comparison,
    coupons,
    categoryBreakdown: mainAgg.categoryBreakdown,
    productBreakdown: mainAgg.productBreakdown,
    statusBreakdown: mainAgg.statusBreakdown,
    trend: mainAgg.trend,
    recentUses: mainAgg.recentUses,
    categories: getCouponCategoryOptions(),
    dataQuality
  };
}

/**
 * Neutralizes spreadsheet formula injection prefixes (=, +, -, @, \t, \r)
 * and applies standard RFC-4180 CSV escaping.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '""';
    const strNum = String(value);
    return strNum.startsWith('-') ? `"'${strNum}"` : `"${strNum}"`;
  }

  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str) || /^[ ]+[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

function formatCsvCurrency(val: number): string {
  if (!Number.isFinite(val)) return '0.00';
  return roundCurrency(val).toFixed(2);
}

function getStatusArabicLabel(status: AnalyticsOrderStatus): string {
  return STATUS_LABELS_AR[status] || STATUS_LABELS_AR.unknown;
}

function getCouponStatusArabicLabel(status: CouponStatus | 'unavailable'): string {
  switch (status) {
    case 'active':
      return 'مفعّل';
    case 'scheduled':
      return 'مجدول';
    case 'expired':
      return 'منتهي';
    case 'disabled':
      return 'معطّل';
    default:
      return 'سجل تاريخي (التعريف الحالي غير متاح)';
  }
}

export function buildCouponAnalyticsCsv(params: {
  report: CouponAnalyticsReport;
  dataset: AnalyticsCsvDataset;
}): { filename: string; csvContent: string } {
  const { report, dataset } = params;
  const dateTag = getCairoDateKey(report.generatedAt) || 'export';
  const filename = `dandy-coupon-analytics-${dataset}-${dateTag}.csv`;

  const lines: string[] = [];

  if (dataset === 'coupons') {
    lines.push(
      [
        'معرّف الكوبون',
        'الكود الحالي',
        'الأكواد التاريخية المستخدمة',
        'الحالة الحالية',
        'نوع الخصم الحالي',
        'قيمة الخصم الحالية',
        'النطاق الحالي',
        'عدد طلبات الاستخدام',
        'العملاء الفريدون',
        'العملاء المتكررون',
        'معدل التكرار (%)',
        'قيمة المنتجات المؤهلة قبل الخصم (ج.م)',
        'إجمالي الخصومات (ج.م)',
        'صافي المنتجات المؤهلة بعد الخصم (ج.م)',
        'قيمة الطلبات المرتبطة الإجمالية (ج.م)',
        'متوسط الخصم لكل طلب (ج.م)',
        'طلبات مسلّمة',
        'طلبات قيد التنفيذ',
        'طلبات ملغاة'
      ]
        .map(sanitizeCsvCell)
        .join(',')
    );

    for (const c of report.coupons) {
      const def = c.currentDefinition;
      const scopeText = !def
        ? 'غير متاح'
        : def.scope === 'category'
          ? CATEGORY_TAXONOMY[def.categorySlug || '']?.arabicName || def.categorySlug || 'قسم محدد'
          : 'جميع المنتجات';
      lines.push(
        [
          c.couponId || 'بدون معرّف',
          c.currentCode,
          c.historicalCodes.join(' | ') || '—',
          getCouponStatusArabicLabel(c.currentStatus),
          def ? (def.discountType === 'percentage' ? 'نسبة مئوية' : 'مبلغ ثابت') : 'غير متاح',
          def ? String(def.discountValue) : 'غير متاح',
          scopeText,
          c.couponOrders,
          c.uniqueCustomers,
          c.repeatCustomers,
          formatCsvCurrency(c.repeatCustomerRatePct),
          formatCsvCurrency(c.eligibleSubtotal),
          formatCsvCurrency(c.discountAmount),
          formatCsvCurrency(c.eligibleNetSales),
          formatCsvCurrency(c.associatedFinalOrderValue),
          formatCsvCurrency(c.avgDiscountPerOrder),
          c.deliveredOrders,
          c.pipelineOrders,
          c.cancelledOrders
        ]
          .map(sanitizeCsvCell)
          .join(',')
      );
    }
  } else if (dataset === 'uses') {
    lines.push(
      [
        'مرجع الفاتورة',
        'تاريخ ووقت الطلب (القاهرة)',
        'كود الكوبون التاريخي',
        'النطاق / القسم',
        'قيمة المنتجات المؤهلة (ج.م)',
        'قيمة الخصم (ج.م)',
        'إجمالي قيمة الطلب النهائية (ج.م)',
        'حالة الطلب'
      ]
        .map(sanitizeCsvCell)
        .join(',')
    );

    for (const u of report.recentUses) {
      const scopeLabel =
        u.scope === 'category'
          ? CATEGORY_TAXONOMY[u.categorySlug || '']?.arabicName || u.categorySlug || 'قسم محدد'
          : 'جميع المنتجات';
      lines.push(
        [
          u.invoiceCode,
          u.cairoDateTime,
          u.couponCode,
          scopeLabel,
          formatCsvCurrency(u.eligibleSubtotal),
          formatCsvCurrency(u.discountAmount),
          formatCsvCurrency(u.totalAmount),
          getStatusArabicLabel(u.status)
        ]
          .map(sanitizeCsvCell)
          .join(',')
      );
    }
  } else if (dataset === 'products') {
    lines.push(
      [
        'معرّف المنتج',
        'اسم المنتج التاريخي',
        'القسم التاريخي',
        'الكمية المؤهلة',
        'إجمالي المنتجات المؤهلة قبل الخصم (ج.م)',
        'عدد طلبات الكوبونات',
        'العملاء الفريدون'
      ]
        .map(sanitizeCsvCell)
        .join(',')
    );

    for (const p of report.productBreakdown) {
      lines.push(
        [
          p.productId,
          p.productName,
          p.categoryArabicName,
          p.eligibleQuantity,
          formatCsvCurrency(p.eligibleSubtotal),
          p.couponOrders,
          p.uniqueCustomers
        ]
          .map(sanitizeCsvCell)
          .join(',')
      );
    }
  } else {
    lines.push(
      [
        'رمز القسم',
        'اسم القسم',
        'الكمية المؤهلة',
        'قيمة المنتجات المؤهلة قبل الخصم (ج.م)',
        'عدد طلبات الكوبونات',
        'العملاء الفريدون',
        'الحصة من الإجمالي (%)'
      ]
        .map(sanitizeCsvCell)
        .join(',')
    );

    for (const cat of report.categoryBreakdown) {
      lines.push(
        [
          cat.categorySlug,
          cat.arabicName,
          cat.eligibleQuantity,
          formatCsvCurrency(cat.eligibleSubtotal),
          cat.couponOrders,
          cat.uniqueCustomers,
          formatCsvCurrency(cat.sharePct)
        ]
          .map(sanitizeCsvCell)
          .join(',')
      );
    }
  }

  return {
    filename,
    csvContent: `\uFEFF${lines.join('\r\n')}`
  };
}
