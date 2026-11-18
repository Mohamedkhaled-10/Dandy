/**
 * ============================================================================
 * DANDY COSMETICS — ORDER CONFIRMATION & PRINTABLE INVOICE CONTROLLER (PHASE 6)
 * Preserves #access= / #token= POST /api/public-invoice, ?id= and ?invoice=
 * RTDB lookups, Meta Pixel Purchase deduplication, collection/variant rendering,
 * copy feedback via DandyToast, and safe WhatsApp <a> href (no window.open).
 * ============================================================================
 */
import { getIconSvg } from './icons';
import {
  buildWhatsappOrderInquiryUrl,
  escapeHtml,
  FALLBACK_CART_IMAGE,
  formatOrderLineItem,
  formatOrderTimestamp,
  getGovernorateLabel,
  normalizeOrderStatusMeta,
} from './purchase-flow';

declare global {
  interface Window {
    db?: any;
    firebase?: any;
    DandyMeta?: {
      trackPurchase?: (order: any) => void;
    };
    fbq?: (...args: any[]) => void;
    copyInvoiceToClipboard?: () => void;
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

export function initInvoicePage(): void {
  const invoiceSheet = document.getElementById('invoiceCard');
  if (!invoiceSheet) return;

  const locale = getRuntimeLocale();
  const isEn = locale === 'en';

  const loadingState = document.getElementById('invoiceLoadingState');
  const errorState = document.getElementById('invoiceErrorState');
  const invoiceCodeEl = document.getElementById('invoiceCode');
  const invoiceDateEl = document.getElementById('invoiceDate');
  const statusBadge = document.getElementById('statusBadge');

  const custName = document.getElementById('custName');
  const custPhone = document.getElementById('custPhone');
  const custEmail = document.getElementById('custEmail');
  const custGov = document.getElementById('custGov');
  const custCity = document.getElementById('custCity');
  const custAddress = document.getElementById('custAddress');
  const itemsBody = document.getElementById('itemsBody');

  const tableSubtotal = document.getElementById('tableSubtotal');
  const tableShipping = document.getElementById('tableShipping');
  const tableGrandTotal = document.getElementById('tableGrandTotal');

  const copyBtn = document.getElementById('btnCopyCode');
  const printBtn = document.getElementById('print-btn');
  const whatsappLink = document.getElementById('share-whatsapp') as HTMLAnchorElement | null;
  const trackOrderLink = document.getElementById('trackOrderBtn') as HTMLAnchorElement | null;

  let currentCode = '';
  let currentPhone = '';

  function showLoading(): void {
    if (loadingState) loadingState.hidden = false;
    if (invoiceSheet) invoiceSheet.hidden = true;
    if (errorState) errorState.hidden = true;
  }

  function showInvoice(): void {
    if (loadingState) loadingState.hidden = true;
    if (errorState) errorState.hidden = true;
    if (invoiceSheet) invoiceSheet.hidden = false;
  }

  function showError(message?: string): void {
    if (loadingState) loadingState.hidden = true;
    if (invoiceSheet) invoiceSheet.hidden = true;
    if (errorState) {
      errorState.hidden = false;
      const desc = document.getElementById('invoiceErrorDesc');
      if (desc && message) desc.textContent = message;
    }
  }

  function applyTimelineAndStatus(rawStatus?: string | null): string {
    const meta = normalizeOrderStatusMeta(rawStatus, locale);

    if (statusBadge) {
      statusBadge.textContent = meta.label;
      statusBadge.className = `dandy-status-badge dandy-status-badge--${meta.badgeTone}`;
    }

    const stepIds = ['step-new', 'step-processing', 'step-shipped', 'step-delivered'];
    stepIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active', 'current');
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
      if (idx <= meta.activeStepIndex) {
        el.classList.add('active');
      }
      if (idx === meta.activeStepIndex && meta.key !== 'delivered') {
        el.classList.add('current');
      }
    });

    return meta.label;
  }

  function trackPurchaseIfNeeded(order: Record<string, any>, totalVal: number, key: string): void {
    const transactionId = String(order.invoiceCode || key || '');
    if (!transactionId) return;

    if (window.DandyMeta && typeof window.DandyMeta.trackPurchase === 'function') {
      window.DandyMeta.trackPurchase(order);
      return;
    }

    if (typeof window.fbq !== 'function') return;

    const storageKey = `meta_pixel_purchase_fired_${transactionId}`;
    let alreadyFired = false;
    try {
      alreadyFired = Boolean(sessionStorage.getItem(storageKey));
    } catch {
      // Ignore
    }
    if (alreadyFired) return;

    const contentIds: string[] = [];
    (Array.isArray(order.products) ? order.products : []).forEach((p: any) => {
      if (p?.type === 'collection' || p?.isCollection || p?.collectionId) {
        const subItems = Array.isArray(p.items)
          ? p.items
          : Array.isArray(p.selectedItems)
            ? p.selectedItems
            : [];
        subItems.forEach((s: any) => {
          if (s?.productId || s?.id) contentIds.push(String(s.productId || s.id));
        });
      } else if (p?.productId || p?.id) {
        contentIds.push(String(p.productId || p.id));
      }
    });

    window.fbq('track', 'Purchase', {
      content_type: 'product',
      content_ids: contentIds,
      value: Number(totalVal.toFixed(2)),
      currency: 'EGP',
      transaction_id: transactionId,
    });

    try {
      sessionStorage.setItem(storageKey, 'true');
    } catch {
      // Ignore
    }
  }

  function drawOrder(order: Record<string, any>, key: string): void {
    const resolvedCode = String(order.invoiceCode || key || '—');
    const resolvedName = String(order.name || '—');
    const resolvedPhone = String(order.phone || '—');
    currentCode = resolvedCode;
    currentPhone = order.phone ? String(order.phone) : '';

    const currencyLabel = isEn ? 'EGP' : 'ج.م';

    if (invoiceCodeEl) invoiceCodeEl.textContent = resolvedCode;
    if (invoiceDateEl) invoiceDateEl.textContent = formatOrderTimestamp(order.timestamp || Date.now(), locale);

    if (custName) custName.textContent = resolvedName;
    if (custPhone) custPhone.textContent = resolvedPhone;
    if (custEmail) {
      custEmail.textContent = order.email && order.email !== 'N/A' ? String(order.email) : (isEn ? 'N/A' : 'غير متوفر');
    }
    if (custAddress) custAddress.textContent = String(order.address || '—');
    if (custGov) custGov.textContent = getGovernorateLabel(order.governorate, locale);
    if (custCity) custCity.textContent = String(order.city || '—');

    let calculatedSubtotal = 0;
    const products = Array.isArray(order.products) ? order.products : [];

    if (itemsBody) {
      itemsBody.innerHTML = '';

      if (products.length > 0) {
        const sparklesIcon = getIconSvg('sparkles', { size: 12, strokeWidth: 1.9 });

        products.forEach((rawProduct: any) => {
          const item = formatOrderLineItem(rawProduct || {}, locale);
          calculatedSubtotal += item.lineTotal;

          const variantHtml =
            item.variants && item.variants.text
              ? `<div class="dandy-inv-item-variant">${sparklesIcon} <span>${escapeHtml(item.variants.label)}: <strong>${escapeHtml(item.variants.text)}</strong></span></div>`
              : '';

          const colHtml =
            item.isCollection && item.collectionItems.length > 0
              ? `<ul class="dandy-inv-col-list">
                   ${item.collectionItems
                     .map(
                       (si) =>
                         `<li>${escapeHtml(si.productName)}${si.variantName ? ` (${escapeHtml(si.variantName)})` : ''}</li>`
                     )
                     .join('')}
                 </ul>`
              : '';

          const priceHtml = item.crossedTotal
            ? `<span class="dandy-tabular">${item.lineTotal.toFixed(0)} ${currencyLabel}</span> <span class="dandy-inv-crossed dandy-tabular">${item.crossedTotal.toFixed(0)}</span>`
            : `<span class="dandy-tabular">${item.lineTotal.toFixed(0)} ${currencyLabel}</span>`;

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div class="dandy-inv-product-cell">
                <img
                  src="${escapeHtml(item.image)}"
                  alt="${escapeHtml(item.name)}"
                  width="50"
                  height="50"
                  loading="lazy"
                  class="dandy-inv-product-img"
                  onerror="this.onerror=null;this.src='${FALLBACK_CART_IMAGE}';this.style.objectFit='contain';this.style.padding='6px';"
                />
                <div class="dandy-inv-product-text">
                  <strong class="dandy-inv-product-name">${escapeHtml(item.name)}</strong>
                  ${variantHtml}
                  ${colHtml}
                </div>
              </div>
            </td>
            <td class="dandy-inv-qty-col dandy-tabular">× ${item.quantity}</td>
            <td class="dandy-inv-price-col">${priceHtml}</td>
          `;
          itemsBody.appendChild(tr);
        });
      } else {
        itemsBody.innerHTML = isEn
          ? '<tr><td colspan="3" class="dandy-inv-empty-row">No items are recorded on this invoice.</td></tr>'
          : '<tr><td colspan="3" class="dandy-inv-empty-row">لا توجد منتجات مسجلة في هذه الفاتورة.</td></tr>';
      }
    }

    const subtotalVal =
      order.subtotal !== undefined && order.subtotal !== null
        ? Number.parseFloat(String(order.subtotal))
        : calculatedSubtotal;
    const shippingVal =
      order.shippingFee !== undefined && order.shippingFee !== null
        ? Number.parseFloat(String(order.shippingFee))
        : 0;
    const totalVal =
      order.totalAmount !== undefined && order.totalAmount !== null
        ? Number.parseFloat(String(order.totalAmount))
        : subtotalVal + shippingVal;

    if (tableSubtotal) tableSubtotal.textContent = `${subtotalVal.toFixed(0)} ${currencyLabel}`;
    if (tableShipping) {
      tableShipping.textContent =
        shippingVal === 0 ? (isEn ? 'Free Shipping' : 'شحن مجاني') : `${shippingVal.toFixed(0)} ${currencyLabel}`;
    }
    if (tableGrandTotal) tableGrandTotal.textContent = `${totalVal.toFixed(0)} ${currencyLabel}`;

    const statusLabel = applyTimelineAndStatus(order.status || 'New');

    if (whatsappLink) {
      whatsappLink.href = buildWhatsappOrderInquiryUrl(
        {
          invoiceCode: resolvedCode,
          customerName: resolvedName,
          statusLabel,
          pageUrl: window.location.href,
        },
        locale
      );
    }

    if (trackOrderLink) {
      const trackParams = new URLSearchParams();
      if (resolvedCode && resolvedCode !== '—') trackParams.set('code', resolvedCode);
      if (currentPhone) trackParams.set('phone', currentPhone);
      const trackBase = isEn ? '/en/track-order' : '/track-order';
      trackOrderLink.href = `${trackBase}${trackParams.toString() ? `?${trackParams.toString()}` : ''}`;
    }

    showInvoice();
    if (products.length > 0) {
      trackPurchaseIfNeeded(order, totalVal, key);
    }
  }

  async function copyInvoiceCode(): Promise<void> {
    const code = currentCode || invoiceCodeEl?.textContent?.trim() || '';
    if (!code || code === '—' || code.includes('جاري') || code.includes('Loading')) return;

    try {
      await navigator.clipboard.writeText(code);
      window.DandyToast?.show({
        type: 'success',
        message: isEn ? `Invoice code (${code}) copied.` : `تم نسخ كود الفاتورة (${code}) بنجاح.`,
      });
      if (copyBtn) {
        const labelEl = copyBtn.querySelector('[data-copy-label]');
        if (labelEl) {
          labelEl.textContent = isEn ? 'Copied' : 'تم النسخ';
          window.setTimeout(() => {
            labelEl.textContent = isEn ? 'Copy Code' : 'نسخ الكود';
          }, 2200);
        }
      }
    } catch {
      window.DandyToast?.show({
        type: 'info',
        message: isEn ? `Your invoice code is: ${code}` : `كود الفاتورة الخاص بكِ هو: ${code}`,
      });
    }
  }

  copyBtn?.addEventListener('click', () => void copyInvoiceCode());
  printBtn?.addEventListener('click', () => window.print());
  window.copyInvoiceToClipboard = copyInvoiceCode;

  // Resolve order source: #access= token > ?id= > ?invoice=
  const urlParams = new URLSearchParams(window.location.search);
  const idParam = urlParams.get('id');
  const invoiceParam = urlParams.get('invoice');

  let hashToken: string | null = null;
  const rawHash = window.location.hash ? window.location.hash.substring(1) : '';
  if (rawHash) {
    if (rawHash.includes('=')) {
      const hashParams = new URLSearchParams(rawHash);
      hashToken = hashParams.get('access') || hashParams.get('token');
    } else if (rawHash.length >= 32) {
      hashToken = rawHash;
    }
  }

  showLoading();

  if (hashToken) {
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      // Ignore
    }

    fetch('/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: hashToken }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success && data.order) {
          drawOrder(data.order, data.order.orderId || data.order.invoiceCode || '');
        } else {
          showError(
            isEn
              ? 'This invoice link has expired or is invalid. You can track your order using your invoice code and phone number.'
              : 'انتهت صلاحية رابط الفاتورة أو أنه غير صالح. يمكنكِ تتبع الطلب باستخدام كود الفاتورة ورقم الهاتف.'
          );
        }
      })
      .catch(() => {
        showError(
          isEn
            ? 'Unable to load invoice details right now. Please try again.'
            : 'تعذر تحميل تفاصيل الفاتورة حالياً. يرجى المحاولة مرة أخرى.'
        );
      });
    return;
  }

  const db = window.db || (window.firebase?.database ? window.firebase.database() : null);

  if (idParam) {
    if (!db) {
      showError(
        isEn
          ? 'Could not connect to the database to display this invoice. Please try again or use Order Tracking.'
          : 'تعذر الاتصال بقاعدة البيانات لعرض الفاتورة. يمكنكِ المحاولة مجدداً أو تتبع الطلب بالكود والهاتف.'
      );
      return;
    }
    db.ref(`orders/${idParam}`).on(
      'value',
      (snap: any) => {
        if (snap.exists()) {
          drawOrder(snap.val(), idParam);
        } else {
          showError(
            isEn ? 'We could not find an invoice matching this order ID.' : 'لم نعثر على فاتورة مطابقة لهذا المعرّف.'
          );
        }
      },
      () => {
        showError(
          isEn
            ? 'Unable to read invoice details due to access permissions. Please use Order Tracking with your phone number.'
            : 'تعذر قراءة بيانات الفاتورة بسبب صلاحيات الوصول. استخدمي رابط التتبع أو البريد الإلكتروني.'
        );
      }
    );
    return;
  }

  if (invoiceParam) {
    if (!db) {
      showError(
        isEn ? 'Could not connect to the database to load this invoice.' : 'تعذر الاتصال بقاعدة البيانات لعرض الفاتورة.'
      );
      return;
    }
    db.ref('orders')
      .orderByChild('invoiceCode')
      .equalTo(invoiceParam)
      .on(
        'value',
        (snap: any) => {
          if (snap.exists()) {
            let matched = false;
            snap.forEach((child: any) => {
              if (!matched) {
                drawOrder(child.val(), child.key);
                matched = true;
              }
            });
          } else {
            showError(
              isEn
                ? 'Invoice code not found. Please check the code entered or search from the Track Order page.'
                : 'كود الفاتورة غير موجود. تأكدي من الكود المدخل أو جرّبي البحث من صفحة تتبع الطلب.'
            );
          }
        },
        () => {
          showError(
            isEn
              ? 'Unable to load the invoice directly. Please use the Track Order page with your registered phone number.'
              : 'تعذر جلب الفاتورة مباشرة. استخدمي صفحة تتبع الطلب مع رقم الهاتف المسجل بالطلب.'
          );
        }
      );
    return;
  }

  showError(
    isEn
      ? 'No invoice code or order ID was provided. You can track your order using your invoice code and phone number.'
      : 'لم يتم تحديد كود أو معرّف فاتورة للعرض. يمكنكِ تتبع طلبكِ باستخدام كود الفاتورة ورقم الهاتف.'
  );
}
