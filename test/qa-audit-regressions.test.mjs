import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();

function readWorkspaceFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function loadDandyOrderFlow() {
  const helperSource = readWorkspaceFile('public/assets/js/order-flow-helpers.js');
  const helperSandbox = {
    globalThis: null,
    crypto: globalThis.crypto,
    TextEncoder,
    URLSearchParams
  };
  helperSandbox.globalThis = helperSandbox;
  vm.runInNewContext(helperSource, helperSandbox);
  return helperSandbox.DandyOrderFlow;
}

function extractInlineScripts(source) {
  const scriptMatches = [...source.matchAll(/<script\b(?![^>]*\btype=["']application\/ld\+json["'])(?![^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi)];
  return scriptMatches.map((m) => m[1]).join('\n');
}

test('Order flow: 409 ORDER_IN_PROGRESS parses Retry-After header and preserves safety invariants', () => {
  const DandyOrderFlow = loadDandyOrderFlow();

  const withNumericRetryAfter = DandyOrderFlow.classifyCreateOrderOutcome({
    ok: false,
    status: 409,
    result: { error: 'ORDER_IN_PROGRESS', message: 'جاري معالجة نفس الطلب حالياً.' },
    retryAfter: 5
  });
  assert.equal(withNumericRetryAfter.action, 'ORDER_IN_PROGRESS');
  assert.equal(withNumericRetryAfter.retryAfterSeconds, 5);
  assert.match(withNumericRetryAfter.message, /5 ثوانٍ/);
  assert.equal(withNumericRetryAfter.clearCart, false);
  assert.equal(withNumericRetryAfter.keepClientRequestId, true);
  assert.equal(withNumericRetryAfter.resetTurnstile, true);
  assert.equal(withNumericRetryAfter.allowAutoRetry, false);

  const withStringRetryAfter = DandyOrderFlow.classifyCreateOrderOutcome({
    ok: false,
    status: 409,
    result: { error: 'ORDER_IN_PROGRESS' },
    retryAfter: '12'
  });
  assert.equal(withStringRetryAfter.retryAfterSeconds, 12);
  assert.match(withStringRetryAfter.message, /12 ثوانٍ/);

  const clampedRetryAfter = DandyOrderFlow.classifyCreateOrderOutcome({
    ok: false,
    status: 409,
    result: { error: 'ORDER_IN_PROGRESS' },
    retryAfter: 999
  });
  assert.equal(clampedRetryAfter.retryAfterSeconds, 120);

  const invalidRetryAfter = DandyOrderFlow.classifyCreateOrderOutcome({
    ok: false,
    status: 409,
    result: { error: 'ORDER_IN_PROGRESS' },
    retryAfter: 'invalid'
  });
  assert.equal(invalidRetryAfter.retryAfterSeconds, null);
  assert.equal(invalidRetryAfter.clearCart, false);
  assert.equal(invalidRetryAfter.keepClientRequestId, true);
});

test('BaseLayout: Firebase Auth guarded on apiKey, safe getters exposed, and overflow-x clip applied', () => {
  const baseLayout = readWorkspaceFile('src/layouts/BaseLayout.astro');
  assert.match(baseLayout, /firebaseConfig\.apiKey && String\(firebaseConfig\.apiKey\)\.trim\(\) && typeof firebase\.auth === 'function'/);
  assert.match(baseLayout, /window\.getSafeFirebaseDb\s*=/);
  assert.match(baseLayout, /window\.getSafeFirebaseAuth\s*=/);
  assert.match(baseLayout, /window\.getSafeFirebaseFirestore\s*=/);
  assert.match(baseLayout, /overflow-x:\s*clip/);
});

test('Frontend pages and components avoid unguarded bare firebase.auth/database/firestore calls', () => {
  const guardedFiles = [
    'src/components/Header.astro',
    'src/components/DashboardNav.astro',
    'src/pages/cart.astro',
    'src/pages/account-login.astro',
    'src/pages/account-signup.astro',
    'src/pages/login.astro',
    'src/pages/account.astro',
    'src/pages/index.astro',
    'src/pages/all-products.astro',
    'src/pages/special-offers.astro',
    'src/pages/client-reviews.astro',
    'src/pages/product/[...slug].astro',
    'src/pages/dashboard.astro',
    'src/pages/dashboard-order.astro',
    'src/pages/dashboard-product.astro',
    'src/pages/dashboard-blog.astro',
    'src/pages/dashboard-coupons.astro',
    'src/pages/dashboard-coupon-analytics.astro',
    'src/pages/dashboard-pink-friday.astro',
    'src/pages/dashboard-index.astro',
    'src/pages/statues.astro'
  ];

  for (const rel of guardedFiles) {
    const src = readWorkspaceFile(rel);
    assert.equal(
      src.includes('getSafeFirebaseAuth') ||
        src.includes('getSafeFirebaseDb') ||
        src.includes('getSafeFirebaseFirestore'),
      true,
      `${rel} must reference BaseLayout safe Firebase getters`
    );

    const scripts = extractInlineScripts(src);
    assert.equal(
      /const\s+(auth|db|firestore)\s*=\s*firebase\.(auth|database|firestore)\(\)/.test(scripts),
      false,
      `${rel} must not assign firebase.auth()/database()/firestore() without safe guard`
    );
  }
});

test('Turnstile scripts and widgets are gated behind non-empty turnstileSiteKey', () => {
  const turnstilePages = [
    'src/pages/cart.astro',
    'src/pages/account-login.astro',
    'src/pages/account-signup.astro'
  ];

  for (const rel of turnstilePages) {
    const src = readWorkspaceFile(rel);
    assert.match(
      src,
      /\{turnstileSiteKey\s*&&\s*<script[^>]*challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/,
      `${rel} must conditionally load Turnstile script`
    );
    assert.match(
      src,
      /\{turnstileSiteKey\s*\?\s*\(/,
      `${rel} must conditionally render .cf-turnstile widget`
    );
    assert.match(
      src,
      /خدمة التحقق الأمني \(Turnstile\) غير مهيأة/,
      `${rel} must render non-throwing Turnstile notice when sitekey is empty`
    );
  }
});

test('Checkout cart.astro: inline Step 2 validation, phone normalization, idToken-gated uid, and Retry-After handling', () => {
  const cartSrc = readWorkspaceFile('src/pages/cart.astro');
  assert.match(cartSrc, /id="step2ValidationAlert"/);
  assert.equal(/\balert\(/.test(extractInlineScripts(cartSrc)), false, 'cart.astro must not call blocking window.alert()');
  assert.match(cartSrc, /if \(!name \|\| name\.length < 2\)/);
  assert.match(cartSrc, /normalizeCartPhone\(/);
  assert.match(cartSrc, /const customerUid = \(idToken && currentAuthUser && currentAuthUser\.uid\) \? currentAuthUser\.uid : null;/);
  assert.match(cartSrc, /response\.headers\.get\('Retry-After'\)/);
  assert.match(cartSrc, /orderInProgressRetryCount >= 2/);
  assert.match(cartSrc, /id="btnResetOrderAttempt"/);
});

test('Account page: Assiut governorate option, createdAt||timestamp sorting, HTML escaping & no inline onclick XSS', () => {
  const accSrc = readWorkspaceFile('src/pages/account.astro');
  assert.match(accSrc, /<option value="Assiut">أسيوط<\/option>/);
  assert.equal(/<option value="Asyut">/.test(accSrc), false);
  assert.match(accSrc, /order\.createdAt \|\| order\.timestamp/);
  assert.match(accSrc, /function escapeHtml\(/);
  assert.equal(/onclick="deleteAddress\('\$\{/.test(accSrc), false, 'deleteAddress must use event listener + dataset, not inline onclick interpolation');
  assert.equal(/onclick="removeFromWishlist\('\$\{/.test(accSrc), false, 'removeFromWishlist must use event listener + dataset, not inline onclick interpolation');
});

test('Header search hides hidden products and escapes rendered HTML', () => {
  const headerSrc = readWorkspaceFile('src/components/Header.astro');
  assert.match(headerSrc, /isHidden === true \|\| p\.isHidden === 'true'/);
  assert.match(headerSrc, /function escapeHtml\(/);
  assert.match(headerSrc, /escapeHtml\(pLink\)/);
});

test('Dashboard Order & Blog: serverCommitted hoisted before try/catch and blog table XSS-hardened', () => {
  const orderDash = readWorkspaceFile('src/pages/dashboard-order.astro');
  const changeStatusIdx = orderDash.indexOf('window.changeOrderStatus');
  assert.ok(changeStatusIdx !== -1, 'changeOrderStatus must exist');
  const sliceAfterFn = orderDash.slice(changeStatusIdx, changeStatusIdx + 1200);
  const letIdx = sliceAfterFn.indexOf('let serverCommitted = false;');
  const tryIdx = sliceAfterFn.indexOf('try {');
  assert.ok(letIdx !== -1 && tryIdx !== -1 && letIdx < tryIdx, 'let serverCommitted = false must be declared before try {');

  const blogDash = readWorkspaceFile('src/pages/dashboard-blog.astro');
  assert.match(blogDash, /escapeBlogHtml/);
  assert.equal(/onclick="editArticle\('\$\{/.test(blogDash), false);
  assert.equal(/onclick="deleteArticle\('\$\{/.test(blogDash), false);
});

test('Account login & auth pages: safe DOM text rendering and non-blocking login validation', () => {
  const accLogin = readWorkspaceFile('src/pages/account-login.astro');
  assert.match(accLogin, /createTextNode/);
  const accSignup = readWorkspaceFile('src/pages/account-signup.astro');
  assert.match(accSignup, /createTextNode/);
  const adminLogin = readWorkspaceFile('src/pages/login.astro');
  assert.equal(/\balert\(/.test(extractInlineScripts(adminLogin)), false, 'login.astro must not use window.alert()');
  assert.match(adminLogin, /showAdminLoginNotice/);
});

test('Responsive layout CSS and placeholder image src invariants', () => {
  const dashNav = readWorkspaceFile('src/components/DashboardNav.astro');
  assert.match(dashNav, /min-width:\s*0;/);

  const pfDash = readWorkspaceFile('src/pages/dashboard-pink-friday.astro');
  assert.match(pfDash, /grid-template-columns:\s*380px minmax\(0,\s*1fr\);/);
  assert.match(pfDash, /\.pf-left-col,\s*\.pf-right-col\s*\{\s*min-width:\s*0;/);
  assert.match(pfDash, /id="heroPreviewImg"[^>]*src="data:image\/gif;base64,/);

  const prodDash = readWorkspaceFile('src/pages/dashboard-product.astro');
  assert.match(prodDash, /id="imagePreview"[^>]*src="data:image\/gif;base64,/);

  const homePage = readWorkspaceFile('src/pages/index.astro');
  assert.match(homePage, /id="homeLightboxImg"[^>]*src="data:image\/gif;base64,/);
});
