import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_BGeKp411.mjs";
import { t as createComponent } from "./compiler_Bovpdavx.mjs";
import { t as $$BaseLayout } from "./BaseLayout_BhK_tACD.mjs";
//#region src/pages/dashboard-blog.astro
var dashboard_blog_exports = /* @__PURE__ */ __exportAll({
	default: () => $$DashboardBlog,
	file: () => $$file,
	url: () => $$url
});
var $$DashboardBlog = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "مدير المقالات والمدونة | لوحة داندي",
		"description": "إدارة مقالات مدونة داندي التجميلية وإضافة وتعديل مقالات روتين العناية والجمال",
		"robots": "noindex, nofollow"
	}, {
		"default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<section class="manager-section container"><div class="manager-layout"><!-- Right Content Card Form --><div class="manager-card"><h3><i class="far fa-edit"></i> إضافة / تعديل مقالة جمالية</h3><form id="articleForm"><input type="hidden" id="edit-id"><div class="form-group-admin" style="margin-bottom: 16px;"><label for="a-title">عنوان المقالة الفاخر</label><input type="text" id="a-title" placeholder="على سبيل المثال: روتين شتوي متكامل لترطيب الشعر" required></div><div class="form-row"><div class="form-group-admin"><label for="a-category">القسم والتصنيف</label><select id="a-category"><option>روتين الجمال</option><option>أسرار البشرة</option><option>نضارة الجلد</option><option>تاج الشعر</option><option>العناية المتقدمة</option></select></div><div class="form-group-admin"><label for="a-date">تاريخ المقالة المقروء</label><input type="text" id="a-date" placeholder="مثال: 12 يونيو 2026" required></div></div><div class="form-group-admin" style="margin-bottom: 16px;"><label for="a-image">رابط الصورة المميزة (عرض مقاس عريض)</label><input type="url" id="a-image" placeholder="https://unsplash.com/..." required></div><div class="form-group-admin" style="margin-bottom: 16px;"><label for="a-excerpt">مقتطف وموجز سطرين (يظهر بالبطاقة الرئيسية)</label><textarea id="a-excerpt" rows="2" placeholder="المس أهم الفوائد التي تغري القارئة بكلمات مقتضبة..." required></textarea></div><div class="form-group-admin" style="margin-bottom: 16px;"><label for="a-content">المقال الكامل (يدعم HTML للتنسيقات وعناوين h2 h3 blockquote)</label><textarea id="a-content" rows="8" placeholder="اكتبي المقال مع استعمال أوسمة HTML مثل &lt;h2&gt; &lt;h3&gt; &lt;p&gt; لتنسيق نصوص فاخرة..." required></textarea></div><div style="display: flex; gap: 10px;"><button type="submit" class="btn" style="background:var(--color-blush); color:#fff; flex:1; padding:12px; border-radius:8px; border:none; font-weight:700; cursor:pointer;" id="saveBtn"><i class="fas fa-plus"></i> نشر المقالة الآن</button><button type="button" class="btn" style="background:#fff; border:1px solid var(--border-light); color:var(--color-muted); padding:12px; border-radius:8px; display:none;" id="cancelEdit">إلغاء التعديل</button></div></form></div><!-- Left Content Card List --><div class="manager-card" style="overflow-x: auto;"><h3><i class="far fa-list-alt"></i> المقالات الحالية بالمدونة</h3><table class="admin-table"><thead><tr><th>عنوان المقال</th><th>القسم</th><th>التاريخ</th><th style="text-align: center;">إجراءات</th></tr></thead><tbody id="articlesTableBody"><tr><td colspan="4" style="text-align: center; color: var(--color-muted); padding: 20px;">جاري جرد المقالات المنشورة...</td></tr></tbody></table></div></div></section><script>
    const auth = window.auth || (typeof firebase !== 'undefined' ? firebase.auth() : null);
    const db = window.firestore || (typeof firebase !== 'undefined' ? firebase.firestore() : null);

    const articleForm = document.getElementById('articleForm');
    const articlesTableBody = document.getElementById('articlesTableBody');
    const saveBtn = document.getElementById('saveBtn');
    const editIdEl = document.getElementById('edit-id');
    const cancelEditBtn = document.getElementById('cancelEdit');

    let activeArticles = [];

    // Guard redirection checks
    if (auth) {
      auth.onAuthStateChanged(user => {
        if (!user) {
          window.location.href = '/login';
        } else {
          loadArticlesAdmin();
        }
      });
    }

    // Load articles for operational dashboard table
    async function loadArticlesAdmin() {
      if (!articlesTableBody || !db) return;
      articlesTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--color-muted);">جاري تجميع المقالات...</td></tr>';
      
      try {
        const snapshot = await db.collection('articles').orderBy('createdAt', 'desc').get();
        articlesTableBody.innerHTML = '';
        activeArticles = [];

        if(snapshot.empty) {
          articlesTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--color-muted);">لا توجد مقالات منشورة بعد بالمدونة.</td></tr>';
          return;
        }

        snapshot.forEach(doc => {
          const d = doc.data();
          activeArticles.push({id: doc.id, ...d});

          const tr = document.createElement('tr');
          tr.innerHTML = \`
            <td style="font-weight:700;color:var(--color-primary);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${d.title || ''}</td>
            <td><span style="background:var(--color-gold-cream, #fdf5e6);padding:4px 10px;border-radius:99px;font-size:0.8rem;">\${d.category || 'العناية'}</span></td>
            <td>\${d.date || ''}</td>
            <td style="text-align:center;white-space:nowrap;">
              <button class="action-badge-btn badge-btn-edit" onclick="startEdit('\${doc.id}')"><i class="fas fa-edit"></i> تعديل</button>
              <button class="action-badge-btn badge-btn-del" onclick="deleteArticle('\${doc.id}')"><i class="fas fa-trash"></i> حذف</button>
            </td>
          \`;
          articlesTableBody.appendChild(tr);
        });

      } catch(err) {
        articlesTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--color-danger);">تعذر تحميل قائمة المقالات العتيدة.</td></tr>';
      }
    }

    // Handle addition and edits submit
    if (articleForm) {
      articleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!db) return;

        const title = document.getElementById('a-title').value.trim();
        const category = document.getElementById('a-category').value;
        const date = document.getElementById('a-date').value.trim();
        const image = document.getElementById('a-image').value.trim();
        const excerpt = document.getElementById('a-excerpt').value.trim();
        const content = document.getElementById('a-content').value.trim();
        const editId = editIdEl ? editIdEl.value : '';

        const payload = {
          title,
          category,
          date,
          image,
          excerpt,
          content,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
          if(editId) {
            await db.collection('articles').doc(editId).update(payload);
            alert('تم تعديل وحفظ المقالة بنجاح مذهل وطيب!');
          } else {
            payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('articles').add(payload);
            alert('تم نشر وتعميم المقالة الجديدة في المدونة الفاخرة!');
          }

          resetForm();
          loadArticlesAdmin();
        } catch(err) {
          alert('حدث خطأ أثناء إجراءات النشر. يرجى المحاولة لاحقاً.');
        }
      });
    }

    // Start edit item trigger
    window.startEdit = function(id) {
      const item = activeArticles.find(a => a.id === id);
      if(!item) return;

      document.getElementById('a-title').value = item.title || '';
      document.getElementById('a-category').value = item.category || 'روتين الجمال';
      document.getElementById('a-date').value = item.date || '';
      document.getElementById('a-image').value = item.image || '';
      document.getElementById('a-excerpt').value = item.excerpt || '';
      document.getElementById('a-content').value = item.content || '';
      
      if (editIdEl) editIdEl.value = id;
      if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-check"></i> حفظ التعديلات الآن';
      if (cancelEditBtn) cancelEditBtn.style.display = 'inline-block';
    };

    function resetForm(){
      if (articleForm) articleForm.reset();
      if (editIdEl) editIdEl.value = '';
      if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-plus"></i> نشر المقالة الآن';
      if (cancelEditBtn) cancelEditBtn.style.display = 'none';
    }
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', resetForm);

    window.deleteArticle = async function(id) {
      if(!confirm('هل أنتِ واثقة ومؤكدة لإزالة هذا المقال نهائياً من ركن المدونة؟')) return;
      if (!db) return;
      try {
        await db.collection('articles').doc(id).delete();
        alert('تم حذف المقالة بنجاح.');
        loadArticlesAdmin();
      } catch(err) {
        alert('تعذر الحذف.');
      }
    };
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate``)}`
	})}`;
}, "/app/applet/src/pages/dashboard-blog.astro", void 0);
var $$file = "/app/applet/src/pages/dashboard-blog.astro";
var $$url = "/dashboard-blog";
//#endregion
//#region \0virtual:astro:page:src/pages/dashboard-blog@_@astro
var page = () => dashboard_blog_exports;
//#endregion
export { page };
