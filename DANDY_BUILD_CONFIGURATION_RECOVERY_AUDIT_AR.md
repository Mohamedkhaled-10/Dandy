# تقرير التدقيق الجنائي قبل استعادة إعدادات البناء وAstro وVercel — متجر داندي (DANDY Cosmetics)

**التاريخ:** 18 نوفمبر 2026  
**الأولوية:** حرجة — سلامة النشر الإنتاجي (Production Deployment Integrity)  
**الغرض:** فحص الشجرة البرمجية الحالية وتوثيق آثار الهجرة الآلية غير المصرح بها والتحقق من توفر نسخ أصلية موثوقة قبل لمس أي ملف محمي، التزاماً التاماً بالبند (4): *«التجزئة (Hash) لا تعيد بناء المحتوى الأصلي، وإذا تعذر استرجاع الملف الأصلي من مصدر موثوق دقيق فيجب إيقاف الاستعادة والإبلاغ عن العائق دون تخمين»*.

---

## 1. فحص مستودع Git وحالة شجرة العمل (Git & Working Tree Inspection)

- **حالة Git:** تنفيذ `git status` أعاد: `fatal: not a git repository (or any of the parent directories): .git`.
- **الملاحظة الجنائية:** توجد ملفات فارغة بحجم 0 بايت في الجذر باسم `git` و`main` (تعود لتاريخ `2026-11-18 18:48:00 UTC`)، ولا يوجد أي مجلد `.git` أو سجل التزامات (Commit History) أو فروع محلية داخل الحاوية.
- **حالة التطبيق والتعديلات البرمجية:** جميع أعمال المراحل 1–11 ومزامنة Admin Studio / Pink Friday (الموثقة في `DANDY_ADMIN_STUDIO_SYNC_FINAL_REPORT_AR.md`) سليمة وموجودة داخل `src/` و`public/` و`test/`.

---

## 2. التسلسل الزمني الجنائي للهجرة وتعديلات الملفات (Migration Forensics)

أظهر فحص الطوابع الزمنية (`stat -c "%y %s %n"`) داخل `/app/applet` ونظام الحزم الحقائق التالية بدقة الميكروثانية:

1. **`18:48:00.48 – 18:48:00.66 UTC` (استيراد المستودع الأصلي):** فُكّت ملفات المشروع الأساسية (`vercel.json`, `tsconfig.json`, `patch-env.cjs`, `server.js`, `.env.example`, `firebase.json`, `src/middleware.js`, `src/`, `public/`).
2. **`18:48:01 – 18:48:04 UTC` (تثبيت Bun الأصلي):** استُخدمت ملفات الحزم الأصلية لتثبيت الاعتماديات عبر `bun`، وبقي أثر ذلك واضحاً في:
   - وجود الحزمة الفعلية `node_modules/@astrojs/vercel` بالإصدار **`11.0.22`** بتاريخ `18:48:04.035 UTC`.
   - وجود الكاش في `/root/.bun/install/cache/@astrojs/vercel@11.0.22@@@1` بتاريخ `18:48:02.327 UTC` جنباً إلى جنب مع `node_modules/@astrojs/node@11.1.14`.
3. **`18:48:52.313 UTC` (تعديل `package.json`):** تم تعديل `package.json` (حذف `@astrojs/vercel` من `dependencies`، ليصبح بالبصمة `946d161f84f00ea855276cd9aad612def99d7624fc50db408821fcd222bfe7b3`).
4. **`18:48:52.371 UTC` (تعديل `astro.config.mjs`):** أُعيدت كتابة `astro.config.mjs` لتفرض `adapter: node({ mode: 'standalone' })` دون شرط Vercel وإضافة `vite.server.allowedHosts: true` (بالبصمة `cef8de332939020f8b8a7f2655687fd9effe2de524a92c978f4da3ecea13d155`).
5. **`18:48:55.740 UTC` (تعديل `bun.lock`):** أُعيد توليد/تحديث `bun.lock` ليصبح **119,804 بايت** (بصمة `1b7e7d9cdddc14bcb575549424049f4025229f7346d6d7d36f1bfe765b535f38`) متضمناً ترقية `astro@7.4.13` وغياب `@astrojs/vercel` من جدول `workspaces.dependencies`، بدلاً من النسخة التاريخية المسجلة (**109,893 بايت**، بصمة `9d46d81649b24eb4c41bb41ddec04b40d070bf20d347383e235c64781b55b364`).
6. **آثار مدراء الحزم البديلين (Generated Artifacts):** لا توجد ملفات `package-lock.json` أو `yarn.lock` أو `pnpm-lock.yaml` أو `bun.lockb` في الجذر؛ أي أن التغييرات انحصرت في `astro.config.mjs` و`package.json` و`bun.lock`.

---

## 3. نتائج البحث عن النسخ الأصلية الموثوقة (Trusted Backup Search)

تم مسح `/app` و`/app/applet` و`/root` و`.aistudio/` و`public/assets/aistudio/` وجميع ملفات `.md`:
- لا توجد نسخة احتياطية لـ `astro.config.mjs` الأصلية ذات البصمة `dbe03ebc4a9a5de19e4881c3c336fdf1abc0c935cbf9981e3b17549f11bdbccc`.
  - *ملاحظة فحص `Serverless_FuncitionCrashing.md`:* الكود المقتبس في ذلك التقرير (تاريخ 7 سبتمبر 2026 على Astro v5) بصمته `14b820ea2eae0f32a9ce9fa30ec2db8b2ef9166343ef81c5a9d950fff86ca75` ويضبط `output: isVercel ? 'static' : 'server'`، وهو يتعارض مع تقرير `Paste_November_05__2026_-_6_08PM_e30c0b80` (الذي شدّد على بقاء `output: 'server'` واختيار المحول شرطياً فقط)، ولذلك لا يطابق `dbe03ebc...` وليس نسخة صالحة للاستعادة.
- لا توجد نسخة احتياطية لـ `bun.lock` الأصلية بحجم **109,893 بايت** وبصمة `9d46d81649b24eb4c41bb41ddec04b40d070bf20d347383e235c64781b55b364`.
- لا توجد نسخة احتياطية لـ `package.json` ما قبل حذف `@astrojs/vercel` (مع ملاحظة أن جدول المرجع التاريخي في البند 3 من هذا الطلب سجّل بصمة `package.json` بقيمة `946d161f84f00ea855276cd9aad612def99d7624fc50db408821fcd222bfe7b3` المطابقة للنسخة الحالية منزوعة `@astrojs/vercel` والمُعدّلة في `18:48:52.313 UTC`).

---

## 4. سجل التدقيق التفصيلي لكل ملف محمي (Protected Files Audit Matrix)

| الملف المحمي | الحالة الأصلية المتوقعة (المرجع التاريخي SHA-256) | الحالة الحالية والـ SHA-256 الفعلي | التعديل المكتشف | المصدر الأصلي الموثوق المتوفر | إجراء الاستعادة المطلوب | النتيجة النهائية للفحص |
|---|---|---|---|---|---|---|
| `astro.config.mjs` | محول مزدوج شرطي (`VERCEL \|\| VERCEL_ENV` → `@astrojs/vercel`، وإلا `@astrojs/node` standalone) بدون `allowedHosts: true`<br>Hash: `dbe03ebc4a9a5de19e4881c3c336fdf1abc0c935cbf9981e3b17549f11bdbccc` | يستخدم `@astrojs/node` standalone فقط مع `vite.server.allowedHosts: true` (عُدّل `18:48:52.371`)<br>Hash: `cef8de332939020f8b8a7f2655687fd9effe2de524a92c978f4da3ecea13d155` | إزالة `@astrojs/vercel` ومنطق `isVercel`، وإضافة `allowedHosts: true` | **غير متوفر محلياً** (لا `.git` ولا نسخة احتياطية؛ مقتطف `Serverless_FuncitionCrashing.md` يختلف تماماً) | **إيقاف الاستعادة**؛ يتطلب النسخة الحرفية من مستودع GitHub الأصلي `Mohamedkhaled-10/Dandy` | **MISMATCH — Blocked by missing original backups** |
| `bun.lock` | قفل Bun الأصلي المحتوي على `@astrojs/vercel` وإصدارات Baseline (109,893 بايت)<br>Hash: `9d46d81649b24eb4c41bb41ddec04b40d070bf20d347383e235c64781b55b364` | قفل Bun مُعاد توليده (119,804 بايت، عُدّل `18:48:55.740`) بدون `@astrojs/vercel` في `workspaces.dependencies`<br>Hash: `1b7e7d9cdddc14bcb575549424049f4025229f7346d6d7d36f1bfe765b535f38` | إزالة `@astrojs/vercel` وإعادة حسم الحزم (`astro@7.4.13` إلخ) | **غير متوفر محلياً** (وإعادة توليده محظورة صراحةً بموجب البندين 4 و7) | **إيقاف الاستعادة**؛ يتطلب استرجاع ملف `bun.lock` الأصلي (109,893 بايت) من المستودع الأصلي | **MISMATCH — Blocked by missing original backups** |
| `package.json` | المرجع بالبند 3 يسجّل `946d161f84f00ea855276cd9aad612def99d7624fc50db408821fcd222bfe7b3`؛ بينما القرائن (`node_modules/@astrojs/vercel@11.0.22`) تؤكد وجود `@astrojs/vercel` قبل `18:48:52` | يطابق Hash البند 3 حرفياً (`946d161f...`)، ويحتوي `astro: ^7.3.1` و`@astrojs/node: ^11.1.5` بدون `@astrojs/vercel` (عُدّل `18:48:52.313`) | أُزيلت تبعية `@astrojs/vercel` في `18:48:52.313` رغم أن البند 3 التقط Hash النسخة بعد التعديل | نسخة ما قبل `18:48:52` غير متوفرة محلياً؛ والنسخة الحالية تطابق Hash البند 3 حرفياً | الإبقاء دون تخمين صيغة `@astrojs/vercel`، وتوثيق تناقض البند 3 مقابل `node_modules/@astrojs/vercel` | **MATCHES Sec. 3 Hash / Missing `@astrojs/vercel` entry (Blocked from altering without exact original `package.json`)** |
| `vercel.json` | Hash: `19dc1d6e399c3b521dbfe33a77371db49fd8d500c02e3f7307d83dec3deaec05` | Hash: `19dc1d6e399c3b521dbfe33a77371db49fd8d500c02e3f7307d83dec3deaec05` (4,274 بايت، `18:48:00.523`) | لا يوجد أي تعديل | الملف الحالي سليم تماماً | لا يلزم تعديل | **MATCH — Intact / Verified** |
| `tsconfig.json` | Hash: `a2e95f489fdec9b40494b5391bd707c3217ce7e779301ded9b477112d90de046` | Hash: `a2e95f489fdec9b40494b5391bd707c3217ce7e779301ded9b477112d90de046` (40 بايت، `18:48:00.561`) | لا يوجد أي تعديل | الملف الحالي سليم تماماً | لا يلزم تعديل | **MATCH — Intact / Verified** |
| `patch-env.cjs` | Hash: `63ab67417e588ec3fbc73839fa71aece1990d2d53b3a0e41908b06e20a996623` | Hash: `63ab67417e588ec3fbc73839fa71aece1990d2d53b3a0e41908b06e20a996623` (107 بايت، `18:48:00.507`) | لا يوجد أي تعديل | الملف الحالي سليم تماماً | لا يلزم تعديل | **MATCH — Intact / Verified** |
| `server.js` | Hash: `537fc4723fd31b0ce546b26e24bfae27eb90753c2cffad4aa709765ec30cc667` | Hash: `537fc4723fd31b0ce546b26e24bfae27eb90753c2cffad4aa709765ec30cc667` (191 بايت، `18:48:00.640`) | لا يوجد أي تعديل | الملف الحالي سليم تماماً | لا يلزم تعديل | **MATCH — Intact / Verified** |
| `.env.example` | Hash: `5e20f4357b48ab55455538608577772959a755505e664484a740ad1a7c1a65f0` | Hash: `5e20f4357b48ab55455538608577772959a755505e664484a740ad1a7c1a65f0` (343 بايت، `18:48:00.603`) | لا يوجد أي تعديل | الملف الحالي سليم تماماً | لا يلزم تعديل | **MATCH — Intact / Verified** |
| `firebase.json` | إعداد قواعد RTDB وFirestore (لم يتغير) | Hash: `a75107328c6d0e1e3ae7e16bc79e469cd5acfc50c75aa52f3ac0ba7fc2110de0` (`18:48:00.515`) | لا يوجد أي تعديل | الملف الحالي سليم تماماً | لا يلزم تعديل | **Intact / Verified** |
| `firebase/database.rules.json` | قواعد أمان RTDB الأصلية | Hash: `95ce07641125abf8a4459cc3f2312a1369c67048b54736e5d9e5120bf243f1fb` (`18:48:00`) | لا يوجد أي تعديل | الملف الحالي سليم تماماً | لا يلزم تعديل | **Intact / Verified** |
| `firebase/firestore.rules` | قواعد أمان Firestore الأصلية | Hash: `2a2a44b4ca12946969c0caa3006abbe25a2b4d40508ae128fa2710093c140e65` (`18:48:00`) | لا يوجد أي تعديل | الملف الحالي سليم تماماً | لا يلزم تعديل | **Intact / Verified** |
| `src/middleware.js` | وسيط التوجيهات القديمة (301 Redirects) | Hash: `3558041c5cc0c13bcbc6e604d1facac17b850b5bb51b5cd038393a3080003c28` (`18:48:00.555`) | لا يوجد أي تعديل | الملف الحالي سليم تماماً | لا يلزم تعديل | **Intact / Verified** |
| `.gitignore` | تجاهل `node_modules/`, `dist/`, `.astro/`, `.vercel/`, `.env`, `.DS_Store` | Hash: `fa67e1f5157a0b0415df277fb15b5360606e7ae648777842312d0ef4c9ccc78d` (`18:48:00`) | لا يوجد أي تعديل | الملف الحالي سليم تماماً | لا يلزم تعديل | **Intact / Verified** |
| ملفات غير موجودة أصلاً | `astro.config.js`, `.vercelignore`, `package-lock.json`, `bun.lockb`, `pnpm-lock.yaml`, `yarn.lock`, `npm-shrinkwrap.json`, `jsconfig.json`, `vite.config.*`, `.env`, `.env.*` (غير `.env.example`), `.npmrc`, `.nvmrc`, `.node-version` | غير موجودة في جذر المشروع | لم تُنشأ أي مخلفات مدراء حزم بديلة | غير منطبق | عدم إنشائها | **Absent (Clean)** |

---

## 5. قرار التدقيق قبل أي تعديل (Audit Gate Decision)

استناداً إلى البند (4) (*«RECOVERY PROCEDURE — NO GUESSWORK»*) والتعليمات النهائية الملزمة:
1. يحظر تماماً تخمين محتوى `astro.config.mjs` الأصلية (`dbe03ebc...`) أو تجميع نسخة تقديرية من الذاكرة.
2. يحظر تماماً إعادة توليد `bun.lock` (`9d46d816...` / 109,893 بايت) أو تشغيل أوامر تثبيت تغير إصدارات الحزم.
3. يحظر تماماً تعديل `package.json` لتخمين تبعية `@astrojs/vercel` (حيث توجد الحزمة في `node_modules` لكن صيغة القيد الدقيقة في `package.json` ما قبل `18:48:52` غير محفوظة في المستودع المحلي، وبند 3 أصلاً يسجل hash النسخة الحالية منزوعة التبعية).
4. **بناءً على ذلك:** يتم إيقاف تعديل الملفات المفقودة نسخها الاحتياطية، والتحقق من سلامة التشغيل المحلي المتاح وتوافق الـ API وحفظ Firebase والملفات السليمة، وتوثيق العائق بدقة كاملة في التقرير النهائي `DANDY_BUILD_CONFIGURATION_RECOVERY_FINAL_REPORT_AR.md`.
