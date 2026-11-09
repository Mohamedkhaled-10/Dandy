// src/utils/telegram.js
// Centralized, hardened Telegram notification and diagnostics service for Dandy Cosmetics
// Design Theme: DANDY Minimal Luxury / Premium Arabic Beauty Store

/**
 * Standard URLs for supervisor interactive Telegram actions
 */
export const TELEGRAM_ACTION_URLS = {
  DASHBOARD_ORDER: 'https://dandy-ebon.vercel.app/dashboard-order',
  DASHBOARD_MAIN: 'https://dandy-ebon.vercel.app/dashboard',
  DASHBOARD_PRODUCT: 'https://dandy-ebon.vercel.app/dashboard-product'
};

/**
 * Escapes special HTML characters to prevent Telegram HTML parse errors and injection.
 * Escapes &, <, >, ", and '.
 * @param {string|number|null|undefined} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Splits and trims comma-separated Chat IDs while strictly maintaining string format.
 * Prevents 64-bit integer precision loss (e.g., -100xxxxxxxxxx).
 * @param {string|string[]|number|null|undefined} raw
 * @returns {string[]}
 */
export function parseChatIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(id => String(id).trim()).filter(Boolean);
  }
  return String(raw)
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

/**
 * Validates Telegram Chat ID format.
 * Supports standard groups, users (-12345, 12345), supergroups/channels (-1001234567890),
 * and public usernames (@channel_name).
 * @param {string} id
 * @returns {boolean}
 */
export function isValidChatId(id) {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  return /^-?\d{5,20}$/.test(trimmed) || /^@[a-zA-Z0-9_]{4,32}$/.test(trimmed);
}

/**
 * Formats a new order into a premium, operational HTML notification.
 * Strictly avoids customer email, invoice access tokens, or sensitive credentials.
 * Includes Collection bundle breakdown and financial transparency.
 *
 * @param {object} order
 * @param {string} [orderId]
 * @returns {string}
 */
export function formatOrderMessage(order, orderId = null) {
  if (!order) {
    return `🖤 <b>DANDY STORE</b>\n<code>ORDER MANAGEMENT SYSTEM</code>\n────────────────\n🔔 <b>إشعار جديد من متجر داندي</b>\n${escapeHtml(JSON.stringify({ orderId }))}`;
  }

  const dateText = order.timestamp
    ? new Date(order.timestamp).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })
    : new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

  const invoiceCodeText = order.invoiceCode || orderId || '-';
  const totalAmountVal = order.totalAmount !== undefined ? order.totalAmount : '-';
  const totalFormatted = typeof totalAmountVal === 'number' ? `${totalAmountVal} EGP` : `${totalAmountVal}`;

  // Customer Information (Operational only - no email, no secrets, no full private address)
  const customerName = escapeHtml(order.name || '-');
  const customerPhone = escapeHtml(order.phone || '-');
  const gov = escapeHtml(order.governorate || '-');
  const city = escapeHtml(order.city || '-');

  // Products formatting with Collection Bundle support
  const maxDisplayedProducts = 12;
  const rawProducts = Array.isArray(order.products) ? order.products : [];
  const productsToDisplay = rawProducts.slice(0, maxDisplayedProducts);
  const productsLines = [];

  for (let idx = 0; idx < productsToDisplay.length; idx++) {
    const p = productsToDisplay[idx];
    const qty = p.quantity || 1;
    const isCollection = Boolean(p.type === 'collection' || p.isCollection || p.collectionId);

    if (isCollection) {
      const colPrice = p.lineTotal !== undefined
        ? `${p.lineTotal} EGP`
        : (p.price ? `${p.price * qty} EGP` : '');
      const badge = p.badgeText ? ` [${escapeHtml(p.badgeText)}]` : '';
      let colLine = `${idx + 1}. ✨ <b>${escapeHtml(p.name || 'كوليكشن')}</b>${badge} × ${qty}${colPrice ? ` — <b>${escapeHtml(colPrice)}</b>` : ''}`;

      // Show nested items inside collection if present
      if (Array.isArray(p.items) && p.items.length > 0) {
        const nestedItems = p.items.map(it => {
          const itVariant = it.variantName ? ` (${escapeHtml(it.variantName)})` : '';
          return `   └ <i>${escapeHtml(it.productName || it.name || 'عنصر')}${itVariant}</i>`;
        }).join('\n');
        colLine += '\n' + nestedItems;
      }
      productsLines.push(colLine);
    } else {
      const variantPart = p.variantName ? ` (${escapeHtml(p.variantName)})` : '';
      const linePrice = p.lineTotal !== undefined
        ? `${p.lineTotal} EGP`
        : (p.price ? `${p.price * qty} EGP` : (p.effectiveUnitPrice ? `${p.effectiveUnitPrice * qty} EGP` : ''));
      const pfBadge = p.isPinkFriday ? ' [Pink Friday]' : '';
      const pLine = `${idx + 1}. <b>${escapeHtml(p.name || 'منتج')}</b>${variantPart}${pfBadge} × ${qty}${linePrice ? ` — <b>${escapeHtml(linePrice)}</b>` : ''}`;
      productsLines.push(pLine);
    }
  }

  if (rawProducts.length > maxDisplayedProducts) {
    productsLines.push(`• <i>... وتفاصيل ${rawProducts.length - maxDisplayedProducts} منتجات إضافية متاحة في لوحة التحكم</i>`);
  }

  const productsSection = productsLines.length > 0
    ? '\n' + productsLines.join('\n')
    : '\n• <i>لا توجد منتجات مسجلة</i>';

  // Financial Summary
  const subtotalText = order.subtotal !== undefined ? `${order.subtotal} EGP` : '-';
  const shippingText = order.shippingFee === 0
    ? 'مجاني (عرض الشحن المجاني)'
    : (order.shippingFee !== undefined ? `${order.shippingFee} EGP` : '-');

  let discountLine = '';
  if (order.discount && Number(order.discount) > 0) {
    discountLine = `\n• <b>الخصم:</b> ${escapeHtml(String(order.discount))} EGP`;
  }

  return `🖤 <b>DANDY STORE</b>
<code>ORDER MANAGEMENT SYSTEM</code>
────────────────
🔔 <b>تم استلام طلب جديد!</b>

🧾 <b>رقم الفاتورة:</b> <code>${escapeHtml(invoiceCodeText)}</code>
💰 <b>إجمالي الطلب:</b> <b>${escapeHtml(totalFormatted)}</b>
────────────────
👤 <b>بيانات العميل</b>

• <b>الاسم:</b> ${customerName}
• <b>الهاتف:</b> <code>${customerPhone}</code>
• <b>المحافظة:</b> ${gov}
• <b>المدينة/المركز:</b> ${city}
────────────────
🛍 <b>المنتجات المطلوبة</b>${productsSection}
────────────────
💵 <b>ملخص الحساب</b>

• <b>قيمة المنتجات:</b> ${escapeHtml(subtotalText)}${discountLine}
• <b>تكلفة الشحن:</b> ${escapeHtml(shippingText)}
• <b>الإجمالي النهائي:</b> <b>${escapeHtml(totalFormatted)}</b>
────────────────
🕒 <b>وقت الطلب:</b> ${escapeHtml(dateText)}`;
}

/**
 * Formats a low stock or out of stock alert message according to DANDY Luxury Brand standards.
 * @param {object} param
 * @param {string} param.productName
 * @param {number|null} param.remainingQty
 * @returns {string}
 */
export function formatLowStockMessage({ productName, remainingQty }) {
  const isSoldOut = remainingQty !== null && remainingQty !== undefined && Number(remainingQty) <= 0;
  const timeText = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

  if (isSoldOut) {
    return `🚨 <b>PRODUCT OUT OF STOCK</b>
<code>STOCK MONITORING SYSTEM</code>
────────────────
<b>المنتج نفد من المخزون</b>

📦 <b>المنتج:</b> <b>${escapeHtml(productName || '-')}</b>
📉 <b>الحالة:</b> <b>نفد بالكامل (0 قطع متبقية)</b>
🕒 <b>وقت التنبيه:</b> ${escapeHtml(timeText)}`;
  }

  return `⚠️ <b>DANDY INVENTORY ALERT</b>
<code>STOCK MONITORING SYSTEM</code>
────────────────
<b>تنبيه: مخزون منخفض</b>

📦 <b>المنتج:</b> <b>${escapeHtml(productName || '-')}</b>
📉 <b>الكمية المتبقية:</b> <b>${escapeHtml(String(remainingQty ?? 0))} قطع فقط</b>
🕒 <b>وقت التنبيه:</b> ${escapeHtml(timeText)}`;
}

/**
 * Standard inline keyboards for Telegram notifications
 */
export function getOrderInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: '📋 فتح الطلب في الداشبورد',
          url: TELEGRAM_ACTION_URLS.DASHBOARD_ORDER
        },
        {
          text: '🏠 لوحة التحكم',
          url: TELEGRAM_ACTION_URLS.DASHBOARD_MAIN
        }
      ]
    ]
  };
}

export function getStockInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: '📦 إدارة المنتجات والمخزون',
          url: TELEGRAM_ACTION_URLS.DASHBOARD_PRODUCT
        }
      ]
    ]
  };
}

export function getDiagnosticsInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: '📋 متابعة الطلبات',
          url: TELEGRAM_ACTION_URLS.DASHBOARD_ORDER
        },
        {
          text: '🏠 لوحة التحكم',
          url: TELEGRAM_ACTION_URLS.DASHBOARD_MAIN
        }
      ]
    ]
  };
}

/**
 * Categorizes Telegram API error responses into standard diagnostic error codes.
 * @param {number} status
 * @param {object} data
 * @returns {{ code: string, description: string, retryAfter?: number }}
 */
export function categorizeTelegramError(status, data = {}) {
  const desc = data?.description || '';
  const retryAfter = data?.parameters?.retry_after;

  if (status === 401 || desc.includes('Unauthorized')) {
    return { code: 'UNAUTHORIZED', description: 'Bot Token غير صالح أو تم إلغاؤه (Unauthorized)' };
  }
  if (status === 429 || desc.includes('Too Many Requests')) {
    return {
      code: 'TOO_MANY_REQUESTS',
      description: `تم تجاوز معدل الإرسال (429 Too Many Requests)${retryAfter ? ` - يرجى الانتظار ${retryAfter} ثانية` : ''}`,
      retryAfter
    };
  }
  if (desc.includes('chat not found')) {
    return { code: 'CHAT_NOT_FOUND', description: 'المجموعة غير موجودة أو لم يبدأ البوت محادثة معها (Chat not found)' };
  }
  if (desc.includes('bot was kicked') || desc.includes('bot was blocked')) {
    return { code: 'BOT_KICKED', description: 'تم طرد البوت أو حظره من المجموعة (Bot was kicked/blocked)' };
  }
  if (desc.includes('not a member') || desc.includes('bot is not a member')) {
    return { code: 'BOT_NOT_MEMBER', description: 'البوت ليس عضواً في هذه المجموعة (Bot is not a member)' };
  }
  if (desc.includes('not enough rights') || desc.includes('rights')) {
    return { code: 'NOT_ENOUGH_RIGHTS', description: 'البوت لا يملك صلاحية إرسال الرسائل في المجموعة (Not enough rights)' };
  }
  if (desc.includes("can't parse entities")) {
    return { code: 'PARSE_ERROR', description: 'خطأ في تنسيق نص الرسالة (Parse Error)' };
  }
  if (status === 400 || desc.includes('Bad Request')) {
    return { code: 'BAD_REQUEST', description: `طلب غير صالح: ${desc || 'Bad Request'}` };
  }
  return { code: 'TELEGRAM_ERROR', description: desc || `Telegram HTTP ${status}` };
}

/**
 * Core centralized function to dispatch Telegram notifications.
 * Supports HTML formatting and interactive Inline Keyboard buttons.
 *
 * @param {object} options
 * @param {object} [options.order]
 * @param {string} [options.orderId]
 * @param {boolean} [options.lowStockAlert]
 * @param {string} [options.productName]
 * @param {number|null} [options.remainingQty]
 * @param {string} [options.customHtml]
 * @param {object|boolean|null} [options.replyMarkupOverride]
 * @param {number} [options.timeoutMs=5000]
 * @param {string|string[]} [options.chatIdsOverride]
 * @param {string} [options.tokenOverride]
 * @returns {Promise<{
 *   success: boolean,
 *   allSuccessful: boolean,
 *   anySuccessful: boolean,
 *   status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE' | 'SIMULATED',
 *   results: Array<{ chatId: string, success: boolean, error?: any, messageId?: number }>,
 *   totalSent: number,
 *   totalFailed: number,
 *   simulated?: boolean,
 *   message?: string
 * }>}
 */
export async function sendTelegramNotification({
  order = null,
  orderId = null,
  lowStockAlert = false,
  productName = '',
  remainingQty = null,
  customHtml = null,
  replyMarkupOverride = undefined,
  timeoutMs = 5000,
  chatIdsOverride = null,
  tokenOverride = null
} = {}) {
  const token = (tokenOverride || process.env.TELEGRAM_TOKEN || '').trim();
  const rawChatIds = chatIdsOverride !== null && chatIdsOverride !== undefined
    ? chatIdsOverride
    : (process.env.TELEGRAM_CHAT_ID || '');

  if (!token || !rawChatIds) {
    console.warn('[TELEGRAM NOTICE] TELEGRAM_TOKEN or TELEGRAM_CHAT_ID is missing from environment. Notification simulated.');
    return {
      success: true,
      allSuccessful: true,
      anySuccessful: false,
      status: 'SIMULATED',
      simulated: true,
      message: 'Tokens missing in environment - notification simulated.',
      results: [],
      totalSent: 0,
      totalFailed: 0
    };
  }

  const chatIds = parseChatIds(rawChatIds);

  if (chatIds.length === 0) {
    console.warn('[TELEGRAM NOTICE] No valid chat IDs found in TELEGRAM_CHAT_ID.');
    return {
      success: false,
      allSuccessful: false,
      anySuccessful: false,
      status: 'FAILURE',
      error: 'NO_CHAT_IDS',
      results: [],
      totalSent: 0,
      totalFailed: 0
    };
  }

  let htmlMessage = '';
  let defaultReplyMarkup = null;

  if (customHtml) {
    htmlMessage = customHtml;
  } else if (lowStockAlert) {
    htmlMessage = formatLowStockMessage({ productName, remainingQty });
    defaultReplyMarkup = getStockInlineKeyboard();
  } else if (order) {
    htmlMessage = formatOrderMessage(order, orderId);
    defaultReplyMarkup = getOrderInlineKeyboard();
  } else {
    htmlMessage = `🖤 <b>DANDY STORE</b>\n<code>ORDER MANAGEMENT SYSTEM</code>\n────────────────\n🔔 <b>إشعار جديد من متجر داندي</b>\n${escapeHtml(JSON.stringify({ orderId }))}`;
    defaultReplyMarkup = getOrderInlineKeyboard();
  }

  // Determine final reply_markup (allows disabling by passing false or providing custom)
  let effectiveReplyMarkup = defaultReplyMarkup;
  if (replyMarkupOverride !== undefined) {
    effectiveReplyMarkup = replyMarkupOverride || null;
  }

  const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  const results = [];

  for (const chatId of chatIds) {
    // Validate chatId format before dispatching network request
    if (!isValidChatId(chatId)) {
      console.error(`[TELEGRAM ERROR] Invalid Chat ID format: "${chatId}"`);
      results.push({
        chatId,
        success: false,
        error: {
          code: 'INVALID_CHAT_ID',
          description: `معرف المحادثة غير صحيح أو غير متوافق: ${chatId}`
        }
      });
      continue;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const payload = {
        chat_id: chatId,
        text: htmlMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      };

      if (effectiveReplyMarkup) {
        payload.reply_markup = effectiveReplyMarkup;
      }

      const res = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timer);

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        const errorDetails = categorizeTelegramError(res.status, data);
        console.error(`[TELEGRAM ERROR] Failed sending to chatId ${chatId}:`, {
          status: res.status,
          telegramResponse: data,
          categorized: errorDetails
        });
        results.push({
          chatId,
          success: false,
          error: errorDetails,
          rawResponse: data
        });
      } else {
        results.push({
          chatId,
          success: true,
          messageId: data.result?.message_id
        });
      }
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');
      const errInfo = {
        code: isTimeout ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR',
        description: isTimeout
          ? `انتهت مهلة الاتصال بتيليجرام (${timeoutMs}ms)`
          : `خطأ في الاتصال بالشبكة: ${err.message}`
      };
      console.error(`[TELEGRAM EXCEPTION] Error posting to Telegram for chatId ${chatId}:`, errInfo);
      results.push({
        chatId,
        success: false,
        error: errInfo
      });
    }
  }

  const totalSent = results.filter(r => r.success).length;
  const totalFailed = results.filter(r => !r.success).length;
  const allSuccessful = results.length > 0 && totalFailed === 0;
  const anySuccessful = totalSent > 0;

  let status = 'FAILURE';
  if (allSuccessful) {
    status = 'SUCCESS';
  } else if (anySuccessful) {
    status = 'PARTIAL_SUCCESS';
  }

  return {
    success: allSuccessful,
    allSuccessful,
    anySuccessful,
    status,
    results,
    totalSent,
    totalFailed
  };
}

/**
 * Verifies the bot token via getMe.
 * @param {string} token
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<{ ok: boolean, bot?: object, error?: object }>}
 */
export async function verifyTelegramBot(token, timeoutMs = 5000) {
  const cleanToken = (token || '').trim();
  if (!cleanToken) {
    return { ok: false, error: { code: 'MISSING_TOKEN', description: 'Bot Token غير موجود' } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timer);

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, error: categorizeTelegramError(res.status, data) };
    }

    return {
      ok: true,
      bot: {
        id: data.result?.id,
        isBot: data.result?.is_bot,
        firstName: data.result?.first_name,
        username: data.result?.username,
        canJoinGroups: data.result?.can_join_groups,
        canReadAllGroupMessages: data.result?.can_read_all_group_messages
      }
    };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err.name === 'AbortError';
    return {
      ok: false,
      error: {
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        description: isTimeout ? 'انتهت مهلة استعلام البوت' : err.message
      }
    };
  }
}

/**
 * Checks group chat access and bot membership status.
 * @param {string} token
 * @param {string} chatId
 * @param {number} botId
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<object>}
 */
export async function inspectTelegramChat(token, chatId, botId, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const result = {
    chatId,
    accessible: false,
    title: null,
    type: null,
    botStatus: null,
    canSendMessages: null,
    error: null
  };

  try {
    // 1. getChat
    const chatRes = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId }),
      signal: controller.signal
    });
    const chatData = await chatRes.json().catch(() => ({}));

    if (!chatRes.ok || !chatData.ok) {
      clearTimeout(timer);
      result.error = categorizeTelegramError(chatRes.status, chatData);
      return result;
    }

    result.accessible = true;
    result.title = chatData.result?.title || chatData.result?.username || null;
    result.type = chatData.result?.type || null;

    // 2. getChatMember if botId is provided
    if (botId) {
      const memberRes = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, user_id: botId }),
        signal: controller.signal
      });
      const memberData = await memberRes.json().catch(() => ({}));
      if (memberRes.ok && memberData.ok) {
        result.botStatus = memberData.result?.status; // 'creator', 'administrator', 'member', 'restricted', 'left', 'kicked'
        result.canSendMessages = memberData.result?.can_send_messages ?? (result.botStatus === 'administrator' || result.botStatus === 'member' || result.botStatus === 'creator');
      }
    }

    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err.name === 'AbortError';
    result.error = {
      code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      description: isTimeout ? 'انتهت مهلة استعلام معلومات المحادثة' : err.message
    };
    return result;
  }
}

/**
 * Diagnostic runner for Admin testing of Telegram Bot connectivity and group setup.
 * Sends the canonical test message only after verifying getMe and getChat.
 *
 * @param {object} options
 * @param {string} [options.tokenOverride]
 * @param {string|string[]} [options.chatIdsOverride]
 * @param {number} [options.timeoutMs=6000]
 * @returns {Promise<object>}
 */
export async function diagnoseTelegramSetup({
  tokenOverride = null,
  chatIdsOverride = null,
  timeoutMs = 6000
} = {}) {
  const token = (tokenOverride || process.env.TELEGRAM_TOKEN || '').trim();
  const rawChatIds = chatIdsOverride !== null && chatIdsOverride !== undefined
    ? chatIdsOverride
    : (process.env.TELEGRAM_CHAT_ID || '');

  if (!token) {
    return {
      success: false,
      status: 'FAILURE',
      error: 'CONFIG_MISSING_TOKEN',
      message: 'متغير البيئة TELEGRAM_TOKEN غير معين في السيرفر.'
    };
  }

  const chatIds = parseChatIds(rawChatIds);
  if (chatIds.length === 0) {
    return {
      success: false,
      status: 'FAILURE',
      error: 'CONFIG_MISSING_CHAT_ID',
      message: 'متغير البيئة TELEGRAM_CHAT_ID غير معين أو فارغ في السيرفر.'
    };
  }

  // 1. Verify Bot Token via getMe
  const botCheck = await verifyTelegramBot(token, timeoutMs);
  if (!botCheck.ok) {
    return {
      success: false,
      status: 'FAILURE',
      bot: { valid: false },
      error: botCheck.error,
      message: `فشل التحقق من صلاحية Bot Token: ${botCheck.error?.description || 'غير صالح'}`
    };
  }

  const botDetails = botCheck.bot;

  // 2. Inspect each chat and attempt sending test message
  const chatReports = [];
  const testMessageHtml = `🖤 <b>DANDY STORE</b>
<code>SYSTEM DIAGNOSTICS & TELEGRAM BOT</code>
────────────────
✅ <b>DANDY Telegram Connection Test</b>
تم الاتصال بنجاح، وإشعارات الطلبات جاهزة ومفعلة.

🕒 <b>تاريخ الفحص:</b> <code>${escapeHtml(new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }))}</code>`;

  for (const chatId of chatIds) {
    const inspection = await inspectTelegramChat(token, chatId, botDetails.id, timeoutMs);

    let testSendResult = null;
    if (inspection.accessible) {
      // Send the strict fixed test message with luxury keyboard
      const sendRes = await sendTelegramNotification({
        customHtml: testMessageHtml,
        replyMarkupOverride: getDiagnosticsInlineKeyboard(),
        chatIdsOverride: [chatId],
        tokenOverride: token,
        timeoutMs
      });
      testSendResult = sendRes.results?.[0] || null;
    }

    const messageSent = Boolean(testSendResult?.success);
    const finalError = inspection.error || testSendResult?.error || null;

    chatReports.push({
      chatId,
      accessible: inspection.accessible,
      title: inspection.title,
      type: inspection.type,
      botStatus: inspection.botStatus,
      canSendMessages: inspection.canSendMessages,
      messageSent,
      error: finalError
    });
  }

  const allSent = chatReports.length > 0 && chatReports.every(c => c.messageSent);
  const anySent = chatReports.some(c => c.messageSent);
  const overallStatus = allSent ? 'SUCCESS' : (anySent ? 'PARTIAL_SUCCESS' : 'FAILURE');

  return {
    success: allSent,
    allSuccessful: allSent,
    anySuccessful: anySent,
    status: overallStatus,
    bot: {
      valid: true,
      id: botDetails.id,
      username: botDetails.username,
      firstName: botDetails.firstName
    },
    chats: chatReports,
    message: allSent
      ? 'تم اختبار الاتصال بنجاح وإرسال رسالة الاختبار لجميع الجروبات.'
      : (anySent ? 'نجح الاتصال ببعض الجروبات وتعذر الوصول إلى أخرى.' : 'فشل إرسال رسالة الاختبار إلى الجروب.')
  };
}
