import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_lUswI9jr.mjs";
import { t as createComponent } from "./compiler_BZhHLwe9.mjs";
import { t as $$BaseLayout } from "./BaseLayout_TSlOutx5.mjs";
//#region src/pages/account-login.astro
var account_login_exports = /* @__PURE__ */ __exportAll({
	default: () => $$AccountLogin,
	file: () => $$file,
	url: () => $$url
});
var $$AccountLogin = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "تسجيل دخول العميلة | Dandy",
		"description": "سجّلي الدخول إلى حسابك في داندي لمتابعة طلباتك، تعديل عناوين الشحن، ومشاهدة قائمتك المفضلة."
	}, {
		"default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<main class="account-auth-container container" id="loginMain"><div class="account-auth-box" id="loginCard"><span class="auth-icon"><i class="fas fa-user-circle"></i></span><h1>تسجيل الدخول</h1><p class="auth-subtitle">أهلاً بكِ مجدداً في داندي! سجّلي دخولكِ للوصول إلى حسابكِ</p><div id="loginAlert" class="auth-alert-msg" role="alert"></div><form id="customerLoginForm" novalidate><div class="auth-form-group"><label for="cl-email">البريد الإلكتروني</label><input type="email" id="cl-email" name="email" placeholder="example@gmail.com" required dir="ltr" style="text-align: right;" autocomplete="email"></div><div class="auth-form-group"><label for="cl-pass">كلمة المرور</label><input type="password" id="cl-pass" name="password" placeholder="••••••••" required autocomplete="current-password"></div><div class="auth-row-actions"><button type="button" id="forgotPassBtn" class="btn-forgot-pass">نسيتِ كلمة السر؟</button></div><button type="submit" id="loginSubmitBtn" class="btn-auth-submit"><span>تسجيل الدخول</span><i class="fas fa-sign-in-alt"></i></button></form><div class="auth-switch-link">ليس لديكِ حساب بعد؟ <a href="/account-signup">إنشاء حساب جديد</a></div></div></main><script>
    (function() {
      const auth = window.auth || (typeof firebase !== 'undefined' ? firebase.auth() : null);

      const form = document.getElementById('customerLoginForm');
      const submitBtn = document.getElementById('loginSubmitBtn');
      const forgotBtn = document.getElementById('forgotPassBtn');
      const alertBox = document.getElementById('loginAlert');
      const emailInput = document.getElementById('cl-email');
      const passInput = document.getElementById('cl-pass');

      function showAlert(text, type = 'error') {
        if (!alertBox) return;
        alertBox.className = 'auth-alert-msg ' + type;
        alertBox.innerHTML = (type === 'error' ? '<i class="fas fa-exclamation-circle"></i> ' : '<i class="fas fa-check-circle"></i> ') + text;
      }

      function clearAlert() {
        if (!alertBox) return;
        alertBox.className = 'auth-alert-msg';
        alertBox.innerHTML = '';
      }

      // توجيه تلقائي إذا كانت العميلة مسجلة دخولها بالفعل
      if (auth) {
        auth.onAuthStateChanged(function(user) {
          if (user && user.email !== 'admin@dandy.com') {
            window.location.href = '/account';
          }
        });
      }

      // معالجة "نسيت كلمة السر"
      if (forgotBtn) {
        forgotBtn.addEventListener('click', async function() {
          clearAlert();
          const email = emailInput?.value.trim();
          if (!email || !email.includes('@')) {
            showAlert('يرجى كتابة بريدكِ الإلكتروني في الحقل أولاً، ثم اضغطي على "نسيتِ كلمة السر؟".', 'error');
            emailInput?.focus();
            return;
          }

          try {
            forgotBtn.disabled = true;
            forgotBtn.textContent = 'جاري الإرسال...';
            await auth.sendPasswordResetEmail(email);
            showAlert('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدكِ الإلكتروني (' + email + ') بنجاح. تفقدي صندوق الوارد أو البريد غير المرغوب فيه (Spam).', 'success');
          } catch (err) {
            console.error('Password reset error:', err);
            let msg = 'تعذر إرسال رابط إعادة التعيين. يرجى التأكد من صحة البريد الإلكتروني.';
            if (err.code === 'auth/user-not-found') {
              msg = 'هذا البريد الإلكتروني غير مسجل لدينا.';
            }
            showAlert(msg, 'error');
          } finally {
            forgotBtn.disabled = false;
            forgotBtn.textContent = 'نسيتِ كلمة السر؟';
          }
        });
      }

      // تسجيل الدخول
      if (form) {
        form.addEventListener('submit', async function(e) {
          e.preventDefault();
          clearAlert();

          const email = emailInput?.value.trim();
          const password = passInput?.value.trim();

          if (!email || !email.includes('@')) {
            showAlert('يرجى إدخال بريد إلكتروني صالح.');
            return;
          }
          if (!password) {
            showAlert('يرجى إدخال كلمة المرور.');
            return;
          }

          if (!auth) {
            showAlert('تعذر الاتصال بخدمة التحقق. يرجى إعادة تحميل الصفحة.');
            return;
          }

          submitBtn.disabled = true;
          const originalBtnHTML = submitBtn.innerHTML;
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تسجيل الدخول...';

          try {
            await auth.signInWithEmailAndPassword(email, password);
            showAlert('تم تسجيل الدخول بنجاح! جاري التوجيه...', 'success');
            setTimeout(function() {
              window.location.href = '/account';
            }, 500);
          } catch (err) {
            console.error('Login error:', err);
            let message = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
              message = 'البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق وإعادة المحاولة.';
            } else if (err.code === 'auth/too-many-requests') {
              message = 'تم حظر المحاولات مؤقتاً لكثرة المحاولات غير الناجحة. يرجى المحاولة بعد قليل أو إعادة تعيين كلمة المرور.';
            }
            showAlert(message, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHTML;
          }
        });
      }
    })();
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate``)}`
	})}`;
}, "/app/applet/src/pages/account-login.astro", void 0);
var $$file = "/app/applet/src/pages/account-login.astro";
var $$url = "/account-login";
//#endregion
//#region \0virtual:astro:page:src/pages/account-login@_@astro
var page = () => account_login_exports;
//#endregion
export { page };
