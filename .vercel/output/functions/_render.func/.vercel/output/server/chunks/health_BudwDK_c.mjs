import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
//#region src/pages/api/health.js
var health_exports = /* @__PURE__ */ __exportAll({
	GET: () => GET,
	prerender: () => false
});
async function GET() {
	return new Response(JSON.stringify({
		status: "ok",
		app: "Dandy Cosmetics"
	}), {
		status: 200,
		headers: { "Content-Type": "application/json" }
	});
}
//#endregion
//#region \0virtual:astro:page:src/pages/api/health@_@js
var page = () => health_exports;
//#endregion
export { page };
