import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_lUswI9jr.mjs";
import { t as createComponent } from "./compiler_BZhHLwe9.mjs";
import { t as $$BaseLayout } from "./BaseLayout_TSlOutx5.mjs";
//#region src/pages/client-reviews.astro
var client_reviews_exports = /* @__PURE__ */ __exportAll({
	default: () => $$ClientReviews,
	file: () => $$file,
	url: () => $$url
});
var $$ClientReviews = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "آراء العملاء | Dandy Cosmetics - تقييمات وتجارب حقيقية",
		"description": "اقرئي تجارب وآراء عملائنا الكرام حول منتجات داندي (Dandy Cosmetics). تقييمات حقيقية تعكس جودة وفعالية منتجاتنا للعناية بالبشرة والشعر.",
		"keywords": "Dandy, Dandy Cosmetics, دندي, داندي, دندي للتجميل, آراء العملاء, تجارب العملاء, تقييمات دندي, ريفيو دندي, Client Reviews",
		"canonical": "https://dandy-ebon.vercel.app/client-reviews"
	}, {
		"default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<section class="reviews-hero container"><div class="section-header"><span class="sub">Stories From Our Beloved Community</span><h1 style="font-size: 2.2rem; font-family:'Space Grotesk', sans-serif; color:var(--color-primary); margin-bottom:15px;">آراء وتجارب عملاء داندي (Dandy Cosmetics)</h1><p style="color: var(--color-muted); max-width: 630px; margin: 10px auto 0;">We are delighted to show organic results and real skincare reactions shared by our clients. Browse through our botanical transformations.</p></div></section><section class="container" style="padding-bottom: 80px;"><h2 class="gallery-title" style="font-family:'Space Grotesk', sans-serif; margin-bottom: 40px;">📸 Photo Transformations & Reviews</h2><div class="gallery-grid" id="testimonial-images"><!-- Testimonial cards loaded dynamically --><p style="text-align: center; grid-column:1/-1; color:var(--color-muted);">Gathering the verified photo reviews gallery...</p></div><h2 class="gallery-title" style="font-family:'Space Grotesk', sans-serif; margin-top: 60px; margin-bottom: 40px;">🎬 Video Stories & Live Impressions</h2><div class="gallery-grid" id="testimonial-videos"><!-- Testimonial videos loaded dynamically --><p style="text-align: center; grid-column:1/-1; color:var(--color-muted);">Preparing the video experiences gallery...</p></div></section><script src="https://cdn.jsdelivr.net/npm/glightbox/dist/js/glightbox.min.js"><\/script><script>
    const db = window.db || firebase.database();
    const imageSection = document.getElementById("testimonial-images");
    const videoSection = document.getElementById("testimonial-videos");

    db.ref('testimonials').on('value', (snapshot) => {
      const data = snapshot.val();
      if (!imageSection || !videoSection) return;
      imageSection.innerHTML = '';
      videoSection.innerHTML = '';

      if (!data) {
        imageSection.innerHTML = '<p style="text-align:center;grid-column:1/-1;color:var(--color-muted);">No reviews posted yet. Dandy welcomes your feedback anytime!</p>';
        videoSection.innerHTML = '<p style="text-align:center;grid-column:1/-1;color:var(--color-muted);">No video reviews posted yet.</p>';
        return;
      }

      Object.values(data).forEach(item => {
        const capsule = document.createElement('div');
        capsule.className = 'review-capsule';

        if (item.type === 'image') {
          const link = document.createElement('a');
          link.href = item.url;
          link.className = 'glightbox';
          link.setAttribute('data-gallery', 'testimonial-images');
          link.setAttribute('data-title', 'Dandy skincare outcome');

          const img = document.createElement('img');
          img.src = item.url;
          img.alt = "نتيجة استخدام منتجات داندي - رأي عميل";
          img.loading = "lazy";

          link.appendChild(img);
          capsule.appendChild(link);
          imageSection.appendChild(capsule);
        } else if (item.type === 'video') {
          const link = document.createElement('a');
          link.href = item.url;
          link.className = 'glightbox';
          link.setAttribute('data-gallery', 'testimonial-videos');
          link.setAttribute('data-type', 'video');
          link.setAttribute('data-title', 'My selfcare journey with Dandy');

          const thumb = document.createElement('div');
          thumb.className = 'video-thumbnail-play';
          thumb.innerHTML = \`
            <i class="fas fa-play-circle"></i>
            <span style="font-weight:700; font-size:0.9rem;">Click to play video review</span>
          \`;

          link.appendChild(thumb);
          capsule.appendChild(link);
          videoSection.appendChild(capsule);
        }
      });

      if (window.GLightbox) {
        GLightbox({ selector: '.glightbox' });
      }
    });
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate`<meta property="og:type" content="website"><meta property="og:url" content="https://dandy-ebon.vercel.app/client-reviews"><meta property="og:title" content="آراء العملاء | Dandy Cosmetics - تقييمات وتجارب حقيقية"><meta property="og:description" content="اقرئي تجارب وآراء عملائنا الكرام حول منتجات داندي (Dandy Cosmetics). تقييمات حقيقية تعكس جودة وفعالية منتجاتنا."><meta property="og:image" content="https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="آراء العملاء | Dandy Cosmetics - تقييمات وتجارب حقيقية"><meta name="twitter:description" content="اقرئي تجارب وآراء عملائنا الكرام حول منتجات داندي (Dandy Cosmetics). تقييمات حقيقية تعكس جودة وفعالية منتجاتنا."><meta name="twitter:image" content="https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg"><!-- GLightbox CSS --><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/glightbox/dist/css/glightbox.min.css"><script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "آراء العملاء | Dandy Cosmetics",
        "description": "تجارب وآراء عملاء داندي.",
        "url": "https://dandy-ebon.vercel.app/client-reviews"
      }
    <\/script>`)}`
	})}`;
}, "/app/applet/src/pages/client-reviews.astro", void 0);
var $$file = "/app/applet/src/pages/client-reviews.astro";
var $$url = "/client-reviews";
//#endregion
//#region \0virtual:astro:page:src/pages/client-reviews@_@astro
var page = () => client_reviews_exports;
//#endregion
export { page };
