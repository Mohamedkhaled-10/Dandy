/**
 * DANDY COSMETICS — CUSTOMER AUTH CLIENT CONTROLLER (PHASE 8)
 * Powers /account-login and /account-signup cleanly while preserving all
 * Firebase Auth, RTDB, Cloudflare Turnstile, and API contracts.
 */

import { getIconSvg } from './icons';
import {
  mapFirebaseAuthError,
  validateLoginInput,
  validateSignupInput,
} from './account';

function getRuntimeLocale(): 'ar' | 'en' {
  if (typeof document !== 'undefined') {
    const lang = (document.documentElement.getAttribute('lang') || '').trim().toLowerCase();
    if (lang.startsWith('en')) return 'en';
  }
  if (typeof window !== 'undefined') {
    const p = (window.location.pathname || '/').toLowerCase();
    if (p === '/en' || p.startsWith('/en/')) return 'en';
  }
  return 'ar';
}

declare global {
  interface Window {
    auth?: any;
    db?: any;
    turnstile?: {
      getResponse: () => string;
      reset: () => void;
    };
  }
}

function getFirebaseAuth(): any {
  if (typeof window === 'undefined') return null;
  if (window.auth) return window.auth;
  const fb = (window as any).firebase;
  return fb && typeof fb.auth === 'function' ? fb.auth() : null;
}

function getFirebaseDb(): any {
  if (typeof window === 'undefined') return null;
  if (window.db) return window.db;
  const fb = (window as any).firebase;
  return fb && typeof fb.database === 'function' ? fb.database() : null;
}

function getTurnstileToken(): string {
  if (typeof window !== 'undefined' && window.turnstile) {
    try {
      const token = window.turnstile.getResponse();
      if (token) return token;
    } catch {
      // fallback to hidden input below
    }
  }
  const hidden = document.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
  return hidden?.value || '';
}

function resetTurnstile(): void {
  if (typeof window !== 'undefined' && window.turnstile) {
    try {
      window.turnstile.reset();
    } catch {
      // ignore widget reset edge cases
    }
  }
}

function setBanner(el: HTMLElement | null, text: string, type: 'error' | 'success'): void {
  if (!el) return;
  el.className = `dandy-auth-alert ${type}`;
  el.innerHTML = '';
  const iconWrap = document.createElement('span');
  iconWrap.setAttribute('aria-hidden', 'true');
  iconWrap.innerHTML = getIconSvg(type === 'error' ? 'alert-circle' : 'check-circle', {
    size: 17,
    strokeWidth: 2,
  });
  const textSpan = document.createElement('span');
  textSpan.textContent = text;
  el.appendChild(iconWrap);
  el.appendChild(textSpan);
}

function clearBanner(el: HTMLElement | null): void {
  if (!el) return;
  el.className = 'dandy-auth-alert';
  el.innerHTML = '';
}

export function initPasswordToggles(root: ParentNode = document): void {
  const isEn = getRuntimeLocale() === 'en';
  const toggles = root.querySelectorAll<HTMLButtonElement>('[data-dandy-pw-toggle]');
  toggles.forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';

    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;
      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (!input) return;

      const isCurrentlyHidden = input.type === 'password';
      input.type = isCurrentlyHidden ? 'text' : 'password';
      btn.setAttribute('aria-pressed', isCurrentlyHidden ? 'true' : 'false');
      btn.setAttribute(
        'aria-label',
        isEn
          ? isCurrentlyHidden
            ? 'Hide password'
            : 'Show password'
          : isCurrentlyHidden
            ? 'إخفاء كلمة المرور'
            : 'إظهار كلمة المرور'
      );
      btn.innerHTML = getIconSvg(isCurrentlyHidden ? 'eye-off' : 'eye', {
        size: 18,
        strokeWidth: 1.85,
      });
    });
  });
}

export function initCustomerLoginPage(): void {
  const form = document.getElementById('customerLoginForm') as HTMLFormElement | null;
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  const locale = getRuntimeLocale();
  const isEn = locale === 'en';
  const accountHref = isEn ? '/en/account' : '/account';

  initPasswordToggles(document);

  const auth = getFirebaseAuth();
  const submitBtn = document.getElementById('loginSubmitBtn') as HTMLButtonElement | null;
  const submitLabel = submitBtn?.querySelector<HTMLElement>('[data-submit-label]') || null;
  const forgotBtn = document.getElementById('forgotPassBtn') as HTMLButtonElement | null;
  const alertBox = document.getElementById('loginAlert');
  const emailInput = document.getElementById('cl-email') as HTMLInputElement | null;
  const passInput = document.getElementById('cl-pass') as HTMLInputElement | null;
  const rememberCheckbox = document.getElementById('rememberMeCheckbox') as HTMLInputElement | null;

  try {
    const savedEmail = localStorage.getItem('dandy_saved_email');
    if (savedEmail && emailInput) {
      emailInput.value = savedEmail;
      if (rememberCheckbox) rememberCheckbox.checked = true;
    }
  } catch {
    // ignore storage errors
  }

  if (auth && typeof auth.onAuthStateChanged === 'function') {
    auth.onAuthStateChanged((user: { email?: string } | null) => {
      if (user && user.email !== 'admin@dandy.com') {
        window.location.href = accountHref;
      }
    });
  }

  forgotBtn?.addEventListener('click', async () => {
    clearBanner(alertBox);
    const email = emailInput?.value.trim() || '';
    if (!email || !email.includes('@')) {
      setBanner(
        alertBox,
        isEn
          ? 'Please enter your email address first, then click "Forgot password?".'
          : 'يرجى كتابة بريدكِ الإلكتروني في الحقل أولاً، ثم الضغط على "نسيتِ كلمة السر؟".',
        'error'
      );
      emailInput?.focus();
      return;
    }
    if (!auth) {
      setBanner(
        alertBox,
        isEn ? 'Unable to reach account services. Please reload the page.' : 'تعذر الاتصال بخدمة الحسابات. يرجى إعادة تحميل الصفحة.',
        'error'
      );
      return;
    }

    try {
      forgotBtn.disabled = true;
      forgotBtn.textContent = isEn ? 'Sending...' : 'جاري الإرسال...';
      await auth.sendPasswordResetEmail(email);
      setBanner(
        alertBox,
        isEn
          ? `Password reset link sent to (${email}). Please check your inbox or spam folder.`
          : `تم إرسال رابط إعادة تعيين كلمة المرور إلى (${email}). يرجى مراجعة البريد الوارد أو الرسائل غير المرغوب فيها.`,
        'success'
      );
      window.DandyToast?.show({
        message: isEn ? 'Password reset link sent to your email.' : 'تم إرسال رابط استعادة كلمة المرور إلى بريدكِ الإلكتروني.',
        type: 'success',
      });
    } catch (err: any) {
      setBanner(alertBox, mapFirebaseAuthError(err?.code, 'reset', locale), 'error');
    } finally {
      forgotBtn.disabled = false;
      forgotBtn.textContent = isEn ? 'Forgot password?' : 'نسيتِ كلمة السر؟';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearBanner(alertBox);

    const validation = validateLoginInput(
      {
        email: emailInput?.value,
        password: passInput?.value,
      },
      locale
    );

    if (!validation.valid) {
      setBanner(alertBox, validation.error || (isEn ? 'Please check the details entered.' : 'يرجى التحقق من البيانات المدخلة.'), 'error');
      if (!emailInput?.value.trim()) {
        emailInput?.focus();
      } else {
        passInput?.focus();
      }
      return;
    }

    if (!auth) {
      setBanner(
        alertBox,
        isEn ? 'Unable to connect to authentication service. Please reload.' : 'تعذر الاتصال بخدمة التحقق. يرجى إعادة تحميل الصفحة.',
        'error'
      );
      return;
    }

    const turnstileToken = getTurnstileToken();
    if (!turnstileToken) {
      setBanner(
        alertBox,
        isEn ? 'Please complete the human verification check (CAPTCHA) first.' : 'يرجى إكمال اختبار التحقق البشري (CAPTCHA) أولاً.',
        'error'
      );
      return;
    }

    try {
      if (rememberCheckbox?.checked) {
        localStorage.setItem('dandy_saved_email', validation.email);
      } else {
        localStorage.removeItem('dandy_saved_email');
      }
    } catch {
      // ignore storage errors
    }

    if (submitBtn) submitBtn.disabled = true;
    const prevLabel = submitLabel?.textContent || (isEn ? 'Sign In' : 'تسجيل الدخول');
    if (submitLabel) submitLabel.textContent = isEn ? 'Signing in...' : 'جاري تسجيل الدخول...';

    try {
      const verifyRes = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: turnstileToken,
          action: 'login',
          email: validation.email,
        }),
      });

      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !verifyData.success) {
        setBanner(
          alertBox,
          isEn
            ? 'Security CAPTCHA check failed. Please try again.'
            : verifyData.message || 'فشل التحقق الأمني من الكابتشا. يرجى المحاولة مرة أخرى.',
          'error'
        );
        resetTurnstile();
        if (submitBtn) submitBtn.disabled = false;
        if (submitLabel) submitLabel.textContent = prevLabel;
        return;
      }

      await auth.signInWithEmailAndPassword(validation.email, validation.password);
      setBanner(
        alertBox,
        isEn ? 'Signed in successfully! Redirecting to your account...' : 'تم تسجيل الدخول بنجاح! جاري تحويلكِ إلى حسابكِ...',
        'success'
      );
      window.setTimeout(() => {
        window.location.href = accountHref;
      }, 450);
    } catch (err: any) {
      fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'report-failed-login',
          email: validation.email,
          reason: err?.code || 'invalid_credentials',
        }),
      }).catch(() => {});

      resetTurnstile();
      setBanner(alertBox, mapFirebaseAuthError(err?.code, 'login', locale), 'error');
      if (submitBtn) submitBtn.disabled = false;
      if (submitLabel) submitLabel.textContent = prevLabel;
    }
  });
}

export function initCustomerSignupPage(): void {
  const form = document.getElementById('signupForm') as HTMLFormElement | null;
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  const locale = getRuntimeLocale();
  const isEn = locale === 'en';
  const accountHref = isEn ? '/en/account' : '/account';

  initPasswordToggles(document);

  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  const submitBtn = document.getElementById('signupSubmitBtn') as HTMLButtonElement | null;
  const submitLabel = submitBtn?.querySelector<HTMLElement>('[data-submit-label]') || null;
  const alertBox = document.getElementById('signupAlert');
  const nameInput = document.getElementById('c-name') as HTMLInputElement | null;
  const phoneInput = document.getElementById('c-phone') as HTMLInputElement | null;
  const emailInput = document.getElementById('c-email') as HTMLInputElement | null;
  const passInput = document.getElementById('c-pass') as HTMLInputElement | null;

  if (auth && typeof auth.onAuthStateChanged === 'function') {
    auth.onAuthStateChanged((user: { email?: string } | null) => {
      if (user && user.email !== 'admin@dandy.com') {
        window.location.href = accountHref;
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearBanner(alertBox);

    const validation = validateSignupInput(
      {
        name: nameInput?.value,
        phone: phoneInput?.value,
        email: emailInput?.value,
        password: passInput?.value,
      },
      locale
    );

    if (!validation.valid) {
      setBanner(
        alertBox,
        validation.error || (isEn ? 'Please verify the details entered.' : 'يرجى التحقق من البيانات المدخلة.'),
        'error'
      );
      if (validation.field === 'name') nameInput?.focus();
      if (validation.field === 'phone') phoneInput?.focus();
      if (validation.field === 'email') emailInput?.focus();
      if (validation.field === 'password') passInput?.focus();
      return;
    }

    if (!auth || !db) {
      setBanner(
        alertBox,
        isEn ? 'Unable to connect to the database. Please reload the page.' : 'تعذر الاتصال بقاعدة البيانات. يرجى إعادة تحميل الصفحة.',
        'error'
      );
      return;
    }

    const turnstileToken = getTurnstileToken();
    if (!turnstileToken) {
      setBanner(
        alertBox,
        isEn ? 'Please complete the security CAPTCHA check first.' : 'يرجى التحقق من اختبار الكابتشا (CAPTCHA) أولاً.',
        'error'
      );
      return;
    }

    const { name, phone, email, password } = validation.sanitized;

    if (submitBtn) submitBtn.disabled = true;
    const prevLabel = submitLabel?.textContent || (isEn ? 'Create Account' : 'إنشاء الحساب');
    if (submitLabel) submitLabel.textContent = isEn ? 'Creating account...' : 'جاري إنشاء الحساب...';

    try {
      const verifyRes = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: turnstileToken,
          action: 'signup',
          email,
        }),
      });

      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !verifyData.success) {
        setBanner(
          alertBox,
          isEn
            ? 'Security CAPTCHA check failed. Please try again.'
            : verifyData.message || 'فشل التحقق الأمني من الكابتشا. يرجى المحاولة مرة أخرى.',
          'error'
        );
        resetTurnstile();
        if (submitBtn) submitBtn.disabled = false;
        if (submitLabel) submitLabel.textContent = prevLabel;
        return;
      }

      const cred = await auth.createUserWithEmailAndPassword(email, password);
      const uid = cred.user.uid;
      const fb = (window as any).firebase;

      await db.ref(`customers/${uid}`).set({
        name,
        email,
        phone,
        createdAt: fb?.database?.ServerValue?.TIMESTAMP || Date.now(),
      });

      try {
        const idToken = await cred.user.getIdToken();
        await fetch('/api/link-customer-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, phone }),
        });
      } catch (linkErr) {
        console.warn('Orders link notice:', linkErr);
      }

      setBanner(
        alertBox,
        isEn ? 'Account created! Redirecting to your account...' : 'تم إنشاء الحساب بنجاح! جاري تحويلكِ إلى لوحة حسابكِ...',
        'success'
      );
      window.setTimeout(() => {
        window.location.href = accountHref;
      }, 550);
    } catch (err: any) {
      resetTurnstile();
      setBanner(alertBox, mapFirebaseAuthError(err?.code, 'signup', locale), 'error');
      if (submitBtn) submitBtn.disabled = false;
      if (submitLabel) submitLabel.textContent = prevLabel;
    }
  });
}
