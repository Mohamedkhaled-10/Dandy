import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
//#region src/pages/api/link-customer-orders.js
var link_customer_orders_exports = /* @__PURE__ */ __exportAll({
	POST: () => POST,
	prerender: () => false
});
function getAdminApp() {
	if (getApps().length > 0) return getApps()[0];
	const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
	if (!saEnv) throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is missing");
	const serviceAccount = typeof saEnv === "string" ? JSON.parse(saEnv) : saEnv;
	return initializeApp({
		credential: cert(serviceAccount),
		databaseURL: "https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app"
	});
}
async function POST({ request }) {
	try {
		const { idToken, phone } = await request.json().catch(() => ({}));
		if (!idToken) return new Response(JSON.stringify({ error: "Missing idToken" }), {
			status: 400,
			headers: { "Content-Type": "application/json" }
		});
		if (!phone) return new Response(JSON.stringify({ error: "Missing phone" }), {
			status: 400,
			headers: { "Content-Type": "application/json" }
		});
		const app = getAdminApp();
		const adminAuth = getAuth(app);
		const adminDb = getDatabase(app);
		const uid = (await adminAuth.verifyIdToken(idToken)).uid;
		if (!uid) return new Response(JSON.stringify({ error: "Invalid token or missing uid" }), {
			status: 401,
			headers: { "Content-Type": "application/json" }
		});
		const phoneStr = String(phone).trim();
		const cleanDigits = phoneStr.replace(/\D/g, "");
		const phoneVariants = /* @__PURE__ */ new Set();
		phoneVariants.add(phoneStr);
		if (phoneStr.startsWith("+20")) {
			phoneVariants.add("0" + phoneStr.slice(3));
			phoneVariants.add(phoneStr.slice(3));
		} else if (phoneStr.startsWith("0")) {
			phoneVariants.add("+2" + phoneStr);
			phoneVariants.add("+20" + phoneStr.slice(1));
			phoneVariants.add(phoneStr.slice(1));
		} else if (cleanDigits.length === 10) {
			phoneVariants.add("0" + cleanDigits);
			phoneVariants.add("+20" + cleanDigits);
		}
		let linkedCount = 0;
		const processedOrderIds = /* @__PURE__ */ new Set();
		for (const variant of phoneVariants) {
			const snap = await adminDb.ref("orders").orderByChild("phone").equalTo(variant).once("value");
			if (snap.exists()) {
				const orders = snap.val();
				for (const [orderId, orderData] of Object.entries(orders)) if (!processedOrderIds.has(orderId)) {
					processedOrderIds.add(orderId);
					if (!orderData?.customerId) {
						await adminDb.ref(`orders/${orderId}/customerId`).set(uid);
						linkedCount++;
					}
				}
			}
		}
		return new Response(JSON.stringify({
			success: true,
			linkedCount,
			message: `تم ربط ${linkedCount} طلب/طلبات بحساب العميل بنجاح`
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (error) {
		console.error("Error in link-customer-orders endpoint:", error);
		return new Response(JSON.stringify({
			error: "Failed to link customer orders",
			message: error.message
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
}
//#endregion
//#region \0virtual:astro:page:src/pages/api/link-customer-orders@_@js
var page = () => link_customer_orders_exports;
//#endregion
export { page };
