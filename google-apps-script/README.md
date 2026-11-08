# DANDY Google Apps Script Mail Relay Deployment Guide

This guide describes how to deploy, configure, and verify the Google Apps Script Mail Relay for **DANDY Cosmetics** (`https://dandy-ebon.vercel.app`).

---

## 1. Architecture Overview

```
Vercel Server-Side API (Order Created / Status Changed)
   │
   ▼
Firebase Realtime Database (Outbox Record: notifications_outbox/)
   │
   ▼
Signed HTTPS POST (HMAC-SHA256, Timestamp & Nonce)
   │
   ▼
Google Apps Script Web App (Executes as dandybeauty4@gmail.com)
   │
   ├── 1. Acquire Script Lock (LockService)
   ├── 2. Verify HMAC-SHA256 signature
   ├── 3. Enforce 5-minute replay window & Nonce cache
   ├── 4. Check 3-state deduplication (processing / accepted_by_mailapp / unknown)
   ├── 5. Check daily email quota
   ▼
MailApp.sendEmail() [Scope: https://www.googleapis.com/auth/script.send_mail]
   │
   ▼
Customer Inbox (Sender: DANDY, Reply-To: dandybeauty4@gmail.com)
```

---

## 2. Why Google Apps Script Instead of Gmail API OAuth?

1. **No Custom Domain Requirement:** Google Cloud blocks OAuth verification for unverified subdomains like `vercel.app`. Apps Script runs directly inside the owner's Google account without domain verification roadblocks.
2. **Zero Maintenance & Free:** Uses the official Google Apps Script `MailApp` service (100–1,500 daily email quota depending on account tier).
3. **Strict Minimum Permissions:** Requests only `https://www.googleapis.com/auth/script.send_mail`. It **cannot** read inbox emails, search messages, access Google Drive, Contacts, or Sheets.
4. **Security by Cryptography:** Protected by an HMAC-SHA256 digital signature, 5-minute replay window, and per-request nonce tracking.

---

## 3. Step-by-Step Deployment Instructions

### Step 1: Generate a Strong Shared Secret

From the root of the project, run:
```bash
node scripts/generate-relay-secret.cjs
```
This generates a 64-character (256-bit) cryptographically secure random string.  
Keep this secret handy—you will enter it into both Google Apps Script and Vercel.

---

### Step 2: Open Google Apps Script

1. In your browser, make sure you are logged in as **`dandybeauty4@gmail.com`**.
2. Navigate to [https://script.google.com/](https://script.google.com/).
3. Click **New project** (مشروع جديد).
4. In the top-left, rename the project to:  
   **`DANDY Email Relay`**

---

### Step 3: Configure Project Manifest (`appsscript.json`)

1. In the Apps Script editor, open the left sidebar and click **Project Settings** (إعدادات المشروع ⚙️).
2. Check the box: **Show "appsscript.json" manifest file in editor** (إظهار ملف البيان في المحرر).
3. In the left file list, click on **`appsscript.json`**.
4. Replace its entire contents with the code from `google-apps-script/appsscript.json`:
   ```json
   {
     "timeZone": "Africa/Cairo",
     "dependencies": {},
     "exceptionLogging": "STACKDRIVER",
     "runtimeVersion": "V8",
     "webapp": {
       "executeAs": "USER_DEPLOYING",
       "access": "ANYONE_ANONYMOUS"
     },
     "oauthScopes": [
       "https://www.googleapis.com/auth/script.send_mail"
     ]
   }
   ```
5. Click **Save** (Ctrl+S / Cmd+S).

---

### Step 4: Paste Relay Code (`Code.gs`)

1. In the left file list, click on **`Code.gs`**.
2. Delete any existing default text.
3. Paste the entire content of `google-apps-script/Code.gs`.
4. Click **Save**.

---

### Step 5: Store the Relay Secret in Script Properties

1. In the left sidebar, click **Project Settings** (⚙️).
2. Scroll down to **Script Properties** (خصائص النص البرمجي).
3. Click **Add script property** (إضافة خاصية):
   - **Property:** `DANDY_RELAY_SECRET`
   - **Value:** *(Paste the 64-character secret generated in Step 1)*
4. Click **Save script properties**.

*(Alternative method: In `Code.gs`, you can run `setRelaySecret('YOUR_SECRET')` once in the script editor).*

---

### Step 6: Authorize the Script

1. Return to the editor (`< > Code`).
2. At the top toolbar, select the function dropdown and choose **`testOrAuthorize`**.
3. Click **Run** (تشغيل ▶).
4. Google will prompt: **Authorization Required** (التفويض مطلوب).
5. Click **Review Permissions** (مراجعة الأذونات):
   - Choose your account: `dandybeauty4@gmail.com`.
   - If a warning screen appears ("Google hasn't verified this app"), click **Advanced** (خيارات متقدمة) → **Go to DANDY Email Relay (unsafe)**.
   - Note the single permission requested: *"Send email on your behalf"* (`script.send_mail`).
   - Click **Allow** (سماح).
6. View the Execution Log at the bottom. You should see:
   ```
   ✅ DANDY Mail Relay Authorization Status: OK
   📬 MailApp Remaining Daily Quota: 100 emails
   🔑 DANDY_RELAY_SECRET Configured: YES
   ```

---

### Step 7: Deploy as Web App

1. In the top-right corner, click **Deploy** (نشر) → **New deployment** (نشر جديد).
2. In the modal, click the gear icon (⚙️ Select type) next to "Select type" and choose **Web app** (تطبيق ويب).
3. Fill in the deployment configuration:
   - **Description:** `Production Mail Relay v1.1`
   - **Execute as:** `Me (dandybeauty4@gmail.com)` — *(Crucial: must execute as the owner account so it sends as DANDY and uses the owner's quota)*
   - **Who has access:** `Anyone` (الجميع) — *(Maps to `webapp.access: "ANYONE_ANONYMOUS"` in `appsscript.json`).*  
     ⚠️ **CRITICAL DISTINCTION:** Select **"Anyone"** (`ANYONE_ANONYMOUS`), **DO NOT** select "Anyone with a Google account" (`ANYONE`).  
     - `ANYONE_ANONYMOUS`: Allows server-to-server HTTP POST calls from Vercel without requiring an interactive Google account login.
     - `ANYONE`: Requires an interactive browser session with a Google login cookie; serverless backend calls from Node.js/Vercel will fail with a redirect to Google Accounts.
4. Click **Deploy**.
5. Copy the generated **Web App URL** (ends in `/exec`).  
   Example:
   `https://script.google.com/macros/s/AKfycb.../exec`

---

## 4. Anonymous / Unauthenticated Invocation Verification & Security

Because Vercel serverless APIs call this endpoint server-to-server without an interactive Google session, the Web App must be deployed with:
- **Execute as:** `Me (dandybeauty4@gmail.com)`
- **Who has access:** `Anyone` (`ANYONE_ANONYMOUS`)

### Why is Anonymous Access Secure?
Allowing anonymous HTTP invocation does **NOT** mean anyone can send spam or trigger emails:
1. **Mandatory HMAC-SHA256:** Every single request payload must be signed using the 256-bit `DANDY_RELAY_SECRET`.
2. **Replay Protection:** Every request requires an RFC timestamp verified within ±5 minutes of server time and a unique nonce cached in memory.
3. **Idempotency:** Duplicate notification IDs are deduplicated or rejected.
4. An unauthenticated public caller who sends an unsigned or invalidly signed request receives an immediate HTTP 401/403 rejection.

### How to Test Anonymous Access (Without Google Login)

Open a terminal or incognito window without any Google login session:

#### Test 1: Anonymous GET Health Check
```bash
curl -s -L "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
```
**Expected Response:**
```json
{"service":"DANDY Google Apps Script Mail Relay","status":"ACTIVE","owner":"dandybeauty4@gmail.com","authScope":"https://www.googleapis.com/auth/script.send_mail",...}
```
*(Note: Google Apps Script Web Apps issue an HTTP 302 Found redirect to a temporary googleusercontent URL. The `-L` flag tells curl to follow redirects, which Node's `fetch()` does automatically by default).*

#### Test 2: Unsigned / Bad Signature Rejection
```bash
curl -s -L -X POST "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{"timestamp":1700000000000,"nonce":"test","notificationId":"test","signature":"bad_signature","payload":{}}'
```
**Expected Response:**
```json
{"success":false,"error":"EXPIRED_OR_INVALID_TIMESTAMP","message":"Timestamp is expired, too far in the future, or invalid"}
```
*(Demonstrates that anonymous public callers cannot send emails without the shared HMAC secret).*

---

## 5. Deduplication State Machine & LockService Concurrency

`Code.gs` implements concurrency protection and a strict 3-state machine using `LockService.getScriptLock()`:

| State | Description | Behavior on Subsequent Request |
|---|---|---|
| **`processing`** | Set immediately upon lock acquisition prior to calling `MailApp`. | If under 45s, rejected with `409 CONCURRENT_REQUEST_IN_FLIGHT`. If older than 45s (stalled worker), transitions to `unknown`. |
| **`accepted_by_mailapp`** | Set immediately after `MailApp.sendEmail()` completes. | Cleanly deduplicated with `200 OK` (`deduplicated: true`). No duplicate email sent. |
| **`unknown`** | Set if `MailApp` threw an error or the worker crashed mid-flight. | Rejected with `409 AMBIGUOUS_EXECUTION_STATE`. Never blindly re-sent; requires admin review. |

### Storage Retention & Pruning
Script Properties has a 500 KB limit. `pruneOldNotificationRecords()` runs within the lock:
- Triggers when properties exceed `MAX_STORED_KEYS = 200`.
- Deletes records older than 14 days.
- Trims oldest records to maintain maximum 150 items.

---

## 6. Duplicate Prevention with Legacy Make/Brevo Scenario

To ensure that customers do **not** receive duplicate invoice emails from both the new Gmail Relay and the old Make.com scenario (Brevo):

1. **Automatic Isolation:** In `create-order.js`, whenever `GMAIL_NOTIFICATIONS_ENABLED === 'true'`, the payload dispatched to `MAKE_WEBHOOK_URL` automatically includes:
   ```json
   {
     "sendEmailInvoice": false,
     "skipEmailNotification": true,
     "disableBrevoEmail": true,
     "emailProvider": "GMAIL_RELAY"
   }
   ```
2. **Make Scenario Filter:** In Make.com, configure a filter on the Brevo email module:
   `Condition: sendEmailInvoice Equal to true`
3. **Manual Override Flag:** If the owner wishes to disable the Make/Brevo email immediately during staging before activating Gmail, set in Vercel:
   `DISABLE_MAKE_INVOICE_EMAIL=true`
4. **Safe Default:** `GMAIL_NOTIFICATIONS_ENABLED=false` remains the default until owner verification is complete.

---

## 7. Configuring Vercel Environment Variables

In your Vercel Project Dashboard (or `.env.local` for local staging):

| Variable Name | Value | Default | Description |
|---|---|---|---|
| `GMAIL_RELAY_URL` | `https://script.google.com/macros/s/.../exec` | — | Web App `/exec` URL from Step 7 |
| `GMAIL_RELAY_SECRET` | `64-character-hex-secret` | — | Same secret set in Script Properties |
| `GMAIL_NOTIFICATIONS_ENABLED` | `false` | `false` | Set to `true` only after owner test email |
| `DISABLE_MAKE_INVOICE_EMAIL` | `true` | `false` | Disables Brevo email step in Make scenario |

---

## 8. Secure Owner-Only Relay Diagnostic (Staging Verification)

To allow the store owner to verify the entire pipeline end-to-end without enabling customer emails or risking customer notifications:

### Security Guardrails:
- **Authentication:** Requires a valid Firebase Admin ID token from `admin@dandy.com`. Unauthorized users receive HTTP 401.
- **Fixed Recipient:** The recipient is strictly hardcoded to `dandybeauty4@gmail.com`. The API completely ignores any recipient passed in the request body.
- **Zero Database Side Effects:** Does not create or update any Firebase order, decrement product stock, trigger Telegram alerts, or invoke Make.com webhooks.
- **Available while Inactive:** Functions even while `GMAIL_NOTIFICATIONS_ENABLED=false` so the owner can test without exposing customer orders.
- **Safe Output:** Returns remaining MailApp quota and state without revealing `GMAIL_RELAY_SECRET` or internal exception stack traces.

### How to Invoke:

#### Option A: One-Click from Admin Orders Dashboard
1. Log in to the DANDY dashboard (`/dashboard-order`) as `admin@dandy.com`.
2. In the top action bar, click **✉️ فحص خادم البريد (Diagnostic)**.
3. Confirm the test prompt.
4. The dashboard will trigger the diagnostic and display a response card with the delivery state (`accepted_by_mailapp`) and remaining daily quota. Check your `dandybeauty4@gmail.com` inbox for the test email!

#### Option B: Via Authenticated API Call
```bash
ID_TOKEN="YOUR_FIREBASE_ADMIN_ID_TOKEN"

curl -X POST "https://dandy-ebon.vercel.app/api/order-status" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "DIAGNOSTIC_SEND", "testType": "ORDER_CONFIRMATION"}'
```

**Successful Response:**
```json
{
  "success": true,
  "diagnostic": {
    "mode": "DIAGNOSTIC_TEST",
    "relayStatus": "accepted_by_mailapp",
    "testType": "ORDER_CONFIRMATION",
    "recipient": "dandybeauty4@gmail.com",
    "notificationId": "notif_diag_1700000000000",
    "remainingDailyQuota": 99,
    "relayConfigured": true,
    "timestamp": 1700000000000,
    "customerNotificationsActive": false,
    "message": "Accepted by MailApp"
  }
}
```

