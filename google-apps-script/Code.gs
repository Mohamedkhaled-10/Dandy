/**
 * DANDY Cosmetics — Google Apps Script Mail Relay
 * 
 * Executes under owner account: dandybeauty4@gmail.com
 * Minimum OAuth Scope: https://www.googleapis.com/auth/script.send_mail
 *
 * Verifies signed requests from DANDY Vercel server using HMAC-SHA256,
 * deduplicates notification IDs using LockService and a persistent 3-state machine,
 * enforces replay protection, and dispatches transactional emails via MailApp.sendEmail().
 */

// Maximum allowed age for incoming requests (5 minutes)
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;
// Pruning threshold for notification deduplication records (14 days)
const NOTIFICATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
// In-flight processing lock age before transitioning to ambiguous 'unknown' (45 seconds)
const PROCESSING_TIMEOUT_MS = 45 * 1000;
// Maximum script properties threshold before triggering pruning
const MAX_STORED_KEYS = 200;

/**
 * HTTP POST Handler for incoming relay requests.
 * @param {Object} e - Event object containing postData.
 * @returns {TextOutput} JSON response with appropriate headers.
 */
function doPost(e) {
  try {
    // 1. Verify request payload exists
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        success: false,
        error: 'EMPTY_REQUEST',
        message: 'No request body provided'
      }, 400);
    }

    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({
        success: false,
        error: 'INVALID_JSON',
        message: 'Malformed JSON payload'
      }, 400);
    }

    const { timestamp, nonce, notificationId, signature, payload } = body || {};

    // 2. Validate mandatory envelope fields
    if (!timestamp || !nonce || !notificationId || !signature || !payload) {
      return createJsonResponse({
        success: false,
        error: 'INVALID_ENVELOPE',
        message: 'Missing mandatory signed envelope fields'
      }, 400);
    }

    // 3. Validate timestamp window (max 5 minutes skew/age)
    const now = Date.now();
    const reqTime = Number(timestamp);
    if (isNaN(reqTime) || Math.abs(now - reqTime) > MAX_REQUEST_AGE_MS) {
      return createJsonResponse({
        success: false,
        error: 'EXPIRED_OR_INVALID_TIMESTAMP',
        message: 'Timestamp is expired, too far in the future, or invalid'
      }, 401);
    }

    // 4. Retrieve shared secret from Script Properties
    const scriptProps = PropertiesService.getScriptProperties();
    const sharedSecret = scriptProps.getProperty('DANDY_RELAY_SECRET');
    if (!sharedSecret) {
      Logger.log('[DANDY Relay ERROR] DANDY_RELAY_SECRET is not configured in Script Properties.');
      return createJsonResponse({
        success: false,
        error: 'RELAY_NOT_CONFIGURED',
        message: 'Mail relay secret is not configured in Google Apps Script properties'
      }, 500);
    }

    // 5. Replay Protection: Check short-lived nonce in CacheService
    const scriptCache = CacheService.getScriptCache();
    const nonceKey = 'dandy_nonce_' + nonce;
    if (scriptCache.get(nonceKey)) {
      return createJsonResponse({
        success: false,
        error: 'REPLAYED_NONCE',
        message: 'This request nonce has already been used'
      }, 401);
    }
    // Store nonce for 10 minutes (TTL 600s)
    scriptCache.put(nonceKey, '1', 600);

    // 6. Verify HMAC-SHA256 Signature
    const canonicalPayload = canonicalizeJson(payload);
    const canonicalMessage = timestamp + ':' + nonce + ':' + notificationId + ':' + canonicalPayload;

    const expectedSignatureBytes = Utilities.computeHmacSha256Signature(canonicalMessage, sharedSecret);
    const expectedSignatureHex = bytesToHex(expectedSignatureBytes);

    if (!timingSafeEqual(signature.toLowerCase(), expectedSignatureHex.toLowerCase())) {
      return createJsonResponse({
        success: false,
        error: 'INVALID_SIGNATURE',
        message: 'HMAC signature verification failed'
      }, 401);
    }

    // 7. Validate Payload Structure & Recipient
    const { recipientEmail, subject, htmlBody, eventType } = payload;
    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      return createJsonResponse({
        success: false,
        error: 'INVALID_RECIPIENT_EMAIL',
        message: 'Recipient email is missing or improperly formatted'
      }, 400);
    }

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return createJsonResponse({
        success: false,
        error: 'MISSING_SUBJECT',
        message: 'Email subject is required'
      }, 400);
    }

    if (!htmlBody || typeof htmlBody !== 'string' || !htmlBody.trim()) {
      return createJsonResponse({
        success: false,
        error: 'MISSING_HTML_BODY',
        message: 'Email HTML content is required'
      }, 400);
    }

    // 8. Critical Section: Deduplication State Machine with Script Lock
    const lock = LockService.getScriptLock();
    const hasLock = lock.tryLock(10000); // 10-second wait for concurrency resolution
    if (!hasLock) {
      Logger.log('[DANDY Relay WARN] Lock contention timeout for notification: ' + notificationId);
      return createJsonResponse({
        success: false,
        error: 'CONCURRENT_LOCK_TIMEOUT',
        message: 'Could not acquire execution lock within timeout; retry shortly'
      }, 429);
    }

    const notifKey = 'notif_' + notificationId;

    try {
      const existingRaw = scriptProps.getProperty(notifKey);
      if (existingRaw) {
        let existingRecord;
        try {
          existingRecord = JSON.parse(existingRaw);
        } catch (e) {
          existingRecord = { status: 'unknown', t: now };
        }

        const state = existingRecord.status;

        // State A: Already accepted previously
        if (state === 'accepted_by_mailapp') {
          Logger.log('[DANDY Relay] Deduplicated notification: ' + notificationId);
          return createJsonResponse({
            success: true,
            status: 'accepted_by_mailapp',
            notificationId: notificationId,
            deduplicated: true,
            message: 'Notification was already processed and accepted by MailApp previously'
          }, 200);
        }

        // State B: Currently processing in another concurrent worker
        if (state === 'processing') {
          const age = now - (existingRecord.t || 0);
          if (age < PROCESSING_TIMEOUT_MS) {
            Logger.log('[DANDY Relay WARN] Concurrent attempt for in-flight notification: ' + notificationId);
            return createJsonResponse({
              success: false,
              status: 'processing',
              error: 'CONCURRENT_REQUEST_IN_FLIGHT',
              message: 'Notification is currently being processed by another worker'
            }, 409);
          } else {
            // Previous execution stalled/died without persisting accepted status: transition to ambiguous unknown
            Logger.log('[DANDY Relay WARN] Stalled processing transitioned to unknown for: ' + notificationId);
            scriptProps.setProperty(notifKey, JSON.stringify({ status: 'unknown', t: now, reason: 'PROCESSING_STALLED' }));
            return createJsonResponse({
              success: false,
              status: 'unknown',
              error: 'AMBIGUOUS_EXECUTION_STATE',
              message: 'Previous attempt stalled during execution; requires admin review to prevent duplicate send'
            }, 409);
          }
        }

        // State C: Ambiguous execution state from previous run
        if (state === 'unknown') {
          Logger.log('[DANDY Relay WARN] Blocked duplicate send on ambiguous notification: ' + notificationId);
          return createJsonResponse({
            success: false,
            status: 'unknown',
            error: 'AMBIGUOUS_EXECUTION_STATE',
            message: 'Notification state is ambiguous from a previous attempt; requires admin review to prevent duplicate send'
          }, 409);
        }
      }

      // Check MailApp Quota before entering processing state
      const remainingQuota = MailApp.getRemainingDailyQuota();
      if (remainingQuota <= 0) {
        Logger.log('[DANDY Relay ERROR] Daily email quota exhausted. Remaining: ' + remainingQuota);
        return createJsonResponse({
          success: false,
          error: 'QUOTA_EXHAUSTED',
          remainingQuota: 0,
          message: 'Daily MailApp email quota exhausted for this Google account'
        }, 429);
      }

      // Mark state as 'processing' FIRST to lock out concurrent workers
      scriptProps.setProperty(notifKey, JSON.stringify({
        status: 'processing',
        t: now
      }));

      // Send Email via MailApp
      try {
        MailApp.sendEmail({
          to: recipientEmail,
          subject: subject,
          htmlBody: htmlBody,
          name: 'DANDY',
          replyTo: 'dandybeauty4@gmail.com'
        });

        // Transition immediately to 'accepted_by_mailapp'
        const recordValue = JSON.stringify({
          status: 'accepted_by_mailapp',
          t: Date.now()
        });
        scriptProps.setProperty(notifKey, recordValue);

      } catch (sendErr) {
        // If MailApp threw, mark as 'unknown' so any retry is flagged as ambiguous rather than blindly re-sent
        Logger.log('[DANDY Relay ERROR] MailApp.sendEmail exception: ' + (sendErr?.message || String(sendErr)));
        scriptProps.setProperty(notifKey, JSON.stringify({
          status: 'unknown',
          t: Date.now(),
          err: String(sendErr && sendErr.message ? sendErr.message : sendErr).slice(0, 100)
        }));
        throw sendErr;
      }

      // Prune old records periodically (best-effort, within lock)
      try {
        pruneOldNotificationRecords(scriptProps, now);
      } catch (pruneErr) {
        // Ignore background pruning errors
      }

      // Safe logging (Never log customer email bodies, addresses, credentials or signatures)
      const maskedEmail = maskEmail(recipientEmail);
      Logger.log('[DANDY Relay] Success | Event: ' + (eventType || 'UNKNOWN') + ' | NotifID: ' + notificationId + ' | To: ' + maskedEmail + ' | RemainingQuota: ' + (remainingQuota - 1));

      // Truthful response: 'accepted_by_mailapp' (MailApp does not return a Gmail message ID)
      return createJsonResponse({
        success: true,
        status: 'accepted_by_mailapp',
        notificationId: notificationId,
        remainingQuota: remainingQuota - 1,
        timestamp: new Date(now).toISOString()
      }, 200);

    } finally {
      lock.releaseLock();
    }

  } catch (err) {
    Logger.log('[DANDY Relay CRITICAL] Exception: ' + (err && err.message ? err.message : String(err)));
    return createJsonResponse({
      success: false,
      error: 'RELAY_INTERNAL_ERROR',
      message: err && err.message ? err.message : 'Internal relay error'
    }, 500);
  }
}

/**
 * HTTP GET Handler — Health check for the Web App.
 */
function doGet(e) {
  return createJsonResponse({
    service: 'DANDY Google Apps Script Mail Relay',
    status: 'ACTIVE',
    owner: 'dandybeauty4@gmail.com',
    authScope: 'https://www.googleapis.com/auth/script.send_mail',
    timestamp: new Date().toISOString()
  }, 200);
}

/**
 * Deterministic JSON stringifier to guarantee identical canonical serialization.
 * @param {*} obj 
 * @returns {string}
 */
function canonicalizeJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(function(k) {
    return JSON.stringify(k) + ':' + canonicalizeJson(obj[k]);
  }).join(',') + '}';
}

/**
 * Converts signed byte array to lowercase hexadecimal string.
 * @param {number[]} bytes 
 * @returns {string}
 */
function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    const str = byte.toString(16);
    hex += str.length === 1 ? '0' + str : str;
  }
  return hex;
}

/**
 * Timing-safe string comparison to prevent side-channel timing attacks.
 * @param {string} a 
 * @param {string} b 
 * @returns {boolean}
 */
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

/**
 * Validates email format.
 * @param {string} email 
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return re.test(email.trim());
}

/**
 * Masks customer email for privacy in logs (e.g. s***a@gmail.com).
 * @param {string} email 
 * @returns {string}
 */
function maskEmail(email) {
  const parts = String(email || '').split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) return name[0] + '***@' + domain;
  return name[0] + '***' + name[name.length - 1] + '@' + domain;
}

/**
 * Helper to construct JSON response with CORS headers.
 * @param {Object} data 
 * @param {number} statusCode 
 * @returns {TextOutput}
 */
function createJsonResponse(data, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Prunes notification deduplication keys older than 14 days or when keys exceed MAX_STORED_KEYS.
 * Respects Script Properties storage limits (500KB total capacity).
 * @param {Properties} scriptProps 
 * @param {number} now 
 */
function pruneOldNotificationRecords(scriptProps, now) {
  const keys = scriptProps.getKeys();
  const notifKeys = keys.filter(k => k.startsWith('notif_'));
  if (notifKeys.length < MAX_STORED_KEYS) return;

  const records = [];
  for (let i = 0; i < notifKeys.length; i++) {
    const key = notifKeys[i];
    try {
      const val = scriptProps.getProperty(key);
      if (val) {
        const parsed = JSON.parse(val);
        const t = parsed?.t || 0;
        if (now - t > NOTIFICATION_TTL_MS) {
          scriptProps.deleteProperty(key);
        } else {
          records.push({ key: key, t: t });
        }
      }
    } catch (e) {
      scriptProps.deleteProperty(key);
    }
  }

  // If still above threshold, delete oldest entries to keep maximum 150 items
  if (records.length > 150) {
    records.sort((a, b) => a.t - b.t);
    const toDelete = records.length - 150;
    for (let j = 0; j < toDelete; j++) {
      scriptProps.deleteProperty(records[j].key);
    }
  }
}

/**
 * SAFE OWNER SETUP FUNCTION:
 * Run this function once from the Google Apps Script editor to authorize
 * the script's MailApp scope and verify remaining email quota.
 * This does NOT send any emails.
 */
function testOrAuthorize() {
  const quota = MailApp.getRemainingDailyQuota();
  const scriptProps = PropertiesService.getScriptProperties();
  const hasSecret = Boolean(scriptProps.getProperty('DANDY_RELAY_SECRET'));
  
  Logger.log('====================================================');
  Logger.log('✅ DANDY Mail Relay Authorization Status: OK');
  Logger.log('📬 MailApp Remaining Daily Quota: ' + quota + ' emails');
  Logger.log('🔑 DANDY_RELAY_SECRET Configured: ' + (hasSecret ? 'YES' : 'NO (Action Required)'));
  Logger.log('====================================================');

  return {
    authorized: true,
    quota: quota,
    secretConfigured: hasSecret
  };
}

/**
 * HELPER FOR SETTING SECRET IN SCRIPT PROPERTIES:
 * You can also run this in the editor if you prefer not using Project Settings UI:
 * e.g. setRelaySecret('your-64-char-random-secret')
 */
function setRelaySecret(secret) {
  if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
    throw new Error('Secret must be at least 32 characters long.');
  }
  PropertiesService.getScriptProperties().setProperty('DANDY_RELAY_SECRET', secret.trim());
  Logger.log('✅ DANDY_RELAY_SECRET successfully stored in Script Properties.');
}
