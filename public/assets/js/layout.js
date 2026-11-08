const Layout = {
  renderAnnouncementBar() {
    return `
      <div class="announce-bar">
        <div class="announce-track">
          <span>Enjoy Free Shipping on orders above 2000 LE</span>
          <span>Enjoy Free Shipping on orders above 2000 LE</span>
          <span>Enjoy Free Shipping on orders above 2000 LE</span>
          <span>Enjoy Free Shipping on orders above 2000 LE</span>
        </div>
      </div>
    `;
  },
  
  renderHeader(basePath) {
    return `
      <header>
        <button class="header-icon" aria-label="Menu" onclick="window.toggleNav()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="18"/></svg> <!-- using bars but inline svg is easy: -->
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div class="logo" onclick="window.location.href='${basePath}index.html'">
          <img src="${basePath}assets/images/logo.png" alt="Dandy Cosmetics" style="max-height: 45px; width: auto; object-fit: contain;">
        </div>
        <div class="header-actions">
          <button class="header-icon" aria-label="Search" onclick="window.toggleSearchPanel()">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
      </header>
      
      <div class="menu-overlay" id="menu-overlay" onclick="window.toggleNav()"></div>
      <div class="menubar" id="menubar">
        <button class="close-menu" onclick="window.toggleNav()" style="background:none; border:none; color:var(--maroon, #7a1f3d); font-size:1.5rem; cursor:pointer; margin-bottom:20px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="menubar-content">
          <ul style="list-style:none; padding:0;">
            <li style="margin-bottom:15px;"><a href="${basePath}index.html" style="font-size:1.1rem; font-weight:500; color:#2b2b2b; text-decoration:none;">Home</a></li>
            <li style="margin-bottom:15px;"><a href="${basePath}pages/shop/all-products.html" style="font-size:1.1rem; font-weight:500; color:#2b2b2b; text-decoration:none;">Products</a></li>
            <li style="margin-bottom:15px;"><a href="${basePath}pages/shop/special-offers.html" style="font-size:1.1rem; font-weight:500; color:#2b2b2b; text-decoration:none;">Offers</a></li>
            <li style="margin-bottom:15px;"><a href="${basePath}pages/shop/track-order.html" style="color:var(--maroon, #7a1f3d); font-weight:bold; font-size:1.1rem; text-decoration:none;">Track Your Order</a></li>
            <li style="margin-bottom:15px;"><a href="${basePath}pages/support/help.html" style="font-size:1.1rem; font-weight:500; color:#2b2b2b; text-decoration:none;">Help & Gifting Guide</a></li>
            <li style="margin-bottom:15px;"><a href="${basePath}pages/support/client-reviews.html" style="font-size:1.1rem; font-weight:500; color:#2b2b2b; text-decoration:none;">Client Reviews</a></li>
            <li style="margin-bottom:15px;"><a href="${basePath}pages/blog/blog.html" style="font-size:1.1rem; font-weight:500; color:#2b2b2b; text-decoration:none;">Blog Posts</a></li>
            <li style="margin-bottom:15px;"><a href="${basePath}pages/legal/about-us.html" style="font-size:1.1rem; font-weight:500; color:#2b2b2b; text-decoration:none;">About Us</a></li>
          </ul>
          <div class="side-bottom-links" style="margin-top:30px; padding-top:20px; border-top:1px solid #eee; font-size:0.9rem;">
            <a href="${basePath}pages/legal/privacy-policy.html" style="color:#666; margin-right:10px; text-decoration:none;">Privacy Policy</a>
            <a href="${basePath}pages/legal/terms.html" style="color:#666; text-decoration:none;">Terms & Conditions</a>
          </div>
        </div>
      </div>

      <div class="search-overlay" id="search-overlay" onclick="window.toggleSearchPanel()"></div>
      <div class="search-panel" id="search-panel">
        <button class="close-search-panel" onclick="window.toggleSearchPanel()" style="background:none; border:none; color:var(--color-primary); font-size:1.5rem; cursor:pointer; margin-bottom:20px; align-self:flex-start; position:static;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="search-input-wrap" style="position:relative; margin-bottom:20px;">
           <input type="text" id="live-search-input" placeholder="ابحث عن منتج..." style="width:100%; padding:12px 12px 12px 40px; border:1px solid var(--border-light, #fbcfe8); border-radius:8px; font-family:inherit; font-size:1rem; color:var(--color-text, #262626); outline:none; transition:border-color 0.3s;" onfocus="this.style.borderColor='var(--color-primary)'" onblur="this.style.borderColor='var(--border-light, #fbcfe8)'" oninput="window.handleLiveSearch(this.value, '${basePath}')">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#7a7a7a;"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <div id="live-search-results" style="flex:1; overflow-y:auto; padding-right:5px; scrollbar-width:thin;">
            <p style="color:#7a7a7a; text-align:center; font-size:0.95rem; margin-top:20px;">اقتراحات البحث:<br><br>
                <span style="display:inline-block; padding:6px 12px; background:var(--color-surface-soft, #fdf2f8); color:var(--color-primary); border-radius:30px; margin:4px; font-size:0.85rem; cursor:pointer;" onclick="document.getElementById('live-search-input').value='عناية'; window.handleLiveSearch('عناية', '${basePath}')">عناية</span>
                <span style="display:inline-block; padding:6px 12px; background:var(--color-surface-soft, #fdf2f8); color:var(--color-primary); border-radius:30px; margin:4px; font-size:0.85rem; cursor:pointer;" onclick="document.getElementById('live-search-input').value='شعر'; window.handleLiveSearch('شعر', '${basePath}')">شعر</span>
                <span style="display:inline-block; padding:6px 12px; background:var(--color-surface-soft, #fdf2f8); color:var(--color-primary); border-radius:30px; margin:4px; font-size:0.85rem; cursor:pointer;" onclick="document.getElementById('live-search-input').value='بشرة'; window.handleLiveSearch('بشرة', '${basePath}')">بشرة</span>
            </p>
        </div>
      </div>
    `.replace(/<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"\/><line x1="3" y1="12" x2="21" y2="18"\/><\/svg> <!-- using bars but inline svg is easy: -->\n\s*/, '');
  },
  
  renderFooter(basePath) {
    return `
      <footer>
        <div class="footer-logo">
          <img src="${basePath}assets/images/logo.png" alt="Dandy Cosmetics" style="max-height: 60px; width: auto; object-fit: contain; filter: brightness(0) invert(1);">
        </div>
        <p class="tagline">Elevate your beauty ritual with premium, luxurious cosmetics.</p>
        <div class="footer-menu">
          <div class="footer-menu-item"><a href="${basePath}pages/shop/all-products.html">All Products</a></div>
          <div class="footer-menu-item"><a href="${basePath}pages/shop/special-offers.html">Special Offers</a></div>
          <div class="footer-menu-item"><a href="${basePath}pages/blog/blog.html">Our Blog</a></div>
          <div class="footer-menu-item"><a href="${basePath}pages/support/help.html">Help Guide</a></div>
          <div class="footer-menu-item"><a href="${basePath}pages/legal/about-us.html">About Us</a></div>
        </div>
        <div class="footer-social">
          <a href="https://www.facebook.com/profile.php?id=61563039704396" target="_blank" aria-label="Facebook"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M22 12a10 10 0 10-11.5 9.9v-7H7.9V12h2.6V9.8c0-2.6 1.5-4 3.9-4 1.1 0 2.3.2 2.3.2v2.5h-1.3c-1.3 0-1.7.8-1.7 1.6V12h2.9l-.5 2.9h-2.4v7A10 10 0 0022 12z"/></svg></a>
          <a href="https://www.instagram.com/dandy_skincare_cosmotics" target="_blank" aria-label="Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></a>
        </div>
        <p class="copyright">© 2026 Dandy Cosmetics.</p>
      </footer>
      
      <div id="whatsapp-widget" class="whatsapp-widget">
        <div class="whatsapp-handle" id="whatsapp-handle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left: 2px;"><path d="M15 18l-6-6 6-6"/></svg>
        </div>
        <a class="whatsapp-float" draggable="false" href="https://wa.me/201038941005" target="_blank" aria-label="WhatsApp">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 00-8.5 15.2L2 22l4.9-1.4A10 10 0 1012 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.2-.4.1-.2 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2 1 2.4c.1.2 1.6 2.5 4 3.4.5.2 1 .3 1.3.5.6.2 1.1.1 1.5.1.5-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3z"/></svg>
      </a>
      </div>
      
      <nav class="bottom-nav">
        <a href="${basePath}index.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>Home</a>
        <a href="${basePath}pages/shop/all-products.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Search</a>
        <a href="${basePath}pages/shop/cart.html">
          <span class="cart-count" id="shared-cart-count" style="position:absolute; top:-5px; right:15px; background:var(--sale-red, #e8412c); color:#fff; border-radius:50%; width:16px; height:16px; font-size:10px; display:flex; align-items:center; justify-content:center;">0</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/></svg>Cart
        </a>
        <a href="${basePath}pages/shop/all-products.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>Products</a>
        <a href="${basePath}pages/legal/about-us.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>About</a>
      </nav>
    `;
  },
  
  init() {
    // Determine base path
    let basePath = "";
    if (window.location.pathname.includes('/pages/')) {
      const match = window.location.pathname.match(/(.*\/pages\/[^\/]+\/)/);
      if (match) {
        basePath = "../../";
      } else {
        basePath = "../";
      }
    } else {
      basePath = "";
    }

    const body = document.body;
    if (body && body.getAttribute('data-astro-layout') === 'true') {
      return;
    }

    // We removed them using the regex but just in case
    const oldFloatingIcons = document.querySelectorAll(".floating-whatsapp, .whatsapp-float, .bottom-nav");
    oldFloatingIcons.forEach(el => el.remove());

    const announceBar = document.querySelector(".announce-bar");
    if (announceBar) announceBar.remove();
    const header = document.querySelector("header");
    if (header) header.remove();

    body.insertAdjacentHTML('afterbegin', this.renderHeader(basePath));
    body.insertAdjacentHTML('afterbegin', this.renderAnnouncementBar());
    body.insertAdjacentHTML('beforeend', this.renderFooter(basePath));

    if (typeof window.updateSharedCartCount !== 'function') {
      window.updateSharedCartCount = function() {
        window.updateCartCount = window.updateSharedCartCount;
        try {
          const raw = localStorage.getItem('cart') || '[]';
          const cart = JSON.parse(raw);
          const count = Array.isArray(cart) ? cart.reduce((s, i) => s + (i.quantity ? Number(i.quantity) : 1), 0) : 0;
          const countEls = document.querySelectorAll('#shared-cart-count, #cart-count');
          countEls.forEach(el => el.textContent = count);
        } catch(e) {}
      };
      window.addEventListener('storage', (e) => {
        if (e.key === 'cart') window.updateSharedCartCount();
      });
    }
    
    window.updateSharedCartCount();
  }
};

window.toggleNav = function() {
  const menubar = document.getElementById("menubar");
  const overlay = document.getElementById("menu-overlay");
  
  if (menubar && !menubar.classList.contains("active")) {
      const searchPanel = document.getElementById("search-panel");
      const searchOverlay = document.getElementById("search-overlay");
      if(searchPanel) searchPanel.classList.remove("active");
      if(searchOverlay) searchOverlay.classList.remove("active");
  }
  
  if (menubar) menubar.classList.toggle("active");
  if (overlay) overlay.classList.toggle("active");
};

// Also listen to existing updateCartCount if it gets called locally
window.updateCartCount = function() { if(typeof window.updateSharedCartCount === "function") window.updateSharedCartCount(); };
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
  originalSetItem.apply(this, arguments);
  if (key === 'cart') {
    if (typeof window.updateSharedCartCount === 'function') window.updateSharedCartCount();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", () => {
    Layout.init();
  });
} else {
  Layout.init();
}


// =========================================
// UI Polish: Scroll Reveal Micro-interaction
// =========================================
document.addEventListener('DOMContentLoaded', () => {
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };
  
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Function to observe newly added cards (for dynamic content)
  window.observeProductCards = function() {
    const cards = document.querySelectorAll('.product, .product-card, .category-card');
    cards.forEach(card => {
      if(!card.classList.contains('reveal-item')) {
        card.classList.add('reveal-item');
        observer.observe(card);
      }
    });
  };
  
  // Initial observation
  setTimeout(window.observeProductCards, 500); // Wait for dynamic content
  
  // If there's a dynamic render function, we could hook into it or just use MutationObserver
  const bodyObserver = new MutationObserver((mutations) => {
    let shouldReobserve = false;
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) shouldReobserve = true;
    });
    if(shouldReobserve) window.observeProductCards();
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
});


window.toggleSearchPanel = function() {
  const panel = document.getElementById("search-panel");
  const overlay = document.getElementById("search-overlay");
  const menubar = document.getElementById("menubar");
  const menuOverlay = document.getElementById("menu-overlay");
  
  if (panel) {
      const isActive = panel.classList.contains("active");
      if (!isActive) {
          // Open search
          panel.classList.add("active");
          if(overlay) overlay.classList.add("active");
          // Close menubar if open
          if(menubar) menubar.classList.remove("active");
          if(menuOverlay) menuOverlay.classList.remove("active");
          
          // focus input
          setTimeout(() => {
              const inp = document.getElementById("live-search-input");
              if(inp) inp.focus();
          }, 300);
      } else {
          // Close search
          panel.classList.remove("active");
          if(overlay) overlay.classList.remove("active");
      }
  }
};

window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const panel = document.getElementById("search-panel");
        const overlay = document.getElementById("search-overlay");
        if (panel && panel.classList.contains("active")) {
            panel.classList.remove("active");
            if(overlay) overlay.classList.remove("active");
        }
    }
});

let liveSearchTimeout = null;
window.handleLiveSearch = function(query, basePath) {
    clearTimeout(liveSearchTimeout);
    liveSearchTimeout = setTimeout(() => {
        performSearch(query, basePath);
    }, 300);
};

function performSearch(query, basePath) {
    const resultsContainer = document.getElementById("live-search-results");
    if(!resultsContainer) return;
    
    query = (query || "").trim().toLowerCase();
    if(!query) {
        resultsContainer.innerHTML = `
            <p style="color:#7a7a7a; text-align:center; font-size:0.95rem; margin-top:20px;">اقتراحات البحث:<br><br>
                <span style="display:inline-block; padding:6px 12px; background:var(--color-surface-soft, #fdf2f8); color:var(--color-primary); border-radius:30px; margin:4px; font-size:0.85rem; cursor:pointer;" onclick="document.getElementById('live-search-input').value='عناية'; window.handleLiveSearch('عناية', '${basePath}')">عناية</span>
                <span style="display:inline-block; padding:6px 12px; background:var(--color-surface-soft, #fdf2f8); color:var(--color-primary); border-radius:30px; margin:4px; font-size:0.85rem; cursor:pointer;" onclick="document.getElementById('live-search-input').value='شعر'; window.handleLiveSearch('شعر', '${basePath}')">شعر</span>
                <span style="display:inline-block; padding:6px 12px; background:var(--color-surface-soft, #fdf2f8); color:var(--color-primary); border-radius:30px; margin:4px; font-size:0.85rem; cursor:pointer;" onclick="document.getElementById('live-search-input').value='بشرة'; window.handleLiveSearch('بشرة', '${basePath}')">بشرة</span>
            </p>
        `;
        return;
    }

    resultsContainer.innerHTML = '<div style="text-align:center; padding:20px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><br><small style="color:#7a7a7a; margin-top:10px; display:inline-block;"></small></div>';

    // Fetch products
    if(typeof window.db === 'undefined') {
        // if db is not defined globally in layout, we might need to fetch from REST
        fetch("https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app/products.json")
        .then(res => res.json())
        .then(data => {
            renderSearchResults(data, query, basePath, resultsContainer);
        })
        .catch(err => {
            console.error(err);
            resultsContainer.innerHTML = '<p style="color:var(--color-danger); text-align:center;">حدث خطأ أثناء البحث.</p>';
        });
    } else {
        window.db.ref('products').once('value').then(snap => {
            renderSearchResults(snap.val(), query, basePath, resultsContainer);
        }).catch(err => {
            console.error(err);
            resultsContainer.innerHTML = '<p style="color:var(--color-danger); text-align:center;">حدث خطأ أثناء البحث.</p>';
        });
    }
}

function renderSearchResults(data, query, basePath, container) {
    if(!data) {
        container.innerHTML = '<p style="color:#7a7a7a; text-align:center; padding:20px;">عذراً، لم نتمكن من العثور على منتجات.</p>';
        return;
    }
    
    let products = [];
    Object.keys(data).forEach(k => {
        let p = data[k];
        p.id = k;
        if(p.name) products.push(p);
    });
    
    // Calculate score
    products.forEach(p => {
        let score = 0;
        let n = p.name.toLowerCase();
        let c = (p.category || "").toLowerCase();
        
        if(n === query) score = 100;
        else if(n.startsWith(query)) score = 80;
        else if(n.includes(query)) score = 50;
        
        if(c === query) score += 30;
        else if(c.includes(query)) score += 10;
        
        p._score = score;
    });
    
    products = products.filter(p => p._score > 0).sort((a,b) => b._score - a._score);
    
    if(products.length === 0) {
        container.innerHTML = '<p style="color:#7a7a7a; text-align:center; padding:20px;">لا توجد نتائج مطابقة لـ "' + query + '"<br><br>جرب البحث بكلمات أخرى.</p>';
        return;
    }
    
    let html = '<div style="display:flex; flex-direction:column; gap:12px; padding:10px 0;">';
    products.forEach(p => {
        let priceStr = p.price + ' EGP';
        if(p.onSale && p.discount) {
            let priceRaw = parseFloat(p.price);
            let discountPercent = parseFloat(p.discount) || 0;
            let oldPrice = priceRaw / (1 - (discountPercent/100));
            priceStr = `<span style="text-decoration:line-through; color:#aaa; font-size:0.8rem; margin-left:6px;">${oldPrice.toFixed(0)}</span> <strong style="color:var(--color-danger);">${priceRaw} EGP</strong>`;
        } else if (p.originalPrice) {
            priceStr = `<span style="text-decoration:line-through; color:#aaa; font-size:0.8rem; margin-left:6px;">${p.originalPrice}</span> <strong style="color:var(--color-danger);">${p.price} EGP</strong>`;
        } else {
            priceStr = `<strong style="color:var(--color-danger);">${p.price} EGP</strong>`;
        }
        
        html += `
            <div style="display:flex; align-items:center; gap:12px; padding:10px; border:1px solid #f0e6e2; border-radius:8px; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#fdf2f8'" onmouseout="this.style.background='transparent'" onclick="window.location.href='${basePath}pages/shop/product.html?id=${p.id}'">
                <img src="${p.image || ''}" alt="" loading="lazy" style="width:60px; height:60px; object-fit:cover; border-radius:6px; background:#f9f9f9;">
                <div style="flex:1;">
                    <h4 style="margin:0 0 4px 0; font-size:0.95rem; color:var(--color-text);">${p.name}</h4>
                    <div style="font-size:0.85rem; color:#7a7a7a;">${priceStr}</div>
                    ${p.category ? `<span style="display:inline-block; padding:2px 6px; background:#f0f0f0; border-radius:4px; font-size:0.7rem; margin-top:4px;">${p.category}</span>` : ''}
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

setTimeout(() => {
  const widget = document.getElementById("whatsapp-widget");
  const handle = document.getElementById("whatsapp-handle");
  if (!widget || !handle) return;
  
  let startX = 0;
  let currentX = 0;
  let isDragging = false;
  let isOpen = false;
  let movedDuringDrag = false;
  const maxDrag = -70;

  const dragStart = (e) => {
    isDragging = true;
    movedDuringDrag = false;
    startX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
    widget.style.transition = "none";
  };

  const dragMove = (e) => {
    if (!isDragging) return;
    const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
    const dx = clientX - startX;
    if (Math.abs(dx) > 5) movedDuringDrag = true;
    
    let newX = isOpen ? maxDrag + dx : dx;
    if (newX > 0) newX = 0;
    if (newX < maxDrag) newX = maxDrag;
    
    widget.style.transform = `translateX(${newX}px)`;
    currentX = newX;
  };

  const dragEnd = (e) => {
    if (!isDragging) return;
    isDragging = false;
    widget.style.transition = "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)";
    
    if (currentX < maxDrag / 2) {
      isOpen = true;
      currentX = maxDrag;
      widget.classList.add("open");
      widget.style.transform = "";
      handle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left: 2px;"><path d="M9 18l6-6-6-6"/></svg>`;
    } else {
      isOpen = false;
      currentX = 0;
      widget.classList.remove("open");
      widget.style.transform = "";
      handle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left: 2px;"><path d="M15 18l-6-6 6-6"/></svg>`;
    }
  };

  widget.addEventListener("touchstart", dragStart, { passive: true });
  document.addEventListener("touchmove", dragMove, { passive: true });
  document.addEventListener("touchend", dragEnd);

  widget.addEventListener("mousedown", dragStart);
  document.addEventListener("mousemove", dragMove);
  document.addEventListener("mouseup", dragEnd);
  
  handle.addEventListener("click", (e) => {
    if(!movedDuringDrag) {
      isOpen = !isOpen;
      currentX = isOpen ? maxDrag : 0;
      if (isOpen) {
        widget.classList.add("open");
        handle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left: 2px;"><path d="M9 18l6-6-6-6"/></svg>`;
      } else {
        widget.classList.remove("open");
        handle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left: 2px;"><path d="M15 18l-6-6 6-6"/></svg>`;
      }
    }
  });
  const link = document.querySelector(".whatsapp-float");
  if(link) {
    link.addEventListener("click", (e) => {
      if(movedDuringDrag) e.preventDefault();
    });
  }
}, 500);
