import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_BGeKp411.mjs";
import { t as createComponent } from "./compiler_Bovpdavx.mjs";
import { t as $$BaseLayout } from "./BaseLayout_BhK_tACD.mjs";
//#region src/pages/index.astro
var pages_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Index,
	file: () => $$file,
	url: () => ""
});
var $$Index = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "داندي | Dandy Cosmetics - منتجات طبيعية للعناية بالبشرة والشعر",
		"description": "تسوقي الآن من متجر داندي (Dandy Cosmetics)، وجهتك الأولى لأفضل منتجات العناية بالبشرة والشعر الطبيعية في مصر. اكتشفي الجمال الطبيعي اليوم!",
		"keywords": "Dandy, Dandy Cosmetics, دندي, داندي, دندي للتجميل, العناية بالبشرة, العناية بالشعر, مستحضرات تجميل طبيعية, منتجات دندي, Natural Skincare, Beauty Store Egypt",
		"canonical": "https://dandy-ebon.vercel.app/"
	}, {
		"default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<div class="hero" id="heroSlider"></div><div class="hero-dots" id="heroDots"></div><div class="trust-bar" id="trustBarContainer"></div><div id="dynamic-sections-wrapper"></div><section class="section" id="sec-categories"><h2 class="section-title plain" id="sec-categories-title">Collections</h2><div id="dynamic-categories" style="min-height: 200px;"></div></section><section class="section" style="background:#f7f7f8;"><h2 class="section-title plain">Why Choose Us</h2><div class="benefits-grid" id="benefitsContainer" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; min-height: 100px;"></div></section><div id="dynamic-reviews-wrapper"></div><script>
    const db = window.db || firebase.database();
    let globalProductsCache = {};

    function initHomepage() {
      // 1. Fetch products ONCE
      db.ref('products').once('value').then(snap => {
        if(snap.exists()) {
          globalProductsCache = snap.val();
        }
        // Now fetch dynamic homepage layout
        loadHomepageDynamic();
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initHomepage);
    } else {
      initHomepage();
    }

    function loadHomepageDynamic() {
      db.ref('homepage').once('value').then(snap => {
        if(!snap.exists()) return;
        const data = snap.val();
        
        // Hero
        renderHero(data.dynamicHero);
        
        // Trust
        renderTrust(data.trust);

        // Sections
        renderSections(data.dynamicSections);

        // Reviews
        renderReviews(data.dynamicReviews);
      });

      // Load Categories
      db.ref('categories').once('value').then(snap => {
        if(!snap.exists()) return;
        let catHtml = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; padding:0 20px;">';
        snap.forEach(child => {
          const c = child.val();
          catHtml += \`
            <a href="/all-products?category=\${encodeURIComponent(c.name)}" class="new-category-card">
              <img src="\${c.image || ''}" alt="\${c.name} - قسم داندي" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
              <div class="overlay-content">
                <div class="tagline">\${c.tagline || 'COLLECTION'}</div>
                <h3>\${c.name}</h3>
                <div class="bottom-bar">
                  <div class="item-count">\${c.count || ''}</div>
                  <div class="arrow-icon"><i class="fas fa-arrow-right"></i></div>
                </div>
              </div>
            </a>
          \`;
        });
        catHtml += '</div>';
        const dc = document.getElementById('dynamic-categories');
        if(dc) dc.innerHTML = catHtml;
      });

      // Benefits
      db.ref('settings/benefits').once('value').then(snap => {
        const container = document.getElementById('benefitsContainer');
        if(snap.exists() && container) {
          let html = '';
          snap.forEach(child => {
            let b = child.val();
            html += \`<div class="benefit-item" style="text-align:center;"><div style="font-size:2rem;margin-bottom:8px;">\${b.icon || '✨'}</div><h3 style="font-size:1rem;margin-bottom:4px;">\${b.title || ''}</h3><p style="font-size:0.8rem;color:var(--color-muted);">\${b.subtitle || ''}</p></div>\`;
          });
          container.innerHTML = html;
        }
      });
    }

    function renderHero(slides) {
      const heroSlider = document.getElementById('heroSlider');
      const heroDots = document.getElementById('heroDots');
      if (!slides || !slides.length || !heroSlider || !heroDots) return;
      
      heroSlider.innerHTML = '';
      heroDots.innerHTML = '';
      
      slides.forEach((slide, idx) => {
        const isActive = idx === 0 ? 'active' : '';
        heroSlider.innerHTML += \`<div class="hero-slide \${isActive}" style="background-image:url('\${slide.image || ''}')"><div class="hero-content"><h2 class="hero-title">\${slide.title || ''}</h2><p class="hero-subtitle">\${slide.subtitle || ''}</p></div></div>\`;
        heroDots.innerHTML += \`<div class="dot \${isActive}"></div>\`;
      });
      
      let currentSlide = 0;
      let slideInterval;
      const slideElements = document.querySelectorAll('.hero-slide');
      const dotElements = document.querySelectorAll('.dot');
      
      function goToSlide(index) {
        if(!slideElements[currentSlide] || !slideElements[index]) return;
        slideElements[currentSlide].classList.remove('active');
        dotElements[currentSlide].classList.remove('active');
        void dotElements[index].offsetWidth; // reflow
        currentSlide = index;
        slideElements[currentSlide].classList.add('active');
        dotElements[currentSlide].classList.add('active');
      }
      
      function startSlider() {
        clearInterval(slideInterval);
        const dur = (slides[currentSlide] && slides[currentSlide].duration ? slides[currentSlide].duration * 1000 : 5000);
        slideInterval = setInterval(() => {
          goToSlide((currentSlide + 1) % slideElements.length);
          startSlider(); 
        }, dur);
      }
      
      if (slideElements.length > 1) {
        dotElements.forEach((dot, idx) => {
          dot.addEventListener('click', () => {
            goToSlide(idx);
            startSlider();
          });
        });
        startSlider();
      }
    }

    function renderTrust(trustData) {
      const tb = document.getElementById('trustBarContainer');
      if(!tb || !trustData) return;
      let html = '<div class="trust-card">';
      for(let i=1; i<=3; i++) {
        const itm = trustData['item'+i];
        if(itm && itm.title) {
          let iconHtml = itm.icon.includes('<') ? itm.icon : \`<i class="\${itm.icon}"></i>\`;
          if(!itm.icon.includes('fa-') && !itm.icon.includes('<')) iconHtml = \`<i>\${itm.icon}</i>\`;
          html += \`<div class="trust-item"><div class="trust-item-icon">\${iconHtml}</div><div class="trust-item-content"><strong>\${itm.title}</strong><p>\${itm.desc||''}</p></div></div>\`;
        }
      }
      html += '</div>';
      tb.innerHTML = html;
    }

    function renderSections(sections) {
      const wrapper = document.getElementById('dynamic-sections-wrapper');
      if(!wrapper || !sections) return;
      
      let html = '';
      sections.sort((a,b) => (a.order||0) - (b.order||0));

      const colors = ['var(--color-surface-soft)', 'var(--color-blush-soft)']; 
      let visibleIdx = 0;

      sections.forEach(sec => {
        if(!sec.visible) return;
        
        let prodsToRender = [];
        
        if(sec.type === 'bestsellers') {
          for(let key in globalProductsCache) {
            if(globalProductsCache[key].bestseller && !globalProductsCache[key].isHidden) {
              prodsToRender.push({...globalProductsCache[key], id: key});
            }
          }
          prodsToRender = prodsToRender.slice(0, 8);
        } else if(sec.type === 'offers') {
          for(let key in globalProductsCache) {
            if((globalProductsCache[key].onSale || globalProductsCache[key].discount) && !globalProductsCache[key].isHidden) {
              prodsToRender.push({...globalProductsCache[key], id: key});
            }
          }
          prodsToRender = prodsToRender.slice(0, 8);
        } else if(sec.type === 'manual') {
          for(let key in sec.manualProducts) {
            if(sec.manualProducts[key] && globalProductsCache[key] && !globalProductsCache[key].isHidden) {
              prodsToRender.push({...globalProductsCache[key], id: key});
            }
          }
        }
        
        if(prodsToRender.length === 0) return;

        const bgColor = colors[visibleIdx % 2];
        visibleIdx++;

        let gridHtml = '';
        prodsToRender.forEach(prod => {
          let priceStr = \`<div class="product-price"><span style="white-space: nowrap; display: inline-block; direction: ltr; unicode-bidi: isolate;">\${prod.price} EGP</span></div>\`;
          let badgeStr = '';
          if(prod.discount || prod.onSale) {
            let discountText = prod.discount ? \`Sale \${prod.discount}%\` : 'Sale';
            badgeStr = \`<div class="discount-badge">\${discountText}</div>\`;
            if (prod.originalPrice) { 
              priceStr = \`<div class="product-price"><span class="old-price" style="text-decoration:line-through;color:var(--color-muted);font-size:0.8rem;margin-right:6px;white-space:nowrap;display:inline-block;direction:ltr;unicode-bidi:isolate;">\${prod.originalPrice} EGP</span><span style="white-space:nowrap;display:inline-block;direction:ltr;unicode-bidi:isolate;">\${prod.price} EGP</span></div>\`;
            }
          }
              const hasVars = typeof hasSelectableVariants === 'function' 
                ? hasSelectableVariants(prod) 
                : (prod.hasVariants === true || prod.hasVariants === 'true');
              let cardBtn = hasVars
                ? \`<button class="add-cart-btn" style="background:var(--color-primary); color:#fff;" onclick="event.stopPropagation(); window.location.href='/product?id=\${prod.id}'">
                    <i class="fas fa-spray-can" style="margin-left:4px;"></i> اختاري الرائحة
                   </button>\`
                : \`<button class="add-cart-btn" onclick="event.stopPropagation(); addToCart('\${prod.id}', '\${(prod.name||'').replace(/'/g, "\\\\'")}', \${prod.price}, '\${prod.image||''}', false)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                    Add
                   </button>\`;

              gridHtml += \`
            <div class="product-card" onclick="window.location.href='/product?id=\${prod.id}'">
              <div class="product-image-wrap">
                \${badgeStr}
                <img src="\${prod.image || ''}" alt="\${prod.name || 'منتج داندي'}" loading="lazy" width="100%" height="100%">
              </div>
              <h3 class="product-title">\${prod.name || ''}</h3>
              \${priceStr}
              \${cardBtn}
            </div>
          \`;
        });

        html += \`
          <section class="section" id="\${sec.id}" style="background:\${bgColor};padding-bottom:6px;">
            <h2 class="section-title">\${sec.title}</h2>
            \${sec.subtitle ? \`<p style="text-align:center; color:var(--color-blush); margin-top:-20px; margin-bottom:20px;">\${sec.subtitle}</p>\` : ''}
            <div class="product-grid">\${gridHtml}</div>
          </section>
          <div class="cta-wrap" style="background:\${bgColor};">
            <a href="/all-products" class="shop-now-btn">Shop Now ✨</a>
          </div>
        \`;
      });
      
      wrapper.innerHTML = html;
    }

    function renderReviews(reviews) {
      const wrapper = document.getElementById('dynamic-reviews-wrapper');
      if(!wrapper || !reviews || !reviews.length) return;
      
      let optionsHtml = '';
      let hasImages = false;
      
      reviews.forEach((r, index) => {
        if (r.image) {
          hasImages = true;
          optionsHtml += \`<div class="option \${index === 0 ? 'active' : ''}" style="--optionBackground:url('\${r.image}');">
            <div class="shadow"></div>
            <div class="zoom-icon"><i class="fas fa-expand"></i></div>
          </div>\`;
        }
      });

      if (!hasImages) return;
      
      let html = \`
        <section class="section" style="background:#f7f7f8;">
          <h2 class="section-title plain" style="text-align: center;">آراء العملاء</h2>
          <div class="options-container">
            <div class="options">
              \${optionsHtml}
            </div>
          </div>
        </section>
      \`;
      wrapper.innerHTML = html;

      const options = wrapper.querySelectorAll('.option');
      options.forEach(opt => {
        opt.addEventListener('click', function() {
          if (this.classList.contains('active')) {
            const bg = this.style.getPropertyValue('--optionBackground');
            if (bg) {
              const url = bg.replace(/^url\\(['"]?/, '').replace(/['"]?\\)$/, '');
              openLightbox(url);
            }
          } else {
            options.forEach(o => o.classList.remove('active'));
            this.classList.add('active');
          }
        });
      });
    }

    function openLightbox(src) {
      let lb = document.getElementById('imageLightbox');
      if (!lb) {
        lb = document.createElement('div');
        lb.id = 'imageLightbox';
        lb.className = 'lightbox';
        lb.innerHTML = \`
          <span class="lightbox-close">&times;</span>
          <img id="lightboxImage" src="" alt="Full View">
        \`;
        document.body.appendChild(lb);
        lb.addEventListener('click', function(e) {
          if (e.target.id === 'imageLightbox' || e.target.classList.contains('lightbox-close')) {
            lb.classList.remove('show');
            document.body.style.overflow = '';
            setTimeout(() => { document.getElementById('lightboxImage').src = ''; }, 300);
          }
        });
      }
      document.getElementById('lightboxImage').src = src;
      lb.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    window.addToCart = function(id, name, price, image, hasVariants) {
      if (hasVariants) {
        window.location.href = '/product?id=' + id;
        return;
      }
      let cart = JSON.parse(localStorage.getItem("cart")) || [];
      let exist = cart.findIndex(i => (i.productId || i.id) === id && (!i.selectedVariants || i.selectedVariants.length === 0) && !i.selectedVariant);
      if(exist !== -1) {
        cart[exist].quantity = (parseInt(cart[exist].quantity) || 0) + 1;
      } else {
        cart.push({ id, productId: id, name, price, image, quantity: 1 });
      }
      localStorage.setItem("cart", JSON.stringify(cart));
      
      // إرسال حدث AddToCart للفيسبوك بيكسل
      if (typeof fbq === 'function') {
        fbq('track', 'AddToCart', {
          content_name: name,
          content_ids: [id],
          content_type: 'product',
          value: parseFloat(price) || 0,
          currency: 'EGP'
        });
      }

      if (typeof window.updateSharedCartCount === 'function') {
        window.updateSharedCartCount();
      }
      
      const alertDiv = document.createElement("div");
      alertDiv.style.position = "fixed";
      alertDiv.style.bottom = "100px";
      alertDiv.style.left = "50%";
      alertDiv.style.transform = "translateX(-50%)";
      alertDiv.style.background = "var(--color-blush)";
      alertDiv.style.color = "#fff";
      alertDiv.style.padding = "10px 20px";
      alertDiv.style.borderRadius = "8px";
      alertDiv.style.zIndex = "9999";
      alertDiv.style.fontWeight = "bold";
      alertDiv.textContent = "Added to Cart!";
      document.body.appendChild(alertDiv);
      setTimeout(() => alertDiv.remove(), 2000);
    };
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate`<meta property="og:type" content="website"><meta property="og:url" content="https://dandy-ebon.vercel.app/"><meta property="og:title" content="داندي | Dandy Cosmetics - منتجات طبيعية للعناية بالبشرة والشعر"><meta property="og:description" content="تسوقي الآن من متجر داندي (Dandy Cosmetics)، وجهتك الأولى لأفضل منتجات العناية بالبشرة والشعر الطبيعية في مصر."><meta property="og:image" content="https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="داندي | Dandy Cosmetics - منتجات طبيعية للعناية بالبشرة والشعر"><meta name="twitter:description" content="تسوقي الآن من متجر داندي (Dandy Cosmetics)، وجهتك الأولى لأفضل منتجات العناية بالبشرة والشعر الطبيعية في مصر."><meta name="twitter:image" content="https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg"><script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Dandy Cosmetics",
        "alternateName": "داندي",
        "url": "https://dandy-ebon.vercel.app/",
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://dandy-ebon.vercel.app/all-products?search={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      }
    <\/script><script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Dandy Cosmetics",
        "url": "https://dandy-ebon.vercel.app/",
        "logo": "https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg",
        "sameAs": [
          "https://www.facebook.com/Dandy.Cosmetics/",
          "https://www.instagram.com/dandy.cosmetics/"
        ]
      }
    <\/script>`)}`
	})}`;
}, "/app/applet/src/pages/index.astro", void 0);
var $$file = "/app/applet/src/pages/index.astro";
//#endregion
//#region \0virtual:astro:page:src/pages/index@_@astro
var page = () => pages_exports;
//#endregion
export { page };
