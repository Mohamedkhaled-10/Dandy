import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_lUswI9jr.mjs";
import { t as createComponent } from "./compiler_BZhHLwe9.mjs";
import { t as $$BaseLayout } from "./BaseLayout_TSlOutx5.mjs";
//#region src/pages/post.astro
var post_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Post,
	file: () => $$file,
	url: () => $$url
});
var $$Post = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "ركن الجمال والمقالات | Dandy",
		"description": "تصفح وتابع أحدث نصائح العناية العضوية بالبشرة والشعر من خبراء داندي بيوتي. أسرار الطبيعة لإشراقة تدوم.",
		"keywords": "داندي, مقالات داندي, العناية بالبشرة, جمال طبيعي, العناية بالبشرة مصر, زيوت طبيعية للشعر",
		"canonical": "https://dandy-ebon.vercel.app/post"
	}, {
		"default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<main class="container"><article class="post-container" id="postArticleArea"><img loading="lazy" id="postImage" class="header-img" src="" alt="Dandy Luxury Beauty Blog Cover"><h1 id="postTitle">...جاري جلب العنوان</h1><div class="post-date" id="postDate">📅 ...</div><div class="post-body-content" id="postContent"><p>جاري سحب المحتوى والوصف الشيق من نظام المدونة الخاص بنا...</p></div></article></main><section class="container" style="margin-bottom: 80px;"><div class="section-header" style="text-align: right; margin-bottom: 30px;"><span class="sub">مواضيع ذات صلة</span><h2>قرّاء المدونة يفضلون أيضاً</h2></div><div class="rec-blog-grid" id="suggestedContainer"><!-- suggestions fetched dynamically --><p style="color: var(--color-muted);">جاري تحضير المقترحات...</p></div></section><script>
    const db = window.firestore || firebase.firestore();

    function formatArticleDate(data) {
      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        try {
          return data.createdAt.toDate().toLocaleDateString('ar-EG', {year:'numeric', month:'long', day:'numeric'});
        } catch (e) {}
      }
      if (data.date) return data.date;
      return '';
    }

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const isSlugRoute = pathParts[0] === 'blog' && pathParts[1];
    const slugFromPath = isSlugRoute ? decodeURIComponent(pathParts[1]) : null;

    const urlParams = new URLSearchParams(window.location.search);
    let postId = urlParams.get("id");

    let articleDoc = null;

    async function loadPost() {
      try {
        if (slugFromPath) {
          const query = await db.collection('articles').where('slug', '==', slugFromPath).limit(1).get();
          if (!query.empty) articleDoc = query.docs[0];
        }

        if (!articleDoc && postId) {
          const doc = await db.collection('articles').doc(postId).get();
          if (doc.exists) articleDoc = doc;
        }

        if(!articleDoc || !articleDoc.exists) {
          const area = document.getElementById('postArticleArea');
          if (area) {
            area.innerHTML = \`
              <div style="text-align:center; padding:40px 10px;">
                <i class="fas fa-exclamation-circle" style="font-size:3.5rem; color:var(--color-gold); margin-bottom:16px;"></i>
                <h2 style="font-family:'Cairo', sans-serif;">المقالة غير متوفرة أو قد تم إزالتها</h2>
                <a href="/blog" class="cta-btn" style="margin-top:20px; border-radius:99px; padding:12px 24px;">العودة لصفحة المقالات</a>
              </div>
            \`;
          }
          return;
        }
        
        postId = articleDoc.id;
        const data = articleDoc.data();
        const pImg = document.getElementById('postImage');
        const pTitle = document.getElementById('postTitle');
        const pDate = document.getElementById('postDate');
        const pContent = document.getElementById('postContent');

        const dateStr = formatArticleDate(data);
        if (pImg) pImg.src = data.image || 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=800&q=80';
        if (pTitle) pTitle.textContent = data.title || '';
        if (pDate) pDate.textContent = dateStr ? '📅 ' + dateStr : '📅 روتين الجمال المبهج';
        if (pContent) pContent.innerHTML = data.content || '';

        document.title = data.title ? \`\${data.title} | مدونة Dandy\` : 'عرض المقال | Dandy';

        const cleanDesc = (data.content || "روتين الجمال العضوي والعناية الطبيعية بالبشرة والشعر من داندي بيوتي.").replace(/<[^>]*>/g, '').substring(0, 155).trim() + "...";
        const cleanImg = data.image || 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1200&q=80';
        const pageURL = window.location.href;

        const updateMetaTag = (selector, attrName, value) => {
          try {
            let meta = document.querySelector(selector);
            if (meta) {
              meta.setAttribute(attrName, value || '');
            } else {
              meta = document.createElement('meta');
              if (selector.startsWith('meta[property')) {
                const prop = selector.match(/property="([^"]+)"/);
                if (prop) meta.setAttribute('property', prop[1]);
              } else if (selector.startsWith('meta[name')) {
                const nm = selector.match(/name="([^"]+)"/);
                if (nm) meta.setAttribute('name', nm[1]);
              }
              meta.setAttribute(attrName, value || '');
              document.head.appendChild(meta);
            }
          } catch (e) {}
        };

        updateMetaTag('#meta-description-tag', 'content', cleanDesc);
        updateMetaTag('meta[name="description"]', 'content', cleanDesc);

        updateMetaTag('#og-title-meta', 'content', data.title);
        updateMetaTag('meta[property="og:title"]', 'content', data.title);
        updateMetaTag('#og-desc-meta', 'content', cleanDesc);
        updateMetaTag('meta[property="og:description"]', 'content', cleanDesc);
        updateMetaTag('#og-image-meta', 'content', cleanImg);
        updateMetaTag('meta[property="og:image"]', 'content', cleanImg);
        updateMetaTag('#og-url-meta', 'content', pageURL);
        updateMetaTag('meta[property="og:url"]', 'content', pageURL);

        updateMetaTag('#tw-title-meta', 'content', data.title);
        updateMetaTag('meta[name="twitter:title"]', 'content', data.title);
        updateMetaTag('#tw-desc-meta', 'content', cleanDesc);
        updateMetaTag('meta[name="twitter:description"]', 'content', cleanDesc);
        updateMetaTag('#tw-image-meta', 'content', cleanImg);
        updateMetaTag('meta[name="twitter:image"]', 'content', cleanImg);

        try {
          let schemaScript = document.getElementById('dynamic-article-schema');
          if (!schemaScript) {
            schemaScript = document.createElement('script');
            schemaScript.id = 'dynamic-article-schema';
            schemaScript.type = 'application/ld+json';
            document.head.appendChild(schemaScript);
          }
          let pubDate = '2026-01-01';
          if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            try { pubDate = data.createdAt.toDate().toISOString(); } catch(e) {}
          } else if (data.date) {
            pubDate = data.date;
          }

          const schemaJSON = {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": data.title,
            "image": [cleanImg],
            "datePublished": pubDate,
            "description": cleanDesc,
            "author": {
              "@type": "Organization",
              "name": "Dandy"
            },
            "publisher": {
              "@type": "Organization",
              "name": "Dandy",
              "logo": {
                "@type": "ImageObject",
                "url": "https://dandy-ebon.vercel.app/assets/images/logo.png"
              }
            }
          };
          schemaScript.textContent = JSON.stringify(schemaJSON);
        } catch (err) {}

      } catch(e) {
        console.error(e);
      }
    }

    async function loadSuggested() {
      const container = document.getElementById('suggestedContainer');
      if (!container) return;
      container.innerHTML = '';
      
      try {
        const snapshot = await db.collection('articles').orderBy('createdAt', 'desc').limit(4).get();
        let matchCount = 0;

        snapshot.forEach(doc => {
          if(doc.id === postId) return;
          const d = doc.data();
          if (d.status === 'draft') return;
          matchCount++;
          
          const cardEl = document.createElement('div');
          cardEl.className = 'rec-blog-card';
          const img = d.image ? d.image : 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=400&q=80';
          const title = d.title || 'بدون عنوان';
          const dateText = formatArticleDate(d) || 'روتين الجمال';
          const postLink = d.slug ? \`/blog/\${encodeURIComponent(d.slug)}\` : \`/post?id=\${doc.id}\`;

          cardEl.innerHTML = \`
            <img loading="lazy" src="\${img}" alt="\${title}" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=400&q=80';">
            <div style="padding:16px; display:flex; flex-direction:column; flex:1;">
              <span style="font-size:0.8rem; color:var(--color-gold); font-weight:700; margin-bottom:6px;">📅 \${dateText}</span>
              <h3 style="font-size:1.05rem; font-weight:700; color:var(--color-primary); line-height:1.4; margin-bottom:12px; height:44px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">\${title}</h3>
              <a href="\${postLink}" style="color:var(--color-blush); text-decoration:none; font-weight:700; font-size:0.85rem; margin-top:auto;"><i class="fas fa-book-open"></i> قراءة المقال ⟵</a>
            </div>
          \`;
          container.appendChild(cardEl);
        });

        if(matchCount === 0) {
          container.innerHTML = '<p style="color:var(--color-muted);">لا توجد مواضيع أخرى مقترحة بالتناوب حالياً.</p>';
        }

      } catch(err) {
        container.innerHTML = '<p style="color:var(--color-muted);">خطأ أثناء سحب المقترحات.</p>';
      }
    }

    async function init() {
      await loadPost();
      loadSuggested();
    }
    init();
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate`<meta property="og:type" content="article"><meta property="og:title" id="og-title-meta" content="ركن الجمال | Dandy"><meta property="og:description" id="og-desc-meta" content="نصائح وأسرار الجمال الطبيعي للعناية بالبشرة والشعر بتركيبات داندي العضوية."><meta property="og:image" id="og-image-meta" content="https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg"><meta property="og:url" id="og-url-meta" content="https://dandy-ebon.vercel.app/post"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" id="tw-title-meta" content="ركن الجمال | Dandy"><meta name="twitter:description" id="tw-desc-meta" content="نصائح وأسرار الجمال الطبيعي للعناية بالبشرة والشعر بتركيبات داندي العضوية."><meta name="twitter:image" id="tw-image-meta" content="https://i.postimg.cc/0yKZhwzg/601405410-122174066234434656-1527373666969709188-n.jpg">`)}`
	})}`;
}, "/app/applet/src/pages/post.astro", void 0);
var $$file = "/app/applet/src/pages/post.astro";
var $$url = "/post";
//#endregion
//#region \0virtual:astro:page:src/pages/post@_@astro
var page = () => post_exports;
//#endregion
export { page };
