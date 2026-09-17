// src/pages/api/product.js
export const prerender = false;

const DB_BASE = "https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app";

const KNOWN_SLUGS = {
  '-OW9U9Af024A9LrbOU4f': 'laser-replacement-cream-60gm',
  '-OW9WB1GTP1GaDoqcd2R': 'treatment-mascara',
  '-OW9YLJvzoW2u9P4ISmA': 'foot-peeling-cream-60gm',
  '-OWF2juQihSL1HV8PwTT': 'nail-serum',
  '-OWF4DCXsfQGlA7OOy11': 'deodorant',
  '-OWF5L62TkM4Y0odMy-l': 'hair-wax-80gm',
  '-OWF6uqnhnu3TCvoqLSD': 'body-and-hair-mist',
  '-OWF8NVhw0HgIaJRVOYL': 'solid-perfume-30gm',
  '-OWF9Deint3XcB6iNdCE': 'tint',
  '-OWFAaqOFptMA4YEPL7p': 'hand-cream-60gm',
  '-O_4D5IO_nPZf1fKcVlJ': 'free-sulfate-shampoo-500ml',
  '-ObKDCc_il_Dz2_Mih-a': 'hair-wax-50gm',
  '-OvPo-cuVeLHWSU8KQ22': 'facial-serum-3x1-30ml',
  '-OvPpP6udx6LlLOL9O34': 'facial-cleanser-150ml',
  '-OvPpguWTAtcaWirD9Um': 'lip-balm',
  '-OvPq4qdTQ-LqYbxr6Yv': 'body-splash-250ml',
  '-OvPqarOBOnNgQ_-kpTl': 'body-butter-150gm',
  '-OvPqzneo_vqpucc-ef8': 'body-splash-25ml',
  '-OvPrFcWZtH_7tuSs7HJ': 'body-splash-100ml',
  '-Ow3pLIN18dRNJ4SdJsq': 'hair-booster-oils-mix',
  '-Ow3pm4awZPtvEZgewr7': 'anti-hair-loss-spray',
  '-Ow3qRPqc7hbleYuJOkI': 'anti-dandruff-shampoo-250ml',
  '-Ox6gMQgCgsSR-DrXTWk': 'anti-hair-loss-shampoo-250ml',
  '-Ox6gklPQABGE7xPcq9a': 'anti-dandruff-spray-60ml',
  '-Ox6hMmd9Ku_sU4d8le-': 'hair-mask-repair-250ml',
  '-Ox6kxYMSw7H675QwVz0': 'anti-dandruff-collection',
  '-Ox6lYUp_xif6WXAHMGO': 'anti-hair-loss-collection',
  '-Ox6sNW3Ki0Am9E6R9n_': 'hair-repair-collection',
  '-Ox6w5wfqsuhTgYlMDBs': 'skin-care-collection',
  '-Ox74e3NwfE2TabGBnUT': 'musk-collection-3-tola-3ml',
  '-OxC877LX3vzD-3Pi_th': 'dandy-musk-6ml',
};

export async function GET({ request, url }) {
  try {
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response("Missing product id", { status: 400 });
    }

    let targetSlug = KNOWN_SLUGS[id];

    if (!targetSlug) {
      const r = await fetch(`${DB_BASE}/products/${encodeURIComponent(id)}.json`);
      if (r.ok) {
        const product = await r.json();
        if (product) {
          targetSlug = product.slug || id;
        }
      }
    }

    if (!targetSlug) {
      return new Response("Product not found", { status: 404 });
    }

    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("host") || url.host;
    const cleanUrl = `${proto}://${host}/product/${encodeURIComponent(targetSlug)}`;

    return Response.redirect(cleanUrl, 301);
  } catch (err) {
    return new Response("Internal server error", { status: 500 });
  }
}
