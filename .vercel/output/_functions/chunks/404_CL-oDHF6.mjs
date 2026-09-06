import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_BGeKp411.mjs";
import { t as createComponent } from "./compiler_Bovpdavx.mjs";
import { t as $$BaseLayout } from "./BaseLayout_BhK_tACD.mjs";
//#region src/pages/404.astro
var _404_exports = /* @__PURE__ */ __exportAll({
	default: () => $$404,
	file: () => $$file,
	url: () => $$url
});
var $$404 = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "الصفحة غير متوفرة | Dandy",
		"description": "عذراً، الصفحة التي تبحثين عنها غير موجودة حالياً في متجر داندي.",
		"robots": "noindex, follow"
	}, {
		"default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<main class="error-wrap container"><i class="fas fa-leaf" style="font-size:4rem; color:var(--color-blush, #DB2777); margin-bottom:20px;"></i><h2 style="font-family:'Cairo', sans-serif; font-size:2rem; margin-bottom:12px; color:var(--color-primary, #333);">عذراً، المسلك غير متوفر أو قيد التعديل!</h2><p style="color:var(--color-muted, #777); max-width:480px; margin-bottom:30px;">يبدو أن الصفحة التي تحاولين الكشف عنها غير موجودة حالياً. يمكنكِ التوجه مجدداً لمنتجات دلالكِ ونضارتك الفعالة.</p><a href="/all-products" class="cta-btn" style="border-radius:99px; padding:14px 28px;">تصفحي مجموعات داندي الفاخرة</a></main>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate``)}`
	})}`;
}, "/app/applet/src/pages/404.astro", void 0);
var $$file = "/app/applet/src/pages/404.astro";
var $$url = "/404";
//#endregion
//#region \0virtual:astro:page:src/pages/404@_@astro
var page = () => _404_exports;
//#endregion
export { page };
