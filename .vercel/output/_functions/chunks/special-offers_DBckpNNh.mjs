import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_lUswI9jr.mjs";
import { t as createComponent } from "./compiler_BZhHLwe9.mjs";
import { t as $$BaseLayout } from "./BaseLayout_TSlOutx5.mjs";
//#region src/pages/special-offers.astro
var special_offers_exports = /* @__PURE__ */ __exportAll({
	default: () => $$SpecialOffers,
	file: () => $$file,
	url: () => $$url
});
var $$SpecialOffers = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "العروض الخاصة | Dandy Cosmetics - خصومات وتخفيضات مذهلة",
		"description": "استفيدي من العروض الخاصة والخصومات الحصرية من داندي (Dandy Cosmetics). منتجات أصلية للعناية بالبشرة والشعر بأسعار لا تقبل المنافسة.",
		"keywords": "Dandy, Dandy Cosmetics, دندي, داندي, دندي للتجميل, عروض مستحضرات تجميل, خصومات العناية بالبشرة, تخفيضات دندي, Special Offers Cosmetics",
		"canonical": "https://dandy-ebon.vercel.app/special-offers"
	}, {
		"default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<section class="container" style="padding-top: 140px; text-align: center;"><span class="offers-hero-badge"><i class="fas fa-fire"></i> Limited Time Only</span><h1 style="font-size: 2.3rem; font-weight: 800; color: var(--color-primary); margin-bottom: 12px; font-family:'Space Grotesk', sans-serif;">عروض وخصومات داندي (Dandy Cosmetics)</h1><p style="color: var(--color-muted); max-width: 600px; margin: 0 auto 40px; font-size: 1.05rem;">All the botanical magic you love, now at heartwarming prices configured to feed your skin and hair with luxury care. Explore our discounted collections today.</p></section><section class="products" style="padding: 20px 0 80px;"><div class="container"><div class="product-grid" id="offersContainer"><p style="text-align: center; grid-column:1/-1; color: var(--color-muted);">Preparing our exceptional proposals for you...</p></div></div></section><script>
    const db = window.db || firebase.database();

    // تتبع وإدارة المفضلة (المرحلة 5)
    window.userWishlistSet = new Set();

    function initWishlistTracking() {
      const auth = window.auth || (typeof firebase !== 'undefined' ? firebase.auth() : null);
      if (!auth) return;

      auth.onAuthStateChanged(async (user) => {
        if (!user) {
          window.userWishlistSet.clear();
          return;
        }

        try {
          const snap = await db.ref('wishlists/' + user.uid).once('value');
          if (snap.exists()) {
            const val = snap.val() || {};
            window.userWishlistSet = new Set(Object.keys(val).filter(k => !!val[k]));
            document.querySelectorAll('.btn-card-wishlist').forEach(btn => {
              const pid = btn.getAttribute('data-product-id');
              if (window.userWishlistSet.has(pid)) {
                btn.classList.add('active');
                const i = btn.querySelector('i');
                if (i) i.className = 'fas fa-heart';
              }
            });
          }
        } catch (e) {
          console.warn('Error loading wishlist set:', e);
        }
      });
    }

    window.toggleCardWishlist = async function(productId, btnEl) {
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

    initWishlistTracking();

    window.quickAdd = function(id, name, price, image, discount, onSale, hasVariants, slug) {
      if (hasVariants) {
        const productLink = slug
          ? \`/product/\${encodeURIComponent(slug)}\`
          : \`/product?id=\${id}\`;
        window.location.href = productLink;
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
      alertDiv.style.background = "var(--color-blush, #db2777)";
      alertDiv.style.color = "#fff";
      alertDiv.style.padding = "10px 20px";
      alertDiv.style.borderRadius = "8px";
      alertDiv.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
      alertDiv.style.zIndex = "1030";
      alertDiv.style.fontWeight = "bold";
      alertDiv.style.textAlign = "center";
      alertDiv.innerHTML = \`Added to Cart!\`;
      document.body.appendChild(alertDiv);
      
      setTimeout(() => {
        alertDiv.style.opacity = "0";
        alertDiv.style.transition = "opacity 0.4s ease";
        setTimeout(() => alertDiv.remove(), 400);
      }, 2000);
    };

    const offersContainer = document.getElementById("offersContainer");

    db.ref("products").on("value", snapshot => {
      if (!offersContainer) return;
      offersContainer.innerHTML = "";
      let offerCount = 0;

      if (!snapshot.exists()) {
        offersContainer.innerHTML = \`<p style="text-align:center;grid-column:1/-1;color:var(--color-muted);">No exclusive offers are currently available. Check our general catalogue.</p>\`;
        return;
      }

      snapshot.forEach(child => {
        const data = child.val();
        
        if (data.onSale === true && !data.isHidden) {
          offerCount++;
          const productEl = document.createElement("div");
          
          productEl.className = "product-card product";
          productEl.setAttribute("data-category", data.category || 'Special Promo');
          const productLink = data.slug
            ? \`/product/\${encodeURIComponent(data.slug)}\`
            : \`/product?id=\${child.key}\`;
          productEl.onclick = function() { window.location.href = productLink; };

          const priceRaw = parseFloat(data.price) || 0;
          let priceStr = \`<div class="product-price">\${priceRaw} EGP</div>\`;
          let badgeStr = '';

          if (data.originalPrice) {
            const oldPrice = parseFloat(data.originalPrice) || 0;
            priceStr = \`<div class="product-price"><span class="old-price">\${oldPrice} EGP</span>\${priceRaw} EGP</div>\`;
            badgeStr = \`<div class="discount-badge">Special Offer</div>\`;
          } else if (data.discount) {
            const discountPercent = parseFloat(data.discount) || 0;
            const oldPrice = priceRaw / (1 - (discountPercent/100));
            priceStr = \`<div class="product-price"><span class="old-price">\${oldPrice.toFixed(0)} EGP</span>\${priceRaw} EGP</div>\`;
            badgeStr = \`<div class="discount-badge">-\${data.discount}% OFF</div>\`;
          }

          const hasVars = typeof hasSelectableVariants === 'function' 
            ? hasSelectableVariants(data) 
            : (data.hasVariants === true || data.hasVariants === 'true');

          let actionBtn = \`<button class="add-cart-btn" onclick="event.stopPropagation(); quickAdd('\${child.key}', \\\`\${(data.name || '').replace(/\`/g, '')}\\\`, '\${data.price}', '\${data.image}', '\${data.discount || ''}', \${data.onSale || false}, false, '\${data.slug || ''}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                Add
              </button>\`;

          if (hasVars) {
            actionBtn = \`<button class="add-cart-btn" style="background:var(--color-primary); color:#fff;" onclick="event.stopPropagation(); window.location.href='\${productLink}'">
                <i class="fas fa-spray-can" style="margin-left:4px;"></i> اختاري الرائحة
              </button>\`;
          }

          if (data.isSoldOut) {
              badgeStr += \`<div class="discount-badge" style="background:#222; top: \${badgeStr ? '35px' : '10px'};">Sold Out</div>\`;
              actionBtn = \`<button disabled class="add-cart-btn" style="background:#aaa; color:#fff; cursor:not-allowed;" onclick="event.stopPropagation();">
                  <i class="fas fa-ban"></i> Sold Out
                </button>\`;
          }

          const isFavorited = window.userWishlistSet && window.userWishlistSet.has(child.key);
          const heartIconClass = isFavorited ? 'fas fa-heart' : 'far fa-heart';
          const heartActive = isFavorited ? 'active' : '';

          productEl.innerHTML = \`
            <div class="product-image-wrap">
              \${badgeStr}
              <button type="button" class="btn-card-wishlist \${heartActive}" data-product-id="\${child.key}" onclick="event.stopPropagation(); window.toggleCardWishlist('\${child.key}', this);" title="إضافة للمفضلة">
                <i class="\${heartIconClass}"></i>
              </button>
              <img loading="lazy" src="\${data.image}" alt="\${data.name} - عروض داندي" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1608248597481-496100c80836?auto=format&fit=crop&w=400&q=80';"></div>
            <h3 class="product-title">\${data.name}</h3>
            \${priceStr}
            \${actionBtn}
          \`;
          
          offersContainer.appendChild(productEl);
        }
      });

      if (offerCount === 0) {
        offersContainer.innerHTML = \`<p style="text-align:center;grid-column:1/-1;color:var(--color-muted);padding:40px 0;">Dear customer, your active promotional packages are fully booked right now. We will launch our next luxury discount festival soon.</p>\`;
      }
    });
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate`<meta property="og:type" content="website"><meta property="og:url" content="https://dandy-ebon.vercel.app/special-offers"><meta property="og:title" content="العروض الخاصة | Dandy Cosmetics - خصومات وتخفيضات مذهلة"><meta property="og:description" content="استفيدي من العروض الخاصة والخصومات الحصرية من داندي (Dandy Cosmetics). منتجات أصلية بأسعار لا تقبل المنافسة."><meta property="og:image" content="https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="العروض الخاصة | Dandy Cosmetics - خصومات وتخفيضات مذهلة"><meta name="twitter:description" content="استفيدي من العروض الخاصة والخصومات الحصرية من داندي (Dandy Cosmetics). منتجات أصلية بأسعار لا تقبل المنافسة."><meta name="twitter:image" content="https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg"><script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "العروض الخاصة | Dandy Cosmetics",
        "description": "استفيدي من العروض الخاصة والخصومات الحصرية من داندي.",
        "url": "https://dandy-ebon.vercel.app/special-offers"
      }
    <\/script>`)}`
	})}`;
}, "/app/applet/src/pages/special-offers.astro", void 0);
var $$file = "/app/applet/src/pages/special-offers.astro";
var $$url = "/special-offers";
//#endregion
//#region \0virtual:astro:page:src/pages/special-offers@_@astro
var page = () => special_offers_exports;
//#endregion
export { page };
