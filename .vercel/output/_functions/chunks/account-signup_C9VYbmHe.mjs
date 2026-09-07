import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_lUswI9jr.mjs";
import { t as createComponent } from "./compiler_BZhHLwe9.mjs";
import { t as $$BaseLayout } from "./BaseLayout_TSlOutx5.mjs";
//#region src/pages/account-signup.astro
var account_signup_exports = /* @__PURE__ */ __exportAll({
	default: () => $$AccountSignup,
	file: () => $$file,
	url: () => $$url
});
var $$AccountSignup = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "إنشاء حساب جديد | Dandy",
		"description": "انضمي إلى عائلة داندي وتابعي طلباتك السابقة، عناوينك المحفوظة، وقائمتك المفضلة بكل سهولة."
	}, {
		"default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<main class="account-auth-container container" id="signupMain"><div class="account-auth-box" id="signupCard"><span class="auth-icon"><i class="fas fa-user-plus"></i></span><h1>إنشاء حساب عميلة جديدة</h1><p class="auth-subtitle">انضمي إلينا لمتابعة طلباتكِ وحفظ عناوينكِ ومفضلاتكِ بسهولة</p><div id="signupAlert" class="auth-alert-msg" role="alert"></div><form id="signupForm" novalidate><div class="auth-form-group"><label for="c-name">الاسم بالكامل <span style="color:#e11d48;">*</span></label><input type="text" id="c-name" name="name" placeholder="مثال: سارة أحمد" required autocomplete="name"></div><div class="auth-form-group"><label for="c-phone">رقم الهاتف <span style="color:#e11d48;">*</span> <small style="font-size:0.78rem; color:var(--color-muted);">(سيُستخدم لربط طلباتك السابقة)</small></label><input type="tel" id="c-phone" name="phone" placeholder="01xxxxxxxxx" required dir="ltr" style="text-align: right;" autocomplete="tel"></div><div class="auth-form-group"><label for="c-email">البريد الإلكتروني <span style="color:#e11d48;">*</span></label><input type="email" id="c-email" name="email" placeholder="example@gmail.com" required dir="ltr" style="text-align: right;" autocomplete="email"></div><div class="auth-form-group"><label for="c-pass">كلمة المرور <span style="color:#e11d48;">*</span> <small style="font-size:0.78rem; color:var(--color-muted);">(6 أحرف على الأقل)</small></label><input type="password" id="c-pass" name="password" placeholder="••••••••" required minlength="6" autocomplete="new-password"></div><button type="submit" id="signupSubmitBtn" class="btn-auth-submit"><span>إنشاء الحساب</span><i class="fas fa-arrow-left"></i></button></form><div class="auth-switch-link">لديكِ حساب بالفعل؟ <a href="/account-login">تسجيل الدخول</a></div></div></main><script>
    (function() {
      const auth = window.auth || (typeof firebase !== 'undefined' ? firebase.auth() : null);
      const db = window.db || (typeof firebase !== 'undefined' ? firebase.database() : null);

      const form = document.getElementById('signupForm');
      const submitBtn = document.getElementById('signupSubmitBtn');
      const alertBox = document.getElementById('signupAlert');

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

      // توجيه تلقائي إذا كان مسجلاً بالفعل
      if (auth) {
        auth.onAuthStateChanged(function(user) {
          if (user && user.email !== 'admin@dandy.com') {
            window.location.href = '/account';
          }
        });
      }

      if (form) {
        form.addEventListener('submit', async function(e) {
          e.preventDefault();
          clearAlert();

          const name = document.getElementById('c-name')?.value.trim();
          const phone = document.getElementById('c-phone')?.value.trim();
          const email = document.getElementById('c-email')?.value.trim();
          const password = document.getElementById('c-pass')?.value.trim();

          if (!name) {
            showAlert('يرجى إدخال الاسم بالكامل.');
            return;
          }
          if (!phone || phone.length < 10) {
            showAlert('يرجى إدخال رقم هاتف صحيح لا يقل عن 10 أرقام.');
            return;
          }
          if (!email || !email.includes('@')) {
            showAlert('يرجى إدخال بريد إلكتروني صالح.');
            return;
          }
          if (!password || password.length < 6) {
            showAlert('كلمة المرور يجب ألا تقل عن 6 أحرف.');
            return;
          }

          if (!auth || !db) {
            showAlert('تعذر الاتصال بقاعدة البيانات. يرجى إعادة تحميل الصفحة.');
            return;
          }

          submitBtn.disabled = true;
          const originalBtnHTML = submitBtn.innerHTML;
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إنشاء الحساب...';

          try {
            // إنشاء المستخدم في Firebase Auth
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            const uid = cred.user.uid;

            // حفظ بيانات العميل في Realtime Database تحت customers/$uid
            await db.ref('customers/' + uid).set({
              name: name,
              email: email,
              phone: phone,
              createdAt: firebase.database.ServerValue.TIMESTAMP
            });

            // استدعاء خدمة ربط الطلبات القديمة تلقائياً (المرحلة 3)
            try {
              const idToken = await cred.user.getIdToken();
              await fetch('/api/link-customer-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken, phone })
              });
            } catch (linkErr) {
              console.warn('Orders link notice:', linkErr);
            }

            showAlert('تم إنشاء الحساب بنجاح! جاري التوجيه...', 'success');
            setTimeout(function() {
              window.location.href = '/account';
            }, 600);

          } catch (err) {
            console.error('Signup error:', err);
            let message = 'حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة مرة أخرى.';
            if (err.code === 'auth/email-already-in-use') {
              message = 'هذا البريد الإلكتروني مسجل بالفعل! يمكنكِ تسجيل الدخول به.';
            } else if (err.code === 'auth/invalid-email') {
              message = 'صيغة البريد الإلكتروني غير صحيحة.';
            } else if (err.code === 'auth/weak-password') {
              message = 'كلمة المرور ضعيفة جدًا، يرجى اختيار كلمة مرور أقوى.';
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
}, "/app/applet/src/pages/account-signup.astro", void 0);
var $$file = "/app/applet/src/pages/account-signup.astro";
var $$url = "/account-signup";
//#endregion
//#region \0virtual:astro:page:src/pages/account-signup@_@astro
var page = () => account_signup_exports;
//#endregion
export { page };
