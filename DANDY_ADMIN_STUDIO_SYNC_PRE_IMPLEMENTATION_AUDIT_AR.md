# تقرير المراجعة الفنية قبل التنفيذ: مزامنة لوحة التحكم (Admin Studio & Pink Friday) مع واجهة متجر داندي (DANDY Cosmetics)

**التاريخ:** 18 نوفمبر 2026  
**المشروع:** متجر داندي لمستحضرات التجميل الطبيعية (DANDY Cosmetics — Astro SSR + Firebase RTDB/Auth + Tailwind/Editorial Commerce CSS)  
**الاتجاه التصميمي المعتمد:** Botanical Editorial Commerce  
**الغرض من التقرير:** توثيق نتائج الفحص الفعلي للكود المصدري وتحديد الأسباب الجذرية لمشكلتَي **(A) موثوقية تحكم لوحة Pink Friday** و**(B) اكتمال تخصيص الصفحة الرئيسية ومزامنتها بالعربية والإنجليزية** قبل تعديل أي ملف برمجي.

---

## 1. البنية الحالية للوحة التحكم (Current Dashboard Architecture)

يعتمد النظام الإداري الحالي على صفحات Astro مخصصة تعمل مع حزمة التصفح العلوية المشتركة (`DashboardNav.astro`) وتتحقق من الصلاحيات عبر Firebase Auth (`admin@dandy.com`) عند التحميل:

- **`/dashboard-index` (`src/pages/dashboard-index.astro`) — Homepage Studio:**
  - واجهة محرر مرئي ثنائية الأجزاء: قائمة الأقسام القابلة للسحب وإعادة الترتيب وإظهار/إخفاء الأقسام (`SortableJS`) على اليمين، ومعاينة حية مضمّنة عبر `<iframe>` يشير إلى `/?studio_preview=1` على اليسار مع محاكاة أبعاد Desktop / Tablet / Mobile ووضعي `تحرير` و`معاينة`.
  - يقرأ ويكتب مباشرة إلى Firebase Realtime Database (`db.ref('homepage/...')` و`db.ref('categories')` و`db.ref('products')`) باستخدام Firebase Web SDK.
  - لا يوفر حالياً محولاً للغة المعاينة/التحرير (مقيد بالعربية فقط `/?studio_preview=1`).
- **`/dashboard-pink-friday` (`src/pages/dashboard-pink-friday.astro`) — Pink Friday Campaign Suite:**
  - واجهة إدارة حملات سنوية مستقلة تدعم اختيار السنة (`yearSelector`) وإنشاء سنة جديدة، وإدارة المسودة (`draft`)، والنشر (`publish`)، واستعادة المنشور (`restore_published`)، وبناء الكوليكشنز/البكجات (`collections`)، والمنتجات المخفضة (`offers`).
  - يتواصل مع الخادم عبر نقطتَي `/api/pink-friday/admin` (GET وPOST محمي بـ Firebase Admin ID Token لـ `admin@dandy.com`) مع جلب المنتجات من RTDB `products`.
- **لوحات مساندة مرتبطة:** `/dashboard`، `/dashboard-product`، `/dashboard-order`، `/dashboard-blog` (يتكامل عبر رابط خارجي داخل محرر المدونة في `/dashboard-index`).

---

## 2. البنية الحالية لتخصيص الصفحة الرئيسية (Homepage Customization Architecture)

تتبع الصفحة الرئيسية السلسلة التالية من الخادم إلى المتصفح:

1. **الطبقة الخادمة (`src/utils/homepage.ts`):** الدالة `getHomepageStudioData({ forceFresh })` تجلب عقدتَي `/homepage.json` و`/categories.json` من Firebase RTDB مع تخزين مؤقت في الذاكرة لمدة 30 ثانية (`CACHE_TTL_MS = 30 * 1000`) يتم تجاوزه فقط عند تمرير `forceFresh` (عند وجود `?studio_preview=1`).
2. **محرك الحسم النقي (`src/scripts/homepage-studio.ts`):** يحول البيانات الخام عبر دوال نقية قابلة للاختبار:
   - `resolveOrderedHomepageEntries()`
   - `resolveSectionVisibility()`
   - `resolveHeroSlides()`
   - `resolveTrustItems()`
   - `resolveDynamicProductSection()` و`selectProductsForStudioSection()`
   - `resolveCategoriesForShowcase()`
   - `resolvePromoBanner()`
   - `resolveVideoMedia()`
   - `mergeStudioPreviewState()`
3. **طبقة التعريب غير المدمِّرة (`src/i18n/content/adapters.ts` + `src/i18n/content/en/homepage-studio.ts`):** الدالة `resolveLocalizedHomepageStudioState()` تطبّق غطاء النصوص الإنجليزية (`EN_HOMEPAGE_STUDIO_OVERLAY`) عند تصفح `/en/` مع الحفاظ على `sectionOrder` و`sectionsVisibility` ومعرفات المنتجات والوسائط.
4. **طبقة العرض (`src/components/views/HomeView.astro` والمكونات الفرعية في `src/components/home/`):**
   - تعرض الأقسام بالترتيب المحسوم، وتضبط علامة `data-studio-section="<id>"` و`data-studio-hidden` (في وضع المعاينة لإبقاء العناصر المخفية قابلة للتفعيل اللحظي).
   - تحقن الحالة الابتدائية `window.__STUDIO_INITIAL_STATE__` في وضع المعاينة لتتلقى رسائل `postMessage` (`STUDIO_UPDATE_STATE`، `STUDIO_SELECT_SECTION`، `STUDIO_SET_MODE`، `STUDIO_RELOAD`) وتُحدّث DOM حياً داخل `<iframe>`.

---

## 3. مصادر تهيئة Firebase الحالية (Existing Firebase Configuration Sources)

| العقدة في Firebase RTDB | المستهلكون في الواجهة | الكاتبون في لوحة التحكم | ملاحظات توافقية |
|---|---|---|---|
| `/homepage/dynamicHero` | `homepage.ts` → `resolveHeroSlides()` | `/dashboard-index` | مصفوفة/كائن شرائح (`desktopImage`, `mobileImage`, `image`, `title`, `subtitle`, `buttonText`, `link`, `duration`) |
| `/homepage/dynamicSections` | `homepage.ts` → `resolveDynamicProductSection()` | `/dashboard-index` | يضم قسمي `offers` و`newArrivals` (`id`, `type`, `title`, `subtitle`, `visible`, `manualProducts`, `limit`, `order`) |
| `/homepage/trust` | `homepage.ts` → `resolveTrustItems()` | `/dashboard-index` | كائن يضم `item1`, `item2`, `item3` (`icon`, `title`, `desc`) |
| `/homepage/dynamicReviews` (+ `/homepage/reviews` كرجوع قديم) | `homepage.ts` → `HomeView.astro` | `/dashboard-index` يكتب في `dynamicReviews` فقط | `/dashboard-index` لا يقرأ `/homepage/reviews` إذا كان `dynamicReviews` فارغاً |
| `/homepage/promoBanner` | `homepage.ts` → `resolvePromoBanner()` | `/dashboard-index` | (`eyebrow`, `title`, `desc`, `ctaText`, `ctaLink`, `image`) |
| `/homepage/customSections` | `homepage.ts` → `CustomStudioSection.astro` | `/dashboard-index` | أنواع: `products`, `banner`, `faq`, `story`, `video`, `gallery`, `trust` |
| `/homepage/sectionOrder` | `resolveOrderedHomepageEntries()` | `/dashboard-index` | مصفوفة معرفات الأقسام |
| `/homepage/sectionsVisibility` | `resolveSectionVisibility()` | `/dashboard-index` | خريطة `{ [sectionId]: boolean }` |
| `/homepage/sections` (قديم محتمل) | غير مقروءة في `homepage.ts` | بيانات إرث قديمة في RTDB | يُنصح بدعم قراءتها كـ fallback عند غياب `sectionsVisibility` |
| `/categories` | `homepage.ts` + `utils/products.ts` | `/dashboard-index` | مخزنة بمفاتيح Push IDs مثل `-Ox...` وليس بالـ slug |
| `/products` | `utils/products.ts` + `/api/create-order` + `/dashboard-*` | `/dashboard-product` | الكتالوج الرسمي للمنتجات والأسعار والمخزون والخصومات العادية (`onSale`, `discount`, `originalPrice`) |
| `/settings/pinkFriday/campaigns/pink-friday-{year}/{draft,published}` | `/api/pink-friday/admin` | `/dashboard-pink-friday` | تفصل بين المسودة والمنشور لكل سنة |
| `/settings/pinkFriday/publishedActiveCampaign` | `pink-friday-server.ts` → SSR + `/api/pink-friday/public` + `/api/create-order` | `/api/pink-friday/admin` (`publish`) | المصدر المفترض أنه الوحيد للواجهة العامة |

> **ملاحظة حاسمة عن Firestore:** مقالات المدونة (`BlogHomeSection.astro`) تُجلب من Firebase Firestore (وليس RTDB) وتُدار من `/dashboard-blog`. كما أن سجل التعديلات `change_logs` يُكتب في Firestore من `/api/pink-friday/admin`.

---

## 4. القائمة الكاملة للحقول المُدارة حالياً في لوحة التحكم (Full List of Dashboard-Managed Fields)

### أ. في `/dashboard-index` (Homepage Studio)
- **ترتيب وظهور الأقسام:** `sectionOrder[]` و`sectionsVisibility[sectionId]`.
- **Hero (`dynamicHero[]`):** `desktopImage`, `mobileImage`, `duration`, `title`, `subtitle`, `buttonText`, `link`.
- **شريط الثقة (`trust.item1..3`):** `icon`, `title`, `desc`.
- **قسم العروض وأحدث المنتجات (`dynamicSections[]`):** `visible`, `title`, `subtitle`, `type` (`offers | bestsellers | manual` فقط), `manualProducts` (تحديد المنتجات).
- **الأقسام/التصنيفات (`categories[key]`):** `name`, `tagline`, `count`, `layoutVariant` (`auto|wide|large|tall|small`), `desktopImage`, `mobileImage`, `image`.
- **البانر الترويجي (`promoBanner`):** `eyebrow`, `title`, `desc`, `ctaText`, `ctaLink`, `image`.
- **المدونة (`blog`):** إظهار/إخفاء وترتيب القسم فقط + رابط إلى `/dashboard-blog`.
- **التقييمات (`dynamicReviews[]`):** `image`, `author` (الـ `text` موجود بالنوع لكن لا يوجد حقل إدخال له).
- **الأقسام المخصصة (`customSections[]`):** الحقول العامة `title`, `subtitle`؛ وحسب النوع:
  - `story`: `content`, `author`
  - `faq`: `items[].{q, a}`
  - `video`: `videoUrl`, `poster`
  - `banner`: `eyebrow`, `ctaText`, `ctaLink`, `image`, `desc`
  - `products`: `productSource` (`all|offers|bestsellers|manual`), `limit`, `linkText`, `linkUrl`, `manualProducts`
  - `gallery`: `items[].{image, title}` (ينقصه `link`)
  - `trust`: `items[].{icon, title, desc}`

### ب. في `/dashboard-pink-friday`
- `enabled`, `startAt/startDate`, `endAt/endDate`
- `visuals`: `headline`, `subtitle`, `heroImageUrl`, `bannerPosition`, `ctaText`, `badgeText`
- `offers[]`: `productId`, `discountPercentage`, `badgeText`, `active` (ينقصه حساب/تخزين `expectedBasePrice` و`campaignPrice` و`allowWithGenericDiscount` ومعلومات اللغة الإنجليزية)
- `collections[]`: `id`, `name`, `description`, `coverImage`, `badgeText`, `active`, `allowDuplicates`, `pricingType`, `packagePrice`, `discountPercentage`, `items[].{collectionItemId, productId, defaultVariantId}`

---

## 5. القائمة الكاملة لأقسام الصفحة الرئيسية العامة (Full List of Public Homepage Sections)

الترتيب الافتراضي في `DEFAULT_SECTION_ORDER` (`src/scripts/homepage-studio.ts:152`) مع موقع Pink Friday التلقائي:

1. `hero` (`HeroEditorial.astro`) — الشرائح + kicker + زر ثانوي `فلسفة داندي` (`/about-us`) + 3 حقائق سفلية (`facts`).
2. `trust` (`TrustStripSection.astro`) — عنوان/عنوان فرعي اختياري + بطاقات الثقة (`item1..3` حالياً في Studio، بينما CSS يدعم 2–4 أعمدة).
3. `offers` (`FeaturedProducts.astro`) — شبكة العروض + عنوان فرعي + عنوان + زر CTA ورابطه.
4. `pink-friday` (`PinkFridayHomeSection.astro`) — يُدرج تلقائياً بعد `offers` (أو أول عنصر عند غياب `offers`) وفقط عند تحقق `shouldDisplayCampaignToCustomers()`.
5. `categories` (`CategoryDiscovery.astro`) — رأس القسم (`الأقسام الرئيسية`, `تسوقي حسب الروتين`, `كل المنتجات`) + شبكة التصنيفات التي تدعم `description`, `tagline`, `count`, `layoutVariant`, `desktopImage`, `mobileImage`.
6. `promo` (`EditorialBrandStory.astro`) — البانر التحريري + زر ثانوي (`/about-us`) + اقتباس وقيم تحريرية تظهر فقط عند `!promo.isCustomized`.
7. `newArrivals` (`FeaturedProducts.astro`) — قسم المنتجات الثاني.
8. `blog` (`BlogHomeSection.astro`) — رأس القسم (`من مدونة داندي`, `نصائح الخبراء للعناية الطبيعية`, `عرض كل المقالات`) + عرض أحدث 3 مقالات من Firestore.
9. `reviews` (`ReviewsHomeSection.astro`) — رأس القسم (`تجارب حقيقية`, `قالوا عن داندي`) + لقطات/تقييمات العميلات (`author`, `text`, `image`).
10. `customSections` (`CustomStudioSection.astro`) — أي قسم مضاف ديناميكياً في `sectionOrder`.

---

## 6. الربط بين عناصر التحكم في لوحة التحكم وعناصر المتجر العام (Mapping & Homepage Control Matrix)

| العنصر في الصفحة الرئيسية | يوجد تحكم باللوحة؟ | الواجهة العامة تستهلكه؟ | المعاينة الحية تعمل؟ | الحالة المنشورة تعمل؟ | ملاحظات/عيوب مكتشفة |
|---|---|---|---|---|---|
| **Hero: شرائح الصور (Desktop)** | نعم | نعم | نعم | نعم | — |
| **Hero: صورة الموبايل (`mobileImage`)** | نعم | **جزئياً (معطل وظيفياً للصور الطولية)** | لا (يرفضها) | **لا للصور الطولية** | `homepage-studio-client.ts:183` يشترط `aspectRatio >= 1.1` ويرفض صور `9:16` و`3:4`! |
| **Hero: العنوان / الوصف / الزر الأساسي / الرابط / المدة** | نعم | نعم | نعم | نعم | يعمل بـ `onchange` بدلاً من `oninput` الفوري في بعض الحقول |
| **Hero: النص التمهيدي (`kicker`) والزر الثانوي (`فلسفة داندي`)** | **لا** | لا (مُثبّت في الكود) | لا | لا | مُثبّت في `HeroEditorial.astro:121-151` بدون حقول `heroMeta` |
| **Hero: شريط الحقائق السفلي (`facts`: نباتي 100% / شحن...)** | لا | ثابت تحريري | لا | ثابت | عنصر هوية علامة تجارية ثابت (يمكن توثيقه كـ Intentionally Static) |
| **Trust: البطاقات 1–3 (أيقونة، عنوان، وصف)** | نعم | نعم | نعم | نعم | حقل الأيقونة نصي حر ولا يعرض قائمة أيقونات جاهزة |
| **Trust: رأس القسم (`title`, `subtitle`) وبطاقة رابعة اختيارية** | **لا** | CSS جاهز `.has-header` و`.cols-4` | جزئي | لا | `TrustStripSection.astro:40` يدعم العنوان و`.dandy-trust-cols-4` لكنهما غير موجودين في Studio |
| **Offers / New Arrivals: العنوان، النص العلوي، الإظهار** | نعم | نعم | نعم | نعم | — |
| **Offers / New Arrivals: مصدر `newArrivals` / `all`، `limit`، نص ورابط زر "عرض الكل"** | **لا** | جزئياً (`limit` فقط؛ `viewAllLabel/Href` مُثبّتان) | جزئياً | **لا** | `dashboard-index` يخفي `newArrivals` و`all` و`limit` و`viewAllLabel/Href`؛ و`homepage-studio.ts:530` يثبت CTA |
| **Categories: اسم القسم، Tagline، العدد، القالب، الصور** | نعم | نعم | نعم | نعم | `resolveCategoriesForShowcase` لا يمرّر `description` ويستبدل الاسم العربي القياسي بالمعجم عند المطابقة |
| **Categories: الوصف (`description`)، إظهار/إخفاء، إعادة ترتيب الأقسام، رأس القسم** | **لا** | `description` غير ممرّر؛ رأس القسم مُثبّت | لا | لا | `CategoryDiscovery.astro:38-45` يثبت العنوان وCTA؛ و`EN` overlay لا يطابق Push IDs في RTDB |
| **Promo Banner: `eyebrow`, `title`, `desc`, `ctaText`, `ctaLink`, `image`** | نعم | نعم | نعم | نعم | `EditorialBrandStory.astro:45` يستدعي `buildLocalizedPath` مرتين على `ctaLink` |
| **Blog Showcase: إظهار/إخفاء وترتيب القسم** | نعم | نعم | نعم | نعم | يظهر فقط بدون `updateBlogDom()` |
| **Blog Showcase: عنوان القسم، عنوان فرعي، نص CTA، عدد المقالات (`limit`)** | **لا** | **لا (مُثبّت)** | **لا** | **لا** | `BlogHomeSection.astro:34-43` يثبت النصوص و`.slice(0, 3)` |
| **Reviews: `image`, `author` وإظهار/إخفاء** | نعم | نعم | نعم | نعم | `dashboard-index` يتجاهل fallback العقدة `/homepage/reviews` |
| **Reviews: نص التقييم (`text`)، السحب لإعادة الترتيب، رأس القسم (`title`, `subtitle`)** | **لا** | `text` يستهلك؛ الرأس مُثبّت | نعم لـ `text` | لا للرأس/الترتيب | `ReviewsHomeSection.astro:40` يثبت الرأس؛ لا يوجد `Sortable.create` في `#reviewsSortableList` |
| **Custom Sections (`story`, `faq`, `video`, `banner`, `products`, `trust`)** | نعم | نعم | نعم | نعم | تعمل جيداً عند توفر البيانات |
| **Custom Section `gallery`: حقل الرابط (`link`)** | **لا** | نعم (`item.link`) | نعم | لا يمكن تعديله | `CustomStudioSection.astro:280` يستهلك `item.link` ولا يوجد له حقل إدخال في المحرر |
| **Pink Friday (الرئيسية، الإعلان، الهيدر، `/pink-friday`، الكروت، PDP، السلة، `/en/`)** | **نعم (مختل)** | نعم | جزئي | **غير موثوق (يظهر وهو معطّل)** | عدة ثغرات حاسمة موثقة في القسمين 12 و16 |
| **الهيدر والفوتر (`header`, `footer`)** | **جزئي/يتيم** | **لا** | جزئي | **لا** | Studio يرسل `header`/`footer` في `postMessage` لكن لا توجد حقول لهما أو حفظ أو استهلاك SSR |
| **تحرير النسخة الإنجليزية للمحتوى المخصص في Studio** | **لا** | **لا (ملف ثابت فقط)** | **لا** | **ملف ثابت فقط** | `EN_HOMEPAGE_STUDIO_OVERLAY` ثابت في الكود ولا يمكن تعديله أو معاينته من `/dashboard-index` |

---

## 7. عناصر التحكم المفقودة (Missing Customization Controls)

1. مبدل لغة الاستوديو (`العربية | English`) لتعديل `enOverlay` ومعاينة `/en/?studio_preview=1` دون المساس بالنصوص العربية.
2. زر تبديل الظهور (`sectionsVisibility`) داخل رأس محرر كل قسم (`inspector-header`) للتحكم السريع أثناء التعديل.
3. حقول قسمي المنتجات (`offers` / `newArrivals`): خيارا `newArrivals` و`all` في قائمة المصدر، حقل العدد (`limit`)، حقل نص زر CTA (`viewAllLabel`)، وحقل رابط زر CTA (`viewAllHref`).
4. حقول رأس قسم `trust` (`title`, `subtitle`) وإمكانية إضافة/حذف الميزة الرابعة (`item4`) مع منتقي أيقونات بصري.
5. حقول قسم `categories`: رأس القسم (`categoriesSection.title`, `subtitle`, `ctaText`)، حقل `description` لكل تصنيف، مفتاح إظهار/إخفاء كل تصنيف (`visible`)، وأزرار ترتيب التصنيفات (`order`).
6. حقول قسم `blog`: `title`, `subtitle`, `viewAllLabel`, `limit` مع تحديث حي في المعاينة (`updateBlogDom`).
7. حقول قسم `reviews`: حقل `text` لكل تقييم، إعادة الترتيب بالسحب (`Sortable.create`)، ورأس القسم (`reviewsSection.title`, `subtitle`).
8. حقول `heroMeta` (`kicker`, `secondaryCtaLabel`, `secondaryCtaHref`) في محرر Hero.
9. حقل `item.link` في عنصر معرض الصور (`customSections` من نوع `gallery`).
10. في `/dashboard-pink-friday`: زر واضح لإيقاف الحملة فوراً عن المتجر (`unpublish`)، عرض حالة **النسخة المنشورة فعلياً** بجانب **المسودة** مع تنبيه تعارض واضح، وحقول النسخة الإنجليزية (`i18n.en`)، واستبدال نوافذ `alert()`/`confirm()` الأصلية بنوافذ وتنبيهات داخلية غير حاصرة للـ iframe.

---

## 8. إعدادات لوحة التحكم اليتيمة (Orphaned Settings With No Storefront Consumers)

1. إرسال `header` و`footer` في `dispatchPreviewStateUpdate()` (`dashboard-index.astro:1791-1792`) بينما `StudioState` في لوحة التحكم لا يقرؤهما ولا يحفظهما ولا يستهلكهما SSR.
2. حفظ `offer.discountPercentage` في `/dashboard-pink-friday` دون احتساب وحفظ `expectedBasePrice` و`campaignPrice`، مما قد يؤدي لرفض العرض من `validateOffer()` على الخادم (`campaignPrice <= 0`).
3. حفظ `dynamicHero[].duration` يعمل، لكن `promoBanner.image` الافتراضي المُعبّأ مسبقاً في قيمة الـ input (`dashboard-index.astro:2660`) يظهر وكأنه مخصص بينما في RTDB فارغ.
4. `selectProductsForStudioSection` يعامل `'newArrivals'` و`'all'` بنفس الترتيب دون فرز حسب الأحدث عند توفر `createdAt` أو عكس الترتيب الزمني.

---

## 9. حقول البيانات غير المتزامنة (Unsynchronized Data Fields)

- `heroSlides[].mobileImage` مقابل عرض المتصفح: بوابة النسبة `aspectRatio >= 1.1` في `homepage-studio-client.ts:183` تسقط صور الموبايل الطولية (`9:16`, `3:4`).
- `offers[].expectedBasePrice` و`campaignPrice`: مفقودان عند الإضافة/التعديل في `/dashboard-pink-friday`.
- `publishedCampaign.publishedAt` مقابل `updatedAt`: اللوحة تعرض `updatedAt` فقط وأحياناً تفحص المسودة وتوهم المشرف أن الحملة المنشورة معطلة.
- `categories` في `EN_HOMEPAGE_STUDIO_OVERLAY`: المفاتيح ثابتة بالـ slug (`hair-care`, `skin-care`) بينما مفاتيح RTDB هي Push IDs، ما يمنع تطبيق الأسماء/الأوصاف الإنجليزية المخصصة.
- `PinkFridayHomeSection.astro`: يتجاهل `resolveLocalizedPinkFridayCampaign` ويستعمل `EN_PINK_FRIDAY_OVERLAY` مباشرةً.
- `homepage.ts` (30 ثانية) و`pink-friday-server.ts` (10 ثوانٍ) و`api/pink-friday/public.js` (`s-maxage=60, stale-while-revalidate=120`): تسبب بقاء بيانات قديمة بعد الحفظ أو الإيقاف.

---

## 10. معمارية تواصل المعاينة (Preview Communication Architecture)

- يعمل iframe المعاينة على `/?studio_preview=1` (وسيدعم `/en/?studio_preview=1` بعد الإصلاح).
- يرسل الـ iframe رسالة `STUDIO_PREVIEW_READY` عند التحميل، ويرد `/dashboard-index` برسالة `STUDIO_UPDATE_STATE` وبحدث الاختيار `STUDIO_SELECT_SECTION`.
- المستمع في `HomeView.astro` يستدعي `mergeStudioPreviewState()` من `homepage-studio.ts` ثم يحدّث DOM عبر `applyStudioPreviewState()` في `homepage-studio-client.ts`.
- عند النقر على أي قسم معلم بـ `data-studio-section` داخل وضع `edit`، يرسل `STUDIO_SECTION_CLICKED` لفتح المحرر المطابق في الشريط الجانبي.
- المعاينة لا تكتب أي بيانات إلى RTDB إلا عند النقر على زر **حفظ التعديلات** (`Ctrl+S`).

---

## 11. سلوك الحفظ والنشر (Save and Publish Behavior)

- **Homepage Studio (`/dashboard-index`):**
  - لا يفصل بين `draft` و`published` في RTDB؛ الكتابة تذهب مباشرة إلى `/homepage/*` و`/categories` عند الضغط على `حفظ التعديلات` (بينما التعديلات غير المحفوظة تبقى في ذاكرة المتصفح + المعاينة فقط).
  - **مشكلة التزامن:** ذاكرة SSR في `src/utils/homepage.ts` تحتفظ بالنسخة السابقة حتى 30 ثانية بعد الحفظ.
- **Pink Friday Dashboard (`/dashboard-pink-friday`):**
  - `save_draft` يحفظ تحت `settings/pinkFriday/campaigns/{id}/draft` فقط.
  - `publish` ينسخ المسودة إلى `draft` و`published` و`publishedActiveCampaign` و`currentYear`.
  - **مشكلة التزامن:** لا يوجد إجراء `unpublish`، وبعض التعديلات تحفظ في `draft` (`enabled: false`) بينما `publishedActiveCampaign` تبقى `enabled: true` وتواصل الظهور في المتجر.

---

## 12. مسار التحكم الإداري في Pink Friday (Pink Friday Administrative Control Flow)

المسار الحالي:  
`dashboard-pink-friday.astro` ←→ `/api/pink-friday/admin` ←→ Firebase RTDB (`settings/pinkFriday`)

**الأخطاء المكتشفة في المسار الإداري:**
1. **`dashboard-pink-friday.astro:2089`** يحسب شارة الحالة `#campaignStatusPill` من `draftCampaign.enabled` فقط وليس من `publishedActiveCampaign`، فيُظهر للمشرف أن الحملة "غير مفعلة" بينما `publishedActiveCampaign` في المتجر لا تزال مفعلة ونشطة!
2. **`<input type="checkbox" id="campaignEnabledToggle" checked>`** (`line 859`) مضبوط على `checked` في HTML الافتراضي، كما أن `syncFormWithDraft` يستخدم `draftCampaign.enabled !== false` (الذي يرجع `true` إن كانت القيمة غير معرفة).
3. **`api/pink-friday/admin.js:66-85`** يهيئ RTDB الفارغ بقالب `INITIAL_2026_CAMPAIGN` الذي يحمل `enabled: true` مباشرة في `publishedActiveCampaign`!
4. غياب زر أو إجراء `unpublish` سريع لإيقاف `publishedActiveCampaign` فوراً.
5. وجود مستمعين متكررين على `#catalogSearchInput` (`line 2208` و`line 2286`)، وعدم وجود حقل حفظ لـ `expectedBasePrice` و`campaignPrice`، واستخدام `alert()`/`confirm()` (6 مواضع) المحظورة في بيئات iframe، وعدم التحقق الصارم من `!res.ok` قبل تحليل JSON.

---

## 13. مسار العرض العام لحملة Pink Friday (Pink Friday Public Display Flow)

المسار العام:  
`RTDB /settings/pinkFriday/publishedActiveCampaign` → `getPublishedPinkFridayCampaign()` → `BaseLayout.astro` (حقن `window.__PINK_FRIDAY_CONFIG` + `AnnouncementBar` + `SiteHeader` + `MobileNavDrawer`) + `PinkFridayHomeSection` + `PinkFridayView` + `SpecialOffersView` + `ProductCard` + `ProductDetailView` + `public/assets/js/pink-friday.js` (`window.DandyPinkFriday`) + `cart-client.ts` + `/api/create-order`.

**مواطن الضعف في التقييم والعرض:**
- لا توجد بوابة موحدة واحدة تحسم الـ 8 حالات المطلوبة (`disabled`, `unpublished`, `upcoming`, `active-full`, `active-offers-only`, `active-bundles-only`, `active-empty`, `invalid`).
- `getCampaignStatus()` (`pink-friday-server.ts:162`) يفحص `campaign.enabled === false` فقط بدل اشتراط `campaign.enabled === true` صراحةً.
- `pink-friday.js:81` يستخدم `o.active` البوليانية غير الصارمة مقارنة بـ `offer.active !== false`، ولا يتحقق من `isHidden`/`isSoldOut` أو تعارض خصم `onSale` (`!offer.allowWithGenericDiscount`).
- `cart-client.ts:195-206` يتحقق عند إعادة مطابقة الكوليكشن من `DandyPinkFriday.isActive()` فقط دون التحقق عبر `getCollectionById(collectionId)`، فلا يكتشف تعطيل كوليكشن محدد أثناء نشاط الحملة.
- `PinkFridayView.astro` يعرض نصوص الهيرو والعروض حتى في حالة `disabled` بدل التمييز الصريح بين حالات عدم التوفر والانتهاء والقادم مع إخفاء أي أسعار أو عدادات ترويجية نشطة.

---

## 14. مشاكل البيانات القديمة والبدائل الافتراضية (Stale-Data and Fallback Problems)

1. **`INITIAL_2026_CAMPAIGN.enabled = true` (`src/utils/pink-friday-server.ts:80`):** Fallback يفشل بشكل مفتوح (Fail-Open)! عند انقطاع الشبكة أو غياب/عدم صحة استجابة RTDB في `getPublishedPinkFridayCampaign()`، يعود النظام بحملة **مفعلة** بتواريخ نوفمبر 2026 وصورة Unsplash.
2. **كاش SSR في `pink-friday-server.ts` (10 ثوانٍ) و`homepage.ts` (30 ثانية):** يبقي بيانات قديمة بالذاكرة حتى بعد الحفظ أو النشر أو الإيقاف في نفس خادم SSR، وغياب دالة إبطال للكاش عند عمليات الكتابة عبر Admin API.
3. **CDN Cache في `src/pages/api/pink-friday/public.js:75`:** يضبط `Cache-Control: public, max-age=30, s-maxage=60, stale-while-revalidate=120` ما يجعل العملاء يتلقون حملة منشورة قديمة حتى بعد إيقافها لمدة قد تصل لدقائق.
4. **`api/create-order.js:250`:** يستدعي `getPublishedPinkFridayCampaign()` دون `forceFresh = true` عند تحقق التسعير وقت الدفع.

---

## 15. متطلبات المزامنة العربية والإنجليزية (Arabic/English Synchronization Requirements)

- يجب أن تظل **البنية التجارية والمعمارية مشتركة** بين `/` و`/en/`:
  - نفس `sectionOrder` و`sectionsVisibility`.
  - نفس معرفات المنتجات والمصادر (`manualProducts`, `productSource`, `limit`, `categories` visibility/order).
  - نفس تفعيل الحملة، التواريخ (`Africa/Cairo`)، الأسعار، وقواعد التحقق في Pink Friday.
- يجب أن تبقى **النصوص والروابط القابلة للترجمة مستقلة** بين العربية والإنجليزية:
  - عدم الكتابة فوق النص العربي عند تحرير الإنجليزية في `/dashboard-index`، وعدم الكتابة فوق النص الإنجليزي عند تحرير العربية.
  - حفظ الغطاء الإنجليزي القابل للتحرير داخل `/homepage/enOverlay` (و`campaign.i18n.en` لـ Pink Friday) مع الدمج المتوافق رجعياً فوق `EN_HOMEPAGE_STUDIO_OVERLAY` و`EN_PINK_FRIDAY_OVERLAY`.
  - السماح لمفاتيح Push IDs في `categories` بمطابقة الترجمة الإنجليزية عبر الـ slug المعياري بالإضافة للمفتاح المباشر.
  - عدم عرض نص عربي خام بصمت في النسخة الإنجليزية عند غياب الترجمة.

---

## 16. العيوب المحددة المكتشفة (Specific Defects Discovered — Root Causes)

1. **[حرج — Problem A]:** `INITIAL_2026_CAMPAIGN.enabled = true` + Fallback مفتوح في `getPublishedPinkFridayCampaign()` يؤدي لتفعيل الحملة تلقائياً عند غياب أو تعطل RTDB، و`admin.js` يزرع نسخة مفعلة عند التهيئة الأولى.
2. **[حرج — Problem A]:** تباين `draft.enabled` مع `publishedActiveCampaign.enabled`: لوحة `/dashboard-pink-friday` تقرأ حالة الشارة من `draft` وترسخ انطباعاً أنها معطلة بينما `publishedActiveCampaign` نشطة في المتجر ولا يوجد إجراء `unpublish` سريع.
3. **[حرج — Problem A]:** `getCampaignStatus()` يفحص `=== false` فقط، وإلغاء الحملة لا يبطل كاش `pink-friday-server.ts` (10s) ولا `api/pink-friday/public.js` (s-maxage 60s + SWR 120s).
4. **[متوسط/مرتفع — Problem A]:** عدم حفظ `expectedBasePrice` و`campaignPrice` في لوحة Pink Friday، وفجوات التطابق في `pink-friday.js` و`cart-client.ts` (عدم فحص `getCollectionById`) و`PinkFridayHomeSection.astro` (تجاهل `resolveLocalizedPinkFridayCampaign`) و`adapters.ts` (تقييد `overlay.campaignId !== campaign.id`).
5. **[حرج — Problem B]:** رفض `mobileImage` في `homepage-studio-client.ts:183` إذا كانت النسبة `< 1.1`، مما يعطل صور الموبايل الطولية `9:16` / `3:4` تماماً في المتجر والـ Studio معاً.
6. **[مرتفع — Problem B]:** كاش الـ 30 ثانية في `homepage.ts` يمنع ظهور التعديلات المحفوظة فوراً عند تحديث المتجر بعد الحفظ.
7. **[مرتفع — Problem B]:** نواقص جوهرية في محررات `/dashboard-index`: أقسام المنتجات (`newArrivals`, `all`, `limit`, `viewAllLabel`, `viewAllHref`)، المدونة (كامل التحكم بالرأس والعدد + غياب `updateBlogDom`)، التقييمات (`text`, الترتيب بالسحب, الرأس, قراءة `reviews` fallback)، التصنيفات (`description`, `visible`, الترتيب, الرأس, حل مشكلة Push IDs في EN)، الثقة (الرأس + البطاقة 4 + أيقونات)، الهيرو (`heroMeta`)، معرض الصور (`item.link`)، وضع التحرير الإنجليزي (`enOverlay`).
8. **[متوسط — UX/Environment]:** استخدام `alert()` / `confirm()` في كلتا اللوحتين (محظور داخل iframe)، وتعبئة URL افتراضي في حقل `promoBanner.image` و`<input checked>` الثابت في `campaignEnabledToggle`.

---

## 17. خطة التنفيذ التصحيحية المقترحة (Proposed Corrective Implementation)

### المرحلة 1: إصلاح السيطرة الكاملة لـ Pink Friday (Problem A)
1. جعل `INITIAL_2026_CAMPAIGN.enabled = false` وتبديل رابط Unsplash، وجعل fallback `getPublishedPinkFridayCampaign()` مُعطلاً (`enabled: false, offers: [], collections: []`) مع دالة `invalidatePinkFridayCache()`.
2. تشديد `getCampaignStatus()` لاشتراط `campaign.enabled === true`، وإضافة `evaluatePinkFridayState()` لتمييز الـ 8 حالات، وإضافة `normalizePinkFridayOffer()` لحساب `expectedBasePrice` و`campaignPrice` بأمان.
3. تحديث `/api/pink-friday/admin.js` (دعم `action: 'unpublish'`, إبطال الكاش فوراً, التهيئة الآمنة `enabled: false`, تطبيع العروض، حفظ `i18n.en`)، و`public.js` (`Cache-Control: no-store` + `forceFresh = true`)، و`create-order.js` (`forceFresh = true`).
4. توحيد `public/assets/js/pink-friday.js` و`cart-client.ts` (`getCollectionById` + عدم تضارب خصم `onSale` العادي) و`AnnouncementBar.astro` و`PinkFridayHomeSection.astro` و`PinkFridayView.astro` و`adapters.ts`.
5. ترقية `/dashboard-pink-friday`: بطاقتا الحالة المنفصلتان (المسودة مقابل المنشور فعلياً بالموقع) + تنبيه التعارض + زر إيقاف فوري + محرر `i18n.en` + حساب فوري للأسعار + إزالة `alert()`/`confirm()` و`checked` الافتراضي.

### المرحلة 2: استكمال التخصيص الشامل والمزامنة العربية/الإنجليزية لـ Homepage Studio (Problem B)
1. إزالة تأخير الـ 30 ثانية من `homepage.ts` في الطلبات العادية (الاحتفاظ بالكاش كـ error fallback فقط) وتطبيع `sectionsVisibility`, `heroMeta`, `trustSection`, `categoriesSection`, `blogSection`, `reviewsSection`, `enOverlay`.
2. إزالة حاجز `aspectRatio >= 1.1` وتمرير صورة الموبايل مباشرة عبر `<picture><source media="(max-width: 767px)" ...>` في `HeroEditorial.astro` و`homepage-studio-client.ts`.
3. تحديث `src/scripts/homepage-studio.ts` و`src/i18n/content/adapters.ts` لدعم جميع الحقول المضافة + التوافق الخلفي + مطابقة التصنيفات بالـ Push ID والـ slug + دمج `homepage/enOverlay` مع `EN_HOMEPAGE_STUDIO_OVERLAY`.
4. تحديث `HomeView.astro` والمكونات (`HeroEditorial`, `TrustStripSection`, `CategoryDiscovery`, `FeaturedProducts`, `EditorialBrandStory`, `BlogHomeSection`, `ReviewsHomeSection`, `CustomStudioSection`) و`homepage-studio-client.ts` (`updateBlogDom`, `updateReviewsDom`, إلخ).
5. استكمال محررات `/dashboard-index`: مبدل `العربية | English`، مفتاح إظهار/إخفاء في كل محرر، استكمال حقول جميع الأقسام، `oninput` مع debounce للتراجع، وإزالة `confirm()`/`alert()`.

---

## 18. الملفات المتوقع تعديلها (Files Expected to Change)

- **Pink Friday:**
  - `src/utils/pink-friday-server.ts`
  - `src/config/pink-friday.ts`
  - `src/pages/api/pink-friday/admin.js`
  - `src/pages/api/pink-friday/public.js`
  - `src/pages/api/create-order.js`
  - `public/assets/js/pink-friday.js`
  - `src/pages/dashboard-pink-friday.astro`
  - `src/components/layout/AnnouncementBar.astro`
  - `src/components/home/PinkFridayHomeSection.astro`
  - `src/components/views/PinkFridayView.astro`
  - `src/scripts/cart-client.ts`
- **Homepage Studio & Localization:**
  - `src/utils/homepage.ts`
  - `src/scripts/homepage-studio.ts`
  - `src/scripts/homepage-studio-client.ts`
  - `src/i18n/content/adapters.ts`
  - `src/components/views/HomeView.astro`
  - `src/components/home/HeroEditorial.astro`
  - `src/components/home/TrustStripSection.astro`
  - `src/components/home/CategoryDiscovery.astro`
  - `src/components/home/FeaturedProducts.astro`
  - `src/components/home/EditorialBrandStory.astro`
  - `src/components/home/BlogHomeSection.astro`
  - `src/components/home/ReviewsHomeSection.astro`
  - `src/components/home/CustomStudioSection.astro`
  - `src/pages/dashboard-index.astro`
- **Tests & Documentation:**
  - `src/scripts/homepage-studio.test.ts`
  - `src/scripts/localization.test.ts`
  - `test/pink-friday.test.mjs`
  - `DANDY_ADMIN_STUDIO_SYNC_FINAL_REPORT_AR.md`

---

## 19. استراتيجية الاختبار والوقاية من التراجع (Regression and Testing Strategy)

1. **اختبارات الوحدة الحتمية (`node:test` عبر `npx --yes tsx --test` و`node --test`):**
   - تغطية مصفوفة حالات Pink Friday الثماني (disabled, unpublished, upcoming, active-full, offers-only, bundles-only, ended, empty/invalid) والتحقق من بقاء خصم `onSale` العادي فعالاً.
   - تغطية جميع دوال `homepage-studio.ts` و`adapters.ts` (الحقول الجديدة، عدم تدمير العربية/الإنجليزية، Push ID category overlay matching، `heroSlides`، `sectionsVisibility`).
2. **اختبارات المتصفح الفعلي (`playwright-cli` على `http://localhost:3000` مع عزل RTDB عبر `page.route`):**
   - فحص `/dashboard-pink-friday` و`/dashboard-index` و`/` و`/en/` و`/pink-friday` و`/en/pink-friday` و`/special-offers` و`/en/special-offers`.
   - فحص التفاعلات الحقيقية: إيقاف وتفعيل الحملة، المعاينة عبر `STUDIO_UPDATE_STATE`، تبديل لغة Studio AR/EN، حفظ وإعادة تحميل، وصور الموبايل الطولية.
   - فحص التجاوب ومنع التمرير الأفقي عند `390×844`، `430×932`، `768×1024`، `1024×768`، `1440×900`.
3. **بوابات التكامل النهائية:**
   - تشغيل `compile_applet` و`lint_applet`، والتحقق من مطابقة بصمات SHA-256 للملفات المحمية العشرة حرفياً مع خط الأساس المسجل، والتأكد من عدم تنفيذ `git commit` أو `git push` وعدم المساس ببيانات RTDB الإنتاجية.
