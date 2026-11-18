/**
 * ============================================================================
 * DANDY COSMETICS — ORDER TRACKING CLIENT CONTROLLER (PHASE 6)
 * Preserves RTDB invoiceCode lookup, digits-only phone match, dandy_recent_lookups
 * (max 4), and URL query auto-lookup (?code=&phone=), replacing all alert()s
 * with accessible inline validation, distinct empty/error states, and DandyToast.
 * ============================================================================
 */
import { getIconSvg } from './icons';
import {
  buildWhatsappOrderInquiryUrl,
  doesOrderPhoneMatch,
  escapeHtml,
  FALLBACK_CART_IMAGE,
  formatOrderLineItem,
  formatOrderTimestamp,
  getGovernorateLabel,
  normalizeOrderStatusMeta,
  upsertRecentLookup,
  type RecentLookupEntry,
} from './purchase-flow';

declare global {
  interface Window {
    db?: any;
    firebase?: any;
  }
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

export function initTrackOrderPage(): void {
  const form = document.getElementById('trackingForm') as HTMLFormElement | null;
  if (!form) return;

  const locale = getRuntimeLocale();
  const isEn = locale === 'en';

  const trackCodeInput = document.getElementById('trackCode') as HTMLInputElement | null;
  const trackPhoneInput = document.getElementById('trackPhone') as HTMLInputElement | null;
  const submitBtn = document.getElementById('trackSubmitBtn') as HTMLButtonElement | null;

  const loadingIndicator = document.getElementById('loadingIndicator');
  const errorBanner = document.getElementById('trackErrorBanner');
  const errorTitle = document.getElementById('trackErrorTitle');
  const errorDesc = document.getElementById('trackErrorDesc');
  const emptyPromptCard = document.getElementById('trackEmptyPrompt');

  const resultsCard = document.getElementById('trackingResultsCard');
  const resInvoiceCode = document.getElementById('resInvoiceCode');
  const resOrderDate = document.getElementById('resOrderDate');
  const resStatusBadge = document.getElementById('resStatusBadge');
  const resCustName = document.getElementById('resCustName');
  const resCustPhone = document.getElementById('resCustPhone');
  const resCustLocation = document.getElementById('resCustLocation');
  const resCustAddress = document.getElementById('resCustAddress');
  const resProductsBody = document.getElementById('resProductsBody');
  const resSubtotal = document.getElementById('resSubtotal');
  const resShipping = document.getElementById('resShipping');
  const resTotal = document.getElementById('resTotal');
  const resInvoiceLink = document.getElementById('resInvoiceLink') as HTMLAnchorElement | null;
  const resWhatsappLink = document.getElementById('resWhatsappLink') as HTMLAnchorElement | null;
  const resPrintBtn = document.getElementById('resPrintBtn');

  const recentSearchesBox = document.getElementById('recentSearchesBox');
  const recentTagsList = document.getElementById('recentTagsList');

  function getRecentLookups(): RecentLookupEntry[] {
    try {
      const parsed = JSON.parse(localStorage.getItem('dandy_recent_lookups') || '[]');
      return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
    } catch {
      return [];
    }
  }

  function saveRecentLookup(code: string, phone: string): void {
    const next = upsertRecentLookup(getRecentLookups(), code, phone);
    try {
      localStorage.setItem('dandy_recent_lookups', JSON.stringify(next));
    } catch {
      // Ignore
    }
    drawRecentSearches();
  }

  function drawRecentSearches(): void {
    if (!recentSearchesBox || !recentTagsList) return;
    const recent = getRecentLookups();
    if (recent.length === 0) {
      recentSearchesBox.hidden = true;
      return;
    }

    recentSearchesBox.hidden = false;
    recentTagsList.innerHTML = '';

    recent.forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dandy-recent-chip';
      btn.textContent = entry.code;
      btn.setAttribute('aria-label', isEn ? `Track order ${entry.code}` : `تتبع الطلب رقم ${entry.code}`);
      btn.addEventListener('click', () => {
        if (trackCodeInput) trackCodeInput.value = entry.code;
        if (trackPhoneInput) trackPhoneInput.value = entry.phone;
        clearFieldErrors();
        performQuery(entry.code, entry.phone);
      });
      recentTagsList.appendChild(btn);
    });
  }

  function clearFieldErrors(): void {
    [
      ['trackCode', 'err-trackCode'],
      ['trackPhone', 'err-trackPhone'],
    ].forEach(([inputId, errId]) => {
      const input = document.getElementById(inputId);
      const err = document.getElementById(errId);
      input?.removeAttribute('aria-invalid');
      input?.closest('.dandy-field')?.classList.remove('has-error');
      if (err) {
        err.textContent = '';
        err.hidden = true;
      }
    });
  }

  function setFieldError(inputId: string, errId: string, msg: string): void {
    const input = document.getElementById(inputId);
    const err = document.getElementById(errId);
    input?.setAttribute('aria-invalid', 'true');
    input?.closest('.dandy-field')?.classList.add('has-error');
    if (err) {
      err.textContent = msg;
      err.hidden = false;
    }
  }

  function showErrorState(title: string, desc: string): void {
    if (loadingIndicator) loadingIndicator.hidden = true;
    if (resultsCard) resultsCard.hidden = true;
    if (emptyPromptCard) emptyPromptCard.hidden = true;
    if (errorBanner) errorBanner.hidden = false;
    if (errorTitle) errorTitle.textContent = title;
    if (errorDesc) errorDesc.textContent = desc;
    window.DandyToast?.show({ type: 'error', message: desc });
  }

  function setLoading(loading: boolean): void {
    if (loadingIndicator) loadingIndicator.hidden = !loading;
    if (submitBtn) submitBtn.disabled = loading;
    if (loading) {
      if (errorBanner) errorBanner.hidden = true;
      if (emptyPromptCard) emptyPromptCard.hidden = true;
      if (resultsCard) resultsCard.hidden = true;
    }
  }

  function updateTimeline(rawStatus?: string | null): string {
    const meta = normalizeOrderStatusMeta(rawStatus, locale);

    if (resStatusBadge) {
      resStatusBadge.textContent = meta.label;
      resStatusBadge.className = `dandy-status-badge dandy-status-badge--${meta.badgeTone}`;
    }

    const stepIds = ['step-new', 'step-processing', 'step-shipped', 'step-delivered'];
    stepIds.forEach((id) => {
      document.getElementById(id)?.classList.remove('active', 'current');
    });

    const cancelledBanner = document.getElementById('cancelledBanner');
    const timelineContainer = document.getElementById('timelineContainer');
    const progressBar = document.getElementById('timelineProgressBar');

    if (meta.isCancelled) {
      if (cancelledBanner) cancelledBanner.hidden = false;
      if (timelineContainer) timelineContainer.hidden = true;
      return meta.label;
    }

    if (cancelledBanner) cancelledBanner.hidden = true;
    if (timelineContainer) timelineContainer.hidden = false;
    if (progressBar) progressBar.style.width = `${meta.progressPercent}%`;

    stepIds.forEach((id, idx) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (idx <= meta.activeStepIndex) el.classList.add('active');
      if (idx === meta.activeStepIndex && meta.key !== 'delivered') el.classList.add('current');
    });

    return meta.label;
  }

  function renderOrderResults(order: Record<string, any>, enteredPhone: string): void {
    setLoading(false);
    window.DandyToast?.clear();
    if (errorBanner) errorBanner.hidden = true;
    if (emptyPromptCard) emptyPromptCard.hidden = true;
    if (resultsCard) resultsCard.hidden = false;

    const currencyLabel = isEn ? 'EGP' : 'ج.م';
    const code = String(order.invoiceCode || '');
    const customerName = String(order.name || '—');
    if (resInvoiceCode) resInvoiceCode.textContent = code || '—';
    if (resOrderDate) resOrderDate.textContent = formatOrderTimestamp(order.timestamp, locale);
    if (resCustName) resCustName.textContent = customerName;
    if (resCustPhone) resCustPhone.textContent = String(order.phone || '—');

    const govLabel = order.governorate ? getGovernorateLabel(order.governorate, locale) : '';
    const loc = isEn
      ? [order.city, govLabel ? `${govLabel} Governorate` : ''].filter(Boolean).join(', ')
      : [order.city, govLabel].filter(Boolean).join('، محافظة ');
    if (resCustLocation) resCustLocation.textContent = loc || '—';
    if (resCustAddress) resCustAddress.textContent = String(order.address || '—');

    let calculatedSubtotal = 0;
    const products = Array.isArray(order.products) ? order.products : [];

    if (resProductsBody) {
      resProductsBody.innerHTML = '';
      if (products.length > 0) {
        const sparklesIcon = getIconSvg('sparkles', { size: 12, strokeWidth: 1.9 });

        products.forEach((rawProd: any) => {
          const item = formatOrderLineItem(rawProd || {}, locale);
          calculatedSubtotal += item.lineTotal;

          const variantHtml =
            item.variants && item.variants.text
              ? `<div class="dandy-track-variant">${sparklesIcon} <span>${escapeHtml(item.variants.label)}: <strong>${escapeHtml(item.variants.text)}</strong></span></div>`
              : '';

          const colHtml =
            item.isCollection && item.collectionItems.length > 0
              ? `<ul class="dandy-track-col-list">
                   ${item.collectionItems
                     .map(
                       (si) =>
                         `<li>${escapeHtml(si.productName)}${si.variantName ? ` (${escapeHtml(si.variantName)})` : ''}</li>`
                     )
                     .join('')}
                 </ul>`
              : '';

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div class="dandy-track-item-cell">
                <img
                  src="${escapeHtml(item.image)}"
                  alt="${escapeHtml(item.name)}"
                  width="46"
                  height="46"
                  loading="lazy"
                  class="dandy-track-item-img"
                  onerror="this.onerror=null;this.src='${FALLBACK_CART_IMAGE}';this.style.objectFit='contain';this.style.padding='6px';"
                />
                <div class="dandy-track-item-text">
                  <strong class="dandy-track-item-name">${escapeHtml(item.name)}</strong>
                  ${variantHtml}
                  ${colHtml}
                </div>
              </div>
            </td>
            <td class="dandy-track-qty-col dandy-tabular">${item.quantity}</td>
            <td class="dandy-track-price-col dandy-tabular">${item.lineTotal.toFixed(0)} ${currencyLabel}</td>
          `;
          resProductsBody.appendChild(tr);
        });
      } else {
        resProductsBody.innerHTML = isEn
          ? '<tr><td colspan="3" class="dandy-track-empty-row">No items are recorded on this order.</td></tr>'
          : '<tr><td colspan="3" class="dandy-track-empty-row">لا توجد منتجات مسجلة في هذا الطلب.</td></tr>';
      }
    }

    const sub =
      order.subtotal !== undefined && order.subtotal !== null
        ? Number.parseFloat(String(order.subtotal))
        : calculatedSubtotal;
    const ship =
      order.shippingFee !== undefined && order.shippingFee !== null
        ? Number.parseFloat(String(order.shippingFee))
        : 0;
    const total =
      order.totalAmount !== undefined && order.totalAmount !== null
        ? Number.parseFloat(String(order.totalAmount))
        : sub + ship;

    if (resSubtotal) resSubtotal.textContent = `${sub.toFixed(0)} ${currencyLabel}`;
    if (resShipping) {
      resShipping.textContent =
        ship === 0 ? (isEn ? 'Free Shipping' : 'شحن مجاني') : `${ship.toFixed(0)} ${currencyLabel}`;
    }
    if (resTotal) resTotal.textContent = `${total.toFixed(0)} ${currencyLabel}`;

    const statusLabel = updateTimeline(order.status || 'New');

    if (resInvoiceLink) {
      const invParams = new URLSearchParams();
      if (order.id) invParams.set('id', String(order.id));
      if (code) invParams.set('invoice', code);
      resInvoiceLink.href = `${isEn ? '/en' : ''}/invoice?${invParams.toString()}`;
    }

    if (resWhatsappLink) {
      const pageUrl = `${window.location.origin}${isEn ? '/en' : ''}/track-order?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(enteredPhone)}`;
      resWhatsappLink.href = buildWhatsappOrderInquiryUrl(
        {
          invoiceCode: code,
          customerName,
          statusLabel,
          pageUrl,
        },
        locale
      );
    }

    resultsCard?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  function performQuery(rawCode: string, rawPhone: string): void {
    const code = rawCode.trim().toUpperCase();
    const phone = rawPhone.trim();
    window.DandyToast?.clear();

    const db = window.db || (window.firebase?.database ? window.firebase.database() : null);
    if (!db) {
      showErrorState(
        isEn ? 'Unable to reach tracking service' : 'تعذر الاتصال بخدمة التتبع',
        isEn
          ? 'A temporary error occurred initializing the database connection. Please refresh and try again.'
          : 'حدث خطأ مؤقت في تهيئة الاتصال بقاعدة البيانات. يرجى تحديث الصفحة والمحاولة مرة أخرى.'
      );
      return;
    }

    setLoading(true);

    db.ref('orders')
      .orderByChild('invoiceCode')
      .equalTo(code)
      .once('value')
      .then((snap: any) => {
        setLoading(false);

        if (!snap.exists()) {
          showErrorState(
            isEn ? 'No order found with this code' : 'لم نجد طلباً بهذا الكود',
            isEn
              ? 'We could not find an order matching this invoice code. Please check the code (e.g. DNY-123456) and try again.'
              : 'لم نتمكن من العثور على طلب يطابق كود الفاتورة المدخل. يرجى التأكد من الكود (مثال: DNY-123456) والمحاولة مجدداً.'
          );
          return;
        }

        let foundOrder: Record<string, any> | null = null;
        snap.forEach((child: any) => {
          const o = child.val();
          if (!foundOrder && o && doesOrderPhoneMatch(o.phone, phone)) {
            foundOrder = { id: child.key, ...o };
          }
        });

        if (!foundOrder) {
          showErrorState(
            isEn ? 'Phone number does not match order' : 'رقم الهاتف غير مطابق للطلب',
            isEn
              ? 'We found the invoice code, but the phone number entered does not match the registered number on this order.'
              : 'تم العثور على كود الفاتورة، ولكن رقم الهاتف المدخل لا يطابق الرقم المسجل بالطلب. تأكدي من الرقم وحاولي مرة أخرى.'
          );
          return;
        }

        renderOrderResults(foundOrder, phone);
        saveRecentLookup(code, phone);
      })
      .catch(() => {
        setLoading(false);
        showErrorState(
          isEn ? 'Unable to load order details' : 'تعذر جلب بيانات الطلب',
          isEn
            ? 'An error occurred while connecting to the order tracking server. Please try again shortly.'
            : 'حدث خطأ أثناء الاتصال بخادم تتبع الطلبات. يرجى المحاولة مرة أخرى بعد قليل.'
        );
      });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearFieldErrors();

    const code = trackCodeInput?.value.trim().toUpperCase() || '';
    const phone = trackPhoneInput?.value.trim() || '';

    let hasError = false;
    if (!code) {
      setFieldError(
        'trackCode',
        'err-trackCode',
        isEn ? 'Please enter your invoice code (e.g. DNY-123456).' : 'يرجى إدخال كود الفاتورة (مثال: DNY-123456).'
      );
      hasError = true;
    }
    if (!phone || phone.replace(/[^0-9]/g, '').length < 8) {
      setFieldError(
        'trackPhone',
        'err-trackPhone',
        isEn ? 'Please enter the phone number registered with your order.' : 'يرجى إدخال رقم الهاتف المسجل مع الطلب.'
      );
      hasError = true;
    }

    if (hasError) {
      showErrorState(
        isEn ? 'Incomplete search details' : 'بيانات البحث غير مكتملة',
        isEn
          ? 'Please enter both your invoice code and registered phone number to continue.'
          : 'يرجى إدخال كود الفاتورة ورقم الهاتف المسجل بالطلب للمتابعة.'
      );
      (!code ? trackCodeInput : trackPhoneInput)?.focus();
      return;
    }

    performQuery(code, phone);
  });

  trackCodeInput?.addEventListener('input', clearFieldErrors);
  trackPhoneInput?.addEventListener('input', clearFieldErrors);
  resPrintBtn?.addEventListener('click', () => window.print());

  drawRecentSearches();

  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get('code');
  const phoneParam = params.get('phone');
  if (codeParam && phoneParam && trackCodeInput && trackPhoneInput) {
    trackCodeInput.value = codeParam;
    trackPhoneInput.value = phoneParam;
    performQuery(codeParam, phoneParam);
  }
}
