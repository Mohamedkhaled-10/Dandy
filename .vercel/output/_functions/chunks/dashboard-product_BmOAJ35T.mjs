import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_lUswI9jr.mjs";
import { t as createComponent } from "./compiler_BZhHLwe9.mjs";
import { t as $$BaseLayout } from "./BaseLayout_TSlOutx5.mjs";
//#region src/pages/dashboard-product.astro
var dashboard_product_exports = /* @__PURE__ */ __exportAll({
	default: () => $$DashboardProduct,
	file: () => $$file,
	url: () => $$url
});
var $$DashboardProduct = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "مدير مخزن ومستحضرات الشحن | لوحة داندي",
		"description": "إدارة منتجات ومخزن متجر داندي وإضافة وتعديل المستحضرات والعروض الخاصة",
		"robots": "noindex, nofollow",
		"showDashboardNav": true
	}, {
		"default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<section class="manager-section container"><div class="dashboard-stats" id="dashboardStats"><div class="stat-card"><div class="stat-icon"><i class="fas fa-box"></i></div><div class="stat-info"><h4>إجمالي المنتجات</h4><span id="stat-total">0</span></div></div><div class="stat-card"><div class="stat-icon" style="background: rgba(217, 141, 153, 0.1); color: var(--color-blush);"><i class="fas fa-tags"></i></div><div class="stat-info"><h4>نشطة ومتاحة</h4><span id="stat-active">0</span></div></div><div class="stat-card"><div class="stat-icon" style="background: rgba(220, 53, 69, 0.1); color: #dc3545;"><i class="fas fa-ban"></i></div><div class="stat-info"><h4>نفذت الكمية</h4><span id="stat-soldout">0</span></div></div><div class="stat-card"><div class="stat-icon" style="background: rgba(194, 136, 52, 0.1); color: var(--color-gold);"><i class="fas fa-percentage"></i></div><div class="stat-info"><h4>عروض التخفيضات</h4><span id="stat-sale">0</span></div></div></div><div class="manager-layout"><div class="manager-card"><h3><i class="fas fa-box-open" style="color: var(--color-blush);"></i> إضافة / تعديل مستحضر تجميلي</h3><form id="productForm"><input type="hidden" id="edit-id"><div class="form-group-admin" style="margin-bottom: 16px;"><label for="p-name">اسم المستحضر الكامل</label><input type="text" id="p-name" placeholder="مثال: كريم داندي لترطيب ونضارة المسام" required></div><div class="form-row"><div class="form-group-admin"><label for="p-price">السعر النهائي (جنيه)</label><input type="number" id="p-price" placeholder="السعر الحالي للمنتج" required></div><div class="form-group-admin"><label for="p-originalPrice">السعر القديم (اختياري)</label><input type="number" id="p-originalPrice" placeholder="سيظهر مشطوباً ليلفت الانتباه"></div><div class="form-group-admin"><label for="p-discount">نسبة الخصم المئوية (%)</label><input type="number" id="p-discount" placeholder="نسبة الخصم لعروض special offers" min="0" max="100"></div><div class="form-group-admin"><label for="p-stockQuantity">الكمية المتوفرة (اختياري)</label><input type="number" id="p-stockQuantity" placeholder="اتركه فارغاً لعدم تتبع المخزون" min="0"></div></div><div class="form-row"><div class="form-group-admin"><label for="p-category">فئة وتصنيف المنتج</label><select id="p-category"><option value="Body care">Body care</option><option value="Hair care">Hair care</option><option value="Skin care">Skin care</option><option value="Perfume">Perfume</option></select></div><div class="form-group-admin"><label for="p-rating">التقييم الأصلي (من 5 نجوم)</label><input type="number" id="p-rating" placeholder="مثال: 5" min="1" max="5" step="0.1" required></div></div><div class="form-group-admin" style="margin-bottom: 16px;"><label for="p-image">رابط صورة المستحضر الثابتة</label><div class="img-preview-wrapper"><input type="url" id="p-image" placeholder="https://unsplash.com/... أو رابط مباشر آخر" required style="flex: 1;"><img loading="lazy" id="imagePreview" class="img-preview-box" alt="Preview"></div></div><div class="form-group-admin" style="margin-bottom: 16px;"><div style="display: flex; align-items: center; width: 100%; margin-bottom: 6px;"><label for="p-description">الوصف التفصيلي الدقيق للمنتج وفوائده</label><button type="button" class="btn-template" onclick="insertDescriptionTemplate()"><i class="fas fa-magic"></i> إدراج نموذج منسق</button></div><textarea id="p-description" rows="8" placeholder="اكتبي المكونات وطريقة الاستخدام والمميزات الطبيعية المبهرة بشرح وافٍ..." required></textarea></div><!-- نظام خيارات الروائح والأنواع (Product Variants) --><div class="variants-admin-card"><div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;"><label class="chk-label" style="font-weight: 800; font-size: 0.95rem; cursor: pointer; color: var(--color-primary);"><input type="checkbox" id="p-hasVariants"><i class="fas fa-spray-can" style="color: var(--color-blush);"></i> تفعيل خيارات الروائح لهذا المنتج</label><span style="font-size: 0.75rem; background: rgba(219, 39, 119, 0.1); color: var(--color-blush); font-weight: 700; padding: 4px 10px; border-radius: 20px;">مسك، عطور، بودي سبلاش، إلخ</span></div><div id="variantsAdminBody" style="display: none; margin-top: 14px; border-top: 1px dashed var(--border-light); padding-top: 14px;"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"><h4 style="font-size: 0.95rem; font-weight: 800; color: var(--color-primary); margin: 0;"><i class="fas fa-list-ul" style="color: var(--color-gold);"></i> خيارات الروائح</h4><span id="variantCountText" style="font-size: 0.8rem; color: var(--color-muted); font-weight: 700;">0 روائح مسجلة</span></div><p style="font-size: 0.82rem; color: var(--color-muted); margin-bottom: 12px; line-height: 1.5;">أضيفي أسماء الروائح المتاحة. يمكنك تعديل الاسم، التحكم بحالة التوفر (متاح)، إعادة ترتيب الروائح بالأزرار، أو حذف أي رائحة.</p><div id="variantRowsList" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px;"><!-- الصفوف تضاف ديناميكياً --></div><div><button type="button" class="btn" style="background: #fff; border: 1.5px dashed var(--color-blush); color: var(--color-blush); padding: 9px 18px; border-radius: 8px; font-weight: 800; font-size: 0.88rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s ease;" onclick="addVariantRow()" onmouseover="this.style.background='rgba(219,39,119,0.05)'" onmouseout="this.style.background='#fff'"><i class="fas fa-plus"></i> إضافة رائحة</button></div></div></div><div class="chk-row"><label class="chk-label"><input type="checkbox" id="p-bestSeller"> تمييز كـ "الأكثر مبيعاً"</label><label class="chk-label"><input type="checkbox" id="p-onSale"> خاضع لـ "العروض الخاصة"</label><label class="chk-label" style="color:#dc3545;"><input type="checkbox" id="p-isSoldOut"> نفذت الكمية (Sold Out)</label><label class="chk-label" style="color:#6c757d;"><input type="checkbox" id="p-isHidden"> إخفاء المنتج من المتجر</label></div><div style="display: flex; gap: 10px;"><button type="submit" class="btn" style="background:var(--color-blush); color:#fff; flex:1; padding:12px; border-radius:8px; border:none; font-weight:800; font-size:1rem; cursor:pointer; transition:0.2s;" id="saveBtn"><i class="fas fa-plus"></i> إضافة المستحضر للرفوف</button><button type="button" class="btn" style="background:#fff; border:1px solid var(--border-light); color:var(--color-muted); padding:12px; border-radius:8px; font-weight:700; cursor:pointer; display:none; transition:0.2s;" id="cancelEdit" onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background='#fff'">إلغاء التعديل</button></div></form></div><div class="manager-card"><div class="admin-products-header"><h3><i class="fas fa-boxes" style="color: var(--color-gold);"></i> المنتجات المنشورة</h3><div class="controls-wrapper"><button class="btn-export" onclick="exportProductsCSV()" title="تصدير بيانات المنتجات في ملف CSV"><i class="fas fa-file-export"></i> تصدير البيانات</button><div class="search-input-wrapper"><i class="fas fa-search"></i><input type="text" id="liveSearchProduct" class="admin-search-input" placeholder="بحث بالاسم..."></div><select id="admin-sort-select" class="admin-filter-select" aria-label="ترتيب المنتجات"><option value="default">الترتيب الافتراضي</option><option value="price-asc">السعر: من الأقل للأعلى</option><option value="price-desc">السعر: من الأعلى للأقل</option></select><select id="admin-filter-select" class="admin-filter-select" aria-label="تصفية الفئات"><option value="all">كل الفئات</option><option value="Body care">Body care</option><option value="Hair care">Hair care</option><option value="Skin care">Skin care</option><option value="Perfume">Perfume</option></select></div></div><div id="adminProductGrid" class="admin-product-grid"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div></div></div></section><script>
    const auth = window.auth || (typeof firebase !== 'undefined' ? firebase.auth() : null);
    const db = window.db || (typeof firebase !== 'undefined' ? firebase.database() : null);

    async function logAdminAction(actionText) {
      try {
        const user = firebase.auth().currentUser;
        await firebase.firestore().collection('change_logs').add({
          adminEmail: user ? user.email : 'غير معروف',
          action: actionText,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (err) {
        console.error('Failed to log admin action:', err);
      }
    }

    let rawProducts = [];

    const adminFilterSelect = document.getElementById('admin-filter-select');
    const adminSortSelect = document.getElementById('admin-sort-select');
    const liveSearchProduct = document.getElementById('liveSearchProduct');
    const adminProductGrid = document.getElementById('adminProductGrid');
    const productForm = document.getElementById('productForm');
    const editIdEl = document.getElementById('edit-id');
    const saveBtn = document.getElementById('saveBtn');
    const cancelEditBtn = document.getElementById('cancelEdit');
    const imgInput = document.getElementById('p-image');
    const imgPreview = document.getElementById('imagePreview');

    const hasVariantsCheckbox = document.getElementById('p-hasVariants');
    const variantsAdminBody = document.getElementById('variantsAdminBody');
    const variantRowsList = document.getElementById('variantRowsList');
    const variantCountText = document.getElementById('variantCountText');

    let currentVariants = [];

    function toggleVariantsAdmin(forceState) {
      const show = typeof forceState === 'boolean' ? forceState : (hasVariantsCheckbox && hasVariantsCheckbox.checked);
      if (hasVariantsCheckbox) hasVariantsCheckbox.checked = show;
      if (variantsAdminBody) variantsAdminBody.style.display = show ? 'block' : 'none';
      if (show && currentVariants.length === 0) {
        addVariantRow();
      }
    }
    if (hasVariantsCheckbox) {
      hasVariantsCheckbox.addEventListener('change', () => toggleVariantsAdmin());
    }

    function generateSafeVariantId(name, existingIds) {
      let slug = (name || '')
        .trim()
        .toLowerCase()
        .replace(/[\\s_]+/g, '-')
        .replace(/[^\\w\\u0621-\\u064A-]+/g, '')
        .replace(/^-+|-+$/g, '');
      if (!slug) slug = 'scent';
      let candidate = slug;
      let counter = 1;
      while (existingIds.has(candidate)) {
        candidate = \`\${slug}-\${counter}\`;
        counter++;
      }
      return candidate;
    }

    function generateProductSlug(name, existingSlugs) {
      let slug = (name || '')
        .trim()
        .replace(/[^\\u0621-\\u064Aa-zA-Z0-9\\s-]/g, '')
        .replace(/\\s+/g, '-');
      if (!slug) slug = 'product';
      let candidate = slug;
      let counter = 2;
      while (existingSlugs.has(candidate)) {
        candidate = \`\${slug}-\${counter}\`;
        counter++;
      }
      return candidate;
    }

    function renderVariantRows() {
      if (!variantRowsList) return;
      variantRowsList.innerHTML = '';
      currentVariants.forEach((v, idx) => {
        const row = document.createElement('div');
        row.className = 'variant-item-row';
        row.dataset.id = v.id;
        row.innerHTML = \`
          <span class="v-order-num">\${idx + 1}</span>
          <input type="text" class="v-name-input" placeholder="اسم الرائحة (مثال: مسك أبيض)" value="\${v.name || ''}" oninput="updateVariantName(\${idx}, this.value)" required />
          <label class="v-avail-label" title="حالة توفر هذه الرائحة">
            <input type="checkbox" class="v-avail-input" \${v.isAvailable !== false ? 'checked' : ''} onchange="updateVariantAvail(\${idx}, this.checked)" />
            <span>متاح</span>
          </label>
          <div class="v-reorder-btns">
            <button type="button" class="v-reorder-btn" onclick="moveVariantUp(\${idx})" \${idx === 0 ? 'disabled' : ''} title="تحريك لأعلى">
              <i class="fas fa-chevron-up"></i>
            </button>
            <button type="button" class="v-reorder-btn" onclick="moveVariantDown(\${idx})" \${idx === currentVariants.length - 1 ? 'disabled' : ''} title="تحريك لأسفل">
              <i class="fas fa-chevron-down"></i>
            </button>
          </div>
          <button type="button" class="v-del-btn" onclick="removeVariantRow(\${idx})" title="حذف الرائحة"><i class="fas fa-trash-alt"></i></button>
        \`;
        variantRowsList.appendChild(row);
      });

      if (variantCountText) {
        variantCountText.textContent = \`\${currentVariants.length} روائح مسجلة\`;
      }
    }

    window.addVariantRow = function(name = '', id = '', isAvailable = true) {
      const existingIds = new Set(currentVariants.map(v => v.id).filter(Boolean));
      const finalId = id || (name ? generateSafeVariantId(name, existingIds) : generateSafeVariantId('', existingIds));
      currentVariants.push({
        id: finalId,
        name: name,
        isAvailable: isAvailable !== false,
        price: null
      });
      renderVariantRows();
    };

    window.removeVariantRow = function(idx) {
      currentVariants.splice(idx, 1);
      renderVariantRows();
    };

    window.updateVariantName = function(idx, value) {
      if (!currentVariants[idx]) return;
      currentVariants[idx].name = value;
      if (!currentVariants[idx].id || currentVariants[idx].id.startsWith('scent-') || currentVariants[idx].id === 'scent') {
        const otherIds = new Set(currentVariants.map((v, i) => i !== idx ? v.id : null).filter(Boolean));
        currentVariants[idx].id = generateSafeVariantId(value, otherIds);
      }
    };

    window.updateVariantAvail = function(idx, isAvail) {
      if (!currentVariants[idx]) return;
      currentVariants[idx].isAvailable = Boolean(isAvail);
    };

    window.moveVariantUp = function(idx) {
      if (idx <= 0 || idx >= currentVariants.length) return;
      const temp = currentVariants[idx];
      currentVariants[idx] = currentVariants[idx - 1];
      currentVariants[idx - 1] = temp;
      renderVariantRows();
    };

    window.moveVariantDown = function(idx) {
      if (idx < 0 || idx >= currentVariants.length - 1) return;
      const temp = currentVariants[idx];
      currentVariants[idx] = currentVariants[idx + 1];
      currentVariants[idx + 1] = temp;
      renderVariantRows();
    };

    if (imgInput && imgPreview) {
      imgInput.addEventListener('input', () => {
        const val = imgInput.value.trim();
        if(val) {
          imgPreview.src = val;
          imgPreview.style.display = 'block';
        } else {
          imgPreview.style.display = 'none';
          imgPreview.src = '';
        }
      });
    }

    function normalizeCategory(cat) {
      if (!cat) return 'Skin care';
      const c = cat.toLowerCase().trim();
      if (c === 'hair care' || c === 'منتجات الشعر' || c === 'عناية بالشعر') return 'Hair care';
      if (c === 'body care' || c === 'منتجات الجسم') return 'Body care';
      if (c === 'skin care' || c === 'عناية بالبشرة' || c === 'الزيوت العضوية' || c === 'مستحضرات النقاء') return 'Skin care';
      if (c === 'perfume' || c === 'منتجات العطور') return 'Perfume';
      return cat;
    }

    if (auth) {
      auth.onAuthStateChanged(user => {
        if (!user) {
          window.location.href = '/login';
        } else {
          listenToProducts();
        }
      });
    }

    function listenToProducts(){
      if (!db) return;
      db.ref('products').on('value', snap => {
        let tempArr = [];
        if(snap.exists()) {
          snap.forEach(child => {
            tempArr.push({id: child.key, ...child.val()});
          });
        }
        rawProducts = tempArr.reverse();
        updateStats();
        renderProducts();
      });
    }

    function updateStats() {
      const totalEl = document.getElementById('stat-total');
      const activeEl = document.getElementById('stat-active');
      const soldoutEl = document.getElementById('stat-soldout');
      const saleEl = document.getElementById('stat-sale');
      if (totalEl) totalEl.textContent = rawProducts.length;
      if (activeEl) activeEl.textContent = rawProducts.filter(p => !p.isHidden && !p.isSoldOut).length;
      if (soldoutEl) soldoutEl.textContent = rawProducts.filter(p => p.isSoldOut).length;
      if (saleEl) saleEl.textContent = rawProducts.filter(p => p.onSale || p.originalPrice || p.discount).length;
    }

    window.exportProductsCSV = function() {
      if (rawProducts.length === 0) {
        alert("لا يوجد منتجات لتصديرها.");
        return;
      }

      const exportDate = new Date();
      const dateStr = exportDate.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
      const readableDate = exportDate.toLocaleString('ar-EG');

      const headers = ['اسم المنتج', 'الفئة', 'السعر الحالي (EGP)', 'السعر القديم (EGP)', 'نسبة الخصم (%)', 'الكمية المتوفرة', 'التقييم', 'الأكثر مبيعاً', 'عروض خاصة', 'نفذت الكمية', 'مخفي'];
      
      const rows = rawProducts.map(p => {
        return [
          \`"\${(p.name || '').replace(/"/g, '""')}"\`,
          \`"\${normalizeCategory(p.category)}"\`,
          p.price || 0,
          p.originalPrice || '',
          p.discount || 0,
          (p.stockQuantity !== undefined && p.stockQuantity !== null) ? p.stockQuantity : 'غير محدد',
          p.rating || 5,
          p.bestSeller ? 'نعم' : 'لا',
          p.onSale ? 'نعم' : 'لا',
          p.isSoldOut ? 'نعم' : 'لا',
          p.isHidden ? 'نعم' : 'لا'
        ].join(',');
      });

      const metadataRow = \`"تاريخ ووقت التصدير:","\${readableDate}"\\n\\n\`;
      const csvContent = "data:text/csv;charset=utf-8,\\uFEFF" + metadataRow + headers.join(',') + '\\n' + rows.join('\\n');
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', \`Dandy_Products_Export_\${dateStr}.csv\`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    function renderProducts() {
      if (!adminProductGrid || !adminFilterSelect || !adminSortSelect || !liveSearchProduct) return;
      const currentFilter = adminFilterSelect.value;
      const currentSort = adminSortSelect.value;
      const searchQuery = liveSearchProduct.value.trim().toLowerCase();
      
      adminProductGrid.innerHTML = '';

      if(rawProducts.length === 0) {
        adminProductGrid.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-muted);grid-column:1/-1;">المخزن مفرغ بالكامل من أي معروضات.</p>';
        return;
      }

      let filtered = rawProducts.filter(p => {
        const normCat = normalizeCategory(p.category);
        const matchesCat = (currentFilter === 'all' || normCat === currentFilter);
        const matchesSearch = (p.name || '').toLowerCase().includes(searchQuery);
        return matchesCat && matchesSearch;
      });

      if (currentSort === 'price-asc') {
        filtered.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
      } else if (currentSort === 'price-desc') {
        filtered.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
      }

      if(filtered.length === 0) {
        adminProductGrid.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-muted);grid-column:1/-1;">لا يوجد منتجات مطابقة للبحث أو التصفية.</p>';
        return;
      }

      filtered.forEach(d => {
        const normCat = normalizeCategory(d.category);
        
        let badgesHtml = '';
        if(d.hasVariants && Array.isArray(d.variants) && d.variants.length > 0) {
          badgesHtml += \`<span class="admin-badge admin-badge-variants" title="يحتوي على \${d.variants.length} خيارات روائح"><i class="fas fa-spray-can"></i> \${d.variants.length} روائح</span>\`;
        }
        if(d.bestSeller) badgesHtml += '<span class="admin-badge admin-badge-best">الأكثر مبيعاً</span>';
        if(d.onSale) badgesHtml += '<span class="admin-badge admin-badge-sale">خصم خاص</span>';
        if(d.isHidden) badgesHtml += '<span class="admin-badge admin-badge-hidden">مخفي</span>';
        if(d.isSoldOut) badgesHtml += '<span class="admin-badge admin-badge-soldout">نفذت الكمية</span>';

        let priceHtml = \`\${d.price || 0} EGP\`;
        if (d.originalPrice) {
          priceHtml = \`\${d.price} EGP <span class="old-price">\${d.originalPrice} EGP</span>\`;
        } else if(d.onSale && d.discount) {
          const originalPrice = ((d.price * 100) / (100 - d.discount)).toFixed(0);
          priceHtml = \`\${d.price} EGP <span class="old-price">\${originalPrice} EGP</span>\`;
        }

        let stockBadgeHtml = '';
        if (typeof d.stockQuantity === 'number') {
          const qty = d.stockQuantity;
          let stockBg = '#ecfdf5';
          let stockColor = '#065f46';
          let stockBorder = '#a7f3d0';
          let stockIcon = 'fa-cubes';

          if (qty <= 0) {
            stockBg = '#fef2f2';
            stockColor = '#991b1b';
            stockBorder = '#fecaca';
            stockIcon = 'fa-times-circle';
          } else if (qty <= 3) {
            stockBg = '#fffbeb';
            stockColor = '#92400e';
            stockBorder = '#fde68a';
            stockIcon = 'fa-exclamation-triangle';
          }

          stockBadgeHtml = \`<span style="display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; font-weight:800; padding:2px 8px; border-radius:6px; background:\${stockBg}; color:\${stockColor}; border:1px solid \${stockBorder};" title="الكمية المتوفرة بالمخزون: \${qty}"><i class="fas \${stockIcon}"></i> المخزون: \${qty}</span>\`;
        }

        const card = document.createElement('div');
        card.className = 'admin-p-card';
        card.innerHTML = \`
          <div class="admin-p-img-box">
            <div class="admin-p-badges">\${badgesHtml}</div>
            <img src="\${d.image || ''}" alt="\${d.name || ''}" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1608248597481-496100c80836?auto=format&fit=crop&w=400&q=80';">
          </div>
          <div class="admin-p-content">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:6px;">
              <span class="admin-p-cat" style="margin-bottom:0;"><i class="fas fa-tags"></i> \${normCat}</span>
              \${stockBadgeHtml}
            </div>
            <h4 class="admin-p-title" title="\${d.name || ''}">\${d.name || ''}</h4>
            
            <div class="quick-toggles-row">
              <button class="btn-qt \${d.isSoldOut ? 'active-danger' : ''}" onclick="toggleStatus('\${d.id}', 'isSoldOut', \${!!d.isSoldOut})" title="إيقاف / تشغيل: نفذت الكمية"><i class="fas fa-ban"></i> \${d.isSoldOut ? 'متوفر' : 'نفاذ'}</button>
              <button class="btn-qt \${d.isHidden ? 'active-muted' : ''}" onclick="toggleStatus('\${d.id}', 'isHidden', \${!!d.isHidden})" title="إخفاء / إظهار المنتج"><i class="fas \${d.isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i> \${d.isHidden ? 'إظهار' : 'إخفاء'}</button>
            </div>

            <div class="admin-p-price">\${priceHtml}</div>
            
            <div class="admin-p-actions">
              <button class="admin-p-btn admin-btn-edit" onclick="startProductEdit('\${d.id}')"><i class="fas fa-edit"></i> تعديل</button>
              <a href="\${d.slug ? \`/product/\${encodeURIComponent(d.slug)}\` : \`/product?id=\${d.id}\`}" target="_blank" class="admin-p-btn admin-btn-view"><i class="fas fa-external-link-alt"></i></a>
              <button class="admin-p-btn admin-btn-del" onclick="deleteProduct('\${d.id}')" aria-label="حذف"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        \`;
        adminProductGrid.appendChild(card);
      });
    }

    if (adminFilterSelect) adminFilterSelect.addEventListener('change', renderProducts);
    if (adminSortSelect) adminSortSelect.addEventListener('change', renderProducts);
    if (liveSearchProduct) liveSearchProduct.addEventListener('input', renderProducts);

    window.toggleStatus = async function(id, field, currentValue) {
      if (!db) return;
      try {
        await db.ref(\`products/\${id}\`).update({ [field]: !currentValue });
      } catch(err) {
        alert('حدث خطأ أثناء تحديث حالة المنتج.');
      }
    };

    if (productForm) {
      productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!db) return;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        saveBtn.disabled = true;

        const name = document.getElementById('p-name').value.trim();
        if (!name) {
          alert('يرجى إدخال اسم المستحضر (لا يمكن ترك اسم المنتج فارغاً).');
          saveBtn.disabled = false;
          saveBtn.innerHTML = editIdEl && editIdEl.value ? '<i class="fas fa-check"></i> حفظ تعديلات المستحضر' : '<i class="fas fa-plus"></i> إضافة المستحضر للرفوف';
          return;
        }
        const price = parseFloat(document.getElementById('p-price').value) || 0;
        const originalPrice = parseFloat(document.getElementById('p-originalPrice').value) || '';
        const discount = parseFloat(document.getElementById('p-discount').value) || 0;
        const category = document.getElementById('p-category').value;
        const rating = parseFloat(document.getElementById('p-rating').value) || 5;
        const image = document.getElementById('p-image').value.trim();
        const description = document.getElementById('p-description').value.trim();
        
        const bestSeller = document.getElementById('p-bestSeller').checked;
        const onSale = document.getElementById('p-onSale').checked;
        let isSoldOut = document.getElementById('p-isSoldOut').checked;
        const isHidden = document.getElementById('p-isHidden').checked;

        const stockInput = document.getElementById('p-stockQuantity');
        const stockVal = stockInput ? stockInput.value.trim() : '';
        let stockQuantity = null;

        if (stockVal !== '') {
          const parsedStock = parseInt(stockVal, 10);
          if (!isNaN(parsedStock)) {
            stockQuantity = Math.max(0, parsedStock);
            if (stockQuantity <= 0) {
              isSoldOut = true;
            }
          }
        }

        const editId = editIdEl ? editIdEl.value : '';

        const hasVariants = hasVariantsCheckbox ? hasVariantsCheckbox.checked : false;
        let variantsPayload = [];

        if (hasVariants) {
          const seenIds = new Set();
          for (let i = 0; i < currentVariants.length; i++) {
            const v = currentVariants[i];
            const vName = (v.name || '').trim();
            let vId = (v.id || '').trim();
            const vAvail = v.isAvailable !== false;

            if (!vName) {
              alert(\`الرائحة رقم \${i + 1}: يرجى كتابة اسم الرائحة (لا يمكن حفظ خيار بدون اسم).\`);
              saveBtn.disabled = false;
              saveBtn.innerHTML = editId ? '<i class="fas fa-check"></i> حفظ تعديلات المستحضر' : '<i class="fas fa-plus"></i> إضافة المستحضر للرفوف';
              return;
            }

            if (!vId) {
              vId = generateSafeVariantId(vName, seenIds);
            }

            if (seenIds.has(vId)) {
              vId = generateSafeVariantId(vId, seenIds);
            }

            seenIds.add(vId);
            variantsPayload.push({
              id: vId,
              name: vName,
              isAvailable: vAvail,
              price: v.price !== undefined ? v.price : null
            });
          }

          if (variantsPayload.length === 0) {
            alert('لقد قمتِ بتفعيل خيارات الروائح ولكن لم يتم إضافة أي رائحة. يرجى إضافة رائحة واحدة على الأقل أو إلغاء تفعيل الخيار.');
            saveBtn.disabled = false;
            saveBtn.innerHTML = editId ? '<i class="fas fa-check"></i> حفظ تعديلات المستحضر' : '<i class="fas fa-plus"></i> إضافة المستحضر للرفوف';
            return;
          }
        }

        const payload = {
          name, price, originalPrice: originalPrice || '', discount: discount || '', category, rating, image, description,
          bestSeller, onSale, isSoldOut, isHidden,
          hasVariants: Boolean(hasVariants)
        };

        if (stockQuantity !== null) {
          payload.stockQuantity = stockQuantity;
        } else if (editId) {
          payload.stockQuantity = null;
        }

        if (!editId) {
          const existingSlugs = new Set(rawProducts.map(p => p.slug).filter(Boolean));
          payload.slug = generateProductSlug(name, existingSlugs);
        }

        if (hasVariants) {
          payload.variantType = "scent";
          payload.variants = variantsPayload;
        } else if (editId) {
          payload.variants = null;
          payload.variantType = null;
        }

        try {
          if(editId) {
            await db.ref(\`products/\${editId}\`).update(payload);
            logAdminAction('تم تعديل المنتج: ' + name);
          } else {
            await db.ref('products').push().set(payload);
            logAdminAction('تمت إضافة منتج جديد: ' + name);
          }
          resetProductForm();
        } catch(err) {
          alert('خطأ أثناء حفظ المنتج. يرجى المحاولة لاحقاً.');
        } finally {
          saveBtn.disabled = false;
        }
      });
    }

    window.startProductEdit = function(key) {
      const p = rawProducts.find(item => item.id === key);
      if(!p) return;

      document.getElementById('p-name').value = p.name || '';
      document.getElementById('p-price').value = p.price || '';
      document.getElementById('p-originalPrice').value = p.originalPrice || '';
      document.getElementById('p-discount').value = p.discount || '';
      document.getElementById('p-category').value = normalizeCategory(p.category);
      document.getElementById('p-rating').value = p.rating || 5;
      document.getElementById('p-image').value = p.image || '';
      document.getElementById('p-description').value = p.description || '';

      if (imgInput) imgInput.dispatchEvent(new Event('input'));

      document.getElementById('p-bestSeller').checked = !!p.bestSeller;
      document.getElementById('p-onSale').checked = !!p.onSale;
      document.getElementById('p-isSoldOut').checked = !!p.isSoldOut;
      document.getElementById('p-isHidden').checked = !!p.isHidden;

      const stockEl = document.getElementById('p-stockQuantity');
      if (stockEl) {
        stockEl.value = (p.stockQuantity !== undefined && p.stockQuantity !== null) ? p.stockQuantity : '';
      }

      // تحميل الـ Variants الحالية للمنتج بدقة
      const hasVariants = Boolean(p.hasVariants);
      const rawVariants = Array.isArray(p.variants) ? p.variants : [];
      currentVariants = rawVariants.map(v => ({
        id: String(v.id || '').trim() || generateSafeVariantId(v.name, new Set()),
        name: String(v.name || '').trim(),
        isAvailable: v.isAvailable !== false,
        price: v.price !== undefined ? v.price : null
      }));
      toggleVariantsAdmin(hasVariants);
      renderVariantRows();

      if (editIdEl) editIdEl.value = key;
      if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-check"></i> حفظ تعديلات المستحضر';
      if (cancelEditBtn) cancelEditBtn.style.display = 'inline-block';
      
      window.scrollTo({top: 0, behavior: 'smooth'});
    };

    function resetProductForm(){
      if (productForm) productForm.reset();
      const stockEl = document.getElementById('p-stockQuantity');
      if (stockEl) stockEl.value = '';
      if (editIdEl) editIdEl.value = '';
      if (imgPreview) {
        imgPreview.style.display = 'none';
        imgPreview.src = '';
      }
      currentVariants = [];
      toggleVariantsAdmin(false);
      renderVariantRows();
      if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-plus"></i> إضافة المستحضر للرفوف';
      if (cancelEditBtn) cancelEditBtn.style.display = 'none';
    }
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', resetProductForm);

    window.deleteProduct = async function(key) {
      if(!confirm('هل أنتِ موقنة بحذف هذا المستحضر التجميلي نهائياً من رفوف داندي؟')) return;
      if (!db) return;
      const targetProd = rawProducts.find(p => p.id === key);
      const productName = targetProd ? (targetProd.name || key) : key;
      try {
        await db.ref(\`products/\${key}\`).remove();
        logAdminAction('تم حذف المنتج: ' + productName);
      } catch(err) {
        alert('فشل الحذف.');
      }
    };

    window.insertDescriptionTemplate = function() {
      const template = \`كريم بديل الليزر من داندى ✨
ودّعي الشعر الزائد مع تركيبة متطورة غنية بالمكونات الطبيعية الفعالة للعناية بالبشرة وتقليل نمو الشعر تدريجيًا بعد الإزالة.

المكونات أو الفوائد:
يحتوي الكريم على زيت السعد، زيت الترمس، زيت الورد، البانثينول، وخلاصات البابونج والصبار والخيار، ليمنح بشرتك نعومة وراحة مع كل استخدام.

مميزات كريم بديل الليزر من داندى:
- يساعد على تقليل نمو الشعر تدريجيًا بعد إزالة الشعر.
- يرطب البشرة بعمق ويمنحها نعومة ولمسة حريرية.
- يخفف التهيج والاحمرار بعد السويت أو الحلاقة.
- يحتوي على خصائص مضادة للبكتيريا تساعد في تقليل التهاب بصيلات الشعر وظهور الحبوب.
- يساعد على توحيد لون البشرة ومنحها إشراقة طبيعية مع الاستخدام المنتظم.
- مناسب للبشرة الحساسة ويمنح إحساسًا بالتهدئة والانتعاش.

طريقة الاستخدام:
- يُستخدم مرتين يوميًا بعد السويت لمدة 10 أيام.
- تُكرر العملية 3 مرات متتالية للحصول على أفضل نتيجة.

النتائج المتوقعة:
تبدأ النتائج في الظهور من أول استخدام، حيث يزداد الوقت بين ظهور الشعر تدريجيًا، ومع الاستمرار في الاستخدام قد يقل ظهور الشعر بنسبة من 70% إلى 90% حسب طبيعة واستجابة الجسم.\`;
      
      const descEl = document.getElementById('p-description');
      if (descEl) descEl.value = template;
    };
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate``)}`
	})}`;
}, "/app/applet/src/pages/dashboard-product.astro", void 0);
var $$file = "/app/applet/src/pages/dashboard-product.astro";
var $$url = "/dashboard-product";
//#endregion
//#region \0virtual:astro:page:src/pages/dashboard-product@_@astro
var page = () => dashboard_product_exports;
//#endregion
export { page };
