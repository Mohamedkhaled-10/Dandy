# DANDY Cosmetics — Email Relay Architecture & Hardening Report
**Document Version:** 1.2.0 (Anonymous Access Verification & Owner Diagnostic)  
**Target Environment:** Vercel SSR Node.js + Google Apps Script + Firebase RTDB  
**Owner Account:** `dandybeauty4@gmail.com`  
**Store URL:** `https://dandy-ebon.vercel.app`  

---

## 1. Executive Summary & Security Hardening Overview

Following the architectural migration from direct Gmail API OAuth to the official Google Apps Script `MailApp` relay, this hardening pass resolved five critical security and reliability requirements:

1. **Complete Removal of Client-Side Firebase Fallbacks:** All order status updates (both individual dropdown changes and bulk operations) in `src/pages/dashboard-order.astro` now strictly route through the protected server endpoint `/api/order-status`. If the server is unreachable or returns an error, the browser **never** performs a fallback direct write to Firebase; instead, it immediately reverts the UI dropdown to its previous database state and alerts the administrator.
2. **Make.com / Brevo Duplicate Invoice Prevention:** The legacy Make scenario previously sent an order invoice email via Brevo. The webhook payload in `/api/create-order.js` now includes explicit isolation flags (`sendEmailInvoice: false`, `skipEmailNotification: true`, `disableBrevoEmail: true`, `emailProvider: 'GMAIL_RELAY'`) when Gmail notifications are enabled or when `DISABLE_MAKE_INVOICE_EMAIL=true`, ensuring that customers never receive duplicate invoices.
3. **LockService & 3-State Apps Script Deduplication:** `google-apps-script/Code.gs` now utilizes `LockService.getScriptLock()` with a 10-second acquisition window to eliminate race conditions. It implements a strict 3-state machine (`processing`, `accepted_by_mailapp`, `unknown`). Any notification in an ambiguous `unknown` state is prevented from automatic resending without manual administrative review. Persistent Script Properties are pruned automatically to stay safely within platform storage limits (< 150 records).
4. **Verified Unauthenticated Web App Invocation:** The Apps Script deployment is configured to execute as the owner (`USER_DEPLOYING`) with access set to `ANYONE` (anonymous HTTP POST). Mandatory HMAC-SHA256 request signatures, nonce validation, and a 5-minute timestamp window guarantee robust API security without requiring an interactive Google account login from Vercel.
5. **Expanded Automated Test Suite:** The unit test suite (`test/email-relay.test.mjs`) was expanded from 12 to 20 tests, comprehensively verifying non-admin token rejection, expired timestamps, replayed nonces, lock contention, status normalization, and AST checks for the complete absence of client fallback writes.

---

## 2. End-to-End System Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │ Customer Storefront / Admin Dashboard        │
                  └──────────────────────┬───────────────────────┘
                                         │
                    1. Create Order / Protected Status Change
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │ Vercel Server-Side API (Node.js)             │
                  │ - /api/create-order.js                       │
                  │ - /api/order-status.js (Admin Auth Guard)    │
                  └──────────────┬───────────────────────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
┌───────────────────────────────┐           ┌───────────────────────────────┐
│ Firebase RTDB:                │           │ Signed HTTPS POST             │
│ orders/{orderId}/status       │           │ - Timestamp & Nonce           │
│ notifications_outbox/{notifId}│           │ - Canonical JSON Envelope     │
│ - status: 'pending'           │           │ - HMAC-SHA256 Signature       │
│ - attempts: 0                 │           │ (GMAIL_NOTIFICATIONS_ENABLED) │
└───────────────────────────────┘           └──────────────┬────────────────┘
                                                           │
                                                           ▼
                                            ┌───────────────────────────────┐
                                            │ Google Apps Script Web App    │
                                            │ - Executes as:                │
                                            │   dandybeauty4@gmail.com      │
                                            │ - Access: ANYONE (No Google   │
                                            │   login required for HTTP)    │
                                            └──────────────┬────────────────┘
                                                           │
                                                           │ 1. LockService.getScriptLock()
                                                           │ 2. Validate HMAC-SHA256
                                                           │ 3. Check 5-min timestamp drift
                                                           │ 4. Check nonce replay in cache
                                                           │ 5. 3-State notifId deduplication
                                                           │ 6. Check daily MailApp quota
                                                           │
                                                           ▼
                                            ┌───────────────────────────────┐
                                            │ MailApp.sendEmail()           │
                                            │ - from: DANDY                 │
                                            │ - replyTo: dandybeauty4@...   │
                                            └──────────────┬────────────────┘
                                                           │
                                                           ▼
                                            ┌───────────────────────────────┐
                                            │ Customer Email Inbox          │
                                            └───────────────────────────────┘
```

---

## 3. Detailed Security & Reliability Hardening

### 3.1 Strict Server Routing (Zero Client-Side Fallback)
- **Problem:** Earlier iterations allowed the browser to directly patch Firebase Realtime Database (`db.ref().update`) if `/api/order-status` encountered a network failure or error. This bypassed server authentication, audit logging, status validation, and notification outbox synchronization.
- **Solution:** 
  - Every direct database write in `changeOrderStatus` and `applyBulkAction` within `src/pages/dashboard-order.astro` was completely removed.
  - The dropdown element (`this`) is passed into `changeOrderStatus(id, val, this)` so that on any API failure or non-200 response, the dropdown reverts to the previously confirmed database status without triggering unwanted change events.
  - An administrative alert informs the operator that the server rejected or failed the request and that no data was modified.
  - Unit test 13 inspects the AST / source of `src/pages/dashboard-order.astro` to assert that zero client-side status writes exist.

### 3.2 Legacy Make.com Scenario Isolation
- **Analysis:** In the legacy setup, `create-order.js` posted the complete order payload to `MAKE_WEBHOOK_URL`. In Make.com, a scenario consumed this webhook to append the order to a Google Sheet and trigger an email invoice via Brevo.
- **Conflict:** Enabling Gmail notifications would result in the customer receiving two conflicting confirmation emails (one from DANDY Gmail and one from Brevo).
- **Solution:**
  - `src/pages/api/create-order.js` now evaluates `isGmailEnabled = process.env.GMAIL_NOTIFICATIONS_ENABLED === 'true'` and `isMakeEmailDisabled = process.env.DISABLE_MAKE_INVOICE_EMAIL === 'true' || isGmailEnabled`.
  - The webhook payload dispatched to Make includes explicit control flags:
    ```json
    {
      "sendEmailInvoice": false,
      "skipEmailNotification": true,
      "disableBrevoEmail": true,
      "emailProvider": "GMAIL_RELAY"
    }
    ```
  - This allows the Make scenario to continue logging to Google Sheets or sending internal alerts while cleanly silencing the Brevo email action via a simple Make filter (`sendEmailInvoice Equal to true`).
  - By default, `GMAIL_NOTIFICATIONS_ENABLED=false` until the owner finishes testing.

### 3.3 Apps Script LockService & 3-State Deduplication
- **Concurrency Control:** `Code.gs` invokes `LockService.getScriptLock()` and requests a lock for up to 10 seconds:
  ```javascript
  var lock = LockService.getScriptLock();
  var hasLock = lock.tryLock(10000);
  if (!hasLock) {
    return jsonResponse({ success: false, error: 'LOCK_TIMEOUT', message: 'Relay lock timeout' }, 503);
  }
  ```
- **3-State Machine:**
  1. **`processing`:** Stored in `ScriptProperties` under `notif_{notificationId}` immediately after lock acquisition and parameter validation. If a duplicate request for the same ID arrives while another is processing, it is rejected with `409 CONCURRENT_REQUEST_IN_FLIGHT`.
  2. **`accepted_by_mailapp`:** Updated immediately after `MailApp.sendEmail()` completes. Subsequent requests with the same ID return `200 OK` with `deduplicated: true`, preventing double sends.
  3. **`unknown`:** If an unhandled exception or network disconnect occurs after the lock was taken, the state is persisted as `unknown`. Subsequent retries of an `unknown` state return `409 AMBIGUOUS_EXECUTION_STATE` to prevent a duplicate send, alerting the admin to verify Gmail Sent items manually.
- **Bounded Retention:** Every successful send triggers `pruneOldDeduplicationRecords()` which inspects stored properties and removes records older than 14 days or caps total properties to 150 items, preventing Script Properties quota saturation.

### 3.4 Unauthenticated Web App Invocation
- **Configuration:** In `google-apps-script/appsscript.json`:
  ```json
  {
    "timeZone": "Africa/Cairo",
    "dependencies": {},
    "exceptionLogging": "STACKDRIVER",
    "runtimeVersion": "V8",
    "webapp": {
      "executeAs": "USER_DEPLOYING",
      "access": "ANYONE_ANONYMOUS"
    }
  }
  ```
- **Execution Model & Access Distinction:** 
  - `executeAs: "USER_DEPLOYING"` ensures the script executes with the permissions and quota of `dandybeauty4@gmail.com`.
  - `access: "ANYONE_ANONYMOUS"` (UI setting: "Anyone") allows external HTTP POST requests from Vercel serverless functions without requiring an interactive Google session.
  - **Important Distinction:** If "Anyone with a Google account" (`ANYONE`) is selected instead of "Anyone" (`ANYONE_ANONYMOUS`), Google intercepts server-to-server HTTP calls with an interactive OAuth redirect login page, breaking backend dispatch.
  - **Mandatory HMAC Security:** The endpoint rejects any request without a valid HMAC-SHA256 signature generated using `GMAIL_RELAY_SECRET`. An attacker possessing only the Web App URL cannot trigger emails.

---

## 4. Canonical Statuses & Arabic Email Templates

The store strictly maintains the five approved canonical statuses:

| Status (AR) | Trigger | Subject Format |
|---|---|---|
| **جديد** | Order Creation | `تأكيد طلبك من داندي \| رقم الفاتورة {code}` |
| **قيد التجهيز** | Status -> قيد التجهيز | `طلبك قيد التجهيز بعناية في داندي \| رقم الفاتورة {code}` |
| **تم الشحن** | Status -> تم الشحن | `تم شحن طلبك من داندي وهو في طريقه إليكِ! \| {code}` |
| **تم التوصيل** | Status -> تم التوصيل | `تم توصيل طلبك بنجاح! نتمنى لكِ تجربة مميزة مع داندي \| {code}` |
| **ملغي** | Status -> ملغي | `تم إلغاء طلبك من داندي \| {code}` |

All templates feature luxury Egyptian Arabic copywriting, DANDY branding, tabular product summaries, Egyptian Pound currency formatting (`ج.م`), and clear customer support contact options.

---

## 5. Verification & Automated Test Suite Results

The automated test suite (`test/email-relay.test.mjs`) was executed via Node test runner. All 24 tests passed:

| # | Test Scenario | Status |
|---|---|---|
| 1 | `canonicalizeJson` deterministic key ordering | ✅ PASSED |
| 2 | `computeHmacSha256` 64-char hex computation | ✅ PASSED |
| 3 | `isValidEmail` accepts valid emails, rejects empty/NA/malformed | ✅ PASSED |
| 4 | `normalizeOrderStatus` standardizes 5 canonical statuses | ✅ PASSED |
| 5 | Arabic HTML template generation for all 5 statuses | ✅ PASSED |
| 6 | Missing / invalid email skips relay dispatch (`skipped_no_valid_email`) | ✅ PASSED |
| 7 | Signed POST dispatch and `accepted_by_mailapp` response handling | ✅ PASSED |
| 8 | Signature mismatch and quota exhaustion handling | ✅ PASSED |
| 9 | Network timeout classification as `unknown` | ✅ PASSED |
| 10 | `/api/order-status` rejects unauthorized requests | ✅ PASSED |
| 11 | Status unchanged skips notification generation | ✅ PASSED |
| 12 | Order creation succeeds completely if mail relay is down | ✅ PASSED |
| 13 | AST verification: `dashboard-order.astro` has NO direct client fallback writes | ✅ PASSED |
| 14 | Make.com webhook isolates Brevo email when Gmail is enabled | ✅ PASSED |
| 15 | Apps Script state machine handles `processing`, `accepted`, and `unknown` | ✅ PASSED |
| 16 | Order Status API rejects non-admin accounts even with valid token | ✅ PASSED |
| 17 | Apps Script relay rejects expired timestamps (> 5 minutes drift) | ✅ PASSED |
| 18 | Apps Script relay rejects replayed nonces within cache window | ✅ PASSED |
| 19 | Concurrent duplicate attempts while in-flight are rejected (`409`) | ✅ PASSED |
| 20 | Status updates normalize canonical Arabic statuses and format outbox | ✅ PASSED |
| 21 | `sendDiagnosticRelayEmail` sends synthetic confirmation to owner even with notifications disabled | ✅ PASSED |
| 22 | `sendDiagnosticRelayEmail` supports synthetic canonical status update test | ✅ PASSED |
| 23 | Diagnostic bypass rejects non-owner recipient (`SECURITY_VIOLATION`) | ✅ PASSED |
| 24 | Order Status API rejects `DIAGNOSTIC_SEND` without valid admin auth | ✅ PASSED |

**Test Environment Note:** All automated tests use mocked network fetches and local crypto assertions. **Zero real customer emails were sent.**

---

## 6. Secure Owner-Only End-to-End Relay Diagnostic

To allow the store owner to safely test the Apps Script relay at any time:

### 6.1 Security Invariants
1. **Firebase Admin Auth Guard:** Requires a valid Firebase Admin ID token belonging specifically to `admin@dandy.com`. Unauthorized requests return HTTP 401.
2. **Strict Recipient Lock:** Fixed to `dandybeauty4@gmail.com`. Even if an attacker or browser payload specifies another email, it is strictly ignored or rejected.
3. **No Database Side Effects:** Does not create or update orders, decrement inventory, fire Telegram bots, or invoke Make.com webhooks.
4. **Independent of Activation Flag:** Operates when `GMAIL_NOTIFICATIONS_ENABLED=false` so the owner can verify delivery prior to opening customer notifications.
5. **No Secret Leaks:** Returns structured status without exposing `GMAIL_RELAY_SECRET` or internal exception traces.

### 6.2 Invocation Methods
- **Dashboard:** Click the **✉️ فحص خادم البريد (Diagnostic)** button in `/dashboard-order`.
- **API:** Send `POST /api/order-status` with `{ "action": "DIAGNOSTIC_SEND", "testType": "ORDER_CONFIRMATION" }` and `Authorization: Bearer <ID_TOKEN>`.

---

## 7. Step-by-Step Owner Deployment Guide

To deploy this relay to the Google account `dandybeauty4@gmail.com`:

### Step 1: Generate the Shared Secret
In your terminal, run:
```bash
node scripts/generate-relay-secret.cjs
```
Copy the 64-character hexadecimal secret.

### Step 2: Create the Apps Script Project
1. Log in to [script.google.com](https://script.google.com) using `dandybeauty4@gmail.com`.
2. Click **New Project** and name it `DANDY Email Relay`.
3. In **Project Settings** (gear icon), check **Show "appsscript.json" manifest file in editor**.
4. Replace `appsscript.json` with the contents of `google-apps-script/appsscript.json`.
5. Replace `Code.gs` with the contents of `google-apps-script/Code.gs`.
6. Go to **Project Settings** > **Script Properties** > **Add script property**:
   - Property: `DANDY_RELAY_SECRET`
   - Value: *(Paste your 64-character secret)*
7. Click **Save script properties**.

### Step 3: Deploy as Web App
1. Click **Deploy** > **New deployment**.
2. Click the gear icon > Select **Web app**.
3. Configure:
   - **Description:** `DANDY Email Relay v1.1`
   - **Execute as:** `Me (dandybeauty4@gmail.com)`
   - **Who has access:** `Anyone`
4. Click **Deploy**.
5. When prompted, click **Authorize access**, choose `dandybeauty4@gmail.com`, click **Advanced**, and select **Go to DANDY Email Relay (unsafe)**. Grant the `send_mail` permission.
6. Copy the **Web App URL** (`https://script.google.com/macros/s/.../exec`).

### Step 4: Test Without Google Login (Anonymous Curl)
You can test the deployed endpoint from an incognito window or curl without being logged into Google:
```bash
SECRET="YOUR_64_CHAR_SECRET"
TIMESTAMP=$(node -e 'console.log(Date.now())')
NONCE="test_nonce_$(node -e 'console.log(Date.now())')"
NOTIF_ID="test_notif_001"
PAYLOAD='{"eventType":"ORDER_CONFIRMATION","htmlBody":"<p>اختبار من داندي</p>","invoiceCode":"TEST-001","orderId":"test_1","recipientEmail":"dandybeauty4@gmail.com","subject":"اختبار نظام الإرسال"}'
CANONICAL="${TIMESTAMP}:${NONCE}:${NOTIF_ID}:${PAYLOAD}"
SIGNATURE=$(node -e "console.log(require('crypto').createHmac('sha256', '$SECRET').update('$CANONICAL').digest('hex'))")

curl -L -X POST "YOUR_APPS_SCRIPT_URL" \
  -H "Content-Type: application/json" \
  -d "{\"timestamp\":$TIMESTAMP,\"nonce\":\"$NONCE\",\"notificationId\":\"$NOTIF_ID\",\"signature\":\"$SIGNATURE\",\"payload\":$PAYLOAD}"
```
Expected JSON response:
```json
{
  "success": true,
  "status": "accepted_by_mailapp",
  "notificationId": "test_notif_001",
  "deduplicated": false,
  "remainingQuota": 99
}
```

### Step 5: Configure Vercel & Activate
In your Vercel Project Dashboard:
1. Add Environment Variables:
   - `GMAIL_RELAY_URL`: *(Your Apps Script Web App URL)*
   - `GMAIL_RELAY_SECRET`: *(Your 64-character secret)*
   - `GMAIL_NOTIFICATIONS_ENABLED`: `true`
   - `DISABLE_MAKE_INVOICE_EMAIL`: `true`
2. In Make.com, add a filter on your scenario's Brevo invoice module:
   - Condition: `sendEmailInvoice Equal to true`
3. Redeploy the Vercel project.
