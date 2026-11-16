// public/assets/js/order-flow-helpers.js
// Shared browser + Node-testable pure helpers for DANDY Group 3A secure customer order flow.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DandyOrderFlow = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CHECKOUT_ATTEMPT_STORAGE_KEY = 'dandy_checkout_attempt_v1';
  var INVOICE_SESSION_STORAGE_KEY = 'dandy_invoice_access_session_v1';
  var INVOICE_SESSION_INVALIDATED_KEY = 'dandy_invoice_access_invalidated_v1';
  var RECENT_LOOKUPS_STORAGE_KEY = 'dandy_recent_lookups';
  var untrustedInvoiceStorages = typeof WeakSet === 'function' ? new WeakSet() : null;
  var UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var TOKEN_FORMAT_REGEX = /^[A-Za-z0-9_-]{32,64}$/;
  var INVOICE_CODE_REGEX = /^DNY-[A-Z0-9-]{3,24}$/;

  function isPlainObject(val) {
    return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
  }

  function isValidUuidV4(val) {
    return typeof val === 'string' && UUID_V4_REGEX.test(val.trim());
  }

  function isValidInvoiceToken(token) {
    return typeof token === 'string' && TOKEN_FORMAT_REGEX.test(token.trim());
  }

  function generateUuidV4(cryptoObj) {
    var c = cryptoObj || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (c && typeof c.randomUUID === 'function') {
      return c.randomUUID();
    }
    if (c && typeof c.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < bytes.length; i++) {
        hex.push(bytes[i].toString(16).padStart(2, '0'));
      }
      return (
        hex.slice(0, 4).join('') +
        '-' +
        hex.slice(4, 6).join('') +
        '-' +
        hex.slice(6, 8).join('') +
        '-' +
        hex.slice(8, 10).join('') +
        '-' +
        hex.slice(10, 16).join('')
      );
    }
    throw new Error('Secure random UUID generator unavailable in browser');
  }

  function normalizeArabicDigits(raw) {
    return String(raw).replace(/[٠-٩]/g, function (d) {
      return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    });
  }

  function normalizeEgyptianPhoneClient(rawPhone) {
    if (typeof rawPhone !== 'string') return null;
    var converted = normalizeArabicDigits(rawPhone).trim();
    if (!converted) return null;
    var digits = converted.replace(/[^0-9]/g, '');
    if (digits.indexOf('0020') === 0) {
      digits = '0' + digits.slice(4);
    } else if (digits.indexOf('20') === 0 && digits.length === 12) {
      digits = '0' + digits.slice(2);
    } else if (digits.length === 10 && digits.charAt(0) === '1') {
      digits = '0' + digits;
    }
    if (!/^01[0125][0-9]{8}$/.test(digits)) {
      return null;
    }
    return digits;
  }

  function canonicalizeJsonValue(val) {
    if (val === null || val === undefined) return null;
    if (Array.isArray(val)) {
      return val.map(canonicalizeJsonValue);
    }
    if (typeof val === 'object') {
      var out = {};
      var keys = Object.keys(val).sort();
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = val[k];
        if (v !== undefined) {
          out[k] = canonicalizeJsonValue(v);
        }
      }
      return out;
    }
    if (typeof val === 'number' && !Number.isFinite(val)) {
      return null;
    }
    return val;
  }

  function canonicalizeItemForFingerprint(item) {
    if (!isPlainObject(item)) return {};
    var copy = {};
    var keys = Object.keys(item);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'timestamp' || k === 'turnstileToken') continue;
      copy[k] = item[k];
    }
    return canonicalizeJsonValue(copy);
  }

  function buildCanonicalOrderFingerprintInput(input) {
    var safe = isPlainObject(input) ? input : {};
    var rawPhone = typeof safe.phone === 'string' ? safe.phone : '';
    var normalizedPhone = normalizeEgyptianPhoneClient(rawPhone) || rawPhone.trim();
    var rawEmail = typeof safe.email === 'string' ? safe.email.trim() : '';
    var normalizedEmail = rawEmail && rawEmail !== 'N/A' ? rawEmail.toLowerCase() : 'n/a';
    var rawCoupon = typeof safe.couponCode === 'string' ? safe.couponCode.trim().toUpperCase() : '';
    var normalizedCouponCode = rawCoupon ? rawCoupon : null;

    return canonicalizeJsonValue({
      name: typeof safe.name === 'string' ? safe.name.trim() : '',
      phone: normalizedPhone,
      email: normalizedEmail,
      governorate: typeof safe.governorate === 'string' ? safe.governorate.trim() : '',
      city: typeof safe.city === 'string' ? safe.city.trim() : '',
      address: typeof safe.address === 'string' ? safe.address.trim() : '',
      customerId: safe.customerId ? String(safe.customerId) : null,
      couponCode: normalizedCouponCode,
      items: Array.isArray(safe.items) ? safe.items.map(canonicalizeItemForFingerprint) : []
    });
  }

  async function computeLocalOrderFingerprintHex(input, cryptoObj) {
    var c = cryptoObj || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    var canonicalPayload = buildCanonicalOrderFingerprintInput(input);
    var jsonStr = JSON.stringify(canonicalPayload);
    if (!c || !c.subtle || typeof c.subtle.digest !== 'function') {
      throw new Error('Web Crypto subtle.digest unavailable');
    }
    var encoder = new TextEncoder();
    var digestBuf = await c.subtle.digest('SHA-256', encoder.encode(jsonStr));
    var bytes = new Uint8Array(digestBuf);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  function getSafeSessionStorage(rootObj) {
    var target =
      arguments.length > 0
        ? rootObj
        : typeof window !== 'undefined'
          ? window
          : null;
    if (!target) return null;
    try {
      return target.sessionStorage || null;
    } catch (_) {
      return null;
    }
  }

  function safeStorageGet(storageObj, key) {
    if (!storageObj || typeof storageObj.getItem !== 'function') return null;
    try {
      return storageObj.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeStorageSet(storageObj, key, value) {
    if (!storageObj || typeof storageObj.setItem !== 'function') return false;
    try {
      storageObj.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function safeStorageRemove(storageObj, key) {
    if (
      !storageObj ||
      typeof storageObj.removeItem !== 'function' ||
      typeof storageObj.getItem !== 'function'
    ) {
      return false;
    }
    try {
      storageObj.removeItem(key);
    } catch (_) {
      return false;
    }
    try {
      var remaining = storageObj.getItem(key);
      return remaining === null || remaining === undefined;
    } catch (_) {
      return false;
    }
  }

  function safeStorageSetAndVerify(storageObj, key, value) {
    if (
      !storageObj ||
      typeof storageObj.setItem !== 'function' ||
      typeof storageObj.getItem !== 'function'
    ) {
      return { ok: false, reason: 'STORAGE_UNAVAILABLE', cleaned: false };
    }
    try {
      storageObj.setItem(key, value);
    } catch (_) {
      var cleanedAfterWriteError = safeStorageRemove(storageObj, key);
      return {
        ok: false,
        reason: 'STORAGE_WRITE_FAILED',
        cleaned: cleanedAfterWriteError
      };
    }
    try {
      var readBack = storageObj.getItem(key);
      if (readBack !== value) {
        var cleanedAfterMismatch = safeStorageRemove(storageObj, key);
        return {
          ok: false,
          reason: 'STORAGE_VERIFY_FAILED',
          cleaned: cleanedAfterMismatch
        };
      }
      return { ok: true, cleaned: true };
    } catch (_) {
      var cleanedAfterReadError = safeStorageRemove(storageObj, key);
      return {
        ok: false,
        reason: 'STORAGE_READ_FAILED',
        cleaned: cleanedAfterReadError
      };
    }
  }

  function resolveCheckoutAttemptState(sessionStorageObj, fingerprintHash, cryptoObj) {
    var cleanHash = typeof fingerprintHash === 'string' ? fingerprintHash.trim() : '';
    if (!cleanHash) {
      return {
        ok: false,
        clientRequestId: null,
        fingerprintHash: '',
        reused: false,
        persisted: false,
        reason: 'INVALID_FINGERPRINT'
      };
    }

    if (
      !sessionStorageObj ||
      typeof sessionStorageObj.getItem !== 'function' ||
      typeof sessionStorageObj.setItem !== 'function'
    ) {
      return {
        ok: false,
        clientRequestId: null,
        fingerprintHash: cleanHash,
        reused: false,
        persisted: false,
        reason: 'STORAGE_UNAVAILABLE'
      };
    }

    var rawStored = null;
    try {
      rawStored = sessionStorageObj.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
    } catch (_) {
      return {
        ok: false,
        clientRequestId: null,
        fingerprintHash: cleanHash,
        reused: false,
        persisted: false,
        reason: 'STORAGE_READ_FAILED'
      };
    }

    if (rawStored) {
      try {
        var parsed = JSON.parse(rawStored);
        if (
          isPlainObject(parsed) &&
          isValidUuidV4(parsed.clientRequestId) &&
          typeof parsed.fingerprintHash === 'string' &&
          parsed.fingerprintHash === cleanHash
        ) {
          var existingId = parsed.clientRequestId.trim();
          var verifiedExisting = safeStorageSetAndVerify(
            sessionStorageObj,
            CHECKOUT_ATTEMPT_STORAGE_KEY,
            JSON.stringify({
              clientRequestId: existingId,
              fingerprintHash: cleanHash
            })
          );
          if (!verifiedExisting.ok) {
            return {
              ok: false,
              clientRequestId: null,
              fingerprintHash: cleanHash,
              reused: false,
              persisted: false,
              reason: verifiedExisting.reason
            };
          }
          return {
            ok: true,
            clientRequestId: existingId,
            fingerprintHash: cleanHash,
            reused: true,
            persisted: true
          };
        }
      } catch (_) {
        // Invalid stored record; rotate cleanly below
      }
    }

    var newId = null;
    try {
      newId = generateUuidV4(cryptoObj);
    } catch (_) {
      return {
        ok: false,
        clientRequestId: null,
        fingerprintHash: cleanHash,
        reused: false,
        persisted: false,
        reason: 'UUID_UNAVAILABLE'
      };
    }

    if (!isValidUuidV4(newId)) {
      return {
        ok: false,
        clientRequestId: null,
        fingerprintHash: cleanHash,
        reused: false,
        persisted: false,
        reason: 'UUID_UNAVAILABLE'
      };
    }

    // Persist ONLY { clientRequestId, fingerprintHash } — zero PII or raw items
    var serializedAttempt = JSON.stringify({
      clientRequestId: newId,
      fingerprintHash: cleanHash
    });
    var writeCheck = safeStorageSetAndVerify(
      sessionStorageObj,
      CHECKOUT_ATTEMPT_STORAGE_KEY,
      serializedAttempt
    );
    if (!writeCheck.ok) {
      return {
        ok: false,
        clientRequestId: null,
        fingerprintHash: cleanHash,
        reused: false,
        persisted: false,
        reason: writeCheck.reason
      };
    }

    return {
      ok: true,
      clientRequestId: newId,
      fingerprintHash: cleanHash,
      reused: false,
      persisted: true
    };
  }

  async function prepareCheckoutIdempotency(params) {
    var safe = isPlainObject(params) ? params : {};
    var orderInput = safe.orderInput;
    var sessionStorageObj = safe.sessionStorage;
    var cryptoObj = safe.cryptoObj;

    var fingerprintHash = '';
    try {
      fingerprintHash = await computeLocalOrderFingerprintHex(orderInput, cryptoObj);
    } catch (_) {
      return {
        ok: false,
        clientRequestId: null,
        fingerprintHash: '',
        reused: false,
        persisted: false,
        reason: 'FINGERPRINT_UNAVAILABLE',
        message:
          'متصفحك الحالي لا يدعم التحقق الأمني المطلوب لتأكيد الطلب دون تكرار (Web Crypto). تم الحفاظ على سلتكِ كما هي؛ يرجى استخدام متصفح حديث أو تفعيل الاتصال الآمن (HTTPS) ثم المحاولة مرة أخرى.'
      };
    }

    var attemptState = resolveCheckoutAttemptState(sessionStorageObj, fingerprintHash, cryptoObj);
    if (
      !attemptState ||
      !attemptState.ok ||
      !attemptState.persisted ||
      !isValidUuidV4(attemptState.clientRequestId)
    ) {
      return {
        ok: false,
        clientRequestId: null,
        fingerprintHash: fingerprintHash,
        reused: false,
        persisted: false,
        reason: (attemptState && attemptState.reason) || 'STORAGE_PERSIST_FAILED',
        message:
          'تعذر حفظ معرّف تأكيد الطلب في تخزين الجلسة بالمتصفح (قد يكون التصفح الخاص مفعّلاً أو تم حظر التخزين المؤقت). تم الحفاظ على سلتكِ بأمان ولم يتم إرسال الطلب؛ يرجى السماح بتخزين الجلسة ثم الضغط على «تأكيد وإتمام الطلب» مرة أخرى.'
      };
    }

    return {
      ok: true,
      clientRequestId: attemptState.clientRequestId,
      fingerprintHash: attemptState.fingerprintHash,
      reused: Boolean(attemptState.reused),
      persisted: true
    };
  }

  function clearCheckoutAttemptState(sessionStorageObj) {
    return safeStorageRemove(sessionStorageObj, CHECKOUT_ATTEMPT_STORAGE_KEY);
  }

  function classifyCreateOrderOutcome(params) {
    var status = params && typeof params.status === 'number' ? params.status : 0;
    var ok = Boolean(params && params.ok);
    var result = params && isPlainObject(params.result) ? params.result : {};
    var networkError = Boolean(params && params.networkError);

    if (networkError) {
      return {
        action: 'TRANSIENT_KEEP_ID',
        clearCart: false,
        clearAttempt: false,
        keepClientRequestId: true,
        resetTurnstile: true,
        allowAutoRetry: false,
        message: 'تعذر الاتصال بالخادم أثناء تأكيد الطلب. تم الحفاظ على بيانات سلتكِ بأمان، يرجى إعادة التحقق الأمني والمحاولة مرة أخرى.'
      };
    }

    if (ok && status >= 200 && status < 300 && result.success) {
      if (isValidInvoiceToken(result.invoiceAccessToken)) {
        return {
          action: 'SUCCESS_REDIRECT',
          clearCart: true,
          clearAttempt: true,
          keepClientRequestId: false,
          resetTurnstile: false,
          allowAutoRetry: false,
          redirectUrl: '/invoice#access=' + encodeURIComponent(result.invoiceAccessToken.trim()),
          invoiceCode: typeof result.invoiceCode === 'string' ? result.invoiceCode : '',
          orderId: typeof result.orderId === 'string' ? result.orderId : ''
        };
      }

      return {
        action: 'MISSING_INVOICE_TOKEN',
        clearCart: false,
        clearAttempt: false,
        keepClientRequestId: true,
        resetTurnstile: true,
        allowAutoRetry: false,
        message: 'تم استلام رد غير مكتمل لتأكيد رابط الفاتورة. لم يتم مسح سلتكِ ويمكنكِ إعادة المحاولة بأمان دون إنشاء طلب مكرر.'
      };
    }

    var errCode = typeof result.error === 'string' ? result.error : '';

    if (status === 409) {
      if (errCode === 'ORDER_IN_PROGRESS') {
        return {
          action: 'ORDER_IN_PROGRESS',
          clearCart: false,
          clearAttempt: false,
          keepClientRequestId: true,
          resetTurnstile: true,
          allowAutoRetry: false,
          message:
            result.message ||
            'جاري معالجة نفس الطلب حالياً. يرجى الانتظار بضع ثوانٍ ثم إعادة التحقق الأمني والمحاولة مرة أخرى لتأكيد الفاتورة.'
        };
      }

      if (errCode === 'IDEMPOTENCY_CONFLICT') {
        return {
          action: 'IDEMPOTENCY_CONFLICT',
          clearCart: false,
          clearAttempt: false,
          keepClientRequestId: false,
          resetTurnstile: true,
          allowAutoRetry: false,
          requireNewAttempt: true,
          message:
            'تغيّرت بيانات الطلب مقارنة بمحاولة سابقة لنفس المعرف. يرجى مراجعة بياناتكِ ثم الضغط على «بدء محاولة طلب جديدة».'
        };
      }

      if (errCode === 'IDEMPOTENCY_KEY_EXPIRED') {
        return {
          action: 'IDEMPOTENCY_KEY_EXPIRED',
          clearCart: false,
          clearAttempt: false,
          keepClientRequestId: false,
          resetTurnstile: true,
          allowAutoRetry: false,
          requireManualVerification: true,
          message:
            'انتهت صلاحية محاولة الطلب الحالية. قد يكون طلبكِ السابق قد اكتمل بالفعل؛ يرجى التحقق من بريدكِ الإلكتروني أو صفحة تتبع الطلب قبل إنشاء طلب جديد.'
        };
      }
    }

    if (status === 503) {
      return {
        action: 'TRANSIENT_KEEP_ID',
        clearCart: false,
        clearAttempt: false,
        keepClientRequestId: true,
        resetTurnstile: true,
        allowAutoRetry: false,
        message:
          result.message ||
          'الخدمة مزدحمة أو غير متاحة مؤقتاً. تم الحفاظ على بيانات الطلب وسلتكِ، يرجى المحاولة بعد قليل.'
      };
    }

    if (status === 429) {
      return {
        action: 'RATE_LIMITED_KEEP_ID',
        clearCart: false,
        clearAttempt: false,
        keepClientRequestId: true,
        resetTurnstile: true,
        allowAutoRetry: false,
        message:
          result.message ||
          'تم إرسال عدة محاولات متقاربة. يرجى الانتظار دقيقة ثم إكمال التحقق الأمني والمحاولة مرة أخرى.'
      };
    }

    if (
      status === 403 ||
      errCode === 'CAPTCHA_FAILED' ||
      errCode === 'CAPTCHA_REQUIRED' ||
      errCode === 'TURNSTILE_FAILED'
    ) {
      return {
        action: 'CAPTCHA_FAILED_KEEP_ID',
        clearCart: false,
        clearAttempt: false,
        keepClientRequestId: true,
        resetTurnstile: true,
        allowAutoRetry: false,
        message:
          result.message ||
          'انتهت صلاحية التحقق الأمني (CAPTCHA) أو فشل التحقق. يرجى إكماله مرة أخرى ثم إعادة الإرسال.'
      };
    }

    return {
      action: 'ERROR_KEEP_STATE',
      clearCart: false,
      clearAttempt: false,
      keepClientRequestId: true,
      resetTurnstile: true,
      allowAutoRetry: false,
      message: result.message || 'حدث خطأ أثناء تنفيذ الطلب. يرجى مراجعة البيانات والمحاولة مرة أخرى.'
    };
  }

  function extractHashAccessToken(hashStr) {
    if (typeof hashStr !== 'string' || !hashStr) return null;
    var cleanHash = hashStr.charAt(0) === '#' ? hashStr.substring(1) : hashStr;
    if (!cleanHash) return null;
    var candidate = null;
    if (cleanHash.indexOf('=') !== -1) {
      var hp = new URLSearchParams(cleanHash);
      candidate = hp.get('access') || hp.get('token');
    } else if (cleanHash.length >= 32) {
      candidate = cleanHash;
    }
    return candidate && candidate.trim() ? candidate.trim() : null;
  }

  function resolveInvoiceAccessToken(hashStr, sessionStorageObj) {
    var fromHashToken = extractHashAccessToken(hashStr);
    if (fromHashToken) {
      var writeCheck = safeStorageSetAndVerify(
        sessionStorageObj,
        INVOICE_SESSION_STORAGE_KEY,
        fromHashToken
      );
      if (writeCheck.ok) {
        if (untrustedInvoiceStorages && sessionStorageObj && typeof sessionStorageObj === 'object') {
          untrustedInvoiceStorages.delete(sessionStorageObj);
        }
        safeStorageRemove(sessionStorageObj, INVOICE_SESSION_INVALIDATED_KEY);
        return {
          token: fromHashToken,
          source: 'hash',
          persisted: true,
          staleCleaned: true,
          storageTrusted: true,
          shouldStripHash: true,
          stripHashAfterRender: false
        };
      }

      var staleCleaned = Boolean(writeCheck.cleaned);
      if (!staleCleaned && sessionStorageObj && typeof sessionStorageObj === 'object') {
        if (untrustedInvoiceStorages) {
          untrustedInvoiceStorages.add(sessionStorageObj);
        }
        var staleRemaining = safeStorageGet(sessionStorageObj, INVOICE_SESSION_STORAGE_KEY);
        if (staleRemaining && staleRemaining.trim() && staleRemaining.trim() !== fromHashToken) {
          safeStorageSetAndVerify(
            sessionStorageObj,
            INVOICE_SESSION_INVALIDATED_KEY,
            staleRemaining.trim()
          );
        }
      }

      return {
        token: fromHashToken,
        source: 'hash',
        persisted: false,
        staleCleaned: staleCleaned,
        storageTrusted: staleCleaned,
        shouldStripHash: false,
        stripHashAfterRender: true
      };
    }

    if (
      untrustedInvoiceStorages &&
      sessionStorageObj &&
      typeof sessionStorageObj === 'object' &&
      untrustedInvoiceStorages.has(sessionStorageObj)
    ) {
      return {
        token: null,
        source: 'none',
        persisted: false,
        storageTrusted: false,
        shouldStripHash: false,
        stripHashAfterRender: false
      };
    }

    var stored = safeStorageGet(sessionStorageObj, INVOICE_SESSION_STORAGE_KEY);
    if (stored && stored.trim()) {
      var cleanStored = stored.trim();
      var invalidatedVal = safeStorageGet(sessionStorageObj, INVOICE_SESSION_INVALIDATED_KEY);
      if (invalidatedVal && invalidatedVal.trim() === cleanStored) {
        safeStorageRemove(sessionStorageObj, INVOICE_SESSION_STORAGE_KEY);
        return {
          token: null,
          source: 'none',
          persisted: false,
          storageTrusted: false,
          shouldStripHash: false,
          stripHashAfterRender: false
        };
      }

      return {
        token: cleanStored,
        source: 'session',
        persisted: true,
        storageTrusted: true,
        shouldStripHash: false,
        stripHashAfterRender: false
      };
    }

    return {
      token: null,
      source: 'none',
      persisted: false,
      shouldStripHash: false,
      stripHashAfterRender: false
    };
  }

  function clearInvoiceSessionToken(sessionStorageObj) {
    if (untrustedInvoiceStorages && sessionStorageObj && typeof sessionStorageObj === 'object') {
      untrustedInvoiceStorages.delete(sessionStorageObj);
    }
    safeStorageRemove(sessionStorageObj, INVOICE_SESSION_INVALIDATED_KEY);
    return safeStorageRemove(sessionStorageObj, INVOICE_SESSION_STORAGE_KEY);
  }

  function classifyPublicInvoiceResponse(params) {
    var status = params && typeof params.status === 'number' ? params.status : 0;
    var ok = Boolean(params && params.ok);
    var data = params && isPlainObject(params.data) ? params.data : {};
    var networkError = Boolean(params && params.networkError);

    if (!networkError && ok && data.success && isPlainObject(data.order)) {
      return {
        action: 'RENDER_INVOICE',
        order: data.order,
        clearSessionToken: false,
        stripHash: false,
        showRetry: false
      };
    }

    if (!networkError && status === 404) {
      return {
        action: 'INVALID_OR_NOT_FOUND',
        clearSessionToken: true,
        stripHash: true,
        showRetry: false,
        title: 'رابط الفاتورة غير صالح أو انتهت صلاحيته',
        message:
          'لم نتمكن من التحقق من رابط الفاتورة. يمكنكِ مراجعة الرابط المرسل إلى بريدكِ الإلكتروني أو متابعة حالة الطلب عبر صفحة تتبع الطلب.'
      };
    }

    if (!networkError && status === 429) {
      return {
        action: 'RATE_LIMITED',
        clearSessionToken: false,
        stripHash: false,
        showRetry: true,
        title: 'تم تجاوز الحد المسموح مؤقتاً',
        message: 'يرجى الانتظار قليلاً ثم الضغط على «إعادة المحاولة» لعرض فاتورتكِ.'
      };
    }

    if (!networkError && status === 503) {
      return {
        action: 'SERVICE_UNAVAILABLE',
        clearSessionToken: false,
        stripHash: false,
        showRetry: true,
        title: 'الخدمة غير متاحة مؤقتاً',
        message: 'تعذر عرض الفاتورة مؤقتاً بسبب ضغط على الخادم. يرجى المحاولة بعد قليل.'
      };
    }

    return {
      action: 'TRANSIENT_ERROR',
      clearSessionToken: false,
      stripHash: false,
      showRetry: true,
      title: 'تعذر تحميل الفاتورة مؤقتاً',
      message: 'حدث خطأ أثناء الاتصال بالخادم. يرجى إعادة المحاولة.'
    };
  }

  function normalizeInvoiceCodeClient(rawCode) {
    if (typeof rawCode !== 'string') return null;
    var clean = rawCode.trim().toUpperCase();
    if (clean.length < 5 || clean.length > 28) return null;
    return INVOICE_CODE_REGEX.test(clean) ? clean : null;
  }

  function sanitizeRecentLookupsList(rawList, maxItems) {
    var cap = typeof maxItems === 'number' && maxItems > 0 ? maxItems : 4;
    if (!Array.isArray(rawList)) {
      return { list: [], changed: rawList !== null && rawList !== undefined };
    }

    var changed = false;
    var seen = {};
    var cleaned = [];

    for (var i = 0; i < rawList.length; i++) {
      var entry = rawList[i];
      if (!isPlainObject(entry) || typeof entry.code !== 'string') {
        changed = true;
        continue;
      }

      if ('phone' in entry || Object.keys(entry).length > 2) {
        changed = true;
      }

      var code = entry.code.trim().toUpperCase();
      if (!code || seen[code]) {
        changed = true;
        continue;
      }

      seen[code] = true;
      var ts = typeof entry.time === 'number' && Number.isFinite(entry.time) ? entry.time : Date.now();
      if (code !== entry.code || ts !== entry.time) {
        changed = true;
      }
      cleaned.push({ code: code, time: ts });
      if (cleaned.length >= cap) {
        if (i < rawList.length - 1) changed = true;
        break;
      }
    }

    return { list: cleaned, changed: changed };
  }

  function loadAndMigrateRecentLookups(localStorageObj, maxItems) {
    var rawStr = safeStorageGet(localStorageObj, RECENT_LOOKUPS_STORAGE_KEY);
    if (!rawStr) return [];
    try {
      var parsed = JSON.parse(rawStr);
      var res = sanitizeRecentLookupsList(parsed, maxItems);
      if (res.changed) {
        safeStorageSet(localStorageObj, RECENT_LOOKUPS_STORAGE_KEY, JSON.stringify(res.list));
      }
      return res.list;
    } catch (_) {
      safeStorageRemove(localStorageObj, RECENT_LOOKUPS_STORAGE_KEY);
      return [];
    }
  }

  function saveRecentLookupCode(localStorageObj, code, maxItems) {
    var cleanCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (!cleanCode) return loadAndMigrateRecentLookups(localStorageObj, maxItems);
    var current = loadAndMigrateRecentLookups(localStorageObj, maxItems);
    var filtered = current.filter(function (item) {
      return item.code !== cleanCode;
    });
    filtered.unshift({ code: cleanCode, time: Date.now() });
    var res = sanitizeRecentLookupsList(filtered, maxItems);
    safeStorageSet(localStorageObj, RECENT_LOOKUPS_STORAGE_KEY, JSON.stringify(res.list));
    return res.list;
  }

  function extractTrackOrderUrlParams(searchStr) {
    var params = new URLSearchParams(typeof searchStr === 'string' ? searchStr : '');
    var rawCode = params.get('code') || params.get('invoice') || '';
    var rawPhone = params.get('phone') || '';
    var hasPhoneParam = params.has('phone');
    var code = rawCode ? rawCode.trim().toUpperCase() : '';
    var phone = rawPhone ? rawPhone.trim() : '';

    var cleanParams = new URLSearchParams();
    if (code) {
      cleanParams.set('code', code);
    }
    var cleanQuery = cleanParams.toString();

    return {
      code: code,
      phone: phone,
      hasPhoneParam: hasPhoneParam,
      shouldStripPhone: hasPhoneParam,
      cleanedRelativeSearch: cleanQuery ? '?' + cleanQuery : ''
    };
  }

  function classifyTrackOrderError(params) {
    var status = params && typeof params.status === 'number' ? params.status : 0;
    var data = params && isPlainObject(params.data) ? params.data : {};
    var networkError = Boolean(params && params.networkError);

    if (networkError) {
      return 'حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى.';
    }
    if (status === 404) {
      // Uniform anti-enumeration message: never distinguish between bad code and wrong phone
      return 'تعذر العثور على الطلب أو بيانات التحقق غير مطابقة. يرجى التأكد من كود الفاتورة ورقم الهاتف.';
    }
    if (status === 400) {
      return data.message || 'يرجى إدخال كود الفاتورة الصحيح ورقم هاتف مصري صحيح مكون من 11 رقمًا.';
    }
    if (status === 429) {
      return 'تم تجاوز الحد المسموح من محاولات التتبع مؤقتًا. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.';
    }
    if (status === 503) {
      return 'خدمة تتبع الطلبات غير متاحة مؤقتًا، يرجى المحاولة بعد قليل.';
    }
    return data.message || 'حدث خطأ أثناء تتبع الطلب. يرجى المحاولة مرة أخرى.';
  }

  /**
   * Refreshes Firebase user verification state when needed and forces a fresh ID token
   * (`getIdToken(true)`) before calling `/api/link-customer-orders`.
   * Never throws or blocks customer account usage or checkout if linking fails.
   */
  async function syncVerifiedCustomerOrdersLink(params) {
    var safe = isPlainObject(params) ? params : {};
    var user = safe.user;
    if (!user || !user.uid) {
      return { attempted: false, reason: 'NO_USER' };
    }

    var sessionStorageObj =
      safe.sessionStorage !== undefined
        ? safe.sessionStorage
        : getSafeSessionStorage(typeof window !== 'undefined' ? window : globalThis);
    var fetchFn =
      typeof safe.fetchFn === 'function'
        ? safe.fetchFn
        : typeof fetch === 'function'
          ? fetch
          : null;
    var onLinkedOrders = typeof safe.onLinkedOrders === 'function' ? safe.onLinkedOrders : null;
    var endpoint =
      typeof safe.endpoint === 'string' && safe.endpoint.trim()
        ? safe.endpoint.trim()
        : '/api/link-customer-orders';

    var linkSessionKey = 'dandy_orders_linked_' + String(user.uid);
    var alreadyLinked = safeStorageGet(sessionStorageObj, linkSessionKey);
    if (alreadyLinked === '1') {
      return { attempted: false, deduplicated: true, reason: 'ALREADY_LINKED_IN_SESSION' };
    }

    if (user.emailVerified !== true && typeof user.reload === 'function') {
      try {
        var reloaded = await user.reload();
        if (reloaded && typeof reloaded === 'object' && reloaded.uid) {
          user = reloaded;
        }
      } catch (_) {
        return { attempted: false, reason: 'RELOAD_FAILED' };
      }
    }

    if (user.emailVerified !== true) {
      return { attempted: false, reason: 'EMAIL_NOT_VERIFIED' };
    }

    if (!fetchFn || typeof user.getIdToken !== 'function') {
      return { attempted: false, reason: 'DEPENDENCIES_UNAVAILABLE' };
    }

    try {
      var freshIdToken = await user.getIdToken(true);
      if (!freshIdToken || typeof freshIdToken !== 'string') {
        return { attempted: false, reason: 'MISSING_FRESH_TOKEN' };
      }

      var linkRes = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: freshIdToken })
      });

      var linkData = {};
      try {
        if (linkRes && typeof linkRes.json === 'function') {
          linkData = (await linkRes.json()) || {};
        }
      } catch (_) {
        linkData = {};
      }

      if (linkRes && linkRes.ok && linkData.success) {
        safeStorageSet(sessionStorageObj, linkSessionKey, '1');
        var linkedCount = Number(linkData.linkedCount) || 0;
        if (linkedCount > 0 && onLinkedOrders) {
          try {
            await onLinkedOrders(linkData);
          } catch (_) {}
        }
        return {
          attempted: true,
          ok: true,
          linkedCount: linkedCount,
          data: linkData
        };
      }

      return {
        attempted: true,
        ok: false,
        status: linkRes ? linkRes.status : 0,
        error: linkData && linkData.error ? linkData.error : 'LINK_REQUEST_FAILED'
      };
    } catch (_) {
      return {
        attempted: true,
        ok: false,
        status: 0,
        error: 'NETWORK_OR_TOKEN_ERROR'
      };
    }
  }

  return {
    CHECKOUT_ATTEMPT_STORAGE_KEY: CHECKOUT_ATTEMPT_STORAGE_KEY,
    INVOICE_SESSION_STORAGE_KEY: INVOICE_SESSION_STORAGE_KEY,
    RECENT_LOOKUPS_STORAGE_KEY: RECENT_LOOKUPS_STORAGE_KEY,
    isValidUuidV4: isValidUuidV4,
    isValidInvoiceToken: isValidInvoiceToken,
    generateUuidV4: generateUuidV4,
    normalizeEgyptianPhoneClient: normalizeEgyptianPhoneClient,
    canonicalizeJsonValue: canonicalizeJsonValue,
    buildCanonicalOrderFingerprintInput: buildCanonicalOrderFingerprintInput,
    computeLocalOrderFingerprintHex: computeLocalOrderFingerprintHex,
    resolveCheckoutAttemptState: resolveCheckoutAttemptState,
    prepareCheckoutIdempotency: prepareCheckoutIdempotency,
    clearCheckoutAttemptState: clearCheckoutAttemptState,
    classifyCreateOrderOutcome: classifyCreateOrderOutcome,
    extractHashAccessToken: extractHashAccessToken,
    resolveInvoiceAccessToken: resolveInvoiceAccessToken,
    clearInvoiceSessionToken: clearInvoiceSessionToken,
    getSafeSessionStorage: getSafeSessionStorage,
    safeStorageSetAndVerify: safeStorageSetAndVerify,
    safeStorageRemove: safeStorageRemove,
    classifyPublicInvoiceResponse: classifyPublicInvoiceResponse,
    normalizeInvoiceCodeClient: normalizeInvoiceCodeClient,
    sanitizeRecentLookupsList: sanitizeRecentLookupsList,
    loadAndMigrateRecentLookups: loadAndMigrateRecentLookups,
    saveRecentLookupCode: saveRecentLookupCode,
    extractTrackOrderUrlParams: extractTrackOrderUrlParams,
    classifyTrackOrderError: classifyTrackOrderError,
    syncVerifiedCustomerOrdersLink: syncVerifiedCustomerOrdersLink
  };
});
