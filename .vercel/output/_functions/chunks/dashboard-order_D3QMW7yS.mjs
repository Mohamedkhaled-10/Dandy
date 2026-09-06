import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_BGeKp411.mjs";
import { t as createComponent } from "./compiler_Bovpdavx.mjs";
import { t as $$BaseLayout } from "./BaseLayout_BhK_tACD.mjs";
//#region src/pages/dashboard-order.astro
var dashboard_order_exports = /* @__PURE__ */ __exportAll({
	default: () => $$DashboardOrder,
	file: () => $$file,
	url: () => $$url
});
var $$DashboardOrder = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "مدير وتوزيع الطلبات والفواتير | لوحة داندي",
		"description": "إدارة ومتابعة طلبات وفواتير متجر داندي وتحديث حالات الشحن لحظياً",
		"robots": "noindex, nofollow"
	}, {
		"default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<section class="order-manager-sec container"><div class="kpi-grid" id="kpiDashboard"><div class="kpi-card"><div class="kpi-icon" style="color: #2e7d32; background: #e8f5e9;"><i class="fas fa-money-bill-wave"></i></div><div class="kpi-info"><p>إجمالي المبيعات</p><h4 id="kpi-sales">0 EGP</h4></div></div><div class="kpi-card"><div class="kpi-icon" style="color: #1976d2; background: #e3f2fd;"><i class="fas fa-cart-arrow-down"></i></div><div class="kpi-info"><p>طلبات جديدة</p><h4 id="kpi-new">0</h4></div></div><div class="kpi-card"><div class="kpi-icon" style="color: #ef6c00; background: #fff3e0;"><i class="fas fa-box-open"></i></div><div class="kpi-info"><p>قيد التجهيز / الشحن</p><h4 id="kpi-processing">0</h4></div></div><div class="kpi-card"><div class="kpi-icon" style="color: #c28834; background: #fdf5e6;"><i class="fas fa-check-circle"></i></div><div class="kpi-info"><p>مكتملة ومسلمة</p><h4 id="kpi-completed">0</h4></div></div></div><div class="order-grid-layout"><div class="admin-card-orders"><h3><i class="fas fa-tasks" style="color: var(--color-blush);"></i> إدارة طلبات وحجوزات داندي</h3><div class="orders-header-actions"><div class="top-actions-bar"><div class="search-bar-wrapper"><i class="fas fa-search"></i><input type="text" id="liveSearchInput" placeholder="بحث بالاسم، الهاتف، أو كود الفاتورة..." oninput="handleSearch()"></div><div class="utility-actions"><select id="bulkActionSelect" class="bulk-action-select" aria-label="إجراء جماعي"><option value="">إجراء جماعي...</option><option value="قيد التجهيز">نقل إلى قيد التجهيز</option><option value="تم الشحن">نقل إلى تم الشحن</option><option value="تم التوصيل">نقل إلى تم التوصيل</option></select><button class="btn-utility" onclick="applyBulkAction()"><i class="fas fa-check-double"></i> تطبيق</button><button class="btn-utility export-btn" onclick="exportToCSV()"><i class="fas fa-file-csv"></i> تصدير الطلبات</button></div></div><div class="orders-filter-row"><button class="filter-btn-pill active" onclick="setFilter('الكل')">كل الطلبات</button><button class="filter-btn-pill" onclick="setFilter('جديد')">المستلمة (جديد)</button><button class="filter-btn-pill" onclick="setFilter('قيد التجهيز')">قيد التجهيز</button><button class="filter-btn-pill" onclick="setFilter('تم الشحن')">جاري الشحن</button><button class="filter-btn-pill" onclick="setFilter('تم التوصيل')">تم التوصيل</button><button class="filter-btn-pill" onclick="setFilter('ملغي')">الملغية (ملغي)</button></div></div><div class="orders-table-wrapper"><table class="orders-main-table"><thead><tr><th class="chk-col" style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllOrders" class="row-checkbox" onchange="toggleAllCheckboxes()" aria-label="تحديد الكل"></th><th>كود الفاتورة</th><th>العميلة</th><th>رقم الهاتف</th><th>المحافظة</th><th>تاريخ الصدور</th><th>الحالة الإدارية</th><th style="text-align: center;">إجراءات</th></tr></thead><tbody id="ordersListArea"><tr class="skeleton-row"><td class="chk-col"><div class="skeleton-box" style="width:20px;"></div></td><td><div class="skeleton-box" style="width:80px;"></div></td><td><div class="skeleton-box" style="width:120px;"></div></td><td><div class="skeleton-box" style="width:100px;"></div></td><td><div class="skeleton-box" style="width:90px;"></div></td><td><div class="skeleton-box" style="width:110px;"></div></td><td><div class="skeleton-box" style="width:130px;"></div></td><td><div class="skeleton-box" style="width:100px; margin: 0 auto;"></div></td></tr></tbody></table></div></div></div></section><div class="order-details-pane-modal" id="detailsModal"><div class="order-details-box"><div class="modal-header"><h2><i class="fas fa-file-invoice" style="color: var(--color-blush); margin-left: 8px;"></i> تفاصيل الفاتورة</h2><button class="close-details-btn" id="closeDetailsBtn" aria-label="إغلاق"><i class="fas fa-times"></i></button></div><div class="modal-body" id="printableInvoiceArea"><div style="display: none; text-align: center; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 10px;" id="printHeader"><h1 style="font-family: 'Cairo', sans-serif; font-size: 2rem; margin: 0;">Dandy</h1><p style="margin: 5px 0 0; color: #555;">فاتورة طلب رقم: <span id="md-print-id"></span></p></div><div class="info-grid-cards"><div class="info-card"><h4><i class="fas fa-user-circle"></i> بيانات العميلة</h4><p>الاسم: <strong id="md-name" style="font-size: 1.1rem;">...</strong></p><p>الهاتف: <strong id="md-phone" style="direction: ltr; display: inline-block;">...</strong></p><p>البريد: <span id="md-email">...</span></p></div><div class="info-card"><h4><i class="fas fa-map-marker-alt"></i> عنوان الشحن</h4><p>المحافظة/المدينة: <strong id="md-coords">...</strong></p><p>تفاصيل العنوان: <span id="md-address">...</span></p></div></div><h3 style="font-family:'Cairo', sans-serif; font-size:1.1rem; color:var(--color-primary); margin-bottom:12px; border-bottom: 2px solid var(--color-blush); display: inline-block; padding-bottom: 4px;">المستحضرات المحجوزة</h3><div class="product-list-modal"><table class="orders-main-table" style="font-size:0.9rem; margin-bottom:0;"><thead><tr><th style="width: 60px;">صورة</th><th>المنتج والتفاصيل</th><th style="text-align: center; width: 90px;">الكمية</th><th style="text-align: left; width: 140px;">السعر الإجمالي</th></tr></thead><tbody id="md-items-body"><!-- Items injected here --></tbody><tfoot style="background: var(--color-surface-soft, #fcfcfc);"><tr><td colspan="3" style="text-align: left; font-weight: 800; color: var(--color-primary);">إجمالي الطلب:</td><td id="md-grand-total" style="text-align: left; font-weight: 800; color: var(--color-blush); font-size: 1.1rem;">0 EGP</td></tr></tfoot></table></div></div><div class="modal-footer"><div class="modal-footer-actions"><a href="" id="md-whatsapp" target="_blank" class="btn-whatsapp-modal"><i class="fab fa-whatsapp" style="font-size: 1.2rem;"></i> تواصل بالعميلة</a><button class="btn-copy-modal" id="md-copy-btn"><i class="fas fa-copy"></i> نسخ البيانات</button><button class="btn-print-modal" onclick="window.print()"><i class="fas fa-print"></i> طباعة الفاتورة</button></div><button class="btn" style="background:var(--color-surface-soft, #f0f0f0); color: var(--color-primary); border:none; border-radius:8px; padding:12px 24px; font-weight: 700; cursor: pointer; transition: 0.2s;" id="md-close" onmouseover="this.style.background='#e0e0e0'" onmouseout="this.style.background='#f0f0f0'">إغلاق المعاينة</button></div></div></div><script>
    const auth = window.auth || (typeof firebase !== 'undefined' ? firebase.auth() : null);
    const db = window.db || (typeof firebase !== 'undefined' ? firebase.database() : null);

    // State Variables
    let initialLoad = true;
    let previousOrdersCount = 0;
    let rawOrders = [];
    let currentFiltered = [];
    let selectedFilter = 'الكل';
    let searchQuery = '';
    let searchTimeout = null;
    
    const notificationAudio = { play: () => { console.log('New Order Sound Played'); } }; 

    // DOM Elements
    const selectAllCheckbox = document.getElementById('selectAllOrders');
    const ordersListArea = document.getElementById('ordersListArea');
    const detailsModal = document.getElementById('detailsModal');
    const closeDetailsBtn = document.getElementById('closeDetailsBtn');
    const mdClose = document.getElementById('md-close');

    // Utility: Number Formatter
    const currencyFormatter = new Intl.NumberFormat('en-EG', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });

    // Utility: Normalize Status
    function normalizeStatus(status) {
      let s = (status ?? 'جديد').trim();
      if (s.toLowerCase() === 'new') return 'جديد';
      return s;
    }

    // Filter Buttons Logic
    window.setFilter = function(filterValue) {
      selectedFilter = filterValue;
      document.querySelectorAll('.filter-btn-pill').forEach(btn => {
        btn.classList.remove('active');
        if(btn.innerText.includes(filterValue) || (filterValue === 'الكل' && btn.innerText === 'كل الطلبات')) {
          btn.classList.add('active');
        }
      });
      drawOrdersTable();
    };

    // Auth Guard
    if (auth) {
      auth.onAuthStateChanged(user => {
        if (!user) {
          window.location.href = '/login';
        } else {
          listenToOrders();
        }
      });
    }

    // Search with Debounce
    window.handleSearch = function() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const input = document.getElementById('liveSearchInput');
        searchQuery = input ? input.value.trim().toLowerCase() : '';
        drawOrdersTable();
      }, 300);
    };

    function updateKPIs() {
      let totalSales = 0, newOrders = 0, processingOrders = 0, completedOrders = 0;

      rawOrders.forEach(o => {
        const state = normalizeStatus(o.status);
        
        if (state === 'جديد') newOrders++;
        else if (['قيد التجهيز', 'تم التواصل', 'تم الشحن', 'جاري الشحن'].includes(state)) processingOrders++;
        else if (['تم التوصيل', 'مكتمل'].includes(state)) completedOrders++;

        if (state !== 'ملغي') {
          let orderTotal = 0;
          if (o.totalAmount && !isNaN(parseFloat(o.totalAmount))) {
            orderTotal = parseFloat(o.totalAmount);
          } else if (o.products) {
            let calcSum = Object.values(o.products).reduce((acc, p) => {
              const lineTotal = (typeof p.lineTotal === 'number')
                ? p.lineTotal
                : (Number(p.price) || 0) * (Number(p.quantity) || 1);
              return acc + lineTotal;
            }, 0);
            orderTotal = calcSum + (parseFloat(o.shippingFee) || 0);
          }
          totalSales += orderTotal;
        }
      });

      const kpiSales = document.getElementById('kpi-sales');
      const kpiNew = document.getElementById('kpi-new');
      const kpiProcessing = document.getElementById('kpi-processing');
      const kpiCompleted = document.getElementById('kpi-completed');

      if (kpiSales) kpiSales.textContent = currencyFormatter.format(totalSales) + ' EGP';
      if (kpiNew) kpiNew.textContent = newOrders;
      if (kpiProcessing) kpiProcessing.textContent = processingOrders;
      if (kpiCompleted) kpiCompleted.textContent = completedOrders;
    }

    function listenToOrders(){
      if (!db) return;
      db.ref('orders').limitToLast(100).on('value', snap => {
        let currentOrders = [];
        if (snap.exists()){
          snap.forEach(child => {
            currentOrders.push({ id: child.key, ...child.val() });
          });
          
          currentOrders.sort((a,b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
          
          if(!initialLoad && currentOrders.length > previousOrdersCount) {
            const newestOrder = currentOrders[0];
            if(normalizeStatus(newestOrder.status) === 'جديد') {
               try { notificationAudio.play(); } catch(e) {} 
            }
          }
          previousOrdersCount = currentOrders.length;
        }
        
        rawOrders = currentOrders;
        initialLoad = false;
        updateKPIs();
        drawOrdersTable();
      });
    }

    function drawOrdersTable(){
      if (!ordersListArea) return;
      ordersListArea.innerHTML = '';
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      
      currentFiltered = rawOrders.filter(o => {
        const state = normalizeStatus(o.status);
        const matchesFilter = (selectedFilter === 'الكل' || state === selectedFilter);
        const searchStr = \`\${o.name || ''} \${o.phone || ''} \${o.invoiceCode || ''} \${o.id || ''}\`.toLowerCase();
        const matchesSearch = searchStr.includes(searchQuery);
        return matchesFilter && matchesSearch;
      });

      if(currentFiltered.length === 0){
        ordersListArea.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--color-muted);"><i class="fas fa-search" style="font-size:2rem; margin-bottom:10px; opacity:0.5;"></i><br>لا توجد طلبات مطابقة للبحث أو التصفية الحالية.</td></tr>';
        return;
      }

      currentFiltered.forEach(o => {
        const dateText = o.timestamp ? new Date(o.timestamp).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' }) : '-';
        const state = normalizeStatus(o.status);
        const isNew = (state === 'جديد');
        
        let dropdownClass = 'st-new';
        if(['قيد التجهيز', 'تم التواصل'].includes(state)) dropdownClass = 'st-processing';
        if(['تم الشحن', 'جاري الشحن'].includes(state)) dropdownClass = 'st-shipped';
        if(['تم التوصيل', 'مكتمل'].includes(state)) dropdownClass = 'st-delivered';
        if(state === 'ملغي') dropdownClass = 'st-cancelled';

        const tr = document.createElement('tr');
        if(isNew) tr.classList.add('row-new-order');
        
        tr.innerHTML = \`
          <td class="chk-col" style="text-align: center;">
            <input type="checkbox" class="row-checkbox order-select-cb" value="\${o.id}">
          </td>
          <td data-label="كود الفاتورة" style="font-weight:800;color:var(--color-primary);"><i class="fas fa-hashtag" style="color:var(--border-light); font-size:0.8rem;"></i> \${o.invoiceCode || o.id}</td>
          <td data-label="العميلة" style="font-weight:700;">\${o.name ?? '-'}</td>
          <td data-label="رقم الهاتف" style="direction:ltr; text-align:right; font-weight:600; color:var(--color-muted);">\${o.phone ?? '-'}</td>
          <td data-label="المحافظة"><i class="fas fa-map-marker-alt" style="color:var(--color-blush); font-size:0.8rem; margin-left:4px;"></i> \${o.governorate ?? '-'}</td>
          <td data-label="تاريخ الصدور" style="font-size: 0.85rem; color:var(--color-muted);">\${dateText}</td>
          <td data-label="الحالة الإدارية">
            <select class="status-dropdown-admin \${dropdownClass}" onchange="changeOrderStatus('\${o.id}', this.value)" aria-label="تغيير الحالة">
              <option value="جديد" \${state === 'جديد' ? 'selected' : ''}>جديد</option>
              <option value="قيد التجهيز" \${state === 'قيد التجهيز' || state === 'تم التواصل' ? 'selected' : ''}>قيد التجهيز</option>
              <option value="تم الشحن" \${state === 'تم الشحن' || state === 'جاري الشحن' ? 'selected' : ''}>تم الشحن</option>
              <option value="تم التوصيل" \${state === 'تم التوصيل' || state === 'مكتمل' ? 'selected' : ''}>تم التوصيل</option>
              <option value="ملغي" \${state === 'ملغي' ? 'selected' : ''}>ملغي</option>
            </select>
          </td>
          <td data-label="" style="text-align:center; white-space:nowrap;">
            <button class="action-badge-btn badge-btn-edit" onclick="revealOrder('\${o.id}')" title="معاينة التفاصيل"><i class="fas fa-eye"></i> معاينة</button>
            <button class="action-badge-btn badge-btn-del" onclick="deleteOrder('\${o.id}')" title="حذف الطلب" aria-label="حذف"><i class="fas fa-trash-alt"></i></button>
          </td>
        \`;
        ordersListArea.appendChild(tr);
      });
    }

    window.toggleAllCheckboxes = function() {
      if (!selectAllCheckbox) return;
      const isChecked = selectAllCheckbox.checked;
      document.querySelectorAll('.order-select-cb').forEach(cb => {
        cb.checked = isChecked;
      });
    };

    window.applyBulkAction = async function() {
      const selectEl = document.getElementById('bulkActionSelect');
      const action = selectEl ? selectEl.value : '';
      if(!action) return alert("الرجاء اختيار إجراء أولاً");
      
      const selectedIds = Array.from(document.querySelectorAll('.order-select-cb:checked')).map(cb => cb.value);
      if(selectedIds.length === 0) return alert("الرجاء تحديد طلب واحد على الأقل");

      if(confirm(\`هل أنت متأكد من تغيير حالة \${selectedIds.length} طلب إلى "\${action}"؟\`)) {
        const updates = {};
        selectedIds.forEach(id => {
          updates[\`orders/\${id}/status\`] = action;
        });
        try {
          await db.ref().update(updates);
          if (selectEl) selectEl.value = '';
          if (selectAllCheckbox) selectAllCheckbox.checked = false;
        } catch(err) {
          console.error('Bulk Update Error:', err);
          alert('حدث خطأ أثناء التحديث الجماعي');
        }
      }
    };

    window.exportToCSV = function() {
      if(currentFiltered.length === 0) return alert("لا توجد بيانات لتصديرها");
      
      let csvContent = "\\uFEFFكود الفاتورة,اسم العميل,الهاتف,المحافظة,العنوان التفصيلي,الإجمالي,الحالة\\n";
      
      currentFiltered.forEach(o => {
        const code = \`"\${o.invoiceCode || o.id}"\`;
        const name = \`"\${(o.name || '').replace(/"/g, '""')}"\`;
        const phone = \`"\${o.phone || ''}"\`;
        const gov = \`"\${o.governorate || ''}"\`;
        const address = \`"\${(o.address || '').replace(/"/g, '""')}"\`;
        const status = \`"\${normalizeStatus(o.status)}"\`;
        const orderTotal = o.totalAmount || 0;
        
        csvContent += \`\${code},\${name},\${phone},\${gov},\${address},\${orderTotal},\${status}\\n\`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      if (link.download !== undefined) { 
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", \`Dandy_Orders_\${new Date().toISOString().split('T')[0]}.csv\`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    };

    window.changeOrderStatus = async function(id, val){
      try {
        await db.ref(\`orders/\${id}\`).update({status: val});
      } catch(err) {
        console.error('Status Update Error:', err);
        alert('حدث خطأ أثناء تحديث حالة الطلب.');
      }
    };

    window.deleteOrder = async function(id) {
      if(!confirm('هل أنتِ متأكدة من مسح هذا الطلب بالكامل من قاعدة البيانات؟ (هذا الإجراء لا يمكن التراجع عنه)')) return;
      try {
        await db.ref(\`orders/\${id}\`).remove();
      } catch(err) {
        console.error('Delete Error:', err);
        alert('فشل في مسح الطلب.');
      }
    };

    window.revealOrder = function(id) {
      const o = rawOrders.find(order => order.id === id);
      if(!o) return;

      document.getElementById('md-print-id').textContent = o.invoiceCode || o.id; 
      document.getElementById('md-name').textContent = o.name || 'غير متوفر';
      document.getElementById('md-phone').textContent = o.phone || 'غير متوفر';
      document.getElementById('md-email').textContent = o.email || 'غير متوفر';
      
      const fullLocation = (o.governorate || '') + (o.city ? '، ' + o.city : '');
      document.getElementById('md-coords').textContent = fullLocation || '-';
      document.getElementById('md-address').textContent = o.address || 'لا يوجد تفاصيل للعنوان';

      let productsListText = '';
      if (o.products && Object.keys(o.products).length > 0) {
        productsListText = Object.values(o.products).map(p => {
          const varInfo = typeof getVariantsDisplayInfo === 'function' ? getVariantsDisplayInfo(p) : (p.selectedVariant && p.selectedVariant.name ? { count: 1, label: 'الرائحة', text: p.selectedVariant.name } : null);
          const vInfo = (varInfo && varInfo.text && varInfo.text !== 'undefined') ? \`\\n   \${varInfo.label}: \${varInfo.text}\` : '';
          const pQty = parseInt(p.quantity) || 1;
          const lineTotal = (typeof p.lineTotal === 'number')
            ? p.lineTotal
            : (Number(p.price) || 0) * pQty;
          return \`- \${p.name || 'منتج'}\${vInfo}\\n   الكمية: \${pQty} | الإجمالي: \${currencyFormatter.format(lineTotal)} ج.م\`;
        }).join('\\n');
      }

      const wpSum = \`مرحباً \${o.name ?? 'يا فندم'}، نتواصل معكِ من Dandy لتأكيد تفاصيل طلبك:\\n- كود الفاتورة: \${o.invoiceCode || o.id}\\n- العنوان: \${fullLocation} - \${o.address ?? ''}\\n\\nالمنتجات:\\n\${productsListText}\\n\\nنتمنى لكِ يوماً سعيداً!\`;
      document.getElementById('md-whatsapp').href = \`https://wa.me/\${(o.phone || '').replace(/[^0-9]/g, '')}?text=\${encodeURIComponent(wpSum)}\`;

      const copyBtn = document.getElementById('md-copy-btn');
      const copyText = \`طلب رقم: \${o.invoiceCode || o.id}\\nالاسم: \${o.name || '-'}\\nالهاتف: \${o.phone || '-'}\\nالعنوان: \${fullLocation} - \${o.address || ''}\\n\\nالمنتجات:\\n\${productsListText}\`;
      
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(copyText).then(() => {
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = '<i class="fas fa-check" style="color: green;"></i> تم النسخ بنجاح!';
          copyBtn.style.borderColor = 'green';
          setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.style.borderColor = 'var(--border-light, #eaeaea)';
          }, 2000);
        }).catch(err => {
          console.error('Copy Error:', err);
          alert('فشل في نسخ البيانات، يرجى المحاولة يدوياً.');
        });
      };

      const itemsBody = document.getElementById('md-items-body');
      const grandTotalEl = document.getElementById('md-grand-total');
      itemsBody.innerHTML = '';
      
      let calculatedTotal = 0;

      if (o.products && Object.keys(o.products).length > 0) {
        Object.values(o.products).forEach(p => {
          const itemQty = parseInt(p.quantity) || 1;
          const lineTotal = (typeof p.lineTotal === 'number')
            ? p.lineTotal
            : (Number(p.price) || 0) * (Number(p.quantity) || 1);
          calculatedTotal += lineTotal;
          const varInfo = typeof getVariantsDisplayInfo === 'function' ? getVariantsDisplayInfo(p) : (p.selectedVariant && p.selectedVariant.name ? { count: 1, label: 'الرائحة', text: p.selectedVariant.name } : null);
          
          let variantBadge = '';
          if (varInfo && varInfo.text && String(varInfo.text).trim() !== '' && varInfo.text !== 'undefined') {
            variantBadge = \`
              <div style="display:inline-flex; align-items:center; gap:6px; font-size:0.88rem; color:var(--color-blush); font-weight:700; background:rgba(219,39,119,0.08); padding:3px 10px; border-radius:99px; border:1px solid rgba(219,39,119,0.22); margin-top:4px;">
                <i class="fas fa-spray-can" style="font-size:0.75rem;"></i>
                <span>\${varInfo.label}: <strong>\${varInfo.text}</strong></span>
              </div>
            \`;
          }

          const unitPrice = (typeof p.effectiveUnitPrice === 'number')
            ? p.effectiveUnitPrice
            : (typeof p.lineTotal === 'number' && itemQty > 0 ? (p.lineTotal / itemQty) : (parseFloat(p.price) || 0));

          const tr = document.createElement('tr');
          tr.innerHTML = \`
            <td><img loading="lazy" src="\${p.image}" alt="صورة المنتج" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--border-light); display:block;" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=100&q=80';"></td>
            <td style="color: var(--color-primary);">
              <div style="font-weight:700; font-size:0.98rem;">\${p.name ?? 'منتج غير معروف'}</div>
              \${variantBadge}
              <div style="font-size:0.84rem; color:var(--color-muted); font-weight:600; margin-top:3px;">
                السعر: \${currencyFormatter.format(unitPrice)} ج.م
              </div>
            </td>
            <td style="text-align: center; font-weight: 800; font-size: 1.05rem; background: var(--color-surface-soft); border-radius: 4px; color: var(--color-primary);">\${itemQty}</td>
            <td style="font-weight:800; color:var(--color-blush); text-align: left; font-size: 1rem; white-space: nowrap;">\${currencyFormatter.format(lineTotal)} ج.م</td>
          \`;
          itemsBody.appendChild(tr);
        });
        
        const shippingFee = parseFloat(o.shippingFee) || 0;
        const finalTotal = (parseFloat(o.totalAmount) || (calculatedTotal + shippingFee));
        grandTotalEl.textContent = currencyFormatter.format(finalTotal) + ' ج.م';

      } else {
        itemsBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--color-muted); padding: 20px;">السلة خالية من المنتجات أو غير متوفرة.</td></tr>';
        grandTotalEl.textContent = '0 ج.م';
      }

      const printHeader = document.getElementById('printHeader');
      if (printHeader) printHeader.style.display = 'block';
      if (detailsModal) detailsModal.classList.add('show');
    };

    function hideModal(){
      if (detailsModal) detailsModal.classList.remove('show');
      setTimeout(() => {
        const printHeader = document.getElementById('printHeader');
        if (printHeader) printHeader.style.display = 'none';
      }, 350);
    }
    
    if (closeDetailsBtn) closeDetailsBtn.addEventListener('click', hideModal);
    if (mdClose) mdClose.addEventListener('click', hideModal);
    
    if (detailsModal) {
      detailsModal.addEventListener('click', function(e) {
        if (e.target === detailsModal) hideModal();
      });
    }
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate``)}`
	})}`;
}, "/app/applet/src/pages/dashboard-order.astro", void 0);
var $$file = "/app/applet/src/pages/dashboard-order.astro";
var $$url = "/dashboard-order";
//#endregion
//#region \0virtual:astro:page:src/pages/dashboard-order@_@astro
var page = () => dashboard_order_exports;
//#endregion
export { page };
