// Astro Server Middleware for legacy redirect handling
export async function onRequest({ url, redirect }, next) {
  const pathname = url.pathname;

  // Known legacy route mapping
  const legacyMap = {
    '/pages/shop/all-products.html': '/all-products',
    '/pages/shop/all-products': '/all-products',
    '/pages/shop/special-offers.html': '/special-offers',
    '/pages/shop/special-offers': '/special-offers',
    '/pages/shop/product.html': '/product',
    '/pages/shop/product': '/product',
    '/pages/shop/cart.html': '/cart',
    '/pages/shop/cart': '/cart',
    '/pages/shop/invoice.html': '/invoice',
    '/pages/shop/invoice': '/invoice',
    '/pages/shop/track-order.html': '/track-order',
    '/pages/shop/track-order': '/track-order',
    '/pages/support/help.html': '/help',
    '/pages/support/help': '/help',
    '/pages/support/client-reviews.html': '/client-reviews',
    '/pages/support/client-reviews': '/client-reviews',
    '/pages/blog/blog.html': '/blog',
    '/pages/blog/blog': '/blog',
    '/pages/blog/post.html': '/post',
    '/pages/blog/post': '/post',
    '/pages/legal/about-us.html': '/about-us',
    '/pages/legal/about-us': '/about-us',
    '/pages/legal/contact-us.html': '/contact-us',
    '/pages/legal/contact-us': '/contact-us',
    '/pages/legal/privacy-policy.html': '/privacy-policy',
    '/pages/legal/privacy-policy': '/privacy-policy',
    '/pages/legal/terms.html': '/terms',
    '/pages/legal/terms': '/terms',
    '/pages/auth/login.html': '/login',
    '/pages/auth/login': '/login',
    '/pages/dashboard/dashboard.html': '/dashboard',
    '/pages/dashboard/dashboard': '/dashboard',
    '/pages/dashboard/dashboard-order.html': '/dashboard-order',
    '/pages/dashboard/dashboard-order': '/dashboard-order',
    '/pages/dashboard/dashboard-product.html': '/dashboard-product',
    '/pages/dashboard/dashboard-product': '/dashboard-product',
    '/pages/dashboard/dashboard-blog.html': '/dashboard-blog',
    '/pages/dashboard/dashboard-blog': '/dashboard-blog',
    '/pages/dashboard/dashboard-index.html': '/dashboard-index',
    '/pages/dashboard/dashboard-index': '/dashboard-index',
    '/pages/dashboard/statues.html': '/statues',
    '/pages/dashboard/statues': '/statues',
    '/index.html': '/',
  };

  if (legacyMap[pathname]) {
    return redirect(legacyMap[pathname] + url.search, 301);
  }

  // Handle generic trailing .html on top-level or sub-routes
  if (pathname.endsWith('.html') && !pathname.startsWith('/assets/')) {
    const cleanPath = pathname.replace(/\.html$/, '');
    const finalDest = (cleanPath === '/index' || cleanPath === '') ? '/' : cleanPath;
    return redirect(finalDest + url.search, 301);
  }

  // Handle any other legacy /pages/ sub-routes
  if (pathname.startsWith('/pages/')) {
    const segments = pathname.split('/').filter(Boolean);
    const lastSegment = (segments[segments.length - 1] || '').replace(/\.html$/, '');
    const finalDest = (lastSegment === 'index' || lastSegment === '') ? '/' : '/' + lastSegment;
    return redirect(finalDest + url.search, 301);
  }

  return next();
}
