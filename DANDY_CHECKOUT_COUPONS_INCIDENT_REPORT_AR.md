# تقرير التحقيق والمعالجة الهندسية — حادثتي إتمام الطلب (409 Checkout) وإدارة الكوبونات (Coupons)
**المتجر:** Dandy Cosmetics (`Mohamedkhaled-10/Dandy` — الفرع `main`)  
**نطاق الإنتاج المفحوص (قراءة فقط):** `https://dandy-ebon.vercel.app`  
**تاريخ التقرير:** 2026-11-16  

---

## 1. الملخص التنفيذي (Executive Summary)

تلقى المالك تقارير فشل متكررة أثناء التجربة الفعلية على الإنتاج تشمل مسارين حرجين:
1. تعذّر إتمام الطلب في خطوة الدفع (`POST /api/create-order` يردّ `409 Conflict` بالرسالة `"جاري معالجة هذا الطلب حالياً، يرجى الانتظار قليلاً."` مع عودة العميل لنفس الرسالة عند إعادة الضغط).
2. شكاوى سابقة من فشل لوحة إدارة الكوبونات (`POST /api/coupons/admin` -> `404` سابقاً، أو فشل الإضافة/التعديل/عرض الأخطاء).
3. تحذيرات وحدة تحكم المتصفح (Console) المرتبطة بأداة الحماية `Cloudflare Turnstile`.

**النتائج الجوهرية للتحقيق والإصلاح المحلي:**
- **الأولوية 1 (فشل إتمام الطلب `409 ORDER_IN_PROGRESS`):** تم تحديد 5 أسباب جذرية مترابطة: (أ) اختناق زمني في Serverless Function بـ Vercel (حد 10 ثوانٍ) بسبب قراءة المنتجات والخصم المتسلسل للمخزون وانتظار مهلة إرسال البريد حتى 12 ثانية قبل إرجاع HTTP 200، مما يترك قفل `PENDING` نشطاً لـ 30 ثانية أو يُتمّ الطلب بعد انقطاع اتصال العميل، (ب) غياب قفل منع النقر المزدوج `isSubmittingOrder` في العميل وتحديث توكن Firebase المنتهي بعد ساعة قبل احتساب بصمة الطلب، (ج) غياب فحص/استرجاع الحالة عبر السيرفر عند تلقي `409 ORDER_IN_PROGRESS` أو انقطاع الشبكة، (د) إمكانية توليد طلب مكرر إذا ضغط العميل على `#btnResetOrderAttempt` أثناء تنفيذ طلب حيّ أو مكتمل بالفعل على السيرفر، (هـ) فوارق دقيقة بين بصمة العميل والسيرفر (`selectedVariants` ordering، أرقام `۰-۹` الفارسية، والتحقق من الأحرف غير الرقمية في الهاتف) واحتمال تعليق سجل `COMMITTING` التالف بدون `commitPayload`. تم إصلاح كافة هذه المسارات محلياً وإنشاء نقطة تحقق آمنة `POST /api/order-attempt-status` لا تنشئ أي طلبات مكررة.
- **الأولوية 2 (إدارة الكوبونات والتحليلات):** بالفحص المباشر على الإنتاج تبين أن مسار `/api/coupons/admin` منشور بالفعل حالياً في الإيداع الأخير (`c2de80fa`) ويرد بـ `401 UNAUTHORIZED` للطلبات غير المصادق عليها (وليس `404` كما كان قبل نشر ذلك الإيداع). مع ذلك، كانت صفحات الإدارة (`dashboard-coupons.astro` و`dashboard-coupon-analytics.astro`) تفتقر إلى إعادة تجديد توكن Firebase المنتهي (`401` -> `getIdToken(true)`) وإلى قراءة الردود غير JSON بأمان (مثل صفحات HTML لأخطاء `404/502/504`) وإلى التمييز بين `401` و`403` دون ضياع بيانات النموذج. تم إصلاح كلا الملفين محلياً.
- **الأولوية 3 (تحذيرات Turnstile):** ثبت بالفحص المباشر عبر المتصفح أن جميع تحذيرات `CSP connect-src data:`, `WOFF2 OTS`, `WebGPU No available adapters`, و`401 pat/` مصدرها حصراً النطاق الخارجي المعزول داخل iframe الخاص بشركة Cloudflare (`https://challenges.cloudflare.com/cdn-cgi/challenge-platform/...`) وليست أخطاء من كود الموقع؛ ومع ذلك تمت إضافة دورة حياة واضحة (`data-callback`, `data-expired-callback`, `data-error-callback`) ورسائل عربية فورية في صفحات `/cart` و`/account-login` و`/account-signup`.

**تنبيه حرج حول النشر:** لم يتم رفع أي تغييرات إلى GitHub (`git push`)، ولم يتم النشر إلى Vercel، ولم يتم أي تعديل أو كتابة على قاعدة بيانات الإنتاج Firebase RTDB.

---

## 2. مقارنة بيئة العمل المحلية مع الفرع البعيد (Uncommitted vs Remote Baseline Check)

- **حالة Git المحلية:** لا يحتوي مجلد بيئة العمل على مجلد `.git/`، لذا تم الاعتماد على مقارنة البصمات التشفيرية (`sha256sum`) وسجل الفحص البعيد لفرع `main`.
- **حالة البداية قبل تعديلات هذا التحقيق:** كانت ملفات بيئة العمل متطابقة مع خط الأساس البعيد المنشور عند آخر إيداع inspected (`c2de80fa` الذي تلا `4088dde7` وتضمّن مسار `/api/coupons/admin`).
- **سلامة الملفات المحمية:** قبل بدء أي تعديل وبعد إتمام كافة التعديلات، بقيت جميع ملفات التكوين والبنية المحمية مطابقة بايت-ببايت دون أي تغيير:
  - `astro.config.mjs`: `01a888322ddbc31865ac1d33a1704fd8113a26b93d562fafe66660faa0e39439`
  - `package.json`: `a3981776ca5875c6ffa6f6620ff2a75deeaac5a3accad2afe82e4173231f0fe6`
  - `vercel.json`: `19dc1d6e399c3b521dbfe33a77371db49fd8d500c02e3f7307d83dec3deaec05`
  - `tsconfig.json`: `a2e95f489fdec9b40494b5391bd707c3217ce7e779301ded9b477112d90de046`
  - `patch-env.cjs`: `63ab67417e588ec3fbc73839fa71aece1990d2d53b3a0e41908b06e20a996623`
  - `server.js`: `537fc4723fd31b0ce546b26e24bfae27eb90753c2cffad4aa709765ec30cc667`
  - `firebase.json`: `ecdb2b722f5a12a5a3683ec521c9ae32908c2a540fdf21a8d4b8ecfd595dba0d`
- **حالة التغييرات الجديدة:** جميع الإصلاحات الموثقة في هذا التقرير **محلية في مساحة العمل فقط ولم تُدفع إلى `origin/main` ولم تُنشر إلى الإنتاج بعد**.

---

## 3. التحقيق في فشل إتمام الطلب (`POST /api/create-order 409 ORDER_IN_PROGRESS`)

### تفاصيل الاستجابة المرصودة من كود السيرفر
عند وجود قفل `PENDING` أو `COMMITTING` نشط بنفس `clientRequestId` وبنفس البصمة (`requestFingerprint`)، يُرجع `src/pages/api/create-order.js`:
- **HTTP Status:** `409 Conflict`
- **Body (`error`):** `"ORDER_IN_PROGRESS"`
- **Body (`message`):** `"جاري معالجة هذا الطلب حالياً، يرجى الانتظار قليلاً."`
- **Response Header:** `Retry-After: "<1..30>"` (المدة المتبقية لانتهاء مهلة القفل بالثواني، افتراضياً `30` ثانية عبر `DEFAULT_IDEMPOTENCY_LEASE_MS` / `DEFAULT_COMMIT_LEASE_MS`).
- **مسار التنفيذ في الكود:** `cart.astro` (`window.submitFinalOrder`) -> `POST /api/create-order` -> `acquireOrderIdempotencyLock()` في `src/utils/order-idempotency.ts` -> `classifyExistingRecord()` -> رجوع `{ outcome: 'IN_PROGRESS', retryAfterSeconds }`.

### الأسباب الجذرية التي أدت لظهور الخطأ وتعلّق العملاء
1. **اختناق زمن التنفيذ السيرفري وتجاوز مهلة Vercel (10s Timeout):**
   - في `src/pages/api/create-order.js` سابقاً، كانت قراءة المنتجات/المجموعات وإعدادات الكوبون والحملة تتم في حلقات متسلسلة (`for ... await ... .once('value')`)، ثم خصم المخزون في حلقة متسلسلة، ثم انتظار `sendOrderNotification` عبر Google Apps Script Relay بمهلة افتراضية `12000ms` قبل إرجاع رد HTTP 200 للعميل.
   - عند بطء RTDB أو Google Apps Script، يتأخر الطلب الأول أو ينقطع اتصال العميل/مهلة Serverless (504 / timeout)، فيظل سجل `privateOrderIdempotency/{hash}` في حالة `PENDING` أو `COMMITTING` لمدة 30 ثانية (أو ينتقل إلى `COMPLETED` دون أن يتسلم المتصفح رمز الفاتورة). وعند ضغط العميل مرة ثانية بالمعرف نفسه (`clientRequestId`) المخزن في `sessionStorage`، يستقبل فوراً `409 ORDER_IN_PROGRESS`.
2. **غياب قفل منع التقديم المتزامن من المتصفح (`isSubmittingOrder`):**
   - إمكانية إرسال طلب ثانٍ أثناء وجود الطلب الأول في الشبكة بسبب النقر المزدوج أو إعادة الضبط السريع، مما يصطدم فوراً بقفل `PENDING` للطلب الأول ويرد `409`.
3. **غياب الاسترجاع والتوفيق من جهة المتصفح (`/api/order-attempt-status`):**
   - عند تلقي `409 ORDER_IN_PROGRESS` أو `502/504`/انقطاع الشبكة، لم يكن المتصفح يستعلم من السيرفر عمّا إذا كان الطلب قد اكتمل فعلياً أو علق في `COMMITTING` قابل للاسترجاع، بل كان يترك العميل معلقاً عند رسالة الانتظار.
4. **خطر التكرار في زر `#btnResetOrderAttempt`:**
   - كان الضغط على `#btnResetOrderAttempt` يمسح `clientRequestId` محلياً من `sessionStorage` مباشرةً دون سؤال السيرفر! فإذا كان الطلب الأول قد نُفّذ بالفعل على السيرفر لكن الاتصال انقطع قبل وصول الرد، سيحصل العميل على معرف UUID جديد وينشئ **طلباً مكرراً**.

### الإصلاحات المنفذة محلياً
- **تسريع `src/pages/api/create-order.js` وتحديد مهلة البريد:**
  - جلب بيانات الحملة وإعدادات الكوبون والمنتجات والمكونات بالتوازي (`Promise.all`) مع الحفاظ الدقيق على ترتيب رسائل التحقق (Validation Order).
  - تنفيذ خصم المخزون عبر `Promise.allSettled` بالتوازي.
  - إضافة معامل `timeoutMs` اختياري في `sendOrderNotification` (`src/utils/email-service.ts`) وتحديد سقف انتظار البريد في مسار Checkout بـ `4500ms` (مع بقاء القيمة الافتراضية `12000ms` لأدوات التشخيص الإدارية، وبقاء `notifications_outbox` ضامناً لإعادة المحاولة إذا تأخر الرد عن 4.5 ثانية).
- **إنشاء نقطة الفحص والاسترجاع الآمن `POST /api/order-attempt-status`:**
  - محمية بحد معدل الطلبات (`30 req / 60s` لكل IP موثوق عبر `checkServerRateLimit` بصيغة fail-closed)، وتتحقق من صحة UUID v4، وبصمة الطلب `computeOrderRequestFingerprint`، وهوية Firebase الاختيارية، ولا تنشئ مطلقاً قفل `PENDING` جديد أو طلباً جديداً.
  - تعيد النتيجة الدقيقة عبر الدالة الجديدة `inspectOrRecoverOrderAttempt()` في `src/utils/order-idempotency.ts`.
- **تحديث `src/pages/cart.astro`:**
  - إضافة حارس `isSubmittingOrder` لمنع الطلبات المتزامنة من المتصفح.
  - فحص صلاحية `idToken` وتجديده استباقياً (`getIdTokenResult` + `getIdToken(true)` إذا تبقى أقل من 120 ثانية) قبل قراءة `customerUid` وإرسال الطلب.
  - عند استلام `409 ORDER_IN_PROGRESS` أو خطأ شبكة/`502+`: استطلاع تلقائي محدود لـ `POST /api/order-attempt-status` لعرض تقدم المعالجة وإعادة التوجيه فوراً إلى `/invoice#access=...` فور اكتمال أو استرجاع الطلب.
  - ربط زر `#btnResetOrderAttempt` باستشارة إلزامية لـ `POST /api/order-attempt-status` قبل مسح `sessionStorage`: إذا كان الطلب `COMPLETED` يوجه للفاتورة فوراً، وإذا كان `IN_PROGRESS` يرفض التصفير (`canResetAttempt: false`) لمنع الطلبات المكررة، ولا يصفر المحاولة إلا عندما يؤكد السيرفر `canResetAttempt: true`.

---

## 4. مقارنة البصمة بين المتصفح والسيرفر (Client vs Server Fingerprint Comparison)

| العنصر | السلوك السابق | سبب التباين المحتمل (Conflict 409) | الحالة بعد الإصلاح |
| :--- | :--- | :--- | :--- |
| ترتيب `selectedVariants` | العميل لم يرتب `selectedVariants` بينما السيرفر يرتبها | اختلاف ترتيب المصفوفة ينتج SHA-256 مختلفاً (`IDEMPOTENCY_CONFLICT`) | `canonicalizeSelectedVariantsForFingerprint` متطابقة في `public/assets/js/order-flow-helpers.js` و`src/utils/order-idempotency.ts` |
| الأرقام الفارسية / العربية والرموز غير الرقمية في الهاتف | العميل يحول `٠-٩` فقط ولا يرفض الأحرف كالسيرفر | أرقام مثل `۰-۹` أو أحرف داخل الحقل تعطي بصمة مختلفة | توحيد `normalizeArabicDigits` (`\u0660-\u0669` + `\u06F0-\u06F9`) والتحقق من `!/^[0-9+\-\s().]+$/` وطول 10–15 رقماً مطابقاً لـ `src/utils/phone.ts` |
| `customerUid` وانتهاء صلاحية `idToken` | استخدام `idToken` منتهٍ أو وشك الانتهاء يفك تحققه في السيرفر (`customerId = null`) بينما العميل يحسب `customerId = uid` | فشل مطابقة البصمة أو تغيّرها عند إعادة المحاولة بعد التجديد | تحديث استباقي لـ `idToken` في `cart.astro` قبل الحساب والإرسال مع إبقاء `customerUid` مقيداً بوجود `idToken` صالح |
| البريد والكوبون | السيرفر يطبع البريد لـ lowercase والكوبون لـ UPPERCASE | متطابقان مع الفحص الصارم للمسافات | `mariam@example.com` و`WELCOME20` متطابقان باختبار وحدة مباشر |

*(ملاحظة معمارية مهمة: البصمة تُطابق عناصر السلة بنفس ترتيبها في السلة وبنفس حقول الكائنات المرسلة؛ وفي الاستخدام الفعلي عبر `cart.astro` يُرسل مصفوفة `cart` نفسها إلى `/api/create-order` دون تغيير المفاتيح.)*

---

## 5. نتائج محاكاة الأقفال المعلقة والتعطل (Stale Lock Recovery & Crash Simulation)

- **الفحص المباشر لقاعدة RTDB الحية (`privateOrderIdempotency/{requestKeyHash}`):** **محجوب بيئياً (`BLOCKED BY ENVIRONMENT`)** لعدم توفر ملف اعتماد خدمة Firebase الإنتاجية (`FIREBASE_SERVICE_ACCOUNT`) في بيئة AI Studio، مع الالتزام الصارم بعدم كتابة أو تعديل بيانات الإنتاج.
- **الفحص الهندسي ومحاكاة الأعطال محلياً عبر الاختبارات الآلية (`MockAdminDb`):**
  1. **ثغرة مكتشفة ومُصلحة في `acquireOrderIdempotencyLock` (`src/utils/order-idempotency.ts`):** عند وجود سجل `COMMITTING` منتهي الصلاحية لكنه تالف بدون `commitPayload`، كانت المعاملة `txRecoverCommit` ترفض التحديث دون أن تُعيد حالة فشل، فكان التنفيذ يسقط إلى `IN_PROGRESS` (مسبباً حلقة `409 ORDER_IN_PROGRESS` لا نهائية)! تم إضافة نتيجة `{ outcome: 'UNAVAILABLE', reason: 'MISSING_COMMIT_PAYLOAD' }` مع ربطها برد `503` في `create-order.js`.
  2. **استرجاع `COMMITTING` منتهي الصلاحية:** عند محاكاة تعطل السيرفر بعد كتابة `COMMITTING` وقبل الانتقال إلى `COMPLETED`، يقوم كل من `create-order.js` و`order-attempt-status.js` باستكمال كتابة الطلب وسجلات الوصول و`notifications_outbox` دون تكرار خصم المخزون ودون توليد `orderId` جديد، ويفك تشفير نفس `invoiceAccessToken` ويعيد `state: 'COMPLETED'`.
  3. **سجل `PENDING` منتهي الصلاحية مع وجود الطلب في `orders/{reservedOrderId}`:** يتم ترقية السجل ذرياً إلى `COMPLETED` واسترجاع التوكن الأصلي (`recovered: true`, `canResetAttempt: false`).
  4. **سجل `PENDING` منتهي الصلاحية دون وجود طلب / سجل `FAILED` / `NOT_FOUND`:** يرجع `SAFE_TO_RESET` (`canResetAttempt: true`) فقط في هذه الحالات، مما يمنح زر `#btnResetOrderAttempt` إذناً آمناً بتوليد معرف جديد دون أي خطر للطلب المكرر.
  5. **الطلبات المحذوفة إدارياً (`DELETED`/`DELETING`):** يرجع `409 ORDER_DELETED` مع `canResetAttempt: false`.

---

## 6. نتائج فحص نظام إدارة الكوبونات وخطأ `404` السابق

1. **لماذا ظهر `404` أثناء الاختبار اليدوي السابق وما وضعه حالياً؟**
   - بمراجعة خط الأساس السابق (`4088dde7`) مقارنة بآخر إيداع على `origin/main` (`c2de80fa`)، تبيّن أن ميزة الكوبونات والتحليلات أُضيفت وأُصلحت في التعديلات الأحدث.
   - بالفحص الحي المباشر على `https://dandy-ebon.vercel.app/api/coupons/admin` (`GET` و`POST`) خلال هذا التحقيق: أعاد الخادم **`401 Unauthorized`** مع جسم JSON صريح (`"error": "UNAUTHORIZED"`) بدلاً من `404`، مما يثبت أن المسار `/api/coupons/admin` أصبح منشوراً ويعمل على الإنتاج حالياً.
2. **عيوب متبقية مكتشفة ومُصلحة محلياً في واجهات إدارة الكوبونات (`src/pages/dashboard-coupons.astro` و`src/pages/dashboard-coupon-analytics.astro`):**
   - **انتهاء توكن Firebase بعد ساعة (`401`):** كانت الدوال `loadCoupons()` و`persistCouponForm()` و`executeSetActive()` و`loadAnalytics()` و`exportCsvDataset()` تحوّل المديرة فوراً إلى `/login` عند أي `401` دون محاولة تجديد التوكن (`getIdToken(true)`)، مما يُفقد المديرة البيانات المدخلة في نافذة إنشاء/تعديل الكوبون. تم إضافة `fetchAdminWithAuthRetry` و`fetchAnalyticsWithAuthRetry` لإعادة تجديد التوكن قسراً وإعادة المحاولة مرة واحدة قبل التوجيه لـ `/login?reason=session_expired`.
   - **الاستجابات غير JSON (`404` / `502` / `504` HTML):** كانت استدعاءات `await res.json()` تنهار بخطأ `SyntaxError` عام يخفي رمز HTTP الحقيقي عند رجوع صفحة HTML من Vercel أو الوسيط. تم استبدالها بـ `readAdminJsonSafely` و`readAnalyticsJsonSafely` مع رسائل عربية واضحة تتضمن رمز الحالة (`HTTP 404`, `HTTP 500+`).
   - **تمييز `403 Forbidden` عن `401`:** بدلاً من الطرد الصامت إلى `/login`، يظهر للمستخدم خطأ تفويض عربي صريح مع الحفاظ على بيانات النموذج المفتوح.
- **ملاحظة وصول:** لم يتمكن التحقيق من تسجيل الدخول فعلياً بحساب الإدارة (`admin@dandy.com`) على بيئة الإنتاج لعدم توفر كلمة مرور الإدارة (وهذا سليم أمنياً)، لذا جرى اختبار التدفق التفاعلي الكامل للإنشاء/التعطيل ومعالجة أخطاء `401/403/404` محلياً عبر اختبارات محاكاة الخادم وDOM (`test/group2a5-coupon-admin.test.mjs` و`test/incident-checkout-coupons.test.mjs`).

---

## 7. تحقيق أخطاء وحدة التحكم لـ Cloudflare Turnstile

بالفحص المباشر على الإنتاج وعلى الخادم المحلي (`http://localhost:3000`):
1. **مصدر التحذيرات المذكورة في الطلب:**
   - رسائل `Connecting to 'data:...' violates Content Security Policy directive: "connect-src 'self' https://hagen.challenges.cloudflare.com ..."`،
   - أخطاء فك ترميز خطوط WOFF2 (OTS parsing error)،
   - تحذير WebGPU `No available adapters`،
   - واستجابة `401` على طلبات `pat/` ورسائل `%c%d NaN {}`:
   **جميعها تنشأ داخلياً داخل الـ iframe المعزول التابع لشركة Cloudflare** (`https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/...`) أثناء فحص خصائص المتصفح (Browser Integrity / Private Access Tokens) في بيئات Chromium/Headless، **ولا تنشأ من سياسة CSP الخاصة بموقع Dandy أو ملفاته**.
2. **التحقق من الجاهزية الفعلية على الصفحات الثلاث:**
   - يظهر عنصر Turnstile ويعمل بصرياً في:
     - `/cart` (الخطوة 3 — المراجعة والتأكيد)،
     - `/account-login`،
     - `/account-signup`.
   - تم التحقق من بوابة التحقق السيرفري الصارمة عبر `/api/create-order` و`/api/verify-turnstile`.
3. **تحسينات دورة حياة Turnstile المضافة محلياً في الصفحات الثلاث:**
   - إضافة دوال الاستدعاء `data-callback`, `data-expired-callback`, و`data-error-callback` وعناصر الحالة المضمنة (`#cartTurnstileStatusMsg`, `#loginTurnstileStatusMsg`, `#signupTurnstileStatusMsg`) مع إعادة تعيين ذكية في `cart.astro` عند فتح الخطوة 3 إذا انتهت صلاحية التوكن أثناء تعبئة البيانات.

---

## 8. الملفات المعدّلة والمضافة وجدول مقارنة بصمات SHA-256

### أ. الملفات المعدّلة والمضافة لهذا التحقيق
| المسار | نوع التغيير | SHA-256 قبل التعديل | SHA-256 بعد التعديل |
| :--- | :--- | :--- | :--- |
| `public/assets/js/order-flow-helpers.js` | تعديل (توحيد الهاتف والأرقام الفارسية وترتيب `selectedVariants`) | `3bf0dbc028f28f619e5f8a9c31cbac49585ad3fe21f08d60cffe06d62a34362b` | `723623017a2bd56ff4a62ff3c312591f061d0080fad29d3f2d6290da663bf3a9` |
| `src/utils/email-service.ts` | تعديل (دعم `timeoutMs` اختياري للبريد) | `4712c7fd7ca0582b22b754a2af3e4c07559762b22f706c48de29767421db7a78` | `ecd2bc1fbb5135b313c5260e1ad2f3fe1da127cb608b470249a2ae30cfe788ab` |
| `src/utils/order-idempotency.ts` | تعديل (`inspectOrRecoverOrderAttempt` وحماية `UNAVAILABLE` للسجل التالف) | `a32c795158a6b92b6a85d4d6049e71947729a6dfa74aa3ff93224a22d722c2dc` | `b9e8555c7c4182539155c77c1b3cc43581b539622885922a35a7043d077fe66d` |
| `src/pages/api/create-order.js` | تعديل (جلب وخصم متوازٍ + سقف مهلة بريد 4.5s + معالجة `UNAVAILABLE`) | `673f982b2454f476703a0433ca26c2a108f9bc695bd01804953c37fca2f0cd66` | `83c53ef9d1ae56bba89d6d32f85b7659bea297e77e30ad8be7798df2363d5db2` |
| `src/pages/api/order-attempt-status.js` | **جديد** (فحص واسترجاع آمن بدون تكرار + معدل طلبات 30/دقيقة) | *(ملف جديد)* | `5ab92c07f16a29ac09bcddf45ac8636347357df0235186f9fc7dbf349a1fa354` |
| `src/pages/cart.astro` | تعديل (قفل إرسال + تجديد التوكن + استطلاع الاسترجاع + حماية Reset + Turnstile) | `1ac643dd872748c63afcf678f731f5e1c346c60b16f3f10db5ea8ee1bbf2927d` | `ea05b3ce350907a7b91d08ab99d649d2af564ee568f8ab2887ab06e406bef8aa` |
| `src/pages/dashboard-coupons.astro` | تعديل (إعادة تجديد `401` + قراءة JSON آمنة + رسائل `403/404/5xx`) | `dd88a597...` *(بادئة قبل التعديل)* | `d138a9712e3b553f6b2608e5b8edd0f6c6ff419810f57e4a1c5c28ced5205e1c` |
| `src/pages/dashboard-coupon-analytics.astro` | تعديل (إعادة تجديد `401` + قراءة JSON آمنة + رسائل `403/404/5xx` + CSV) | `eb7587ed...` *(بادئة قبل التعديل)* | `e5075793f47280a2e77cba2e53c889b2171ab17fd09007944c95f9d8a2731497` |
| `src/pages/account-login.astro` | تعديل (دورة حياة `Turnstile` ورسائل خطأ/انتهاء صلاحية) | `1b43db7c...` *(بادئة قبل التعديل)* | `63533dc1a74df1ee20cfd9ac7711991cecf6a2f2b541f87526badbec4d34d15a` |
| `src/pages/account-signup.astro` | تعديل (دورة حياة `Turnstile` ورسائل خطأ/انتهاء صلاحية) | `abf2962d...` *(بادئة قبل التعديل)* | `e21e8527a18b507c28f17baf79dab0e9cc41649e28abf80852955cd7f5ceb944` |
| `test/incident-checkout-coupons.test.mjs` | **جديد** (اختبارات البصمة والاسترجاع و`create-order` والـ UI) | *(ملف جديد)* | `6abd9fee41b656e1326a34af44cf4dec2fd63285372464944ce86f0b124a1b02` |

---

## 9. نتائج التحقق والتصنيف الصادق (Verification Results)

| المسار / الفحص | التصنيف | التفاصيل والبرهان |
| :--- | :--- | :--- |
| تطابق بصمة العميل والسيرفر (`selectedVariants`, الهاتف, `customerUid`) | **FIXED LOCALLY, NOT DEPLOYED** | اجتاز اختبار `test/incident-checkout-coupons.test.mjs` (تطابق تام SHA-256 بين المتصفح والسيرفر). |
| مسار `POST /api/order-attempt-status` واسترجاع الأقفال المعلقة/التالفة | **FIXED LOCALLY, NOT DEPLOYED** | تم التحقق من جميع الحالات: `COMPLETED`, `RECOVER_COMMITTING`, `EXPIRED_PENDING_WITH_ORDER`, `SAFE_TO_RESET`, `CONFLICT`, `IN_PROGRESS`, `ORDER_DELETED`, و`MISSING_COMMIT_PAYLOAD` (`503`). |
| تسريع `POST /api/create-order` وتحديد مهلة البريد (4.5s) | **FIXED LOCALLY, NOT DEPLOYED** | اجتاز اختبار المحاكاة والوقت + اختبارات السلة والخصم والـ Outbox. |
| تجربة العميل في `/cart` (سطح المكتب `1440x900` والجوال `390x844`) | **FIXED & VERIFIED** *(محلياً)* | تم التحقق عبر Playwright على `http://localhost:3000/cart`: تحقق الخطوة 2، تطبيع `+20 ٠١٠١٢٣٤٥٦٧٨` -> `01012345678`، ظهور زر `#btnResetOrderAttempt`، عدم وجود فيض أفقي على الجوال، صفر أخطاء JS. |
| تحصين لوحة الكوبونات والتحليلات (`401` refresh, HTML `404/502`, `403`) | **FIXED LOCALLY, NOT DEPLOYED** | اجتاز اختبارات `group2a5`, `group2a7`, و`incident-checkout-coupons` بنجاح كامل. |
| دورة حياة Cloudflare Turnstile في `/cart`, `/account-login`, `/account-signup` | **FIXED LOCALLY, NOT DEPLOYED** | دوال `on*TurnstileVerified/Expired/Error` مثبتة وتعمل بلا أخطاء في Playwright محلياً. |
| اختبارات الوحدة الأساسية والانحدار (9 ملفات حاسمة — 87 اختباراً) | **FIXED & VERIFIED** *(محلياً)* | `87 / 87 PASSED` عبر `npx --yes tsx --test` (بما فيها `qa-audit-regressions`, `order-submission`, `order-idempotency-encryption`, `group2a5`, `group2a6`, `group2a7`, `group3a`, `incident-checkout-coupons`). |
| فحص حزم الاختبارات التراثية بالكامل (30 ملفاً — 408 اختبارات) | **PARTIALLY FIXED** *(تعارض قديم فقط)* | نجح `405 / 408`. الإخفاقان الوحيدان في `group2b11` و`group2b111` سببهما اختبار قديم يقارن بصمة `.env.example` بتاريخ `3ff3cf31` قبل إضافة متغيرات Turnstile (لم نمس `.env.example`). |
| التحقق الفعلي للكتابة على الإنتاج (`dandy-ebon.vercel.app` وRTDB الحية واختبار `admin@dandy.com` حيّاً) | **BLOCKED BY ENVIRONMENT** | محظور بالسياسة والبيئة (لا دفع لـ GitHub ولا نشر لـ Vercel ولا كتابة على قاعدة البيانات الحية ولا كلمة مرور الإدارة ولا ملف `FIREBASE_SERVICE_ACCOUNT` محلياً). |

---

## 10. قائمة التحقق الآمنة للنشر على الإنتاج (Deployment & Safe Git Push Checklist)

1. **التحقق قبل الدمج المحلي على جهاز التطوير:**
   - التأكد من تطابق متغيرات البيئة على Vercel: `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `DANDY_INVOICE_TOKEN_ENCRYPTION_KEY`, ومفاتيح Upstash Redis (إن وجدت).
   - تشغيل البناء والاختبارات قبل الرفع:
     ```bash
     npm run lint && npm run build
     npx --yes tsx --test test/incident-checkout-coupons.test.mjs test/qa-audit-regressions.test.mjs test/order-idempotency-encryption.test.mjs test/group2a5-coupon-admin.test.mjs test/group2a6-coupon-checkout.test.mjs test/group2a7-coupon-analytics.test.mjs
     ```
2. **الحفظ والدفع الآمن لفرع `main` (لا تستخدمي `git push --force` مطلقاً):**
   ```bash
   git status
   git diff --stat
   git add public/assets/js/order-flow-helpers.js src/utils/email-service.ts src/utils/order-idempotency.ts src/pages/api/create-order.js src/pages/api/order-attempt-status.js src/pages/cart.astro src/pages/dashboard-coupons.astro src/pages/dashboard-coupon-analytics.astro src/pages/account-login.astro src/pages/account-signup.astro test/incident-checkout-coupons.test.mjs DANDY_CHECKOUT_COUPONS_INCIDENT_REPORT_AR.md
   git commit -m "fix(checkout,coupons): add non-duplicating order recovery, align fingerprints, and harden coupon admin auth"
   git push origin main
   ```
3. **التحقق بعد نشر Vercel (Post-Deploy Smoke Test):**
   - فحص `/api/health` و`/api/coupons/admin` للتأكد من عمل النشر الجديد.
   - إجراء طلب اختبار حقيقي واحد على `/cart` بمبلغ صغير (ثم حذفه إدارياً لاحقاً) مع تجربة النقر المتتالي/التحديث للتأكد من اختفاء علقان `409` والوصول السليم للفاتورة `/invoice#access=...`.
   - تسجيل الدخول كمديرة في `/dashboard-coupons` وتجربة إنشاء كوبون جديد، تعديله، تعطيله، وتجربته في السلة.
