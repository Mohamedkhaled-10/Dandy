import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_BGeKp411.mjs";
import { t as createComponent } from "./compiler_Bovpdavx.mjs";
import { t as $$BaseLayout } from "./BaseLayout_BhK_tACD.mjs";
//#region src/pages/all-products.astro
var all_products_exports = /* @__PURE__ */ __exportAll({
	default: () => $$AllProducts,
	file: () => $$file,
	url: () => $$url
});
var $$AllProducts = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "جميع المنتجات | Dandy Cosmetics - منتجات طبيعية للعناية",
		"description": "تصفحي جميع منتجات داندي (Dandy Cosmetics) للعناية بالبشرة والشعر. تشكيلة واسعة من مستحضرات التجميل الطبيعية والمضمونة بأسعار ممتازة.",
		"keywords": "Dandy, Dandy Cosmetics, دندي, داندي, دندي للتجميل, جميع المنتجات, العناية بالبشرة, العناية بالشعر, مستحضرات تجميل, Skincare, Haircare",
		"canonical": "https://dandy-ebon.vercel.app/all-products"
	}, {
		"default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<div class="sidebar-overlay" id="sidebar-overlay" onclick="toggleFilterDrawer()"></div><section class="container" style="padding-top: 130px; text-align: center;"><div class="section-header" style="margin-bottom: 20px;"><span class="sub">Our Special Collections</span></div></section><div class="shop-layout container" style="margin-bottom: 80px;"><button class="mobile-filter-toggle" onclick="toggleFilterDrawer()"><i class="fas fa-filter"></i> Filter & Sort</button><aside class="shop-sidebar" id="shop-sidebar"><button class="close-drawer-btn" onclick="toggleFilterDrawer()"><i class="fas fa-times"></i></button><div class="filter-section"><h3>Search Catalog</h3><div class="catalog-search-wrapper"><div class="catalog-search-box"><button type="button" id="trigger-search" style="background:none; border:none; padding:0; cursor:pointer; color: var(--color-gold); font-size: 1.1rem; display:flex; align-items:center; justify-content:center; outline:none;"><i class="fas fa-search search-icon" style="padding: 0;"></i></button><input type="text" id="search-input" placeholder="Search products..." autocomplete="off"><button type="button" id="clear-search" class="clear-search"><i class="fas fa-times"></i></button></div><div id="search-suggestions" class="search-suggestions"></div><div class="search-meta"><span id="results-count">Showing all products</span></div></div></div><div class="filter-section"><h3>Categories</h3><div class="filter-list" id="category-filters"><label class="filter-label"><input type="checkbox" value="skin care">✨ Skin Care</label><label class="filter-label"><input type="checkbox" value="hair care">🌿 Hair Care</label><label class="filter-label"><input type="checkbox" value="body care">🧴 Body Care</label><label class="filter-label"><input type="checkbox" value="perfume">🌸 Fragrances</label></div></div><div class="filter-section"><h3>Special Status</h3><div class="filter-list" id="status-filters"><label class="filter-label"><input type="checkbox" value="offers">💥 Special Offers</label><label class="filter-label"><input type="checkbox" value="bestseller">⭐ Best Sellers</label></div></div></aside><main class="shop-main"><div class="product-grid" id="productContainer"><p style="text-align: center; grid-column: 1/-1; color: var(--color-muted);"></p></div></main></div><script>
    const db = window.db || firebase.database();

    // Drawer & Accordion Logic
    window.toggleFilterDrawer = function() {
      const sb = document.getElementById('shop-sidebar');
      const so = document.getElementById('sidebar-overlay');
      if (sb) sb.classList.toggle('active');
      if (so) so.classList.toggle('active');
    };
    
    window.toggleAccordion = function(id) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('collapsed');
    };
    
    window.updateBadgesAndClearBtn = function() {
      const checkedBoxes = document.querySelectorAll('.shop-sidebar input[type="checkbox"]:checked');
      const count = checkedBoxes.length;
      
      const sbBadge = document.getElementById('sidebar-badge');
      const flBadge = document.getElementById('float-badge');
      const clearBtn = document.getElementById('clear-all-filters');
      
      if (count > 0) {
        if(sbBadge) sbBadge.style.display = 'inline-block';
        if(flBadge) flBadge.style.display = 'inline-block';
        if(clearBtn) clearBtn.style.display = 'inline-block';
        if(sbBadge) sbBadge.textContent = count;
        if(flBadge) flBadge.textContent = count;
      } else {
        if(sbBadge) sbBadge.style.display = 'none';
        if(flBadge) flBadge.style.display = 'none';
        if(clearBtn) clearBtn.style.display = 'none';
      }
    };

    window.clearAllFilters = function() {
      const checkboxes = document.querySelectorAll('.shop-sidebar input[type="checkbox"]');
      checkboxes.forEach(chk => chk.checked = false);
      window.updateBadgesAndClearBtn();
      document.querySelector('.shop-sidebar input[type="checkbox"]')?.dispatchEvent(new Event('change'));
    };

    // Handle category from URL param initially
    const initUrlParams = new URLSearchParams(window.location.search);
    const initCategory = initUrlParams.get('category')?.toLowerCase();
    if (initCategory) {
      const checkTarget = Array.from(document.querySelectorAll('#category-filters input[type="checkbox"]')).find(chk => chk.value.toLowerCase() === initCategory || (initCategory.includes('hair') && chk.value === 'hair care'));
      if (checkTarget) {
        checkTarget.checked = true;
      }
    }
    window.updateBadgesAndClearBtn();

    // Professional Sidebar Filtering Logic
    const filterCheckboxes = document.querySelectorAll('.shop-sidebar input[type="checkbox"]');
    filterCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        window.updateBadgesAndClearBtn();

        const categoryFilters = Array.from(document.querySelectorAll('#category-filters input[type="checkbox"]'))
          .filter(chk => chk.checked)
          .map(chk => chk.value.toLowerCase());
        
        const statusFilters = Array.from(document.querySelectorAll('#status-filters input[type="checkbox"]'))
          .filter(chk => chk.checked)
          .map(chk => chk.value.toLowerCase());

        const products = document.querySelectorAll('.product');
        products.forEach(product => {
          const category = (product.getAttribute('data-category') || "").toLowerCase();
          const isBestseller = product.getAttribute('data-bestseller') === "true";
          const isOffer = product.getAttribute('data-offer') === "true";
          
          let categoryMatch = false;
          if (categoryFilters.length === 0 || 
              categoryFilters.includes(category) ||
              (category === 'منتجات الشعر' && categoryFilters.includes('hair care')) ||
              (category === 'منتجات الجسم' && categoryFilters.includes('body care')) ||
              (category === 'منتجات العطور' && categoryFilters.includes('perfume')) ||
              (category === 'عناية بالبشرة' && categoryFilters.includes('skin care'))
          ) {
            categoryMatch = true;
          }

          let statusMatch = true;
          if (statusFilters.length > 0) {
            statusMatch = false;
            if (statusFilters.includes('bestseller') && isBestseller) statusMatch = true;
            if (statusFilters.includes('offers') && isOffer) statusMatch = true;
          }

          if (categoryMatch && statusMatch) {
            product.classList.remove('hidden');
          } else {
            product.classList.add('hidden');
          }
        });
      });
    });

    // دالة الإضافة السريعة للسلة
    window.quickAdd = function(id, name, price, image, discount, onSale, hasVariants) {
      if (hasVariants) {
        window.location.href = '/product?id=' + id;
        return;
      }
      let cart = JSON.parse(localStorage.getItem("cart")) || [];
      const productItem = { id, productId: id, name, price, image, discount, onSale };

      if (typeof fbq === 'function') {
        fbq('track', 'AddToCart', {
          content_name: name,
          content_ids: [id],
          content_type: 'product',
          value: parseFloat(price) || 0,
          currency: 'EGP'
        });
      }

      const existIndex = cart.findIndex(item => (item.productId || item.id) === id && (!item.selectedVariants || item.selectedVariants.length === 0) && !item.selectedVariant);
      if(existIndex !== -1) {
        cart[existIndex].quantity = (parseInt(cart[existIndex].quantity) || 0) + 1;
      } else {
        productItem.quantity = 1;
        cart.push(productItem);
      }

      localStorage.setItem("cart", JSON.stringify(cart));
      if (typeof window.updateSharedCartCount === 'function') window.updateSharedCartCount();
      if (typeof updateCartCount === 'function') updateCartCount();

      const alertDiv = document.createElement("div");
      alertDiv.style.position = "fixed";
      alertDiv.style.bottom = "100px";
      alertDiv.style.left = "50%";
      alertDiv.style.transform = "translateX(-50%)";
      alertDiv.style.background = "#2bae66";
      alertDiv.style.color = "#fff";
      alertDiv.style.padding = "14px 28px";
      alertDiv.style.borderRadius = "8px";
      alertDiv.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
      alertDiv.style.zIndex = "1030";
      alertDiv.style.fontWeight = "700";
      alertDiv.style.textAlign = "center";
      alertDiv.innerHTML = \`<i class="fas fa-check-circle" style="margin-right:8px;"></i> Successfully added to bag!\`;
      document.body.appendChild(alertDiv);
      
      setTimeout(() => {
        alertDiv.style.opacity = "0";
        alertDiv.style.transition = "opacity 0.4s ease";
        setTimeout(() => alertDiv.remove(), 400);
      }, 2800);
    };

    const container = document.getElementById("productContainer");
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get("search")?.toLowerCase() || "";
    
    if (searchQuery) {
      const sinp = document.getElementById("search-input");
      if (sinp) sinp.value = searchQuery;
    }

    // Fetch and build catalog cards dynamically from Firebase Realtime Database
    db.ref("products").on("value", snapshot => {
      if (!container) return;
      container.innerHTML = "";
      let matchFound = false;

      if (!snapshot.exists()) {
        container.innerHTML = \`<p style="text-align:center;grid-column:1/-1;color:var(--color-muted);">No products are currently available in our collections.</p>\`;
        return;
      }

      let allProductsData = [];
      snapshot.forEach(child => {
        allProductsData.push({ id: child.key, ...child.val() });
      });
      
      allProductsData.reverse();

      allProductsData.forEach(data => {
        if(data.isHidden) return;

        const name = data.name?.toLowerCase() || "";
        const desc = data.description?.toLowerCase() || "";
        const category = data.category?.toLowerCase() || "";

        if (!searchQuery || name.includes(searchQuery) || desc.includes(searchQuery) || category.includes(searchQuery)) {
          matchFound = true;
          const productEl = document.createElement("div");
          
          productEl.className = "product-card product";
          productEl.setAttribute("data-category", data.category || 'Skin care');
          productEl.setAttribute("data-bestseller", data.bestSeller ? "true" : "false");
          productEl.setAttribute("data-offer", (data.onSale || data.originalPrice) ? "true" : "false");
          productEl.onclick = function() { window.location.href = '/product?id=' + data.id; };

          const priceRaw = parseFloat(data.price) || 0;
          let priceStr = \`<div class="product-price">\${priceRaw} EGP</div>\`;
          let badgeStr = '';

          if (data.originalPrice) {
            const oldPrice = parseFloat(data.originalPrice) || 0;
            priceStr = \`<div class="product-price"><span class="old-price">\${oldPrice} EGP</span>\${priceRaw} EGP</div>\`;
            badgeStr = \`<div class="discount-badge">Sale</div>\`;
          } else if (data.onSale && data.discount) {
            const discountPercent = parseFloat(data.discount) || 0;
            const oldPrice = priceRaw / (1 - (discountPercent/100));
            priceStr = \`<div class="product-price"><span class="old-price">\${oldPrice.toFixed(0)} EGP</span>\${priceRaw} EGP</div>\`;
            badgeStr = \`<div class="discount-badge">Sale \${data.discount}%</div>\`;
          }
          
          const hasVars = typeof hasSelectableVariants === 'function' 
            ? hasSelectableVariants(data) 
            : (data.hasVariants === true || data.hasVariants === 'true');
          
          let actionBtn = \`<button class="add-cart-btn" onclick="event.stopPropagation(); quickAdd('\${data.id}', \\\`\${(data.name||'').replace(/\`/g, '')}\\\`, '\${data.price}', '\${data.image}', '\${data.discount||''}', \${data.onSale||false}, false)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                Add
              </button>\`;

          if (hasVars) {
            actionBtn = \`<button class="add-cart-btn" style="background:var(--color-primary); color:#fff;" onclick="event.stopPropagation(); window.location.href='/product?id=\${data.id}'">
                <i class="fas fa-spray-can" style="margin-left:4px;"></i> اختاري الرائحة
              </button>\`;
          }
          
          if (data.isSoldOut) {
              badgeStr += \`<div class="discount-badge" style="background:#222; top: \${badgeStr ? '35px' : '10px'};">Sold Out</div>\`;
              actionBtn = \`<button disabled class="add-cart-btn" style="background:#aaa; color:#fff; cursor:not-allowed;" onclick="event.stopPropagation();">
                  <i class="fas fa-ban"></i> Sold Out
                </button>\`;
          }

          productEl.innerHTML = \`
            <div class="product-image-wrap">
              \${badgeStr}
              <img src="\${data.image}" alt="\${data.name} - منتج داندي" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1608248597481-496100c80836?auto=format&fit=crop&w=400&q=80';"></div>
            <h3 class="product-title">\${data.name}</h3>
            \${priceStr}
            \${actionBtn}
          \`;
          
          container.appendChild(productEl);
        }
      });

      if (!matchFound) {
        container.innerHTML = \`<p style="text-align:center;grid-column:1/-1;color:var(--color-muted);">Sorry, we couldn't find any results for "\${searchQuery}". Please test other keywords.</p>\`;
      }

      document.querySelector('.shop-sidebar input[type="checkbox"]')?.dispatchEvent(new Event('change'));
    });

    const searchInput = document.getElementById("search-input");
    const clearBtn = document.getElementById("clear-search");
    const resultsCount = document.getElementById("results-count");
    const suggestionsBox = document.getElementById("search-suggestions");

    function runLiveSearch(){
      if (!searchInput) return;
      const query = searchInput.value.trim().toLowerCase();
      const products = document.querySelectorAll(".product");
      let visibleCount = 0;

      products.forEach(product => {
        const title = product.querySelector("h3")?.textContent.toLowerCase() || "";
        const category = product.dataset.category?.toLowerCase() || "";
        const text = title + " " + category;

        if(text.includes(query)){
          product.style.display = "";
          visibleCount++;
        }else{
          product.style.display = "none";
        }
      });

      if(query){
        if(clearBtn) clearBtn.style.display = "flex";
        if(resultsCount) resultsCount.textContent = \`\${visibleCount} product(s) found\`;
      }else{
        if(clearBtn) clearBtn.style.display = "none";
        if(resultsCount) resultsCount.textContent = \`\${visibleCount} product(s) available\`;
      }
      buildSuggestions(query);
    }

    function buildSuggestions(query){
      if(!suggestionsBox) return;
      if(!query){
        suggestionsBox.style.display="none";
        return;
      }

      const names = [];
      document.querySelectorAll(".product h3").forEach(item => {
        const name = item.textContent;
        if(name.toLowerCase().includes(query) && !names.includes(name)){
          names.push(name);
        }
      });

      if(names.length===0){
        suggestionsBox.style.display="none";
        return;
      }

      suggestionsBox.innerHTML = names
        .slice(0,5)
        .map(name => \`
          <div class="search-suggestion-item">
            \${name}
          </div>
        \`)
        .join("");

      suggestionsBox.style.display="block";

      document
        .querySelectorAll(".search-suggestion-item")
        .forEach(item => {
          item.addEventListener("click", () => {
            if (searchInput) searchInput.value = item.textContent.trim();
            runLiveSearch();
            suggestionsBox.style.display="none";
          });
        });
    }

    if (searchInput) {
      searchInput.addEventListener("input", runLiveSearch);
    }

    document.getElementById("trigger-search")?.addEventListener("click", () => {
      runLiveSearch();
      if (searchInput) searchInput.focus();
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (searchInput) {
          searchInput.value = "";
          searchInput.focus();
        }
        runLiveSearch();
      });
    }

    document.addEventListener("click", (e) => {
      if(
        suggestionsBox &&
        !suggestionsBox.contains(e.target) &&
        e.target !== searchInput
      ){
        suggestionsBox.style.display="none";
      }
    });
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate`<meta property="og:type" content="website"><meta property="og:url" content="https://dandy-ebon.vercel.app/all-products"><meta property="og:title" content="جميع المنتجات | Dandy Cosmetics - منتجات طبيعية للعناية"><meta property="og:description" content="تصفحي جميع منتجات داندي (Dandy Cosmetics) للعناية بالبشرة والشعر. تشكيلة واسعة من مستحضرات التجميل الطبيعية والمضمونة بأسعار ممتازة."><meta property="og:image" content="https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="جميع المنتجات | Dandy Cosmetics - منتجات طبيعية للعناية"><meta name="twitter:description" content="تصفحي جميع منتجات داندي (Dandy Cosmetics) للعناية بالبشرة والشعر. تشكيلة واسعة من مستحضرات التجميل الطبيعية والمضمونة بأسعار ممتازة."><meta name="twitter:image" content="https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg"><script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "جميع المنتجات | Dandy Cosmetics",
        "description": "تصفحي جميع منتجات داندي للعناية بالبشرة والشعر الطبيعية.",
        "url": "https://dandy-ebon.vercel.app/all-products"
      }
    <\/script>`)}`
	})}`;
}, "/app/applet/src/pages/all-products.astro", void 0);
var $$file = "/app/applet/src/pages/all-products.astro";
var $$url = "/all-products";
//#endregion
//#region \0virtual:astro:page:src/pages/all-products@_@astro
var page = () => all_products_exports;
//#endregion
export { page };
