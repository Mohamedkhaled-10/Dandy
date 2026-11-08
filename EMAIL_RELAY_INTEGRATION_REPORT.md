# DANDY Cosmetics — Email Relay Architecture & Premium Design Report
**Document Version:** 1.4.0 (Modern Premium DANDY Redesign & 4-Status Diagnostic Verification)  
**Target Environment:** Vercel SSR Node.js + Google Apps Script + Firebase RTDB  
**Fixed Diagnostic Account:** `dandybeauty4@gmail.com`  
**Store URL:** `https://dandy-ebon.vercel.app`  
**Brand Accent:** `#fe5d9f` / `#be185d` (Dandy Rose)  
**Support WhatsApp:** `https://wa.me/201038941005` (`01038941005`)  

---

## 1. Executive Summary

This release completes two connected milestones for DANDY Cosmetics:

1. **Modern Premium DANDY Transactional Email Redesign:**
   - Transformed the plain HTML table emails into an elegant, editorial e-commerce branded experience reflecting **Minimal Luxury Skincare**.
   - Built on a fluid, table-based layout (max-width: 600px) with inline CSS, responsive viewport scaling, and fallbacks for all modern desktop and mobile email clients (Apple Mail, Gmail iOS/Android, Outlook, webmail).
   - Integrated the official DANDY logo with an automatic fallback to an elegant typography wordmark.
   - Displayed product thumbnails (56×56px) with broken-image fallbacks, collection bundle itemization without double counting, discounted price strikethroughs, variant metadata, and Egyptian currency formatting (`ج.م`).
   - Implemented a clear Cash On Delivery (COD) payment summary without implying prior electronic settlement.
   - Added automatic plain-text alternatives (`textBody`) dispatched alongside HTML for accessibility and spam score optimization.

2. **Verification of All Four Order-Status Templates:**
   - Completed diagnostic templates for the remaining four canonical statuses:
     - **قيد التجهيز (Processing):** Notice of preparation and packaging with estimated dispatch.
     - **تم الشحن (Shipped):** Dispatch confirmation, shipping destination, delivery coordination instructions.
     - **تم التوصيل (Delivered):** Delivery completion notice, brand appreciation, and support contact.
     - **ملغي (Cancelled):** Cancellation acknowledgment with support assistance if cancelled in error.
   - Extended the owner-only diagnostic endpoint and admin dashboard to test individual statuses or batch-test all 4 status templates in sequence.
   - Expanded the test suite to **42 automated unit tests** (`test/email-relay.test.mjs`), with 100% pass rate.

---

## 2. Design System & Brand Visual Tokens

The transactional email design aligns strictly with the existing DANDY storefront foundation tokens (`assets/css/foundation.css`):

### 2.1 Color Palette & Surfaces
| Token | Hex Value | Purpose |
|---|---|---|
| **Canvas Background** | `#faf7f9` | Soft warm neutral canvas giving generous whitespace |
| **Card Surface** | `#ffffff` | Primary container surface with subtle 1px border (`#f0e6ed`) |
| **Primary Text** | `#2c2828` | High-contrast dark charcoal (dust grey 100) for effortless legibility |
| **Secondary Text** | `#595050` | Medium grey for addresses, variant metadata, and descriptions |
| **Muted Text** | `#857979` | Light grey for timestamps, captions, and table header labels |
| **Brand Accent** | `#be185d` / `#fe5d9f` | Dandy blush rose for totals, brand dividers, and active accents |
| **Subtle Blush Surface** | `#fdf2f6` | Soft blush tint for order summary headers and diagnostic banners |
| **Card Dividers** | `#ebdbe3` / `#f2ebf0` | Refined hairline separators preventing visual clutter |

### 2.2 Status Badges
| Status | Badge Background | Badge Text Color | Badge Border |
|---|---|---|---|
| **جديد (New)** | `#fdf2f6` | `#95184c` | `#f9d8e5` |
| **قيد التجهيز (Processing)** | `#fff7ed` | `#c2410c` | `#ffedd5` |
| **تم الشحن (Shipped)** | `#f0fdf4` | `#15803d` | `#bbf7d0` |
| **تم التوصيل (Delivered)** | `#eff6ff` | `#1d4ed8` | `#bfdbfe` |
| **ملغي (Cancelled)** | `#fef2f2` | `#b91c1c` | `#fecaca` |

### 2.3 Typography & Directionality
- **Direction:** Strict `rtl` layout with `text-align: right` across all tables, paragraphs, and list elements.
- **Font Stack:** Safe cross-platform Arabic system fallbacks:
  `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Alexandria', 'Cairo', Arial, sans-serif`
- **Date/Time:** Formatted dynamically in `Africa/Cairo` timezone using `ar-EG` locale (e.g. `٨ نوفمبر ٢٠٢٦ في ١٠:٢٢ م`).

---

## 3. Email Layout & Component Architecture

### 3.1 Structural Wireframe (Max 600px Fluid)
```
┌────────────────────────────────────────────────────────┐
│  Canvas Background (#faf7f9)                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │  White Card Container (#ffffff, max-width 600px) │  │
│  │                                                  │  │
│  │  [ DANDY LOGO ]                                  │  │
│  │  جمالكِ الطبيعي يبدأ من هنا                      │  │
│  │  ──────────────────────                          │  │
│  │                                                  │  │
│  │  [ Status Badge: e.g. قيد التجهيز والتغليف ]    │  │
│  │                                                  │  │
│  │  أهلاً بكِ سارة خالد 💕                           │  │
│  │  [ Headline & Status Message ]                   │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │ Order Metadata Card (Invoice, Date, Dest)  │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │ Products Table (Thumbnails, Prices, Qty)   │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │ Financial Summary (Subtotal, Ship, COD)    │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │ Delivery Address & Customer Details        │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  │                                                  │  │
│  │  [ Action CTA: تتبع طلبك 🚚 ]                    │  │
│  │                                                  │  │
│  │  ──────────────────────────────────────────────  │  │
│  │  Customer Care (WhatsApp 01038941005)            │  │
│  │  Transactional Notice & Copyright © 2026 DANDY   │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 3.2 Product Presentation Features
1. **Thumbnails:** 56×56px square product preview images with `border-radius: 6px` and automatic CSS `onerror` fallback hiding broken images without breaking layout.
2. **Collection Bundles:** Items inside a collection bundle are itemized cleanly beneath the bundle title in a muted sub-list with a distinct bundle indicator, preventing customer confusion without duplicating prices.
3. **Discounts:** Strikethrough original prices are shown alongside the active effective price when a discount applies.
4. **Line Item Totals:** Accurately calculated as `effectiveUnitPrice × quantity` in Egyptian Pounds (`ج.م`).

### 3.3 Financial Calculations & COD Clarity
- **Subtotal:** Computed from line items if missing or zero in the stored order object (safe recalculation fallback).
- **Shipping Fee:** Adheres strictly to Egyptian governorate rules (85 EGP Cairo/Giza, 95 EGP Alexandria, etc.). Free shipping is granted **only** if subtotal > 2000 EGP.
- **Payment Method:** Displayed explicitly as:  
  `الدفع نقداً عند استلام الشحنة (COD)`  
  Ensuring no implication that an online transaction has been settled.

---

## 4. The 5 Canonical Status Templates

### 4.1 جديد (Order Confirmation & Invoice)
- **Subject:** `تأكيد طلبك من داندي | رقم الفاتورة [InvoiceCode]`
- **Status Badge:** `تم تأكيد استلام الطلب`
- **Headline:** `شكراً لاختياركِ داندي!`
- **Message:** `تم استلام طلبك بنجاح وجارٍ مراجعته لتجهيزه بأعلى معايير الجودة والاهتمام.`
- **CTA:** `تتبع طلبك 🚚` (or Diagnostic banner in diagnostic mode).

### 4.2 قيد التجهيز (Processing)
- **Subject:** `طلبك قيد التجهيز بعناية في داندي | رقم الفاتورة [InvoiceCode]`
- **Status Badge:** `قيد التجهيز والتغليف`
- **Headline:** `طلبك قيد التجهيز بعناية`
- **Message:** `نعمل حاليًا على تجهيز طلبك بعناية، ونسعى ليصلك بأفضل حالة.`
- **Note:** `نقوم بمراجعة وتغليف منتجاتك الطبيعية بعناية تمهيداً لتسليمها لشركة الشحن والتوصيل.`

### 4.3 تم الشحن (Shipped)
- **Subject:** `تم شحن طلبك من داندي وهو في طريقه إليكِ! | [InvoiceCode]`
- **Status Badge:** `تم الشحن وفي الطريق`
- **Headline:** `طلبك في طريقه إليكِ`
- **Message:** `طلبك في طريقه إليكِ! تم تسليم شحنتك إلى شركة التوصيل وهو في طريقه إلى عنوانك المسجل.`
- **Note:** `شحنتك في طريقها إلى عنوانك المسجل. سيقوم مندوب التوصيل بالتواصل معكِ لتنسيق موعد الاستلام.`

### 4.4 تم التوصيل (Delivered)
- **Subject:** `تم توصيل طلبك بنجاح | DANDY [InvoiceCode]`
- **Status Badge:** `تم التوصيل بنجاح`
- **Headline:** `تم تسليم طلبك بنجاح`
- **Message:** `تم تسجيل اكتمال توصيل طلبك. نتمنى أن تستمتعي بتجربتك مع DANDY.`
- **Note:** `نشكركِ لاختياركِ داندي وثقتكِ الدائمة بمنتجاتنا الطبيعية! نسعد دائماً برأيكِ وتقييمكِ لتجربتكِ.`

### 4.5 ملغي (Cancelled)
- **Subject:** `تم إلغاء طلبك من داندي | [InvoiceCode]`
- **Status Badge:** `طلب ملغي`
- **Headline:** `تم إلغاء طلبك`
- **Message:** `نود إبلاغك بأنه تم إلغاء طلبك. شكرًا لاهتمامك بمنتجات DANDY.`
- **Note:** `إذا كان هذا الإلغاء قد تم عن طريق الخطأ وترغبين في إعادة تفعيل الطلب، نرجو منكِ التواصل معنا عبر واتساب وسنكون سعداء بخدمتكِ.`

---

## 5. Apps Script Integration Update

In `google-apps-script/Code.gs`, `MailApp.sendEmail` options were updated to support the plain-text alternative:

```javascript
var mailOptions = {
  htmlBody: payload.htmlBody,
  name: 'DANDY Cosmetics'
};

if (payload.textBody) {
  mailOptions.body = payload.textBody;
}

MailApp.sendEmail(payload.recipientEmail, payload.subject, payload.textBody || '', mailOptions);
```

Because `canonicalizeJson` serializes keys deterministically in alphabetical order, `payload.textBody` is signed identically across both Node.js (`crypto.createHmac`) and Apps Script (`Utilities.computeHmacSha256Signature`), preserving 100% exact-byte HMAC integrity.

---

## 6. Automated Test Suite Results

The comprehensive test suite (`test/email-relay.test.mjs`) contains **42 passing tests**:

| Test Group | Tests | Coverage | Status |
|---|---|---|---|
| **Cryptographic & HMAC Protocol** | 1 - 2, 25 - 27 | Exact-byte UTF-8, deterministic JSON, 64-char hex, tamper detection | ✅ 100% Passed |
| **Security & Authorization** | 3, 10, 16, 23, 24 | Email validation, Firebase Admin auth token, owner email guard | ✅ 100% Passed |
| **Relay Deduplication & Lock** | 6 - 9, 15, 17 - 19 | 3-state machine (`processing`, `accepted`, `unknown`), 5-min drift, nonce cache | ✅ 100% Passed |
| **Storefront & Database Isolation** | 11 - 14, 20 | Zero client-side fallback writes, Make.com isolation, canonical status mapping | ✅ 100% Passed |
| **Financial Calculations & Fallbacks** | 28 - 36 | 1-item, 2-items, bundles, discounts, free vs paid shipping, missing/zero field recovery, synthetic diagnostic | ✅ 100% Passed |
| **Modern Premium Redesign & Status Templates** | 37 - 42 | Cairo timezone formatting, plain-text generators, processing/shipped/delivered/cancelled templates, batch diagnostics | ✅ 100% Passed |
| **Reliability, Security & Direct Access (Phase 13)** | 43 - 50 | 256-bit access tokens, SHA-256 hash lookup, #access fragment resolution, Spam notice, drawOrdersTable stability | ✅ 100% Passed |

---

## 7. How to Test From the Admin Dashboard

1. Log into the DANDY admin dashboard: `https://dandy-ebon.vercel.app/dashboard-order`.
2. Click the pink button: **✉️ فحص خادم البريد (Diagnostic)**.
3. A modal menu will prompt you to choose:
   - `1`: Test Order Confirmation (`ORDER_CONFIRMATION`)
   - `2`: Test Status `قيد التجهيز` (Processing)
   - `3`: Test Status `تم الشحن` (Shipped)
   - `4`: Test Status `تم التوصيل` (Delivered)
   - `5`: Test Status `ملغي` (Cancelled)
   - `6`: Test All 4 Status Templates in sequence (`DIAGNOSTIC_SEND_ALL_STATUSES`)
4. Check your Gmail inbox (`dandybeauty4@gmail.com`) to inspect the delivered email layout and financial details.
5. Customer notifications remain safely paused (`GMAIL_NOTIFICATIONS_ENABLED=false`) until you explicitly enable them in Vercel.

---

## 8. Phase 13: Reliability, Security, Customer Experience & Deliverability Upgrade

### 8.1. Root Causes & Technical Diagnoses

1. **Unawaited Serverless Promise in Checkout (`create-order.js`)**:
   - *Problem*: In Vercel serverless environments, returning an HTTP Response immediately causes the container to freeze or terminate the Node.js event loop. The original checkout code called `sendOrderNotification(...).catch(...)` without awaiting it. As a result, outbound HTTP fetch requests to Google Apps Script Mail Relay were routinely aborted before the TCP handshake or response completed.
   - *Fix*: The notification promise is now awaited with a bounded timeout (`Promise.race` capped at 4.5 seconds) within a dedicated `try/catch` block. This guarantees that Vercel keeps the lambda container warm until relay dispatch completes, while ensuring that even a complete mail relay failure never blocks checkout or delays order creation.

2. **Dashboard Status Update Crash (`dashboard-order.astro`)**:
   - *Problem*: The table render function in `dashboard-order.astro` is named `drawOrdersTable()`. However, `changeOrderStatus` and `applyBulkAction` invoked `renderOrders()`. This threw an uncaught `ReferenceError: renderOrders is not defined` inside the browser event handler, instantly jumping to the outer `catch` block which displayed a false rollback alert ("حدث خطأ... تم استرجاع الحالة") even though the server had already committed the status update to Firebase RTDB!
   - *Fix*: Replaced all calls with `drawOrdersTable()`, added global and local aliases `window.renderOrders = drawOrdersTable; const renderOrders = drawOrdersTable;`, and added a `serverCommitted` guard so that any client-side DOM rendering exceptions can never revert the dropdown or trigger false server error alerts.

3. **Historical Orders & Fabricated Notification IDs**:
   - *Problem*: Orders created before email relay tracking was activated had no record in `notifications_outbox`. The UI showed a misleading `pending` badge and fabricated synthetic IDs like `notif_order_${orderId}_confirmation`. Clicking "إعادة إرسال" passed this synthetic ID to `action: 'RETRY_NOTIFICATION'`, which failed with `404 NOTIFICATION_NOT_FOUND` because no outbox entry existed.
   - *Fix*: Historical orders with an email address now display a clear `لم يُرسل سابقاً` badge (`st-none`). Added a dedicated server action `SEND_CURRENT_STATUS_NOTIFICATION` protected by Firebase Admin authentication. In the modal, admins can now click **«إرسال إشعار بالحالة الحالية»** to dispatch a fresh, tracked notification for the order's current status without corrupting order timestamps or triggering Make/Telegram webhooks.

### 8.2. Cryptographic Token Architecture & Direct Invoice Access

- **256-bit Entropy Token**: Created using `crypto.randomBytes(32).toString('base64url')` (43-44 base64url characters, ~256 bits of cryptographic entropy).
- **One-Way SHA-256 Hashing**: The raw token is hashed (`hashInvoiceToken`), and only the hash is used as the key in `privateInvoiceAccess/${tokenHash}`.
- **Strict Database Security Rules**:
  ```json
  "privateOrderAccess": {
    ".read": false,
    ".write": false
  },
  "privateInvoiceAccess": {
    ".read": false,
    ".write": false
  },
  "notifications_outbox": {
    ".read": "auth != null && auth.token.email == 'admin@dandy.com'",
    ".write": "auth != null && auth.token.email == 'admin@dandy.com'",
    ".indexOn": ["orderId", "timestamp"]
  }
  ```
  Neither authenticated customers nor unauthenticated guests can read or query these nodes through the client SDK. Only server-side Firebase Admin SDK can access them.
- **URL Fragment Delivery (`#access={token}`)**:
  - Direct invoice URLs in customer emails point to `https://dandy-ebon.vercel.app/invoice#access={token}`.
  - Fragments are strictly client-side: they are never transmitted to origin servers in HTTP request headers or HTTP referrers.
  - On page load, `invoice.astro` extracts the token, immediately clears the fragment from the browser URL via `history.replaceState(null, '', window.location.pathname + window.location.search)` (preventing leakage if the user copies the address bar), and performs a read-only `POST /api/public-invoice`.
- **Field Whitelisting**: `resolvePublicInvoiceByToken` strips internal notes, admin credentials, outbox logs, and returns strictly sanitized customer invoice fields.
- **Fail-Open Rate Limiting**: The `/api/public-invoice` endpoint enforces IP rate limiting via Upstash Redis (60 requests / 10 minutes per IP) with graceful fail-open resilience.

### 8.3. Customer Experience & Spam Awareness Notice

On the customer invoice page (`invoice.astro`), immediately below the order confirmation header, a discreet and reassuring notice is rendered:
> **تنبيه بخصوص تحديثات طلبك**  
> قد تصل رسائل تأكيد الطلب وتحديثات الشحن من DANDY إلى مجلد الرسائل غير المرغوب فيها (Spam) في Gmail. إذا وجدت رسالة متوقعة من عنواننا الرسمي `dandybeauty4@gmail.com`، وبعد التأكد من عنوان المرسل، يمكنك اختيار «ليست رسالة غير مرغوب فيها» (Not spam)، ليسهل عليك العثور على تحديثات طلبك القادمة في صندوق الوارد.

The page also includes `<meta name="referrer" content="no-referrer" />` to safeguard tokens and customer privacy.

### 8.4. Deliverability Hygiene & Gmail Free Tier Guidance

1. **Transactional Purity**:
   - The status email template for `تم التوصيل` (Delivered) has been stripped of promotional upsells, discount codes, or promotional marketing phrases, keeping it 100% transactional.
   - Primary CTA button copy across confirmation and status templates is standardized to: **«عرض فاتورتك وتتبع طلبك 🚚»**.
   - Zero remote tracking pixels, zero external analytics beacons, zero embedded base64 emojis, and zero remote third-party scripts in outbound HTML emails.
2. **Free Gmail (`@gmail.com`) Reality & Diagnostic Instructions**:
   - While Google Apps Script `MailApp.sendEmail` sends from authentic Google infrastructure with valid SPF/DKIM on `google.com`/`gmail.com`, Google's spam filters evaluate sender reputation dynamically based on domain usage, volume, and recipient interactions.
   - *How to inspect delivery headers in Gmail*:
     1. Open any diagnostic email sent to `dandybeauty4@gmail.com`.
     2. Click the three vertical dots (More options) in the top-right corner of the email.
     3. Select **«Show original»** (إظهار الرسالة الأصلية).
     4. Verify that **SPF**, **DKIM**, and **DMARC** show **PASS**.
   - *Long-Term Recommendation*: For large-scale e-commerce operations (> 100 orders/day), migrating from free `@gmail.com` to a dedicated business domain (e.g., `orders@dandycosmetics.com`) with custom reverse DNS, SPF, DKIM, DMARC, and a transactional provider (Resend, SendGrid, or Postmark) will provide 99%+ inbox placement. For current DANDY volumes, the Apps Script relay with clean transactional formatting and customer spam notices provides an optimal, zero-cost, high-reliability solution.

