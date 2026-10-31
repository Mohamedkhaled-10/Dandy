// src/utils/telegram.js
// Centralized, robust Telegram notification service for Dandy Cosmetics

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendTelegramNotification({
  order = null,
  orderId = null,
  lowStockAlert = false,
  productName = '',
  remainingQty = null
} = {}) {
  const token = process.env.TELEGRAM_TOKEN?.trim();
  const chatIdsEnv = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token || !chatIdsEnv) {
    console.warn('[TELEGRAM NOTICE] TELEGRAM_TOKEN or TELEGRAM_CHAT_ID is missing from environment. Notification simulated.');
    return {
      success: true,
      simulated: true,
      message: 'Tokens missing in environment - notification simulated.'
    };
  }

  const chatIds = chatIdsEnv
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  if (chatIds.length === 0) {
    console.warn('[TELEGRAM NOTICE] No valid chat IDs found in TELEGRAM_CHAT_ID.');
    return { success: false, error: 'NO_CHAT_IDS' };
  }

  let htmlMessage = '';

  if (lowStockAlert) {
    htmlMessage = `⚠️ <b>تنبيه مخزون منخفض في متجر داندي!</b>
────────────────
📦 <b>المنتج:</b> ${escapeHtml(productName || '-')}
📉 <b>الكمية المتبقية:</b> <b>${escapeHtml(String(remainingQty ?? 0))}</b>
⏱ <b>الوقت:</b> ${escapeHtml(new Date().toLocaleString('ar-EG'))}

🔗 <a href="https://dandy-ebon.vercel.app/dashboard-product">إدارة المنتجات في لوحة التحكم</a>`;
  } else if (order) {
    const dateText = order.timestamp
      ? new Date(order.timestamp).toLocaleString('ar-EG')
      : new Date().toLocaleString('ar-EG');

    let productsText = '';
    if (Array.isArray(order.products) && order.products.length > 0) {
      productsText = '\n🛍 <b>المنتجات المطلوبة:</b>\n' + order.products.map((p, idx) => {
        const variantPart = p.variantName ? ` (${escapeHtml(p.variantName)})` : '';
        const qty = p.quantity || 1;
        const linePrice = p.lineTotal ? `${p.lineTotal} ج.م` : (p.price ? `${p.price * qty} ج.م` : '');
        return `  ${idx + 1}. <b>${escapeHtml(p.name || 'منتج')}</b>${variantPart} × ${qty}${linePrice ? ` — [${linePrice}]` : ''}`;
      }).join('\n');
    }

    const subtotalText = order.subtotal !== undefined ? `${order.subtotal} ج.م` : '-';
    const shippingText = order.shippingFee === 0 ? 'مجاني' : (order.shippingFee !== undefined ? `${order.shippingFee} ج.م` : '-');
    const totalText = order.totalAmount !== undefined ? `${order.totalAmount} ج.م` : '-';
    const invoiceCodeText = order.invoiceCode || orderId || '-';

    htmlMessage = `🔔 <b>طلب جديد في متجر داندي!</b>
────────────────
👤 <b>العميل/ة:</b> ${escapeHtml(order.name || '-')}
📞 <b>رقم الهاتف:</b> <code>${escapeHtml(order.phone || '-')}</code>
📍 <b>المحافظة:</b> ${escapeHtml(order.governorate || '-')}
🏙 <b>المدينة/المركز:</b> ${escapeHtml(order.city || '-')}
📦 <b>العنوان:</b> ${escapeHtml(order.address || '-')}
🧾 <b>كود الفاتورة:</b> <code>${escapeHtml(invoiceCodeText)}</code>${productsText}
────────────────
💵 <b>المنتجات:</b> ${escapeHtml(subtotalText)}
🚚 <b>الشحن:</b> ${escapeHtml(shippingText)}
💰 <b>الإجمالي النهائي:</b> <b>${escapeHtml(totalText)}</b>
⏱ <b>الوقت:</b> ${escapeHtml(dateText)}

🔗 <a href="https://dandy-ebon.vercel.app/dashboard-order">عرض تفاصيل الطلب في لوحة التحكم</a>`;
  } else {
    htmlMessage = `🔔 <b>إشعار جديد من متجر داندي</b>\n${escapeHtml(JSON.stringify({ orderId }))}`;
  }

  const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  const results = [];

  for (const chatId of chatIds) {
    try {
      const res = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: htmlMessage,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        console.error(`[TELEGRAM ERROR] Failed to send message to chatId ${chatId}:`, data);
        results.push({ chatId, success: false, error: data });
      } else {
        results.push({ chatId, success: true });
      }
    } catch (err) {
      console.error(`[TELEGRAM EXCEPTION] Error posting to Telegram for chatId ${chatId}:`, err);
      results.push({ chatId, success: false, error: err.message });
    }
  }

  const hasSuccess = results.some(r => r.success);
  return {
    success: hasSuccess,
    results
  };
}
