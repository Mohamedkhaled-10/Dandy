import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { A as maybeRenderHead, E as renderSlot, k as renderTemplate, w as renderComponent } from "./sequence_BGeKp411.mjs";
import { t as createComponent } from "./compiler_Bovpdavx.mjs";
import { t as $$BaseLayout } from "./BaseLayout_BhK_tACD.mjs";
//#region src/pages/invoice.astro
var invoice_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Invoice,
	file: () => $$file,
	url: () => $$url
});
var $$Invoice = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Invoice Details & Tracking | Dandy",
		"description": "تفاصيل الفاتورة وتتبع مسار شحن وتوصيل الطلب من متجر داندي.",
		"canonical": "https://dandy-ebon.vercel.app/invoice"
	}, {
		"default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<section class="invoice-section"><div class="container" id="invoiceCard"><div class="invoice-panel" dir="rtl"><div class="invoice-header"><div><h2 class="invoice-title">تمت معالجة الطلب بنجاح!</h2><span class="invoice-code-tag" id="invoiceCode">...جاري التحميل</span><p style="color:var(--color-muted); font-size:0.85rem; margin-top:6px;">تاريخ التسجيل: <span id="invoiceDate">...</span></p></div><div style="text-align: left;"><button id="btnCopyCode" onclick="copyInvoiceToClipboard()" style="background:#fff; border:1px solid var(--border-light); border-radius:99px; padding:6px 14px; font-weight:700; cursor:pointer; font-size:0.85rem; color:var(--color-primary); display:inline-flex; align-items:center; gap:6px; transition:var(--transition-fast);"><i class="fas fa-copy"></i> نسخ الكود</button><div style="margin-top: 10px;"><span class="invoice-badge-status status-new" id="statusBadge">قيد المراجعة</span></div></div></div><div class="cancelled-banner" id="cancelledBanner" style="display:none; background:rgba(184, 67, 79, 0.08); border:1px solid var(--color-danger); color:var(--color-danger); padding:16px; border-radius:var(--border-radius-sm); text-align:center; font-weight:700; margin-bottom:20px;"><i class="fas fa-ban"></i> تم إلغاء هذا الطلب.</div><div class="timeline-container" id="timelineContainer"><div class="timeline-steps"><div class="timeline-progress-bar" id="timelineProgressBar"></div><div class="step-item" id="step-new"><div class="step-circle"><i class="fas fa-asterisk"></i></div><div class="step-label">قيد المراجعة</div></div><div class="step-item" id="step-processing"><div class="step-circle"><i class="fas fa-cog"></i></div><div class="step-label">قيد التجهيز</div></div><div class="step-item" id="step-shipped"><div class="step-circle"><i class="fas fa-truck-moving"></i></div><div class="step-label">تم الشحن</div></div><div class="step-item" id="step-delivered"><div class="step-circle"><i class="fas fa-check-double"></i></div><div class="step-label">تم التوصيل</div></div></div></div><div class="invoice-coords"><div class="coord-card"><h3>بيانات العميل</h3><p>الاسم: <strong id="custName">...</strong></p><p style="margin-top: 8px;">رقم الهاتف: <span id="custPhone">...</span></p><p>البريد الإلكتروني: <span id="custEmail">...</span></p></div><div class="coord-card"><h3>عنوان التوصيل</h3><p>المحافظة: <strong id="custGov">...</strong></p><p style="margin-top: 8px;">المدينة/المنطقة: <span id="custCity">...</span></p><p>تفاصيل الشارع: <span id="custAddress">...</span></p></div></div><table class="invoice-table"><thead><tr><th style="text-align: right;">المنتج</th><th style="text-align: right;">التفاصيل</th><th style="text-align: left; width: 140px;">السعر الإجمالي</th></tr></thead><tbody id="itemsBody"><tr><td colspan="3" style="text-align: center; color: var(--color-muted); padding: 24px;">جاري تحميل المنتجات...</td></tr></tbody><tfoot><tr><td colspan="2" style="text-align: left; font-weight: 700; color: var(--color-muted);">المجموع الفرعي:</td><td id="tableSubtotal" style="text-align: left; font-weight: 700;">...</td></tr><tr><td colspan="2" style="text-align: left; font-weight: 700; color: var(--color-muted);">مصاريف الشحن:</td><td id="tableShipping" style="text-align: left; font-weight: 700; color: var(--color-success);">...</td></tr><tr><td colspan="2" style="text-align: left; font-weight: 800; color: var(--color-primary); font-size: 1.1rem; border-top: 2px solid var(--color-primary);">الإجمالي الكلي:</td><td id="tableGrandTotal" style="text-align: left; font-weight: 800; color: var(--color-primary); font-size: 1.1rem; border-top: 2px solid var(--color-primary);">...</td></tr></tfoot></table><div class="bill-summary"><div><span style="font-size: 0.9rem; color: var(--color-muted); font-weight: 700;">طريقة الدفع</span><div style="font-size: 1.25rem; font-weight: 800; color: var(--color-success);"><i class="fas fa-money-bill-wave"></i> الدفع عند الاستلام (COD)</div></div><div class="invoice-action-pills"><button class="i-btn i-btn-print" id="print-btn"><i class="fas fa-print"></i> طباعة الفاتورة / PDF</button><button class="i-btn i-btn-wp" id="share-whatsapp"><i class="fab fa-whatsapp"></i> تتبع عبر واتساب</button></div></div><div style="margin-top: 40px; border-top: 1px dashed var(--border-light); padding-top: 20px;"><p style="color: var(--color-muted); font-size: 0.9rem; line-height: 1.8;"><strong style="color: var(--color-primary);">تتبع مستمر:</strong>ستتلقى تحديثات مرئية فورية لحالة الطلب على هذه الشاشة بينما يقوم فريقنا بتجهيز وشحن طلبك بأمان.</p></div></div></div></section><script>
    const db = firebase.database();

    function sendTelegramNotification(order, orderId) {
      if (localStorage.getItem('notified_' + orderId)) return;

      fetch('/api/send-telegram', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, orderId })
      })
      .then(res => {
        if (res.ok) {
          console.log("تم إرسال الإشعار الآمن عبر Vercel بنجاح");
          localStorage.setItem('notified_' + orderId, 'true');
        } else {
          console.error("فشل السيرفر في إرسال الإشعار");
        }
      })
      .catch(err => console.error("خطأ أثناء الاتصال بالسيرفر الخلفي:", err));
    }

    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    const invoiceParam = params.get('invoice');

    const invoiceCodeEl = document.getElementById('invoiceCode');
    const statusBadge = document.getElementById('statusBadge');
    const invoiceDateEl = document.getElementById('invoiceDate');

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

    function setStatusBadge(status){
      const s = status || 'New';
      
      let label = 'قيد المراجعة';
      let cssClass = 'status-new';
      
      if (s === 'جديد' || s === 'قيد الانتظار' || s === 'New' || s === 'Pending') {
        label = 'قيد المراجعة';
        cssClass = 'status-new';
      } else if (s === 'تم التواصل' || s === 'قيد التجهيز' || s === 'قيد التحضير' || s === 'قيد المعالجة' || s === 'Processing') {
        label = 'قيد التجهيز';
        cssClass = 'status-contact';
      } else if (s === 'تم الشحن' || s === 'جاري الشحن' || s === 'جاري التوصيل' || s === 'شحن' || s === 'Shipped') {
        label = 'تم الشحن';
        cssClass = 'status-contact';
      } else if (s === 'مكتمل' || s === 'تم التوصيل' || s === 'واصل' || s === 'Delivered') {
        label = 'تم التوصيل';
        cssClass = 'status-done';
      } else if (s === 'ملغي' || s === 'Cancelled') {
        label = 'تم الإلغاء';
        cssClass = 'status-done';
      }

      statusBadge.textContent = label;
      statusBadge.className = 'invoice-badge-status ' + cssClass;
      
      setTimelineStatus(s);
    }

    function setTimelineStatus(status) {
      const s = status || 'New';
      
      document.getElementById('step-new').className = 'step-item';
      document.getElementById('step-processing').className = 'step-item';
      document.getElementById('step-shipped').className = 'step-item';
      document.getElementById('step-delivered').className = 'step-item';
      
      document.getElementById('cancelledBanner').style.display = 'none';
      document.getElementById('timelineContainer').style.display = 'block';

      if (s === 'ملغي' || s === 'Cancelled') {
        document.getElementById('cancelledBanner').style.display = 'block';
        document.getElementById('timelineContainer').style.display = 'none';
        return;
      }

      const norm = getNormalizedStatus(s);

      if (norm === 'new') {
        document.getElementById('step-new').classList.add('active', 'current');
        document.getElementById('timelineProgressBar').style.width = '0%';
      } else if (norm === 'processing') {
        document.getElementById('step-new').classList.add('active');
        document.getElementById('step-processing').classList.add('active', 'current');
        document.getElementById('timelineProgressBar').style.width = '33%';
      } else if (norm === 'shipped') {
        document.getElementById('step-new').classList.add('active');
        document.getElementById('step-processing').classList.add('active');
        document.getElementById('step-shipped').classList.add('active', 'current');
        document.getElementById('timelineProgressBar').style.width = '66%';
      } else if (norm === 'delivered') {
        document.getElementById('step-new').classList.add('active');
        document.getElementById('step-processing').classList.add('active');
        document.getElementById('step-shipped').classList.add('active');
        document.getElementById('step-delivered').classList.add('active');
        document.getElementById('timelineProgressBar').style.width = '100%';
      }
    }

    function getNormalizedStatus(s) {
      if (s === 'جديد' || s === 'قيد الانتظار' || s === 'New' || s === 'Pending') return 'new';
      if (s === 'تم التواصل' || s === 'قيد التجهيز' || s === 'قيد التحضير' || s === 'قيد المعالجة' || s === 'Processing') return 'processing';
      if (s === 'تم الشحن' || s === 'جاري الشحن' || s === 'جاري التوصيل' || s === 'شحن' || s === 'Shipped') return 'shipped';
      if (s === 'مكتمل' || s === 'تم التوصيل' || s === 'واصل' || s === 'Delivered') return 'delivered';
      return 'new';
    }

    window.copyInvoiceToClipboard = function() {
      const code = invoiceCodeEl.textContent;
      if (code && code !== '...جاري التحميل' && code !== '...Loading') {
        navigator.clipboard.writeText(code).then(() => {
          const btn = document.getElementById('btnCopyCode');
          btn.innerHTML = '<i class="fas fa-check"></i> تم النسخ!';
          setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-copy"></i> نسخ الكود';
          }, 2000);
        });
      }
    };

    function drawOrder(order, key) {
      invoiceCodeEl.textContent = order.invoiceCode || key || '-';
      invoiceDateEl.textContent = order.timestamp ? new Date(order.timestamp).toLocaleString('en-US') : new Date().toLocaleString('en-US');

      custName.textContent = order.name || '-';
      custPhone.textContent = order.phone || '-';
      custEmail.textContent = order.email || 'غير متوفر';
      custAddress.textContent = order.address || '-';
      custGov.textContent = order.governorate || '-';
      custCity.textContent = order.city || '-';

      itemsBody.innerHTML = '';
      let calculatedSubtotal = 0;

      if (order.products && order.products.length > 0) {
        order.products.forEach(p => {
          const quantity = parseInt(p.quantity) || 1;
          const lineTotal = (typeof p.lineTotal === 'number')
            ? p.lineTotal
            : (Number(p.price) || 0) * (Number(p.quantity) || 1);

          calculatedSubtotal += lineTotal;

          let displayPriceText = lineTotal.toFixed(0) + " ج.م";
          if (p.discount && typeof p.lineTotal !== 'number') {
            const price = parseFloat(p.price) || 0;
            const discountAmount = (price * parseFloat(p.discount)) / 100;
            const finalPrice = price - discountAmount;
            displayPriceText = \`\${(finalPrice * quantity).toFixed(0)} ج.م <span class="price-crossed">\${(price * quantity).toFixed(0)}</span>\`;
          }

          // استخراج الرائحة حصراً من snapshot المحفوظ داخل order.products
          const varInfo = typeof getVariantsDisplayInfo === 'function'
            ? getVariantsDisplayInfo(p)
            : (p.selectedVariant && p.selectedVariant.name ? { count: 1, label: 'الرائحة', text: p.selectedVariant.name } : null);

          let detailsHtml = '';
          if (varInfo && varInfo.text && String(varInfo.text).trim() !== '' && varInfo.text !== 'undefined') {
            detailsHtml = \`
              <div style="display:inline-flex; align-items:center; gap:6px; font-size:0.88rem; color:var(--color-blush); font-weight:600;">
                <i class="fas fa-spray-can" style="font-size:0.75rem;"></i>
                <span>\${varInfo.label}: <strong>\${varInfo.text}</strong> × \${quantity}</span>
              </div>
            \`;
          } else {
            detailsHtml = \`
              <span style="font-size:0.88rem; color:var(--color-muted); font-weight:600;">× \${quantity}</span>
            \`;
          }

          const tr = document.createElement('tr');
          tr.innerHTML = \`
            <td>
              <div style="display:flex; align-items:center; gap:10px;">
                <img loading="lazy" src="\${p.image}" alt="\${p.name}" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1608248597481-496100c80836?auto=format&fit=crop&w=100&q=80';">
                <strong style="color:var(--color-primary); font-size:0.95rem;">\${p.name}</strong>
              </div>
            </td>
            <td>
              \${detailsHtml}
            </td>
            <td style="text-align: left; font-weight:800; color:var(--color-blush); white-space:nowrap;">\${displayPriceText}</td>
          \`;
          itemsBody.appendChild(tr);
        });

        const subtotalVal = order.subtotal !== undefined ? parseFloat(order.subtotal) : calculatedSubtotal;
        const shippingVal = order.shippingFee !== undefined ? parseFloat(order.shippingFee) : 0;
        const totalVal = order.totalAmount !== undefined ? parseFloat(order.totalAmount) : (subtotalVal + shippingVal);

        tableSubtotal.textContent = subtotalVal.toFixed(0) + " ج.م";
        tableShipping.textContent = shippingVal.toFixed(0) + " ج.م";
        tableGrandTotal.textContent = totalVal.toFixed(0) + " ج.م";

        // =========================================================================
        // إضافة حدث الشراء (Meta Pixel Purchase Event)
        // =========================================================================
        const transactionId = order.invoiceCode || key;
        const storageKey = 'meta_pixel_purchase_fired_' + transactionId;

        if (typeof fbq !== 'undefined' && !sessionStorage.getItem(storageKey)) {
          const contentIds = order.products.map(p => p.id || p.productId || p.name);

          fbq('track', 'Purchase', {
            content_type: 'product',
            content_ids: contentIds,
            value: parseFloat(totalVal.toFixed(2)),
            currency: 'EGP',
            transaction_id: transactionId
          });

          sessionStorage.setItem(storageKey, 'true');
          console.log('✅ Meta Pixel [Purchase] Event fired successfully for:', transactionId);
        }

      } else {
        itemsBody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--color-muted);padding:20px;">سلة المشتريات فارغة.</td></tr>';
        tableSubtotal.textContent = '0 ج.م';
        tableShipping.textContent = '0 ج.م';
        tableGrandTotal.textContent = '0 ج.م';
      }

      setStatusBadge(order.status || 'New');

      const currentStatus = order.status || 'New';
      if ((currentStatus === 'جديد' || currentStatus === 'New' || currentStatus === 'Pending' || currentStatus === 'قيد الانتظار') && key) {
        sendTelegramNotification(order, key);
      }
    }

    function orderError() {
      document.getElementById('invoiceCard').innerHTML = \`
        <div style="text-align:center; padding:80px 20px; background:#fff; border:1px solid var(--border-light); border-radius:var(--border-radius-lg); box-shadow:var(--shadow-sm); max-width:600px; margin:0 auto;" dir="rtl">
          <i class="fas fa-exclamation-circle" style="font-size:3.5rem; color:var(--color-danger); margin-bottom:16px;"></i>
          <h2 style="font-family:'Space Grotesk', sans-serif;">الفاتورة غير موجودة</h2>
          <p style="color:var(--color-muted); margin-top:8px;">يرجى التحقق من كود الفاتورة أو التواصل مع خدمة العملاء.</p>
          <a href="/" class="btn-checkout-primary" style="margin-top:20px; border-radius:99px; padding:12px 24px; text-decoration:none;">العودة للرئيسية</a>
        </div>
      \`;
    }

    if (idParam) {
      const ref = db.ref('orders/' + idParam);
      ref.on('value', snap => {
        if(snap.exists()) drawOrder(snap.val(), idParam);
        else orderError();
      });
    } else if (invoiceParam) {
      const query = db.ref('orders').orderByChild('invoiceCode').equalTo(invoiceParam);
      query.on('value', snap => {
        if (snap.exists()) {
          let matched = false;
          snap.forEach(child => {
            if(!matched) { drawOrder(child.val(), child.key); matched = true; }
          });
        } else orderError();
      });
    } else {
      orderError();
    }

    document.getElementById('print-btn')?.addEventListener('click', () => window.print());

    document.getElementById('share-whatsapp')?.addEventListener('click', () => {
      const wpInquiry = \`مرحباً، أود الاستعلام عن حالة شحن طلب Dandy الخاص بي:\\n- كود الفاتورة: \${invoiceCodeEl.textContent}\\n- العميل: \${custName.textContent}\\n- الحالة الحالية: \${statusBadge.textContent}\\n- رابط التتبع: \${window.location.href}\`;
      window.open(\`https://wa.me/201038941005?text=\${encodeURIComponent(wpInquiry)}\`, '_blank');
    });
  <\/script>`,
		"head": ($$result) => renderTemplate`${renderSlot($$result, $$slots["head"], renderTemplate`<meta name="robots" content="noindex, nofollow">`)}`
	})}`;
}, "/app/applet/src/pages/invoice.astro", void 0);
var $$file = "/app/applet/src/pages/invoice.astro";
var $$url = "/invoice";
//#endregion
//#region \0virtual:astro:page:src/pages/invoice@_@astro
var page = () => invoice_exports;
//#endregion
export { page };
