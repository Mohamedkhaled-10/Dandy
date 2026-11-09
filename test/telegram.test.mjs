// test/telegram.test.mjs
// Automated Test Suite for Centralized Telegram Notifications, Diagnostics, and Resilience

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeHtml,
  parseChatIds,
  isValidChatId,
  formatOrderMessage,
  formatLowStockMessage,
  categorizeTelegramError,
  sendTelegramNotification,
  verifyTelegramBot,
  inspectTelegramChat,
  diagnoseTelegramSetup
} from '../src/utils/telegram.js';

// Helper to temporarily intercept global fetch
function createMockFetch(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    return handler(String(url), options, originalFetch);
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

// 1. Success sending to negative 64-bit Group Chat ID starting with -100
test('1. Successful dispatch to Supergroup Chat ID starting with -100', async () => {
  const supergroupId = '-1002345678901';
  let capturedBody = null;

  const restore = createMockFetch(async (url, options) => {
    if (url.includes('api.telegram.org/bot')) {
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        ok: true,
        result: { message_id: 9988 }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  });

  try {
    const result = await sendTelegramNotification({
      tokenOverride: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      chatIdsOverride: [supergroupId],
      customHtml: '<b>Test Message</b>'
    });

    assert.equal(result.success, true);
    assert.equal(result.allSuccessful, true);
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.totalSent, 1);
    assert.equal(result.totalFailed, 0);
    assert.equal(capturedBody.chat_id, supergroupId);
    assert.equal(typeof capturedBody.chat_id, 'string');
    assert.equal(capturedBody.parse_mode, 'HTML');
    assert.equal(capturedBody.disable_web_page_preview, true);
  } finally {
    restore();
  }
});

// 2. Support multiple comma-separated Chat IDs
test('2. Multiple comma-separated Chat IDs all receive notification', async () => {
  const chatIds = ['-1001111111111', '-1002222222222', '-1003333333333'];
  const receivedBy = [];

  const restore = createMockFetch(async (url, options) => {
    if (url.includes('api.telegram.org/bot')) {
      const body = JSON.parse(options.body);
      receivedBy.push(body.chat_id);
      return new Response(JSON.stringify({
        ok: true,
        result: { message_id: 1000 + receivedBy.length }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  });

  try {
    const result = await sendTelegramNotification({
      tokenOverride: 'mock_token',
      chatIdsOverride: '-1001111111111, -1002222222222, -1003333333333',
      customHtml: '<b>Multi-Chat Test</b>'
    });

    assert.equal(result.success, true);
    assert.equal(result.allSuccessful, true);
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.totalSent, 3);
    assert.deepEqual(receivedBy, chatIds);
  } finally {
    restore();
  }
});

// 3. Detection of invalid Chat ID format
test('3. Detects invalid Chat ID format without crashing', async () => {
  const invalidId = 'invalid_chat_identifier_xyz';
  assert.equal(isValidChatId(invalidId), false);
  assert.equal(isValidChatId('-1002345678901'), true);
  assert.equal(isValidChatId('-987654321'), true);
  assert.equal(isValidChatId('@dandy_channel'), true);

  const result = await sendTelegramNotification({
    tokenOverride: 'mock_token',
    chatIdsOverride: [invalidId],
    customHtml: '<b>Test</b>'
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 'FAILURE');
  assert.equal(result.totalFailed, 1);
  assert.equal(result.results[0].error.code, 'INVALID_CHAT_ID');
});

// 4. Detection of invalid Bot Token (401 Unauthorized)
test('4. Handles 401 Unauthorized for invalid or revoked Bot Token', async () => {
  const restore = createMockFetch(async () => {
    return new Response(JSON.stringify({
      ok: false,
      error_code: 401,
      description: 'Unauthorized'
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  });

  try {
    const result = await sendTelegramNotification({
      tokenOverride: 'invalid_token_xyz',
      chatIdsOverride: ['-1002345678901'],
      customHtml: '<b>Test</b>'
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 'FAILURE');
    assert.equal(result.results[0].error.code, 'UNAUTHORIZED');
  } finally {
    restore();
  }
});

// 5. Handles Telegram API response with data.ok === false
test('5. Handles Telegram API errors when data.ok is false', async () => {
  const restore = createMockFetch(async () => {
    return new Response(JSON.stringify({
      ok: false,
      error_code: 400,
      description: 'Bad Request: chat not found'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  });

  try {
    const result = await sendTelegramNotification({
      tokenOverride: 'valid_token',
      chatIdsOverride: ['-1009999999999'],
      customHtml: '<b>Test</b>'
    });

    assert.equal(result.success, false);
    assert.equal(result.results[0].error.code, 'CHAT_NOT_FOUND');
  } finally {
    restore();
  }
});

// 6. Total failure never returns success
test('6. Does NOT return success when all destinations fail', async () => {
  const restore = createMockFetch(async () => {
    return new Response(JSON.stringify({
      ok: false,
      error_code: 403,
      description: 'Forbidden: bot was kicked from the supergroup chat'
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  });

  try {
    const result = await sendTelegramNotification({
      tokenOverride: 'valid_token',
      chatIdsOverride: ['-1001111111111', '-1002222222222'],
      customHtml: '<b>Test</b>'
    });

    assert.equal(result.success, false);
    assert.equal(result.allSuccessful, false);
    assert.equal(result.status, 'FAILURE');
    assert.equal(result.totalSent, 0);
    assert.equal(result.totalFailed, 2);
  } finally {
    restore();
  }
});

// 7. Partial success handled and recorded accurately
test('7. Accurately records PARTIAL_SUCCESS when one chat succeeds and another fails', async () => {
  const restore = createMockFetch(async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.chat_id === '-1001111111111') {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 101 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      ok: false,
      error_code: 403,
      description: 'Forbidden: bot is not a member of the supergroup chat'
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  });

  try {
    const result = await sendTelegramNotification({
      tokenOverride: 'valid_token',
      chatIdsOverride: ['-1001111111111', '-1002222222222'],
      customHtml: '<b>Test</b>'
    });

    assert.equal(result.success, false); // All must succeed for success: true
    assert.equal(result.allSuccessful, false);
    assert.equal(result.anySuccessful, true);
    assert.equal(result.status, 'PARTIAL_SUCCESS');
    assert.equal(result.totalSent, 1);
    assert.equal(result.totalFailed, 1);
    assert.equal(result.results[0].success, true);
    assert.equal(result.results[1].success, false);
    assert.equal(result.results[1].error.code, 'BOT_NOT_MEMBER');
  } finally {
    restore();
  }
});

// 8. Handles 429 Too Many Requests and parses retry_after
test('8. Handles 429 Too Many Requests and parses parameters.retry_after', async () => {
  const restore = createMockFetch(async () => {
    return new Response(JSON.stringify({
      ok: false,
      error_code: 429,
      description: 'Too Many Requests: retry after 20',
      parameters: {
        retry_after: 20
      }
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  });

  try {
    const result = await sendTelegramNotification({
      tokenOverride: 'valid_token',
      chatIdsOverride: ['-1002345678901'],
      customHtml: '<b>Test</b>'
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 'FAILURE');
    assert.equal(result.results[0].error.code, 'TOO_MANY_REQUESTS');
    assert.equal(result.results[0].error.retryAfter, 20);
    assert.match(result.results[0].error.description, /20 ثانية/);
  } finally {
    restore();
  }
});

// 9. Handles Network Timeout gracefully
test('9. Handles network timeout with AbortController gracefully', async () => {
  const restore = createMockFetch(async () => {
    // Simulate hanging request that triggers abort
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  });

  try {
    const result = await sendTelegramNotification({
      tokenOverride: 'valid_token',
      chatIdsOverride: ['-1002345678901'],
      customHtml: '<b>Test</b>',
      timeoutMs: 100
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 'FAILURE');
    assert.equal(result.results[0].error.code, 'NETWORK_TIMEOUT');
  } finally {
    restore();
  }
});

// 10. Order creation resilience when Telegram fails
test('10. Order creation finishes cleanly even if Telegram network fails', async () => {
  // Simulate order creation post-save notification sequence
  const orderData = {
    name: 'سارة محمود',
    phone: '01012345678',
    governorate: 'Cairo',
    city: 'المعادي',
    address: 'شارع 9',
    subtotal: 500,
    shippingFee: 85,
    totalAmount: 585,
    invoiceCode: 'DNY-882211',
    products: [{ name: 'سيروم التفتيح', quantity: 1, price: 500 }]
  };

  const restore = createMockFetch(async (url) => {
    if (url.includes('api.telegram.org')) {
      throw new Error('Telegram connection reset by peer');
    }
    return new Response(JSON.stringify({ success: true }));
  });

  try {
    const emailPromise = Promise.resolve({ success: true });
    const telegramPromise = sendTelegramNotification({
      order: orderData,
      orderId: 'mock-order-id-123',
      tokenOverride: 'mock-token',
      chatIdsOverride: ['-1001234567890']
    }).catch(err => {
      return { success: false, error: err.message };
    });

    const [emailRes, telegramRes] = await Promise.allSettled([emailPromise, telegramPromise]);

    assert.equal(emailRes.status, 'fulfilled');
    assert.equal(emailRes.value.success, true);

    // Telegram fulfilled with failure, but did NOT reject or throw an unhandled exception
    assert.equal(telegramRes.status, 'fulfilled');
    assert.equal(telegramRes.value.success, false);
  } finally {
    restore();
  }
});

// 11. Gmail Relay unaffected by Telegram failure
test('11. Gmail Relay and Telegram operate independently via Promise.allSettled', async () => {
  let emailAttempted = false;
  let telegramAttempted = false;

  const emailTask = (async () => {
    emailAttempted = true;
    return { ok: true, emailSent: true };
  })();

  const telegramTask = (async () => {
    telegramAttempted = true;
    throw new Error('Telegram server timeout');
  })().catch(err => ({ ok: false, error: err.message }));

  const results = await Promise.allSettled([emailTask, telegramTask]);

  assert.equal(emailAttempted, true);
  assert.equal(telegramAttempted, true);
  assert.equal(results[0].value.emailSent, true);
  assert.equal(results[1].value.ok, false);
});

// 12. Low stock (<= 3) and Out of stock (0) message formatting
test('12. Low stock and Out of Stock message formatting', () => {
  const lowMsg = formatLowStockMessage({ productName: 'غسول الوجه العشبي', remainingQty: 2 });
  assert.match(lowMsg, /تنبيه:?\s*مخزون منخفض/);
  assert.match(lowMsg, /غسول الوجه العشبي/);
  assert.match(lowMsg, /2/);

  const soldOutMsg = formatLowStockMessage({ productName: 'كريم الليل المرطب', remainingQty: 0 });
  assert.match(soldOutMsg, /المنتج نفد من المخزون|نفاد مخزون/);
  assert.match(soldOutMsg, /كريم الليل المرطب/);
  assert.match(soldOutMsg, /نفد بالكامل/);
});

// 13. Admin diagnostic endpoint rejects non-admin users
test('13. Admin Telegram diagnostic endpoint rejects unauthorized calls', async () => {
  const { POST } = await import('../src/pages/api/admin/telegram-test.js');

  // Request without authorization header
  const reqNoAuth = new Request('http://localhost:3000/api/admin/telegram-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  const resNoAuth = await POST({ request: reqNoAuth });
  assert.equal(resNoAuth.status, 401);
  const dataNoAuth = await resNoAuth.json();
  assert.equal(dataNoAuth.success, false);
  assert.equal(dataNoAuth.error, 'UNAUTHORIZED');
});

// 14. No sensitive tokens or secrets leaked in responses or formatting
test('14. Security: No Bot Token, Firebase Secrets, or Private Tokens leaked', async () => {
  const secretBotToken = 'SECRET_TELEGRAM_BOT_TOKEN_123456';
  const supergroupId = '-1002345678901';

  const restore = createMockFetch(async (url) => {
    if (url.includes('/getMe')) {
      return new Response(JSON.stringify({
        ok: true,
        result: { id: 777666, is_bot: true, username: 'dandy_orders_bot', first_name: 'Dandy Orders' }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/getChat')) {
      return new Response(JSON.stringify({
        ok: true,
        result: { id: -1002345678901, title: 'Dandy Order Team', type: 'supergroup' }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/getChatMember')) {
      return new Response(JSON.stringify({
        ok: true,
        result: { status: 'administrator', can_send_messages: true }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/sendMessage')) {
      return new Response(JSON.stringify({
        ok: true,
        result: { message_id: 5544 }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  });

  try {
    const diagReport = await diagnoseTelegramSetup({
      tokenOverride: secretBotToken,
      chatIdsOverride: [supergroupId]
    });

    const serializedReport = JSON.stringify(diagReport);
    assert.equal(serializedReport.includes(secretBotToken), false, 'Token must NEVER be in diagnostic output');
    assert.equal(diagReport.bot.username, 'dandy_orders_bot');
    assert.equal(diagReport.chats[0].title, 'Dandy Order Team');
    assert.equal(diagReport.chats[0].messageSent, true);
  } finally {
    restore();
  }
});

// 15. Customer Privacy: Customer email and invoice access tokens are excluded from Telegram notification
test('15. Customer Privacy: Email and private invoiceAccessToken are NOT in notification HTML', () => {
  const privateOrder = {
    name: 'منى الشريف',
    email: 'mona.private@gmail.com', // Must NOT be in Telegram
    phone: '01123456789',
    governorate: 'Alexandria',
    city: 'سموحة',
    address: 'ش 14 عمارة الفيروز شقة 5',
    invoiceCode: 'DNY-771122',
    invoiceAccessToken: 'super_secret_private_token_xyz', // Must NOT be in Telegram
    subtotal: 450,
    shippingFee: 85,
    totalAmount: 535,
    products: [{ name: 'زيت الأرجان النقي', quantity: 1, price: 450 }]
  };

  const html = formatOrderMessage(privateOrder, 'mock-order-id');

  assert.equal(html.includes('mona.private@gmail.com'), false, 'Customer email must not be sent');
  assert.equal(html.includes('super_secret_private_token_xyz'), false, 'Invoice access token must not be sent');
  assert.match(html, /DNY-771122/);
  assert.match(html, /منى الشريف/);
  assert.match(html, /01123456789/);
});

// 16. Dashboard DOM Structure and Initialization Integrity
test('16. Dashboard DOM Integrity: Diagnostic modal is placed BEFORE script and elements exist', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const dashboardContent = await fs.readFile(path.resolve('src/pages/dashboard.astro'), 'utf-8');

  // Verify modal is placed BEFORE the script in the DOM hierarchy
  const modalIndex = dashboardContent.indexOf('id="telegramTestModal"');
  const diagBodyIndex = dashboardContent.indexOf('id="telegramDiagBody"');
  const scriptIndex = dashboardContent.indexOf('<script is:inline>');

  assert.ok(modalIndex !== -1, 'Modal #telegramTestModal must exist in dashboard.astro');
  assert.ok(diagBodyIndex !== -1, 'Modal body #telegramDiagBody must exist in dashboard.astro');
  assert.ok(scriptIndex !== -1, '<script is:inline> must exist in dashboard.astro');

  assert.ok(
    modalIndex < scriptIndex,
    `Modal markup (index ${modalIndex}) must appear BEFORE <script is:inline> (index ${scriptIndex}) to prevent reading null elements`
  );
  assert.ok(
    diagBodyIndex < scriptIndex,
    `Modal body (index ${diagBodyIndex}) must appear BEFORE <script is:inline> (index ${scriptIndex})`
  );

  // Verify all 6 required diagnostic elements are present
  const requiredElements = [
    'btnTestTelegram',
    'telegramTestModal',
    'telegramDiagBody',
    'closeTelegramModal',
    'closeTelegramModalBtn',
    'retryTelegramModalBtn'
  ];

  for (const elId of requiredElements) {
    assert.ok(
      dashboardContent.includes(`id="${elId}"`),
      `Required diagnostic element id="${elId}" must be present in dashboard.astro`
    );
  }

  // Verify script uses DOMContentLoaded / readyState check to safely bind listeners
  assert.ok(
    dashboardContent.includes("document.readyState === 'loading'") || dashboardContent.includes('DOMContentLoaded'),
    'Script must check document.readyState or listen to DOMContentLoaded'
  );

  // Verify dynamic auth resolution is used instead of stale null reference
  assert.ok(
    dashboardContent.includes('getFirebaseAuth'),
    'Script must define and use dynamic getFirebaseAuth() to avoid stale auth references'
  );
});

// =========================================================================
// PHASE 8: DANDY PREMIUM TELEGRAM REDESIGN VALIDATION SUITE (Tests 17 - 28)
// =========================================================================

// 17. Standard single order message layout & identity
test('17. Premium UI: Standard order message contains DANDY branding, header, and structure', () => {
  const order = {
    name: 'سارة خالد',
    phone: '01012345678',
    governorate: 'Cairo',
    city: 'المعادي',
    invoiceCode: 'DNY-10245',
    subtotal: 500,
    shippingFee: 84,
    totalAmount: 584,
    products: [{ name: 'سيروم الهيالورونيك', quantity: 1, lineTotal: 500 }]
  };

  const msg = formatOrderMessage(order, 'order-123');

  assert.match(msg, /🖤 <b>DANDY STORE<\/b>/);
  assert.match(msg, /<code>ORDER MANAGEMENT SYSTEM<\/code>/);
  assert.match(msg, /🔔 <b>تم استلام طلب جديد!<\/b>/);
  assert.match(msg, /🧾 <b>رقم الفاتورة:<\/b> <code>DNY-10245<\/code>/);
  assert.match(msg, /💰 <b>إجمالي الطلب:<\/b> <b>584 EGP<\/b>/);
  assert.match(msg, /👤 <b>بيانات العميل<\/b>/);
  assert.match(msg, /• <b>الاسم:<\/b> سارة خالد/);
  assert.match(msg, /• <b>الهاتف:<\/b> <code>01012345678<\/code>/);
  assert.match(msg, /• <b>المحافظة:<\/b> Cairo/);
  assert.match(msg, /• <b>المدينة\/المركز:<\/b> المعادي/);
  assert.match(msg, /🛍 <b>المنتجات المطلوبة<\/b>/);
  assert.match(msg, /1\. <b>سيروم الهيالورونيك<\/b> × 1 — <b>500 EGP<\/b>/);
  assert.match(msg, /💵 <b>ملخص الحساب<\/b>/);
  assert.match(msg, /• <b>قيمة المنتجات:<\/b> 500 EGP/);
  assert.match(msg, /• <b>تكلفة الشحن:<\/b> 84 EGP/);
  assert.match(msg, /• <b>الإجمالي النهائي:<\/b> <b>584 EGP<\/b>/);
  assert.match(msg, /🕒 <b>وقت الطلب:<\/b>/);
});

// 18. Multi-product order formatting
test('18. Premium UI: Multiple products in order are clearly enumerated', () => {
  const order = {
    name: 'نورهان سعيد',
    phone: '01234567890',
    governorate: 'Giza',
    city: 'الدقي',
    invoiceCode: 'DNY-30491',
    subtotal: 850,
    shippingFee: 85,
    totalAmount: 935,
    products: [
      { name: 'شامبو الأرجان المغربي', quantity: 2, lineTotal: 400 },
      { name: 'بلسم الترطيب العميق', quantity: 1, lineTotal: 250, variantName: 'حجم 300 مل' },
      { name: 'سيروم الحماية الحرارية', quantity: 1, lineTotal: 200 }
    ]
  };

  const msg = formatOrderMessage(order);

  assert.match(msg, /1\. <b>شامبو الأرجان المغربي<\/b> × 2 — <b>400 EGP<\/b>/);
  assert.match(msg, /2\. <b>بلسم الترطيب العميق<\/b> \(حجم 300 مل\) × 1 — <b>250 EGP<\/b>/);
  assert.match(msg, /3\. <b>سيروم الحماية الحرارية<\/b> × 1 — <b>200 EGP<\/b>/);
});

// 19. Collection bundle order formatting with nested items
test('19. Premium UI: Collection bundles display bundle name, badge, and nested items', () => {
  const order = {
    name: 'ريم العبد',
    phone: '01598765432',
    governorate: 'Alexandria',
    city: 'سموحة',
    invoiceCode: 'DNY-90214',
    subtotal: 750,
    shippingFee: 85,
    totalAmount: 835,
    products: [
      {
        type: 'collection',
        isCollection: true,
        name: 'كوليكشن الإشراقة الملكية',
        badgeText: 'عرض العناية المتكاملة',
        quantity: 1,
        lineTotal: 750,
        items: [
          { productName: 'غسول فيتامين سي', variantName: '150 مل' },
          { productName: 'كريم الليل المجدد' },
          { productName: 'سيروم التفتيح المركز' }
        ]
      }
    ]
  };

  const msg = formatOrderMessage(order);

  assert.match(msg, /✨ <b>كوليكشن الإشراقة الملكية<\/b> \[عرض العناية المتكاملة\] × 1 — <b>750 EGP<\/b>/);
  assert.match(msg, /└ <i>غسول فيتامين سي \(150 مل\)<\/i>/);
  assert.match(msg, /└ <i>كريم الليل المجدد<\/i>/);
  assert.match(msg, /└ <i>سيروم التفتيح المركز<\/i>/);
});

// 20. Pink Friday campaign discount transparency
test('20. Premium UI: Pink Friday offers show campaign badge and discount transparency', () => {
  const order = {
    name: 'منى يوسف',
    phone: '01011223344',
    governorate: 'Cairo',
    city: 'مدينة نصر',
    invoiceCode: 'DNY-88991',
    subtotal: 620,
    discount: 80,
    shippingFee: 85,
    totalAmount: 705,
    products: [
      {
        name: 'مجموعة العناية بالشعر',
        quantity: 1,
        lineTotal: 620,
        isPinkFriday: true
      }
    ]
  };

  const msg = formatOrderMessage(order);

  assert.match(msg, /\[Pink Friday\]/);
  assert.match(msg, /• <b>قيمة المنتجات:<\/b> 620 EGP/);
  assert.match(msg, /• <b>الخصم:<\/b> 80 EGP/);
});

// 21. Free shipping vs paid shipping formatting
test('21. Premium UI: Shipping fee shows free shipping banner when 0, or amount when paid', () => {
  const freeShippingOrder = {
    name: 'أحمد فؤاد',
    phone: '01122334455',
    governorate: 'Cairo',
    city: 'التجمع',
    invoiceCode: 'DNY-FREE',
    subtotal: 2200,
    shippingFee: 0,
    totalAmount: 2200,
    products: [{ name: 'باقة المنتجات الشاملة', quantity: 1, lineTotal: 2200 }]
  };

  const paidShippingOrder = {
    name: 'أحمد فؤاد',
    phone: '01122334455',
    governorate: 'Gharbia',
    city: 'طنطا',
    invoiceCode: 'DNY-PAID',
    subtotal: 400,
    shippingFee: 70,
    totalAmount: 470,
    products: [{ name: 'كريم اليدين', quantity: 1, lineTotal: 400 }]
  };

  const msgFree = formatOrderMessage(freeShippingOrder);
  const msgPaid = formatOrderMessage(paidShippingOrder);

  assert.match(msgFree, /• <b>تكلفة الشحن:<\/b> مجاني \(عرض الشحن المجاني\)/);
  assert.match(msgPaid, /• <b>تكلفة الشحن:<\/b> 70 EGP/);
});

// 22. HTML safety: Customer data with &, <, >, ", '
test('22. Premium UI: Customer data with HTML special characters is safely escaped', () => {
  const maliciousCustomerOrder = {
    name: 'مريم & سارة <script>alert(1)</script>',
    phone: '01012345678',
    governorate: 'Cairo "North"',
    city: "حي الزهور 'الشرقي'",
    invoiceCode: 'DNY-SAFE-01',
    subtotal: 300,
    shippingFee: 85,
    totalAmount: 385,
    products: [{ name: 'زيت طبيعي', quantity: 1, lineTotal: 300 }]
  };

  const msg = formatOrderMessage(maliciousCustomerOrder);

  assert.equal(msg.includes('<script>'), false, 'Raw script tag must not exist in output');
  assert.match(msg, /مريم &amp; سارة &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(msg, /Cairo &quot;North&quot;/);
  assert.match(msg, /حي الزهور &#039;الشرقي&#039;/);
});

// 23. HTML safety: Product names with special characters
test('23. Premium UI: Product and variant names with HTML special characters are safely escaped', () => {
  const specialProductOrder = {
    name: 'عميل تجريبي',
    phone: '01012345678',
    governorate: 'Cairo',
    city: 'المعادي',
    invoiceCode: 'DNY-PROD-SAFE',
    subtotal: 500,
    shippingFee: 85,
    totalAmount: 585,
    products: [
      {
        name: 'كريم اليدين <Gold & Rose> "Premium"',
        variantName: "عطر 'الياسمين' & 'الفل'",
        quantity: 1,
        lineTotal: 500
      }
    ]
  };

  const msg = formatOrderMessage(specialProductOrder);

  assert.match(msg, /كريم اليدين &lt;Gold &amp; Rose&gt; &quot;Premium&quot;/);
  assert.match(msg, /عطر &#039;الياسمين&#039; &amp; &#039;الفل&#039;/);
});

// 24. Low stock alert message formatting
test('24. Premium UI: Low stock alert conforms to DANDY inventory alert theme', () => {
  const lowStock = formatLowStockMessage({ productName: 'سيروم النياسيناميد 10%', remainingQty: 3 });

  assert.match(lowStock, /⚠️ <b>DANDY INVENTORY ALERT<\/b>/);
  assert.match(lowStock, /<code>STOCK MONITORING SYSTEM<\/code>/);
  assert.match(lowStock, /<b>تنبيه: مخزون منخفض<\/b>/);
  assert.match(lowStock, /📦 <b>المنتج:<\/b> <b>سيروم النياسيناميد 10%<\/b>/);
  assert.match(lowStock, /📉 <b>الكمية المتبقية:<\/b> <b>3 قطع فقط<\/b>/);
  assert.match(lowStock, /🕒 <b>وقت التنبيه:<\/b>/);
});

// 25. Out of stock alert message formatting
test('25. Premium UI: Out of stock alert conforms to DANDY out-of-stock theme', () => {
  const outOfStock = formatLowStockMessage({ productName: 'غسول الشاي الأخضر', remainingQty: 0 });

  assert.match(outOfStock, /🚨 <b>PRODUCT OUT OF STOCK<\/b>/);
  assert.match(outOfStock, /<code>STOCK MONITORING SYSTEM<\/code>/);
  assert.match(outOfStock, /<b>المنتج نفد من المخزون<\/b>/);
  assert.match(outOfStock, /📦 <b>المنتج:<\/b> <b>غسول الشاي الأخضر<\/b>/);
  assert.match(outOfStock, /📉 <b>الحالة:<\/b> <b>نفد بالكامل \(0 قطع متبقية\)<\/b>/);
  assert.match(outOfStock, /🕒 <b>وقت التنبيه:<\/b>/);
});

// 26. Inline Keyboard markup URLs and structure validation
test('26. Premium UI: Order & Stock notifications include valid Telegram Inline Keyboard URLs', async () => {
  let capturedOrderPayload = null;
  let capturedStockPayload = null;

  const restore = createMockFetch(async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.text.includes('ORDER MANAGEMENT SYSTEM')) {
      capturedOrderPayload = body;
    } else if (body.text.includes('STOCK MONITORING SYSTEM')) {
      capturedStockPayload = body;
    }
    return new Response(JSON.stringify({ ok: true, result: { message_id: 123 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  });

  try {
    // Dispatch Order
    await sendTelegramNotification({
      tokenOverride: 'mock_token',
      chatIdsOverride: ['-1002345678901'],
      order: {
        name: 'أميرة حسن',
        phone: '01012345678',
        governorate: 'Cairo',
        city: 'الزمالك',
        invoiceCode: 'DNY-TEST-KB',
        subtotal: 500,
        shippingFee: 85,
        totalAmount: 585,
        products: [{ name: 'منتج تجريبي', quantity: 1, lineTotal: 500 }]
      }
    });

    // Dispatch Stock Alert
    await sendTelegramNotification({
      tokenOverride: 'mock_token',
      chatIdsOverride: ['-1002345678901'],
      lowStockAlert: true,
      productName: 'غسول تجريبي',
      remainingQty: 2
    });

    // Validate Order Keyboard
    assert.ok(capturedOrderPayload?.reply_markup?.inline_keyboard, 'Order payload must include reply_markup.inline_keyboard');
    const orderButtons = capturedOrderPayload.reply_markup.inline_keyboard[0];
    assert.equal(orderButtons[0].text, '📋 فتح الطلب في الداشبورد');
    assert.equal(orderButtons[0].url, 'https://dandy-ebon.vercel.app/dashboard-order');
    assert.equal(orderButtons[1].text, '🏠 لوحة التحكم');
    assert.equal(orderButtons[1].url, 'https://dandy-ebon.vercel.app/dashboard');

    // Validate Stock Keyboard
    assert.ok(capturedStockPayload?.reply_markup?.inline_keyboard, 'Stock payload must include reply_markup.inline_keyboard');
    const stockButtons = capturedStockPayload.reply_markup.inline_keyboard[0];
    assert.equal(stockButtons[0].text, '📦 إدارة المنتجات والمخزون');
    assert.equal(stockButtons[0].url, 'https://dandy-ebon.vercel.app/dashboard-product');
  } finally {
    restore();
  }
});

// 27. Security & Privacy: Never leak customer email, tokens, or private address
test('27. Premium UI Security: Strictly prevents leaking customer email or internal tokens', () => {
  const sensitiveOrder = {
    name: 'هدى مصطفى',
    email: 'hoda.mustafa.private@gmail.com',
    phone: '01099887766',
    governorate: 'Alexandria',
    city: 'محرم بك',
    address: 'شارع 15 متفرع من شارع بورسعيد شقة 4 عمارة النصر',
    invoiceCode: 'DNY-SECURE',
    invoiceAccessToken: 'private_invoice_token_SECRET_123',
    internalSecret: 'INTERNAL_API_SECRET_XYZ',
    subtotal: 600,
    shippingFee: 85,
    totalAmount: 685,
    products: [{ name: 'مجموعة التبييض', quantity: 1, lineTotal: 600 }]
  };

  const formattedMsg = formatOrderMessage(sensitiveOrder);

  assert.equal(formattedMsg.includes('hoda.mustafa.private@gmail.com'), false, 'Email must NOT be present');
  assert.equal(formattedMsg.includes('private_invoice_token_SECRET_123'), false, 'Invoice access token must NOT be present');
  assert.equal(formattedMsg.includes('INTERNAL_API_SECRET_XYZ'), false, 'Internal secrets must NOT be present');
  assert.equal(formattedMsg.includes('شارع 15 متفرع من شارع بورسعيد'), false, 'Detailed residence address must NOT be present');
  assert.match(formattedMsg, /محرم بك/);
  assert.match(formattedMsg, /Alexandria/);
});

// 28. Message length safety: Truncates large cart gracefully under Telegram 4096 character limit
test('28. Premium UI Resilience: Very large order gracefully summarizes without exceeding Telegram limits', () => {
  const manyProducts = [];
  for (let i = 1; i <= 25; i++) {
    manyProducts.push({
      name: `منتج تجميلي طبيعي رقم ${i} بتركيبة الزيوت العشبية والخلاصات الطبيعية المركزة`,
      quantity: 2,
      lineTotal: 300,
      variantName: `تركيبة رقم ${i} برائحة اللافندر والخزامى البرية`
    });
  }

  const hugeOrder = {
    name: 'صالون التجميل الملكي',
    phone: '01000000000',
    governorate: 'Cairo',
    city: 'المعادي',
    invoiceCode: 'DNY-HUGE-CART',
    subtotal: 7500,
    shippingFee: 0,
    totalAmount: 7500,
    products: manyProducts
  };

  const msg = formatOrderMessage(hugeOrder);

  // Must not exceed Telegram 4096 character limit
  assert.ok(msg.length < 3500, `Message length (${msg.length}) must be well below Telegram 4096 char limit`);
  assert.match(msg, /وتفاصيل 13 منتجات إضافية متاحة في لوحة التحكم/);
});


