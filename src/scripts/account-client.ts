/**
 * ============================================================================
 * DANDY COSMETICS — CUSTOMER ACCOUNT CLIENT CONTROLLER (PHASE 8)
 * Powers /account safely:
 *   - Firebase Auth guard (redirects unauthenticated users to /account-login)
 *   - Semantic tabs (Overview, Orders, Wishlist, Addresses, Profile)
 *   - Orders list with collection sub-items, invoice/track links & verified reviews
 *   - Wishlist rendered with full ProductCard visual & cart parity
 *   - Saved Addresses CRUD via native <dialog> + delete confirmation <dialog>
 *   - Personal Info (editable name, verified read-only phone per RTDB rule, reset password)
 *   - Zero window.alert / window.confirm; all feedback via DandyToast & inline status
 * ============================================================================
 */

import { getIconSvg } from './icons';
import {
  computeAccountStats,
  extractCustomerInitial,
  formatCustomerOrderViewModel,
  isOrderStatusDelivered,
  mapFirebaseAuthError,
  normalizeCustomerAddress,
  ratingDescriptionLabel,
  resolveWishlistCardModel,
  sortAddressesDefaultFirst,
  validateAddressInput,
  type CustomerOrderViewModel,
  type NormalizedCustomerAddress,
} from './account';
import { escapeHtml, parseCartArrayFromStrings } from './purchase-flow';
import { formatEgpPrice, type ProductCardViewModel } from './product-card';

type AccountTabKey = 'overview' | 'orders' | 'wishlist' | 'addresses' | 'profile';

interface ReviewRecord {
  rating: number;
  comment?: string;
  customerName?: string;
  orderId?: string;
  createdAt?: number;
}

function getRuntimeLocale(): 'ar' | 'en' {
  if (typeof document !== 'undefined') {
    const lang = (document.documentElement.getAttribute('lang') || '').trim().toLowerCase();
    if (lang.startsWith('en')) return 'en';
  }
  if (typeof window !== 'undefined') {
    const p = (window.location.pathname || '/').toLowerCase();
    if (p === '/en' || p.startsWith('/en/')) return 'en';
  }
  return 'ar';
}

declare global {
  interface Window {
    auth?: any;
    db?: any;
    updateSharedCartCount?: () => void;
    DandyMeta?: {
      trackAddToCart?: (payload: Record<string, unknown>) => void;
    };
  }
}

export function initCustomerAccountPage(): void {
  const mainContainer = document.getElementById('accountMainContainer');
  if (!mainContainer || mainContainer.dataset.bound === 'true') return;
  mainContainer.dataset.bound = 'true';

  const locale = getRuntimeLocale();
  const isEn = locale === 'en';
  const loginHref = isEn ? '/en/account-login' : '/account-login';
  const catalogHref = isEn ? '/en/all-products' : '/all-products';
  const prefix = isEn ? '/en' : '';

  const auth = window.auth || (typeof (window as any).firebase !== 'undefined' ? (window as any).firebase.auth() : null);
  const db = window.db || (typeof (window as any).firebase !== 'undefined' ? (window as any).firebase.database() : null);

  if (!auth || !db) {
    window.location.href = loginHref;
    return;
  }

  let currentUser: any = null;
  let cachedProfile: { name?: string; email?: string; phone?: string } = {};
  let cachedOrders: CustomerOrderViewModel[] = [];
  let cachedAddresses: Record<string, NormalizedCustomerAddress> = {};
  let cachedWishlistIds: string[] = [];
  let wishlistModels = new Map<string, ProductCardViewModel>();
  let userReviews: Record<string, ReviewRecord> = {};

  let activeReviewProductId: string | null = null;
  let activeReviewOrderId: string | null = null;
  let activeReviewRating = 5;
  let pendingDeleteAddressKey: string | null = null;
  let lastTriggerEl: HTMLElement | null = null;

  const loadingOverlay = document.getElementById('accountLoading');
  const accountContent = document.getElementById('accountContent');

  // Dialog elements
  const addressDialog = document.getElementById('addressDialog') as HTMLDialogElement | null;
  const addressForm = document.getElementById('addressForm') as HTMLFormElement | null;
  const addressFormError = document.getElementById('addressFormError');
  const deleteAddressDialog = document.getElementById('addressDeleteDialog') as HTMLDialogElement | null;
  const reviewDialog = document.getElementById('reviewDialog') as HTMLDialogElement | null;
  const reviewForm = document.getElementById('productReviewForm') as HTMLFormElement | null;

  function notify(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    if (window.DandyToast) {
      window.DandyToast.show({ message, type });
    }
  }

  function openDialogClean(dialog: HTMLDialogElement | null, trigger?: HTMLElement | null): void {
    if (!dialog) return;
    lastTriggerEl = trigger || (document.activeElement as HTMLElement | null);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', 'true');
    }
  }

  function closeDialogClean(dialog: HTMLDialogElement | null): void {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    if (lastTriggerEl && typeof lastTriggerEl.focus === 'function') {
      lastTriggerEl.focus();
    }
    lastTriggerEl = null;
  }

  [addressDialog, deleteAddressDialog, reviewDialog].forEach((dlg) => {
    dlg?.addEventListener('click', (e) => {
      if (e.target === dlg) closeDialogClean(dlg);
    });
    dlg?.addEventListener('close', () => {
      if (lastTriggerEl && typeof lastTriggerEl.focus === 'function') {
        lastTriggerEl.focus();
      }
      lastTriggerEl = null;
    });
  });

  // --------------------------------------------------------------------------
  // Tab Switcher (Accessible tablist + URL hash awareness)
  // --------------------------------------------------------------------------
  const tabBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-account-tab]'));
  const tabPanels = Array.from(document.querySelectorAll<HTMLElement>('[data-account-panel]'));

  function switchTab(tabKey: AccountTabKey): void {
    tabBtns.forEach((btn) => {
      const isMatch = btn.getAttribute('data-account-tab') === tabKey;
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      btn.tabIndex = isMatch ? 0 : -1;
    });

    tabPanels.forEach((panel) => {
      const isMatch = panel.getAttribute('data-account-panel') === tabKey;
      panel.hidden = !isMatch;
      panel.classList.toggle('is-active', isMatch);
    });
  }

  tabBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-account-tab') as AccountTabKey | null;
      if (key) switchTab(key);
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') {
        return;
      }
      e.preventDefault();
      let nextIdx = idx;
      if (e.key === 'ArrowLeft') nextIdx = (idx + 1) % tabBtns.length;
      if (e.key === 'ArrowRight') nextIdx = (idx - 1 + tabBtns.length) % tabBtns.length;
      if (e.key === 'Home') nextIdx = 0;
      if (e.key === 'End') nextIdx = tabBtns.length - 1;
      const target = tabBtns[nextIdx];
      target?.focus();
      const key = target?.getAttribute('data-account-tab') as AccountTabKey | null;
      if (key) switchTab(key);
    });
  });

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const jumpTrigger = target?.closest<HTMLElement>('[data-jump-tab]');
    if (jumpTrigger) {
      const tab = jumpTrigger.getAttribute('data-jump-tab') as AccountTabKey | null;
      if (tab) {
        switchTab(tab);
        document.getElementById('accountTabsBar')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  });

  // --------------------------------------------------------------------------
  // Auth Guard & Initial Hydration
  // --------------------------------------------------------------------------
  auth.onAuthStateChanged(async (user: any) => {
    if (!user) {
      window.location.href = loginHref;
      return;
    }
    currentUser = user;

    if (loadingOverlay) loadingOverlay.hidden = true;
    if (accountContent) accountContent.hidden = false;

    await Promise.all([loadProfile(), loadOrders(), loadAddresses(), loadWishlist()]);
    renderOverviewSummary();
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try {
      await auth.signOut();
      window.location.href = loginHref;
    } catch {
      notify(isEn ? 'Unable to sign out. Please try again.' : 'تعذر تسجيل الخروج. يرجى المحاولة مرة أخرى.', 'error');
    }
  });

  // --------------------------------------------------------------------------
  // 1. Profile
  // --------------------------------------------------------------------------
  async function loadProfile(): Promise<void> {
    const emailEl = document.getElementById('customerEmailText');
    const greetingEl = document.getElementById('customerGreetingName');
    const avatarEl = document.getElementById('customerAvatar');

    const profNameInput = document.getElementById('profName') as HTMLInputElement | null;
    const profEmailInput = document.getElementById('profEmail') as HTMLInputElement | null;
    const profPhoneInput = document.getElementById('profPhone') as HTMLInputElement | null;

    if (emailEl) emailEl.textContent = currentUser.email || '';
    if (profEmailInput) profEmailInput.value = currentUser.email || '';

    try {
      const snap = await db.ref(`customers/${currentUser.uid}`).once('value');
      if (snap.exists()) {
        cachedProfile = snap.val() || {};
      }
    } catch (err) {
      console.warn('Error fetching customer profile:', err);
    }

    const name = String(cachedProfile.name || currentUser.displayName || '').trim();
    const phone = String(cachedProfile.phone || '').trim();

    if (greetingEl) {
      greetingEl.textContent = isEn
        ? name
          ? `Welcome, ${name}`
          : 'Welcome to your account'
        : name
          ? `أهلاً بكِ، ${name}`
          : 'مرحباً بكِ في حسابكِ';
    }
    if (avatarEl) {
      avatarEl.textContent = extractCustomerInitial(name, currentUser.email);
    }
    if (profNameInput) profNameInput.value = name;
    if (profPhoneInput) profPhoneInput.value = phone || (isEn ? 'Not registered' : 'غير مسجل');
  }

  const profileForm = document.getElementById('profileForm') as HTMLFormElement | null;
  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const profNameInput = document.getElementById('profName') as HTMLInputElement | null;
    const saveProfileBtn = document.getElementById('saveProfileBtn') as HTMLButtonElement | null;
    const newName = (profNameInput?.value || '').trim();

    if (newName.length < 3) {
      notify(
        isEn ? 'Please enter your full name (at least 3 characters).' : 'يرجى إدخال الاسم الكامل (3 أحرف على الأقل).',
        'error'
      );
      profNameInput?.focus();
      return;
    }

    if (saveProfileBtn) {
      saveProfileBtn.disabled = true;
      saveProfileBtn.textContent = isEn ? 'Saving...' : 'جاري الحفظ...';
    }

    try {
      const fb = (window as any).firebase;
      await db.ref(`customers/${currentUser.uid}`).update({
        name: newName,
        updatedAt: fb?.database?.ServerValue?.TIMESTAMP || Date.now(),
      });
      cachedProfile.name = newName;
      const greetingEl = document.getElementById('customerGreetingName');
      const avatarEl = document.getElementById('customerAvatar');
      if (greetingEl) greetingEl.textContent = isEn ? `Welcome, ${newName}` : `أهلاً بكِ، ${newName}`;
      if (avatarEl) avatarEl.textContent = extractCustomerInitial(newName, currentUser.email);
      notify(isEn ? 'Account name updated successfully.' : 'تم تحديث اسم الحساب بنجاح.', 'success');
    } catch (err) {
      console.error('Profile update error:', err);
      notify(isEn ? 'Unable to update details. Please try again.' : 'تعذر تحديث البيانات. يرجى المحاولة مرة أخرى.', 'error');
    } finally {
      if (saveProfileBtn) {
        saveProfileBtn.disabled = false;
        saveProfileBtn.textContent = isEn ? 'Save Changes' : 'حفظ التغييرات';
      }
    }
  });

  document.getElementById('sendResetPasswordBtn')?.addEventListener('click', async () => {
    if (!currentUser?.email) return;
    const btn = document.getElementById('sendResetPasswordBtn') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try {
      await auth.sendPasswordResetEmail(currentUser.email);
      notify(
        isEn
          ? `Password reset link sent to ${currentUser.email}`
          : `تم إرسال رابط تغيير كلمة المرور إلى ${currentUser.email}`,
        'success'
      );
    } catch (err: any) {
      notify(mapFirebaseAuthError(err?.code, 'reset', locale), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // --------------------------------------------------------------------------
  // 2. Stats & Overview Summary
  // --------------------------------------------------------------------------
  function syncStatCounters(): void {
    const stats = computeAccountStats({
      orders: cachedOrders.length,
      wishlist: cachedWishlistIds.length,
      addresses: Object.keys(cachedAddresses).length,
    });

    const map: Record<string, number> = {
      ordersCountBadge: stats.ordersCount,
      wishlistCountBadge: stats.wishlistCount,
      addressesCountBadge: stats.addressesCount,
      overviewOrdersCount: stats.ordersCount,
      overviewWishlistCount: stats.wishlistCount,
      overviewAddressesCount: stats.addressesCount,
    };

    Object.entries(map).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value);
    });
  }

  function renderOverviewSummary(): void {
    syncStatCounters();

    const latestOrderBox = document.getElementById('overviewLatestOrder');
    if (latestOrderBox) {
      const latest = cachedOrders[0];
      if (!latest) {
        latestOrderBox.innerHTML = `
          <p class="dandy-ov-empty">${isEn ? 'No orders placed yet.' : 'لا توجد طلبات مسجلة حتى الآن.'}</p>
          <a href="${catalogHref}" class="dandy-btn dandy-btn--outline">${isEn ? 'Browse Products' : 'تصفح المنتجات'}</a>
        `;
      } else {
        latestOrderBox.innerHTML = `
          <div class="dandy-ov-order-head">
            <div>
              <span class="dandy-ov-code dandy-tabular">#${escapeHtml(latest.code)}</span>
              <div class="dandy-ov-date">${escapeHtml(latest.dateLabel)}</div>
            </div>
            <span class="dandy-status-badge is-${escapeHtml(latest.statusMeta.badgeTone)}">${escapeHtml(latest.statusMeta.label)}</span>
          </div>
          <div class="dandy-ov-order-meta">
            <span>${isEn ? 'Total:' : 'الإجمالي:'} <strong class="dandy-tabular">${formatEgpPrice(latest.totalAmount, locale)}</strong></span>
            ${latest.governorateAr ? `<span>· ${escapeHtml(latest.governorateAr)}</span>` : ''}
          </div>
          <div class="dandy-ov-actions">
            <a href="${escapeHtml(latest.trackHref)}" class="dandy-btn dandy-btn--outline">${isEn ? 'Track Order' : 'تتبع الطلب'}</a>
            <button type="button" class="dandy-btn dandy-btn--editorial" data-jump-tab="orders">${isEn ? 'View All Orders' : 'عرض كل الطلبات'}</button>
          </div>
        `;
      }
    }

    const defaultAddressBox = document.getElementById('overviewDefaultAddress');
    if (defaultAddressBox) {
      const sorted = sortAddressesDefaultFirst(Object.values(cachedAddresses));
      const primary = sorted[0];
      if (!primary) {
        defaultAddressBox.innerHTML = `
          <p class="dandy-ov-empty">${isEn ? 'You have not saved any delivery addresses yet.' : 'لم تقومي بحفظ أي عنوان توصيل بعد.'}</p>
          <button type="button" class="dandy-btn dandy-btn--outline" data-jump-tab="addresses">${isEn ? 'Add Address' : 'إضافة عنوان'}</button>
        `;
      } else {
        defaultAddressBox.innerHTML = `
          <div class="dandy-ov-addr-title">
            <strong>${escapeHtml(primary.label)}</strong>
            ${primary.isDefault ? `<span class="dandy-ov-default-tag">${isEn ? 'Default Address' : 'العنوان الافتراضي'}</span>` : ''}
          </div>
          <p class="dandy-ov-addr-lines">
            ${escapeHtml(primary.governorateAr)}${primary.city ? ` · ${escapeHtml(primary.city)}` : ''}<br />
            ${escapeHtml(primary.street)}
          </p>
          <button type="button" class="dandy-btn dandy-btn--outline" data-jump-tab="addresses">${isEn ? 'Manage Addresses' : 'إدارة العناوين'}</button>
        `;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. Orders History & Verified Reviews
  // --------------------------------------------------------------------------
  async function loadOrders(): Promise<void> {
    const loadingEl = document.getElementById('ordersLoading');
    const container = document.getElementById('ordersContainer');
    const emptyEl = document.getElementById('ordersEmpty');

    try {
      const snap = await db.ref('orders').orderByChild('customerId').equalTo(currentUser.uid).once('value');
      if (loadingEl) loadingEl.hidden = true;

      if (!snap.exists()) {
        cachedOrders = [];
        if (container) container.hidden = true;
        if (emptyEl) emptyEl.hidden = false;
        renderOverviewSummary();
        return;
      }

      const rawOrders = snap.val() || {};
      const models = Object.entries(rawOrders)
        .map(([id, rec]) => formatCustomerOrderViewModel(id, rec as any, locale))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);

      const deliveredIds = new Set<string>();
      models.forEach((ord) => {
        if (!ord.isDelivered) return;
        ord.items.forEach((it) => {
          if (it.productId) deliveredIds.add(it.productId);
        });
      });

      if (deliveredIds.size > 0) {
        await Promise.all(
          Array.from(deliveredIds).map(async (pid) => {
            try {
              const revSnap = await db.ref(`reviews/${pid}/${currentUser.uid}`).once('value');
              if (revSnap.exists()) {
                userReviews[pid] = revSnap.val();
              }
            } catch (revErr) {
              console.warn('Error fetching review:', pid, revErr);
            }
          })
        );
      }

      cachedOrders = models;
      renderOrdersList(models);
      renderOverviewSummary();
    } catch (err) {
      console.error('Error loading orders:', err);
      if (loadingEl) loadingEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
    }
  }

  function renderOrdersList(orders: CustomerOrderViewModel[]): void {
    const container = document.getElementById('ordersContainer');
    const emptyEl = document.getElementById('ordersEmpty');
    if (!container || !emptyEl) return;

    if (orders.length === 0) {
      container.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    container.innerHTML = orders
      .map((ord) => {
        const itemsHtml = ord.items
          .map((item) => {
            const subItemsHtml =
              item.collectionItems.length > 0
                ? `<ul class="dandy-ord-subitems">
                    ${item.collectionItems
                      .map(
                        (sub) =>
                          `<li>${escapeHtml(sub.productName)}${sub.variantName ? ` <span>(${escapeHtml(sub.variantName)})</span>` : ''}</li>`
                      )
                      .join('')}
                  </ul>`
                : '';

            let reviewBtn = '';
            if (ord.isDelivered && item.productId && !item.isCollection) {
              const existing = userReviews[item.productId];
              reviewBtn = `
                <button
                  type="button"
                  class="dandy-btn ${existing ? 'dandy-btn--outline' : 'dandy-btn--primary'} dandy-ord-review-btn"
                  data-open-review
                  data-product-id="${escapeHtml(item.productId)}"
                  data-product-name="${escapeHtml(item.name)}"
                  data-order-code="${escapeHtml(ord.code)}"
                  data-product-img="${escapeHtml(item.image)}"
                >
                  ${getIconSvg('star', { size: 15, strokeWidth: 1.9 })}
                  <span>${
                    existing
                      ? isEn
                        ? `Edit Review (${existing.rating}/5)`
                        : `تعديل التقييم (${existing.rating}/5)`
                      : isEn
                        ? 'Rate Product'
                        : 'قيّمي المنتج'
                  }</span>
                </button>
              `;
            }

            return `
              <div class="dandy-ord-item-row">
                <img
                  src="${escapeHtml(item.image)}"
                  alt="${escapeHtml(item.name)}"
                  class="dandy-ord-thumb"
                  width="56"
                  height="56"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  onerror="this.onerror=null;this.src='/assets/images/logo.png';"
                />
                <div class="dandy-ord-item-info">
                  <div class="dandy-ord-item-title">${escapeHtml(item.name)}</div>
                  <div class="dandy-ord-item-meta dandy-tabular">
                    <span>${isEn ? 'Qty:' : 'الكمية:'} ${item.quantity}</span>
                    <span aria-hidden="true">·</span>
                    <span>${formatEgpPrice(item.lineTotal, locale)}</span>
                    ${item.variants ? `<span aria-hidden="true">·</span><span>${escapeHtml(item.variants.label)}: ${escapeHtml(item.variants.text)}</span>` : ''}
                  </div>
                  ${subItemsHtml}
                </div>
                ${reviewBtn}
              </div>
            `;
          })
          .join('');

        return `
          <article class="dandy-order-card">
            <header class="dandy-order-head">
              <div>
                <div class="dandy-order-code dandy-tabular">${isEn ? 'Order' : 'طلب'} #${escapeHtml(ord.code)}</div>
                <div class="dandy-order-date">${escapeHtml(ord.dateLabel)}</div>
              </div>
              <span class="dandy-status-badge is-${escapeHtml(ord.statusMeta.badgeTone)}">
                ${escapeHtml(ord.statusMeta.label)}
              </span>
            </header>

            <div class="dandy-order-summary-row">
              <div>
                <span class="dandy-order-label">${isEn ? 'Order Total' : 'إجمالي الفاتورة'}</span>
                <strong class="dandy-order-total dandy-tabular">${formatEgpPrice(ord.totalAmount, locale)}</strong>
              </div>
              <div>
                <span class="dandy-order-label">${isEn ? 'Items' : 'عدد العناصر'}</span>
                <strong class="dandy-tabular">${ord.items.length}</strong>
              </div>
              <div>
                <span class="dandy-order-label">${isEn ? 'Destination' : 'الوجهة'}</span>
                <strong>${escapeHtml(ord.governorateAr || '—')}${ord.city ? ` - ${escapeHtml(ord.city)}` : ''}</strong>
              </div>
            </div>

            ${itemsHtml ? `<div class="dandy-order-items">${itemsHtml}</div>` : ''}

            <footer class="dandy-order-foot">
              <a href="${escapeHtml(ord.invoiceHref)}" class="dandy-btn dandy-btn--editorial">
                ${getIconSvg('receipt', { size: 16, strokeWidth: 1.85 })}
                <span>${isEn ? 'View Invoice' : 'عرض الفاتورة'}</span>
              </a>
              <a href="${escapeHtml(ord.trackHref)}" class="dandy-btn dandy-btn--outline">
                ${getIconSvg('truck', { size: 16, strokeWidth: 1.85 })}
                <span>${isEn ? 'Track Order' : 'تتبع الطلب'}</span>
              </a>
            </footer>
          </article>
        `;
      })
      .join('');

    container.hidden = false;
    emptyEl.hidden = true;
  }

  // Verified Purchase Review Dialog
  function updateStarsUI(rating: number): void {
    const stars = document.querySelectorAll<HTMLButtonElement>('#reviewStarsContainer .dandy-star-btn');
    stars.forEach((btn) => {
      const val = Number.parseInt(btn.getAttribute('data-val') || '0', 10);
      const isActive = val <= rating;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-checked', val === rating ? 'true' : 'false');
    });
    const descEl = document.getElementById('reviewRatingDesc');
    if (descEl) {
      descEl.textContent = `${ratingDescriptionLabel(rating, locale)} (${rating}/5)`;
    }
  }

  function openReviewDialog(
    trigger: HTMLElement,
    productId: string,
    productName: string,
    orderCode: string,
    productImg: string
  ): void {
    activeReviewProductId = productId;
    activeReviewOrderId = orderCode;

    const titleEl = document.getElementById('reviewModalTitle');
    const nameEl = document.getElementById('reviewProductName');
    const thumbEl = document.getElementById('reviewProductThumb') as HTMLImageElement | null;
    const orderRefEl = document.getElementById('reviewOrderRef');
    const commentEl = document.getElementById('reviewComment') as HTMLTextAreaElement | null;
    const submitLabel = document.getElementById('saveReviewBtnLabel');

    if (nameEl) nameEl.textContent = productName || (isEn ? 'DANDY Product' : 'منتج داندي');
    if (thumbEl) thumbEl.src = productImg || '/assets/images/logo.png';
    if (orderRefEl) orderRefEl.textContent = isEn ? `Order: #${orderCode}` : `طلب رقم: #${orderCode}`;

    const existing = userReviews[productId];
    if (existing) {
      if (titleEl) titleEl.textContent = isEn ? 'Edit Your Product Review' : 'تعديل تقييمكِ للمنتج';
      if (submitLabel) submitLabel.textContent = isEn ? 'Update Review' : 'تحديث التقييم';
      activeReviewRating = Number(existing.rating) || 5;
      if (commentEl) commentEl.value = existing.comment || '';
    } else {
      if (titleEl) titleEl.textContent = isEn ? 'Rate Product' : 'تقييم المنتج';
      if (submitLabel) submitLabel.textContent = isEn ? 'Submit Review' : 'إرسال التقييم';
      activeReviewRating = 5;
      if (commentEl) commentEl.value = '';
    }

    updateStarsUI(activeReviewRating);
    openDialogClean(reviewDialog, trigger);
  }

  document.querySelectorAll<HTMLButtonElement>('#reviewStarsContainer .dandy-star-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeReviewRating = Number.parseInt(btn.getAttribute('data-val') || '5', 10);
      updateStarsUI(activeReviewRating);
    });
  });

  document.getElementById('closeReviewModalBtn')?.addEventListener('click', () => closeDialogClean(reviewDialog));
  document.getElementById('cancelReviewBtn')?.addEventListener('click', () => closeDialogClean(reviewDialog));

  document.getElementById('ordersContainer')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest<HTMLButtonElement>('[data-open-review]');
    if (!btn) return;
    openReviewDialog(
      btn,
      btn.getAttribute('data-product-id') || '',
      btn.getAttribute('data-product-name') || '',
      btn.getAttribute('data-order-code') || '',
      btn.getAttribute('data-product-img') || '/assets/images/logo.png'
    );
  });

  reviewForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser || !activeReviewProductId) return;

    const commentText = ((document.getElementById('reviewComment') as HTMLTextAreaElement | null)?.value || '').trim();
    const customerName =
      cachedProfile.name ||
      currentUser.displayName ||
      (currentUser.email ? currentUser.email.split('@')[0] : isEn ? 'DANDY Customer' : 'عميلة داندي');
    const saveBtn = document.getElementById('saveReviewBtn') as HTMLButtonElement | null;
    const submitLabel = document.getElementById('saveReviewBtnLabel');
    const prevText = submitLabel?.textContent || (isEn ? 'Submit Review' : 'إرسال التقييم');

    if (saveBtn) saveBtn.disabled = true;
    if (submitLabel) submitLabel.textContent = isEn ? 'Saving...' : 'جاري الحفظ...';

    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch('/api/submit-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          productId: activeReviewProductId,
          rating: activeReviewRating,
          comment: commentText,
          customerName,
          orderId: activeReviewOrderId || 'N/A',
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || (isEn ? 'Failed to save review.' : 'فشل حفظ التقييم.'));
      }

      userReviews[activeReviewProductId] = {
        rating: activeReviewRating,
        comment: commentText,
        customerName,
        orderId: activeReviewOrderId || 'N/A',
        createdAt: Date.now(),
      };

      closeDialogClean(reviewDialog);
      renderOrdersList(cachedOrders);
      notify(
        isEn ? 'Your review has been saved! Thank you for sharing.' : 'تم حفظ تقييمكِ بنجاح! شكراً لمشاركة تجربتكِ.',
        'success'
      );
    } catch (err: any) {
      notify(err?.message || (isEn ? 'An error occurred while saving your review.' : 'حدث خطأ أثناء حفظ التقييم.'), 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (submitLabel) submitLabel.textContent = prevText;
    }
  });

  // --------------------------------------------------------------------------
  // 4. Saved Addresses CRUD (<dialog> + /cart compatibility)
  // --------------------------------------------------------------------------
  async function loadAddresses(): Promise<void> {
    const loadingEl = document.getElementById('addressesLoading');
    const container = document.getElementById('addressesContainer');
    const emptyEl = document.getElementById('addressesEmpty');

    try {
      const snap = await db.ref(`customers/${currentUser.uid}/addresses`).once('value');
      if (loadingEl) loadingEl.hidden = true;

      cachedAddresses = {};
      if (snap.exists()) {
        const raw = snap.val() || {};
        Object.entries(raw).forEach(([key, val]) => {
          cachedAddresses[key] = normalizeCustomerAddress(key, val as any, locale);
        });
      }

      renderAddressesList();
      renderOverviewSummary();
    } catch (err) {
      console.error('Error loading addresses:', err);
      if (loadingEl) loadingEl.hidden = true;
      if (container) container.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
    }
  }

  function renderAddressesList(): void {
    const container = document.getElementById('addressesContainer');
    const emptyEl = document.getElementById('addressesEmpty');
    if (!container || !emptyEl) return;

    const list = sortAddressesDefaultFirst(Object.values(cachedAddresses));
    if (list.length === 0) {
      container.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    container.innerHTML = list
      .map(
        (addr) => `
        <article class="dandy-addr-card ${addr.isDefault ? 'is-default' : ''}">
          <div class="dandy-addr-top">
            <h3 class="dandy-addr-title">
              ${getIconSvg('map-pin', { size: 16, strokeWidth: 1.85 })}
              <span>${escapeHtml(addr.label)}</span>
            </h3>
            ${addr.isDefault ? `<span class="dandy-addr-default-flag">${isEn ? 'Default' : 'افتراضي'}</span>` : ''}
          </div>
          <div class="dandy-addr-body">
            <div><strong>${isEn ? 'Governorate:' : 'المحافظة:'}</strong> ${escapeHtml(addr.governorateAr)}</div>
            <div><strong>${isEn ? 'City / District:' : 'المدينة / الحي:'}</strong> ${escapeHtml(addr.city)}</div>
            <div><strong>${isEn ? 'Address:' : 'العنوان:'}</strong> ${escapeHtml(addr.street)}</div>
          </div>
          <div class="dandy-addr-actions">
            <button type="button" class="dandy-btn dandy-btn--outline" data-addr-edit="${escapeHtml(addr.id)}">
              ${getIconSvg('pencil', { size: 14, strokeWidth: 1.85 })}
              <span>${isEn ? 'Edit' : 'تعديل'}</span>
            </button>
            ${
              !addr.isDefault
                ? `<button type="button" class="dandy-btn dandy-btn--outline" data-addr-default="${escapeHtml(addr.id)}">${isEn ? 'Set as Default' : 'تعيين كافتراضي'}</button>`
                : ''
            }
            <button type="button" class="dandy-btn dandy-btn--outline dandy-addr-del-btn" data-addr-delete="${escapeHtml(addr.id)}">
              ${getIconSvg('trash', { size: 14, strokeWidth: 1.85 })}
              <span>${isEn ? 'Delete' : 'حذف'}</span>
            </button>
          </div>
        </article>
      `
      )
      .join('');

    container.hidden = false;
    emptyEl.hidden = true;
  }

  function openAddressModal(trigger: HTMLElement | null, editKey = ''): void {
    if (addressFormError) {
      addressFormError.hidden = true;
      addressFormError.textContent = '';
    }

    const titleEl = document.getElementById('modalTitle');
    const editIdEl = document.getElementById('editAddressId') as HTMLInputElement | null;
    const labelEl = document.getElementById('addrLabel') as HTMLInputElement | null;
    const govEl = document.getElementById('addrGov') as HTMLSelectElement | null;
    const cityEl = document.getElementById('addrCity') as HTMLInputElement | null;
    const detailEl = document.getElementById('addrDetail') as HTMLTextAreaElement | null;
    const defaultEl = document.getElementById('addrIsDefault') as HTMLInputElement | null;

    const existing = editKey ? cachedAddresses[editKey] : null;
    if (existing) {
      if (titleEl) titleEl.textContent = isEn ? 'Edit Address' : 'تعديل العنوان';
      if (editIdEl) editIdEl.value = existing.id;
      if (labelEl) labelEl.value = existing.label;
      if (govEl) govEl.value = existing.governorate;
      if (cityEl) cityEl.value = existing.city;
      if (detailEl) detailEl.value = existing.street;
      if (defaultEl) defaultEl.checked = existing.isDefault;
    } else {
      addressForm?.reset();
      if (titleEl) titleEl.textContent = isEn ? 'Add New Address' : 'إضافة عنوان جديد';
      if (editIdEl) editIdEl.value = '';
      if (defaultEl) defaultEl.checked = Object.keys(cachedAddresses).length === 0;
    }

    openDialogClean(addressDialog, trigger);
  }

  document.getElementById('openAddAddressModalBtn')?.addEventListener('click', (e) => {
    openAddressModal(e.currentTarget as HTMLElement);
  });
  document.getElementById('emptyAddAddressBtn')?.addEventListener('click', (e) => {
    openAddressModal(e.currentTarget as HTMLElement);
  });
  document.getElementById('closeAddressModalBtn')?.addEventListener('click', () => closeDialogClean(addressDialog));
  document.getElementById('cancelAddressBtn')?.addEventListener('click', () => closeDialogClean(addressDialog));

  addressForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const editId = (document.getElementById('editAddressId') as HTMLInputElement | null)?.value || '';
    const validation = validateAddressInput(
      {
        label: (document.getElementById('addrLabel') as HTMLInputElement | null)?.value,
        governorate: (document.getElementById('addrGov') as HTMLSelectElement | null)?.value,
        city: (document.getElementById('addrCity') as HTMLInputElement | null)?.value,
        street: (document.getElementById('addrDetail') as HTMLTextAreaElement | null)?.value,
        isDefault: (document.getElementById('addrIsDefault') as HTMLInputElement | null)?.checked,
      },
      locale
    );

    if (!validation.valid) {
      if (addressFormError) {
        addressFormError.textContent =
          validation.error || (isEn ? 'Please fill in all required fields.' : 'يرجى التحقق من الحقول المطلوبة.');
        addressFormError.hidden = false;
      }
      return;
    }

    const saveBtn = document.getElementById('saveAddressBtn') as HTMLButtonElement | null;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = isEn ? 'Saving...' : 'جاري الحفظ...';
    }

    try {
      const addrRef = db.ref(`customers/${currentUser.uid}/addresses`);
      const { label, governorate, city, street, isDefault } = validation.sanitized;

      if (isDefault) {
        const allSnap = await addrRef.once('value');
        if (allSnap.exists()) {
          const updates: Record<string, boolean> = {};
          allSnap.forEach((child: any) => {
            if (child.key !== editId && child.val()?.isDefault) {
              updates[`${child.key}/isDefault`] = false;
            }
          });
          if (Object.keys(updates).length > 0) {
            await addrRef.update(updates);
          }
        }
      }

      const fb = (window as any).firebase;
      const payload: Record<string, unknown> = {
        label,
        governorate,
        city,
        address: street,
        isDefault,
        updatedAt: fb?.database?.ServerValue?.TIMESTAMP || Date.now(),
      };

      if (editId) {
        await addrRef.child(editId).update(payload);
        notify(isEn ? 'Address updated successfully.' : 'تم تحديث العنوان بنجاح.', 'success');
      } else {
        payload.createdAt = fb?.database?.ServerValue?.TIMESTAMP || Date.now();
        await addrRef.push(payload);
        notify(isEn ? 'Address added successfully.' : 'تمت إضافة العنوان بنجاح.', 'success');
      }

      closeDialogClean(addressDialog);
      await loadAddresses();
    } catch (err) {
      console.error('Error saving address:', err);
      notify(isEn ? 'An error occurred while saving the address.' : 'حدث خطأ أثناء حفظ العنوان.', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = isEn ? 'Save Address' : 'حفظ العنوان';
      }
    }
  });

  document.getElementById('addressesContainer')?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement | null;
    const editBtn = target?.closest<HTMLButtonElement>('[data-addr-edit]');
    if (editBtn) {
      openAddressModal(editBtn, editBtn.getAttribute('data-addr-edit') || '');
      return;
    }

    const defaultBtn = target?.closest<HTMLButtonElement>('[data-addr-default]');
    if (defaultBtn && currentUser) {
      const key = defaultBtn.getAttribute('data-addr-default') || '';
      try {
        const addrRef = db.ref(`customers/${currentUser.uid}/addresses`);
        const allSnap = await addrRef.once('value');
        if (allSnap.exists()) {
          const updates: Record<string, boolean> = {};
          allSnap.forEach((child: any) => {
            updates[`${child.key}/isDefault`] = child.key === key;
          });
          await addrRef.update(updates);
          await loadAddresses();
          notify(isEn ? 'Default address updated.' : 'تم تعيين العنوان الافتراضي.', 'success');
        }
      } catch {
        notify(isEn ? 'Could not update default address.' : 'تعذر تحديث العنوان الافتراضي.', 'error');
      }
      return;
    }

    const delBtn = target?.closest<HTMLButtonElement>('[data-addr-delete]');
    if (delBtn) {
      pendingDeleteAddressKey = delBtn.getAttribute('data-addr-delete');
      const labelEl = document.getElementById('deleteAddressLabelPreview');
      if (labelEl && pendingDeleteAddressKey && cachedAddresses[pendingDeleteAddressKey]) {
        labelEl.textContent = cachedAddresses[pendingDeleteAddressKey].label;
      }
      openDialogClean(deleteAddressDialog, delBtn);
    }
  });

  document.getElementById('cancelDeleteAddressBtn')?.addEventListener('click', () => {
    pendingDeleteAddressKey = null;
    closeDialogClean(deleteAddressDialog);
  });

  document.getElementById('confirmDeleteAddressBtn')?.addEventListener('click', async () => {
    if (!currentUser || !pendingDeleteAddressKey) return;
    const keyToDelete = pendingDeleteAddressKey;
    try {
      await db.ref(`customers/${currentUser.uid}/addresses/${keyToDelete}`).remove();
      pendingDeleteAddressKey = null;
      closeDialogClean(deleteAddressDialog);
      await loadAddresses();
      notify(isEn ? 'Address deleted.' : 'تم حذف العنوان.', 'info');
    } catch {
      notify(isEn ? 'Could not delete address.' : 'تعذر حذف العنوان.', 'error');
    }
  });

  // --------------------------------------------------------------------------
  // 5. Wishlist (ProductCard Visual & Cart Parity)
  // --------------------------------------------------------------------------
  async function loadWishlist(): Promise<void> {
    const loadingEl = document.getElementById('wishlistLoading');
    const container = document.getElementById('wishlistContainer');
    const emptyEl = document.getElementById('wishlistEmpty');

    try {
      const snap = await db.ref(`wishlists/${currentUser.uid}`).once('value');
      if (loadingEl) loadingEl.hidden = true;

      if (!snap.exists()) {
        cachedWishlistIds = [];
        wishlistModels.clear();
        renderWishlistList();
        renderOverviewSummary();
        return;
      }

      const raw = snap.val() || {};
      const ids = Object.keys(raw).filter((k) => Boolean(raw[k]));
      const models = new Map<string, ProductCardViewModel>();

      await Promise.all(
        ids.map(async (pid) => {
          try {
            const pSnap = await db.ref(`products/${pid}`).once('value');
            if (pSnap.exists()) {
              const vm = resolveWishlistCardModel(pid, pSnap.val(), locale);
              if (vm) models.set(pid, vm);
            }
          } catch (pErr) {
            console.warn('Error fetching wishlist product:', pid, pErr);
          }
        })
      );

      cachedWishlistIds = Array.from(models.keys());
      wishlistModels = models;
      renderWishlistList();
      renderOverviewSummary();
    } catch (err) {
      console.error('Error loading wishlist:', err);
      if (loadingEl) loadingEl.hidden = true;
      if (container) container.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
    }
  }

  function renderWishlistList(): void {
    const container = document.getElementById('wishlistContainer');
    const emptyEl = document.getElementById('wishlistEmpty');
    if (!container || !emptyEl) return;

    if (cachedWishlistIds.length === 0) {
      container.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    container.innerHTML = cachedWishlistIds
      .map((pid) => {
        const vm = wishlistModels.get(pid);
        if (!vm) return '';
        const badgeHtml = vm.badge
          ? `<span class="dandy-pcard-tag is-${escapeHtml(vm.badge.tone)}">${escapeHtml(vm.badge.text)}</span>`
          : '';
        const actionHtml = vm.isSoldOut
          ? `<button type="button" class="dandy-pcard-btn is-soldout" disabled aria-disabled="true"><span>${escapeHtml(vm.ctaLabel)}</span></button>`
          : vm.requiresVariantSelection
            ? `<a href="${escapeHtml(vm.href)}" class="dandy-pcard-btn is-variant">${getIconSvg('sliders', { size: 15, strokeWidth: 1.8 })}<span>${escapeHtml(vm.ctaLabel)}</span></a>`
            : `<button type="button" class="dandy-pcard-btn is-add" data-wishlist-add="${escapeHtml(vm.id)}">${getIconSvg('shopping-bag', { size: 15, strokeWidth: 1.8 })}<span>${escapeHtml(vm.ctaLabel)}</span></button>`;

        return `
          <article class="dandy-pcard ${vm.isSoldOut ? 'is-sold-out' : ''}" id="wishlist-item-${escapeHtml(vm.id)}">
            <div class="dandy-pcard-stage ${vm.isFallbackImage ? 'is-fallback' : ''}">
              ${badgeHtml}
              <img
                src="${escapeHtml(vm.imageUrl)}"
                alt="${escapeHtml(vm.name)}"
                class="dandy-pcard-img"
                width="480"
                height="480"
                loading="lazy"
                referrerpolicy="no-referrer"
                onerror="this.onerror=null;this.src='/assets/images/logo.png';this.closest('.dandy-pcard-stage')?.classList.add('is-fallback');"
              />
            </div>
            <div class="dandy-pcard-body">
              <div class="dandy-pcard-meta">
                <a href="${prefix}/category/${escapeHtml(vm.categorySlug)}" class="dandy-pcard-category">${escapeHtml(vm.categoryLabelAr)}</a>
              </div>
              <h3 class="dandy-pcard-title"><a href="${escapeHtml(vm.href)}" class="dandy-pcard-link">${escapeHtml(vm.name)}</a></h3>
              <div class="dandy-pcard-price-row">
                <span class="dandy-pcard-price dandy-tabular">${formatEgpPrice(vm.currentPrice, locale)}</span>
                ${vm.oldPrice !== null ? `<del class="dandy-pcard-old-price dandy-tabular">${formatEgpPrice(vm.oldPrice, locale)}</del>` : ''}
              </div>
              <div class="dandy-pcard-actions dandy-wish-card-actions">
                ${actionHtml}
                <button
                  type="button"
                  class="dandy-btn dandy-btn--outline dandy-wish-remove-btn"
                  data-wishlist-remove="${escapeHtml(vm.id)}"
                  aria-label="${escapeHtml(isEn ? `Remove ${vm.name} from wishlist` : `إزالة ${vm.name} من المفضلة`)}"
                >
                  ${getIconSvg('trash', { size: 14, strokeWidth: 1.85 })}
                  <span>${isEn ? 'Remove' : 'إزالة'}</span>
                </button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    container.hidden = false;
    emptyEl.hidden = true;
  }

  document.getElementById('wishlistContainer')?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement | null;

    const addBtn = target?.closest<HTMLButtonElement>('[data-wishlist-add]');
    if (addBtn) {
      e.preventDefault();
      e.stopPropagation();
      const pid = addBtn.getAttribute('data-wishlist-add') || '';
      const vm = wishlistModels.get(pid);
      if (!vm || !vm.cartPayload) return;

      try {
        const cart = parseCartArrayFromStrings(
          localStorage.getItem('cart'),
          localStorage.getItem('dandy_cart')
        );
        const existingIdx = cart.findIndex((item) => (item.productId || item.id) === vm.id);
        if (existingIdx !== -1) {
          cart[existingIdx].quantity = (Number(cart[existingIdx].quantity) || 1) + 1;
        } else {
          cart.push({ ...vm.cartPayload });
        }
        const serialized = JSON.stringify(cart);
        localStorage.setItem('cart', serialized);
        localStorage.setItem('dandy_cart', serialized);
        window.dispatchEvent(new Event('storage'));
        window.updateSharedCartCount?.();
        window.DandyMeta?.trackAddToCart?.({
          id: vm.id,
          name: vm.name,
          price: vm.currentPrice,
          category: vm.categorySlug,
          quantity: 1,
        });
        notify(
          isEn ? `Added “${vm.name}” to your shopping bag.` : `تمت إضافة «${vm.name}» إلى حقيبة التسوق.`,
          'success'
        );
      } catch {
        notify(isEn ? 'Could not add product to bag.' : 'تعذر إضافة المنتج إلى السلة.', 'error');
      }
      return;
    }

    const removeBtn = target?.closest<HTMLButtonElement>('[data-wishlist-remove]');
    if (removeBtn && currentUser) {
      e.preventDefault();
      e.stopPropagation();
      const pid = removeBtn.getAttribute('data-wishlist-remove') || '';
      try {
        await db.ref(`wishlists/${currentUser.uid}/${pid}`).remove();
        cachedWishlistIds = cachedWishlistIds.filter((id) => id !== pid);
        wishlistModels.delete(pid);
        renderWishlistList();
        renderOverviewSummary();
        notify(isEn ? 'Removed from your wishlist.' : 'تمت إزالة المنتج من قائمة المفضلة.', 'info');
      } catch {
        notify(isEn ? 'Could not remove from wishlist.' : 'تعذر إزالة المنتج من المفضلة.', 'error');
      }
    }
  });
}
