const Layout = {
  renderAnnouncementBar() {
    return `
      <div class="announce-bar">
        <div class="announce-track">
          <span>Enjoy Free Shipping on orders above 1500 LE</span>
          <span>Enjoy Free Shipping on orders above 1500 LE</span>
          <span>Enjoy Free Shipping on orders above 1500 LE</span>
          <span>Enjoy Free Shipping on orders above 1500 LE</span>
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
          <span class="cosmetics-label">COSMETICS</span>
          <span class="brand-name">Dandy<span class="flower">✳</span></span>
        </div>
        <div class="header-actions">
          <button class="header-icon" aria-label="Search" onclick="window.location.href='${basePath}pages/shop/all-products.html'">
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
    `.replace(/<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"\/><line x1="3" y1="12" x2="21" y2="18"\/><\/svg> <!-- using bars but inline svg is easy: -->\n\s*/, '');
  },
  
  renderFooter(basePath) {
    return `
      <footer>
        <div class="footer-logo">
          <span class="cosmetics-label">COSMETICS</span>
          Dandy<span style="font-size:1rem;">✳</span>
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
      
      <a class="whatsapp-float" href="https://wa.me/201038941005" target="_blank" aria-label="WhatsApp">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 00-8.5 15.2L2 22l4.9-1.4A10 10 0 1012 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.2-.4.1-.2 0-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2 1 2.4c.1.2 1.6 2.5 4 3.4.5.2 1 .3 1.3.5.6.2 1.1.1 1.5.1.5-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3z"/></svg>
      </a>
      
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
