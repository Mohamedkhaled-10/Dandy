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
 * Formats order date and time in Africa/Cairo timezone.
 * Example: ٨ نوفمبر ٢٠٢٦ في ١٠:٢٢ م
 */
export function formatCairoDateTime(timestamp?: string | number | Date | null): string {
  try {
    const date = timestamp ? new Date(timestamp) : new Date();
    if (isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('ar-EG', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(new Date());
    }
    return new Intl.DateTimeFormat('ar-EG', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  } catch (e) {
    return new Date().toLocaleDateString('ar-EG');
  }
}

/**
 * Builds HTML table for order products with full support for:
 * - Product thumbnail images with broken-image protection
 * - Quantities, unit prices, line totals
 * - Collection bundles and included sub-items (without double-counting)
 * - Scent / product variants
 * - Discounted original vs promotional pricing
 */
function buildProductsTableHtml(products: any[]): string {
  const prods = Array.isArray(products) ? products : (products ? Object.values(products) : []);
  if (prods.length === 0) {
    return '<p style="color:#857979;font-size:14px;padding:12px 0;margin:0;text-align:center;">لا توجد تفاصيل للمنتجات.</p>';
  }

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
    
    // Product image thumbnail
    const rawImg = p.image || p.coverImage || '';
    let imgTag = '';
    if (rawImg && typeof rawImg === 'string' && rawImg.trim()) {
      const imgUrl = rawImg.startsWith('http') ? rawImg : `https://dandy-ebon.vercel.app${rawImg.startsWith('/') ? '' : '/'}${rawImg}`;
      imgTag = `
        <td style="width:54px;padding:12px 0 12px 10px;vertical-align:top;">
          <img src="${escapeHtml(imgUrl)}" alt="${name}" width="54" height="54" style="width:54px;height:54px;object-fit:cover;border-radius:6px;border:1px solid #f2ebf0;display:block;" onerror="this.style.display='none';" />
        </td>
      `;
    }

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
      priceDetailsHtml = `<div style="font-size:11px;color:#857979;margin-top:2px;"><del>${formatEGP(regPrice)}</del> <span style="color:#be185d;font-weight:700;">${formatEGP(unitPrice)} للقطعة</span></div>`;
    } else if (qty > 1 && unitPrice > 0) {
      priceDetailsHtml = `<div style="font-size:11px;color:#857979;margin-top:2px;">${formatEGP(unitPrice)} × ${qty}</div>`;
    }

    return `
      <tr style="border-bottom:1px solid #f7f0f4;">
        ${imgTag}
        <td style="padding:12px 8px;text-align:right;vertical-align:middle;">
          <div style="font-weight:700;color:#2c2828;font-size:14px;line-height:1.4;">${name}</div>
          ${p.badgeText ? `<span style="display:inline-block;background:#fdf2f6;color:#95184c;border:1px solid #f9d8e5;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-top:3px;">${escapeHtml(p.badgeText)}</span>` : ''}
          ${bundleItemsText ? `<div style="font-size:12px;color:#595050;margin-top:3px;line-height:1.3;">المحتويات: ${bundleItemsText}</div>` : ''}
          ${variantText ? `<div style="font-size:12px;color:#8e0b4a;margin-top:3px;">الرائحة / النوع: ${escapeHtml(variantText)}</div>` : ''}
          ${priceDetailsHtml}
        </td>
        <td style="padding:12px 6px;text-align:center;color:#595050;font-size:13px;vertical-align:middle;white-space:nowrap;">
          <span style="background:#fcf9fb;border:1px solid #f2ebf0;padding:2px 8px;border-radius:4px;">${qty}</span>
        </td>
        <td style="padding:12px 8px;text-align:left;font-weight:700;color:#2c2828;font-size:14px;white-space:nowrap;vertical-align:middle;">
          ${formatEGP(lineTotal)}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:12px 0 16px 0;background:#ffffff;border-radius:8px;border:1px solid #f2ebf0;overflow:hidden;">
      <thead>
        <tr style="background:#fcf9fb;border-bottom:1px solid #ebdbe3;color:#595050;font-size:12px;font-weight:700;">
          <th colspan="2" style="padding:10px 12px;text-align:right;">المنتج</th>
          <th style="padding:10px 6px;text-align:center;width:50px;">الكمية</th>
          <th style="padding:10px 12px;text-align:left;width:95px;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Builds the base responsive HTML email wrapper for Modern Premium DANDY aesthetic:
 * - Fluid table-based structural layout (up to 600px width).
 * - Soft luxury blush palette, dark charcoal typography, generous whitespace.
 * - Centered DANDY brand logo with text fallback.
 * - Responsive mobile styles via inline CSS + progressive enhancement.
 */
function buildBaseEmailTemplate(params: {
  title: string;
  badgeText: string;
  badgeBg: string;
  badgeColor: string;
  badgeBorder?: string;
  customerName?: string;
  invoiceCode: string;
  bodyContentHtml: string;
  orderId: string;
  trackingUrl?: string;
  isDiagnostic?: boolean;
}): string {
  const invoiceCode = params.invoiceCode;
  const isDiag = Boolean(params.isDiagnostic);
  const realTrackingUrl = `https://dandy-ebon.vercel.app/track-order?code=${encodeURIComponent(invoiceCode)}`;
  const trackingUrl = params.trackingUrl || realTrackingUrl;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="ar" dir="rtl">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(params.title)}</title>
  <style type="text/css">
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 auto !important;
      }
      .mobile-padding {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }
      .mobile-cta-btn {
        display: block !important;
        width: 100% !important;
        padding: 14px 20px !important;
        box-sizing: border-box !important;
        text-align: center !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#faf7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Alexandria','Cairo',Arial,sans-serif;color:#2c2828;direction:rtl;text-align:right;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#faf7f9;padding:24px 8px;">
    <tr>
      <td align="center">
        <!-- Main Card Container (Max 600px) -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" class="email-container" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #f0e6ed;box-shadow:0 4px 16px rgba(44,40,40,0.04);">
          
          <!-- Premium Brand Header -->
          <tr>
            <td align="center" style="padding:28px 20px 18px 20px;background:#ffffff;text-align:center;">
              <a href="https://dandy-ebon.vercel.app" target="_blank" style="text-decoration:none;display:inline-block;">
                <img src="https://dandy-ebon.vercel.app/assets/images/logo.png" alt="DANDY Cosmetics" width="124" height="40" style="width:124px;max-width:124px;height:auto;display:block;margin:0 auto;border:0;outline:none;" onerror="this.style.display='none';document.getElementById('brand-text-logo').style.display='block';" />
                <div id="brand-text-logo" style="display:none;font-family:'Alexandria','Cairo',sans-serif;font-size:20px;font-weight:800;letter-spacing:3px;color:#2c2828;">DANDY</div>
              </a>
              <div style="font-size:12px;font-weight:500;letter-spacing:0.8px;color:#857979;margin-top:6px;">جمالكِ الطبيعي يبدأ من هنا</div>
              <div style="width:36px;height:2px;background:#f4bbd3;margin:12px auto 0 auto;border-radius:2px;"></div>
            </td>
          </tr>

          <!-- Status Badge Banner -->
          <tr>
            <td align="center" style="padding:4px 24px 12px 24px;text-align:center;">
              <span style="display:inline-block;background:${params.badgeBg};color:${params.badgeColor};border:1px solid ${params.badgeBorder || params.badgeBg};padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:0.3px;">
                ${escapeHtml(params.badgeText)}
              </span>
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td class="mobile-padding" style="padding:10px 24px 20px 24px;font-size:14px;line-height:1.7;color:#2c2828;">
              <div style="font-size:15px;color:#2c2828;margin-bottom:14px;">
                أهلاً بكِ <strong>${escapeHtml(params.customerName || 'عميلتنا العزيزة')}</strong> 💕،
              </div>
              ${params.bodyContentHtml}
            </td>
          </tr>

          <!-- Primary CTA Button (Real Orders vs Diagnostic Mode) -->
          <tr>
            <td class="mobile-padding" style="padding:0 24px 24px 24px;text-align:center;">
              ${isDiag ? `
                <div style="padding:12px 16px;background:#fdf2f6;border:1px dashed #f4bbd3;border-radius:8px;text-align:center;font-size:12px;">
                  <div style="font-weight:700;color:#95184c;margin-bottom:2px;">⚙️ فحص تشغيلي تجريبي للإدارة (Diagnostic Mode)</div>
                  <div style="color:#595050;line-height:1.4;">هذا البريد مخصص لاختبار دقة الفاتورة والاتصال بقنوات الترحيل. روابط التتبع الحقيقية تُنشأ تلقائياً للطلبات الفعلية للعملاء.</div>
                </div>
              ` : `
                <div style="text-align:center;padding:12px 0 6px 0;">
                  <a href="${trackingUrl}" target="_blank" class="mobile-cta-btn" style="display:inline-block;background:#2c2828;color:#ffffff;text-decoration:none;padding:13px 36px;border-radius:6px;font-weight:700;font-size:14px;letter-spacing:0.5px;">
                    تتبع طلبك 🚚
                  </a>
                  <div style="margin-top:10px;font-size:11px;color:#857979;line-height:1.5;">
                    أو يمكنكِ متابعة الشحنة مباشرة عبر الرابط التالي:<br/>
                    <span dir="ltr" style="word-break:break-all;color:#be185d;">${escapeHtml(trackingUrl)}</span>
                  </div>
                </div>
              `}
            </td>
          </tr>

          <!-- Premium Brand Footer -->
          <tr>
            <td style="background:#fcf9fb;border-top:1px solid #f2ebf0;padding:22px 24px;text-align:center;font-size:12px;color:#595050;line-height:1.6;">
              <div style="font-size:13px;font-weight:800;letter-spacing:2px;color:#2c2828;">DANDY COSMETICS</div>
              <div style="color:#857979;font-size:11px;margin:3px 0 8px 0;">نشكركِ لاختياركِ داندي وثقتكِ الدائمة بمنتجاتنا الطبيعية</div>
              <div style="font-size:12px;margin-bottom:10px;">
                خدمة العملاء (واتساب): <a href="https://wa.me/201038941005" target="_blank" style="color:#be185d;text-decoration:none;font-weight:700;" dir="ltr">01038941005</a>
                &nbsp;|&nbsp;
                البريد: <a href="mailto:dandybeauty4@gmail.com" style="color:#be185d;text-decoration:none;" dir="ltr">dandybeauty4@gmail.com</a>
              </div>
              <div style="font-size:10px;color:#aea5a5;border-top:1px solid #f2ebf0;padding-top:10px;margin-top:6px;line-height:1.5;">
                هذه الرسالة إشعار إداري فوري متعلق بمعاملتك لدى متجر داندي لمستحضرات التجميل الطبيعية - مصر.<br/>
                © 2026 DANDY Cosmetics. جميع الحقوق محفوظة.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Plain-text alternative for Order Confirmation.
 */
export function generateOrderConfirmationText(order: any, orderId: string, options?: { isDiagnostic?: boolean }): string {
  const invoiceCode = order?.invoiceCode || orderId;
  const financials = calculateOrderFinancials(order);
  const dateStr = formatCairoDateTime(order?.timestamp);
  const gov = order?.governorate || '';
  const city = order?.city || '';
  const address = order?.address || '';
  const phone = order?.phone || '';
  const isDiag = Boolean(options?.isDiagnostic || orderId.startsWith('diag_') || invoiceCode.startsWith('DIAG-'));
  const trackingUrl = `https://dandy-ebon.vercel.app/track-order?code=${encodeURIComponent(invoiceCode)}`;

  const productsList = financials.products.map(p => {
    const qty = p.quantity || 1;
    const name = p.name || 'منتج داندي';
    const total = formatEGP(p.lineTotal);
    return `• ${name} (الكمية: ${qty}) - ${total}`;
  }).join('\n');

  return `DANDY COSMETICS - جمالكِ الطبيعي يبدأ من هنا
==================================================
تم تأكيد استلام طلبك بنجاح

أهلاً بكِ ${order?.name || 'عميلتنا العزيزة'}،
شكراً لثقتكِ بمنتجات داندي! تم تسجيل استلام طلبك بنجاح وجارٍ مراجعته وتجهيزه بعناية.

تفاصيل الطلب:
- رقم الفاتورة: ${invoiceCode}
- تاريخ الطلب: ${dateStr}
- حالة الطلب: جديد (مؤكد)

عنوان التوصيل:
- المحافظة والمدينة: ${gov}${city ? '، ' + city : ''}
- العنوان بالتفصيل: ${address || 'العنوان المسجل في الطلب'}
- رقم الهاتف: ${phone || 'غير مسجل'}

المنتجات:
${productsList || 'لا توجد منتجات'}

الملخص المالي:
- إجمالي المنتجات: ${formatEGP(financials.subtotal)}
- مصاريف الشحن: ${financials.isFreeShipping ? 'شحن مجاني' : formatEGP(financials.shippingFee)}
- المبلغ المطلوب سداده عند الاستلام (COD): ${formatEGP(financials.totalAmount)}
* الدفع نقداً عند استلام الشحنة.

${isDiag ? 'ملاحظة: هذا البريد فحص تشغيلي تجريبي للإدارة.' : `تتبع مسار طلبك:\n${trackingUrl}`}

خدمة العملاء (واتساب): https://wa.me/201038941005 (01038941005)
البريد الإلكتروني: dandybeauty4@gmail.com
© 2026 DANDY Cosmetics - مصر`;
}

/**
 * Plain-text alternative for Order Status transitions.
 */
export function generateOrderStatusText(order: any, orderId: string, status: CanonicalStatus, options?: { isDiagnostic?: boolean }): string {
  const invoiceCode = order?.invoiceCode || orderId;
  const financials = calculateOrderFinancials(order);
  const dateStr = formatCairoDateTime(order?.timestamp);
  const isDiag = Boolean(options?.isDiagnostic || orderId.startsWith('diag_') || invoiceCode.startsWith('DIAG-'));
  const trackingUrl = `https://dandy-ebon.vercel.app/track-order?code=${encodeURIComponent(invoiceCode)}`;

  let statusMsg = '';
  switch (status) {
    case 'قيد التجهيز':
      statusMsg = 'نعمل حاليًا على تجهيز طلبك بعناية، ونسعى ليصلك بأفضل حالة.';
      break;
    case 'تم الشحن':
      statusMsg = 'يسعدنا إبلاغك بأنه تم شحن طلبك، وأصبح في طريقه إليك.';
      break;
    case 'تم التوصيل':
      statusMsg = 'تم تسجيل اكتمال توصيل طلبك. نتمنى أن تستمتعي بتجربتك مع DANDY.';
      break;
    case 'ملغي':
      statusMsg = 'نود إبلاغك بأنه تم إلغاء طلبك. شكرًا لاهتمامك بمنتجات DANDY.';
      break;
    default:
      statusMsg = 'تم تحديث حالة طلبك لدى داندي.';
  }

  return `DANDY COSMETICS - جمالكِ الطبيعي يبدأ من هنا
==================================================
تحديث حالة الطلب: ${status}

أهلاً بكِ ${order?.name || 'عميلتنا العزيزة'}،
${statusMsg}

ملخص الطلب:
- رقم الفاتورة: ${invoiceCode}
- تاريخ الطلب: ${dateStr}
- الحالة الحالية: ${status}
- المبلغ المطلوب سداده عند الاستلام (COD): ${formatEGP(financials.totalAmount)}

${isDiag ? 'ملاحظة: هذا البريد فحص تشغيلي تجريبي للإدارة.' : `تتبع مسار طلبك:\n${trackingUrl}`}

خدمة العملاء (واتساب): https://wa.me/201038941005 (01038941005)
البريد الإلكتروني: dandybeauty4@gmail.com
© 2026 DANDY Cosmetics - مصر`;
}

/**
 * Generates subject, HTML, and plain-text body for Order Confirmation.
 */
export function generateOrderConfirmationEmail(
  order: any,
  orderId: string,
  options?: { isDiagnostic?: boolean }
): { subject: string; htmlBody: string; textBody: string } {
  const invoiceCode = order?.invoiceCode || orderId;
  const subject = `تأكيد طلبك من داندي | رقم الفاتورة ${invoiceCode}`;

  const financials = calculateOrderFinancials(order);
  const gov = order?.governorate || '';
  const city = order?.city || '';
  const address = order?.address || '';
  const phone = order?.phone || '';
  const cairoDateStr = formatCairoDateTime(order?.timestamp);
  const isDiag = Boolean(options?.isDiagnostic || orderId.startsWith('diag_') || invoiceCode.startsWith('DIAG-'));

  const bodyContentHtml = `
    <h1 style="margin:4px 0 10px 0;font-size:20px;font-weight:800;color:#2c2828;line-height:1.4;">تم تأكيد استلام طلبك بنجاح</h1>
    <p style="font-size:14px;color:#595050;line-height:1.7;margin:0 0 16px;">
      شكراً لثقتكِ بمنتجات <strong>داندي</strong> الطبيعية! يسعدنا تأكيد استلام طلبك بنجاح وجارٍ مراجعته وتجهيزه بعناية فائقة ليصلكِ في أسرع وقت.
    </p>

    <!-- Compact Order Summary Card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fcf9fb;border:1px solid #f2ebf0;border-radius:10px;margin-bottom:18px;">
      <tr>
        <td style="padding:14px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
            <tr>
              <td style="padding:3px 0;color:#857979;text-align:right;">رقم الفاتورة:</td>
              <td style="padding:3px 0;font-weight:700;color:#2c2828;text-align:left;" dir="ltr">
                <span style="background:#ffffff;border:1px solid #ebdbe3;padding:2px 8px;border-radius:4px;">${escapeHtml(invoiceCode)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:3px 0;color:#857979;text-align:right;">تاريخ الطلب:</td>
              <td style="padding:3px 0;font-weight:600;color:#595050;text-align:left;">${cairoDateStr}</td>
            </tr>
            <tr>
              <td style="padding:3px 0;color:#857979;text-align:right;">حالة الطلب:</td>
              <td style="padding:3px 0;text-align:left;">
                <span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">جديد (مؤكد)</span>
              </td>
            </tr>
            <tr>
              <td style="padding:3px 0;color:#857979;text-align:right;">العميل:</td>
              <td style="padding:3px 0;font-weight:600;color:#2c2828;text-align:left;">${escapeHtml(order?.name || 'عميل داندي')}</td>
            </tr>
            <tr>
              <td style="padding:3px 0;color:#857979;text-align:right;">وجهة التوصيل:</td>
              <td style="padding:3px 0;font-weight:600;color:#595050;text-align:left;">${escapeHtml(gov)}${city ? '، ' + escapeHtml(city) : ''}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Products Section -->
    <div style="font-weight:700;color:#2c2828;font-size:14px;margin-bottom:6px;">📦 تفاصيل المنتجات في طلبك:</div>
    ${buildProductsTableHtml(financials.products)}

    <!-- Distinct Financial Summary Card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;background:#fcf9fb;border:1px solid #f2ebf0;border-radius:10px;padding:14px;">
      <tr>
        <td style="padding:4px 0;color:#595050;font-size:13px;text-align:right;">إجمالي المنتجات:</td>
        <td style="padding:4px 0;color:#2c2828;font-size:14px;font-weight:700;text-align:left;">${formatEGP(financials.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#595050;font-size:13px;text-align:right;">مصاريف الشحن${gov ? ` (${escapeHtml(gov)})` : ''}:</td>
        <td style="padding:4px 0;color:#2c2828;font-size:14px;font-weight:700;text-align:left;">
          ${financials.isFreeShipping 
            ? '<span style="color:#166534;background:#dcfce7;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">شحن مجاني 🎉</span>' 
            : formatEGP(financials.shippingFee)}
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:8px 0 0 0;">
          <div style="border-top:1px solid #ebdbe3;margin-bottom:8px;"></div>
        </td>
      </tr>
      <tr>
        <td style="padding:2px 0;color:#2c2828;font-size:14px;font-weight:800;text-align:right;">
          المبلغ المطلوب سداده عند الاستلام:
          <div style="font-size:11px;color:#857979;font-weight:400;margin-top:2px;">الدفع نقداً عند استلام الشحنة (COD)</div>
        </td>
        <td style="padding:2px 0;color:#be185d;font-size:19px;font-weight:900;text-align:left;white-space:nowrap;">
          ${formatEGP(financials.totalAmount)}
        </td>
      </tr>
    </table>

    <!-- Delivery Details -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;background:#ffffff;border:1px solid #f2ebf0;border-radius:10px;">
      <tr>
        <td style="padding:14px 16px;font-size:13px;">
          <div style="font-weight:700;color:#2c2828;margin-bottom:8px;">📍 بيانات الشحن والتوصيل:</div>
          <div style="color:#595050;margin-bottom:3px;">المحافظة والمدينة: <strong style="color:#2c2828;">${escapeHtml(gov)}${city ? '، ' + escapeHtml(city) : ''}</strong></div>
          <div style="color:#595050;margin-bottom:3px;">العنوان بالتفصيل: ${escapeHtml(address || 'العنوان المسجل في الطلب')}</div>
          <div style="color:#595050;">رقم الهاتف: <span dir="ltr" style="font-weight:600;color:#2c2828;">${escapeHtml(phone || 'غير مسجل')}</span></div>
        </td>
      </tr>
    </table>
  `;

  const htmlBody = buildBaseEmailTemplate({
    title: subject,
    badgeText: 'تم تأكيد استلام الطلب',
    badgeBg: '#fdf2f6',
    badgeColor: '#95184c',
    badgeBorder: '#f9d8e5',
    customerName: order?.name,
    invoiceCode,
    bodyContentHtml,
    orderId,
    isDiagnostic: isDiag
  });

  const textBody = generateOrderConfirmationText(order, orderId, { isDiagnostic: isDiag });

  return { subject, htmlBody, textBody };
}

/**
 * Generates subject, HTML, and plain-text body for Order Status transitions.
 * Shorter and more focused than the initial confirmation email.
 */
export function generateOrderStatusEmail(
  order: any,
  orderId: string,
  newStatus: CanonicalStatus,
  options?: { isDiagnostic?: boolean }
): { subject: string; htmlBody: string; textBody: string } {
  const invoiceCode = order?.invoiceCode || orderId;
  const gov = order?.governorate || '';
  const city = order?.city || '';
  const isDiag = Boolean(options?.isDiagnostic || orderId.startsWith('diag_') || invoiceCode.startsWith('DIAG-'));
  const financials = calculateOrderFinancials(order);
  const cairoDateStr = formatCairoDateTime(order?.timestamp);

  let subject = '';
  let badgeText = '';
  let badgeBg = '';
  let badgeColor = '';
  let badgeBorder = '';
  let heroTitle = '';
  let statusMessage = '';
  let noteMessage = '';

  switch (newStatus) {
    case 'قيد التجهيز':
      subject = `طلبك قيد التجهيز بعناية في داندي | رقم الفاتورة ${invoiceCode}`;
      badgeText = 'قيد التجهيز والتغليف';
      badgeBg = '#fff7ed';
      badgeColor = '#c2410c';
      badgeBorder = '#ffedd5';
      heroTitle = 'طلبك قيد التجهيز بعناية';
      statusMessage = 'نعمل حاليًا على تجهيز طلبك بعناية، ونسعى ليصلك بأفضل حالة.';
      noteMessage = 'نقوم بمراجعة وتغليف منتجاتك الطبيعية بعناية تمهيداً لتسليمها لشركة الشحن والتوصيل.';
      break;

    case 'تم الشحن':
      subject = `تم شحن طلبك من داندي وهو في طريقه إليكِ! | ${invoiceCode}`;
      badgeText = 'تم الشحن وفي الطريق';
      badgeBg = '#f0fdf4';
      badgeColor = '#15803d';
      badgeBorder = '#bbf7d0';
      heroTitle = 'طلبك في طريقه إليكِ';
      statusMessage = 'طلبك في طريقه إليكِ! تم تسليم شحنتك إلى شركة التوصيل وهو في طريقه إلى عنوانك المسجل.';
      noteMessage = `شحنتك في طريقها إلى عنوانك المسجل في ${escapeHtml(gov || 'مصر')}. سيقوم مندوب التوصيل بالتواصل معكِ لتنسيق موعد الاستلام.`;
      break;

    case 'تم التوصيل':
      subject = `تم توصيل طلبك بنجاح | DANDY ${invoiceCode}`;
      badgeText = 'تم التوصيل بنجاح';
      badgeBg = '#eff6ff';
      badgeColor = '#1d4ed8';
      badgeBorder = '#bfdbfe';
      heroTitle = 'تم تسليم طلبك بنجاح';
      statusMessage = 'تم تسجيل اكتمال توصيل طلبك. نتمنى أن تستمتعي بتجربتك مع DANDY.';
      noteMessage = 'نشكركِ لاختياركِ داندي وثقتكِ الدائمة بمنتجاتنا الطبيعية! نسعد دائماً برأيكِ وتقييمكِ لتجربتكِ.';
      break;

    case 'ملغي':
      subject = `تم إلغاء طلبك من داندي | ${invoiceCode}`;
      badgeText = 'طلب ملغي';
      badgeBg = '#fef2f2';
      badgeColor = '#b91c1c';
      badgeBorder = '#fecaca';
      heroTitle = 'تم إلغاء طلبك';
      statusMessage = 'نود إبلاغك بأنه تم إلغاء طلبك. شكرًا لاهتمامك بمنتجات DANDY.';
      noteMessage = 'إذا كان هذا الإلغاء قد تم عن طريق الخطأ وترغبين في إعادة تفعيل الطلب، نرجو منكِ التواصل معنا عبر واتساب وسنكون سعداء بخدمتكِ.';
      break;

    case 'جديد':
    default:
      return generateOrderConfirmationEmail(order, orderId, { isDiagnostic: isDiag });
  }

  // Build compact products list for status email
  const compactProductsHtml = financials.products.map(p => {
    const qty = p.quantity || 1;
    const name = escapeHtml(p.name || 'منتج داندي');
    let varInfo = '';
    if (p.variantName) {
      varInfo = `<span style="font-size:11px;color:#8e0b4a;"> (${escapeHtml(p.variantName)})</span>`;
    }
    return `
      <div style="padding:4px 0;display:flex;justify-content:space-between;color:#595050;font-size:13px;border-bottom:1px solid #f7f0f4;">
        <span>• ${name}${varInfo} × ${qty}</span>
        <strong style="color:#2c2828;">${formatEGP(p.lineTotal)}</strong>
      </div>
    `;
  }).join('');

  const bodyContentHtml = `
    <h1 style="margin:4px 0 10px 0;font-size:20px;font-weight:800;color:#2c2828;line-height:1.4;">${escapeHtml(heroTitle)}</h1>
    <p style="font-size:15px;color:#2c2828;line-height:1.7;margin:0 0 12px;font-weight:600;">
      ${escapeHtml(statusMessage)}
    </p>
    <p style="font-size:13px;color:#595050;line-height:1.6;margin:0 0 16px;">
      ${noteMessage}
    </p>

    <!-- Compact Order Summary Card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fcf9fb;border:1px solid #f2ebf0;border-radius:10px;margin-bottom:14px;">
      <tr>
        <td style="padding:14px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
            <tr>
              <td style="padding:3px 0;color:#857979;text-align:right;">رقم الفاتورة:</td>
              <td style="padding:3px 0;font-weight:700;color:#2c2828;text-align:left;" dir="ltr">
                <span style="background:#ffffff;border:1px solid #ebdbe3;padding:2px 8px;border-radius:4px;">${escapeHtml(invoiceCode)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:3px 0;color:#857979;text-align:right;">تاريخ الطلب:</td>
              <td style="padding:3px 0;font-weight:600;color:#595050;text-align:left;">${cairoDateStr}</td>
            </tr>
            <tr>
              <td style="padding:3px 0;color:#857979;text-align:right;">الحالة الحالية:</td>
              <td style="padding:3px 0;text-align:left;">
                <span style="background:${badgeBg};color:${badgeColor};border:1px solid ${badgeBorder};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">${escapeHtml(newStatus)}</span>
              </td>
            </tr>
            ${gov ? `
            <tr>
              <td style="padding:3px 0;color:#857979;text-align:right;">وجهة التوصيل:</td>
              <td style="padding:3px 0;font-weight:600;color:#595050;text-align:left;">${escapeHtml(gov)}${city ? '، ' + escapeHtml(city) : ''}</td>
            </tr>
            ` : ''}
          </table>

          <div style="border-top:1px solid #ebdbe3;margin:10px 0 8px 0;"></div>
          <div style="font-size:12px;font-weight:700;color:#2c2828;margin-bottom:4px;">ملخص المنتجات:</div>
          ${compactProductsHtml || '<div style="color:#857979;font-size:12px;">لا توجد تفاصيل للمنتجات</div>'}

          <div style="border-top:1px solid #ebdbe3;margin:8px 0;padding-top:8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-weight:800;color:#2c2828;font-size:13px;text-align:right;">
                  ${newStatus === 'ملغي' ? 'إجمالي الطلب الملغي:' : 'المبلغ المطلوب سداده عند الاستلام (COD):'}
                </td>
                <td style="font-weight:900;color:#be185d;font-size:16px;text-align:left;">
                  ${formatEGP(financials.totalAmount)}
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
    </table>
  `;

  const htmlBody = buildBaseEmailTemplate({
    title: subject,
    badgeText,
    badgeBg,
    badgeColor,
    badgeBorder,
    customerName: order?.name,
    invoiceCode,
    bodyContentHtml,
    orderId,
    isDiagnostic: isDiag
  });

  const textBody = generateOrderStatusText(order, orderId, newStatus, { isDiagnostic: isDiag });

  return { subject, htmlBody, textBody };
}

/**
 * Dispatches a signed notification payload to Google Apps Script Mail Relay.
 */
export async function dispatchToAppsScriptRelay(params: {
  notificationId: string;
  recipientEmail: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
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
    textBody,
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

  const payload: any = {
    recipientEmail: recipientEmail.trim(),
    subject: subject.trim(),
    htmlBody,
    eventType,
    orderId,
    invoiceCode
  };
  if (textBody) {
    payload.textBody = textBody;
  }

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
  const emailContent = (eventType === 'ORDER_STATUS_CHANGED' && targetStatus !== 'جديد')
    ? generateOrderStatusEmail(order, orderId, targetStatus)
    : generateOrderConfirmationEmail(order, orderId);

  const { subject, htmlBody, textBody } = emailContent;

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
    textBody,
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
  const statusSlug = testType === 'ORDER_STATUS_CHANGED'
    ? (targetStatus === 'قيد التجهيز' ? 'processing'
      : targetStatus === 'تم الشحن' ? 'shipped'
      : targetStatus === 'تم التوصيل' ? 'delivered'
      : targetStatus === 'ملغي' ? 'cancelled'
      : 'status')
    : 'confirmation';
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const notificationId = `notif_diag_${statusSlug}_${timestamp}_${randomSuffix}`;
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

  let emailContent: { subject: string; htmlBody: string; textBody: string };
  if (testType === 'ORDER_STATUS_CHANGED') {
    emailContent = generateOrderStatusEmail(syntheticOrder, `diag_${timestamp}`, targetStatus, { isDiagnostic: true });
    emailContent.subject = `[فحص تشغيلي - DIAGNOSTIC] ${emailContent.subject}`;
  } else {
    emailContent = generateOrderConfirmationEmail(syntheticOrder, `diag_${timestamp}`, { isDiagnostic: true });
    emailContent.subject = `[فحص تشغيلي - DIAGNOSTIC] ${emailContent.subject}`;
  }

  const dispatchResult = await dispatchToAppsScriptRelay({
    notificationId,
    recipientEmail: recipient,
    subject: emailContent.subject,
    htmlBody: emailContent.htmlBody,
    textBody: emailContent.textBody,
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

