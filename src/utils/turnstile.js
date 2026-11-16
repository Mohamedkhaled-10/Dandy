// src/utils/turnstile.js

export async function verifyTurnstileToken(token, clientIp = null) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    console.error('Security alert: TURNSTILE_SECRET_KEY is not defined in environment');
    return { success: false, error: 'SERVER_MISCONFIGURATION', message: 'مفتاح التحقق السري غير مهيأ' };
  }

  if (!token || typeof token !== 'string') {
    return { success: false, error: 'MISSING_CAPTCHA_TOKEN', message: 'رمز التحقق (CAPTCHA) مفقود أو غير صالح' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (clientIp) {
      formData.append('remoteip', clientIp);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const data = await res.json();
    if (data.success) {
      return { success: true, data };
    } else {
      console.warn('Turnstile verification rejected token:', data['error-codes']);
      return {
        success: false,
        error: 'CAPTCHA_FAILED',
        errorCodes: data['error-codes'] || [],
        message: 'فشل التحقق الأمني من الكابتشا. يرجى إعادة المحاولة.'
      };
    }
  } catch (err) {
    console.error('Error verifying Turnstile token:', err);
    return { success: false, error: 'VERIFY_REQUEST_FAILED', message: 'تعذر الاتصال بخدمة التحقق الأمني.' };
  }
}
