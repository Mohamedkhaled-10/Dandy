import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_lUswI9jr.mjs";
import { t as createComponent } from "./compiler_BZhHLwe9.mjs";
import { t as $$BaseLayout } from "./BaseLayout_TSlOutx5.mjs";
//#region src/pages/product.astro
var product_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Product,
	file: () => $$file,
	url: () => $$url
});
var $$Product = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Premium Beauty Products | Dandy",
		"description": "View exclusive botanical ingredients, detailed product information, and special beauty offers from Dandy Egypt.",
		"keywords": "Dandy, Dandy, Skincare Egypt, Hair Care Cairo, Authentic Cosmetics, Luxury Beauty Products Egypt",
		"canonical": "https://dandy-ebon.vercel.app/product"
	}, {
		"default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<main class="container" style="padding-top: 130px; padding-bottom: 60px;"><div class="breadcrumb" id="product-breadcrumb"><a href="/">الرئيسية</a><i class="fas fa-chevron-left separator"></i><a href="/all-products">المنتجات</a><i class="fas fa-chevron-left separator"></i><span class="current" id="bread-product">...</span></div><div class="detail-grid" id="detailFrame"><div class="detail-image-box"><button type="button" class="btn-detail-wishlist" id="detailWishlistBtn" title="حفظ في المفضلة"><i class="far fa-heart"></i></button><img loading="lazy" id="product-img" src="https://images.unsplash.com/photo-1608248597481-496100c80836?auto=format&fit=crop&w=800&q=80" alt="Loading Product Image..."></div><div class="detail-info-box"><span class="p-category" id="product-category">Premium Skin & Hair Care</span><h1 id="product-title">Loading Product Name...</h1><div class="p-rating"><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star-half-alt"></i><span>(4.9 stars) · 92 independent client reviews</span></div><div id="product-desc" class="product-desc-container"><p style="color: var(--color-muted);">Pulling exclusive botanical skincare properties and details from our database...</p></div><div class="price-section" id="product-price-section"><span class="price-current" id="product-price">... EGP</span><span id="price-old-wrapper"></span></div><div class="action-group"><!-- منطقة اختيار الرائحة للمنتجات ذات الـ Variants --><div id="variant-section-container" style="display: none;"></div><div class="primary-action-row"><div class="qty-selector"><button class="qty-btn" id="qty-minus">-</button><input type="number" class="qty-input" id="qty-input" value="1" min="1" max="99"><button class="qty-btn" id="qty-plus">+</button></div><button class="btn-action btn-cart" id="add-to-cart-btn"><i class="fas fa-shopping-basket"></i> أضف إلى السلة</button></div><button type="button" class="btn-action-wishlist" id="actionWishlistBtn"><i class="far fa-heart"></i> <span id="actionWishlistText">إضافة إلى المفضلة</span></button><a class="btn-action btn-wa" id="whatsapp-link" target="_blank"><i class="fab fa-whatsapp"></i> تواصل عبر واتساب</a><div class="social-direct-box"><a class="btn-s btn-fb" id="facebook-link" target="_blank"><i class="fab fa-facebook"></i> ماسنجر</a><a class="btn-s btn-ig" id="instagram-link" target="_blank"><i class="fab fa-instagram"></i> انستجرام</a></div></div><div class="detail-share-area"><div class="share-pill" id="share-toggle"><i class="fas fa-share-alt"></i> Share this product with your friends<div class="pop-options"><a id="share-whatsapp" target="_blank" title="WhatsApp"><i class="fab fa-whatsapp"></i></a><a id="share-facebook" target="_blank" title="Facebook"><i class="fab fa-facebook-f"></i></a><a id="share-instagram" target="_blank" title="Instagram"><i class="fab fa-instagram"></i></a></div></div></div></div></div></main><section class="related-section" id="related-products-section"><div class="container"><h2 class="section-title plain">منتجات مشابهة</h2><div class="product-grid" id="related-products-grid"></div></div></section><script>
    const db = firebase.database();

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const isSlugRoute = pathParts[0] === 'product' && pathParts[1];
    const slugFromPath = isSlugRoute ? decodeURIComponent(pathParts[1]) : null;

    const params = new URLSearchParams(window.location.search);
    const idFromQuery = params.get('id');

    let loadedProduct = null;
    let productKey = null;
    let id = null;
    let selectedVariants = []; // Array of { id, name }

    const detailFrame = document.getElementById("detailFrame");

    // Category normalization helper
    function normalizeCategory(cat) {
      if (!cat) return 'Skin care';
      const c = cat.toLowerCase().trim();
      if (c === 'hair care' || c === 'منتجات الشعر' || c === 'عناية بالشعر') return 'Hair care';
      if (c === 'body care' || c === 'منتجات الجسم') return 'Body care';
      if (c === 'skin care' || c === 'عناية بالبشرة' || c === 'الزيوت العضوية' || c === 'مستحضرات النقاء') return 'Skin care';
      if (c === 'perfume' || c === 'منتجات العطور') return 'Perfume';
      return cat;
    }

    // High-performance custom parser
    function parseDescriptionToHtml(textStr) {
      if (!textStr) return '<p>No description content available for this model.</p>';
      
      let containerHtml = \`<div class="product-desc-wrapper">\`;
      const segments = textStr.split(/\\n\\s*\\n/);
      
      segments.forEach((segment, idx) => {
        let chunk = segment.trim();
        if (!chunk) return;
        
        if (chunk.includes('مميزات') || chunk.startsWith('مميزات:')) {
          const lines = chunk.split('\\n');
          containerHtml += \`<div class="desc-card-section">
            <h4 class="desc-section-title"><i class="fas fa-magic" style="color:var(--color-blush);"></i> \${lines[0]}</h4>
            <ul class="desc-list-points">\`;
          lines.slice(1).forEach(l => {
            let cleanLine = l.replace(/^[-*•\\s\\d)]+/, '').trim();
            if (cleanLine) containerHtml += \`<li><i class="fas fa-check-circle"></i> <span>\${cleanLine}</span></li>\`;
          });
          containerHtml += \`</ul></div>\`;
        } 
        else if (chunk.includes('طريقة الاستخدام') || chunk.startsWith('طريقة الاستخدام:')) {
          const lines = chunk.split('\\n');
          containerHtml += \`<div class="desc-card-section">
            <h4 class="desc-section-title"><i class="fas fa-spa" style="color:var(--color-gold);"></i> \${lines[0]}</h4>
            <ul class="desc-list-points step-list-points">\`;
          lines.slice(1).forEach(l => {
            let cleanLine = l.replace(/^[-*•\\s\\d)]+/, '').trim();
            if (cleanLine) containerHtml += \`<li><i class="fas fa-circle-notch"></i> <span>\${cleanLine}</span></li>\`;
          });
          containerHtml += \`</ul></div>\`;
        }
        else if (chunk.includes('النتائج') || chunk.startsWith('النتائج:')) {
          const lines = chunk.split('\\n');
          containerHtml += \`<div class="desc-card-section results-highlight-box">
            <h4 class="desc-section-title"><i class="fas fa-seedling"></i> \${lines[0]}</h4>
            <p class="desc-text-content">\${lines.slice(1).join('<br>') || lines[0]}</p>
          </div>\`;
        }
        else if (chunk.includes('المكونات') || chunk.includes('الفوائد')) {
          const lines = chunk.split('\\n');
          containerHtml += \`<div class="desc-card-section">
            <h4 class="desc-section-title"><i class="fas fa-flask" style="color:var(--color-blush);"></i> \${lines[0]}</h4>
            <p class="desc-text-content">\${lines.slice(1).join('<br>') || lines[0]}</p>
          </div>\`;
        }
        else {
          if (idx === 0) {
            const lines = chunk.split('\\n');
            containerHtml += \`<h3 class="product-intro-header">\${lines[0]}</h3>\`;
            if (lines.length > 1) {
              containerHtml += \`<p class="product-intro-p">\${lines.slice(1).join('<br>')}</p>\`;
            }
          } else {
            containerHtml += \`<p class="product-intro-p">\${chunk.replace(/\\n/g, '<br>')}</p>\`;
          }
        }
      });
      
      containerHtml += \`</div>\`;
      return containerHtml;
    }

    function updateMetaTag(selector, attrName, value) {
      try {
        let meta = document.querySelector(selector);
        if (meta) {
          meta.setAttribute(attrName, value || '');
        } else {
          meta = document.createElement('meta');
          if (selector.startsWith('meta[property')) {
            const prop = selector.match(/property="([^"]+)"/);
            if (prop) meta.setAttribute('property', prop[1]);
          } else if (selector.startsWith('meta[name')) {
            const nm = selector.match(/name="([^"]+)"/);
            if (nm) meta.setAttribute('name', nm[1]);
          }
          meta.setAttribute(attrName, value || '');
          document.head.appendChild(meta);
        }
      } catch (e) {}
    }

    // Render Variants / Scent selector (Optional Multi-Selection)
    function renderProductVariants(product) {
      const container = document.getElementById("variant-section-container");
      if (!container) return;

      selectedVariants = [];

      if (!product || product.hasVariants !== true || product.variantType !== "scent") {
        container.style.display = "none";
        container.innerHTML = "";
        return;
      }

      const rawVariants = product.variants;
      const variantsList = Array.isArray(rawVariants) 
        ? rawVariants 
        : (rawVariants && typeof rawVariants === "object" ? Object.values(rawVariants) : []);

      if (variantsList.length === 0) {
        container.style.display = "none";
        container.innerHTML = "";
        return;
      }

      container.style.display = "block";
      container.className = "variant-selector-wrapper";

      const availableVariants = variantsList.filter(v => v && v.isAvailable !== false);

      if (availableVariants.length === 0) {
        container.innerHTML = \`
          <div class="variant-all-unavailable-box">
            <i class="fas fa-exclamation-circle" style="font-size: 1.2rem;"></i>
            <span>نعتذر، جميع خيارات الروائح لهذا المستحضر غير متوفرة حالياً.</span>
          </div>
        \`;
        return;
      }

      let pillsHtml = variantsList.map(v => {
        if (!v || !v.name) return '';
        const isAvail = v.isAvailable !== false;
        if (isAvail) {
          return \`
            <button 
              type="button" 
              role="button" 
              aria-pressed="false" 
              aria-label="رائحة \${v.name}" 
              tabindex="0" 
              class="variant-pill-btn" 
              data-id="\${v.id}" 
              onclick="toggleScentVariant('\${v.id}')"
              onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault(); toggleScentVariant('\${v.id}');}">
              <span class="variant-check-icon"><i class="fas fa-check"></i></span>
              <span>\${v.name}</span>
            </button>
          \`;
        } else {
          return \`
            <button 
              type="button" 
              role="button" 
              aria-disabled="true" 
              aria-label="رائحة \${v.name} (غير متوفر)" 
              tabindex="-1" 
              class="variant-pill-btn disabled" 
              disabled 
              title="غير متوفر حالياً">
              <span>\${v.name}</span>
              <span class="variant-out-tag">(غير متوفر)</span>
            </button>
          \`;
        }
      }).join('');

      container.innerHTML = \`
        <div class="variant-header-row">
          <label id="scent-group-label" class="variant-title-label">
            <i class="fas fa-spray-can" style="color:var(--color-blush);"></i>
            <span>اختاري الروائح</span>
          </label>
          <span id="selected-scent-display" class="selected-scent-display" aria-live="polite">اختياري — يمكنك اختيار أكثر من رائحة</span>
        </div>
        <div class="variant-pills-list" role="group" aria-labelledby="scent-group-label">
          \${pillsHtml}
        </div>
      \`;
    }

    // Toggle Scent Variant Selection (Multi-selection + Deselect support)
    window.toggleScentVariant = function(variantId) {
      if (!loadedProduct) return;
      const rawVariants = loadedProduct.variants;
      const variantsList = Array.isArray(rawVariants) 
        ? rawVariants 
        : (rawVariants && typeof rawVariants === "object" ? Object.values(rawVariants) : []);

      const v = variantsList.find(item => item && item.id === variantId);
      if (!v || v.isAvailable === false) return;

      const existingIndex = selectedVariants.findIndex(item => item.id === variantId);
      if (existingIndex !== -1) {
        // Unselect / Deselect
        selectedVariants.splice(existingIndex, 1);
      } else {
        // Select
        selectedVariants.push({
          id: v.id,
          name: v.name
        });
      }

      // Update active state on all pill buttons
      const container = document.getElementById("variant-section-container");
      if (container) {
        container.querySelectorAll(".variant-pill-btn").forEach(btn => {
          const isSelected = selectedVariants.some(item => item.id === btn.dataset.id);
          btn.classList.toggle("active", isSelected);
          btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
        });
      }

      // Update badge display text and live price preview
      const disp = document.getElementById("selected-scent-display");
      if (disp) {
        if (selectedVariants.length === 0) {
          disp.textContent = "اختياري — يمكنك اختيار أكثر من رائحة";
          disp.classList.remove("chosen");
        } else {
          const effectivePrice = typeof getEffectiveUnitPrice === 'function'
            ? getEffectiveUnitPrice({ price: loadedProduct.price, selectedVariants })
            : (parseFloat(loadedProduct.price) || 0) * selectedVariants.length;

          const priceFormatted = Math.round(effectivePrice);

          if (selectedVariants.length === 1) {
            disp.innerHTML = \`<span>الرائحة المختارة: <strong>\${selectedVariants[0].name}</strong></span><span class="variant-live-price">السعر: \${priceFormatted} ج.م</span>\`;
            disp.classList.add("chosen");
          } else {
            const scentNames = selectedVariants.map(item => item.name).join("، ");
            disp.innerHTML = \`<span>الروائح المختارة: <strong>\${scentNames}</strong></span><span class="variant-live-price">السعر: \${priceFormatted} ج.م</span>\`;
            disp.classList.add("chosen");
          }
        }
      }
    };

    // Alias for backward compatibility
    window.selectScentVariant = window.toggleScentVariant;

    // Fetch product data
    async function loadProductDetails() {
      try {
        if (slugFromPath) {
          const snap = await db.ref('products').orderByChild('slug').equalTo(slugFromPath).once('value');
          if (snap.exists()) {
            snap.forEach(child => {
              productKey = child.key;
              loadedProduct = child.val();
            });
          }
        }

        if (!loadedProduct && idFromQuery) {
          const snap = await db.ref('products/' + idFromQuery).once('value');
          if (snap.exists()) {
            productKey = idFromQuery;
            loadedProduct = snap.val();
          }
        }

        id = productKey;

        if (loadedProduct && !loadedProduct.isHidden) {
          const product = loadedProduct;
          loadedProduct.id = productKey; 

        // إطلاق حدث ViewContent للفيسبوك بيكسل هنا
        if (typeof fbq === 'function') {
          fbq('track', 'ViewContent', {
            content_name: loadedProduct.name,
            content_ids: [loadedProduct.id],
            content_type: 'product',
            value: parseFloat(loadedProduct.price) || 0,
            currency: 'EGP'
          });
        }

        document.getElementById("product-img").src = product.image || '';
        document.getElementById("product-title").textContent = product.name || 'Premium Essential';
        document.getElementById("product-desc").innerHTML = parseDescriptionToHtml(product.description);
        
        let mappedCat = normalizeCategory(product.category);
        document.getElementById("product-category").innerHTML = \`\${mappedCat}\`;
        document.getElementById("bread-product").textContent = product.name || 'Premium Essential';
        
        if (product.isSoldOut) {
           const btn = document.getElementById("add-to-cart-btn");
           btn.innerHTML = \`<i class="fas fa-ban"></i> Out of Stock\`;
           btn.style.background = "#555";
           btn.style.cursor = "not-allowed";
           btn.disabled = true;
           document.getElementById("product-category").innerHTML += \` <span style="background:#222; color:#fff; padding:4px 8px; border-radius:4px; font-size:0.75rem; margin-left:10px; font-weight:bold; vertical-align:middle;"><i class="fas fa-box-open"></i> Sold Out</span>\`;
        }

        const priceRaw = parseFloat(product.price) || 0;
        if (product.originalPrice) {
          const oldPrice = parseFloat(product.originalPrice) || 0;
          document.getElementById("product-price-section").innerHTML = \`
            <div style="display:flex; flex-direction:column; padding: 20px 0;">
              <span style="color:var(--color-blush); font-size:2.4rem; font-weight:800;">\${priceRaw.toFixed(0)} EGP</span>
              <span style="font-size:1.1rem; color:var(--color-muted); font-weight:600; margin-top:6px;">
                Instead of <span style="text-decoration:line-through;">\${oldPrice.toFixed(0)} EGP</span>
              </span>
            </div>
          \`;
        } else if (product.onSale && product.discount) {
          const discountPercent = parseFloat(product.discount) || 0;
          const oldPrice = priceRaw / (1 - (discountPercent/100));
          document.getElementById("product-price-section").innerHTML = \`
            <div style="display:flex; flex-direction:column; padding: 20px 0;">
              <span style="color:var(--color-blush); font-size:2.4rem; font-weight:800;">\${priceRaw.toFixed(0)} EGP</span>
              <span style="font-size:1.1rem; color:var(--color-muted); font-weight:600; margin-top:6px;">
                Instead of <span style="text-decoration:line-through;">\${oldPrice.toFixed(0)} EGP</span> 
                <span style="background:var(--color-blush); color:#fff; padding:4px 10px; border-radius:6px; font-size:0.9rem; margin-left:12px; display:inline-block; vertical-align:middle;">\${product.discount}% OFF</span>
              </span>
            </div>
          \`;
        } else {
          document.getElementById("product-price").textContent = priceRaw + " EGP";
          document.getElementById("price-old-wrapper").innerHTML = '';
        }

        try { document.title = \`\${product.name} | Dandy Egypt\`; } catch (e) {}

        const cleanDesc = (product.description || "").replace(/<[^>]*>/g, '').substring(0, 155).trim() + "...";
        const cleanImg = product.image || '';
        const pageURL = window.location.href;

        updateMetaTag('#meta-description-tag', 'content', cleanDesc);
        updateMetaTag('meta[name="description"]', 'content', cleanDesc);
        updateMetaTag('#og-title-meta', 'content', product.name);
        updateMetaTag('meta[property="og:title"]', 'content', product.name);
        updateMetaTag('#og-desc-meta', 'content', cleanDesc);
        updateMetaTag('meta[property="og:description"]', 'content', cleanDesc);
        updateMetaTag('#og-image-meta', 'content', cleanImg);
        updateMetaTag('meta[property="og:image"]', 'content', cleanImg);
        updateMetaTag('#og-url-meta', 'content', pageURL);
        updateMetaTag('meta[property="og:url"]', 'content', pageURL);

        // Dynamic JSON-LD Product Schema for SEO & Rich Snippets
        try {
          let jsonLdEl = document.getElementById('product-jsonld');
          if (!jsonLdEl) {
            jsonLdEl = document.createElement('script');
            jsonLdEl.id = 'product-jsonld';
            jsonLdEl.type = 'application/ld+json';
            document.head.appendChild(jsonLdEl);
          }
          const schemaOfferPrice = (typeof priceRaw === 'number' && !isNaN(priceRaw)) ? priceRaw : (parseFloat(product.price) || 0);
          const isProductAvailable = product.inStock !== false && !product.isSoldOut;
          const cleanFullDesc = (product.description || "").replace(/<[^>]*>/g, '').trim() || product.name;
          const productSchema = {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": product.name,
            "image": cleanImg ? [cleanImg] : ["https://dandy-ebon.vercel.app/assets/images/logo.png"],
            "description": cleanFullDesc,
            "sku": id,
            "category": product.category || "Skincare",
            "brand": {
              "@type": "Brand",
              "name": "Dandy Cosmetics"
            },
            "offers": {
              "@type": "Offer",
              "url": window.location.origin + (product.slug ? \`/product/\${encodeURIComponent(product.slug)}\` : \`/product?id=\${encodeURIComponent(id)}\`),
              "priceCurrency": "EGP",
              "price": schemaOfferPrice,
              "priceValidUntil": "2027-12-31",
              "itemCondition": "https://schema.org/NewCondition",
              "availability": isProductAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              "seller": {
                "@type": "Organization",
                "name": "Dandy Cosmetics"
              }
            }
          };
          jsonLdEl.textContent = JSON.stringify(productSchema, null, 2);
        } catch (jsonErr) {
          console.warn("Could not inject Product JSON-LD:", jsonErr);
        }

        const cleanPhone = "201038941005";
        const whatsappMsg = \`مرحباً داندي بيوتي، أود الاستفسار عن هذا المنتج الفاخر:\\n- اسم المنتج: \${product.name}\\n- رابط المعاينة: \${pageURL}\`;

        document.getElementById("whatsapp-link").href = \`https://wa.me/\${cleanPhone}?text=\${encodeURIComponent(whatsappMsg)}\`;
        document.getElementById("facebook-link").href = "https://www.facebook.com/profile.php?id=61563039704396";
        document.getElementById("instagram-link").href = "https://www.instagram.com/dandy_skincare_cosmotics";
        
        const shareURL = window.location.origin + (product.slug ? \`/product/\${encodeURIComponent(product.slug)}\` : \`/product?id=\${encodeURIComponent(id)}\`);
        const whatsappShare = document.getElementById('share-whatsapp');
        const facebookShare = document.getElementById('share-facebook');
        const instagramShare = document.getElementById('share-instagram');

        if (whatsappShare) whatsappShare.href = \`https://wa.me/?text=\${encodeURIComponent(product.name + '\\n' + shareURL)}\`;
        if (facebookShare) facebookShare.href = \`https://www.facebook.com/sharer/sharer.php?u=\${encodeURIComponent(shareURL)}\`;
        if (instagramShare) instagramShare.href = 'https://www.instagram.com/dandy_skincare_cosmotics';

        // -- FETCH RELATED PRODUCTS --
        fetchRelatedProducts(product.category, id);

        // -- RENDER VARIANTS / SCENTS --
        renderProductVariants(product);

        // -- SETUP WISHLIST (المرحلة 5) --
        setupProductWishlist(id);

      } else {
        detailFrame.innerHTML = '<div style="text-align:center;grid-column:1/-1;padding:60px 0;"><i class="fas fa-exclamation-triangle" style="font-size:3rem;color:var(--color-gold);margin-bottom:14px;"></i><p style="font-size:1.2rem;font-weight:700;">The product you are looking for is currently unavailable. Please check other collections.</p></div>';
      }
    } catch (error) {
      console.error(error);
      detailFrame.innerHTML = '<p style="text-align:center;grid-column:1/-1;padding:60px 0;">An error occurred while loading product details. Please try again later.</p>';
    }
  }

  loadProductDetails();

    // Quantity Selector
    const qtyInput = document.getElementById('qty-input');
    const qtyMinus = document.getElementById('qty-minus');
    const qtyPlus = document.getElementById('qty-plus');

    if (qtyMinus && qtyPlus && qtyInput) {
      qtyMinus.addEventListener('click', () => {
        let val = parseInt(qtyInput.value) || 1;
        if (val > 1) qtyInput.value = val - 1;
      });
      qtyPlus.addEventListener('click', () => {
        let val = parseInt(qtyInput.value) || 1;
        if (val < 99) qtyInput.value = val + 1;
      });
      qtyInput.addEventListener('change', () => {
        let val = parseInt(qtyInput.value) || 1;
        if (val < 1) val = 1;
        if (val > 99) val = 99;
        qtyInput.value = val;
      });
    }

    // Share toggle
    const shareToggle = document.getElementById("share-toggle");
    if (shareToggle) {
      shareToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        shareToggle.classList.toggle("active");
      });
      document.addEventListener("click", () => {
        shareToggle.classList.remove("active");
      });
    }

    // Primary Add To Cart Logic
    const addToCartBtn = document.getElementById("add-to-cart-btn");
    addToCartBtn.addEventListener("click", () => {
      // 1. Validation: Product must exist and not be sold out
      if (!loadedProduct) {
        alert('لم يتم العثور على بيانات المنتج.');
        return;
      }
      if (loadedProduct.isSoldOut === true || loadedProduct.isSoldOut === 'true') {
        alert('نعتذر، هذا المنتج غير متوفر حالياً (نفدت الكمية).');
        return;
      }

      // 2. Validate and sort chosen variants if any
      let validSelectedVariants = [];
      const hasVars = typeof hasSelectableVariants === 'function'
        ? hasSelectableVariants(loadedProduct)
        : (loadedProduct.hasVariants === true || loadedProduct.hasVariants === 'true');

     // منع إضافة المنتج للسلة إذا كان يتطلب اختيار رائحة ولم يتم اختيار أي رائحة
if (hasVars && (!Array.isArray(selectedVariants) || selectedVariants.length === 0)) {
  alert('يرجى اختيار الرائحة أولاً');
  return;
}

      if (hasVars && Array.isArray(selectedVariants) && selectedVariants.length > 0) {
        const rawVariants = typeof getProductVariants === 'function' 
          ? getProductVariants(loadedProduct) 
          : (Array.isArray(loadedProduct.variants) ? loadedProduct.variants : []);

        // Filter out unavailable or removed variants
        validSelectedVariants = selectedVariants.filter(sv => {
          return rawVariants.some(rv => String(rv.id) === String(sv.id) && rv.isAvailable !== false);
        });

        // Deterministic sort by ID to ensure order of clicks does not matter
        validSelectedVariants.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      }

      // إطلاق حدث AddToCart للفيسبوك بيكسل هنا للمنتج الرئيسي
      if (typeof fbq === 'function') {
        fbq('track', 'AddToCart', {
          content_name: loadedProduct.name,
          content_ids: [loadedProduct.id],
          content_type: 'product',
          value: parseFloat(loadedProduct.price) || 0,
          currency: 'EGP'
        });
      }

      let cart = JSON.parse(localStorage.getItem("cart")) || [];
      const hasChosenVariants = validSelectedVariants.length > 0;
      const sortedIdsStr = hasChosenVariants ? validSelectedVariants.map(v => v.id).join('_') : '';
      const cartItemId = hasChosenVariants ? \`\${id}::\${sortedIdsStr}\` : id;
      const qty = parseInt(document.getElementById('qty-input').value) || 1;

      const productItem = {
        id: cartItemId,
        productId: id,
        name: loadedProduct.name,
        price: loadedProduct.price,
        image: loadedProduct.image,
        discount: loadedProduct.discount || null,
        onSale: loadedProduct.onSale || false,
        quantity: qty
      };

      if (hasChosenVariants) {
        productItem.hasVariants = true;
        productItem.variantType = "scent";
        productItem.selectedVariants = validSelectedVariants;
        // Backward compatibility
        if (validSelectedVariants.length === 1) {
          productItem.selectedVariant = validSelectedVariants[0];
          productItem.variantId = validSelectedVariants[0].id;
          productItem.variantName = validSelectedVariants[0].name;
        } else {
          productItem.variantName = validSelectedVariants.map(v => v.name).join('، ');
        }
      }

      // Check if this exact combination (same product + same set of variants) already exists in cart
      const targetItemKey = typeof getCartItemKey === 'function' ? getCartItemKey(productItem) : cartItemId;
      const existIndex = cart.findIndex(item => {
        const itemKey = typeof getCartItemKey === 'function' ? getCartItemKey(item) : (item.id || item.productId);
        return itemKey === targetItemKey;
      });

      if (existIndex !== -1) {
        cart[existIndex].quantity = (parseInt(cart[existIndex].quantity) || 0) + qty;
        if (hasChosenVariants) {
          cart[existIndex].selectedVariants = validSelectedVariants;
          cart[existIndex].id = cartItemId;
          cart[existIndex].productId = id;
        }
      } else {
        cart.push(productItem);
      }

      localStorage.setItem("cart", JSON.stringify(cart));
      if(typeof window.updateSharedCartCount === "function") window.updateSharedCartCount();
      if(typeof updateCartCount === "function") updateCartCount();

      const alertDiv = document.createElement("div");
      alertDiv.style.position = "fixed";
      alertDiv.style.bottom = "100px";
      alertDiv.style.left = "50%";
      alertDiv.style.transform = "translateX(-50%)";
      alertDiv.style.background = "var(--color-success, #2e6648)";
      alertDiv.style.color = "#fff";
      alertDiv.style.padding = "14px 28px";
      alertDiv.style.borderRadius = "50px"; /* Pill */
      alertDiv.style.boxShadow = "var(--shadow-lg)";
      alertDiv.style.zIndex = "1030";
      alertDiv.style.fontWeight = "700";
      alertDiv.style.textAlign = "center";
      
      let itemTitle = loadedProduct.name || "المستحضر";
      if (hasChosenVariants) {
        itemTitle += \` (\${validSelectedVariants.map(v => v.name).join('، ')})\`;
      }
      alertDiv.innerHTML = \`<i class="fas fa-check-circle" style="margin-left:8px;"></i> تمت إضافة \${itemTitle} إلى سلتك بنجاح!\`;
      document.body.appendChild(alertDiv);
      
      setTimeout(() => {
        alertDiv.style.opacity = "0";
        alertDiv.style.transition = "opacity 0.4s ease";
        setTimeout(() => alertDiv.remove(), 400);
      }, 2800);
    });

    // --- RELATED PRODUCTS LOGIC ---
    function fetchRelatedProducts(category, currentProductId) {
      if(!category) return;
      const catNormalized = normalizeCategory(category);
      
      db.ref("products").once("value").then(snap => {
        if(!snap.exists()) return;
        
        let products = [];
        snap.forEach(child => {
          let p = child.val();
          // Ignore hidden, ignore current product, match normalized category
          if(!p.isHidden && child.key !== currentProductId && normalizeCategory(p.category) === catNormalized) {
            products.push({...p, id: child.key});
          }
        });
        
        // limit to 4 products max
        products = products.slice(0, 4);
        
        if(products.length > 0) {
          document.getElementById("related-products-section").style.display = "block";
          let gridHtml = "";
          
          products.forEach(prod => {
              const priceRaw = parseFloat(prod.price) || 0;
              let priceStr = \`<div class="product-price-card">\${priceRaw.toFixed(0)} EGP</div>\`;
              let badgeStr = '';
              
              if (prod.originalPrice) {
                const oldPrice = parseFloat(prod.originalPrice) || 0;
                priceStr = \`<div class="product-price-card"><span class="old-price" style="display: block;">\${oldPrice.toFixed(0)} EGP</span>\${priceRaw.toFixed(0)} EGP</div>\`;
                if(prod.onSale && prod.discount) badgeStr = \`<div class="discount-badge">خصم \${prod.discount}%</div>\`;
              } else if (prod.onSale && prod.discount) {
                const discountPercent = parseFloat(prod.discount) || 0;
                const oldPrice = priceRaw / (1 - (discountPercent/100));
                priceStr = \`<div class="product-price-card"><span class="old-price" style="display: block;">\${oldPrice.toFixed(0)} EGP</span>\${priceRaw.toFixed(0)} EGP</div>\`;
                badgeStr = \`<div class="discount-badge">خصم \${prod.discount}%</div>\`;
              }
              
              const relatedProductLink = prod.slug
                ? \`/product/\${encodeURIComponent(prod.slug)}\`
                : \`/product?id=\${prod.id}\`;
              const hasVars = typeof hasSelectableVariants === 'function' 
                ? hasSelectableVariants(prod) 
                : (prod.hasVariants === true || prod.hasVariants === 'true');
              let actionBtn = hasVars
                ? \`<button class="add-cart-btn" style="background:var(--color-primary); color:#fff;" onclick="event.stopPropagation(); window.location.href='\${relatedProductLink}'">
                    <i class="fas fa-spray-can"></i> اختاري الرائحة
                   </button>\`
                : \`<button class="add-cart-btn" onclick="event.stopPropagation(); addToCartCard('\${prod.id}', '\${(prod.name||'').replace(/'/g, "\\\\'")}', \${priceRaw}, '\${prod.image||''}', \${prod.discount||0}, \${prod.onSale||false}, false, '\${prod.slug || ''}')">
                    <i class="fas fa-shopping-bag"></i> Add
                   </button>\`;

              const isFav = window.userWishlistSet && window.userWishlistSet.has(prod.id);
              const heartIconClass = isFav ? 'fas fa-heart' : 'far fa-heart';
              const heartActive = isFav ? 'active' : '';

              gridHtml += \`
                <div class="product-card" onclick="window.location.href='\${relatedProductLink}'">
                  <div class="product-image-wrap">
                    \${badgeStr}
                    <button type="button" class="btn-card-wishlist \${heartActive}" data-product-id="\${prod.id}" onclick="event.stopPropagation(); window.toggleWishlist('\${prod.id}', this);" title="إضافة للمفضلة">
                      <i class="\${heartIconClass}"></i>
                    </button>
                    <img loading="lazy" src="\${prod.image || ''}" alt="\${prod.name || 'Product'}"></div>
                    <h3 class="product-title-card">\${prod.name || ''}</h3>
                    \${priceStr}
                    \${actionBtn}
                </div>
              \`;
          });
          document.getElementById("related-products-grid").innerHTML = gridHtml;
        }
      });
    }

    // Global function for related product card 'Add to Cart' button
    window.addToCartCard = function(id, name, price, image, discount, onSale, hasVariants, slug) {
      if (hasVariants) {
        const productLink = slug
          ? \`/product/\${encodeURIComponent(slug)}\`
          : \`/product?id=\${id}\`;
        window.location.href = productLink;
        return;
      }
      if (typeof fbq === 'function') {
        fbq('track', 'AddToCart', {
          content_name: name,
          content_ids: [id],
          content_type: 'product',
          value: parseFloat(price) || 0,
          currency: 'EGP'
        });
      }

      let cart = JSON.parse(localStorage.getItem("cart")) || [];
      let exist = cart.findIndex(i => (i.productId || i.id) === id && (!i.selectedVariants || i.selectedVariants.length === 0) && !i.selectedVariant);
      if(exist !== -1) {
        cart[exist].quantity = (parseInt(cart[exist].quantity) || 0) + 1;
      } else {
        cart.push({ id, productId: id, name, price, image, discount, onSale, quantity: 1 });
      }
      localStorage.setItem("cart", JSON.stringify(cart));
      
      // UI Feedback
      const alertDiv = document.createElement("div");
      alertDiv.style.position = "fixed";
      alertDiv.style.bottom = "100px";
      alertDiv.style.left = "50%";
      alertDiv.style.transform = "translateX(-50%)";
      alertDiv.style.background = "var(--color-success, #2e6648)";
      alertDiv.style.color = "#fff";
      alertDiv.style.padding = "14px 28px";
      alertDiv.style.borderRadius = "50px"; /* Pill */
      alertDiv.style.boxShadow = "var(--shadow-lg)";
      alertDiv.style.zIndex = "1030";
      alertDiv.style.fontWeight = "700";
      alertDiv.style.textAlign = "center";
      alertDiv.innerHTML = \`<i class="fas fa-check-circle" style="margin-right:8px;"></i> Successfully added to your shopping bag!\`;
      document.body.appendChild(alertDiv);
      
      setTimeout(() => {
        alertDiv.style.opacity = "0";
        alertDiv.style.transition = "opacity 0.4s ease";
        setTimeout(() => alertDiv.remove(), 400);
      }, 2800);

      if(typeof window.updateSharedCartCount === "function") window.updateSharedCartCount();
      if(typeof updateCartCount === "function") updateCartCount();
    };

    // --- إدارة وتتبع المفضلة (المرحلة 5) ---
    window.userWishlistSet = new Set();
    let isCurrentProductInWishlist = false;

    function setupProductWishlist(currentProdId) {
      if (!currentProdId) return;
      const auth = window.auth || (typeof firebase !== 'undefined' ? firebase.auth() : null);
      if (!auth) return;

      const detailBtn = document.getElementById('detailWishlistBtn');
      const actionBtn = document.getElementById('actionWishlistBtn');

      function updateUI(fav) {
        isCurrentProductInWishlist = fav;
        if (detailBtn) {
          if (fav) {
            detailBtn.classList.add('active');
            detailBtn.innerHTML = '<i class="fas fa-heart"></i>';
          } else {
            detailBtn.classList.remove('active');
            detailBtn.innerHTML = '<i class="far fa-heart"></i>';
          }
        }
        if (actionBtn) {
          if (fav) {
            actionBtn.classList.add('active');
            actionBtn.innerHTML = '<i class="fas fa-heart"></i> <span>في قائمة المفضلة</span>';
          } else {
            actionBtn.classList.remove('active');
            actionBtn.innerHTML = '<i class="far fa-heart"></i> <span id="actionWishlistText">إضافة إلى المفضلة</span>';
          }
        }
      }

      async function handleToggle() {
        const user = auth.currentUser;
        if (!user) {
          alert('سجّلي دخولك لحفظ المفضلة');
          window.location.href = '/account-login';
          return;
        }

        try {
          if (isCurrentProductInWishlist) {
            await db.ref('wishlists/' + user.uid + '/' + currentProdId).remove();
            window.userWishlistSet.delete(currentProdId);
            updateUI(false);
          } else {
            await db.ref('wishlists/' + user.uid + '/' + currentProdId).set(true);
            window.userWishlistSet.add(currentProdId);
            updateUI(true);
          }
        } catch (err) {
          console.error('Error toggling main product wishlist:', err);
        }
      }

      if (detailBtn) detailBtn.onclick = handleToggle;
      if (actionBtn) actionBtn.onclick = handleToggle;

      auth.onAuthStateChanged(async (user) => {
        if (!user) {
          window.userWishlistSet.clear();
          updateUI(false);
          return;
        }

        try {
          const snap = await db.ref('wishlists/' + user.uid).once('value');
          if (snap.exists()) {
            const val = snap.val() || {};
            window.userWishlistSet = new Set(Object.keys(val).filter(k => !!val[k]));
            updateUI(window.userWishlistSet.has(currentProdId));

            // تحديث بطاقات المنتجات ذات الصلة
            document.querySelectorAll('.btn-card-wishlist').forEach(btn => {
              const pid = btn.getAttribute('data-product-id');
              if (window.userWishlistSet.has(pid)) {
                btn.classList.add('active');
                const i = btn.querySelector('i');
                if (i) i.className = 'fas fa-heart';
              }
            });
          } else {
            updateUI(false);
          }
        } catch (e) {
          console.warn('Error fetching wishlist status:', e);
        }
      });
    }

    window.toggleWishlist = async function(productId, btnEl) {
      const auth = window.auth || (typeof firebase !== 'undefined' ? firebase.auth() : null);
      const user = auth ? auth.currentUser : null;

      if (!user) {
        alert('سجّلي دخولك لحفظ المفضلة');
        window.location.href = '/account-login';
        return;
      }

      const isFav = btnEl.classList.contains('active');
      const icon = btnEl.querySelector('i');

      try {
        if (isFav) {
          await db.ref('wishlists/' + user.uid + '/' + productId).remove();
          window.userWishlistSet.delete(productId);
          btnEl.classList.remove('active');
          if (icon) icon.className = 'far fa-heart';
        } else {
          await db.ref('wishlists/' + user.uid + '/' + productId).set(true);
          window.userWishlistSet.add(productId);
          btnEl.classList.add('active');
          if (icon) icon.className = 'fas fa-heart';
        }
      } catch (err) {
        console.error('Error toggling wishlist:', err);
      }
    };
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate`<meta property="og:type" content="product"><meta id="og-title-meta" property="og:title" content="Premium Beauty Products | Dandy"><meta id="og-desc-meta" property="og:description" content="View exclusive botanical ingredients, detailed product information, and special beauty offers from Dandy Egypt."><meta id="og-image-meta" property="og:image" content="https://images.unsplash.com/photo-1608248597481-496100c80836?auto=format&fit=crop&w=1200&q=80"><meta id="og-url-meta" property="og:url" content="https://dandy-ebon.vercel.app/product"><meta property="og:site_name" content="Dandy"><meta name="twitter:card" content="summary_large_image"><meta id="tw-title-meta" name="twitter:title" content="Premium Beauty Products | Dandy"><meta id="tw-desc-meta" name="twitter:description" content="View exclusive botanical ingredients, detailed product information, and special beauty offers from Dandy Egypt."><meta id="tw-image-meta" name="twitter:image" content="https://images.unsplash.com/photo-1608248597481-496100c80836?auto=format&fit=crop&w=1200&q=80"><script id="product-jsonld" type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Dandy Natural Cosmetics Product",
        "description": "Premium botanical beauty and cosmetics handcrafted by Dandy Egypt.",
        "brand": {
          "@type": "Brand",
          "name": "Dandy Cosmetics"
        },
        "offers": {
          "@type": "Offer",
          "priceCurrency": "EGP",
          "price": "0",
          "itemCondition": "https://schema.org/NewCondition",
          "availability": "https://schema.org/InStock",
          "seller": {
            "@type": "Organization",
            "name": "Dandy Cosmetics"
          }
        }
      }
    <\/script>`)}`
	})}`;
}, "/app/applet/src/pages/product.astro", void 0);
var $$file = "/app/applet/src/pages/product.astro";
var $$url = "/product";
//#endregion
//#region \0virtual:astro:page:src/pages/product@_@astro
var page = () => product_exports;
//#endregion
export { page };
