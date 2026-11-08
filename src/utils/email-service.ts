// src/utils/email-service.ts
import crypto from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

export type NotificationStatus =
  | 'accepted_by_mailapp'
  | 'pending'
  | 'failed'
  | 'unknown'
  | 'skipped_no_valid_email';

export type NotificationEventType = 'ORDER_CONFIRMATION' | 'ORDER_STATUS_CHANGED';

export const CANONICAL_STATUSES = [
  'جديد',
  'قيد التجهيز',
  'تم الشحن',
  'تم التوصيل',
  'ملغي'
] as const;

export type CanonicalStatus = typeof CANONICAL_STATUSES[number];

export const FIXED_DIAGNOSTIC_RECIPIENT = 'dandybeauty4@gmail.com';

/**
 * Normalizes input status to one of the 5 canonical Arabic statuses.
 */
export function normalizeOrderStatus(status: unknown): CanonicalStatus {
  const raw = String(status ?? 'جديد').trim();
  const lower = raw.toLowerCase();
  if (raw === 'جديد' || lower === 'new') return 'جديد';
  if (raw === 'قيد التجهيز' || raw === 'تم التواصل' || lower === 'processing') return 'قيد التجهيز';
  if (raw === 'تم الشحن' || raw === 'جاري الشحن' || lower === 'shipped') return 'تم الشحن';
  if (raw === 'تم التوصيل' || raw === 'مكتمل' || lower === 'delivered' || lower === 'completed') return 'تم التوصيل';
  if (raw === 'ملغي' || lower === 'cancelled' || lower === 'canceled') return 'ملغي';
  return 'جديد';
}

/**
 * Validates email address format.
 */
export function isValidEmail(email: unknown): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed === '' || trimmed.toUpperCase() === 'N/A' || trimmed.includes(' ')) return false;
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return re.test(trimmed);
}

/**
 * Deterministic JSON stringifier to guarantee identical canonical serialization across Node and Google Apps Script.
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJson).join(',') + ']';
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalizeJson(record[k])).join(',') + '}';
}

/**
 * Computes HMAC-SHA256 signature as hex.
 */
export function computeHmacSha256(canonicalMessage: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(canonicalMessage, 'utf8').digest('hex');
}

/**
 * Get Firebase Database instance safely.
 */
function getAdminDb() {
  try {
    if (getApps().length > 0) {
      return getDatabase(getApps()[0]);
    }
    const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!saEnv) return null;
    const serviceAccount = typeof saEnv === 'string' ? JSON.parse(saEnv) : { ...saEnv };
    if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string' && serviceAccount.private_key.includes('\\n')) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    const app = initializeApp({
      credential: cert(serviceAccount),
      databaseURL: 'https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app'
    });
    return getDatabase(app);
  } catch (err) {
    console.warn('[EmailService] Firebase Admin not available:', (err as Error)?.message || err);
    return null;
  }
}

// =============================================================================
// Egyptian Governorate Shipping Rates & Financial Calculations
// =============================================================================

export const EGYPT_SHIPPING_RATES: Record<string, number> = {
  // English keys
  "Gharbia": 70,
  "Dakahlia": 85,
  "Sharqia": 85,
  "Kafr El Sheikh": 85,
  "Qalyubia": 85,
  "Port Said": 85,
  "Damietta": 85,
  "Suez": 85,
  "Ismailia": 85,
  "Cairo": 85,
  "Giza": 85,
  "Beheira": 85,
  "Monufia": 85,
  "Alexandria": 85,
  "Fayoum": 100,
  "Beni Suef": 100,
  "Minya": 100,
  "Luxor": 120,
  "Aswan": 120,
  "Assiut": 120,
  "Sohag": 120,
  "North Sinai": 120,
  "South Sinai": 120,
  "Qena": 120,
  "New Valley": 120,
  "Red Sea": 120,
  "Matrouh": 120,

  // Arabic keys
  "الغربية": 70,
  "الدقهلية": 85,
  "الشرقية": 85,
  "كفر الشيخ": 85,
  "القليوبية": 85,
  "بورسعيد": 85,
  "دمياط": 85,
  "السويس": 85,
  "الإسماعيلية": 85,
  "القاهرة": 85,
  "الجيزة": 85,
  "البحيرة": 85,
  "المنوفية": 85,
  "الإسكندرية": 85,
  "الفيوم": 100,
  "بني سويف": 100,
  "المنيا": 100,
  "الأقصر": 120,
  "أسوان": 120,
  "أسيوط": 120,
  "سوهاج": 120,
  "شمال سيناء": 120,
  "جنوب سيناء": 120,
  "قنا": 120,
  "الوادي الجديد": 120,
  "البحر الأحمر": 120,
  "مطروح": 120
};

/**
 * Returns standard shipping fee for an Egyptian governorate (in English or Arabic).
 * Defaults to 120 EGP if governorate is unrecognized or empty.
 */
export function getShippingFeeForGov(govName?: string): number {
  if (!govName) return 120;
  const trimmed = String(govName).trim();
  if (EGYPT_SHIPPING_RATES[trimmed] !== undefined) {
    return EGYPT_SHIPPING_RATES[trimmed];
  }
  const lower = trimmed.toLowerCase();
  for (const [key, fee] of Object.entries(EGYPT_SHIPPING_RATES)) {
    if (key.toLowerCase() === lower) {
      return fee;
    }
  }
  return 120;
}

/**
 * Formats currency in Egyptian Pounds (EGP) consistently across emails.
 * Never outputs blank, NaN, or undefined.
 */
export function formatEGP(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') {
    return '0 ج.م';
  }
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.-]+/g, ''));
  if (isNaN(num)) return '0 ج.م';
  return `${Number(num).toLocaleString('en-US')} ج.م`;
}

/**
 * Order financial calculation model ensuring exact financial integrity:
 * - Reads exact saved financial fields from the order when present.
 * - Safely recalculates missing or 0 values from line items.
 * - Strictly enforces Cairo / governorate shipping rules (free shipping ONLY if subtotal > 2000).
 */
export interface CalculatedFinancials {
  products: any[];
  calculatedSubtotal: number;
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  isFreeShipping: boolean;
  isIncomplete: boolean;
}

export function calculateOrderFinancials(order: any): CalculatedFinancials {
  if (!order || typeof order !== 'object') {
    return {
      products: [],
      calculatedSubtotal: 0,
      subtotal: 0,
      shippingFee: 0,
      totalAmount: 0,
      isFreeShipping: false,
      isIncomplete: true
    };
  }

  // Support both order.products and order.items (and object maps)
  const rawProducts = order.products ?? order.items ?? [];
  const products = Array.isArray(rawProducts)
    ? rawProducts
    : (rawProducts && typeof rawProducts === 'object' ? Object.values(rawProducts) : []);

  let calculatedSubtotal = 0;
  let hasValidProducts = false;

  const parseNum = (v: any): number => {
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (v !== undefined && v !== null && v !== '') {
      const parsed = parseFloat(String(v).replace(/[^0-9.-]+/g, ''));
      if (!isNaN(parsed)) return parsed;
    }
    return NaN;
  };

  const sanitizedProducts = products.map((p: any) => {
    if (!p || typeof p !== 'object') return p;

    const qty = (typeof p.quantity === 'number' && !isNaN(p.quantity) && p.quantity > 0)
      ? p.quantity
      : (parseInt(p.quantity, 10) || 1);

    const effPrice = parseNum(p.effectiveUnitPrice);
    const regPrice = parseNum(p.price);
    const campPrice = parseNum(p.campaignPrice);
    const pkgPrice = parseNum(p.packagePrice);
    const unitPriceField = parseNum(p.unitPrice);

    let unitPrice = 0;
    if (!isNaN(effPrice)) unitPrice = effPrice;
    else if (!isNaN(regPrice)) unitPrice = regPrice;
    else if (!isNaN(campPrice)) unitPrice = campPrice;
    else if (!isNaN(pkgPrice)) unitPrice = pkgPrice;
    else if (!isNaN(unitPriceField)) unitPrice = unitPriceField;

    const explicitLineTotal = parseNum(p.lineTotal);
    const lineTotal = (!isNaN(explicitLineTotal) && explicitLineTotal > 0)
      ? explicitLineTotal
      : (unitPrice * qty);

    if (unitPrice > 0 || lineTotal > 0) {
      hasValidProducts = true;
      calculatedSubtotal += lineTotal;
    }

    return {
      ...p,
      quantity: qty,
      effectiveUnitPrice: unitPrice,
      price: !isNaN(regPrice) && regPrice > 0 ? regPrice : unitPrice,
      lineTotal
    };
  });

  calculatedSubtotal = parseFloat(calculatedSubtotal.toFixed(2));

  // 1. Resolve subtotal:
  // If order.subtotal is present and > 0, use it.
  // If order.subtotal is missing, 0, or invalid while line items exist, fall back to calculatedSubtotal.
  const parseNumOrNull = (v: any): number | null => {
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (v !== undefined && v !== null && v !== '') {
      const parsed = parseFloat(String(v).replace(/[^0-9.-]+/g, ''));
      if (!isNaN(parsed)) return parsed;
    }
    return null;
  };

  const rawSubtotal = parseNumOrNull(order.subtotal);
  let subtotal = 0;
  let isIncomplete = false;

  if (rawSubtotal !== null && rawSubtotal > 0) {
    subtotal = rawSubtotal;
  } else if (calculatedSubtotal > 0) {
    // Safe documented fallback: do not default to 0 when line items exist
    subtotal = calculatedSubtotal;
  } else if (rawSubtotal === 0 && !hasValidProducts) {
    subtotal = 0;
  } else {
    subtotal = 0;
    isIncomplete = true;
  }

  // 2. Resolve shipping fee:
  // If explicitly specified in order, preserve it.
  // Otherwise apply the standard business rule: Free shipping ONLY if subtotal > 2000, else governorate rate.
  const rawShipping = parseNumOrNull(order.shippingFee);
  let shippingFee = 0;

  if (rawShipping !== null) {
    shippingFee = rawShipping;
  } else {
    if (subtotal > 2000) {
      shippingFee = 0;
    } else {
      shippingFee = getShippingFeeForGov(order.governorate);
    }
  }

  // 3. Resolve totalAmount:
  // If order.totalAmount is present and > 0, use it.
  // Otherwise fall back to (subtotal + shippingFee).
  const rawTotal = parseNumOrNull(order.totalAmount);
  let totalAmount = 0;

  if (rawTotal !== null && rawTotal > 0) {
    totalAmount = rawTotal;
  } else if (subtotal > 0 || shippingFee > 0) {
    totalAmount = parseFloat((subtotal + shippingFee).toFixed(2));
  } else {
    totalAmount = 0;
    if (hasValidProducts) isIncomplete = true;
  }

  return {
    products: sanitizedProducts,
    calculatedSubtotal,
    subtotal: parseFloat(subtotal.toFixed(2)),
    shippingFee: parseFloat(shippingFee.toFixed(2)),
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    isFreeShipping: shippingFee === 0,
    isIncomplete
  };
}

/**
 * Escapes HTML characters.
 */
function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds HTML table for order products with full support for:
 * - Quantities, unit prices, line totals
 * - Collection bundles and included sub-items
 * - Scent / product variants
 * - Discounted original vs promotional pricing
 */
function buildProductsTableHtml(products: any[]): string {
  const prods = Array.isArray(products) ? products : (products ? Object.values(products) : []);
  if (prods.length === 0) return '<p style="color:#666;font-size:14px;padding:8px 0;">لا توجد تفاصيل للمنتجات.</p>';

  const rows = prods.map(p => {
    const name = escapeHtml(p.name || 'منتج داندي');
    const qty = (typeof p.quantity === 'number' && !isNaN(p.quantity) && p.quantity > 0)
      ? p.quantity
      : (parseInt(p.quantity, 10) || 1);

    const unitPrice = typeof p.effectiveUnitPrice === 'number' && !isNaN(p.effectiveUnitPrice)
      ? p.effectiveUnitPrice
      : (Number(p.price) || 0);

    const explicitLineTotal = typeof p.lineTotal === 'number' && !isNaN(p.lineTotal) ? p.lineTotal : null;
    const lineTotal = explicitLineTotal !== null && explicitLineTotal > 0 ? explicitLineTotal : (unitPrice * qty);
    
    // Variant info
    let variantText = '';
    if (Array.isArray(p.selectedVariants) && p.selectedVariants.length > 0) {
      variantText = p.selectedVariants.map((v: any) => v.name || v).join('، ');
    } else if (p.selectedVariant && p.selectedVariant.name) {
      variantText = p.selectedVariant.name;
    } else if (p.variantName) {
      variantText = p.variantName;
    }

    // Collection bundle items
    let bundleItemsText = '';
    if (p.isCollection || Array.isArray(p.items)) {
      const itemsList = Array.isArray(p.items) ? p.items : (p.items && typeof p.items === 'object' ? Object.values(p.items) : []);
      if (itemsList.length > 0) {
        bundleItemsText = itemsList.map((it: any) => escapeHtml(it.name || it.productName || 'محتوى')).join(' + ');
      }
    }

    // Price details display (discounted or multi-item breakdown)
    let priceDetailsHtml = '';
    const regPrice = Number(p.price) || 0;
    if (regPrice > unitPrice && unitPrice > 0) {
      priceDetailsHtml = `<div style="font-size:11px;color:#857979;margin-top:2px;"><del>${formatEGP(regPrice)}</del> <span style="color:#d83f82;font-weight:bold;">${formatEGP(unitPrice)} للقطعة</span></div>`;
    } else if (qty > 1 && unitPrice > 0) {
      priceDetailsHtml = `<div style="font-size:11px;color:#857979;margin-top:2px;">${formatEGP(unitPrice)} × ${qty}</div>`;
    }

    return `
      <tr style="border-bottom:1px solid #f0e6ed;">
        <td style="padding:12px 8px;text-align:right;">
          <div style="font-weight:bold;color:#2b1b2d;font-size:15px;">${name}</div>
          ${p.badgeText ? `<span style="display:inline-block;background:#fce7f3;color:#be185d;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;margin-top:3px;">${escapeHtml(p.badgeText)}</span>` : ''}
          ${bundleItemsText ? `<div style="font-size:12px;color:#854d6e;margin-top:3px;">المحتويات: ${bundleItemsText}</div>` : ''}
          ${variantText ? `<div style="font-size:12px;color:#fe5d9f;margin-top:3px;">الرائحة / النوع: ${escapeHtml(variantText)}</div>` : ''}
          ${priceDetailsHtml}
        </td>
        <td style="padding:12px 8px;text-align:center;color:#555;font-size:14px;vertical-align:middle;">${qty}</td>
        <td style="padding:12px 8px;text-align:left;font-weight:bold;color:#2b1b2d;font-size:14px;white-space:nowrap;vertical-align:middle;">${formatEGP(lineTotal)}</td>
      </tr>
    `;
  }).join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #f0e6ed;">
      <thead>
        <tr style="background:#fdf8fb;border-bottom:2px solid #f4bbd3;color:#854d6e;font-size:13px;">
          <th style="padding:10px 8px;text-align:right;">المنتج</th>
          <th style="padding:10px 8px;text-align:center;width:60px;">الكمية</th>
          <th style="padding:10px 8px;text-align:left;width:100px;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Builds base responsive HTML email wrapper with Dandy beauty aesthetic.
 */
function buildBaseEmailTemplate(params: {
  title: string;
  badgeText: string;
  badgeBg: string;
  badgeColor: string;
  customerName: string;
  invoiceCode: string;
  bodyContentHtml: string;
  orderId: string;
}): string {
  const invoiceUrl = `https://dandy-ebon.vercel.app/invoice?id=${encodeURIComponent(params.orderId)}`;
  const trackingUrl = `https://dandy-ebon.vercel.app/track-order?code=${encodeURIComponent(params.invoiceCode)}`;

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#faf6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Alexandria','Cairo',sans-serif;color:#2b1b2d;direction:rtl;text-align:right;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#faf6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(254,93,159,0.08);border:1px solid #fae8f0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background:linear-gradient(135deg, #fe5d9f 0%, #d83f82 100%);padding:32px 24px;text-align:center;color:#ffffff;">
              <h1 style="margin:0;font-size:26px;letter-spacing:1px;font-weight:800;">DANDY COSMETICS</h1>
              <p style="margin:6px 0 0;font-size:13px;color:#ffe4ef;letter-spacing:0.5px;">جمالك الطبيعي يبدأ من هنا</p>
            </td>
          </tr>

          <!-- Status Bar -->
          <tr>
            <td style="padding:20px 24px 10px;text-align:center;">
              <span style="display:inline-block;background:${params.badgeBg};color:${params.badgeColor};padding:6px 18px;border-radius:99px;font-size:13px;font-weight:bold;">
                ${escapeHtml(params.badgeText)}
              </span>
              <div style="margin-top:10px;font-size:14px;color:#777;">
                رقم الفاتورة: <strong style="color:#2b1b2d;font-size:16px;">${escapeHtml(params.invoiceCode)}</strong>
              </div>
            </td>
          </tr>

          <!-- Greeting & Main Content -->
          <tr>
            <td style="padding:10px 24px 20px;">
              <p style="font-size:16px;color:#2b1b2d;margin:0 0 14px;line-height:1.6;">
                أهلاً بكِ <strong>${escapeHtml(params.customerName || 'عميلتنا العزيزة')}</strong> 💕،
              </p>
              ${params.bodyContentHtml}
            </td>
          </tr>

          <!-- Action CTA Button -->
          <tr>
            <td style="padding:10px 24px 30px;text-align:center;">
              <a href="${invoiceUrl}" target="_blank" style="display:inline-block;background:#fe5d9f;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:99px;font-weight:bold;font-size:15px;box-shadow:0 4px 14px rgba(254,93,159,0.35);">
                تتبع مسار طلبك والفاتورة 🔍
              </a>
              <div style="margin-top:12px;font-size:12px;color:#888;">
                أو يمكنكِ متابعة الطلب مباشرة عبر <a href="${trackingUrl}" target="_blank" style="color:#fe5d9f;text-decoration:none;font-weight:bold;">صفحة التتبع</a>.
              </div>
            </td>
          </tr>

          <!-- Support & Footer -->
          <tr>
            <td style="background:#faf2f6;padding:20px 24px;border-top:1px solid #fae8f0;font-size:13px;color:#666;text-align:center;line-height:1.6;">
              <p style="margin:0 0 6px;">لأي استفسار بخصوص طلبك، يسعدنا تواصلكِ معنا عبر واتساب أو الرد على هذا البريد.</p>
              <p style="margin:0;font-size:11px;color:#999;">
                © متجر داندي لمستحضرات التجميل الطبيعية - مصر | DANDY
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Generates subject and HTML for Order Confirmation.
 */
export function generateOrderConfirmationEmail(order: any, orderId: string): { subject: string; htmlBody: string } {
  const invoiceCode = order?.invoiceCode || orderId;
  const subject = `تأكيد طلبك من داندي | رقم الفاتورة ${invoiceCode}`;

  const financials = calculateOrderFinancials(order);
  const gov = order?.governorate || '';
  const city = order?.city || '';
  const address = order?.address || '';
  const phone = order?.phone || '';

  const bodyContentHtml = `
    <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 16px;">
      شكراً لثقتكِ بمنتجات <strong>داندي</strong>! يسعدنا تأكيد استلام طلبك بنجاح وجارٍ مراجعته وتجهيزه بعناية فائقة ليصلكِ في أسرع وقت.
    </p>

    <!-- Shipping Address Summary -->
    <div style="background:#fcf8fa;border:1px solid #f4bbd3;border-radius:10px;padding:14px 18px;margin-bottom:18px;font-size:13px;">
      <div style="font-weight:bold;color:#854d6e;margin-bottom:6px;">📍 عنوان التوصيل وبيانات التواصل:</div>
      <div style="color:#333;margin-bottom:2px;">المحافظة والمدينة: <strong>${escapeHtml(gov)}${city ? '، ' + escapeHtml(city) : ''}</strong></div>
      <div style="color:#333;margin-bottom:2px;">العنوان بالتفصيل: ${escapeHtml(address || 'العنوان المسجل في الطلب')}</div>
      <div style="color:#333;">رقم الهاتف: <span dir="ltr">${escapeHtml(phone || 'غير مسجل')}</span></div>
    </div>

    <!-- Products -->
    <div style="font-weight:bold;color:#2b1b2d;font-size:15px;margin-bottom:8px;">📦 تفاصيل المنتجات في طلبك:</div>
    ${buildProductsTableHtml(financials.products)}

    <!-- Financial Breakdown -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;font-size:14px;border-top:1px solid #f0e6ed;padding-top:10px;">
      <tr>
        <td style="padding:6px 0;color:#666;">إجمالي المنتجات:</td>
        <td style="padding:6px 0;text-align:left;font-weight:bold;color:#2b1b2d;">${formatEGP(financials.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#666;">مصاريف الشحن${gov ? ` (${escapeHtml(gov)})` : ''}:</td>
        <td style="padding:6px 0;text-align:left;font-weight:bold;color:#2b1b2d;">
          ${financials.isFreeShipping 
            ? '<span style="color:#166534;background:#dcfce7;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:bold;">شحن مجاني 🎉</span>' 
            : formatEGP(financials.shippingFee)}
        </td>
      </tr>
      <tr style="border-top:2px solid #f4bbd3;">
        <td style="padding:10px 0;font-weight:bold;font-size:15px;color:#2b1b2d;">
          المبلغ المطلوب سداده عند الاستلام:
          <div style="font-size:11px;color:#888;font-weight:normal;margin-top:2px;">الدفع نقداً عند استلام الشحنة (COD)</div>
        </td>
        <td style="padding:10px 0;text-align:left;font-weight:bold;font-size:18px;color:#fe5d9f;">${formatEGP(financials.totalAmount)}</td>
      </tr>
    </table>
  `;

  const htmlBody = buildBaseEmailTemplate({
    title: subject,
    badgeText: 'تم تأكيد استلام الطلب',
    badgeBg: '#dcfce7',
    badgeColor: '#166534',
    customerName: order?.name,
    invoiceCode,
    bodyContentHtml,
    orderId
  });

  return { subject, htmlBody };
}

/**
 * Generates subject and HTML for Order Status transitions.
 */
export function generateOrderStatusEmail(
  order: any,
  orderId: string,
  newStatus: CanonicalStatus
): { subject: string; htmlBody: string } {
  const invoiceCode = order?.invoiceCode || orderId;
  const gov = order?.governorate || '';

  let subject = '';
  let badgeText = '';
  let badgeBg = '';
  let badgeColor = '';
  let statusMessage = '';

  switch (newStatus) {
    case 'قيد التجهيز':
      subject = `طلبك قيد التجهيز بعناية في داندي | رقم الفاتورة ${invoiceCode}`;
      badgeText = 'قيد التجهيز';
      badgeBg = '#ffedd5';
      badgeColor = '#9a3412';
      statusMessage = `
        <p style="font-size:15px;color:#2b1b2d;line-height:1.7;margin:0 0 16px;">
          يسعدنا إخباركِ أن طلبك <strong>قيد التجهيز والتغليف</strong> الآن بعناية خاصة داخل مختبرات داندي، استعداداً لتسليمه لمندوب الشحن في أقرب وقت.
        </p>
      `;
      break;

    case 'تم الشحن':
      subject = `تم شحن طلبك من داندي وهو في طريقه إليكِ! | ${invoiceCode}`;
      badgeText = 'تم الشحن وفي الطريق';
      badgeBg = '#fef9c3';
      badgeColor = '#854d6e';
      statusMessage = `
        <p style="font-size:15px;color:#2b1b2d;line-height:1.7;margin:0 0 16px;">
          بشرى سارة! تم تسليم طلبك لشركة الشحن وهو <strong>في طريقه إلى عنوانك المسجل في ${escapeHtml(gov || 'مصر')}</strong> 🚚.
          سيقوم مندوب التوصيل بالاتصال بكِ قريباً لتنسيق موعد الاستلام.
        </p>
      `;
      break;

    case 'تم التوصيل':
      subject = `تم توصيل طلبك بنجاح! نتمنى لكِ تجربة مميزة مع داندي | ${invoiceCode}`;
      badgeText = 'تم التوصيل بنجاح';
      badgeBg = '#dbeafe';
      badgeColor = '#1e40af';
      statusMessage = `
        <p style="font-size:15px;color:#2b1b2d;line-height:1.7;margin:0 0 16px;">
          تم تسليم طلبك بنجاح ✨. شكراً لاختياركِ <strong>داندي</strong> وثقتكِ الدائمة بمنتجاتنا الطبيعية! نتمنى أن تنال إعجابكِ وتمنحكِ النتيجة المرجوة.
        </p>
        <p style="font-size:14px;color:#666;line-height:1.6;margin:0 0 16px;">
          نسعد دائماً بمشاركتكِ رأيكِ وتقييمكِ لتجربتكِ مع المنتجات على موقعنا أو عبر صفحاتنا الرسمية!
        </p>
      `;
      break;

    case 'ملغي':
      subject = `تم إلغاء طلبك من داندي | ${invoiceCode}`;
      badgeText = 'طلب ملغي';
      badgeBg = '#fee2e2';
      badgeColor = '#991b1b';
      statusMessage = `
        <p style="font-size:15px;color:#2b1b2d;line-height:1.7;margin:0 0 16px;">
          نود إعلامكِ بأنه تم تحديث حالة طلبك ذي الرقم <strong>${escapeHtml(invoiceCode)}</strong> إلى <strong>ملغي</strong> بناءً على رغبتكِ أو لتعذر التواصل.
        </p>
        <p style="font-size:14px;color:#666;line-height:1.6;margin:0 0 16px;">
          إذا كان هذا الإلغاء قد تم عن طريق الخطأ وترغبين في إعادة تفعيل الطلب، نرجو منكِ التواصل معنا مباشرة وسنكون سعداء بخدمتكِ.
        </p>
      `;
      break;

    case 'جديد':
    default:
      return generateOrderConfirmationEmail(order, orderId);
  }

  const financials = calculateOrderFinancials(order);

  const bodyContentHtml = `
    ${statusMessage}
    <div style="font-weight:bold;color:#2b1b2d;font-size:15px;margin-bottom:8px;">📦 ملخص المنتجات في الطلب:</div>
    ${buildProductsTableHtml(financials.products)}
    
    <!-- Financial Breakdown -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;font-size:14px;border-top:1px solid #f0e6ed;padding-top:10px;">
      <tr>
        <td style="padding:4px 0;color:#666;">إجمالي المنتجات:</td>
        <td style="padding:4px 0;text-align:left;font-weight:bold;color:#2b1b2d;">${formatEGP(financials.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#666;">مصاريف الشحن${gov ? ` (${escapeHtml(gov)})` : ''}:</td>
        <td style="padding:4px 0;text-align:left;font-weight:bold;color:#2b1b2d;">
          ${financials.isFreeShipping ? '<span style="color:#166534;background:#dcfce7;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold;">شحن مجاني 🎉</span>' : formatEGP(financials.shippingFee)}
        </td>
      </tr>
      <tr style="border-top:1px solid #f0e6ed;">
        <td style="padding:8px 0;font-weight:bold;font-size:15px;color:#2b1b2d;">
          المبلغ المطلوب سداده عند الاستلام (COD):
        </td>
        <td style="padding:8px 0;text-align:left;font-weight:bold;font-size:17px;color:#fe5d9f;">
          ${formatEGP(financials.totalAmount)}
        </td>
      </tr>
    </table>
  `;

  const htmlBody = buildBaseEmailTemplate({
    title: subject,
    badgeText,
    badgeBg,
    badgeColor,
    customerName: order?.name,
    invoiceCode,
    bodyContentHtml,
    orderId
  });

  return { subject, htmlBody };
}

/**
 * Dispatches a signed notification payload to Google Apps Script Mail Relay.
 */
export async function dispatchToAppsScriptRelay(params: {
  notificationId: string;
  recipientEmail: string;
  subject: string;
  htmlBody: string;
  eventType: NotificationEventType;
  orderId: string;
  invoiceCode: string;
  timeoutMs?: number;
  bypassEnabledCheck?: boolean;
}): Promise<{
  success: boolean;
  status: NotificationStatus;
  message?: string;
  error?: string;
  remainingQuota?: number;
  deduplicated?: boolean;
  safeDiagnostic?: any;
  senderDiagnostic?: {
    secretConfigured: boolean;
    signingMessageUtf8ByteLength: number;
    signatureLength: number;
    payloadJsonLength: number;
  };
}> {
  const {
    notificationId,
    recipientEmail,
    subject,
    htmlBody,
    eventType,
    orderId,
    invoiceCode,
    timeoutMs = 12000,
    bypassEnabledCheck = false
  } = params;

  // 1. Email format check
  if (!isValidEmail(recipientEmail)) {
    return {
      success: false,
      status: 'skipped_no_valid_email',
      message: 'Skipped: recipient email is missing, N/A, or invalid format'
    };
  }

  // 2. Check if notifications are enabled
  const isEnabled = process.env.GMAIL_NOTIFICATIONS_ENABLED === 'true';
  const relayUrl = process.env.GMAIL_RELAY_URL?.trim();
  const relaySecret = process.env.GMAIL_RELAY_SECRET?.trim();

  if (!isEnabled && !bypassEnabledCheck) {
    return {
      success: false,
      status: 'pending',
      message: 'Notification queued as pending (GMAIL_NOTIFICATIONS_ENABLED is false)'
    };
  }

  // Security guard: If bypassEnabledCheck is true, recipient MUST strictly be the fixed owner account
  if (bypassEnabledCheck && recipientEmail.trim().toLowerCase() !== FIXED_DIAGNOSTIC_RECIPIENT.toLowerCase()) {
    return {
      success: false,
      status: 'failed',
      error: 'SECURITY_VIOLATION',
      message: 'Diagnostic bypass is strictly restricted to owner account (dandybeauty4@gmail.com)'
    };
  }

  if (!relayUrl || !relaySecret) {
    console.warn('[EmailService] GMAIL_RELAY_URL or GMAIL_RELAY_SECRET missing in environment');
    return {
      success: false,
      status: 'failed',
      error: 'RELAY_CONFIG_MISSING',
      message: 'GMAIL_RELAY_URL or GMAIL_RELAY_SECRET missing'
    };
  }

  // 3. Exact-Byte HMAC Protocol: Serialize payload exactly once as payloadJson string
  const timestamp = Date.now();
  const nonce = 'dny_' + timestamp + '_' + crypto.randomBytes(8).toString('hex');

  const payload = {
    recipientEmail: recipientEmail.trim(),
    subject: subject.trim(),
    htmlBody,
    eventType,
    orderId,
    invoiceCode
  };

  const payloadJson = canonicalizeJson(payload);
  const signingMessage = `${timestamp}:${nonce}:${notificationId}:${payloadJson}`;
  const signature = computeHmacSha256(signingMessage, relaySecret);

  const senderDiagnostic = {
    secretConfigured: Boolean(relaySecret),
    signingMessageUtf8ByteLength: Buffer.byteLength(signingMessage, 'utf8'),
    signatureLength: signature.length,
    payloadJsonLength: payloadJson.length
  };

  const envelope = {
    timestamp,
    nonce,
    notificationId,
    payloadJson,
    signature
  };

  // 4. Send HTTPS POST with explicit timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(relayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(envelope),
      signal: controller.signal
    });

    clearTimeout(timer);

    const result = await response.json().catch(() => null);

    if (response.ok && result && result.success) {
      return {
        success: true,
        status: 'accepted_by_mailapp',
        message: result.message || 'Accepted by MailApp',
        remainingQuota: result.remainingQuota,
        deduplicated: Boolean(result.deduplicated),
        safeDiagnostic: result?.safeDiagnostic,
        senderDiagnostic
      };
    }

    // Quota exhaustion or specific error from Apps Script
    const errCode = result?.error || `HTTP_${response.status}`;
    const errMsg = result?.message || response.statusText || 'Relay returned non-200 status';

    return {
      success: false,
      status: 'failed',
      error: errCode,
      message: errMsg,
      safeDiagnostic: result?.safeDiagnostic,
      senderDiagnostic
    };

  } catch (err: any) {
    clearTimeout(timer);
    const isTimeout = err?.name === 'AbortError' || err?.message?.includes('aborted');
    console.error(`[EmailService ERROR] Relay dispatch failed for ${notificationId}:`, err?.message || err);

    if (isTimeout) {
      // Ambiguous outcome due to timeout: classify as 'unknown' so safe retry is possible
      return {
        success: false,
        status: 'unknown',
        error: 'NETWORK_TIMEOUT',
        message: 'Request to Apps Script relay timed out (ambiguous outcome)'
      };
    }

    return {
      success: false,
      status: 'failed',
      error: err?.code || err?.name || 'NETWORK_ERROR',
      message: err?.message || 'Network error communicating with mail relay'
    };
  }
}

/**
 * Main coordinator function to enqueue, dispatch, and persist order email notifications in Firebase Outbox.
 */
export async function sendOrderNotification(params: {
  order: any;
  orderId: string;
  eventType: NotificationEventType;
  newStatus?: unknown;
  oldStatus?: unknown;
  retryNotificationId?: string;
}): Promise<{
  success: boolean;
  status: NotificationStatus;
  notificationId: string;
  message?: string;
  deduplicated?: boolean;
}> {
  const { order, orderId, eventType, newStatus, oldStatus, retryNotificationId } = params;

  const invoiceCode = order.invoiceCode || orderId;
  const rawEmail = order.email;
  const canonicalEmail = isValidEmail(rawEmail) ? String(rawEmail).trim().toLowerCase() : '';

  // 1. Determine canonical status & check if status actually changed
  let targetStatus: CanonicalStatus = 'جديد';
  if (eventType === 'ORDER_STATUS_CHANGED') {
    targetStatus = normalizeOrderStatus(newStatus);
    const prevNormalized = normalizeOrderStatus(oldStatus);
    if (!retryNotificationId && prevNormalized === targetStatus) {
      // No change in status -> No notification is sent!
      return {
        success: true,
        status: 'accepted_by_mailapp',
        notificationId: '',
        message: 'Status unchanged; skipped notification generation'
      };
    }
  }

  // 2. Generate unique notification ID (Idempotency key)
  const statusSlug = targetStatus === 'قيد التجهيز' ? 'processing'
    : targetStatus === 'تم الشحن' ? 'shipped'
    : targetStatus === 'تم التوصيل' ? 'delivered'
    : targetStatus === 'ملغي' ? 'cancelled'
    : 'new';

  const notificationId = retryNotificationId || (
    eventType === 'ORDER_CONFIRMATION'
      ? `notif_order_${orderId}_confirmation`
      : `notif_order_${orderId}_status_${statusSlug}`
  );

  const adminDb = getAdminDb();

  // 3. Check existing outbox record to prevent double-send
  if (adminDb) {
    try {
      const snap = await adminDb.ref(`notifications_outbox/${notificationId}`).once('value');
      const existing = snap.val();
      if (existing && existing.status === 'accepted_by_mailapp' && !retryNotificationId) {
        return {
          success: true,
          status: 'accepted_by_mailapp',
          notificationId,
          deduplicated: true,
          message: 'Notification already accepted by MailApp previously'
        };
      }
    } catch (e) {
      // Non-blocking
    }
  }

  // 4. Generate email content
  const { subject, htmlBody } = (eventType === 'ORDER_STATUS_CHANGED' && targetStatus !== 'جديد')
    ? generateOrderStatusEmail(order, orderId, targetStatus)
    : generateOrderConfirmationEmail(order, orderId);

  // 5. Initial outbox record creation
  const nowIso = new Date().toISOString();
  const outboxData: any = {
    notificationId,
    orderId,
    invoiceCode,
    recipientEmail: canonicalEmail || 'N/A',
    recipientName: order.name || 'N/A',
    eventType,
    orderStatus: targetStatus,
    status: isValidEmail(canonicalEmail) ? 'pending' : 'skipped_no_valid_email',
    attempts: 0,
    createdAt: nowIso,
    lastAttemptAt: nowIso
  };

  if (adminDb) {
    try {
      await adminDb.ref(`notifications_outbox/${notificationId}`).update(outboxData);
    } catch (e) {
      console.warn('[EmailService] Failed to initialize outbox record:', e);
    }
  }

  // If no valid email, skip dispatch immediately
  if (!isValidEmail(canonicalEmail)) {
    return {
      success: false,
      status: 'skipped_no_valid_email',
      notificationId,
      message: 'Skipped: Order has no valid email address'
    };
  }

  // 6. Dispatch to relay
  const dispatchResult = await dispatchToAppsScriptRelay({
    notificationId,
    recipientEmail: canonicalEmail,
    subject,
    htmlBody,
    eventType,
    orderId,
    invoiceCode
  });

  // 7. Update Firebase Outbox & Order metadata with results
  if (adminDb) {
    try {
      const outboxRef = adminDb.ref(`notifications_outbox/${notificationId}`);
      await outboxRef.transaction((current: any) => {
        const cur = current || outboxData;
        const attempts = (cur.attempts || 0) + 1;
        return {
          ...cur,
          status: dispatchResult.status,
          attempts,
          lastAttemptAt: new Date().toISOString(),
          error: dispatchResult.error || null,
          message: dispatchResult.message || null
        };
      });

      // Update order latest notification status for dashboard visibility
      await adminDb.ref(`orders/${orderId}/latestNotification`).set({
        notificationId,
        status: dispatchResult.status,
        eventType,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('[EmailService] Failed to update outbox record after dispatch:', err);
    }
  }

  return {
    success: dispatchResult.success,
    status: dispatchResult.status,
    notificationId,
    message: dispatchResult.message,
    deduplicated: dispatchResult.deduplicated
  };
}

/**
 * Secure owner-only diagnostic action to test end-to-end Apps Script relay connectivity.
 * - Recipient is strictly fixed to FIXED_DIAGNOSTIC_RECIPIENT (dandybeauty4@gmail.com).
 * - Does not create/modify Firebase orders, decrement stock, trigger Telegram, or invoke Make.
 * - Operates even when GMAIL_NOTIFICATIONS_ENABLED=false without activating customer emails.
 * - Returns a safe, structured result without revealing secrets or raw stack traces.
 */
export async function sendDiagnosticRelayEmail(options: {
  testType?: 'ORDER_CONFIRMATION' | 'ORDER_STATUS_CHANGED';
  canonicalStatus?: CanonicalStatus;
} = {}): Promise<{
  success: boolean;
  diagnostic: {
    mode: 'DIAGNOSTIC_TEST';
    relayStatus: NotificationStatus;
    testType: string;
    canonicalStatus?: string;
    recipient: string;
    notificationId: string;
    remainingDailyQuota?: number;
    relayConfigured: boolean;
    timestamp: number;
    customerNotificationsActive: boolean;
    message: string;
    error?: string;
    safeDiagnostic?: any;
    senderDiagnostic?: {
      secretConfigured: boolean;
      signingMessageUtf8ByteLength: number;
      signatureLength: number;
      payloadJsonLength: number;
    };
  };
}> {
  const testType = options.testType === 'ORDER_STATUS_CHANGED' ? 'ORDER_STATUS_CHANGED' : 'ORDER_CONFIRMATION';
  const targetStatus = options.canonicalStatus ? normalizeOrderStatus(options.canonicalStatus) : 'تم الشحن';
  const timestamp = Date.now();
  const notificationId = `notif_diag_${timestamp}`;
  const recipient = FIXED_DIAGNOSTIC_RECIPIENT;

  // Synthetic order payload strictly for template rendering in diagnostic test
  // Internally consistent with Dandy order schema and Egyptian business rules:
  // - Product line total: 499 EGP (qty 1 @ 499 EGP)
  // - Subtotal: 499 EGP
  // - Governorate: Cairo (القاهرة) -> shipping fee: 85 EGP (subtotal <= 2000 EGP)
  // - Total amount due on delivery (COD): 584 EGP (499 + 85)
  const syntheticOrder = {
    name: 'إدارة داندي (اختبار تشغيلي)',
    phone: '01000000000',
    governorate: 'القاهرة',
    city: 'المعادي',
    address: 'مقر إدارة داندي للتجميل',
    email: recipient,
    invoiceCode: `DIAG-${timestamp.toString().slice(-6)}`,
    subtotal: 499,
    shippingFee: 85,
    totalAmount: 584,
    products: [
      {
        id: 'serum-vit-c-diag',
        name: 'سيروم فيتامين سي للتفتيح والنضارة (منتج تجريبي لاختبار البريد)',
        quantity: 1,
        price: 499,
        effectiveUnitPrice: 499,
        lineTotal: 499
      }
    ]
  };

  let emailContent: { subject: string; htmlBody: string };
  if (testType === 'ORDER_STATUS_CHANGED') {
    emailContent = generateOrderStatusEmail(syntheticOrder, `diag_${timestamp}`, targetStatus);
    emailContent.subject = `[فحص تشغيلي - DIAGNOSTIC] ${emailContent.subject}`;
  } else {
    emailContent = generateOrderConfirmationEmail(syntheticOrder, `diag_${timestamp}`);
    emailContent.subject = `[فحص تشغيلي - DIAGNOSTIC] ${emailContent.subject}`;
  }

  const dispatchResult = await dispatchToAppsScriptRelay({
    notificationId,
    recipientEmail: recipient,
    subject: emailContent.subject,
    htmlBody: emailContent.htmlBody,
    eventType: testType,
    orderId: `diag_${timestamp}`,
    invoiceCode: syntheticOrder.invoiceCode,
    bypassEnabledCheck: true
  });

  const relayConfigured = Boolean(process.env.GMAIL_RELAY_URL?.trim() && process.env.GMAIL_RELAY_SECRET?.trim());

  return {
    success: dispatchResult.success,
    diagnostic: {
      mode: 'DIAGNOSTIC_TEST',
      relayStatus: dispatchResult.status,
      testType,
      canonicalStatus: testType === 'ORDER_STATUS_CHANGED' ? targetStatus : undefined,
      recipient,
      notificationId,
      remainingDailyQuota: dispatchResult.remainingQuota,
      relayConfigured,
      timestamp,
      customerNotificationsActive: process.env.GMAIL_NOTIFICATIONS_ENABLED === 'true',
      message: dispatchResult.message || (dispatchResult.success ? 'Diagnostic email successfully accepted by MailApp' : 'Diagnostic dispatch failed'),
      error: dispatchResult.error,
      safeDiagnostic: dispatchResult.safeDiagnostic,
      senderDiagnostic: dispatchResult.senderDiagnostic
    }
  };
}

