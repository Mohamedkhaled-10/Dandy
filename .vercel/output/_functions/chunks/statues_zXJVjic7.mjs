import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_BGeKp411.mjs";
import { t as createComponent } from "./compiler_Bovpdavx.mjs";
import { t as $$BaseLayout } from "./BaseLayout_BhK_tACD.mjs";
//#region src/pages/statues.astro
var statues_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Statues,
	file: () => $$file,
	url: () => $$url
});
var $$Statues = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "لوحة تسيير الإحصائيات وبصمة الاتصال | Dandy",
		"description": "إحصائيات وقراءات حية لتدفق عمليات متجر داندي وأداء خوادم وقواعد البيانات",
		"robots": "noindex, nofollow"
	}, {
		"default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<section class="analytics-sec container"><div class="section-header" style="text-align: right; margin-bottom: 30px;"><span class="sub">إحصائيات وقراءات حية</span><h2>بصمة وتدفق عمليات متجر داندي</h2></div><div class="stat-card-grid"><div class="single-stat-panel"><h4>إجمالي فواتير الطلبات</h4><div class="stat-num" id="stat-orders">0</div><p style="font-size:0.8rem; color:var(--color-muted); margin-top:4px;">إجمالي الطلبات المستلمة بقاعدة البيانات.</p></div><div class="single-stat-panel"><h4>إجمالي مستحضرات الرفوف</h4><div class="stat-num" id="stat-products">0</div><p style="font-size:0.8rem; color:var(--color-muted); margin-top:4px;">المنتجات المتاحة للتوصيل والعروض الحالية.</p></div><div class="single-stat-panel"><h4>معدل سرعة الاستجابة اللحظية</h4><div class="stat-num">99.8%</div><p style="font-size:0.8rem; color:var(--color-muted); margin-top:4px;">سرعة تحميل أصول الصور ومعاينة الفواتير.</p></div><div class="single-stat-panel"><h4>قنوات الاتصال المربوطة</h4><div class="stat-num">3</div><p style="font-size:0.8rem; color:var(--color-muted); margin-top:4px;">فواتير الواتساب، قنوات إنستجرام، فيسبوك.</p></div></div><!-- Realtime System logs --><h3 style="font-family:'Cairo', sans-serif; font-size:1.15rem; color:var(--color-primary); margin-bottom:12px;">سير تدفق اتصالات الخادم المعتمد (Firebase RTDB Socket Logs)</h3><div class="sys-logs-box" id="sys-logs-area">[INFO] INITIALIZING SECURE SHELL SYSTEM AUTHENTICATION HOOK DANDY PORTAL<br>[INFO] DATABASE CONNECTED TO URL: firebaseio.com/rtdb_live_nodes<br>[INFO] FIRESTORE CLIENT READY FOR BULK READ-WRITE TRANSACTIONS ON COLLECTION 'articles'<br>[SOCKET] WEBSOCKET LISTENER ON CHANNEL 'orders' FORKED SUCCESSFULLY<br></div></section><script>
    const auth = window.auth || (typeof firebase !== 'undefined' ? firebase.auth() : null);
    const db = window.db || (typeof firebase !== 'undefined' ? firebase.database() : null);

    const logBox = document.getElementById('sys-logs-area');
    const statOrders = document.getElementById('stat-orders');
    const statProducts = document.getElementById('stat-products');

    function addLog(msg) {
      if (!logBox) return;
      const t = new Date().toLocaleTimeString('en-US', {hour12:false});
      const d = new Date().toISOString().split('T')[0];
      logBox.innerHTML += \`[LIVE] \${d} \${t} - \${msg}<br>\`;
      logBox.scrollTop = logBox.scrollHeight;
    }

    if (auth) {
      auth.onAuthStateChanged(user => {
        if (!user) {
          window.location.href = '/login';
        } else {
          initializeLiveMetrics();
        }
      });
    }

    function initializeLiveMetrics() {
      if (!db) return;
      db.ref('orders').on('value', snap => {
        const count = snap.exists() ? snap.numChildren() : 0;
        if (statOrders) statOrders.textContent = count;
        addLog(\`RETRIEVED Orders Node successfully: count is \${count}\`);
      });

      db.ref('products').on('value', snap => {
        const count = snap.exists() ? snap.numChildren() : 0;
        if (statProducts) statProducts.textContent = count;
        addLog(\`RETRIEVED Products Node successfully: count is \${count}\`);
      });
    }
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate``)}`
	})}`;
}, "/app/applet/src/pages/statues.astro", void 0);
var $$file = "/app/applet/src/pages/statues.astro";
var $$url = "/statues";
//#endregion
//#region \0virtual:astro:page:src/pages/statues@_@astro
var page = () => statues_exports;
//#endregion
export { page };
