import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_BGeKp411.mjs";
import { t as createComponent } from "./compiler_Bovpdavx.mjs";
import { t as $$BaseLayout } from "./BaseLayout_BhK_tACD.mjs";
//#region src/pages/dashboard.astro
var dashboard_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Dashboard,
	file: () => $$file,
	url: () => $$url
});
var $$Dashboard = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "لوحة التحكم الرئيسية والعمليات | Dandy",
		"description": "مركز قيادة متجر داندي للعمليات ومتابعة الفواتير والمخزن والمقالات",
		"robots": "noindex, nofollow"
	}, {
		"default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<section class="dashboard-hero container"><div class="section-header" style="text-align: right; margin-bottom: 24px;"><span class="sub">مركز قيادة داندي الفاخر</span><h2>لوحة التحكم وعمليات المتجر اللحظية</h2></div><div class="operator-profile" id="operatorCard" style="display: none;"><div class="operator-avatar" id="operatorInitials">D</div><div style="flex: 1;"><h3 style="font-family:'Cairo', sans-serif; font-size:1.15rem; color:var(--color-primary);">مرحباً بكِ مجدداً، <strong id="operatorEmail">...</strong></h3><p style="color:var(--color-muted); font-size:0.9rem; margin-top:2px;">تم التحقق من بصمة المصادقة بنجاح. تمنياتنا لكِ بيوم عمل سعيد ومثمر.</p></div><div><button class="btn-signout" id="signOutBtn"><i class="fas fa-sign-out-alt"></i> مغادرة اللوحة</button></div></div><!-- Bento grid menus --><div class="dashboard-grid"><!-- Orders Card --><div class="bento-admin-card"><div class="bento-admin-icon"><i class="fas fa-shopping-basket"></i></div><h3>إدارة وتوصيل الطلبات</h3><p>متابعة فواتير المبيعات اللحظية، مراجعة وتجهيز الشحن، تغيير حالة كل طلب مع إرسال التنبيهات.</p><a href="/dashboard-order" class="bento-admin-link">الانتقال لمدير الطلبات الفوري <i class="fas fa-arrow-left"></i></a></div><!-- Inventory Products Card --><div class="bento-admin-card"><div class="bento-admin-icon"><i class="fas fa-boxes"></i></div><h3>مخزن ومستحضرات المتجر</h3><p>تنظيم قائمة المنتجات في ثلاجة الشحن، تعديل أسعار المستحضرات، إضافة الخصومات الحصرية وصور المعاينة.</p><a href="/dashboard-product" class="bento-admin-link">تسيير قائمة المستحضرات <i class="fas fa-arrow-left"></i></a></div><!-- Editorial Blog Card --><div class="bento-admin-card"><div class="bento-admin-icon"><i class="fas fa-newspaper"></i></div><h3>إدارة المقالات والمدونة</h3><p>إعداد مقالات ترطيب الشعر والعناية بالبشرة، كتابة النصائح الحصرية، وتحرير العناوين والأوسمة والتصنيفات الجمالية.</p><a href="/dashboard-blog" class="bento-admin-link">كتابة وتحرير المقالات الفخمة <i class="fas fa-arrow-left"></i></a></div><!-- Analytics Card --><div class="bento-admin-card"><div class="bento-admin-icon"><i class="fas fa-chart-line"></i></div><h3>الإحصائيات والمقاييس</h3><p>أبعاد العمل الكاملة: معدل قراءة المقالات، حجم حجز السلال، ورصد أداء استقرار خوادم قواعد البيانات في داندي.</p><a href="/statues" class="bento-admin-link">استعراض لوحة التحليلات <i class="fas fa-arrow-left"></i></a></div><!-- Index Card --><div class="bento-admin-card"><div class="bento-admin-icon"><i class="fas fa-home"></i></div><h3>إدارة الواجهة الرئيسية</h3><p>تعديل أقسام الصفحة الرئيسية، بانر العروض، أشرطة التنبيهات، وترتيب فئات المنتجات الظاهرة للعملاء.</p><a href="/dashboard-index" class="bento-admin-link">تخصيص واجهة المتجر <i class="fas fa-arrow-left"></i></a></div></div><!-- Change Logs Section --><div class="logs-section"><div class="section-header" style="text-align: right; margin-bottom: 24px;"><h3 style="font-size: 1.35rem; color: var(--color-primary); margin-bottom: 8px;"><i class="fas fa-clipboard-list" style="color:var(--color-blush); margin-left: 8px;"></i>سجل نشاطات النظام (Change Logs)</h3><p style="color:var(--color-muted); font-size:0.95rem;">مراقبة حية لأحدث التعديلات والإجراءات التي قام بها المشرفون.</p></div><div class="table-responsive"><table class="logs-table"><thead><tr><th>المسؤول (الأدمن)</th><th>نوع الإجراء والتفاصيل</th><th>التاريخ والوقت</th></tr></thead><tbody id="logsTableBody"><tr><td colspan="3" style="text-align:center; padding: 30px;"><i class="fas fa-spinner fa-spin" style="color:var(--color-blush); margin-left: 5px;"></i> جاري تحميل السجل...</td></tr></tbody></table></div></div></section><script>
    const auth = window.auth || (typeof firebase !== 'undefined' ? firebase.auth() : null);
    const db = window.firestore || (typeof firebase !== 'undefined' ? firebase.firestore() : null);

    const operatorCard = document.getElementById('operatorCard');
    const operatorEmail = document.getElementById('operatorEmail');
    const operatorInitials = document.getElementById('operatorInitials');
    const signOutBtn = document.getElementById('signOutBtn');
    const signoutLink = document.getElementById('signoutLink');
    const logsTableBody = document.getElementById('logsTableBody');

    // Guard routing checks
    if (auth) {
      auth.onAuthStateChanged(user => {
        if (!user) {
          window.location.href = '/login';
        } else {
          if (operatorCard) operatorCard.style.display = 'flex';
          if (operatorEmail) operatorEmail.textContent = user.email || 'Admin';
          if (operatorInitials) operatorInitials.textContent = (user.email ? user.email.charAt(0).toUpperCase() : 'A');
          
          fetchChangeLogs();
        }
      });
    }

    // Fetch Change Logs from Firestore
    async function fetchChangeLogs() {
      if (!db || !logsTableBody) return;
      try {
        const snapshot = await db.collection('change_logs')
                                 .orderBy('timestamp', 'desc')
                                 .limit(15)
                                 .get();

        if (snapshot.empty) {
          logsTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px;">لا توجد نشاطات مسجلة حتى الآن.</td></tr>';
          return;
        }

        logsTableBody.innerHTML = '';

        snapshot.forEach(doc => {
          const data = doc.data();
          const adminEmail = data.adminEmail || 'غير معروف';
          const action = data.action || 'إجراء غير محدد';
          
          let dateString = 'الآن';
          if (data.timestamp) {
            const dateObj = data.timestamp.toDate();
            dateString = dateObj.toLocaleString('ar-EG', { 
              year: 'numeric', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit'
            });
          }

          const tr = document.createElement('tr');
          tr.innerHTML = \`
            <td><span class="admin-badge"><i class="fas fa-user-circle"></i> \${adminEmail}</span></td>
            <td style="font-weight: 500;">\${action}</td>
            <td class="log-date" dir="ltr" style="text-align: right;">\${dateString}</td>
          \`;
          logsTableBody.appendChild(tr);
        });

      } catch (error) {
        console.warn("Could not fetch change logs: ", error.message);
        logsTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; color:var(--color-muted);">لا توجد نشاطات مسجلة حتى الآن.</td></tr>';
      }
    }

    // Action logout triggers
    async function performLogOut(){
      if (!auth) return;
      try {
        await auth.signOut();
        window.location.href = '/login';
      } catch(err) {
        console.error(err);
      }
    }

    if (signOutBtn) signOutBtn.addEventListener('click', performLogOut);
    if (signoutLink) signoutLink.addEventListener('click', performLogOut);
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate``)}`
	})}`;
}, "/app/applet/src/pages/dashboard.astro", void 0);
var $$file = "/app/applet/src/pages/dashboard.astro";
var $$url = "/dashboard";
//#endregion
//#region \0virtual:astro:page:src/pages/dashboard@_@astro
var page = () => dashboard_exports;
//#endregion
export { page };
