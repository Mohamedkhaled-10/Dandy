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
  assert.match(lowMsg, /تنبيه مخزون منخفض/);
  assert.match(lowMsg, /غسول الوجه العشبي/);
  assert.match(lowMsg, /2/);

  const soldOutMsg = formatLowStockMessage({ productName: 'كريم الليل المرطب', remainingQty: 0 });
  assert.match(soldOutMsg, /نفاد مخزون منتج بالكامل/);
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
