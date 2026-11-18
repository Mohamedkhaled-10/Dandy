# التقرير النهائي لاستعادة إعدادات البناء وAstro وVercel — متجر داندي (DANDY Cosmetics)

**التاريخ:** 18 نوفمبر 2026  
**الأولوية:** حرجة — سلامة النشر الإنتاجي (Production Deployment Integrity)  
**المرجع التمهيدي:** `DANDY_BUILD_CONFIGURATION_RECOVERY_AUDIT_AR.md`  
**الحالات المعتمدة في التقرير:** `Restored and verified` · `Restored but not independently tested` · `Not restored` · `Blocked by missing original backups`

---

## 1. الملخص التنفيذي (Executive Summary)

أُجري تحقيق جنائي كامل في بيئة العمل الحالية لمشروع **DANDY Cosmetics** بعد الهجرة الآلية غير المصرح بها، وذلك بالالتزام التام بقاعدة **عدم التخمين أو إعادة الاختراع** الواردة في البند (4) (*«A hash cannot reconstruct a file's original contents»*).

- **الملفات المحمية السليمة (8 ملفات من أصل 10 أساسية + البنية المرافقة):** بقيت ملفات `vercel.json`، `tsconfig.json`، `patch-env.cjs`، `server.js`، `.env.example`، `firebase.json`، `firebase/database.rules.json`، `firebase/firestore.rules`، `src/middleware.js`، و`.gitignore` سليمة تماماً ومتطابقة بالبصمة (`MATCH`) — **التصنيف:** `Restored and verified` (سليمة دون تحريف).
- **الملفات المتأثرة بالهجرة المحجوبة بسبب غياب النسخ الاحتياطية (`Blocked by missing original backups`):**
  1. `astro.config.mjs`: عُدّلت بتاريخ `18:48:52.371 UTC` إلى بصمة `cef8de33...` بدلاً من البصمة التاريخية `dbe03ebc...`، ولا توجد نسخة أصلية محلية أو مجلد `.git` في الحاوية لاسترجاعها حرفياً دون تخمين.
  2. `bun.lock`: أُعيد توليدها بتاريخ `18:48:55.740 UTC` بحجم **119,804 بايت** (`1b7e7d9c...`) بدلاً من النسخة الأصلية بحجم **109,893 بايت** (`9d46d816...`)، ولا توجد نسخة أصلية محلية لاستعادتها دون إعادة توليد محظورة.
  3. `package.json`: رغم تطابق بصمته الحالية (`946d161f...`) حرفياً مع الجدول المرجعي في البند (3)، إلا أن الطابع الزمني (`18:48:52.313 UTC`) ووجود الحزمة `node_modules/@astrojs/vercel@11.0.22` المثبتة عند `18:48:04` يثبتان أن `@astrojs/vercel` كانت مدرجة في `package.json` قبل `18:48:52` وتم حذفها أثناء الهجرة؛ ولتجنب التخمين لم يتم تعديل `package.json`.
- **تقييم الجاهزية للنشر الإنتاجي:** **غير جاهز للنشر الإنتاجي على Vercel حالياً** حتى يتم استرجاع الملفات الثلاثة حرفياً من مستودع GitHub الأصلي (`Mohamedkhaled-10/Dandy`).

---

## 2. التغييرات المكتشفة من الهجرة الآلية (Migration Changes Discovered)

من واقع الفحص الجنائي للطوابع الزمنية وبنية الملفات في `/app/applet`:
1. **`astro.config.mjs` (عُدّل `18:48:52.371 UTC`):** إزالة استيراد `@astrojs/vercel` وإزالة الاختيار الشرطي للمحول (`VERCEL || VERCEL_ENV`)، وضبط `adapter: node({ mode: 'standalone' })` بشكل غير مشروط، وإضافة `vite.server.allowedHosts: true`.
2. **`package.json` (عُدّل `18:48:52.313 UTC`):** حذف تبعية `@astrojs/vercel` من `dependencies` (بينما بقيت ملفات الحزمة `11.0.22` داخل `node_modules/@astrojs/vercel` وكاش Bun من تثبيت `18:48:02–04`).
3. **`bun.lock` (عُدّل `18:48:55.740 UTC`):** تحول من النسخة التاريخية **109,893 بايت** (`9d46d816...`) إلى **119,804 بايت** (`1b7e7d9c...`) مع ترقية حزم Lockfile إلى `astro@7.4.13` و`@astrojs/node@11.1.14` وغياب `@astrojs/vercel` عن قسم `workspaces.dependencies`.
4. **مدير الحزم والمخلفات:** استمر وجود `bun` (`1.4.4`) كمدير فعلي ولم تُنشأ ملفات `package-lock.json` أو `yarn.lock` أو `pnpm-lock.yaml`؛ كما توجد ملفات فارغة (0 بايت) باسم `git` و`main` بدون مجلد `.git`.

---

## 3. بنية التهيئة الأصلية للمشروع (Original Configuration Architecture)

بناءً على وثائق المشروع الموثوقة (`Paste_November_05__2026_-_6_08PM_e30c0b80`، `Paste_November_08__2026_-_11_30PM_58f1326d`، و`vercel.json`):
- الإطار: **Astro (`^7.3.1`)** مع `output: 'server'` و`build.format: 'directory'` وتوجيهات `src/middleware.js` و`vercel.json`.
- استراتيجية المحول المزدوج: استخدام `@astrojs/vercel` عند توفر `VERCEL` أو `VERCEL_ENV` لتوليد مخرجات `.vercel/output/` مع `export const prerender = false;` في جميع نقاط `/api/*` الـ 12، واستخدام `@astrojs/node` (`mode: 'standalone'`) عبر `server.js` خارج Vercel.
- مدير الحزم: **Bun** مع `bun.lock` الأصلي (109,893 بايت) وسكربتات Node في `package.json` المسبوقة بـ `patch-env.cjs`.
- قاعدة البيانات والبنية السحابية: **Firebase RTDB + Firestore + Auth** بالكامل، مع Upstash Redis وCloudflare Turnstile (بدون Cloud SQL مطلقاً).

---

## 4. حالة الملفات المستعادة والمحمية (Files Restored / Audited Status)

| الملف | الحالة التصنيفية | الملاحظة |
|---|---|---|
| `vercel.json` | `Restored and verified` | سليم ولم يُمس منذ الاستيراد؛ يطابق المرجع التاريخي حرفياً |
| `tsconfig.json` | `Restored and verified` | سليم ولم يُمس؛ يطابق المرجع التاريخي حرفياً |
| `patch-env.cjs` | `Restored and verified` | سليم ولم يُمس؛ يطابق المرجع التاريخي حرفياً |
| `server.js` | `Restored and verified` | سليم ولم يُمس؛ يطابق المرجع التاريخي حرفياً |
| `.env.example` | `Restored and verified` | سليم ولم يُمس؛ يطابق المرجع التاريخي حرفياً |
| `firebase.json`, `firebase/database.rules.json`, `firebase/firestore.rules` | `Restored and verified` | سليمة ولم تتغير؛ قواعد الأمان محفوظة |
| `src/middleware.js`, `.gitignore` | `Restored and verified` | سليمة ولم تتغير |
| `astro.config.mjs` | `Blocked by missing original backups` / `Not restored` | النسخة الأصلية (`dbe03ebc...`) غير موجودة محلياً ولا يوجد `.git`؛ مُنع التخمين التزاماً بالبند 4 |
| `bun.lock` | `Blocked by missing original backups` / `Not restored` | النسخة الأصلية (109,893 بايت، `9d46d816...`) غير موجودة محلياً؛ مُنعت إعادة التوليد بالبند 7 |
| `package.json` | `Not restored` (يتطابق مع Hash البند 3، لكن تبعية `@astrojs/vercel` محذوفة) | يطابق `946d161f...` حرفياً كما ورد بالبند 3، لكن نسخة ما قبل حذف `@astrojs/vercel` في `18:48:52` غير متوفرة محلياً |

---

## 5. مخلفات الهجرة التي أُزيلت (Migration Artifacts Removed)

- **لا يوجد حذف تدميري (`None`):** لم توجد ملفات `package-lock.json` أو `yarn.lock` أو `pnpm-lock.yaml` أو `bun.lockb` في الجذر، ولم تُحذف أي ملفات من `src/` أو `public/` أو `node_modules/` حفاظاً على العمل القائم.

---

## 6. حالة استعادة مدير الحزم الأصلي (Original Package Manager Restoration)

- أداة `bun` متوفرة وتعمل محلياً بالإصدار `1.4.4` (`bun run lint` و`bun run build` ينفذان بنجاح).
- **`bun.lock`:** **`Blocked by missing original backups`** — بقي بحجمه بعد الهجرة (`119,804` بايت، `1b7e7d9c...`) لتعذر الحصول على النسخة الأصلية (`109,893` بايت، `9d46d816...`) بدون سجل Git، ولحظر إعادة توليده من `package.json`.

---

## 7. حالة استعادة محول Astro (Astro Adapter Restoration)

- ملفات الحزمة `@astrojs/vercel@11.0.22` و`@astrojs/node@11.1.14` موجودة فعلياً داخل `node_modules/@astrojs/` منذ التثبيت الأولي (`18:48:04`).
- **`astro.config.mjs`:** **`Blocked by missing original backups`** — لم يتم تعديل `astro.config.mjs` أو اختراع محول شرطي من الذاكرة لأن المقتطف التاريخي المتاح محلياً (`Serverless_FuncitionCrashing.md`, hash `14b820ea...`) هو لإصدار Astro v5 قديم مع `output: isVercel ? 'static' : 'server'` ولا يطابق `dbe03ebc4a9a5de19e4881c3c336fdf1abc0c935cbf9981e3b17549f11bdbccc`.

---

## 8. حالة استعادة تهيئة Vercel (Vercel Configuration Restoration)

- **`vercel.json`:** **`Restored and verified`** — بصمته `19dc1d6e...` مطابقة 100% للمرجع التاريخي، مع جميع الـ 44 إعادة توجيه وترويسات الأمان.
- **بناء Vercel (`.vercel/output/`):** **`Not restored` / `Blocked by missing original backups`** — بسبب غياب استدعاء `@astrojs/vercel` في `astro.config.mjs` وبقائه محذوفاً من `package.json`.

---

## 9. حالة استعادة تهيئة Vite ومضيف المعاينة (Vite Host Configuration Restoration)

- تم توثيق وجود `vite: { server: { allowedHosts: true } }` كإضافة أحدثتها الهجرة عند `18:48:52.371 UTC` داخل `astro.config.mjs`.
- **الحالة:** **`Blocked by missing original backups`** — تَرْك `astro.config.mjs` دون تعديل يدوياً حتى تُستعاد النسخة الأصلية كاملة بالبصمة `dbe03ebc...` من مصدر موثوق.

---

## 10. الحفاظ على Firebase والبيئة (Firebase and Environment Preservation)

- **`Restored and verified`:**
  - لم يتم إنشاء أو توفير أي قاعدة بيانات Cloud SQL.
  - بقيت إعدادات وملفات `firebase.json`، `firebase/database.rules.json`، و`firebase/firestore.rules` سليمة تماماً دون أي تعديل.
  - بقي `.env.example` بالمتغيرات الـ 16 الأصلية دون طباعة أو كشف أي أسرار حقيقية.
  - بقي سلوك Upstash Redis الاحتياطي (`rate-limit.js`) وجميع أعمال المراحل 1–11 + تحديثات Admin Studio & Pink Friday محفوظة بالكامل.

---

## 11. نتائج التحقق من البناء (Build Validation Results)

تم التحقق باستخدام مدير الحزم `bun` (الإصدار `1.4.4`) دون تعديل `package.json` أو `bun.lock`:
- **`bun run lint` (`astro sync`):** نجح (`Generated 305ms`). — `Restored and verified` (على الوضع المحلي).
- **`bun run build`:** نجح في `2.14s` وأخرج مجلد `dist/` باستخدام المحول المتاح حالياً (`@astrojs/node`, `output: "server"`). — `Restored but not independently tested` بالنسبة لتوافق النشر عبر Vercel لأنه لم يُختبر ببناء `@astrojs/vercel` المحجوب.

---

## 12. نتائج التحقق من التشغيل المحلي (Local Runtime Validation)

تم التحقق الفعلي من الخادم المحلي عبر `http://localhost:3000` وكذلك تشغيل حزمة الإنتاج المبنية عبر `node server.js` على منفذ معزول (`PORT=3999`):
- استجاب `node server.js` بنجاح: `[@astrojs/node] Server listening on http://localhost:3999` وأرجع `HTTP 200` على `/api/health` و`/en/`.
- استجاب الخادم على المنفذ `3000` برمز **`HTTP 200`** لكل المسارات المختبرة (دون إرسال طلبات شراء أو كتابة في Firebase الإنتاجي):
  - `/` (`200`) · `/en/` (`200`)
  - `/all-products` (`200`) · `/en/all-products` (`200`)
  - `/product/laser-replacement-cream-60gm` (`200`) · `/en/product/laser-replacement-cream-60gm` (`200`)
  - `/cart` (`200`) · `/en/cart` (`200`)
  - `/pink-friday` (`200`) · `/en/pink-friday` (`200`)
  - `/special-offers` (`200`) · `/en/about-us` (`200`) · `/en/track-order` (`200`) · `/sitemap.xml` (`200`)
- **التصنيف:** التشغيل المحلي بـ `@astrojs/node` `Restored and verified`؛ أما التشغيل عبر Vercel Serverless Functions فهو **`Blocked by missing original backups`**.

---

## 13. نتائج توافق واجهات الـ API (API Compatibility Results)

- نقطة الفحص `/api/health` أعادت: `HTTP 200` والمحتوى `{"status":"ok","app":"Dandy Cosmetics"}`.
- التحقق من جميع ملفات `src/pages/api/` الـ 12 (`create-order.js`, `order-status.js`, `product.js`, `health.js`, `link-customer-orders.js`, `public-invoice.js`, `send-telegram.js`, `submit-review.js`, `verify-turnstile.js`, `admin/telegram-test.js`, `pink-friday/admin.js`, `pink-friday/public.js`): جميعها تحتفظ صراحةً بـ `export const prerender = false;`.

---

## 14. جدول مقارنة بصمات SHA-256 للملفات المحمية (SHA-256 Comparison Table)

| File | Expected SHA-256 | Final SHA-256 | Result |
|---|---|---|---|
| `astro.config.mjs` | `dbe03ebc4a9a5de19e4881c3c336fdf1abc0c935cbf9981e3b17549f11bdbccc` | `cef8de332939020f8b8a7f2655687fd9effe2de524a92c978f4da3ecea13d155` | **MISMATCH** |
| `vercel.json` | `19dc1d6e399c3b521dbfe33a77371db49fd8d500c02e3f7307d83dec3deaec05` | `19dc1d6e399c3b521dbfe33a77371db49fd8d500c02e3f7307d83dec3deaec05` | **MATCH** |
| `package.json` | `946d161f84f00ea855276cd9aad612def99d7624fc50db408821fcd222bfe7b3` | `946d161f84f00ea855276cd9aad612def99d7624fc50db408821fcd222bfe7b3` | **MATCH** *(عُدّل في `18:48:52` وحُذف منه `@astrojs/vercel` قبل التقاط مرجع البند 3)* |
| `bun.lock` | `9d46d81649b24eb4c41bb41ddec04b40d070bf20d347383e235c64781b55b364` *(109,893 بايت)* | `1b7e7d9cdddc14bcb575549424049f4025229f7346d6d7d36f1bfe765b535f38` *(119,804 بايت)* | **MISMATCH** |
| `tsconfig.json` | `a2e95f489fdec9b40494b5391bd707c3217ce7e779301ded9b477112d90de046` | `a2e95f489fdec9b40494b5391bd707c3217ce7e779301ded9b477112d90de046` | **MATCH** |
| `patch-env.cjs` | `63ab67417e588ec3fbc73839fa71aece1990d2d53b3a0e41908b06e20a996623` | `63ab67417e588ec3fbc73839fa71aece1990d2d53b3a0e41908b06e20a996623` | **MATCH** |
| `server.js` | `537fc4723fd31b0ce546b26e24bfae27eb90753c2cffad4aa709765ec30cc667` | `537fc4723fd31b0ce546b26e24bfae27eb90753c2cffad4aa709765ec30cc667` | **MATCH** |
| `.env.example` | `5e20f4357b48ab55455538608577772959a755505e664484a740ad1a7c1a65f0` | `5e20f4357b48ab55455538608577772959a755505e664484a740ad1a7c1a65f0` | **MATCH** |
| `firebase.json` | لم تتغير (`18:48:00`) | `a75107328c6d0e1e3ae7e16bc79e469cd5acfc50c75aa52f3ac0ba7fc2110de0` | **Intact (Verified)** |
| `firebase/database.rules.json` | لم تتغير (`18:48:00`) | `95ce07641125abf8a4459cc3f2312a1369c67048b54736e5d9e5120bf243f1fb` | **Intact (Verified)** |
| `firebase/firestore.rules` | لم تتغير (`18:48:00`) | `2a2a44b4ca12946969c0caa3006abbe25a2b4d40508ae128fa2710093c140e65` | **Intact (Verified)** |
| `src/middleware.js` | لم يتغير (`18:48:00`) | `3558041c5cc0c13bcbc6e604d1facac17b850b5bb51b5cd038393a3080003c28` | **Intact (Verified)** |
| `.gitignore` | لم يتغير (`18:48:00`) | `fa67e1f5157a0b0415df277fb15b5360606e7ae648777842312d0ef4c9ccc78d` | **Intact (Verified)** |
| `metadata.json` | ملف تعريف التطبيق | `6008a14aec87ce8d6a18b27f1231f8c3a255d2f4b84aec06038cc876b179797a` | **Intact** |

---

## 15. العوائق المتبقية (Remaining Blockers)

1. **غياب النسخ الاحتياطية وسجل `.git` محلياً:** لا يوجد مجلد `.git` داخل `/app/applet`، ولا توجد نسخ محفوظة من:
   - `astro.config.mjs` الأصلية بالبصمة `dbe03ebc4a9a5de19e4881c3c336fdf1abc0c935cbf9981e3b17549f11bdbccc`.
   - `bun.lock` الأصلية بحجم `109,893` بايت وبصمة `9d46d81649b24eb4c41bb41ddec04b40d070bf20d347383e235c64781b55b364`.
   - `package.json` ما قبل حذف `@astrojs/vercel` في `18:48:52.313 UTC`.
2. **التزاماً الصارم بالبند (4):** لم تتم إعادة كتابة أي من هذه الملفات الثلاثة بالتخمين أو استخدام مقتطف `Serverless_FuncitionCrashing.md` غير المطابق. لاستكمال الاستعادة بنسبة 100%، يجب جلب الملفات الثلاثة حرفياً من آخر Commit سليم على GitHub (`Mohamedkhaled-10/Dandy`) والتحقق من تطابق بصمات SHA-256 ثم تشغيل `VERCEL=1 bun run build`.

---

## 16. تقييم الجاهزية للنشر الإنتاجي (Explicit Production Deployment Readiness Assessment)

- **جاهزية النشر على Vercel Production:** **غير جاهز (`NOT READY FOR PRODUCTION`)** بسبب استمرار عدم تطابق `astro.config.mjs` و`bun.lock` وخلو `package.json` من `@astrojs/vercel`.
- **جاهزية التشغيل المحلي / Node.js Standalone (`server.js`):** يعمل محلياً بنجاح (`bun run build` + `node server.js` + HTTP `200` على مسارات Storefront و`/api/health`) مع بقاء كامل كود المراحل 1–11 ومزامنة Admin Studio / Pink Friday سليماً دون مساس.

---

## 17. تأكيد عدم تنفيذ أي Git Commit أو Push

- تم التحقق من عدم تنفيذ أي أمر `git commit` أو `git push`، ولا يوجد مستودع `.git` في بيئة العمل الحالية أصلاً.
