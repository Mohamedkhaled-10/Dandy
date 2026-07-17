(function() {
  // Inject Lottie library
  var script = document.createElement('script');
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js";
  script.onload = initLottieLoader;
  document.head.appendChild(script);

  // Determine base path based on location
  var basePath = window.location.pathname.includes('/pages/') || window.location.pathname.includes('/dist/') ? '../../' : './';
  // Note: some deep paths might be deeper. Better absolute or relative trick:
  var depth = (window.location.pathname.match(/\//g) || []).length;
  if (depth > 1 && window.location.pathname.includes('/pages/')) {
    basePath = window.location.pathname.substring(0, window.location.pathname.indexOf('/pages/')) + '/';
  } else if (!window.location.pathname.includes('/pages/')) {
    basePath = '/';
  }

  // Create loading container
  var loaderHtml = document.createElement('div');
  loaderHtml.id = 'global-lottie-loader';
  loaderHtml.style.position = 'fixed';
  loaderHtml.style.top = '0';
  loaderHtml.style.left = '0';
  loaderHtml.style.width = '100vw';
  loaderHtml.style.height = '100vh';
  loaderHtml.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
  loaderHtml.style.zIndex = '999999';
  loaderHtml.style.display = 'flex';
  loaderHtml.style.justifyContent = 'center';
  loaderHtml.style.alignItems = 'center';
  loaderHtml.style.transition = 'opacity 0.5s ease, visibility 0.5s ease';
  
  var animContainer = document.createElement('div');
  animContainer.id = 'lottie-animation-container';
  animContainer.style.width = '300px';
  animContainer.style.height = '300px';
  loaderHtml.appendChild(animContainer);
  
  // Wait for document body to append
  var appendLoader = setInterval(function() {
    if (document.body) {
      document.body.appendChild(loaderHtml);
      clearInterval(appendLoader);
    }
  }, 10);

  var lottieAnim;
  function initLottieLoader() {
    lottieAnim = lottie.loadAnimation({
      container: document.getElementById('lottie-animation-container'),
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: basePath + 'assets/js/lottie-loader.json' // path to the JSON
    });
  }

  // Hide loader on window load or after max 5 seconds as fallback
  window.addEventListener('load', function() {
    hideLoader();
  });
  
  setTimeout(hideLoader, 5000);

  function hideLoader() {
    var loader = document.getElementById('global-lottie-loader');
    if (loader) {
      loader.style.opacity = '0';
      loader.style.visibility = 'hidden';
      setTimeout(function() {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
        if (lottieAnim) lottieAnim.destroy();
      }, 500);
    }
  }

  // Override standard loading texts
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'childList') {
        var loadingEls = document.querySelectorAll('*');
        loadingEls.forEach(function(el) {
          if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
            var text = el.textContent.trim();
            if (text === 'جاري التحميل...' || text.toLowerCase() === 'loading...' || text === 'Loading your beautiful collection...' || text === 'جاري البحث...') {
              // Instead of showing text, we can show a small version of the lottie loader if needed,
              // but global loader covers it. So just empty it or leave it.
              // We'll leave it but maybe hide it if it's annoying.
              el.style.display = 'none';
            }
          }
        });
      }
    });
  });

  // Not strictly needed if we just remove the texts from the HTML files.
})();
