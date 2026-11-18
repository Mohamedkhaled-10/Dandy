/**
 * ============================================================================
 * DANDY COSMETICS — PHASE 10 MULTILINGUAL ARCHITECTURE TYPES
 * Shared TypeScript contracts for locale resolution, route counterpart mapping,
 * typed translation dictionaries, frontend-owned localized content adapters,
 * locale-aware SEO/hreflang, and translation completeness validation.
 * ============================================================================
 */

export type Locale = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

export interface LocaleConfig {
  code: Locale;
  htmlLang: Locale;
  dir: Direction;
  intlLocale: string;
  ogLocale: string;
  currencyCode: 'EGP';
  isDefault: boolean;
  routePrefix: '' | '/en';
  /** Controlled release flag: English stays unpublished throughout Phase 10. */
  isPubliclyPublished: boolean;
  labelNative: string;
  labelArabic: string;
  labelEnglish: string;
}

export type LocalizedRouteKind =
  | 'home'
  | 'catalog'
  | 'category'
  | 'product'
  | 'special-offers'
  | 'pink-friday'
  | 'cart'
  | 'invoice'
  | 'track-order'
  | 'account-login'
  | 'account-signup'
  | 'account'
  | 'blog'
  | 'blog-article'
  | 'client-reviews'
  | 'about-us'
  | 'contact-us'
  | 'help'
  | 'privacy-policy'
  | 'terms'
  | 'not-found'
  | 'legacy-redirect'
  | 'admin-excluded';

export interface RouteDefinition {
  id: string;
  kind: LocalizedRouteKind;
  arabicPattern: string;
  englishPattern: string | null;
  supportsSwitch: boolean;
  allowedQueryParams: readonly string[];
  preserveFragment: boolean;
  missingCounterpartFallback?: 'self-listing' | 'home';
  indexable: boolean;
  /** Whether the English counterpart route is published (false in Phase 10). */
  englishPublished: boolean;
}

export interface CounterpartAvailability {
  /** Override whether a translated entity (e.g. a specific article) exists in target locale. */
  targetEntityExists?: boolean;
  /** Optional target slug when translated slugs differ while sharing entity ID. */
  targetSlug?: string;
}

export interface RouteCounterpartResult {
  sourceLocale: Locale;
  targetLocale: Locale;
  routeKind: LocalizedRouteKind;
  sourcePath: string;
  targetPath: string;
  fullTargetUrl: string;
  preservedQueryParams: string[];
  strippedQueryParams: string[];
  usedFallback: boolean;
  fallbackReason?:
    | 'locale-unpublished'
    | 'counterpart-missing'
    | 'entity-untranslated'
    | 'route-excluded';
  isSwitchSafe: boolean;
  isCounterpartPublished: boolean;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};

export interface TranslationCatalog {
  common: {
    brandName: string;
    brandNameAr: string;
    currencyEgp: string;
    loading: string;
    retry: string;
    close: string;
    cancel: string;
    confirm: string;
    save: string;
    delete: string;
    edit: string;
    backToStore: string;
    viewAll: string;
    viewCart: string;
    addToCart: string;
    addedToCart: string;
    selectOption: string;
    outOfStock: string;
    inStock: string;
    discountBadge: string;
    saleBadge: string;
    bestSellerBadge: string;
    freeShippingLabel: string;
  };
  navigation: {
    home: string;
    shop: string;
    allProducts: string;
    categories: string;
    offers: string;
    specialOffers: string;
    pinkFriday: string;
    aboutUs: string;
    trackOrder: string;
    cart: string;
    account: string;
    login: string;
    signup: string;
    blog: string;
    reviews: string;
    help: string;
    contactUs: string;
    privacyPolicy: string;
    terms: string;
  };
  header: {
    menuTriggerLabel: string;
    searchTriggerLabel: string;
    searchPlaceholder: string;
    searchNoResults: string;
    loginTitle: string;
    accountTitle: string;
    logoutTitle: string;
    cartLabel: string;
    announcementFreeShipping: string;
    announcementPinkFriday: string;
  };
  footer: {
    regionLabel: string;
    editorialDesc: string;
    locationLabel: string;
    colShopping: string;
    colSupport: string;
    colBrand: string;
    copyrightSuffix: string;
  };
  home: {
    heroDefaultEyebrow: string;
    heroDefaultCta: string;
    featuredHeading: string;
    offersHeading: string;
    categoriesHeading: string;
    storyMoreCta: string;
    blogHeading: string;
    reviewsHeading: string;
  };
  catalog: {
    allProductsTitle: string;
    searchLabel: string;
    searchPlaceholder: string;
    clearSearch: string;
    filtersButton: string;
    resetFilters: string;
    resultsCountLabel: string;
    sortDefault: string;
    sortPriceAsc: string;
    sortPriceDesc: string;
    sortNameAsc: string;
    priceAll: string;
    priceUnder150: string;
    price150To300: string;
    priceOver300: string;
    filterSaleOnly: string;
    filterBestSellerOnly: string;
    filterInStockOnly: string;
    emptyTitle: string;
    emptyDesc: string;
  };
  categories: {
    skinCare: string;
    hairCare: string;
    bodyCare: string;
    fragrance: string;
    naturalCareFallback: string;
  };
  product: {
    galleryZoomLabel: string;
    wishlistAdd: string;
    wishlistRemove: string;
    scentsHeading: string;
    selectScentRequired: string;
    quantityLabel: string;
    highlightsHeading: string;
    descriptionOverview: string;
    descriptionFeatures: string;
    descriptionIngredients: string;
    descriptionUsage: string;
    descriptionResults: string;
    reviewsHeading: string;
    noReviewsYet: string;
    verifiedPurchaseBadge: string;
    relatedProductsHeading: string;
    routineGuideLabel: string;
    notFoundTitle: string;
  };
  cart: {
    pageTitle: string;
    stepBag: string;
    stepShipping: string;
    stepReview: string;
    emptyTitle: string;
    emptyCta: string;
    subtotalLabel: string;
    shippingLabel: string;
    totalLabel: string;
    freeShippingUnlocked: string;
    freeShippingRemainingPrefix: string;
    proceedToShipping: string;
    confirmOrderCta: string;
    removeConfirmTitle: string;
    codNotice: string;
  };
  checkout: {
    fullNameLabel: string;
    phoneLabel: string;
    emailOptionalLabel: string;
    governorateLabel: string;
    cityLabel: string;
    addressLabel: string;
    submitSuccessRedirect: string;
  };
  orders: {
    statusNew: string;
    statusProcessing: string;
    statusShipped: string;
    statusDelivered: string;
    statusCancelled: string;
    invoiceHeading: string;
    printInvoice: string;
    trackHeading: string;
    invoiceCodeLabel: string;
    lookupButton: string;
    notFoundError: string;
    whatsappInquiry: string;
  };
  account: {
    dashboardTitle: string;
    tabOverview: string;
    tabOrders: string;
    tabWishlist: string;
    tabAddresses: string;
    tabProfile: string;
    savedPhoneReadonlyHint: string;
    writeReviewCta: string;
  };
  auth: {
    loginHeading: string;
    signupHeading: string;
    emailLabel: string;
    passwordLabel: string;
    rememberMe: string;
    forgotPassword: string;
    submitLogin: string;
    submitSignup: string;
  };
  blog: {
    pageHeading: string;
    readArticle: string;
    relatedProductsHeading: string;
    relatedArticlesHeading: string;
    notFoundTitle: string;
  };
  reviews: {
    pageHeading: string;
    photoReviewsHeading: string;
    videoReviewsHeading: string;
    loadingReviews: string;
    errorLoadingReviews: string;
  };
  support: {
    aboutHeading: string;
    contactHeading: string;
    helpHeading: string;
    officialChannelsHeading: string;
    workingHoursLabel: string;
  };
  forms: {
    requiredField: string;
    invalidEmail: string;
    invalidEgyptPhone: string;
    minNameLength: string;
    minPasswordLength: string;
  };
  errors: {
    generic: string;
    networkError: string;
    pageNotFoundTitle: string;
    pageNotFoundDesc: string;
    productNotFound: string;
  };
  legal: {
    privacyHeading: string;
    termsHeading: string;
    consentStatusGranted: string;
    consentStatusDenied: string;
  };
  consent: {
    bannerTitle: string;
    bannerDesc: string;
    acceptMarketing: string;
    essentialOnly: string;
  };
}

type JoinDotPath<K extends string, P extends string> = `${K}.${P}`;

export type TranslationKey = {
  [Namespace in keyof TranslationCatalog]: Namespace extends string
    ? {
        [Field in keyof TranslationCatalog[Namespace]]: Field extends string
          ? JoinDotPath<Namespace, Field>
          : never;
      }[keyof TranslationCatalog[Namespace]]
    : never;
}[keyof TranslationCatalog];

export type MessageNamespace = keyof TranslationCatalog;

export interface TranslationLookupResult {
  key: string;
  locale: Locale;
  text: string;
  isTranslated: boolean;
  fallbackUsed: boolean;
  missingKey: boolean;
}

export interface ProductDescriptionLocalizedSection {
  id: 'overview' | 'features' | 'usage' | 'results' | 'ingredients' | 'routine';
  title: string;
  paragraphs: string[];
  bullets: string[];
}

export interface ProductLocalizedContent {
  /** Stable Firebase RTDB product key; required relational anchor. */
  productId: string;
  name: string;
  shortDescription?: string;
  description?: string;
  highlights?: string[];
  usageInstructions?: string[];
  ingredientsNote?: string;
  structuredSections?: ProductDescriptionLocalizedSection[];
  /** Variant translations keyed by variant ID (preserving cart/order IDs). */
  variantLabels?: Record<string, string>;
  seoTitle?: string;
  seoDescription?: string;
  slugOverride?: string;
}

export interface CategoryLocalizedContent {
  slug: string;
  name: string;
  h1Title: string;
  introText: string;
  seoTitle: string;
  seoDescription: string;
  shortTagline?: string;
}

export interface ArticleLocalizedContent {
  /** Stable Firestore document ID or canonical article slug. */
  articleId: string;
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  contentHtml: string;
  seoTitle?: string;
  seoDescription?: string;
  publishedInLocale: boolean;
}

export interface PinkFridayLocalizedOverlay {
  campaignId: string;
  title: string;
  subtitle: string;
  headline?: string;
  ctaText: string;
  badgeText: string;
  heroImageOverride?: string;
  collectionTextOverrides?: Record<
    string,
    {
      name?: string;
      description?: string;
      badgeText?: string;
    }
  >;
}

export interface HomepageStudioLocalizedOverlay {
  locale: Locale;
  heroSlides?: Record<
    number,
    {
      title?: string;
      subtitle?: string;
      buttonText?: string;
      link?: string;
      desktopImage?: string;
      mobileImage?: string;
    }
  >;
  trustItems?: {
    item1?: { title?: string; desc?: string };
    item2?: { title?: string; desc?: string };
    item3?: { title?: string; desc?: string };
  };
  sections?: Record<
    string,
    {
      title?: string;
      subtitle?: string;
      viewAllLabel?: string;
    }
  >;
  promoBanner?: {
    eyebrow?: string;
    title?: string;
    desc?: string;
    ctaText?: string;
    ctaLink?: string;
  };
  categories?: Record<
    string,
    {
      name?: string;
      tagline?: string;
      count?: string;
    }
  >;
  reviews?: Record<
    number,
    {
      author?: string;
      text?: string;
    }
  >;
  customSections?: Record<
    string,
    {
      title?: string;
      subtitle?: string;
      content?: string;
      eyebrow?: string;
      desc?: string;
      ctaText?: string;
      ctaLink?: string;
      linkText?: string;
      linkUrl?: string;
      items?: Record<
        number,
        {
          title?: string;
          desc?: string;
          q?: string;
          a?: string;
          link?: string;
        }
      >;
    }
  >;
}

export interface HreflangAlternate {
  hreflang: Locale | 'x-default';
  href: string;
}

export interface LocalizedSeoMetadata {
  locale: Locale;
  dir: Direction;
  title: string;
  description: string;
  keywords?: string;
  canonical: string;
  robots: string;
  ogLocale: string;
  ogLocaleAlternates: string[];
  alternates: HreflangAlternate[];
}

export interface TranslationCompletenessReport {
  targetLocale: Locale;
  checkedAtIso: string;
  readyForPublication: boolean;
  uiDictionary: {
    totalSourceKeys: number;
    translatedKeysCount: number;
    missingKeys: string[];
    completionRatio: number;
  };
  categories: {
    totalCategories: number;
    translatedCount: number;
    missingSlugs: string[];
    incompleteFields: Array<{ slug: string; missingFields: string[] }>;
  };
  products: {
    totalActiveProducts: number;
    translatedCount: number;
    missingProductIds: string[];
    incompleteProducts: Array<{ productId: string; missingFields: string[] }>;
  };
  articles: {
    totalPublishedArticles: number;
    translatedCount: number;
    missingArticleIds: string[];
  };
  routes: {
    totalIndexableRoutes: number;
    mappedRoutesCount: number;
    unmappedRouteIds: string[];
  };
  sharedCommerceExemptions: readonly string[];
}

export interface LanguageSwitcherContract {
  mountTargets: readonly ['desktop-header-end', 'mobile-nav-drawer'];
  preferenceStorageKey: string;
  neverMutateOnSwitch: readonly [
    'localStorage.cart',
    'localStorage.dandy_cart',
    'firebase.auth.currentUser',
    'product.price',
    'product.id',
    'order.records',
  ];
  autoRedirectByBrowserOrIp: false;
  urlPrecedesStoredPreference: true;
  requiresPublishedCounterpartBeforeHreflang: true;
}
