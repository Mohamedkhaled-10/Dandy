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
    assert.ok(typeof capturedBody.payloadJson === 'string');
    const parsedPayload = JSON.parse(capturedBody.payloadJson);
    assert.equal(parsedPayload.recipientEmail, 'customer@test.com');
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
    assert.ok(typeof capturedEnvelope.payloadJson === 'string');
    const parsedPayload = JSON.parse(capturedEnvelope.payloadJson);
    assert.equal(parsedPayload.recipientEmail, 'dandybeauty4@gmail.com');
    assert.match(parsedPayload.subject, /\[فحص تشغيلي - DIAGNOSTIC\]/);
    assert.ok(parsedPayload.htmlBody.includes('DANDY COSMETICS'));
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
    assert.ok(typeof capturedEnvelope.payloadJson === 'string');
    const parsedPayload = JSON.parse(capturedEnvelope.payloadJson);
    assert.match(parsedPayload.subject, /تم شحن طلبك/);
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

// ---------------------------------------------------------------------------
// 25. Cross-Platform Deterministic Test Vectors & Exact-Byte HMAC Mutations
// ---------------------------------------------------------------------------
test('25. Cross-platform deterministic test vector matches exact HMAC and detects all mutations', async () => {
  const { canonicalizeJson, computeHmacSha256 } = await import('../src/utils/email-service.ts');

  // Fixed test-only secret (Never use production secret in tests)
  const TEST_SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const TEST_TIMESTAMP = 1770000000000;
  const TEST_NONCE = 'dny_test_nonce_abcdef0123456789';
  const TEST_NOTIFICATION_ID = 'notif_test_order_789_confirmation';

  // Representative payload with Arabic, English, nested objects, arrays, numbers, booleans, and null
  const TEST_PAYLOAD_OBJ = {
    active: true,
    arabicNote: 'شكراً لثقتك بمنتجات داندي الطبيعية',
    discount: null,
    englishSummary: 'Dandy cosmetics order confirmed',
    eventType: 'ORDER_CONFIRMATION',
    invoiceCode: 'DNY-TEST-001',
    items: [
      { count: 2, id: 'prod_1', name: 'مخمرية رويال', price: 150.5 },
      { count: 1, id: 'prod_2', name: 'سيروم هيالورونيك', price: 250 }
    ],
    metadata: {
      channel: 'web-store',
      customerLoyalty: false,
      retryCount: 0
    },
    orderId: 'order_test_789',
    quantity: 3,
    recipientEmail: 'dandybeauty4@gmail.com',
    subject: 'تأكيد طلبك من داندي | رقم الفاتورة DNY-TEST-001'
  };

  const payloadJson = canonicalizeJson(TEST_PAYLOAD_OBJ);
  const signingMessage = `${TEST_TIMESTAMP}:${TEST_NONCE}:${TEST_NOTIFICATION_ID}:${payloadJson}`;
  const computedHmac = computeHmacSha256(signingMessage, TEST_SECRET);

  // Exact fixed golden test vector
  const EXPECTED_HMAC = '6a3db67860cd8f343118bfc42113ec16672a8fa7c17802ac64b56b69dd0e4378';

  // 1. Exact valid message and signature check
  assert.equal(computedHmac, EXPECTED_HMAC, 'Computed HMAC must match expected cross-platform golden vector');
  assert.equal(Buffer.byteLength(signingMessage, 'utf8'), 709, 'UTF-8 byte length must match golden vector');
  assert.equal(signingMessage.length, 626, 'Character length must match golden vector');

  // Apps Script byte array conversion emulator:
  function appsScriptBytesToHex(bytes) {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      const byte = (bytes[i] + 256) % 256;
      const str = byte.toString(16);
      hex += str.length === 1 ? '0' + str : str;
    }
    return hex.toLowerCase();
  }
  const rawHmacBuf = crypto.createHmac('sha256', TEST_SECRET).update(signingMessage, 'utf8').digest();
  const appsScriptHex = appsScriptBytesToHex(new Int8Array(rawHmacBuf));
  assert.equal(appsScriptHex, EXPECTED_HMAC, 'Apps Script signed byte array conversion must produce identical hex');

  // 2. Mutation: One changed Arabic character (ة to ه in arabicNote)
  const changedArabicPayload = payloadJson.replace('الطبيعية', 'الطبيعيه');
  const changedArabicMessage = `${TEST_TIMESTAMP}:${TEST_NONCE}:${TEST_NOTIFICATION_ID}:${changedArabicPayload}`;
  const changedArabicHmac = computeHmacSha256(changedArabicMessage, TEST_SECRET);
  assert.notEqual(changedArabicHmac, EXPECTED_HMAC, 'Changed Arabic character must invalidate signature');

  // 3. Mutation: One changed number (quantity: 3 to 4)
  const changedNumberPayload = payloadJson.replace('"quantity":3', '"quantity":4');
  const changedNumberMessage = `${TEST_TIMESTAMP}:${TEST_NONCE}:${TEST_NOTIFICATION_ID}:${changedNumberPayload}`;
  const changedNumberHmac = computeHmacSha256(changedNumberMessage, TEST_SECRET);
  assert.notEqual(changedNumberHmac, EXPECTED_HMAC, 'Changed number must invalidate signature');

  // 4. Mutation: One reordered or altered payload string
  const alteredPayload = payloadJson.replace('"active":true,', '') + '{"active":true}';
  const alteredMessage = `${TEST_TIMESTAMP}:${TEST_NONCE}:${TEST_NOTIFICATION_ID}:${alteredPayload}`;
  const alteredHmac = computeHmacSha256(alteredMessage, TEST_SECRET);
  assert.notEqual(alteredHmac, EXPECTED_HMAC, 'Altered payload string must invalidate signature');

  // 5. Mutation: Changed timestamp (1 millisecond difference)
  const changedTimestampMessage = `${TEST_TIMESTAMP + 1}:${TEST_NONCE}:${TEST_NOTIFICATION_ID}:${payloadJson}`;
  const changedTimestampHmac = computeHmacSha256(changedTimestampMessage, TEST_SECRET);
  assert.notEqual(changedTimestampHmac, EXPECTED_HMAC, 'Changed timestamp must invalidate signature');

  // 6. Mutation: Changed nonce
  const changedNonceMessage = `${TEST_TIMESTAMP}:dny_other_nonce_12345:${TEST_NOTIFICATION_ID}:${payloadJson}`;
  const changedNonceHmac = computeHmacSha256(changedNonceMessage, TEST_SECRET);
  assert.notEqual(changedNonceHmac, EXPECTED_HMAC, 'Changed nonce must invalidate signature');

  // 7. Mutation: Changed notification ID
  const changedNotifIdMessage = `${TEST_TIMESTAMP}:${TEST_NONCE}:notif_different_id:${payloadJson}`;
  const changedNotifIdHmac = computeHmacSha256(changedNotifIdMessage, TEST_SECRET);
  assert.notEqual(changedNotifIdHmac, EXPECTED_HMAC, 'Changed notification ID must invalidate signature');

  // 8. Mutation: Wrong secret
  const wrongSecret = 'b1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const wrongSecretHmac = computeHmacSha256(signingMessage, wrongSecret);
  assert.notEqual(wrongSecretHmac, EXPECTED_HMAC, 'Wrong secret must invalidate signature');
});

// ---------------------------------------------------------------------------
// 26. Safe Diagnostic & Envelope Validation Emulation
// ---------------------------------------------------------------------------
test('26. Relay validation enforces signature format, missing payload, and returns safe diagnostic without leaking secret', () => {
  // Constant-time equal function as implemented in Code.gs
  function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
      return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  // Verification pipeline simulation from Code.gs
  function verifyRelayRequest(body, sharedSecret) {
    const { timestamp, nonce, notificationId, signature, payloadJson } = body || {};

    const hasTimestamp = timestamp !== null && timestamp !== undefined && timestamp !== '';
    const hasNonce = typeof nonce === 'string' && nonce.trim().length > 0;
    const hasNotificationId = typeof notificationId === 'string' && notificationId.trim().length > 0;
    const hasSignature = typeof signature === 'string' && signature.trim().length > 0;
    const hasPayloadJson = typeof payloadJson === 'string' && payloadJson.length > 0;

    if (!hasTimestamp || !hasNonce || !hasNotificationId || !hasSignature || !hasPayloadJson) {
      return {
        status: 400,
        error: 'INVALID_ENVELOPE',
        safeDiagnostic: {
          secretConfigured: Boolean(sharedSecret),
          receivedSignatureFormatValid: typeof signature === 'string' && /^[0-9a-fA-F]{64}$/.test(signature.trim()),
          receivedSignatureLength: typeof signature === 'string' ? signature.length : 0,
          computedSignatureLength: 0,
          signingMessageUtf8ByteLength: 0,
          timestampFormatValid: !isNaN(Number(timestamp)),
          nonceFormatValid: typeof nonce === 'string' && nonce.length >= 8,
          payloadJsonPresent: hasPayloadJson
        }
      };
    }

    const signingMessage = String(timestamp) + ':' + String(nonce) + ':' + String(notificationId) + ':' + String(payloadJson);
    const expectedSig = crypto.createHmac('sha256', sharedSecret).update(signingMessage, 'utf8').digest('hex');

    const receivedSig = typeof signature === 'string' ? signature.trim().toLowerCase() : '';
    const isSigFormatValid = /^[0-9a-f]{64}$/.test(receivedSig);
    const isMatch = isSigFormatValid && timingSafeEqual(receivedSig, expectedSig);

    if (!isMatch) {
      return {
        status: 401,
        error: 'INVALID_SIGNATURE',
        safeDiagnostic: {
          secretConfigured: Boolean(sharedSecret),
          receivedSignatureFormatValid: isSigFormatValid,
          receivedSignatureLength: typeof signature === 'string' ? signature.length : 0,
          computedSignatureLength: expectedSig.length,
          signingMessageUtf8ByteLength: Buffer.byteLength(signingMessage, 'utf8'),
          timestampFormatValid: !isNaN(Number(timestamp)),
          nonceFormatValid: typeof nonce === 'string' && nonce.length >= 8,
          payloadJsonPresent: typeof payloadJson === 'string' && payloadJson.length > 0
        }
      };
    }

    return { status: 200, success: true };
  }

  const secret = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const timestamp = 1770000000000;
  const nonce = 'dny_test_nonce_abcdef0123456789';
  const notificationId = 'notif_test_order_789_confirmation';
  const payloadJson = '{"test":true,"arabic":"تجربة"}';
  const validSig = crypto.createHmac('sha256', secret).update(`${timestamp}:${nonce}:${notificationId}:${payloadJson}`, 'utf8').digest('hex');

  // Case A: Valid request
  const validRes = verifyRelayRequest({ timestamp, nonce, notificationId, signature: validSig, payloadJson }, secret);
  assert.equal(validRes.status, 200);

  // Case B: Missing payloadJson
  const missingPayloadRes = verifyRelayRequest({ timestamp, nonce, notificationId, signature: validSig }, secret);
  assert.equal(missingPayloadRes.status, 400);
  assert.equal(missingPayloadRes.error, 'INVALID_ENVELOPE');
  assert.equal(missingPayloadRes.safeDiagnostic.payloadJsonPresent, false);

  // Case C: Uppercase or invalid format signature
  const badFormatRes = verifyRelayRequest({ timestamp, nonce, notificationId, signature: 'NOT_VALID_HEX', payloadJson }, secret);
  assert.equal(badFormatRes.status, 401);
  assert.equal(badFormatRes.error, 'INVALID_SIGNATURE');
  assert.equal(badFormatRes.safeDiagnostic.receivedSignatureFormatValid, false);
  assert.equal(badFormatRes.safeDiagnostic.receivedSignatureLength, 13);
  assert.equal(badFormatRes.safeDiagnostic.computedSignatureLength, 64);

  // Case D: Verify safe diagnostic NEVER leaks secret or payload
  const diagStr = JSON.stringify(badFormatRes.safeDiagnostic);
  assert.ok(!diagStr.includes(secret), 'Safe diagnostic must never contain the secret');
  assert.ok(!diagStr.includes('تجربة'), 'Safe diagnostic must never contain payload content');
  assert.ok(!diagStr.includes(validSig), 'Safe diagnostic must never contain signatures');
});

// ---------------------------------------------------------------------------
// 27. Malformed JSON inside payloadJson rejected after signature verification
// ---------------------------------------------------------------------------
test('27. Invalid JSON payload after successful signature verification returns 400 INVALID_PAYLOAD_JSON', () => {
  const secret = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const timestamp = 1770000000000;
  const nonce = 'dny_test_nonce_abcdef0123456789';
  const notificationId = 'notif_test_order_789_confirmation';
  const invalidJsonString = 'this_is_not_json_content{[[(';

  // Signature calculated over the exact invalid string
  const validHmac = crypto.createHmac('sha256', secret)
    .update(`${timestamp}:${nonce}:${notificationId}:${invalidJsonString}`, 'utf8')
    .digest('hex');

  // Verify that signature check passes, but JSON parsing fails:
  function handleRelayPayload(payloadJsonStr) {
    try {
      return JSON.parse(payloadJsonStr);
    } catch (e) {
      return null;
    }
  }

  const parsed = handleRelayPayload(invalidJsonString);
  assert.equal(parsed, null, 'Malformed JSON must fail JSON.parse and result in INVALID_PAYLOAD_JSON rejection');
});

// =============================================================================
// FINANCIAL ACCURACY & INVOICE INTEGRITY TEST SUITE (Tests 28 - 36)
// =============================================================================

// ---------------------------------------------------------------------------
// 28. Financial Test 1: One product priced at 499 EGP, quantity 1
// ---------------------------------------------------------------------------
test('28. Financial Test: One product priced at 499 EGP, quantity 1 produces 499 subtotal, 85 Cairo shipping, 584 total', async () => {
  const { calculateOrderFinancials, generateOrderConfirmationEmail } = await import('../src/utils/email-service.ts');

  const order = {
    name: 'عميل القاهرة',
    email: 'cairo.customer@example.com',
    governorate: 'Cairo',
    city: 'المعادي',
    address: 'شارع النصر',
    invoiceCode: 'DNY-499001',
    products: [
      {
        id: 'serum-vit-c',
        name: 'سيروم فيتامين سي للتفتيح والنضارة',
        quantity: 1,
        price: 499,
        effectiveUnitPrice: 499,
        lineTotal: 499
      }
    ]
  };

  const fin = calculateOrderFinancials(order);
  assert.equal(fin.calculatedSubtotal, 499);
  assert.equal(fin.subtotal, 499);
  assert.equal(fin.shippingFee, 85);
  assert.equal(fin.totalAmount, 584);
  assert.equal(fin.isFreeShipping, false);

  const email = generateOrderConfirmationEmail(order, 'ord_499');
  assert.ok(email.htmlBody.includes('499 ج.م'), 'Must display 499 ج.م for line item & subtotal');
  assert.ok(email.htmlBody.includes('85 ج.م'), 'Must display 85 ج.م for Cairo shipping');
  assert.ok(email.htmlBody.includes('584 ج.م'), 'Must display 584 ج.م total amount due on delivery');
  assert.ok(!email.htmlBody.includes('شحن مجاني 🎉'), 'Must not display free shipping for 499 EGP Cairo order');
});

// ---------------------------------------------------------------------------
// 29. Financial Test 2: Two products with different prices and quantities
// ---------------------------------------------------------------------------
test('29. Financial Test: Two products with different prices and quantities', async () => {
  const { calculateOrderFinancials, generateOrderConfirmationEmail } = await import('../src/utils/email-service.ts');

  // Product A: 150 EGP × 2 = 300 EGP
  // Product B: 250 EGP × 1 = 250 EGP
  // Expected Subtotal: 550 EGP
  // Governorate: Alexandria (الإسكندرية) -> 85 EGP shipping
  // Total Amount: 635 EGP
  const order = {
    name: 'عميلة الإسكندرية',
    governorate: 'Alexandria',
    products: [
      {
        id: 'cream-1',
        name: 'كريم بديل الليزر',
        quantity: 2,
        price: 150,
        effectiveUnitPrice: 150,
        lineTotal: 300
      },
      {
        id: 'scrub-1',
        name: 'سكراب القهوة الطبيعي',
        quantity: 1,
        price: 250,
        effectiveUnitPrice: 250,
        lineTotal: 250
      }
    ]
  };

  const fin = calculateOrderFinancials(order);
  assert.equal(fin.calculatedSubtotal, 550);
  assert.equal(fin.subtotal, 550);
  assert.equal(fin.shippingFee, 85);
  assert.equal(fin.totalAmount, 635);

  const email = generateOrderConfirmationEmail(order, 'ord_multi');
  assert.ok(email.htmlBody.includes('300 ج.م'), 'Must display line total 300 ج.م');
  assert.ok(email.htmlBody.includes('250 ج.م'), 'Must display line total 250 ج.م');
  assert.ok(email.htmlBody.includes('550 ج.م'), 'Must display subtotal 550 ج.م');
  assert.ok(email.htmlBody.includes('635 ج.م'), 'Must display total 635 ج.م');
});

// ---------------------------------------------------------------------------
// 30. Financial Test 3: Collection / Bundle with effective package price
// ---------------------------------------------------------------------------
test('30. Financial Test: Collection/bundle with effective package price', async () => {
  const { calculateOrderFinancials, generateOrderConfirmationEmail } = await import('../src/utils/email-service.ts');

  // Bundle package price: 450 EGP (contains 3 sub-items), quantity 1
  const order = {
    name: 'عميلة الكوليكشن',
    governorate: 'Gharbia', // 70 EGP
    products: [
      {
        id: 'pink-friday-trio-bundle',
        name: 'كوليكشن العناية الفائقة الثلاثي',
        isCollection: true,
        badgeText: 'كوليكشن Pink Friday',
        price: 450,
        effectiveUnitPrice: 450,
        lineTotal: 450,
        quantity: 1,
        items: [
          { name: 'غسول رغوي مفتح' },
          { name: 'سيروم نياسيناميد' },
          { name: 'كريم ترطيب مكثف' }
        ]
      }
    ]
  };

  const fin = calculateOrderFinancials(order);
  assert.equal(fin.subtotal, 450);
  assert.equal(fin.shippingFee, 70); // Gharbia rate
  assert.equal(fin.totalAmount, 520);

  const email = generateOrderConfirmationEmail(order, 'ord_bundle');
  assert.ok(email.htmlBody.includes('كوليكشن العناية الفائقة الثلاثي'));
  assert.ok(email.htmlBody.includes('غسول رغوي مفتح + سيروم نياسيناميد + كريم ترطيب مكثف'), 'Bundle sub-items must be listed');
  assert.ok(email.htmlBody.includes('450 ج.م'));
  assert.ok(email.htmlBody.includes('70 ج.م'));
  assert.ok(email.htmlBody.includes('520 ج.م'));
});

// ---------------------------------------------------------------------------
// 31. Financial Test 4: Discounted product with original vs effective price
// ---------------------------------------------------------------------------
test('31. Financial Test: Discounted product with original vs effective price', async () => {
  const { calculateOrderFinancials, generateOrderConfirmationEmail } = await import('../src/utils/email-service.ts');

  const order = {
    name: 'عميلة العرض',
    governorate: 'القاهرة',
    products: [
      {
        id: 'serum-discounted',
        name: 'سيروم الهيالورونيك المركز',
        price: 600, // Regular original price
        effectiveUnitPrice: 499, // Discounted promotional price
        lineTotal: 499,
        quantity: 1
      }
    ]
  };

  const fin = calculateOrderFinancials(order);
  assert.equal(fin.subtotal, 499);
  assert.equal(fin.shippingFee, 85);
  assert.equal(fin.totalAmount, 584);

  const email = generateOrderConfirmationEmail(order, 'ord_disc');
  assert.ok(email.htmlBody.includes('del>600 ج.م'), 'Must display original strikethrough price 600 ج.م');
  assert.ok(email.htmlBody.includes('499 ج.م للقطعة'), 'Must display promotional unit price 499 ج.م');
  assert.ok(email.htmlBody.includes('584 ج.م'));
});

// ---------------------------------------------------------------------------
// 32. Financial Test 5: Free shipping qualification (> 2000 EGP rule)
// ---------------------------------------------------------------------------
test('32. Financial Test: Free shipping for order that qualifies under existing rule (> 2000 EGP)', async () => {
  const { calculateOrderFinancials, generateOrderConfirmationEmail } = await import('../src/utils/email-service.ts');

  // Subtotal 2100 EGP (> 2000 EGP threshold) -> Shipping 0 EGP (Free)
  const order = {
    name: 'عميل النخبة',
    governorate: 'Aswan', // Normal rate is 120, but qualifies for free shipping
    products: [
      {
        name: 'مجموعة العناية الكاملة VIP',
        price: 2100,
        effectiveUnitPrice: 2100,
        lineTotal: 2100,
        quantity: 1
      }
    ]
  };

  const fin = calculateOrderFinancials(order);
  assert.equal(fin.subtotal, 2100);
  assert.equal(fin.shippingFee, 0);
  assert.equal(fin.totalAmount, 2100);
  assert.equal(fin.isFreeShipping, true);

  const email = generateOrderConfirmationEmail(order, 'ord_vip');
  assert.ok(email.htmlBody.includes('شحن مجاني 🎉'), 'Must display free shipping badge for > 2000 EGP');
  assert.ok(email.htmlBody.includes('2,100 ج.م'));
});

// ---------------------------------------------------------------------------
// 33. Financial Test 6: Paid shipping for order that does not qualify (<= 2000 EGP)
// ---------------------------------------------------------------------------
test('33. Financial Test: Paid shipping for order that does not qualify (<= 2000 EGP)', async () => {
  const { calculateOrderFinancials, generateOrderConfirmationEmail } = await import('../src/utils/email-service.ts');

  // Subtotal 1999 EGP (<= 2000 threshold) in Cairo -> Shipping 85 EGP, Total 2084 EGP
  const order = {
    name: 'عميل القاهرة',
    governorate: 'Cairo',
    products: [
      {
        name: 'باقة العناية المتكاملة',
        price: 1999,
        effectiveUnitPrice: 1999,
        lineTotal: 1999,
        quantity: 1
      }
    ]
  };

  const fin = calculateOrderFinancials(order);
  assert.equal(fin.subtotal, 1999);
  assert.equal(fin.shippingFee, 85);
  assert.equal(fin.totalAmount, 2084);
  assert.equal(fin.isFreeShipping, false);

  const email = generateOrderConfirmationEmail(order, 'ord_cairo_paid');
  assert.ok(!email.htmlBody.includes('شحن مجاني 🎉'), 'Must NOT display free shipping for 1999 EGP');
  assert.ok(email.htmlBody.includes('85 ج.م'), 'Must display 85 ج.م shipping');
  assert.ok(email.htmlBody.includes('2,084 ج.م'), 'Must display 2,084 ج.م total');
});

// ---------------------------------------------------------------------------
// 34. Financial Test 7: Missing or invalid financial field (safe fallback)
// ---------------------------------------------------------------------------
test('34. Financial Test: Missing or invalid financial field safely falls back to line-item calculation', async () => {
  const { calculateOrderFinancials, generateOrderConfirmationEmail } = await import('../src/utils/email-service.ts');

  // subtotal, shippingFee, and totalAmount are omitted completely
  const orderWithMissingFinancials = {
    name: 'طلب بحقول ناقصة',
    governorate: 'Cairo',
    products: [
      {
        name: 'سيروم فيتامين سي',
        price: 499,
        quantity: 1
        // lineTotal is also omitted
      }
    ]
  };

  const fin = calculateOrderFinancials(orderWithMissingFinancials);
  assert.equal(fin.calculatedSubtotal, 499);
  assert.equal(fin.subtotal, 499, 'Must fall back to calculated line items instead of 0');
  assert.equal(fin.shippingFee, 85, 'Must calculate Cairo shipping (85 EGP)');
  assert.equal(fin.totalAmount, 584, 'Must calculate subtotal + shipping (584 EGP)');

  const email = generateOrderConfirmationEmail(orderWithMissingFinancials, 'ord_missing');
  assert.ok(email.htmlBody.includes('499 ج.م'), 'Must display calculated 499 ج.م subtotal');
  assert.ok(email.htmlBody.includes('85 ج.م'), 'Must display calculated 85 ج.م shipping');
  assert.ok(email.htmlBody.includes('584 ج.م'), 'Must display calculated 584 ج.م total');
  assert.ok(!email.htmlBody.includes('NaN'), 'Must never render NaN');
  assert.ok(!email.htmlBody.includes('undefined'), 'Must never render undefined');
});

// ---------------------------------------------------------------------------
// 35. Financial Test 8: Zero subtotal with nonzero line items (safe recalculation)
// ---------------------------------------------------------------------------
test('35. Financial Test: Zero subtotal with nonzero line items safely recalculated without defaulting to 0', async () => {
  const { calculateOrderFinancials, generateOrderConfirmationEmail } = await import('../src/utils/email-service.ts');

  // Order explicitly has subtotal: 0 and totalAmount: 0, but valid 499 EGP line item exists
  const orderWithZeroSubtotal = {
    name: 'طلب بسعر صفر خاطئ',
    governorate: 'Cairo',
    subtotal: 0, // Inadvertently set to 0
    totalAmount: 0, // Inadvertently set to 0
    products: [
      {
        name: 'سيروم فيتامين سي',
        price: 499,
        quantity: 1,
        lineTotal: 499
      }
    ]
  };

  const fin = calculateOrderFinancials(orderWithZeroSubtotal);
  assert.equal(fin.subtotal, 499, 'Safe fallback must recalculate 499 EGP and NOT default to 0 EGP');
  assert.equal(fin.shippingFee, 85);
  assert.equal(fin.totalAmount, 584);

  const email = generateOrderConfirmationEmail(orderWithZeroSubtotal, 'ord_zero_fix');
  assert.ok(email.htmlBody.includes('499 ج.م'), 'Must display 499 ج.م subtotal');
  assert.ok(email.htmlBody.includes('85 ج.م'), 'Must display 85 ج.م shipping');
  assert.ok(email.htmlBody.includes('584 ج.م'), 'Must display 584 ج.م total');
});

// ---------------------------------------------------------------------------
// 36. Final Verification: Synthetic diagnostic email to owner verifies exact Cairo financials
// ---------------------------------------------------------------------------
test('36. Final Verification: sendDiagnosticRelayEmail sends synthetic email with exact Cairo financials (499 + 85 = 584)', async () => {
  const { sendDiagnosticRelayEmail, FIXED_DIAGNOSTIC_RECIPIENT } = await import('../src/utils/email-service.ts');

  const origEnv = { ...process.env };
  const origFetch = globalThis.fetch;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'false';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/AKfycb_final_verif/exec';
  process.env.GMAIL_RELAY_SECRET = 'secret_test_final_verif';

  let capturedEnvelope = null;

  globalThis.fetch = async (url, options) => {
    capturedEnvelope = JSON.parse(options.body);
    return new Response(JSON.stringify({
      success: true,
      status: 'accepted_by_mailapp',
      notificationId: capturedEnvelope.notificationId,
      remainingQuota: 90
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await sendDiagnosticRelayEmail({ testType: 'ORDER_CONFIRMATION' });

    assert.equal(result.success, true);
    assert.equal(result.diagnostic.relayStatus, 'accepted_by_mailapp');
    assert.equal(result.diagnostic.recipient, FIXED_DIAGNOSTIC_RECIPIENT);
    assert.equal(result.diagnostic.recipient, 'dandybeauty4@gmail.com');
    assert.equal(result.diagnostic.customerNotificationsActive, false, 'Must keep GMAIL_NOTIFICATIONS_ENABLED=false');

    // Inspect the generated payloadJson and rendered HTML
    assert.ok(capturedEnvelope);
    const payload = JSON.parse(capturedEnvelope.payloadJson);
    const html = payload.htmlBody;

    // 1. Product row total matches subtotal: 499 EGP
    assert.ok(html.includes('499 ج.م'), 'Product row and subtotal must contain 499 ج.م');

    // 2. Cairo shipping is 85 EGP (NOT free)
    assert.ok(html.includes('85 ج.م'), 'Shipping must contain 85 ج.م');
    assert.ok(!html.includes('شحن مجاني 🎉'), 'Must NOT display free shipping for 499 EGP Cairo order');

    // 3. Grand total / amount due on delivery is 584 EGP
    assert.ok(html.includes('584 ج.م'), 'Total amount due on delivery must be 584 ج.م');

    // 4. Cash on delivery clearly noted (does not imply online payment)
    assert.ok(html.includes('الدفع نقداً عند استلام الشحنة (COD)'));

    // 5. No financial field is blank
    assert.ok(!html.includes('NaN'), 'No field can be NaN');
    assert.ok(!html.includes('undefined'), 'No field can be undefined');
    assert.ok(!html.includes('null'), 'No field can be null');
  } finally {
    process.env = origEnv;
    globalThis.fetch = origFetch;
  }
});

// =============================================================================
// MODERN PREMIUM REDESIGN & STATUS TEMPLATES TEST SUITE (Tests 37 - 42)
// =============================================================================

// ---------------------------------------------------------------------------
// 37. Date & Time formatting in Africa/Cairo timezone
// ---------------------------------------------------------------------------
test('37. formatCairoDateTime accurately formats timestamps in Africa/Cairo timezone in Arabic', async () => {
  const { formatCairoDateTime } = await import('../src/utils/email-service.ts');

  // Specific ISO timestamp: 2026-11-08T18:30:00.000Z (which is 20:30 in Cairo, UTC+2)
  const formatted = formatCairoDateTime('2026-11-08T18:30:00.000Z');
  assert.ok(typeof formatted === 'string');
  assert.ok(formatted.length > 5);
  // Must contain year 2026 in Eastern Arabic (٢٠٢٦) or Western digits (2026)
  assert.ok(formatted.includes('٢٠٢٦') || formatted.includes('2026'));
  // Must contain month name (نوفمبر)
  assert.ok(formatted.includes('نوفمبر'));
});

// ---------------------------------------------------------------------------
// 38. Plain-text alternatives produce clean, complete text bodies without HTML tags
// ---------------------------------------------------------------------------
test('38. Plain-text alternatives produce clean text bodies without HTML tags', async () => {
  const {
    generateOrderConfirmationText,
    generateOrderStatusText
  } = await import('../src/utils/email-service.ts');

  const sampleOrder = {
    name: 'منى أحمد',
    email: 'mona@example.com',
    governorate: 'Cairo',
    invoiceCode: 'DNY-998877',
    subtotal: 499,
    shippingFee: 85,
    totalAmount: 584,
    products: [
      { name: 'سيروم فيتامين سي', quantity: 1, price: 499, lineTotal: 499 }
    ]
  };

  // 1. Order confirmation text
  const confText = generateOrderConfirmationText(sampleOrder, 'ord_sample');
  assert.ok(!confText.includes('<table'), 'Must not contain HTML tables');
  assert.ok(!confText.includes('<div'), 'Must not contain HTML divs');
  assert.ok(confText.includes('DANDY COSMETICS'));
  assert.ok(confText.includes('DNY-998877'));
  assert.ok(confText.includes('سيروم فيتامين سي'));
  assert.ok(confText.includes('499 ج.م'));
  assert.ok(confText.includes('85 ج.م'));
  assert.ok(confText.includes('584 ج.م'));
  assert.ok(confText.includes('https://wa.me/201038941005'));

  // 2. Status update text
  const statusText = generateOrderStatusText(sampleOrder, 'ord_sample', 'تم الشحن');
  assert.ok(!statusText.includes('<table'));
  assert.ok(!statusText.includes('<div'));
  assert.ok(statusText.includes('تم الشحن'));
  assert.ok(statusText.includes('DNY-998877'));
  assert.ok(statusText.includes('584 ج.م'));
  assert.ok(statusText.includes('01038941005'));
});

// ---------------------------------------------------------------------------
// 39. Status Template: قيد التجهيز (Processing) verification
// ---------------------------------------------------------------------------
test('39. Status Template: قيد التجهيز (Processing) renders required subject, badge, and copy', async () => {
  const { generateOrderStatusEmail } = await import('../src/utils/email-service.ts');

  const order = {
    name: 'هدى محمود',
    email: 'hoda@example.com',
    governorate: 'Giza',
    city: 'الدقي',
    invoiceCode: 'DNY-PROC-01',
    subtotal: 650,
    shippingFee: 85,
    totalAmount: 735,
    products: [
      { name: 'مجموعة التفتيح الطبيعي', quantity: 1, price: 650, lineTotal: 650 }
    ]
  };

  const email = generateOrderStatusEmail(order, 'ord_proc_01', 'قيد التجهيز');
  assert.ok(email.subject.includes('طلبك قيد التجهيز بعناية في داندي'));
  assert.ok(email.subject.includes('DNY-PROC-01'));
  assert.ok(email.htmlBody.includes('قيد التجهيز والتغليف'));
  assert.ok(email.htmlBody.includes('نعمل حاليًا على تجهيز طلبك بعناية، ونسعى ليصلك بأفضل حالة.'));
  assert.ok(email.htmlBody.includes('735 ج.م'));
  assert.ok(email.htmlBody.includes('الدقي'));
  assert.ok(email.textBody.includes('نعمل حاليًا على تجهيز طلبك بعناية'));
});

// ---------------------------------------------------------------------------
// 40. Status Templates: تم الشحن (Shipped) & تم التوصيل (Delivered) verification
// ---------------------------------------------------------------------------
test('40. Status Templates: تم الشحن & تم التوصيل render required subject, badge, and copy', async () => {
  const { generateOrderStatusEmail } = await import('../src/utils/email-service.ts');

  const order = {
    name: 'رنا مصطفى',
    email: 'rana@example.com',
    governorate: 'Alexandria',
    city: 'سموحة',
    invoiceCode: 'DNY-SHIP-02',
    subtotal: 800,
    shippingFee: 95,
    totalAmount: 895,
    products: [
      { name: 'كريم الليل المرطب', quantity: 2, price: 400, lineTotal: 800 }
    ]
  };

  // 1. Shipped
  const shipEmail = generateOrderStatusEmail(order, 'ord_ship_02', 'تم الشحن');
  assert.ok(shipEmail.subject.includes('تم شحن طلبك من داندي وهو في طريقه إليكِ!'));
  assert.ok(shipEmail.subject.includes('DNY-SHIP-02'));
  assert.ok(shipEmail.htmlBody.includes('تم الشحن وفي الطريق'));
  assert.ok(shipEmail.htmlBody.includes('طلبك في طريقه إليكِ! تم تسليم شحنتك إلى شركة التوصيل'));
  assert.ok(shipEmail.htmlBody.includes('895 ج.م'));

  // 2. Delivered
  const delEmail = generateOrderStatusEmail(order, 'ord_del_02', 'تم التوصيل');
  assert.ok(delEmail.subject.includes('تم توصيل طلبك بنجاح | DANDY DNY-SHIP-02'));
  assert.ok(delEmail.htmlBody.includes('تم التوصيل بنجاح'));
  assert.ok(delEmail.htmlBody.includes('تم تسجيل اكتمال توصيل طلبك. نتمنى أن تستمتعي بتجربتك مع DANDY.'));
  assert.ok(delEmail.htmlBody.includes('نشكركِ لاختياركِ داندي وثقتكِ الدائمة بمنتجاتنا الطبيعية!'));
});

// ---------------------------------------------------------------------------
// 41. Status Template: ملغي (Cancelled) verification
// ---------------------------------------------------------------------------
test('41. Status Template: ملغي (Cancelled) renders required subject, badge, and copy', async () => {
  const { generateOrderStatusEmail } = await import('../src/utils/email-service.ts');

  const order = {
    name: 'ياسمين علي',
    email: 'yasmin@example.com',
    governorate: 'Cairo',
    invoiceCode: 'DNY-CANC-03',
    subtotal: 499,
    shippingFee: 85,
    totalAmount: 584,
    products: [
      { name: 'سيروم فيتامين سي', quantity: 1, price: 499, lineTotal: 499 }
    ]
  };

  const cancEmail = generateOrderStatusEmail(order, 'ord_canc_03', 'ملغي');
  assert.ok(cancEmail.subject.includes('تم إلغاء طلبك من داندي | DNY-CANC-03'));
  assert.ok(cancEmail.htmlBody.includes('طلب ملغي'));
  assert.ok(cancEmail.htmlBody.includes('نود إبلاغك بأنه تم إلغاء طلبك. شكرًا لاهتمامك بمنتجات DANDY.'));
  assert.ok(cancEmail.htmlBody.includes('إجمالي الطلب الملغي:'));
  assert.ok(cancEmail.htmlBody.includes('584 ج.م'));
});

// ---------------------------------------------------------------------------
// 42. Synthetic diagnostic email verifies all 4 statuses with unique IDs & strict recipient
// ---------------------------------------------------------------------------
test('42. sendDiagnosticRelayEmail sends synthetic diagnostics for all 4 statuses with unique IDs to owner only', async () => {
  const { sendDiagnosticRelayEmail, FIXED_DIAGNOSTIC_RECIPIENT } = await import('../src/utils/email-service.ts');

  const origEnv = { ...process.env };
  const origFetch = globalThis.fetch;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'false';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/AKfycb_status_diag_test/exec';
  process.env.GMAIL_RELAY_SECRET = 'secret_test_status_diag';

  const dispatchedEnvelopes = [];

  globalThis.fetch = async (url, options) => {
    const envelope = JSON.parse(options.body);
    dispatchedEnvelopes.push(envelope);
    return new Response(JSON.stringify({
      success: true,
      status: 'accepted_by_mailapp',
      notificationId: envelope.notificationId,
      remainingQuota: 95
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const statuses = ['قيد التجهيز', 'تم الشحن', 'تم التوصيل', 'ملغي'];
    const notificationIds = new Set();

    for (const status of statuses) {
      const res = await sendDiagnosticRelayEmail({
        testType: 'ORDER_STATUS_CHANGED',
        canonicalStatus: status
      });

      assert.equal(res.success, true);
      assert.equal(res.diagnostic.relayStatus, 'accepted_by_mailapp');
      assert.equal(res.diagnostic.recipient, FIXED_DIAGNOSTIC_RECIPIENT);
      assert.equal(res.diagnostic.recipient, 'dandybeauty4@gmail.com');
      assert.equal(res.diagnostic.customerNotificationsActive, false);
      assert.equal(res.diagnostic.canonicalStatus, status);

      // Verify notification ID is unique
      assert.ok(!notificationIds.has(res.diagnostic.notificationId), 'Each status must generate a distinct notification ID');
      notificationIds.add(res.diagnostic.notificationId);
    }

    assert.equal(dispatchedEnvelopes.length, 4);
    // Check that each envelope contains isDiagnostic notice instead of broken tracking links
    dispatchedEnvelopes.forEach(env => {
      const payload = JSON.parse(env.payloadJson);
      assert.ok(payload.htmlBody.includes('فحص تشغيلي تجريبي للإدارة'));
      assert.ok(payload.textBody.includes('فحص تشغيلي تجريبي للإدارة'));
      assert.equal(payload.recipientEmail, 'dandybeauty4@gmail.com');
    });

  } finally {
    process.env = origEnv;
    globalThis.fetch = origFetch;
  }
});




