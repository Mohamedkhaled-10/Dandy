import admin from "firebase-admin";

// لو انت مش عامل initialize قبل كده
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: "https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app",
  });
}

const db = admin.database();

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).send("Missing product ID");
  }

  try {
    const snapshot = await db.ref("products/" + id).once("value");
    if (!snapshot.exists()) {
      return res.status(404).send("Product not found");
    }

    const product = snapshot.val();

    const ogTitle = product.name || "منتج من Dandy";
    const ogDesc  = product.description || "عندما يلتقي الجمال مع الطبيعة";
    const ogImage = product.image || "https://dandy-ebon.vercel.app/images/default.jpg";
    const ogUrl   = `https://dandy-ebon.vercel.app/api/product?id=${id}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>${ogTitle}</title>
        <meta property="og:title" content="${ogTitle}">
        <meta property="og:description" content="${ogDesc}">
        <meta property="og:image" content="${ogImage}">
        <meta property="og:url" content="${ogUrl}">
        <meta property="og:type" content="product">
      </head>
      <body>
        <script>
          window.location.href = "/product.html?id=${id}";
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching product");
  }
}
