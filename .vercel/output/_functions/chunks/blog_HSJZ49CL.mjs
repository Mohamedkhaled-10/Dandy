import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_BGeKp411.mjs";
import { t as createComponent } from "./compiler_Bovpdavx.mjs";
import { t as $$BaseLayout } from "./BaseLayout_BhK_tACD.mjs";
//#region src/pages/blog.astro
var blog_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Blog,
	file: () => $$file,
	url: () => $$url
});
var $$Blog = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "مدونة داندي للعناية | أسرار ونصائح الجمال الطبيعي",
		"description": "تصفحى مدونة داندي بيوتي واكتشفي أسرار ونِقاط العناية العضوية بالبشرة والروتين الصحي للشهر مع تركيبات طبيعية 100% لإشراقة ملكية دائمًا.",
		"keywords": "مدونة داندي بيوتي، العناية بالبشرة، العناية بالشعر، خلطات تجميلية طبيعية، روتين صحي للبشرة مصر",
		"canonical": "https://dandy-ebon.vercel.app/blog"
	}, {
		"default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<section class="container" style="padding-top: 140px; text-align: center;"><div class="section-header"><span class="sub">ركن العناية والجمال</span><h2>أسرار وكتالوج المدونة الفخمة</h2><p style="color: var(--color-muted); max-width: 600px; margin: 10px auto 0;">اكتشفي خبايا العناية بالبشرة، روتين ترطيب الشعر وسحره الغني، وأفضل الوصفات المنزلية الطبيعية المدعومة بأقلام خبرائنا.</p></div></section><section class="blog-section container"><div class="blog-grid" id="blogContainer"><!-- dynamic content container --><p style="text-align: center; grid-column:1/-1; color:var(--color-muted);">جاري جمع مواضيعنا المتميزة والمثبتة من أجلكِ...</p></div></section><script>
    const db = window.firestore || firebase.firestore();

    function niceDate(raw){
      try {
        const d = new Date(raw);
        if(isNaN(d)) return raw;
        return d.toLocaleDateString('ar-EG', {day:'numeric', month:'short', year:'numeric'});
      } catch(e) {
        return raw;
      }
    }

    async function loadArticles() {
      const container = document.getElementById('blogContainer');
      if (!container) return;
      container.innerHTML = '';
      
      try {
        const snapshot = await db.collection('articles').orderBy('createdAt', 'desc').get();
        if(snapshot.empty) {
          container.innerHTML = '<div style="text-align:center;grid-column:1/-1;padding:40px 10px;color:var(--color-muted);"><i class="fas fa-edit" style="font-size:3rem;margin-bottom:12px;"></i><p>لا توجد مقالات منشورة بعد بالمدونة الفاخرة.</p></div>';
          return;
        }

        snapshot.forEach(doc => {
          const data = doc.data();
          const img = data.image ? data.image : 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=600&q=80';
          const title = data.title ? data.title : 'عنوان غير متوفر';
          const dateText = data.date ? data.date : (data.createdAt ? niceDate(data.createdAt.toDate()) : '');
          const excerpt = data.excerpt ? data.excerpt : (data.content ? (data.content.replace(/<[^>]+>/g,'').substring(0, 160) + '...') : '');
          const category = data.category ? data.category : 'روتين الجمال';

          const card = document.createElement('article');
          card.className = 'blog-card';
          card.innerHTML = \`
            <div class="blog-thumb">
              <img src="\${img}" alt="\${title}" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=400&q=80';">
            </div>
            <div class="blog-card-body">
              <div class="meta-row">
                <span class="category-tag">\${category}</span>
                <span>📅 \${dateText}</span>
              </div>
              <h3>\${title}</h3>
              <p>\${excerpt}</p>
              <a href="/post?id=\${doc.id}" class="read-more-btn">
                اقرئي المقال <i class="fas fa-arrow-left"></i>
              </a>
            </div>
          \`;
          container.appendChild(card);
        });

      } catch(err) {
        container.innerHTML = '<div style="text-align:center;grid-column:1/-1;padding:40px 10px;color:var(--color-muted);">خطأ أثناء سحب المقالات. نرجو منكِ المحاولة مرة أخرى.</div>';
      }
    }

    loadArticles();
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate`<meta property="og:type" content="website"><meta property="og:url" content="https://dandy-ebon.vercel.app/blog"><meta property="og:title" content="مدونة داندي للعناية | أسرار ونصائح الجمال الطبيعي"><meta property="og:description" content="تصفحى مدونة داندي بيوتي واكتشفي أسرار ونِقاط العناية العضوية بالبشرة والروتين الصحي للشهر"><meta property="og:image" content="https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="مدونة داندي للعناية | أسرار ونصائح الجمال الطبيعي"><meta name="twitter:description" content="تصفحى مدونة داندي بيوتي واكتشفي أسرار ونِقاط العناية العضوية بالبشرة والروتين الصحي للشهر"><meta name="twitter:image" content="https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg">`)}`
	})}`;
}, "/app/applet/src/pages/blog.astro", void 0);
var $$file = "/app/applet/src/pages/blog.astro";
var $$url = "/blog";
//#endregion
//#region \0virtual:astro:page:src/pages/blog@_@astro
var page = () => blog_exports;
//#endregion
export { page };
