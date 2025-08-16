// /api/product.js
export default async function handler(req, res) {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).send("Missing product id");

    // عدّل الـ URL لو مختلف عندك
    const DB_BASE =
      "https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app";

    // بنجيب المنتج من Realtime DB عبر REST
    const r = await fetch(`${DB_BASE}/products/${id}.json`);
    if (!r.ok) return res.status(500).send("Failed to fetch product");
    const product = await r.json();

    if (!product) return res.status(404).send("Product not found");

    // أدوات بسيطة للهروب من أي حروف خاصة
    const esc = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const title = esc(product.name || "منتج من Dandy");
    const desc = esc(product.description || "عندما يلتقي الجمال مع الطبيعة");
    const image = product.image || "https://dandy-ebon.vercel.app/images/default.jpg";

    // نبني اليو آر إل الحالي تلقائيًا
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const selfUrl = `${proto}://${host}/api/product?id=${encodeURIComponent(id)}`;
    const humanUrl = `${proto}://${host}/product.html?id=${encodeURIComponent(id)}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`<!DOCTYPE html>
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
</html>`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Internal error");
  }
}
