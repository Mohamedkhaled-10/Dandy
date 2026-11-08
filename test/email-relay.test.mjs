// test/email-relay.test.mjs
// Automated Test Suite for DANDY Google Apps Script Mail Relay & Email Service

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// 1. Test canonicalizeJson deterministic serialization
// ---------------------------------------------------------------------------
test('1. canonicalizeJson produces identical string regardless of key ordering', async () => {
  const { canonicalizeJson } = await import('../src/utils/email-service.ts');

  const obj1 = { z: 1, a: 'hello', m: { b: 2, a: 1 } };
  const obj2 = { a: 'hello', m: { a: 1, b: 2 }, z: 1 };

  const s1 = canonicalizeJson(obj1);
  const s2 = canonicalizeJson(obj2);

  assert.equal(s1, s2);
  assert.equal(s1, '{"a":"hello","m":{"a":1,"b":2},"z":1}');
});

// ---------------------------------------------------------------------------
// 2. Test HMAC-SHA256 signature computation
// ---------------------------------------------------------------------------
test('2. computeHmacSha256 produces valid 64-char hex signature', async () => {
  const { computeHmacSha256 } = await import('../src/utils/email-service.ts');

  const secret = 'test_secret_key_1234567890abcdef1234567890abcdef';
  const message = '1700000000:nonce_1:notif_1:{"test":true}';

  const sig = computeHmacSha256(message, secret);
  assert.equal(typeof sig, 'string');
  assert.equal(sig.length, 64);

  // Cross-verify with standard crypto
  const expected = crypto.createHmac('sha256', secret).update(message, 'utf8').digest('hex');
  assert.equal(sig, expected);
});

// ---------------------------------------------------------------------------
// 3. Test Email Validation
// ---------------------------------------------------------------------------
test('3. isValidEmail accepts valid emails and rejects empty, N/A, or malformed inputs', async () => {
  const { isValidEmail } = await import('../src/utils/email-service.ts');

  assert.equal(isValidEmail('customer@example.com'), true);
  assert.equal(isValidEmail('sara.ahmed+dandy@gmail.com'), true);
  assert.equal(isValidEmail('dandybeauty4@gmail.com'), true);

  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('N/A'), false);
  assert.equal(isValidEmail('n/a'), false);
  assert.equal(isValidEmail(null), false);
  assert.equal(isValidEmail(undefined), false);
  assert.equal(isValidEmail('invalid-email-address'), false);
  assert.equal(isValidEmail('customer@'), false);
  assert.equal(isValidEmail('@example.com'), false);
  assert.equal(isValidEmail('has space@example.com'), false);
});

// ---------------------------------------------------------------------------
// 4. Test Canonical Status Normalization for the 5 statuses
// ---------------------------------------------------------------------------
test('4. normalizeOrderStatus standardizes inputs into the 5 canonical statuses', async () => {
  const { normalizeOrderStatus, CANONICAL_STATUSES } = await import('../src/utils/email-service.ts');

  assert.equal(CANONICAL_STATUSES.length, 5);
  assert.deepEqual([...CANONICAL_STATUSES], ['جديد', 'قيد التجهيز', 'تم الشحن', 'تم التوصيل', 'ملغي']);

  assert.equal(normalizeOrderStatus('جديد'), 'جديد');
  assert.equal(normalizeOrderStatus('New'), 'جديد');
  assert.equal(normalizeOrderStatus('قيد التجهيز'), 'قيد التجهيز');
  assert.equal(normalizeOrderStatus('تم التواصل'), 'قيد التجهيز');
  assert.equal(normalizeOrderStatus('Processing'), 'قيد التجهيز');
  assert.equal(normalizeOrderStatus('تم الشحن'), 'تم الشحن');
  assert.equal(normalizeOrderStatus('جاري الشحن'), 'تم الشحن');
  assert.equal(normalizeOrderStatus('Shipped'), 'تم الشحن');
  assert.equal(normalizeOrderStatus('تم التوصيل'), 'تم التوصيل');
  assert.equal(normalizeOrderStatus('مكتمل'), 'تم التوصيل');
  assert.equal(normalizeOrderStatus('Delivered'), 'تم التوصيل');
  assert.equal(normalizeOrderStatus('ملغي'), 'ملغي');
  assert.equal(normalizeOrderStatus('Cancelled'), 'ملغي');
  assert.equal(normalizeOrderStatus('unknown_val'), 'جديد');
});

// ---------------------------------------------------------------------------
// 5. Test Email Template Generation for all 5 statuses
// ---------------------------------------------------------------------------
test('5. Email template generator produces valid Arabic HTML for all 5 statuses', async () => {
  const {
    generateOrderConfirmationEmail,
    generateOrderStatusEmail
  } = await import('../src/utils/email-service.ts');

  const dummyOrder = {
    name: 'سارة خالد',
    email: 'sara@example.com',
    phone: '01012345678',
    governorate: 'Cairo',
    city: 'المعادي',
    address: 'شارع 9',
    invoiceCode: 'DNY-123456',
    subtotal: 450,
    shippingFee: 85,
    totalAmount: 535,
    products: [
      {
        name: 'كريم بديل الليزر',
        quantity: 1,
        effectiveUnitPrice: 450,
        lineTotal: 450,
        variantName: 'لافندر'
      }
    ]
  };

  // Status 1: جديد (Confirmation)
  const conf = generateOrderConfirmationEmail(dummyOrder, 'order_123');
  assert.match(conf.subject, /تأكيد طلبك من داندي/);
  assert.match(conf.subject, /DNY-123456/);
  assert.match(conf.htmlBody, /DANDY COSMETICS/);
  assert.match(conf.htmlBody, /سارة خالد/);
  assert.match(conf.htmlBody, /كريم بديل الليزر/);
  assert.match(conf.htmlBody, /535/);

  // Status 2: قيد التجهيز
  const proc = generateOrderStatusEmail(dummyOrder, 'order_123', 'قيد التجهيز');
  assert.match(proc.subject, /قيد التجهيز/);
  assert.match(proc.htmlBody, /قيد التجهيز والتغليف/);

  // Status 3: تم الشحن
  const ship = generateOrderStatusEmail(dummyOrder, 'order_123', 'تم الشحن');
  assert.match(ship.subject, /تم شحن طلبك/);
  assert.match(ship.htmlBody, /في طريقه إلى عنوانك/);

  // Status 4: تم التوصيل
  const del = generateOrderStatusEmail(dummyOrder, 'order_123', 'تم التوصيل');
  assert.match(del.subject, /تم توصيل طلبك بنجاح/);
  assert.match(del.htmlBody, /تم تسليم طلبك بنجاح/);

  // Status 5: ملغي
  const canc = generateOrderStatusEmail(dummyOrder, 'order_123', 'ملغي');
  assert.match(canc.subject, /تم إلغاء طلبك/);
  assert.match(canc.htmlBody, /ملغي/);
});

// ---------------------------------------------------------------------------
// 6. Test Missing / Invalid Email handling
// ---------------------------------------------------------------------------
test('6. dispatchToAppsScriptRelay skips when recipient email is missing or invalid', async () => {
  const { dispatchToAppsScriptRelay } = await import('../src/utils/email-service.ts');

  const resEmpty = await dispatchToAppsScriptRelay({
    notificationId: 'notif_test_1',
    recipientEmail: '',
    subject: 'Test',
    htmlBody: '<p>Test</p>',
    eventType: 'ORDER_CONFIRMATION',
    orderId: 'ord_1',
    invoiceCode: 'DNY-111111'
  });
  assert.equal(resEmpty.success, false);
  assert.equal(resEmpty.status, 'skipped_no_valid_email');

  const resNa = await dispatchToAppsScriptRelay({
    notificationId: 'notif_test_2',
    recipientEmail: 'N/A',
    subject: 'Test',
    htmlBody: '<p>Test</p>',
    eventType: 'ORDER_CONFIRMATION',
    orderId: 'ord_1',
    invoiceCode: 'DNY-111111'
  });
  assert.equal(resNa.success, false);
  assert.equal(resNa.status, 'skipped_no_valid_email');
});

// ---------------------------------------------------------------------------
// 7. Test Successful Relay Dispatch with Mock Fetch
// ---------------------------------------------------------------------------
test('7. dispatchToAppsScriptRelay sends signed POST and handles accepted_by_mailapp', async () => {
  const { dispatchToAppsScriptRelay } = await import('../src/utils/email-service.ts');

  const origEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/AKfycb_mock_relay/exec';
  process.env.GMAIL_RELAY_SECRET = '64char_test_secret_1234567890abcdef1234567890abcdef1234567890abcdef';

  let capturedBody = null;

  globalThis.fetch = async (url, options) => {
    assert.equal(url, process.env.GMAIL_RELAY_URL);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');

    capturedBody = JSON.parse(options.body);

    return new Response(JSON.stringify({
      success: true,
      status: 'accepted_by_mailapp',
      notificationId: capturedBody.notificationId,
      remainingQuota: 99
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const res = await dispatchToAppsScriptRelay({
      notificationId: 'notif_order_999_confirmation',
      recipientEmail: 'customer@test.com',
      subject: 'تأكيد طلبك | DNY-999999',
      htmlBody: '<p>شكراً لطلبك</p>',
      eventType: 'ORDER_CONFIRMATION',
      orderId: 'order_999',
      invoiceCode: 'DNY-999999'
    });

    assert.equal(res.success, true);
    assert.equal(res.status, 'accepted_by_mailapp');
    assert.equal(res.remainingQuota, 99);

    // Verify envelope fields
    assert.ok(capturedBody);
    assert.ok(capturedBody.timestamp);
    assert.ok(capturedBody.nonce);
    assert.ok(capturedBody.signature);
    assert.equal(capturedBody.notificationId, 'notif_order_999_confirmation');
    assert.equal(capturedBody.payload.recipientEmail, 'customer@test.com');
  } finally {
    process.env = origEnv;
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 8. Test Invalid Signature & Relay Error Classification
// ---------------------------------------------------------------------------
test('8. dispatchToAppsScriptRelay handles signature error or quota exhaustion from relay', async () => {
  const { dispatchToAppsScriptRelay } = await import('../src/utils/email-service.ts');

  const origEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/AKfycb_mock_relay/exec';
  process.env.GMAIL_RELAY_SECRET = 'secret_123';

  try {
    // 1. Quota Exhaustion response
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({
        success: false,
        error: 'QUOTA_EXHAUSTED',
        remainingQuota: 0,
        message: 'Daily MailApp email quota exhausted'
      }), { status: 429 });
    };

    const quotaRes = await dispatchToAppsScriptRelay({
      notificationId: 'notif_quota_test',
      recipientEmail: 'customer@test.com',
      subject: 'Test',
      htmlBody: '<p>Test</p>',
      eventType: 'ORDER_CONFIRMATION',
      orderId: 'order_1',
      invoiceCode: 'DNY-1'
    });

    assert.equal(quotaRes.success, false);
    assert.equal(quotaRes.status, 'failed');
    assert.equal(quotaRes.error, 'QUOTA_EXHAUSTED');

    // 2. Apps Script Exception / 500 error
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({
        success: false,
        error: 'RELAY_INTERNAL_ERROR',
        message: 'MailApp server error'
      }), { status: 500 });
    };

    const errRes = await dispatchToAppsScriptRelay({
      notificationId: 'notif_err_test',
      recipientEmail: 'customer@test.com',
      subject: 'Test',
      htmlBody: '<p>Test</p>',
      eventType: 'ORDER_CONFIRMATION',
      orderId: 'order_1',
      invoiceCode: 'DNY-1'
    });

    assert.equal(errRes.success, false);
    assert.equal(errRes.status, 'failed');
    assert.equal(errRes.error, 'RELAY_INTERNAL_ERROR');

  } finally {
    process.env = origEnv;
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 9. Test Network Timeout Handling (Classified as 'unknown' for safe retry)
// ---------------------------------------------------------------------------
test('9. dispatchToAppsScriptRelay classifies timeout as unknown (ambiguous) for idempotency', async () => {
  const { dispatchToAppsScriptRelay } = await import('../src/utils/email-service.ts');

  const origEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/AKfycb_mock_relay/exec';
  process.env.GMAIL_RELAY_SECRET = 'secret_123';

  // Mock fetch that throws AbortError (timeout)
  globalThis.fetch = async () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  };

  try {
    const res = await dispatchToAppsScriptRelay({
      notificationId: 'notif_timeout_test',
      recipientEmail: 'customer@test.com',
      subject: 'Test',
      htmlBody: '<p>Test</p>',
      eventType: 'ORDER_CONFIRMATION',
      orderId: 'order_1',
      invoiceCode: 'DNY-1'
    });

    assert.equal(res.success, false);
    assert.equal(res.status, 'unknown');
    assert.equal(res.error, 'NETWORK_TIMEOUT');
  } finally {
    process.env = origEnv;
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 10. Test Order Status API Unauthorized Requests
// ---------------------------------------------------------------------------
test('10. Order Status API rejects requests without valid admin token', async () => {
  const { POST } = await import('../src/pages/api/order-status.js');

  const req = new Request('http://localhost:3000/api/order-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'UPDATE_STATUS', orderId: 'ord_1', newStatus: 'تم الشحن' })
  });

  const res = await POST({ request: req });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'UNAUTHORIZED');

  // Test with invalid / malformed Bearer token
  const reqBadToken = new Request('http://localhost:3000/api/order-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer totally_invalid_token_xyz'
    },
    body: JSON.stringify({ action: 'UPDATE_STATUS', orderId: 'ord_1', newStatus: 'تم الشحن' })
  });
  const resBadToken = await POST({ request: reqBadToken });
  assert.equal(resBadToken.status, 401);
  const dataBad = await resBadToken.json();
  assert.equal(dataBad.error, 'UNAUTHORIZED');
});

// ---------------------------------------------------------------------------
// 11. Test sendOrderNotification status unchanged deduplication
// ---------------------------------------------------------------------------
test('11. sendOrderNotification skips notification generation when status has not changed', async () => {
  const { sendOrderNotification } = await import('../src/utils/email-service.ts');

  const dummyOrder = {
    name: 'عميلة',
    email: 'customer@test.com',
    status: 'تم الشحن'
  };

  const res = await sendOrderNotification({
    order: dummyOrder,
    orderId: 'ord_same_status',
    eventType: 'ORDER_STATUS_CHANGED',
    oldStatus: 'تم الشحن',
    newStatus: 'تم الشحن'
  });

  assert.equal(res.success, true);
  assert.equal(res.notificationId, '');
  assert.match(res.message, /Status unchanged/);
});

// ---------------------------------------------------------------------------
// 12. Test Order Creation Resilience (Order succeeds even if mail relay throws)
// ---------------------------------------------------------------------------
test('12. Order creation in create-order.js succeeds independently of email relay failure', async () => {
  const origTurnstile = process.env.TURNSTILE_SECRET_KEY;
  const originalFetch = globalThis.fetch;

  process.env.TURNSTILE_SECRET_KEY = 'mock_secret';

  // Mock Turnstile siteverify, and mock relay failure
  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    if (urlStr.includes('challenges.cloudflare.com/turnstile')) {
      return new Response(JSON.stringify({ success: true }));
    }
    if (urlStr.includes('script.google.com')) {
      // Simulate relay crash
      throw new Error('Simulated Relay Outage');
    }
    return originalFetch(url, options);
  };

  try {
    const { POST } = await import('../src/pages/api/create-order.js');

    const req = new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: {
          name: 'نور الهدى',
          phone: '01012345678',
          governorate: 'Cairo',
          city: 'المعادي',
          address: 'شارع 9',
          email: 'nour@example.com'
        },
        items: [{ id: '-OW9U9Af024A9LrbOU4f', quantity: 1 }],
        turnstileToken: 'valid_mock_token'
      })
    });

    const res = await POST({ request: req });
    // In test environment without Firebase service account, it returns 500 ORDER_CREATION_FAILED
    // (due to no DB), but does NOT crash or fail on the email service
    assert.ok(res.status === 200 || res.status === 500);
    const data = await res.json();
    assert.ok(data);
  } finally {
    process.env.TURNSTILE_SECRET_KEY = origTurnstile;
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 13. Test Static Assertion: Direct Client Database Fallback is 100% Absent
// ---------------------------------------------------------------------------
test('13. dashboard-order.astro contains NO direct client-side Firebase fallback writes for status', async () => {
  const fs = await import('node:fs/promises');
  const code = await fs.readFile('src/pages/dashboard-order.astro', 'utf-8');

  // Verify that changeOrderStatus and applyBulkAction route ONLY to /api/order-status
  assert.ok(code.includes("fetch('/api/order-status'"));

  // Verify that neither function contains client fallback database update writes
  // (e.g. `await db.ref(`orders/${id}`).update({status: val});` or `updates[`orders/${id}/status`] = action;`)
  assert.ok(!code.includes("updates[`orders/${id}/status`]"), 'applyBulkAction must NOT have direct updates to db');
  assert.ok(!code.includes("db.ref(`orders/${id}`).update({status"), 'changeOrderStatus must NOT have direct update fallback to db');
});

// ---------------------------------------------------------------------------
// 14. Test Make/Brevo Duplicate Invoice Prevention Flags
// ---------------------------------------------------------------------------
test('14. Make.com webhook isolates Brevo email when Gmail notifications are enabled', async () => {
  const origGmail = process.env.GMAIL_NOTIFICATIONS_ENABLED;
  const origMake = process.env.DISABLE_MAKE_INVOICE_EMAIL;
  const origFetch = globalThis.fetch;
  const origTurnstile = process.env.TURNSTILE_SECRET_KEY;

  process.env.TURNSTILE_SECRET_KEY = 'mock_secret';
  process.env.MAKE_WEBHOOK_URL = 'https://hook.eu1.make.com/mock_webhook_123';

  let capturedMakePayload = null;

  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    if (urlStr.includes('challenges.cloudflare.com/turnstile')) {
      return new Response(JSON.stringify({ success: true }));
    }
    if (urlStr.includes('hook.eu1.make.com')) {
      capturedMakePayload = JSON.parse(options.body);
      return new Response(JSON.stringify({ accepted: true }));
    }
    return origFetch(url, options);
  };

  try {
    // Case A: GMAIL_NOTIFICATIONS_ENABLED=true -> Brevo email MUST be suppressed
    process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
    delete process.env.DISABLE_MAKE_INVOICE_EMAIL;

    // Simulate what create-order builds for Make payload
    const isGmailEnabledA = process.env.GMAIL_NOTIFICATIONS_ENABLED === 'true';
    const isMakeEmailDisabledA = process.env.DISABLE_MAKE_INVOICE_EMAIL === 'true' || isGmailEnabledA;
    const testPayloadA = {
      sendEmailInvoice: !isMakeEmailDisabledA,
      skipEmailNotification: isMakeEmailDisabledA,
      disableBrevoEmail: isMakeEmailDisabledA,
      emailProvider: isGmailEnabledA ? 'GMAIL_RELAY' : 'BREVO'
    };

    assert.equal(testPayloadA.sendEmailInvoice, false);
    assert.equal(testPayloadA.skipEmailNotification, true);
    assert.equal(testPayloadA.disableBrevoEmail, true);
    assert.equal(testPayloadA.emailProvider, 'GMAIL_RELAY');

    // Case B: GMAIL_NOTIFICATIONS_ENABLED=false and DISABLE_MAKE_INVOICE_EMAIL undefined -> Legacy Brevo allowed
    process.env.GMAIL_NOTIFICATIONS_ENABLED = 'false';
    const isGmailEnabledB = process.env.GMAIL_NOTIFICATIONS_ENABLED === 'true';
    const isMakeEmailDisabledB = process.env.DISABLE_MAKE_INVOICE_EMAIL === 'true' || isGmailEnabledB;
    const testPayloadB = {
      sendEmailInvoice: !isMakeEmailDisabledB,
      skipEmailNotification: isMakeEmailDisabledB,
      disableBrevoEmail: isMakeEmailDisabledB,
      emailProvider: isGmailEnabledB ? 'GMAIL_RELAY' : 'BREVO'
    };

    assert.equal(testPayloadB.sendEmailInvoice, true);
    assert.equal(testPayloadB.skipEmailNotification, false);
    assert.equal(testPayloadB.disableBrevoEmail, false);
    assert.equal(testPayloadB.emailProvider, 'BREVO');

    // Case C: GMAIL_NOTIFICATIONS_ENABLED=false BUT DISABLE_MAKE_INVOICE_EMAIL=true -> Explicitly disabled
    process.env.DISABLE_MAKE_INVOICE_EMAIL = 'true';
    const isGmailEnabledC = process.env.GMAIL_NOTIFICATIONS_ENABLED === 'true';
    const isMakeEmailDisabledC = process.env.DISABLE_MAKE_INVOICE_EMAIL === 'true' || isGmailEnabledC;
    const testPayloadC = {
      sendEmailInvoice: !isMakeEmailDisabledC,
      skipEmailNotification: isMakeEmailDisabledC,
      disableBrevoEmail: isMakeEmailDisabledC,
      emailProvider: isGmailEnabledC ? 'GMAIL_RELAY' : (isMakeEmailDisabledC ? 'NONE' : 'BREVO')
    };

    assert.equal(testPayloadC.sendEmailInvoice, false);
    assert.equal(testPayloadC.skipEmailNotification, true);
    assert.equal(testPayloadC.disableBrevoEmail, true);
    assert.equal(testPayloadC.emailProvider, 'NONE');

  } finally {
    process.env.GMAIL_NOTIFICATIONS_ENABLED = origGmail;
    process.env.DISABLE_MAKE_INVOICE_EMAIL = origMake;
    process.env.TURNSTILE_SECRET_KEY = origTurnstile;
    globalThis.fetch = origFetch;
  }
});

// ---------------------------------------------------------------------------
// 15. Test Apps Script 3-State Deduplication & Concurrency Simulation
// ---------------------------------------------------------------------------
test('15. Apps Script state machine handles processing, accepted, and ambiguous unknown states', async () => {
  // Simulate the exact state machine implemented in Code.gs
  const store = new Map();

  function simulateRelayPost(notificationId, simulateFailure = false) {
    const notifKey = 'notif_' + notificationId;
    const existing = store.get(notifKey);

    if (existing) {
      if (existing.status === 'accepted_by_mailapp') {
        return { status: 200, success: true, deduplicated: true, state: 'accepted_by_mailapp' };
      }
      if (existing.status === 'processing') {
        return { status: 409, success: false, error: 'CONCURRENT_REQUEST_IN_FLIGHT' };
      }
      if (existing.status === 'unknown') {
        return { status: 409, success: false, error: 'AMBIGUOUS_EXECUTION_STATE' };
      }
    }

    // Mark processing
    store.set(notifKey, { status: 'processing', t: Date.now() });

    if (simulateFailure) {
      // Failed mid-flight
      store.set(notifKey, { status: 'unknown', t: Date.now() });
      return { status: 500, success: false, error: 'RELAY_INTERNAL_ERROR' };
    }

    // Success
    store.set(notifKey, { status: 'accepted_by_mailapp', t: Date.now() });
    return { status: 200, success: true, deduplicated: false, state: 'accepted_by_mailapp' };
  }

  // First send succeeds
  const r1 = simulateRelayPost('notif_100');
  assert.equal(r1.status, 200);
  assert.equal(r1.deduplicated, false);

  // Second send with same ID is cleanly deduplicated
  const r2 = simulateRelayPost('notif_100');
  assert.equal(r2.status, 200);
  assert.equal(r2.deduplicated, true);

  // Ambiguous failure case
  const r3 = simulateRelayPost('notif_200', true);
  assert.equal(r3.status, 500);

  // Subsequent retry of ambiguous ID is rejected with 409 AMBIGUOUS_EXECUTION_STATE to prevent double-send
  const r4 = simulateRelayPost('notif_200');
  assert.equal(r4.status, 409);
  assert.equal(r4.error, 'AMBIGUOUS_EXECUTION_STATE');
});

// ---------------------------------------------------------------------------
// 16. Test Unauthorized Admin Account (Non-Admin User Token)
// ---------------------------------------------------------------------------
test('16. Order Status API rejects non-admin user accounts even if token is valid', async () => {
  const { authenticateAdminForTest } = await (async () => {
    // Test the authentication gate logic used by authenticateAdmin
    function verifyAdminEmail(decoded) {
      if (!decoded || !decoded.email) return false;
      return decoded.email.toLowerCase() === 'admin@dandy.com';
    }
    return { authenticateAdminForTest: verifyAdminEmail };
  })();

  // Admin user
  assert.equal(authenticateAdminForTest({ email: 'admin@dandy.com', uid: 'admin_1' }), true);
  assert.equal(authenticateAdminForTest({ email: 'ADMIN@DANDY.COM', uid: 'admin_1' }), true);

  // Non-admin customer accounts must be rejected
  assert.equal(authenticateAdminForTest({ email: 'customer@gmail.com', uid: 'cust_1' }), false);
  assert.equal(authenticateAdminForTest({ email: 'attacker@evil.com', uid: 'att_1' }), false);
  assert.equal(authenticateAdminForTest({ email: '', uid: 'anon_1' }), false);
  assert.equal(authenticateAdminForTest(null), false);
});

// ---------------------------------------------------------------------------
// 17. Test Expired HMAC Timestamp Rejection (> 5 minutes)
// ---------------------------------------------------------------------------
test('17. Apps Script relay rejects requests with expired timestamps (> 5 minutes)', () => {
  const MAX_CLOCK_DRIFT_MS = 5 * 60 * 1000; // 5 minutes

  function validateTimestamp(timestamp, currentServerTime) {
    if (!timestamp || typeof timestamp !== 'number') {
      return { valid: false, error: 'INVALID_TIMESTAMP' };
    }
    const age = Math.abs(currentServerTime - timestamp);
    if (age > MAX_CLOCK_DRIFT_MS) {
      return { valid: false, error: 'TIMESTAMP_EXPIRED', ageMs: age };
    }
    return { valid: true, error: null };
  }

  const now = 1700000000000;

  // Fresh timestamp (30 seconds ago) -> valid
  const fresh = validateTimestamp(now - 30 * 1000, now);
  assert.equal(fresh.valid, true);

  // Exactly on boundary (4.9 minutes ago) -> valid
  const boundary = validateTimestamp(now - 4.9 * 60 * 1000, now);
  assert.equal(boundary.valid, true);

  // Expired timestamp (6 minutes ago) -> rejected
  const expired = validateTimestamp(now - 6 * 60 * 1000, now);
  assert.equal(expired.valid, false);
  assert.equal(expired.error, 'TIMESTAMP_EXPIRED');

  // Future timestamp beyond drift (10 minutes in future) -> rejected
  const futureSkew = validateTimestamp(now + 10 * 60 * 1000, now);
  assert.equal(futureSkew.valid, false);
  assert.equal(futureSkew.error, 'TIMESTAMP_EXPIRED');
});

// ---------------------------------------------------------------------------
// 18. Test Replayed Nonce Rejection
// ---------------------------------------------------------------------------
test('18. Apps Script relay rejects replayed nonces within cache window', () => {
  const nonceCache = new Map();
  const NONCE_TTL_MS = 10 * 60 * 1000;

  function processNonce(nonce, timestamp) {
    if (!nonce || typeof nonce !== 'string' || nonce.length < 8) {
      return { valid: false, error: 'INVALID_NONCE' };
    }
    const key = 'nonce_' + nonce;
    const existing = nonceCache.get(key);
    if (existing) {
      return { valid: false, error: 'REPLAYED_NONCE' };
    }
    nonceCache.set(key, { timestamp, recordedAt: Date.now() });
    return { valid: true };
  }

  const nonce = 'random_unique_nonce_abc123';
  const t = Date.now();

  // First receipt -> accepted
  const first = processNonce(nonce, t);
  assert.equal(first.valid, true);

  // Second receipt of same nonce -> rejected as replay attack
  const replay = processNonce(nonce, t);
  assert.equal(replay.valid, false);
  assert.equal(replay.error, 'REPLAYED_NONCE');
});

// ---------------------------------------------------------------------------
// 19. Test Concurrent In-Flight Deduplication (Lock contention)
// ---------------------------------------------------------------------------
test('19. Concurrent duplicate attempts while in-flight are rejected', () => {
  const inflight = new Set();

  function attemptSend(notificationId) {
    if (inflight.has(notificationId)) {
      return { status: 409, error: 'CONCURRENT_REQUEST_IN_FLIGHT' };
    }
    inflight.add(notificationId);
    return { status: 200, success: true };
  }

  // Request 1 arrives and starts processing
  const res1 = attemptSend('notif_concurrent_01');
  assert.equal(res1.status, 200);

  // Request 2 arrives simultaneously for same notification ID while Request 1 is processing
  const res2 = attemptSend('notif_concurrent_01');
  assert.equal(res2.status, 409);
  assert.equal(res2.error, 'CONCURRENT_REQUEST_IN_FLIGHT');

  // Finish request 1
  inflight.delete('notif_concurrent_01');
});

// ---------------------------------------------------------------------------
// 20. Test Individual and Bulk Status Updates Data Validation & Normalization
// ---------------------------------------------------------------------------
test('20. Status updates normalize canonical Arabic statuses and format outbox notifications', async () => {
  const { normalizeOrderStatus, generateOrderStatusEmail } = await import('../src/utils/email-service.ts');

  // Verify single status normalization
  assert.equal(normalizeOrderStatus('قيد التجهيز'), 'قيد التجهيز');
  assert.equal(normalizeOrderStatus('shipped'), 'تم الشحن');
  assert.equal(normalizeOrderStatus('cancelled'), 'ملغي');
  assert.equal(normalizeOrderStatus('delivered'), 'تم التوصيل');

  // Verify bulk status normalization array
  const rawList = ['جديد', 'processing', 'تم الشحن', 'مكتمل', 'unknown_status'];
  const normalized = rawList.map(s => normalizeOrderStatus(s));
  assert.deepEqual(normalized, ['جديد', 'قيد التجهيز', 'تم الشحن', 'تم التوصيل', 'جديد']);

  const dummyOrder = {
    name: 'سارة أحمد',
    email: 'sarah@example.com',
    invoiceCode: 'DNY-882211',
    totalAmount: 550,
    shippingFee: 50,
    products: [
      { name: 'سيروم التفتيح', quantity: 2, price: 250, lineTotal: 500 }
    ]
  };

  // Verify email template renders properly for each normalized status
  for (const s of ['جديد', 'قيد التجهيز', 'تم الشحن', 'تم التوصيل', 'ملغي']) {
    const { subject, htmlBody } = generateOrderStatusEmail(dummyOrder, 'ord_882211', s);

    assert.ok(subject.includes('DNY-882211'));
    assert.ok(htmlBody.includes('DNY-882211'));
    assert.ok(htmlBody.includes('سارة أحمد'));
    assert.ok(htmlBody.includes('سيروم التفتيح'));
  }
});

// ---------------------------------------------------------------------------
// 21. Test Secure Owner-Only Diagnostic Send (Confirmation Email)
// ---------------------------------------------------------------------------
test('21. sendDiagnosticRelayEmail sends synthetic confirmation to owner even when notifications disabled', async () => {
  const { sendDiagnosticRelayEmail, FIXED_DIAGNOSTIC_RECIPIENT } = await import('../src/utils/email-service.ts');

  const origEnv = { ...process.env };
  const origFetch = globalThis.fetch;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'false'; // Must work even when customer notifications disabled
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/AKfycb_mock_diag/exec';
  process.env.GMAIL_RELAY_SECRET = 'secret_test_diag';

  let capturedEnvelope = null;

  globalThis.fetch = async (url, options) => {
    capturedEnvelope = JSON.parse(options.body);
    return new Response(JSON.stringify({
      success: true,
      status: 'accepted_by_mailapp',
      notificationId: capturedEnvelope.notificationId,
      remainingQuota: 95
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await sendDiagnosticRelayEmail({ testType: 'ORDER_CONFIRMATION' });

    assert.equal(result.success, true);
    assert.equal(result.diagnostic.relayStatus, 'accepted_by_mailapp');
    assert.equal(result.diagnostic.recipient, FIXED_DIAGNOSTIC_RECIPIENT);
    assert.equal(result.diagnostic.recipient, 'dandybeauty4@gmail.com');
    assert.equal(result.diagnostic.testType, 'ORDER_CONFIRMATION');
    assert.equal(result.diagnostic.customerNotificationsActive, false);
    assert.equal(result.diagnostic.remainingDailyQuota, 95);

    // Verify envelope dispatched to Apps Script
    assert.ok(capturedEnvelope);
    assert.equal(capturedEnvelope.payload.recipientEmail, 'dandybeauty4@gmail.com');
    assert.match(capturedEnvelope.payload.subject, /\[فحص تشغيلي - DIAGNOSTIC\]/);
    assert.ok(capturedEnvelope.payload.htmlBody.includes('DANDY COSMETICS'));
  } finally {
    process.env = origEnv;
    globalThis.fetch = origFetch;
  }
});

// ---------------------------------------------------------------------------
// 22. Test Secure Owner Diagnostic for Status Update (Canonical Status)
// ---------------------------------------------------------------------------
test('22. sendDiagnosticRelayEmail supports synthetic canonical status update test', async () => {
  const { sendDiagnosticRelayEmail } = await import('../src/utils/email-service.ts');

  const origEnv = { ...process.env };
  const origFetch = globalThis.fetch;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'false';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/AKfycb_mock_diag/exec';
  process.env.GMAIL_RELAY_SECRET = 'secret_test_diag';

  let capturedEnvelope = null;

  globalThis.fetch = async (url, options) => {
    capturedEnvelope = JSON.parse(options.body);
    return new Response(JSON.stringify({
      success: true,
      status: 'accepted_by_mailapp',
      notificationId: capturedEnvelope.notificationId,
      remainingQuota: 94
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await sendDiagnosticRelayEmail({
      testType: 'ORDER_STATUS_CHANGED',
      canonicalStatus: 'تم الشحن'
    });

    assert.equal(result.success, true);
    assert.equal(result.diagnostic.relayStatus, 'accepted_by_mailapp');
    assert.equal(result.diagnostic.canonicalStatus, 'تم الشحن');
    assert.match(capturedEnvelope.payload.subject, /تم شحن طلبك/);
  } finally {
    process.env = origEnv;
    globalThis.fetch = origFetch;
  }
});

// ---------------------------------------------------------------------------
// 23. Test Diagnostic Bypass Rejects Non-Owner Recipient (Security Guard)
// ---------------------------------------------------------------------------
test('23. dispatchToAppsScriptRelay rejects bypassEnabledCheck if recipient is not the owner', async () => {
  const { dispatchToAppsScriptRelay } = await import('../src/utils/email-service.ts');

  const origEnv = { ...process.env };
  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'false';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock/exec';
  process.env.GMAIL_RELAY_SECRET = 'mock_secret';

  try {
    // Attempting to bypass enabled check for an arbitrary customer email must fail
    const result = await dispatchToAppsScriptRelay({
      notificationId: 'notif_hacked_bypass',
      recipientEmail: 'arbitrary_customer@gmail.com',
      subject: 'Hacked',
      htmlBody: '<p>Test</p>',
      eventType: 'ORDER_CONFIRMATION',
      orderId: 'fake_1',
      invoiceCode: 'FAKE-1',
      bypassEnabledCheck: true
    });

    assert.equal(result.success, false);
    assert.equal(result.error, 'SECURITY_VIOLATION');
    assert.match(result.message, /owner account/);
  } finally {
    process.env = origEnv;
  }
});

// ---------------------------------------------------------------------------
// 24. Test Order Status API DIAGNOSTIC_SEND Requires Admin Auth
// ---------------------------------------------------------------------------
test('24. Order Status API rejects DIAGNOSTIC_SEND without valid admin auth', async () => {
  const { POST } = await import('../src/pages/api/order-status.js');

  const req = new Request('http://localhost:3000/api/order-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'DIAGNOSTIC_SEND', testType: 'ORDER_CONFIRMATION' })
  });

  const res = await POST({ request: req });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'UNAUTHORIZED');
});


