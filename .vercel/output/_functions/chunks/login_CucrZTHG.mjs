import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_lUswI9jr.mjs";
import { t as createComponent } from "./compiler_BZhHLwe9.mjs";
import { t as $$BaseLayout } from "./BaseLayout_TSlOutx5.mjs";
//#region src/pages/login.astro
var login_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Login,
	file: () => $$file,
	url: () => $$url
});
var $$Login = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "تسجيل دخول الإدارة | Dandy",
		"description": "بوابة تسجيل الدخول الآمن لمشرفي وموظفي متجر داندي للتجميل",
		"robots": "noindex, nofollow"
	}, {
		"default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<main class="login-container container"><div class="login-box"><i class="fas fa-user-shield" style="font-size:3rem; color:var(--color-blush); margin-bottom:16px;"></i><h2>الدخول للوحة العمليات</h2><p>مخصص لمشرفي وموظفي متجر داندي للتجميل</p><form id="loginForm"><div class="form-group"><label for="l-email">البريد الإلكتروني المعتمد</label><input type="email" id="l-email" placeholder="admin@dandy.com" required></div><div class="form-group" style="position: relative;"><label for="l-pass">كلمة المرور الحزامية</label><input type="password" id="l-pass" placeholder="••••••••" required></div><button type="submit" class="btn-login" style="margin-top: 10px;">تسجيل الدخول الآمن</button></form></div></main><script>
    const auth = window.auth || (typeof firebase !== 'undefined' ? firebase.auth() : null);

    if (auth) {
      // Active check redirect if already signed in
      auth.onAuthStateChanged(user => {
        if (user) {
          window.location.href = '/dashboard';
        }
      });

      // Handle secure submit login credentials
      document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('l-email').value.trim();
        const password = document.getElementById('l-pass').value.trim();

        try {
          await auth.signInWithEmailAndPassword(email, password);
          // Automatic redirect triggers onAuthStateChanged above
        } catch (err) {
          alert('بينات الدخول خاطئة أو غير مسجلة! نرجو مراجعة مسؤول النظام للتحقق.');
        }
      });
    }
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate``)}`
	})}`;
}, "/app/applet/src/pages/login.astro", void 0);
var $$file = "/app/applet/src/pages/login.astro";
var $$url = "/login";
//#endregion
//#region \0virtual:astro:page:src/pages/login@_@astro
var page = () => login_exports;
//#endregion
export { page };
