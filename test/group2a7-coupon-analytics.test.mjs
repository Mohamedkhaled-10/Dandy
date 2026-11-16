// test/group2a7-coupon-analytics.test.mjs
// DANDY PHASE 2 / GROUP 2A.7: Coupon Analytics & Performance Dashboard (Sections A–K, 117 checks)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

import {
  aggregateCouponAnalytics,
  buildCouponAnalyticsCsv,
  extractEphemeralCustomerKey,
  getCairoDateKey,
  normalizeAnalyticsOrderStatus,
  parseAnalyticsFilters,
  resolveOrderTimestampInfo,
  sanitizeCsvCell,
  validateOrderCouponSnapshot
} from '../src/utils/coupon-analytics.ts';

import {
  GET as analyticsGET,
  POST as analyticsPOST,
  PUT as analyticsPUT,
  PATCH as analyticsPATCH,
  DELETE as analyticsDELETE,
  ALL as analyticsALL
} from '../src/pages/api/coupons/analytics.js';

function clone(val) {
  return val === undefined ? undefined : JSON.parse(JSON.stringify(val));
}

function createMockAdminDb(initialData = {}) {
  const data = clone(initialData) || {};
  const reads = [];
  const writes = [];

  function getAtPath(p) {
    if (!p) return data;
    const parts = p.split('/').filter(Boolean);
    let curr = data;
    for (const part of parts) {
      if (curr === null || curr === undefined || typeof curr !== 'object') return null;
      curr = curr[part];
    }
    return curr === undefined ? null : curr;
  }

  function makeRef(p = '') {
    const cleanPath = String(p).replace(/^\/+|\/+$/g, '');
    return {
      key: cleanPath.split('/').filter(Boolean).pop() || null,
      async once(eventType) {
        reads.push({ path: cleanPath, eventType });
        const val = clone(getAtPath(cleanPath));
        return {
          exists: () => val !== null && val !== undefined,
          val: () => (val === undefined ? null : val)
        };
      },
      on() {
        writes.push({ op: 'on', path: cleanPath });
        throw new Error('Realtime listener forbidden in analytics');
      },
      async set(val) {
        writes.push({ op: 'set', path: cleanPath, val });
        throw new Error('DB writes forbidden in analytics');
      },
      async update(val) {
        writes.push({ op: 'update', path: cleanPath, val });
        throw new Error('DB writes forbidden in analytics');
      },
      async push(val) {
        writes.push({ op: 'push', path: cleanPath, val });
        throw new Error('DB writes forbidden in analytics');
      },
      async remove() {
        writes.push({ op: 'remove', path: cleanPath });
        throw new Error('DB writes forbidden in analytics');
      },
      async transaction() {
        writes.push({ op: 'transaction', path: cleanPath });
        throw new Error('DB transactions forbidden in analytics');
      }
    };
  }

  return {
    db: {
      ref(p) {
        return makeRef(p);
      }
    },
    reads,
    writes
  };
}

function makeAuthDeps(adminDb, { authorized = true, status = 200, email = 'admin@dandy.com', emailVerified = true, nowMs } = {}) {
  return {
    adminDb,
    nowMs,
    adminAuth: {
      async verifyIdToken(token) {
        if (!authorized && status === 401) {
          throw new Error('INVALID_TOKEN');
        }
        return {
          uid: 'admin-uid-1',
          email: token === 'token-non-admin' ? 'customer@example.com' : email,
          email_verified: token === 'token-unverified' ? false : emailVerified
        };
      }
    }
  };
}

function buildStandardFixtures() {
  // Now = 2026-11-15T12:00:00Z => Cairo = 2026-11-15 14:00 (UTC+2)
  const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);

  const rawCoupons = {
    cpn_welcome: {
      id: 'cpn_welcome',
      code: 'WELCOME20',
      discountType: 'percentage',
      discountValue: 20,
      scope: 'all',
      categorySlug: null,
      minimumSubtotal: 300,
      maximumDiscount: 150,
      startsAt: null,
      expiresAt: null,
      isActive: true,
      createdAt: nowMs - 40 * 86400000,
      updatedAt: nowMs - 2 * 86400000,
      createdBy: 'admin@dandy.com',
      updatedBy: 'secret-staff@dandy.com',
      schemaVersion: 1
    },
    cpn_hair: {
      id: 'cpn_hair',
      code: 'HAIR50',
      discountType: 'fixed',
      discountValue: 50,
      scope: 'category',
      categorySlug: 'hair-care',
      minimumSubtotal: 200,
      maximumDiscount: null,
      startsAt: null,
      expiresAt: null,
      isActive: true,
      createdAt: nowMs - 30 * 86400000,
      updatedAt: nowMs - 86400000,
      createdBy: 'admin@dandy.com',
      updatedBy: 'admin@dandy.com',
      schemaVersion: 1
    },
    cpn_unused: {
      id: 'cpn_unused',
      code: 'UNUSED15',
      discountType: 'percentage',
      discountValue: 15,
      scope: 'category',
      categorySlug: 'skin-care',
      minimumSubtotal: null,
      maximumDiscount: null,
      startsAt: null,
      expiresAt: null,
      isActive: true,
      createdBy: 'admin@dandy.com',
      updatedBy: 'admin@dandy.com',
      schemaVersion: 1
    },
    cpn_corrupt_current: {
      id: 'cpn_corrupt_current',
      code: 'BROKEN',
      discountType: 'percentage',
      discountValue: 250, // invalid > 100
      scope: 'all',
      isActive: true
    }
  };

  const orders = {
    // 1. Valid percentage coupon (delivered), today Cairo
    ord_1: {
      invoiceCode: 'DND-1001',
      timestamp: Date.UTC(2026, 10, 15, 8, 0, 0),
      status: 'delivered',
      name: 'سارة أحمد',
      phone: '+20 101 234 5678',
      email: 'sara.pii@example.com',
      address: '15 شارع التحرير، القاهرة',
      customerId: 'cust_sara_secret',
      subtotal: 500,
      shippingFee: 60,
      totalAmount: 460,
      products: [
        { id: 'prod_shampoo', name: 'شامبو داندي التاريخي', quantity: 1, price: 300, lineTotal: 300 },
        { id: 'prod_serum', name: 'سيروم النضارة التاريخي', quantity: 1, price: 200, lineTotal: 200 }
      ],
      coupon: {
        id: 'cpn_welcome',
        code: 'OLDWELC15', // historical old code before rename to WELCOME20
        discountType: 'percentage',
        discountValue: 15,
        scope: 'all',
        categorySlug: null,
        minimumSubtotal: 300,
        maximumDiscount: 150,
        eligibleSubtotal: 500,
        discountAmount: 100, // historical fixed snapshot preserved
        appliedAt: Date.UTC(2026, 10, 15, 7, 59, 0),
        eligibleProductLines: [
          { productId: 'prod_shampoo', categorySlug: 'hair-care', quantity: 1, lineSubtotal: 300 },
          { productId: 'prod_serum', categorySlug: 'skin-care', quantity: 1, lineSubtotal: 200 }
        ]
      }
    },
    // 2. Same customer (Arabic-Indic phone format) uses WELCOME20 again -> repeat customer!
    ord_2: {
      invoiceCode: 'DND-1002',
      timestamp: Date.UTC(2026, 10, 12, 10, 0, 0),
      status: 'تم التواصل', // maps to processing
      name: 'سارة أحمد',
      phone: '٠١٠١٢٣٤٥٦٧٨',
      customerId: 'cust_sara_secret',
      subtotal: 400,
      shippingFee: 60,
      totalAmount: 380,
      products: [
        { id: 'prod_serum', name: 'سيروم النضارة التاريخي', quantity: 2, price: 200, lineTotal: 400 }
      ],
      coupon: {
        id: 'cpn_welcome',
        code: 'WELCOME20',
        discountType: 'percentage',
        discountValue: 20,
        scope: 'all',
        categorySlug: null,
        minimumSubtotal: 300,
        maximumDiscount: 150,
        eligibleSubtotal: 400,
        discountAmount: 80,
        appliedAt: Date.UTC(2026, 10, 12, 9, 59, 0),
        eligibleProductLines: [
          { productId: 'prod_serum', categorySlug: 'skin-care', quantity: 2, lineSubtotal: 400 }
        ]
      }
    },
    // 3. Fixed category coupon, cancelled order, uses customerId fallback (no valid phone)
    ord_3: {
      invoiceCode: 'DND-1003',
      timestamp: Date.UTC(2026, 10, 10, 10, 0, 0),
      status: 'ملغي',
      name: 'مريم حسن',
      phone: 'invalid-phone',
      customerId: 'uid_mariam_99',
      subtotal: 300,
      shippingFee: 50,
      totalAmount: 300,
      products: [
        { id: 'prod_shampoo', name: 'شامبو داندي التاريخي', quantity: 1, price: 300, lineTotal: 300 }
      ],
      coupon: {
        id: 'cpn_hair',
        code: 'HAIR50',
        discountType: 'fixed',
        discountValue: 50,
        scope: 'category',
        categorySlug: 'hair-care',
        minimumSubtotal: 200,
        maximumDiscount: null,
        eligibleSubtotal: 300,
        discountAmount: 50,
        appliedAt: Date.UTC(2026, 10, 10, 9, 55, 0),
        eligibleProductLines: [
          { productId: 'prod_shampoo', categorySlug: 'hair-care', quantity: 1, lineSubtotal: 300 }
        ]
      }
    },
    // 4. Historical-only coupon (not in settings/coupons) + legacy snapshot without ID + missing phone/customerId
    ord_4: {
      invoiceCode: 'DND-1004',
      timestamp: Date.UTC(2026, 9, 20, 14, 0, 0), // Oct 20, 2026 (previous month / 30d)
      status: 'completed', // maps to delivered
      subtotal: 250,
      shippingFee: 50,
      totalAmount: 250,
      products: [
        { id: 'prod_mist', name: 'ميست قديم', quantity: 1, price: 250, lineTotal: 250 }
      ],
      coupon: {
        code: 'LEGACY50',
        discountType: 'fixed',
        discountValue: 50,
        scope: 'all',
        categorySlug: null,
        eligibleSubtotal: 250,
        discountAmount: 50,
        appliedAt: Date.UTC(2026, 9, 20, 13, 55, 0),
        eligibleProductLines: [
          { productId: 'prod_mist', categorySlug: 'fragrance', quantity: 1, lineSubtotal: 250 }
        ]
      }
    },
    // 5. Order WITHOUT coupon -> ignored
    ord_no_coupon: {
      invoiceCode: 'DND-1005',
      timestamp: nowMs - 3600000,
      status: 'delivered',
      phone: '01112345678',
      subtotal: 600,
      shippingFee: 0,
      totalAmount: 600,
      discount: 40 // legacy non-coupon discount must NOT be counted as coupon usage
    }
  };

  return { nowMs, rawCoupons, orders };
}

// ============================================================================
// SECTION A: Coupon snapshot recognition (Tests 1–12)
// ============================================================================
test('Section A (1–12): Coupon snapshot recognition, validation, mismatch flags & multi-line single-order counting', () => {
  const { nowMs, rawCoupons, orders } = buildStandardFixtures();
  const report = aggregateCouponAnalytics({ orders, rawCoupons, filters: { period: 'all' }, nowMs });

  // 1, 2, 3, 12: 4 valid coupon orders (percentage + fixed), ord_no_coupon ignored, ord_1 with 2 lines counted once
  assert.equal(report.summary.couponOrders, 4);
  assert.equal(report.dataQuality.ordersScanned, 5);
  assert.equal(report.dataQuality.ordersWithoutCoupon, 1);
  assert.equal(report.dataQuality.couponOrdersIncluded, 4);

  // 4–9: Invalid snapshots rejected
  assert.equal(validateOrderCouponSnapshot({ code: 'AB', discountType: 'percentage', discountValue: 10, scope: 'all', eligibleSubtotal: 100, discountAmount: 10 }), null); // invalid code
  assert.equal(validateOrderCouponSnapshot({ code: 'GOOD10', discountType: 'bogus', discountValue: 10, scope: 'all', eligibleSubtotal: 100, discountAmount: 10 }), null); // invalid discountType
  assert.equal(validateOrderCouponSnapshot({ code: 'GOOD10', discountType: 'percentage', discountValue: 10, scope: 'vip', eligibleSubtotal: 100, discountAmount: 10 }), null); // invalid scope
  assert.equal(validateOrderCouponSnapshot({ code: 'GOOD10', discountType: 'percentage', discountValue: 10, scope: 'all', eligibleSubtotal: -50, discountAmount: 0 }), null); // negative eligibleSubtotal
  assert.equal(validateOrderCouponSnapshot({ code: 'GOOD10', discountType: 'percentage', discountValue: 10, scope: 'all', eligibleSubtotal: 100, discountAmount: -5 }), null); // negative discount
  assert.equal(validateOrderCouponSnapshot({ code: 'GOOD10', discountType: 'percentage', discountValue: 10, scope: 'all', eligibleSubtotal: 100, discountAmount: 120 }), null); // discount > eligibleSubtotal
  assert.equal(validateOrderCouponSnapshot({ code: 'GOOD10', discountType: 'percentage', discountValue: 110, scope: 'all', eligibleSubtotal: 100, discountAmount: 10 }), null); // pct > 100
  assert.equal(validateOrderCouponSnapshot({ code: 'GOOD10', discountType: 'percentage', discountValue: NaN, scope: 'all', eligibleSubtotal: 100, discountAmount: 10 }), null); // NaN

  // 10 & 11: Invalid eligibleProductLines handled gracefully without crashing & line subtotal mismatch flagged
  const badLinesReport = aggregateCouponAnalytics({
    orders: {
      o_corrupt_lines: {
        invoiceCode: 'DND-BADLINE',
        timestamp: nowMs,
        status: 'delivered',
        phone: '01099887766',
        totalAmount: 200,
        coupon: {
          id: 'cpn_welcome',
          code: 'WELCOME20',
          discountType: 'percentage',
          discountValue: 20,
          scope: 'all',
          eligibleSubtotal: 200,
          discountAmount: 40,
          eligibleProductLines: 'corrupted-not-array'
        }
      },
      o_mismatch_lines: {
        invoiceCode: 'DND-MISMATCH',
        timestamp: nowMs,
        status: 'delivered',
        phone: '01222334455',
        totalAmount: 300,
        coupon: {
          id: 'cpn_welcome',
          code: 'WELCOME20',
          discountType: 'percentage',
          discountValue: 20,
          scope: 'all',
          eligibleSubtotal: 300,
          discountAmount: 60,
          eligibleProductLines: [
            { productId: 'p1', categorySlug: 'hair-care', quantity: 1, lineSubtotal: 150 },
            { productId: '', categorySlug: 'hair-care', quantity: -2, lineSubtotal: NaN }
          ]
        }
      }
    },
    rawCoupons: {},
    nowMs
  });

  assert.equal(badLinesReport.summary.couponOrders, 2);
  assert.equal(badLinesReport.summary.eligibleSubtotal, 500);
  assert.equal(badLinesReport.summary.discountAmount, 100);
  assert.equal(badLinesReport.dataQuality.snapshotLineMismatches, 2);
});

// ============================================================================
// SECTION B: Coupon identity / history (Tests 13–20)
// ============================================================================
test('Section B (13–20): Stable coupon IDs, code rename history, separate IDs, zero-use & historical-only coupons', () => {
  const { nowMs, rawCoupons, orders } = buildStandardFixtures();
  // Add a second distinct ID that temporarily used the same code string as cpn_welcome
  orders.ord_same_code_diff_id = {
    invoiceCode: 'DND-1009',
    timestamp: nowMs - 86400000,
    status: 'delivered',
    phone: '01555555555',
    totalAmount: 200,
    coupon: {
      id: 'cpn_welcome_v2_separate',
      code: 'WELCOME20',
      discountType: 'fixed',
      discountValue: 30,
      scope: 'all',
      eligibleSubtotal: 200,
      discountAmount: 30,
      eligibleProductLines: [{ productId: 'p9', categorySlug: 'body-care', quantity: 1, lineSubtotal: 200 }]
    }
  };

  const report = aggregateCouponAnalytics({ orders, rawCoupons, nowMs });

  const welcomeGroup = report.coupons.find((c) => c.couponId === 'cpn_welcome');
  const otherIdGroup = report.coupons.find((c) => c.couponId === 'cpn_welcome_v2_separate');
  const unusedGroup = report.coupons.find((c) => c.couponId === 'cpn_unused');
  const legacyGroup = report.coupons.find((c) => c.groupKey === 'code:LEGACY50');

  assert.ok(welcomeGroup);
  assert.ok(otherIdGroup);
  assert.notEqual(welcomeGroup.groupKey, otherIdGroup.groupKey);
  assert.equal(welcomeGroup.couponOrders, 2);
  assert.equal(otherIdGroup.couponOrders, 1);

  // 15 & 20: Historical codes & historical discount configs preserved under stable ID, untouched by current config edits
  assert.ok(welcomeGroup.historicalCodes.includes('OLDWELC15'));
  assert.ok(welcomeGroup.historicalCodes.includes('WELCOME20'));
  assert.equal(welcomeGroup.historicalConfigs.length, 2);
  assert.equal(welcomeGroup.discountAmount, 180); // 100 + 80 preserved verbatim

  // 16: Current definition joined separately without createdBy/updatedBy
  assert.equal(welcomeGroup.hasCurrentDefinition, true);
  assert.equal(welcomeGroup.currentDefinition.code, 'WELCOME20');
  assert.equal('createdBy' in welcomeGroup.currentDefinition, false);
  assert.equal('updatedBy' in welcomeGroup.currentDefinition, false);

  // 17: Zero-use current coupon appears
  assert.ok(unusedGroup);
  assert.equal(unusedGroup.couponOrders, 0);
  assert.equal(unusedGroup.discountAmount, 0);
  assert.equal(unusedGroup.currentStatus, 'active');

  // 18 & 19: Legacy snapshot without ID falls back to normalized code and remains reportable without current definition
  assert.ok(legacyGroup);
  assert.equal(legacyGroup.hasCurrentDefinition, false);
  assert.equal(legacyGroup.currentStatus, 'unavailable');
  assert.equal(legacyGroup.couponOrders, 1);
  assert.equal(legacyGroup.discountAmount, 50);

  // Malformed current coupon ignored safely
  assert.equal(report.dataQuality.invalidCurrentCoupons, 1);
  assert.equal(report.coupons.some((c) => c.couponId === 'cpn_corrupt_current'), false);
});

// ============================================================================
// SECTION C: Unique customers & PII protection (Tests 21–28)
// ============================================================================
test('Section C (21–28): Phone normalization, Arabic-Indic digits, customerId fallback, repeat rate & zero PII', () => {
  const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);
  const mkOrder = (id, phone, customerId, code = 'SAVE10') => ({
    invoiceCode: `INV-${id}`,
    timestamp: nowMs,
    status: 'delivered',
    phone,
    customerId,
    name: 'اسم عميل سري للغاية',
    email: 'customer.secret@gmail.com',
    address: 'عنوان تفصيلي سري',
    totalAmount: 200,
    coupon: {
      id: 'cpn_1',
      code,
      discountType: 'fixed',
      discountValue: 20,
      scope: 'all',
      eligibleSubtotal: 200,
      discountAmount: 20,
      eligibleProductLines: [{ productId: 'p1', categorySlug: 'skin-care', quantity: 1, lineSubtotal: 200 }]
    }
  });

  // 21–23: Different formats + Arabic-Indic digits of same phone -> 1 customer (3 orders => repeat!)
  assert.equal(extractEphemeralCustomerKey({ phone: '+20 101-234-5678' }), 'phone:01012345678');
  assert.equal(extractEphemeralCustomerKey({ phone: '00201012345678' }), 'phone:01012345678');
  assert.equal(extractEphemeralCustomerKey({ phone: '٠١٠١٢٣٤٥٦٧٨' }), 'phone:01012345678');

  // 24–26: customerId fallback + unidentifiable excluded
  const orders = {
    o1: mkOrder(1, '+20 101-234-5678', 'uid_a'),
    o2: mkOrder(2, '00201012345678', 'uid_b'),
    o3: mkOrder(3, '٠١٠١٢٣٤٥٦٧٨', null),
    o4: mkOrder(4, 'not-a-phone', 'uid_fallback_1'),
    o5: mkOrder(5, '', 'uid_fallback_1'),
    o6: mkOrder(6, null, null) // unidentifiable
  };

  const report = aggregateCouponAnalytics({ orders, rawCoupons: {}, nowMs });
  assert.equal(report.summary.couponOrders, 6);
  assert.equal(report.summary.uniqueCustomers, 2); // phone:01012345678 & uid:uid_fallback_1
  assert.equal(report.summary.repeatCustomers, 2); // both had >1 order
  assert.equal(report.summary.repeatCustomerRatePct, 100);
  assert.equal(report.summary.avgOrdersPerCustomer, 2.5); // 5 identifiable orders / 2 unique identifiable customers
  assert.equal(report.dataQuality.missingCustomerIdentities, 1);

  // 27: PII completely absent from JSON serialized report
  const serialized = JSON.stringify(report);
  for (const forbidden of [
    '01012345678',
    '٠١٠١٢٣٤٥٦٧٨',
    'uid_fallback_1',
    'uid_a',
    'اسم عميل سري للغاية',
    'customer.secret@gmail.com',
    'عنوان تفصيلي سري'
  ]) {
    assert.equal(serialized.includes(forbidden), false, `PII leaked: ${forbidden}`);
  }
});

// ============================================================================
// SECTION D & E: Financial aggregation & Order status classification (Tests 29–50)
// ============================================================================
test('Section D & E (29–50): Financial formulas, zero-division protection & strict status classification', () => {
  // Status mapping (39–50)
  assert.equal(normalizeAnalyticsOrderStatus('New'), 'new');
  assert.equal(normalizeAnalyticsOrderStatus('new'), 'new');
  assert.equal(normalizeAnalyticsOrderStatus('جديد'), 'new');
  assert.equal(normalizeAnalyticsOrderStatus('processing'), 'processing');
  assert.equal(normalizeAnalyticsOrderStatus('قيد التجهيز'), 'processing');
  assert.equal(normalizeAnalyticsOrderStatus('تم التواصل'), 'processing');
  assert.equal(normalizeAnalyticsOrderStatus('shipped'), 'shipped');
  assert.equal(normalizeAnalyticsOrderStatus('جاري الشحن'), 'shipped');
  assert.equal(normalizeAnalyticsOrderStatus('تم الشحن'), 'shipped');
  assert.equal(normalizeAnalyticsOrderStatus('delivered'), 'delivered');
  assert.equal(normalizeAnalyticsOrderStatus('completed'), 'delivered');
  assert.equal(normalizeAnalyticsOrderStatus('تم التوصيل'), 'delivered');
  assert.equal(normalizeAnalyticsOrderStatus('مكتمل'), 'delivered');
  assert.equal(normalizeAnalyticsOrderStatus('cancelled'), 'cancelled');
  assert.equal(normalizeAnalyticsOrderStatus('canceled'), 'cancelled');
  assert.equal(normalizeAnalyticsOrderStatus('ملغي'), 'cancelled');
  assert.equal(normalizeAnalyticsOrderStatus('totally_unknown_status'), 'unknown');
  assert.equal(normalizeAnalyticsOrderStatus('returned'), 'unknown');
  assert.equal(normalizeAnalyticsOrderStatus('refunded'), 'unknown');
  assert.equal(normalizeAnalyticsOrderStatus('مرتجع'), 'unknown');
  assert.equal(normalizeAnalyticsOrderStatus(''), 'unknown');

  const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);
  const mkStatusOrder = (id, status, eligibleSubtotal, discountAmount, shippingFee, totalAmount) => ({
    invoiceCode: `S-${id}`,
    timestamp: nowMs,
    status,
    phone: `0101234567${id}`,
    subtotal: eligibleSubtotal,
    shippingFee,
    totalAmount,
    coupon: {
      id: 'cpn_fin',
      code: 'FIN10',
      discountType: 'percentage',
      discountValue: 10,
      scope: 'all',
      eligibleSubtotal,
      discountAmount,
      eligibleProductLines: [{ productId: 'p1', categorySlug: 'hair-care', quantity: 1, lineSubtotal: eligibleSubtotal }]
    }
  });

  const orders = {
    o1: mkStatusOrder(1, 'delivered', 500, 50, 60, 510),
    o2: mkStatusOrder(2, 'shipped', 300, 30, 60, 330),
    o3: mkStatusOrder(3, 'cancelled', 200, 20, 60, 240),
    o4: mkStatusOrder(4, 'returned', 100, 10, 50, 140) // unknown bucket
  };

  const report = aggregateCouponAnalytics({ orders, rawCoupons: {}, nowMs });
  // 29–36, 49: Cancelled still counted in historical totals; shipping never added to eligibleSubtotal
  assert.equal(report.summary.couponOrders, 4);
  assert.equal(report.summary.eligibleSubtotal, 1100);
  assert.equal(report.summary.discountAmount, 110);
  assert.equal(report.summary.eligibleNetSales, 990);
  assert.equal(report.summary.associatedFinalOrderValue, 1220);
  assert.equal(report.summary.deliveredOrders, 1);
  assert.equal(report.summary.deliveredOrderValue, 510);
  assert.equal(report.summary.pipelineOrders, 1);
  assert.equal(report.summary.pipelineValue, 330);
  assert.equal(report.summary.cancelledOrders, 1);
  assert.equal(report.summary.cancelledOrderValue, 240);
  assert.equal(report.summary.unknownStatusOrders, 1);
  assert.equal(report.summary.unknownStatusValue, 140);
  assert.equal(report.dataQuality.unknownOrderStatuses, 1);

  // 37: Zero denominator safety
  const emptyReport = aggregateCouponAnalytics({ orders: {}, rawCoupons: {}, nowMs });
  assert.equal(emptyReport.summary.avgDiscountPerOrder, 0);
  assert.equal(emptyReport.summary.effectiveDiscountRatePct, 0);
  assert.equal(emptyReport.summary.repeatCustomerRatePct, 0);
  assert.equal(Number.isNaN(emptyReport.summary.avgDiscountPerOrder), false);
});

// ============================================================================
// SECTION F: Category and product aggregation (Tests 51–58)
// ============================================================================
test('Section F (51–58): Category and product aggregation from historical snapshots only', () => {
  const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);
  const orders = {
    o1: {
      invoiceCode: 'P-1',
      timestamp: nowMs,
      status: 'delivered',
      phone: '01011111111',
      totalAmount: 500,
      products: [
        { id: 'prod_a', name: 'الاسم التاريخي للمنتج أ', quantity: 2, price: 150 },
        { id: 'prod_b', name: 'منتج غير مصنف تاريخياً', quantity: 1, price: 100 }
      ],
      coupon: {
        id: 'c1',
        code: 'ALL10',
        discountType: 'percentage',
        discountValue: 10,
        scope: 'all',
        eligibleSubtotal: 400,
        discountAmount: 40,
        eligibleProductLines: [
          { productId: 'prod_a', categorySlug: 'hair-care', quantity: 2, lineSubtotal: 300 },
          { productId: 'prod_b', categorySlug: null, quantity: 1, lineSubtotal: 100 }
        ]
      }
    },
    o2: {
      invoiceCode: 'P-2',
      timestamp: nowMs,
      status: 'delivered',
      phone: '01011111111', // same customer
      totalAmount: 300,
      products: {}, // missing product name -> fallback to ID
      coupon: {
        id: 'c1',
        code: 'ALL10',
        discountType: 'percentage',
        discountValue: 10,
        scope: 'all',
        eligibleSubtotal: 300,
        discountAmount: 30,
        eligibleProductLines: [
          { productId: 'prod_a', categorySlug: 'hair-care', quantity: 1, lineSubtotal: 150 },
          { productId: 'prod_missing_name', categorySlug: 'body-care', quantity: 1, lineSubtotal: 150 }
        ]
      }
    }
  };

  const report = aggregateCouponAnalytics({ orders, rawCoupons: {}, nowMs });
  const hairCat = report.categoryBreakdown.find((c) => c.categorySlug === 'hair-care');
  const unknownCat = report.categoryBreakdown.find((c) => c.categorySlug === 'unknown');
  const prodA = report.productBreakdown.find((p) => p.productId === 'prod_a');
  const prodMissing = report.productBreakdown.find((p) => p.productId === 'prod_missing_name');

  assert.equal(hairCat.eligibleQuantity, 3);
  assert.equal(hairCat.eligibleSubtotal, 450);
  assert.equal(hairCat.couponOrders, 2);
  assert.equal(hairCat.uniqueCustomers, 1);

  assert.ok(unknownCat);
  assert.equal(unknownCat.eligibleSubtotal, 100);

  assert.equal(prodA.productName, 'الاسم التاريخي للمنتج أ');
  assert.equal(prodA.eligibleQuantity, 3);
  assert.equal(prodA.eligibleSubtotal, 450);
  assert.equal(prodA.couponOrders, 2);

  assert.equal(prodMissing.productName, 'prod_missing_name');
  assert.equal(prodMissing.hasMissingHistoricalName, true);
  assert.equal(report.dataQuality.missingHistoricalProductNames, 2); // prod_a in o2 + prod_missing_name in o2

  const totalProdSub = report.productBreakdown.reduce((acc, p) => acc + p.eligibleSubtotal, 0);
  assert.equal(totalProdSub, 700);
});

// ============================================================================
// SECTION G: Cairo dates and periods (Tests 59–72)
// ============================================================================
test('Section G (59–72): Africa/Cairo calendar boundaries, appliedAt fallback, periods, comparison & unknown dates', () => {
  // Cairo in Nov 2026 is UTC+2. 2026-11-15T22:30:00Z = 2026-11-16 00:30 Cairo!
  const utcLateNight = Date.UTC(2026, 10, 15, 22, 30, 0);
  assert.equal(getCairoDateKey(utcLateNight), '2026-11-16');

  const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0); // 2026-11-15 Cairo
  const mkDatedOrder = (id, ts, appliedAt) => ({
    invoiceCode: `D-${id}`,
    timestamp: ts,
    status: 'delivered',
    phone: `0102000000${id}`,
    totalAmount: 200,
    coupon: {
      id: 'cpn_date',
      code: 'DATE10',
      discountType: 'fixed',
      discountValue: 20,
      scope: 'all',
      eligibleSubtotal: 200,
      discountAmount: 20,
      appliedAt,
      eligibleProductLines: [{ productId: 'p1', categorySlug: 'skin-care', quantity: 1, lineSubtotal: 200 }]
    }
  });

  const tsInfoFallback = resolveOrderTimestampInfo(mkDatedOrder(1, null, Date.UTC(2026, 10, 15, 10, 0, 0)));
  assert.equal(tsInfoFallback.usedAppliedAtFallback, true);
  assert.equal(tsInfoFallback.cairoDateKey, '2026-11-15');

  const orders = {
    today_midnight_cairo: mkDatedOrder(1, Date.UTC(2026, 10, 14, 22, 30, 0), null), // 2026-11-15 00:30 Cairo -> today!
    within_7d: mkDatedOrder(2, Date.UTC(2026, 10, 10, 12, 0, 0), null), // Nov 10
    within_30d: mkDatedOrder(3, Date.UTC(2026, 9, 25, 12, 0, 0), null), // Oct 25
    within_90d: mkDatedOrder(4, Date.UTC(2026, 8, 5, 12, 0, 0), null), // Sep 5
    prev_7d_period: mkDatedOrder(5, Date.UTC(2026, 10, 5, 12, 0, 0), null), // Nov 5 (previous 7d vs Nov 9..15!)
    applied_fallback: mkDatedOrder(6, 'bad-ts', Date.UTC(2026, 10, 15, 9, 0, 0)), // Nov 15 via appliedAt
    missing_ts: mkDatedOrder(7, null, null)
  };

  // today
  const rToday = aggregateCouponAnalytics({ orders, filters: { period: 'today' }, nowMs });
  assert.equal(rToday.summary.couponOrders, 2); // #1 + #6
  assert.equal(rToday.dataQuality.appliedAtFallbacks, 1);

  // 7d (Nov 9..Nov 15 vs Nov 2..Nov 8)
  const r7d = aggregateCouponAnalytics({ orders, filters: { period: '7d' }, nowMs });
  assert.equal(r7d.summary.couponOrders, 3); // #1, #2, #6
  assert.equal(r7d.comparison.available, true);
  assert.equal(r7d.comparison.previousFrom, '2026-11-02');
  assert.equal(r7d.comparison.previousTo, '2026-11-08');
  assert.equal(r7d.comparison.metrics.couponOrders.previous, 1); // #5

  // 30d (Oct 17..Nov 15)
  const r30d = aggregateCouponAnalytics({ orders, filters: { period: '30d' }, nowMs });
  assert.equal(r30d.summary.couponOrders, 5); // #1,#2,#3,#5,#6

  // 90d
  const r90d = aggregateCouponAnalytics({ orders, filters: { period: '90d' }, nowMs });
  assert.equal(r90d.summary.couponOrders, 6);

  // this_month (Nov 1..Nov 15)
  const rThisMonth = aggregateCouponAnalytics({ orders, filters: { period: 'this_month' }, nowMs });
  assert.equal(rThisMonth.window.from, '2026-11-01');
  assert.equal(rThisMonth.window.to, '2026-11-15');
  assert.equal(rThisMonth.summary.couponOrders, 4); // #1, #2, #5, #6

  // prev_month (Oct 1..Oct 31)
  const rPrevMonth = aggregateCouponAnalytics({ orders, filters: { period: 'prev_month' }, nowMs });
  assert.equal(rPrevMonth.window.from, '2026-10-01');
  assert.equal(rPrevMonth.window.to, '2026-10-31');
  assert.equal(rPrevMonth.summary.couponOrders, 1); // #3

  // all time includes missing_ts and tracks data quality
  const rAll = aggregateCouponAnalytics({ orders, filters: { period: 'all' }, nowMs });
  assert.equal(rAll.summary.couponOrders, 7);
  assert.equal(rAll.dataQuality.missingTimestamps, 1);
  assert.equal(rAll.comparison.available, false);

  // custom range
  const rCustom = aggregateCouponAnalytics({
    orders,
    filters: { period: 'custom', from: '2026-11-01', to: '2026-11-10' },
    nowMs
  });
  assert.equal(rCustom.summary.couponOrders, 2); // #2 (Nov 10) + #5 (Nov 5)
  assert.equal(rCustom.window.dayCount, 10);
  assert.equal(rCustom.comparison.previousFrom, '2026-10-22');
  assert.equal(rCustom.comparison.previousTo, '2026-10-31');

  // Invalid date ranges rejected
  assert.equal(parseAnalyticsFilters({ period: 'custom', from: '2026-11-10', to: '2026-11-01' }, nowMs).valid, false);
  assert.equal(parseAnalyticsFilters({ period: 'custom', from: '2026-02-30', to: '2026-03-01' }, nowMs).valid, false);
  assert.equal(parseAnalyticsFilters({ period: 'custom', from: '2026-11-01' }, nowMs).valid, false);
});

// ============================================================================
// SECTION H: API security and behavior (Tests 73–86)
// ============================================================================
test('Section H (73–86): Admin API authentication, DB access pattern, no-writes, headers, 405 & zero PII', async () => {
  const { nowMs, rawCoupons, orders } = buildStandardFixtures();
  const { db, reads, writes } = createMockAdminDb({
    orders,
    settings: { coupons: rawCoupons }
  });

  // 73: Unauthenticated -> 401
  const unauthRes = await analyticsGET({
    request: new Request('http://localhost:3000/api/coupons/analytics'),
    _deps: makeAuthDeps(db, { nowMs })
  });
  assert.equal(unauthRes.status, 401);

  // 74: Unverified admin -> 403
  const unverifiedRes = await analyticsGET({
    request: new Request('http://localhost:3000/api/coupons/analytics', {
      headers: { Authorization: 'Bearer token-unverified' }
    }),
    _deps: makeAuthDeps(db, { nowMs })
  });
  assert.equal(unverifiedRes.status, 403);

  // 75: Non-admin user -> 403
  const nonAdminRes = await analyticsGET({
    request: new Request('http://localhost:3000/api/coupons/analytics', {
      headers: { Authorization: 'Bearer token-non-admin' }
    }),
    _deps: makeAuthDeps(db, { nowMs })
  });
  assert.equal(nonAdminRes.status, 403);

  // 77: Missing Firebase Admin DB -> safe 503
  const noDbRes = await analyticsGET({
    request: new Request('http://localhost:3000/api/coupons/analytics', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }),
    _deps: makeAuthDeps(null, { nowMs })
  });
  assert.equal(noDbRes.status, 503);

  // 78: Malformed query parameters rejected safely (400)
  for (const badQuery of [
    '?period=yearly',
    '?period=custom&from=2026-11-10&to=2026-11-01',
    '?status=bogus',
    '?categorySlug=electronics',
    '?scope=vip',
    '?discountType=crypto',
    '?format=xml',
    '?format=csv&dataset=users',
    '?unexpectedParam=1'
  ]) {
    const badRes = await analyticsGET({
      request: new Request(`http://localhost:3000/api/coupons/analytics${badQuery}`, {
        headers: { Authorization: 'Bearer valid-admin-token' }
      }),
      _deps: makeAuthDeps(db, { nowMs })
    });
    assert.equal(badRes.status, 400, `Expected 400 for ${badQuery}`);
  }

  // 76, 79–84, 86: Valid admin request succeeds with bounded reads, zero writes, no-cache headers, zero PII
  const okRes = await analyticsGET({
    request: new Request('http://localhost:3000/api/coupons/analytics?period=all', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }),
    _deps: makeAuthDeps(db, { nowMs })
  });
  assert.equal(okRes.status, 200);
  assert.match(okRes.headers.get('Cache-Control') || '', /no-store/);
  assert.equal(okRes.headers.get('Pragma'), 'no-cache');
  assert.equal(okRes.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(okRes.headers.get('X-Content-Type-Options'), 'nosniff');

  assert.equal(reads.length, 2);
  assert.deepEqual(reads.map((r) => r.path).sort(), ['orders', 'settings/coupons']);
  assert.equal(writes.length, 0);

  const bodyText = await okRes.text();
  const payload = JSON.parse(bodyText);
  assert.equal(payload.success, true);
  assert.equal(payload.timezone, 'Africa/Cairo');
  assert.equal(payload.summary.couponOrders, 4);

  // Zero raw orders / zero PII / zero createdBy/updatedBy
  for (const leak of [
    '01012345678',
    '٠١٠١٢٣٤٥٦٧٨',
    'cust_sara_secret',
    'uid_mariam_99',
    'سارة أحمد',
    'مريم حسن',
    'sara.pii@example.com',
    '15 شارع التحرير',
    'secret-staff@dandy.com',
    'admin@dandy.com'
  ]) {
    assert.equal(bodyText.includes(leak), false, `API leaked sensitive field: ${leak}`);
  }

  // 85: Unsupported HTTP methods -> 405
  for (const handler of [analyticsPOST, analyticsPUT, analyticsPATCH, analyticsDELETE, analyticsALL]) {
    const mRes = await handler();
    assert.equal(mRes.status, 405);
    assert.equal(mRes.headers.get('Allow'), 'GET');
  }
});

// ============================================================================
// SECTION I: CSV export (Tests 87–96)
// ============================================================================
test('Section I (87–96): CSV datasets, UTF-8 BOM, escaping, formula injection neutralization, PII absence & server filters', async () => {
  const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);
  const { orders, rawCoupons } = buildStandardFixtures();
  // Add an order with dangerous CSV formula characters & commas/quotes/newlines in historical product name
  orders.ord_formula = {
    invoiceCode: '=CMD("calc")',
    timestamp: nowMs - 1000,
    status: 'delivered',
    phone: '01088888888',
    customerId: 'uid_formula_pii',
    name: 'خطر الصيغة',
    totalAmount: 180,
    products: [
      { id: 'prod_eq', name: '+SUM(1,2), "عرض خاص"\nسطر جديد', quantity: 1, price: 200 }
    ],
    coupon: {
      id: 'cpn_welcome',
      code: 'WELCOME20',
      discountType: 'percentage',
      discountValue: 10,
      scope: 'all',
      eligibleSubtotal: 200,
      discountAmount: 20,
      eligibleProductLines: [{ productId: 'prod_eq', categorySlug: 'skin-care', quantity: 1, lineSubtotal: 200 }]
    }
  };

  // Formula injection unit checks (93–94)
  assert.equal(sanitizeCsvCell('=1+1'), `"'=1+1"`);
  assert.equal(sanitizeCsvCell('+SUM(A1)'), `"'+SUM(A1)"`);
  assert.equal(sanitizeCsvCell('-cmd'), `"'-cmd"`);
  assert.equal(sanitizeCsvCell('@EXEC'), `"'@EXEC"`);
  assert.equal(sanitizeCsvCell('\t=1+1'), `"'\t=1+1"`);
  assert.equal(sanitizeCsvCell('\r=1+1'), `"'\r=1+1"`);
  assert.equal(sanitizeCsvCell('say "hi", ok'), `"say ""hi"", ok"`);

  const { db } = createMockAdminDb({ orders, settings: { coupons: rawCoupons } });

  for (const dataset of ['coupons', 'uses', 'products', 'categories']) {
    const res = await analyticsGET({
      request: new Request(`http://localhost:3000/api/coupons/analytics?format=csv&dataset=${dataset}&period=all`, {
        headers: { Authorization: 'Bearer valid-admin-token' }
      }),
      _deps: makeAuthDeps(db, { nowMs })
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('Content-Type') || '', /text\/csv; charset=utf-8/i);
    assert.match(res.headers.get('Content-Disposition') || '', new RegExp(`dandy-coupon-analytics-${dataset}-2026-11-15\\.csv`));

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf], `Missing UTF-8 BOM bytes for ${dataset}`);
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    assert.equal(text.charCodeAt(0), 0xFEFF, `Missing UTF-8 BOM for ${dataset}`);
    assert.equal(text.includes('01088888888'), false);
    assert.equal(text.includes('uid_formula_pii'), false);
    assert.equal(text.includes('خطر الصيغة'), false);
    assert.equal(text.includes('sara.pii@example.com'), false);
  }

  // Check uses CSV neutralizes '=CMD("calc")' and products CSV neutralizes '+SUM(1,2), "عرض خاص"'
  const usesCsvRes = await analyticsGET({
    request: new Request('http://localhost:3000/api/coupons/analytics?format=csv&dataset=uses&period=today', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }),
    _deps: makeAuthDeps(db, { nowMs })
  });
  const usesCsv = await usesCsvRes.text();
  assert.ok(usesCsv.includes(`"'=CMD(""calc"")"`));
  // 96: Respects server filter period=today (excludes Oct 20 LEGACY50)
  assert.equal(usesCsv.includes('LEGACY50'), false);

  const productsCsvRes = await analyticsGET({
    request: new Request('http://localhost:3000/api/coupons/analytics?format=csv&dataset=products&period=all', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }),
    _deps: makeAuthDeps(db, { nowMs })
  });
  const productsCsv = await productsCsvRes.text();
  assert.ok(productsCsv.includes(`"'+SUM(1,2), ""عرض خاص""\nسطر جديد"`));

  // Verify buildCouponAnalyticsCsv directly for > 50 uses when includeAllUsesForCsv is true
  const manyOrders = {};
  for (let i = 1; i <= 55; i++) {
    manyOrders[`m_${i}`] = {
      invoiceCode: `MANY-${i}`,
      timestamp: nowMs - i * 1000,
      status: 'delivered',
      phone: `01000000${String(i).padStart(3, '0')}`,
      totalAmount: 100,
      coupon: {
        id: 'cpn_welcome',
        code: 'WELCOME20',
        discountType: 'fixed',
        discountValue: 10,
        scope: 'all',
        eligibleSubtotal: 100,
        discountAmount: 10,
        eligibleProductLines: [{ productId: 'p1', categorySlug: 'skin-care', quantity: 1, lineSubtotal: 100 }]
      }
    };
  }
  const fullUsesReport = aggregateCouponAnalytics({ orders: manyOrders, includeAllUsesForCsv: true, nowMs });
  const { csvContent } = buildCouponAnalyticsCsv({ report: fullUsesReport, dataset: 'uses' });
  assert.ok(csvContent.includes('MANY-55'));
});

// ============================================================================
// SECTION J: Dashboard UI static & DOM runtime tests (Tests 97–108)
// ============================================================================
test('Section J (97–108): Dashboard UI auth, API-only fetches, interactive filtering, detail panel, charts reuse & RTL/mobile', async () => {
  const [dashSrc, navSrc, couponsDashSrc] = await Promise.all([
    fs.readFile(path.resolve('src/pages/dashboard-coupon-analytics.astro'), 'utf8'),
    fs.readFile(path.resolve('src/components/DashboardNav.astro'), 'utf8'),
    fs.readFile(path.resolve('src/pages/dashboard-coupons.astro'), 'utf8')
  ]);

  // 97–99: Auth pattern, protected API, zero direct RTDB reads, RTL & responsive CSS
  assert.match(dashSrc, /showDashboardNav=\{true\}/);
  assert.match(dashSrc, /robots="noindex, nofollow"/);
  assert.match(dashSrc, /admin@dandy\.com/);
  assert.match(dashSrc, /emailVerified\s*!==\s*true/);
  assert.match(dashSrc, /getIdToken\(\)/);
  assert.match(dashSrc, /\/api\/coupons\/analytics/);
  assert.equal(/firebase\.database\(\)|window\.db|settings\/coupons['"]\s*\)/.test(dashSrc), false);
  assert.match(dashSrc, /dir="rtl"/);
  assert.match(dashSrc, /overflow-x:\s*auto/);
  assert.match(dashSrc, /Chart\.js\/4\.4\.0\/chart\.umd\.min\.js/);
  assert.match(navSrc, /href:\s*'\/dashboard-coupon-analytics'/);
  assert.match(navSrc, /label:\s*'تحليلات الكوبونات'/);
  assert.match(couponsDashSrc, /href="\/dashboard-coupon-analytics"/);

  // Extract inline script and execute in VM with DOM mocks
  const scriptMatches = [...dashSrc.matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)];
  assert.equal(scriptMatches.length, 1);
  const scriptCode = scriptMatches[0][1];

  const { nowMs, rawCoupons, orders } = buildStandardFixtures();
  const fetchCalls = [];
  const chartDestroys = [];
  const chartConstructs = [];

  class MockElement {
    constructor(id = '') {
      this.id = id;
      this.value = id === 'filterPeriodSelect' ? 'all' : id === 'couponTableSortSelect' ? 'couponOrders:desc' : (id === 'filterCategorySelect' || id === 'filterTypeSelect' || id === 'filterStatusSelect') ? 'all' : '';
      this.textContent = '';
      this._innerHTML = '';
      this.style = { display: '' };
      this.children = [];
      this.options = [];
      this.disabled = false;
      this.listeners = {};
      const clsSet = new Set();
      this.classList = {
        add: (...c) => c.forEach((x) => clsSet.add(x)),
        remove: (...c) => c.forEach((x) => clsSet.delete(x)),
        toggle: (x, f) => (f === undefined ? (clsSet.has(x) ? clsSet.delete(x) : clsSet.add(x)) : (f ? clsSet.add(x) : clsSet.delete(x))),
        contains: (x) => clsSet.has(x)
      };
      this.attrs = {};
    }
    set innerHTML(v) {
      this._innerHTML = String(v);
      this.children = [];
      // Parse simple <button data-select-coupon="..."> for testing row selection
      for (const m of this._innerHTML.matchAll(/data-select-coupon="([^"]+)"/g)) {
        const b = new MockElement();
        b.setAttribute('data-select-coupon', m[1]);
        this.children.push(b);
      }
    }
    get innerHTML() {
      return this._innerHTML;
    }
    appendChild(child) {
      this.children.push(child);
      if (child.tagName === 'OPTION') {
        this.options.push(child);
      }
      if (child.innerHTML && child.innerHTML.includes('data-select-coupon')) {
        for (const m of child.innerHTML.matchAll(/data-select-coupon="([^"]+)"/g)) {
          const b = new MockElement();
          b.setAttribute('data-select-coupon', m[1]);
          this.children.push(b);
        }
      }
    }
    removeChild() {}
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(ev, fn) {
      if (!this.listeners[ev]) this.listeners[ev] = [];
      this.listeners[ev].push(fn);
    }
    async dispatch(ev, extra = {}) {
      for (const fn of this.listeners[ev] || []) {
        await fn({ target: extra.target || this, stopPropagation() {}, preventDefault() {} });
      }
    }
    click() { return this.dispatch('click'); }
    scrollIntoView() {}
    contains() { return false; }
    closest(sel) {
      if (sel === '[data-select-coupon]' && this.attrs['data-select-coupon']) return this;
      return null;
    }
  }

  const elementsById = new Map();
  const getEl = (id) => {
    if (!elementsById.has(id)) elementsById.set(id, new MockElement(id));
    return elementsById.get(id);
  };
  for (const id of [
    'lastUpdatedCairoText', 'btnRefreshAnalytics', 'btnExportDropdownToggle', 'exportDropdownMenu',
    'filterPeriodSelect', 'filterCouponSelect', 'filterCategorySelect', 'filterScopeSelect',
    'filterTypeSelect', 'filterStatusSelect', 'filterFromInput', 'filterToInput',
    'customDateRangeRow', 'customDateValidationMsg', 'btnApplyFilters', 'btnClearFilters',
    'activeWindowText', 'analyticsErrorBanner', 'analyticsErrorMessage', 'btnRetryAnalytics',
    'analyticsEmptyBanner', 'analyticsEmptyMessage', 'analyticsDataQualityBanner', 'analyticsDataQualityText',
    'analyticsLoadingState', 'analyticsMainContent', 'kpiCouponOrders', 'kpiCouponOrdersSub',
    'kpiUniqueCustomers', 'kpiUniqueCustomersSub', 'kpiDiscountAmount', 'kpiDiscountAmountSub',
    'kpiEligibleSubtotal', 'kpiEligibleSubtotalSub', 'kpiEligibleNetSales', 'kpiEligibleNetSalesSub',
    'kpiAvgDiscount', 'kpiAvgDiscountSub', 'kpiCouponsUsedCount', 'kpiCouponsUsedSub',
    'kpiRepeatRate', 'kpiRepeatRateSub', 'valAssociatedOrders', 'valDeliveredOrders',
    'valDeliveredSub', 'valPipelineOrders', 'valPipelineSub', 'valCancelledOrders', 'valCancelledSub',
    'couponDetailPanel', 'detailCouponHeading', 'detailCouponSubheading', 'btnCloseCouponDetail',
    'detailCurrentDefinitionList', 'detailHistoricalSummaryList', 'detailHistoricalConfigsBody',
    'detailCategoryBody', 'detailProductBody', 'detailRecentUsesBody',
    'couponTableSearch', 'couponTableSortSelect', 'couponsPerformanceBody',
    'chartUsageOverTime', 'emptyChartUsage', 'chartDiscountsOverTime', 'emptyChartDiscounts',
    'chartTopCouponsUsage', 'emptyChartTopUsage', 'chartTopCouponsDiscount', 'emptyChartTopDiscount',
    'chartCategorySales', 'emptyChartCategories', 'chartStatusDistribution', 'emptyChartStatus',
    'chartProductPerformance', 'emptyChartProducts',
    'categoryBreakdownBody', 'productBreakdownBody', 'recentUsesBody'
  ]) {
    getEl(id);
  }

  const exportButtons = ['coupons', 'uses', 'products', 'categories'].map((ds) => {
    const b = new MockElement(`export-${ds}`);
    b.setAttribute('data-csv-dataset', ds);
    return b;
  });

  const mockDocument = {
    readyState: 'complete',
    body: new MockElement('body'),
    getElementById: (id) => getEl(id),
    querySelectorAll: (sel) => (sel === '[data-csv-dataset]' ? exportButtons : []),
    createElement: (tag) => {
      const e = new MockElement();
      e.tagName = tag.toUpperCase();
      return e;
    },
    addEventListener: () => {}
  };

  class MockChart {
    constructor(canvas, config) {
      this.canvasId = canvas.id;
      this.config = config;
      chartConstructs.push(canvas.id);
    }
    destroy() {
      chartDestroys.push(this.canvasId);
    }
  }

  const { db } = createMockAdminDb({ orders, settings: { coupons: rawCoupons } });

  let createdBlobUrl = '';
  const sandbox = {
    window: {
      location: { href: 'http://localhost:3000/dashboard-coupon-analytics', replace(u) { this.href = u; } },
      auth: {
        currentUser: {
          email: 'admin@dandy.com',
          emailVerified: true,
          async getIdToken() { return 'valid-admin-token'; }
        },
        onAuthStateChanged(cb) {
          this._cb = cb;
          setTimeout(() => cb(this.currentUser), 0);
        }
      }
    },
    document: mockDocument,
    Chart: MockChart,
    URLSearchParams,
    URL: {
      createObjectURL: () => { createdBlobUrl = 'blob:mock-csv'; return createdBlobUrl; },
      revokeObjectURL: () => {}
    },
    fetch: async (url, opts) => {
      fetchCalls.push({ url, opts });
      return await analyticsGET({
        request: new Request(`http://localhost:3000${url}`, {
          method: opts?.method || 'GET',
          headers: opts?.headers || {}
        }),
        _deps: makeAuthDeps(db, { nowMs })
      });
    },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);

  await new Promise((r) => setTimeout(r, 40));

  // Initial load assertions (100–105)
  assert.equal(fetchCalls.length, 1);
  assert.equal(getEl('kpiCouponOrders').textContent, '4');
  assert.equal(getEl('kpiUniqueCustomers').textContent, '2');
  assert.equal(getEl('analyticsMainContent').style.display, 'block');
  // Zero-use coupon UNUSED15 present in table
  assert.ok(getEl('couponsPerformanceBody').children.some((tr) => tr.innerHTML.includes('UNUSED15')));
  assert.equal(chartConstructs.length, 7);

  // Filter update destroys existing charts before recreating (no duplicate instances!)
  getEl('filterPeriodSelect').value = 'today';
  await getEl('btnApplyFilters').dispatch('click');
  assert.equal(fetchCalls.length, 2);
  assert.match(fetchCalls[1].url, /period=today/);
  assert.equal(getEl('kpiCouponOrders').textContent, '1');
  assert.equal(chartDestroys.length, 7);

  // Select a coupon row -> opens detail panel
  const rowBtn = new MockElement();
  rowBtn.setAttribute('data-select-coupon', 'id:cpn_welcome');
  await getEl('couponsPerformanceBody').dispatch('click', { target: rowBtn });
  assert.equal(getEl('couponDetailPanel').classList.contains('show'), true);
  assert.ok(getEl('detailCouponHeading').textContent.includes('WELCOME20'));
  assert.ok(getEl('detailCouponSubheading').textContent.includes('OLDWELC15'));

  // CSV export uses active filters
  await exportButtons[0].dispatch('click');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(fetchCalls.length, 3);
  assert.match(fetchCalls[2].url, /format=csv/);
  assert.match(fetchCalls[2].url, /dataset=coupons/);
  assert.match(fetchCalls[2].url, /period=today/);
  assert.equal(createdBlobUrl, 'blob:mock-csv');
});

// ============================================================================
// SECTION K: Architecture protection (Tests 109–117)
// ============================================================================
test('Section K (109–117): Zero usage counters, redemption ledgers, analytics writes or inventory introduced', async () => {
  const [
    utilSrc,
    apiSrc,
    dashSrc,
    couponsSrc,
    createOrderSrc,
    statuesSrc,
    rulesSrc
  ] = await Promise.all([
    fs.readFile(path.resolve('src/utils/coupon-analytics.ts'), 'utf8'),
    fs.readFile(path.resolve('src/pages/api/coupons/analytics.js'), 'utf8'),
    fs.readFile(path.resolve('src/pages/dashboard-coupon-analytics.astro'), 'utf8'),
    fs.readFile(path.resolve('src/utils/coupons.ts'), 'utf8'),
    fs.readFile(path.resolve('src/pages/api/create-order.js'), 'utf8'),
    fs.readFile(path.resolve('src/pages/statues.astro'), 'utf8'),
    fs.readFile(path.resolve('firebase/database.rules.json'), 'utf8')
  ]);

  for (const src of [utilSrc, apiSrc, dashSrc, couponsSrc]) {
    assert.equal(/\b(usageCount|usedCount|usageLimit|lastUsedAt|couponRedemptions|couponUsage|stockQuantity)\b/i.test(src), false);
  }
  assert.equal(/\.(set|update|push|remove|transaction)\s*\(/i.test(apiSrc), false);
  assert.equal(/\.on\s*\(/i.test(apiSrc), false);
  assert.equal(/couponRedemptions/i.test(createOrderSrc), false);
  assert.ok(statuesSrc.includes('لوحة ذكاء الأعمال والتحليلات المؤسسية'));
  const rules = JSON.parse(rulesSrc);
  assert.equal(rules.rules.orders['.write'], false);
  assert.match(String(rules.rules.orders['.read']), /email_verified == true/);
  assert.equal(rules.rules.settings['.read'], false);
  assert.equal(rules.rules.settings['.write'], false);
});

// ============================================================================
// SECTION L: GROUP 2A.7.1 Analytics Data Integrity & Category Filter Semantics
// ============================================================================
test('Section L1: Incomplete or mismatched eligibleProductLines retain top-level coupon financials and contribute ZERO to product/category breakdowns & CSV exports', () => {
  const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);
  const orders = {
    ord_complete: {
      invoiceCode: 'DND-COMP-1',
      timestamp: nowMs - 1000,
      status: 'delivered',
      phone: '01011112222',
      totalAmount: 450,
      products: [
        { id: 'prod_good', name: 'شامبو صالح', quantity: 1, price: 500 }
      ],
      coupon: {
        id: 'cpn_mix',
        code: 'MIX10',
        discountType: 'percentage',
        discountValue: 10,
        scope: 'all',
        eligibleSubtotal: 500,
        discountAmount: 50,
        eligibleProductLines: [
          { productId: 'prod_good', categorySlug: 'hair-care', quantity: 1, lineSubtotal: 500 }
        ]
      }
    },
    ord_malformed: {
      invoiceCode: 'DND-MAL-2',
      timestamp: nowMs - 2000,
      status: 'processing',
      phone: '01022223333',
      totalAmount: 220,
      products: [
        { id: 'prod_mal', name: 'منتج تالف السطور', quantity: 2, price: 100 }
      ],
      coupon: {
        id: 'cpn_mix',
        code: 'MIX10',
        discountType: 'percentage',
        discountValue: 10,
        scope: 'all',
        eligibleSubtotal: 200,
        discountAmount: 20,
        eligibleProductLines: 'not-an-array'
      }
    },
    ord_mismatch: {
      invoiceCode: 'DND-MISM-3',
      timestamp: nowMs - 3000,
      status: 'shipped',
      phone: '01033334444',
      totalAmount: 330,
      // Intentionally omit product names to verify excluded incomplete lines don't inflate missingHistoricalProductNames
      products: [],
      coupon: {
        id: 'cpn_mix',
        code: 'MIX10',
        discountType: 'percentage',
        discountValue: 10,
        scope: 'all',
        eligibleSubtotal: 300,
        discountAmount: 30,
        eligibleProductLines: [
          // Valid individual line shape, but sum 150 !== 300 -> lineAllocationIncomplete = true
          { productId: 'prod_partial_only', categorySlug: 'body-care', quantity: 3, lineSubtotal: 150 }
        ]
      }
    }
  };

  const report = aggregateCouponAnalytics({ orders, rawCoupons: {}, nowMs });

  // Top-level financial & order totals preserved for all 3 orders
  assert.equal(report.summary.couponOrders, 3);
  assert.equal(report.summary.uniqueCustomers, 3);
  assert.equal(report.summary.eligibleSubtotal, 1000); // 500 + 200 + 300
  assert.equal(report.summary.discountAmount, 100); // 50 + 20 + 30
  assert.equal(report.summary.eligibleNetSales, 900);
  assert.equal(report.summary.associatedFinalOrderValue, 1000); // 450 + 220 + 330
  assert.equal(report.summary.deliveredOrders, 1);
  assert.equal(report.summary.pipelineOrders, 2);

  // Data quality accurately counts incomplete allocations and omits excluded lines from missing-name count
  assert.equal(report.dataQuality.snapshotLineMismatches, 2);
  assert.equal(report.dataQuality.missingHistoricalProductNames, 0);

  // Only ord_complete contributes to categoryBreakdown & productBreakdown
  const hairCat = report.categoryBreakdown.find((c) => c.categorySlug === 'hair-care');
  const bodyCat = report.categoryBreakdown.find((c) => c.categorySlug === 'body-care');
  assert.equal(hairCat.eligibleQuantity, 1);
  assert.equal(hairCat.eligibleSubtotal, 500);
  assert.equal(hairCat.couponOrders, 1);
  assert.equal(hairCat.uniqueCustomers, 1);

  assert.equal(bodyCat.eligibleQuantity, 0);
  assert.equal(bodyCat.eligibleSubtotal, 0);
  assert.equal(bodyCat.couponOrders, 0);
  assert.equal(bodyCat.uniqueCustomers, 0);

  assert.equal(report.productBreakdown.length, 1);
  assert.equal(report.productBreakdown[0].productId, 'prod_good');
  assert.equal(report.productBreakdown.some((p) => p.productId === 'prod_partial_only'), false);

  // Per-coupon breakdowns also exclude incomplete lines
  const mixCoupon = report.coupons.find((c) => c.couponId === 'cpn_mix');
  assert.equal(mixCoupon.couponOrders, 3);
  assert.equal(mixCoupon.eligibleSubtotal, 1000);
  assert.equal(mixCoupon.discountAmount, 100);
  assert.equal(mixCoupon.productBreakdown.length, 1);
  assert.equal(mixCoupon.categoryBreakdown.find((c) => c.categorySlug === 'body-care').eligibleSubtotal, 0);

  // Incomplete line order does NOT trigger line-level category filter attribution when scope === 'all'
  const bodyFilteredReport = aggregateCouponAnalytics({
    orders,
    rawCoupons: {},
    filters: { period: 'all', categorySlug: 'body-care' },
    nowMs
  });
  assert.equal(bodyFilteredReport.summary.couponOrders, 0);

  // All 3 orders remain visible in recentUses with explicit lineAllocationIncomplete flag
  assert.equal(report.recentUses.length, 3);
  const malUse = report.recentUses.find((u) => u.invoiceCode === 'DND-MAL-2');
  const mismUse = report.recentUses.find((u) => u.invoiceCode === 'DND-MISM-3');
  const compUse = report.recentUses.find((u) => u.invoiceCode === 'DND-COMP-1');
  assert.equal(malUse.lineAllocationIncomplete, true);
  assert.equal(mismUse.lineAllocationIncomplete, true);
  assert.equal(compUse.lineAllocationIncomplete, false);

  // CSV products and categories exports do NOT contain partial lines
  const { csvContent: productsCsv } = buildCouponAnalyticsCsv({ report, dataset: 'products' });
  const { csvContent: categoriesCsv } = buildCouponAnalyticsCsv({ report, dataset: 'categories' });
  assert.equal(productsCsv.includes('prod_partial_only'), false);
  assert.ok(productsCsv.includes('prod_good'));
  // body-care row in categories CSV must have 0 quantity and 0.00 subtotal
  assert.ok(categoriesCsv.includes('"body-care","العناية بالجسم","0","0.00","0","0","0.00"'));
});

test('Section L2: Strict historical coupon snapshot validation (canonical categories, scope=all, fixed+maxDiscount, legacy snapshots)', () => {
  // All 4 canonical category slugs accepted
  for (const slug of ['hair-care', 'body-care', 'fragrance', 'skin-care']) {
    const validCat = validateOrderCouponSnapshot({
      id: 'cpn_cat',
      code: 'CAT10',
      discountType: 'percentage',
      discountValue: 10,
      scope: 'category',
      categorySlug: slug,
      eligibleSubtotal: 200,
      discountAmount: 20
    });
    assert.ok(validCat, `Expected canonical category '${slug}' to be accepted`);
    assert.equal(validCat.categorySlug, slug);
  }

  // Unknown category slug rejected
  assert.equal(
    validateOrderCouponSnapshot({
      id: 'cpn_cat_bad',
      code: 'CAT10',
      discountType: 'percentage',
      discountValue: 10,
      scope: 'category',
      categorySlug: 'electronics',
      eligibleSubtotal: 200,
      discountAmount: 20
    }),
    null
  );

  // Empty category slug rejected
  for (const emptySlug of ['', '   ', null, undefined]) {
    assert.equal(
      validateOrderCouponSnapshot({
        id: 'cpn_cat_empty',
        code: 'CAT10',
        discountType: 'percentage',
        discountValue: 10,
        scope: 'category',
        categorySlug: emptySlug,
        eligibleSubtotal: 200,
        discountAmount: 20
      }),
      null
    );
  }

  // All-products snapshot with unexpected categorySlug rejected
  for (const unexpectedCat of ['hair-care', '', 'unknown']) {
    assert.equal(
      validateOrderCouponSnapshot({
        id: 'cpn_all_bad',
        code: 'ALL10',
        discountType: 'percentage',
        discountValue: 10,
        scope: 'all',
        categorySlug: unexpectedCat,
        eligibleSubtotal: 200,
        discountAmount: 20
      }),
      null
    );
  }

  // Fixed coupon with maximumDiscount rejected
  assert.equal(
    validateOrderCouponSnapshot({
      id: 'cpn_fixed_max',
      code: 'FIX50',
      discountType: 'fixed',
      discountValue: 50,
      scope: 'all',
      categorySlug: null,
      maximumDiscount: 100,
      eligibleSubtotal: 300,
      discountAmount: 50
    }),
    null
  );

  // Valid percentage coupon with maximumDiscount accepted
  const validPctMax = validateOrderCouponSnapshot({
    id: 'cpn_pct_max',
    code: 'PCT20',
    discountType: 'percentage',
    discountValue: 20,
    scope: 'all',
    categorySlug: null,
    maximumDiscount: 80,
    eligibleSubtotal: 500,
    discountAmount: 80
  });
  assert.ok(validPctMax);
  assert.equal(validPctMax.maximumDiscount, 80);

  // Legacy snapshot omitting optional fields (no categorySlug, minimumSubtotal, maximumDiscount, appliedAt, eligibleProductLines) preserved
  const legacyNoOptional = validateOrderCouponSnapshot({
    id: 'cpn_leg1',
    code: 'LEG10',
    discountType: 'fixed',
    discountValue: 25,
    scope: 'all',
    eligibleSubtotal: 250,
    discountAmount: 25
  });
  assert.ok(legacyNoOptional);
  assert.equal(legacyNoOptional.groupKey, 'id:cpn_leg1');
  assert.equal(legacyNoOptional.lineAllocationIncomplete, true);

  // Legacy snapshot without coupon ID preserved
  const legacyNoId = validateOrderCouponSnapshot({
    code: 'OLDNOID',
    discountType: 'percentage',
    discountValue: 15,
    scope: 'all',
    eligibleSubtotal: 400,
    discountAmount: 60
  });
  assert.ok(legacyNoId);
  assert.equal(legacyNoId.groupKey, 'code:OLDNOID');
  assert.equal(legacyNoId.couponId, null);

  // Aggregate invalid historical snapshots: increment dataQuality.invalidCouponSnapshots & contribute 0 to metrics
  const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);
  const agg = aggregateCouponAnalytics({
    orders: {
      bad_cat: {
        invoiceCode: 'INV-BAD-CAT',
        timestamp: nowMs,
        status: 'delivered',
        phone: '01012345678',
        totalAmount: 180,
        coupon: {
          id: 'cpn_bad1',
          code: 'BADCAT',
          discountType: 'percentage',
          discountValue: 10,
          scope: 'category',
          categorySlug: 'accessories',
          eligibleSubtotal: 200,
          discountAmount: 20
        }
      },
      bad_all_cat: {
        invoiceCode: 'INV-BAD-ALLCAT',
        timestamp: nowMs,
        status: 'delivered',
        phone: '01012345679',
        totalAmount: 180,
        coupon: {
          id: 'cpn_bad2',
          code: 'BADALL',
          discountType: 'percentage',
          discountValue: 10,
          scope: 'all',
          categorySlug: 'skin-care',
          eligibleSubtotal: 200,
          discountAmount: 20
        }
      },
      bad_fixed_max: {
        invoiceCode: 'INV-BAD-FIXMAX',
        timestamp: nowMs,
        status: 'delivered',
        phone: '01012345670',
        totalAmount: 150,
        coupon: {
          id: 'cpn_bad3',
          code: 'BADFIX',
          discountType: 'fixed',
          discountValue: 50,
          scope: 'all',
          maximumDiscount: 40,
          eligibleSubtotal: 200,
          discountAmount: 50
        }
      }
    },
    rawCoupons: {},
    nowMs
  });

  assert.equal(agg.dataQuality.invalidCouponSnapshots, 3);
  assert.equal(agg.dataQuality.couponOrdersIncluded, 0);
  assert.equal(agg.summary.couponOrders, 0);
  assert.equal(agg.summary.eligibleSubtotal, 0);
  assert.equal(agg.summary.discountAmount, 0);
  assert.equal(agg.summary.associatedFinalOrderValue, 0);
  assert.equal(agg.coupons.length, 0);
});

test('Section L3: Mixed-category order filter semantics and exact Arabic explanatory UI note', async () => {
  const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);
  const orders = {
    mixed_ord: {
      invoiceCode: 'DND-MIX-CAT',
      timestamp: nowMs,
      status: 'delivered',
      phone: '01055556666',
      totalAmount: 460,
      products: [
        { id: 'p_hair', name: 'شامبو', quantity: 1, price: 300 },
        { id: 'p_skin', name: 'سيروم', quantity: 1, price: 200 }
      ],
      coupon: {
        id: 'cpn_all20',
        code: 'ALL20',
        discountType: 'percentage',
        discountValue: 20,
        scope: 'all',
        categorySlug: null,
        eligibleSubtotal: 500,
        discountAmount: 100,
        eligibleProductLines: [
          { productId: 'p_hair', categorySlug: 'hair-care', quantity: 1, lineSubtotal: 300 },
          { productId: 'p_skin', categorySlug: 'skin-care', quantity: 1, lineSubtotal: 200 }
        ]
      }
    }
  };

  const catFiltered = aggregateCouponAnalytics({
    orders,
    rawCoupons: {},
    filters: { period: 'all', categorySlug: 'hair-care' },
    nowMs
  });

  // Order counted once with full order-level & coupon-level financials (not prorated)
  assert.equal(catFiltered.summary.couponOrders, 1);
  assert.equal(catFiltered.summary.uniqueCustomers, 1);
  assert.equal(catFiltered.summary.eligibleSubtotal, 500);
  assert.equal(catFiltered.summary.discountAmount, 100);
  assert.equal(catFiltered.summary.associatedFinalOrderValue, 460);

  const dashSrc = await fs.readFile(path.resolve('src/pages/dashboard-coupon-analytics.astro'), 'utf8');
  const expectedArabicNote =
    'عند اختيار قسم، يتم عرض الطلبات التي تحتوي على منتج مؤهل من هذا القسم. القيم المالية تعكس إجمالي الكوبون والطلب بالكامل، ولا تمثل خصمًا موزعًا على هذا القسم وحده.';
  assert.ok(dashSrc.includes(expectedArabicNote));
  // Ensure recent-use incomplete indicator and data-quality message exist
  assert.ok(dashSrc.includes('توزيع سطور المنتجات غير مكتمل'));
  assert.ok(dashSrc.includes('lineAllocationIncomplete'));
});

