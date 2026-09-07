import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_lUswI9jr.mjs";
import { t as createComponent } from "./compiler_BZhHLwe9.mjs";
import { t as $$BaseLayout } from "./BaseLayout_TSlOutx5.mjs";
//#region src/pages/account.astro
var account_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Account,
	file: () => $$file,
	url: () => $$url
});
var $$Account = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "حسابي | Dandy",
		"description": "إدارة حساب العميل، متابعة الطلبات السابقة، إدارة العناوين المحفوظة، واستعراض قائمة المفضلة في متجر داندي.",
		"robots": "noindex, nofollow"
	}, {
		"default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<main class="account-page-wrapper container" id="accountMainContainer"><!-- Initial Loading State --><div id="accountLoading" class="account-loading-overlay"><i class="fas fa-circle-notch fa-spin"></i><p style="color:var(--color-muted); font-size:1.1rem; font-weight:700;">جاري تحميل حسابكِ...</p></div><!-- Main Account Area (Shown after auth check) --><div id="accountContent" style="display:none;"><!-- Hero Customer Info --><section class="account-hero-card" id="accountHero"><div class="account-user-meta"><div class="account-avatar" id="customerAvatar"><i class="fas fa-user"></i></div><div class="account-greeting"><h1 id="customerGreetingName">مرحباً بكِ!</h1><p id="customerEmailText"></p></div></div><div class="account-header-actions"><a href="/all-products" class="btn-order-action secondary"><i class="fas fa-shopping-bag"></i> تسوقي الآن</a><button type="button" id="logoutBtn" class="btn-account-logout"><i class="fas fa-sign-out-alt"></i> تسجيل الخروج</button></div></section><!-- Navigation Tabs --><div class="account-nav-tabs" role="tablist"><button type="button" class="account-tab-btn active" data-tab="orders" id="tabBtnOrders"><i class="fas fa-box-open"></i><span>سجل الطلبات</span><span class="badge-counter" id="ordersCountBadge">0</span></button><button type="button" class="account-tab-btn" data-tab="addresses" id="tabBtnAddresses"><i class="fas fa-map-marked-alt"></i><span>العناوين المحفوظة</span><span class="badge-counter" id="addressesCountBadge">0</span></button><button type="button" class="account-tab-btn" data-tab="wishlist" id="tabBtnWishlist"><i class="fas fa-heart"></i><span>قائمة المفضلة</span><span class="badge-counter" id="wishlistCountBadge">0</span></button></div><!-- Tab 1: Orders Section --><section id="panelOrders" class="account-tab-content active"><div id="ordersLoading" style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin" style="color:var(--color-blush); font-size:2rem;"></i><p style="margin-top:10px; color:var(--color-muted);">جاري تحميل سجل طلباتكِ...</p></div><div id="ordersContainer" class="orders-grid" style="display:none;"></div><div id="ordersEmpty" class="account-empty-state" style="display:none;"><i class="fas fa-shopping-basket"></i><h3>لا توجد طلبات سابقة حتى الآن</h3><p>لم تقومي بأي طلبات بعد! اكتشفي مجموعتنا المميزة من منتجات العناية الطبيعية بالبشرة والشعر واطلبي الآن.</p><a href="/all-products" class="btn-empty-action"><i class="fas fa-sparkles"></i> استكشاف المنتجات</a></div></section><!-- Tab 2: Addresses Section --><section id="panelAddresses" class="account-tab-content"><div class="addresses-header-bar"><div><h2 style="font-size:1.25rem; font-weight:800; color:var(--color-primary); margin:0 0 4px;">عناوين التوصيل</h2><p style="color:var(--color-muted); font-size:0.9rem; margin:0;">أضيفي عناويناتكِ المفضلة لتسهيل عملية الشراء وسرعة الشحن مستقبلاً.</p></div><button type="button" id="openAddAddressModalBtn" class="btn-add-address"><i class="fas fa-plus"></i> إضافة عنوان جديد</button></div><div id="addressesLoading" style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin" style="color:var(--color-blush); font-size:2rem;"></i></div><div id="addressesContainer" class="addresses-grid" style="display:none;"></div><div id="addressesEmpty" class="account-empty-state" style="display:none;"><i class="fas fa-map-pin"></i><h3>لم تقومي بإضافة أي عناوين بعد</h3><p>احفظي عنوان منزلكِ أو مكان عملكِ لتوفير الوقت عند إتمام طلباتكِ القادمة.</p><button type="button" id="emptyAddAddressBtn" class="btn-empty-action"><i class="fas fa-plus"></i> إضافة عنوانكِ الأول</button></div></section><!-- Tab 3: Wishlist Section --><section id="panelWishlist" class="account-tab-content"><div id="wishlistLoading" style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin" style="color:var(--color-blush); font-size:2rem;"></i><p style="margin-top:10px; color:var(--color-muted);">جاري تحميل مفضلاتكِ...</p></div><div id="wishlistContainer" class="wishlist-grid" style="display:none;"></div><div id="wishlistEmpty" class="account-empty-state" style="display:none;"><i class="fas fa-heart-broken"></i><h3>قائمة المفضلة فارغة حالياً</h3><p>لم تقومي بحفظ أي منتجات في مفضلتكِ بعد. تصفحي متجرنا وأضيفي منتجاتكِ المفضلة لتجديها هنا في أي وقت!</p><a href="/all-products" class="btn-empty-action"><i class="fas fa-heart"></i> تصفح المنتجات المفضلة</a></div></section></div></main><div id="addressModal" class="modal-overlay" role="dialog" aria-modal="true"><div class="modal-card"><div class="modal-header"><h3 id="modalTitle">إضافة عنوان جديد</h3><button type="button" id="closeAddressModalBtn" class="btn-modal-close">&times;</button></div><form id="addressForm"><input type="hidden" id="editAddressId" value=""><div class="modal-form-group"><label for="addrLabel">تسمية العنوان <span style="color:#e11d48;">*</span></label><input type="text" id="addrLabel" placeholder="مثال: المنزل، العمل، شقة المصيف" required></div><div class="modal-form-group"><label for="addrGov">المحافظة <span style="color:#e11d48;">*</span></label><select id="addrGov" required><option value="">اختر المحافظة</option><option value="Cairo">القاهرة</option><option value="Giza">الجيزة</option><option value="Alexandria">الإسكندرية</option><option value="Gharbia">الغربية</option><option value="Dakahlia">الدقهلية</option><option value="Sharqia">الشرقية</option><option value="Kafr El Sheikh">كفر الشيخ</option><option value="Qalyubia">القليوبية</option><option value="Port Said">بورسعيد</option><option value="Damietta">دمياط</option><option value="Suez">السويس</option><option value="Ismailia">الإسماعيلية</option><option value="Beheira">البحيرة</option><option value="Monufia">المنوفية</option><option value="Fayoum">الفيوم</option><option value="Beni Suef">بني سويف</option><option value="Minya">المنيا</option><option value="Asyut">أسيوط</option><option value="Sohag">سوهاج</option><option value="Qena">قنا</option><option value="Luxor">الأقصر</option><option value="Aswan">أسوان</option><option value="Red Sea">البحر الأحمر</option><option value="South Sinai">جنوب سيناء</option><option value="North Sinai">شمال سيناء</option><option value="Matrouh">مطروح</option><option value="New Valley">الوادي الجديد</option></select></div><div class="modal-form-group"><label for="addrCity">المدينة / المركز / الحي <span style="color:#e11d48;">*</span></label><input type="text" id="addrCity" placeholder="مثال: المعادي، مدينة نصر، طنطا" required></div><div class="modal-form-group"><label for="addrDetail">العنوان بالتفصيل <span style="color:#e11d48;">*</span></label><textarea id="addrDetail" rows="3" placeholder="اسم الشارع، رقم العمارة، رقم الشقة أو أي علامة مميزة" required></textarea></div><label class="modal-checkbox-row"><input type="checkbox" id="addrIsDefault"><span>تعيين كعنوان رئيسي افتراضي للشحن</span></label><div class="modal-actions"><button type="submit" id="saveAddressBtn" class="btn-modal-save">حفظ العنوان</button><button type="button" id="cancelAddressBtn" class="btn-modal-cancel">إلغاء</button></div></form></div></div><script>
    (function() {
      let currentUser = null;
      let cachedCustomerData = null;
      let cachedAddresses = {};
      let cachedWishlist = {};

      const auth = window.auth || (typeof firebase !== 'undefined' ? firebase.auth() : null);
      const db = window.db || (typeof firebase !== 'undefined' ? firebase.database() : null);

      if (!auth || !db) {
        console.error('Firebase Auth or DB not available');
        return;
      }

      // التحقق من تسجيل الدخول
      auth.onAuthStateChanged(async function(user) {
        if (!user) {
          window.location.href = '/account-login';
          return;
        }

        currentUser = user;
        document.getElementById('accountLoading').style.display = 'none';
        document.getElementById('accountContent').style.display = 'block';

        initUserProfile();
        loadOrders();
        loadAddresses();
        loadWishlist();
      });

      // إعداد بيانات المستخدم والهيدر
      async function initUserProfile() {
        const emailText = document.getElementById('customerEmailText');
        const greetingName = document.getElementById('customerGreetingName');
        const avatarEl = document.getElementById('customerAvatar');

        if (emailText) emailText.textContent = currentUser.email || '';

        try {
          const snap = await db.ref('customers/' + currentUser.uid).once('value');
          if (snap.exists()) {
            cachedCustomerData = snap.val();
            const name = cachedCustomerData.name || '';
            if (name && greetingName) {
              greetingName.textContent = 'أهلاً بكِ، ' + name + ' ✨';
            }
            if (name && avatarEl) {
              avatarEl.textContent = name.trim().charAt(0).toUpperCase();
            }
          }
        } catch (e) {
          console.warn('Error fetching customer profile:', e);
        }
      }

      // تسجيل الخروج
      document.getElementById('logoutBtn')?.addEventListener('click', async function() {
        try {
          await auth.signOut();
          window.location.href = '/account-login';
        } catch (e) {
          console.error('Logout error:', e);
        }
      });

      // إدارة التبويبات (Tabs)
      const tabBtns = document.querySelectorAll('.account-tab-btn');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const targetTab = btn.getAttribute('data-tab');
          tabBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          document.querySelectorAll('.account-tab-content').forEach(panel => {
            panel.classList.remove('active');
          });

          if (targetTab === 'orders') document.getElementById('panelOrders')?.classList.add('active');
          if (targetTab === 'addresses') document.getElementById('panelAddresses')?.classList.add('active');
          if (targetTab === 'wishlist') document.getElementById('panelWishlist')?.classList.add('active');
        });
      });

      // -------------------------------------------------------------
      // أ) سجل الطلبات (Orders History)
      // -------------------------------------------------------------
      async function loadOrders() {
        const loadingEl = document.getElementById('ordersLoading');
        const container = document.getElementById('ordersContainer');
        const emptyEl = document.getElementById('ordersEmpty');
        const countBadge = document.getElementById('ordersCountBadge');

        try {
          const snap = await db.ref('orders').orderByChild('customerId').equalTo(currentUser.uid).once('value');

          loadingEl.style.display = 'none';

          if (!snap.exists()) {
            container.style.display = 'none';
            emptyEl.style.display = 'block';
            if (countBadge) countBadge.textContent = '0';
            return;
          }

          const ordersObj = snap.val();
          const ordersList = [];
          Object.keys(ordersObj).forEach(key => {
            ordersList.push({ id: key, ...ordersObj[key] });
          });

          // ترتيب الأحدث أولاً
          ordersList.sort((a, b) => {
            const timeA = a.createdAt || (a.date ? new Date(a.date).getTime() : 0);
            const timeB = b.createdAt || (b.date ? new Date(b.date).getTime() : 0);
            return timeB - timeA;
          });

          if (countBadge) countBadge.textContent = String(ordersList.length);

          container.innerHTML = '';
          ordersList.forEach(order => {
            const card = document.createElement('div');
            card.className = 'order-history-card';

            const invoiceCode = order.invoiceCode || order.id || 'DNY-ORDER';
            let dateStr = 'تاريخ حديث';
            if (order.createdAt) {
              const d = new Date(order.createdAt);
              dateStr = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            } else if (order.date) {
              dateStr = String(order.date);
            }

            const totalAmount = order.totalAmount || 0;
            const itemsCount = Array.isArray(order.products) ? order.products.length : (order.products ? Object.keys(order.products).length : 1);

            // حالة الطلب
            let statusText = 'قيد المراجعة';
            let statusClass = 'status-new';
            const s = (order.status || '').toLowerCase();
            if (s.includes('deliver') || s.includes('توصيل') || s.includes('مكتمل')) {
              statusText = 'تم التوصيل بنجاح';
              statusClass = 'status-delivered';
            } else if (s.includes('ship') || s.includes('شحن')) {
              statusText = 'جاري الشحن';
              statusClass = 'status-shipped';
            } else if (s.includes('process') || s.includes('تجهيز') || s.includes('تحضير')) {
              statusText = 'قيد التجهيز';
              statusClass = 'status-processing';
            } else if (s.includes('cancel') || s.includes('ملغي')) {
              statusText = 'تم الإلغاء';
              statusClass = 'status-cancelled';
            }

            card.innerHTML = \`
              <div class="order-card-header">
                <div>
                  <span class="order-code-badge"><i class="fas fa-receipt"></i> \${invoiceCode}</span>
                  <div class="order-date-text" style="margin-top:4px;"><i class="far fa-clock"></i> \${dateStr}</div>
                </div>
                <div>
                  <span class="order-status-pill \${statusClass}">\${statusText}</span>
                </div>
              </div>

              <div class="order-card-body">
                <div class="order-info-item">
                  <div class="label">إجمالي الطلب</div>
                  <div class="val" style="color:var(--color-blush); font-size:1.15rem;">\${totalAmount} ج.م</div>
                </div>
                <div class="order-info-item">
                  <div class="label">عدد المنتجات</div>
                  <div class="val">\${itemsCount} منتج/منتجات</div>
                </div>
                <div class="order-info-item">
                  <div class="label">عنوان التوصيل</div>
                  <div class="val" style="font-size:0.88rem;">\${order.governorate || ''} - \${order.city || ''}</div>
                </div>
              </div>

              <div class="order-card-footer">
                <a href="/invoice?invoice=\${encodeURIComponent(invoiceCode)}" class="btn-order-action primary" target="_blank">
                  <i class="fas fa-file-invoice"></i> عرض الفاتورة
                </a>
                <a href="/track-order?invoice=\${encodeURIComponent(invoiceCode)}" class="btn-order-action secondary">
                  <i class="fas fa-truck"></i> تتبع الطلب
                </a>
              </div>
            \`;
            container.appendChild(card);
          });

          container.style.display = 'flex';
          emptyEl.style.display = 'none';

        } catch (err) {
          console.error('Error loading orders:', err);
          loadingEl.style.display = 'none';
          emptyEl.style.display = 'block';
        }
      }

      // -------------------------------------------------------------
      // ب) العناوين المحفوظة (Addresses CRUD)
      // -------------------------------------------------------------
      const addressModal = document.getElementById('addressModal');
      const addressForm = document.getElementById('addressForm');
      const openModalBtn = document.getElementById('openAddAddressModalBtn');
      const emptyAddBtn = document.getElementById('emptyAddAddressBtn');
      const closeModalBtn = document.getElementById('closeAddressModalBtn');
      const cancelModalBtn = document.getElementById('cancelAddressBtn');

      function showAddressModal(isEdit = false, addrId = '', data = null) {
        document.getElementById('modalTitle').textContent = isEdit ? 'تعديل العنوان' : 'إضافة عنوان جديد';
        document.getElementById('editAddressId').value = addrId;

        if (isEdit && data) {
          document.getElementById('addrLabel').value = data.label || '';
          document.getElementById('addrGov').value = data.governorate || '';
          document.getElementById('addrCity').value = data.city || '';
          document.getElementById('addrDetail').value = data.address || '';
          document.getElementById('addrIsDefault').checked = !!data.isDefault;
        } else {
          addressForm.reset();
          document.getElementById('editAddressId').value = '';
          // إذا كان أول عنوان، اجعله افتراضياً
          if (Object.keys(cachedAddresses).length === 0) {
            document.getElementById('addrIsDefault').checked = true;
          }
        }

        addressModal.classList.add('active');
      }

      function hideAddressModal() {
        addressModal.classList.remove('active');
      }

      openModalBtn?.addEventListener('click', () => showAddressModal(false));
      emptyAddBtn?.addEventListener('click', () => showAddressModal(false));
      closeModalBtn?.addEventListener('click', hideAddressModal);
      cancelModalBtn?.addEventListener('click', hideAddressModal);

      addressModal?.addEventListener('click', (e) => {
        if (e.target === addressModal) hideAddressModal();
      });

      async function loadAddresses() {
        const loadingEl = document.getElementById('addressesLoading');
        const container = document.getElementById('addressesContainer');
        const emptyEl = document.getElementById('addressesEmpty');
        const countBadge = document.getElementById('addressesCountBadge');

        try {
          const snap = await db.ref('customers/' + currentUser.uid + '/addresses').once('value');
          loadingEl.style.display = 'none';

          if (!snap.exists()) {
            cachedAddresses = {};
            container.style.display = 'none';
            emptyEl.style.display = 'block';
            if (countBadge) countBadge.textContent = '0';
            return;
          }

          cachedAddresses = snap.val() || {};
          const addrKeys = Object.keys(cachedAddresses);
          if (countBadge) countBadge.textContent = String(addrKeys.length);

          if (addrKeys.length === 0) {
            container.style.display = 'none';
            emptyEl.style.display = 'block';
            return;
          }

          container.innerHTML = '';
          addrKeys.forEach(key => {
            const addr = cachedAddresses[key];
            const card = document.createElement('div');
            card.className = 'address-card' + (addr.isDefault ? ' is-default' : '');

            const govSelect = document.getElementById('addrGov');
            let govArabic = addr.governorate || '';
            if (govSelect) {
              const opt = Array.from(govSelect.options).find(o => o.value === addr.governorate);
              if (opt) govArabic = opt.text;
            }

            card.innerHTML = \`
              <div>
                <div class="address-card-top">
                  <span class="address-label"><i class="fas fa-home"></i> \${addr.label || 'عنوان'}</span>
                  \${addr.isDefault ? '<span class="badge-default-address"><i class="fas fa-check-circle"></i> افتراضي</span>' : ''}
                </div>

                <div class="address-details">
                  <div><strong>المحافظة:</strong> \${govArabic}</div>
                  <div><strong>المدينة / المنطقة:</strong> \${addr.city || ''}</div>
                  <div><strong>العنوان:</strong> \${addr.address || ''}</div>
                </div>
              </div>

              <div class="address-card-actions">
                <button type="button" class="btn-addr-action edit" onclick="window.editAddress('\${key}')">
                  <i class="fas fa-edit"></i> تعديل
                </button>
                <button type="button" class="btn-addr-action delete" onclick="window.deleteAddress('\${key}')">
                  <i class="fas fa-trash-alt"></i> حذف
                </button>
                \${!addr.isDefault ? \`
                  <button type="button" class="btn-addr-action set-default" onclick="window.setDefaultAddress('\${key}')">
                    <i class="fas fa-star"></i> تعيين كافتراضي
                  </button>
                \` : ''}
              </div>
            \`;
            container.appendChild(card);
          });

          container.style.display = 'grid';
          emptyEl.style.display = 'none';

        } catch (err) {
          console.error('Error loading addresses:', err);
          loadingEl.style.display = 'none';
        }
      }

      // حفظ العنوان (إضافة أو تعديل)
      addressForm?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const editId = document.getElementById('editAddressId').value;
        const label = document.getElementById('addrLabel').value.trim();
        const governorate = document.getElementById('addrGov').value;
        const city = document.getElementById('addrCity').value.trim();
        const address = document.getElementById('addrDetail').value.trim();
        const isDefault = document.getElementById('addrIsDefault').checked;

        if (!label || !governorate || !city || !address) {
          alert('يرجى ملء جميع الحقول المطلوبة');
          return;
        }

        const saveBtn = document.getElementById('saveAddressBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'جاري الحفظ...';

        try {
          const addrRef = db.ref('customers/' + currentUser.uid + '/addresses');

          // إذا تم تحديده كافتراضي، قم بإلغاء الافتراضي من باقي العناوين
          if (isDefault) {
            const allSnap = await addrRef.once('value');
            if (allSnap.exists()) {
              const updates = {};
              allSnap.forEach(child => {
                if (child.key !== editId && child.val().isDefault) {
                  updates[child.key + '/isDefault'] = false;
                }
              });
              if (Object.keys(updates).length > 0) {
                await addrRef.update(updates);
              }
            }
          }

          const addressData = {
            label,
            governorate,
            city,
            address,
            isDefault,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
          };

          if (editId) {
            await addrRef.child(editId).update(addressData);
          } else {
            addressData.createdAt = firebase.database.ServerValue.TIMESTAMP;
            await addrRef.push(addressData);
          }

          hideAddressModal();
          await loadAddresses();
        } catch (err) {
          console.error('Error saving address:', err);
          alert('حدث خطأ أثناء حفظ العنوان. يرجى المحاولة مرة أخرى.');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'حفظ العنوان';
        }
      });

      window.editAddress = function(key) {
        const data = cachedAddresses[key];
        if (data) showAddressModal(true, key, data);
      };

      window.deleteAddress = async function(key) {
        if (!confirm('هل أنتِ متأكدة من رغبتكِ في حذف هذا العنوان؟')) return;
        try {
          await db.ref('customers/' + currentUser.uid + '/addresses/' + key).remove();
          await loadAddresses();
        } catch (err) {
          console.error('Error deleting address:', err);
          alert('تعذر حذف العنوان.');
        }
      };

      window.setDefaultAddress = async function(key) {
        try {
          const addrRef = db.ref('customers/' + currentUser.uid + '/addresses');
          const allSnap = await addrRef.once('value');
          if (allSnap.exists()) {
            const updates = {};
            allSnap.forEach(child => {
              updates[child.key + '/isDefault'] = (child.key === key);
            });
            await addrRef.update(updates);
            await loadAddresses();
          }
        } catch (err) {
          console.error('Error setting default address:', err);
        }
      };

      // -------------------------------------------------------------
      // ج) قائمة المفضلة (Wishlist)
      // -------------------------------------------------------------
      async function loadWishlist() {
        const loadingEl = document.getElementById('wishlistLoading');
        const container = document.getElementById('wishlistContainer');
        const emptyEl = document.getElementById('wishlistEmpty');
        const countBadge = document.getElementById('wishlistCountBadge');

        try {
          const snap = await db.ref('wishlists/' + currentUser.uid).once('value');
          loadingEl.style.display = 'none';

          if (!snap.exists()) {
            cachedWishlist = {};
            container.style.display = 'none';
            emptyEl.style.display = 'block';
            if (countBadge) countBadge.textContent = '0';
            return;
          }

          cachedWishlist = snap.val() || {};
          const productIds = Object.keys(cachedWishlist).filter(k => !!cachedWishlist[k]);

          if (countBadge) countBadge.textContent = String(productIds.length);

          if (productIds.length === 0) {
            container.style.display = 'none';
            emptyEl.style.display = 'block';
            return;
          }

          container.innerHTML = '';

          // جلب تفاصيل كل منتج من products/{id}
          for (const pid of productIds) {
            try {
              const pSnap = await db.ref('products/' + pid).once('value');
              if (pSnap.exists()) {
                const data = pSnap.val();
                data.id = pid;
                renderWishlistProduct(data, container);
              }
            } catch (pErr) {
              console.warn('Error fetching product ' + pid, pErr);
            }
          }

          container.style.display = 'grid';
          emptyEl.style.display = 'none';

        } catch (err) {
          console.error('Error loading wishlist:', err);
          loadingEl.style.display = 'none';
          emptyEl.style.display = 'block';
        }
      }

      function renderWishlistProduct(data, container) {
        const productEl = document.createElement('div');
        productEl.className = 'wishlist-product-card';
        productEl.id = 'wishlist-item-' + data.id;

        const productLink = data.slug
          ? \`/product/\${encodeURIComponent(data.slug)}\`
          : \`/product?id=\${data.id}\`;

        const priceRaw = parseFloat(data.price) || 0;
        let priceStr = \`\${priceRaw} ج.م\`;
        let badgeStr = '';

        if (data.originalPrice) {
          const oldPrice = parseFloat(data.originalPrice) || 0;
          priceStr = \`<span class="old-price">\${oldPrice} ج.م</span>\${priceRaw} ج.م\`;
          badgeStr = \`<div class="wishlist-sale-badge">خصم</div>\`;
        } else if (data.onSale && data.discount) {
          const discountPercent = parseFloat(data.discount) || 0;
          const oldPrice = priceRaw / (1 - (discountPercent / 100));
          priceStr = \`<span class="old-price">\${oldPrice.toFixed(0)} ج.م</span>\${priceRaw} ج.م\`;
          badgeStr = \`<div class="wishlist-sale-badge">خصم \${data.discount}%</div>\`;
        }

        const hasVars = typeof hasSelectableVariants === 'function'
          ? hasSelectableVariants(data)
          : (data.hasVariants === true || data.hasVariants === 'true');

        let actionBtn = \`
          <button type="button" class="btn-wishlist-add-cart" onclick="event.stopPropagation(); window.quickAddWishlist('\${data.id}', \\\`\${(data.name || '').replace(/\`/g, '')}\\\`, '\${data.price}', '\${data.image}', '\${data.discount || ''}', \${data.onSale || false}, false, '\${data.slug || ''}')">
            <i class="fas fa-shopping-bag"></i> أضف للسلة
          </button>
        \`;

        if (hasVars) {
          actionBtn = \`
            <button type="button" class="btn-wishlist-add-cart" onclick="event.stopPropagation(); window.location.href='\${productLink}'">
              <i class="fas fa-spray-can"></i> اختاري الرائحة
            </button>
          \`;
        }

        if (data.isSoldOut) {
          badgeStr += \`<div class="wishlist-sale-badge" style="background:#222; top:\${badgeStr ? '35px' : '10px'};">نفذت الكمية</div>\`;
          actionBtn = \`
            <button type="button" disabled class="btn-wishlist-add-cart" style="background:#aaa; cursor:not-allowed;">
              <i class="fas fa-ban"></i> نفذت الكمية
            </button>
          \`;
        }

        productEl.innerHTML = \`
          <div class="wishlist-img-wrap" onclick="window.location.href='\${productLink}'">
            \${badgeStr}
            <img src="\${data.image}" alt="\${data.name}" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1608248597481-496100c80836?auto=format&fit=crop&w=400&q=80';">
          </div>
          <div class="wishlist-card-content">
            <h3 class="wishlist-product-title" onclick="window.location.href='\${productLink}'">\${data.name}</h3>
            <div class="wishlist-price-row">\${priceStr}</div>
            <div class="wishlist-actions">
              \${actionBtn}
              <button type="button" class="btn-wishlist-remove" onclick="window.removeFromWishlist('\${data.id}')">
                <i class="fas fa-trash-alt"></i> إزالة من المفضلة
              </button>
            </div>
          </div>
        \`;

        container.appendChild(productEl);
      }

      window.removeFromWishlist = async function(productId) {
        if (!currentUser) return;
        try {
          await db.ref('wishlists/' + currentUser.uid + '/' + productId).remove();
          delete cachedWishlist[productId];

          const el = document.getElementById('wishlist-item-' + productId);
          if (el) el.remove();

          const remaining = Object.keys(cachedWishlist).length;
          const countBadge = document.getElementById('wishlistCountBadge');
          if (countBadge) countBadge.textContent = String(remaining);

          if (remaining === 0) {
            document.getElementById('wishlistContainer').style.display = 'none';
            document.getElementById('wishlistEmpty').style.display = 'block';
          }
        } catch (err) {
          console.error('Error removing from wishlist:', err);
          alert('تعذر إزالة المنتج من المفضلة.');
        }
      };

      window.quickAddWishlist = function(id, name, price, image, discount, onSale, hasVariants, slug) {
        if (typeof window.quickAdd === 'function') {
          window.quickAdd(id, name, price, image, discount, onSale, hasVariants, slug);
        } else {
          let cart = JSON.parse(localStorage.getItem("cart")) || [];
          const existIndex = cart.findIndex(item => (item.productId || item.id) === id);
          if (existIndex !== -1) {
            cart[existIndex].quantity = (parseInt(cart[existIndex].quantity) || 0) + 1;
          } else {
            cart.push({ id, productId: id, name, price, image, discount, onSale, quantity: 1 });
          }
          localStorage.setItem("cart", JSON.stringify(cart));
          if (typeof window.updateSharedCartCount === 'function') window.updateSharedCartCount();
        }

        alert('تمت إضافة المنتج إلى سلة مشترياتك بنجاح! 🛍️');
      };

    })();
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate``)}`
	})}`;
}, "/app/applet/src/pages/account.astro", void 0);
var $$file = "/app/applet/src/pages/account.astro";
var $$url = "/account";
//#endregion
//#region \0virtual:astro:page:src/pages/account@_@astro
var page = () => account_exports;
//#endregion
export { page };
