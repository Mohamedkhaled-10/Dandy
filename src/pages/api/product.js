export async function GET({ request, url }) {
  try {
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response("Missing product id", { status: 400 });
    }

    const DB_BASE =
      "https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app";

    const r = await fetch(`${DB_BASE}/products/${id}.json`);
    if (!r.ok) return new Response("Failed to fetch product", { status: 500 });
    const product = await r.json();

    if (!product) return new Response("Product not found", { status: 404 });

    const esc = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const title = esc(product.name || "منتج من Dandy");
    const desc = esc(product.description || "عندما يلتقي الجمال مع الطبيعة");
    const image = product.image || "https://dandy-ebon.vercel.app/images/default.jpg";

    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("host") || url.host;
    const selfUrl = `${proto}://${host}/api/product?id=${encodeURIComponent(id)}`;
    const humanUrl = `${proto}://${host}/pages/shop/product.html?id=${encodeURIComponent(id)}`;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${title}</title>

  <!-- Open Graph -->
  <meta property="og:type" content="product">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${image}">
  <meta property="og:url" content="${selfUrl}">
  <meta property="og:site_name" content="Dandy">

  <!-- Twitter Cards -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${image}">

  <meta name="robots" content="noindex,follow">
</head>
<body>
  <!-- للمستخدم العادي نحوله لصفحة المنتج الطبيعية -->
  <script>location.replace(${JSON.stringify(humanUrl)});</script>
  <noscript><a href="${humanUrl}">اذهب لصفحة المنتج</a></noscript>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    });
  } catch (e) {
    console.error('Error in product endpoint:', e);
    return new Response("Internal error", { status: 500 });
  }
}
