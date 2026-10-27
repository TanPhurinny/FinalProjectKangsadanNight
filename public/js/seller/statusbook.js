(function () {
  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString('th-TH')} บาท`;
  }

  // ไม่เปิดเผยเลขล็อกจนกว่าจะยืนยันสลิปโอนเงินเสร็จ (backend ส่ง slotLabel เป็น null ไว้แล้ว)
  function lockMention(slotLabel) {
    return slotLabel ? `ล็อก ${slotLabel}` : 'ล็อกของคุณ';
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('th-TH', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function formatTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function bookingStep(status) {
    switch (status) {
      case 'APPROVED':
        return 1;
      case 'IN_PROGRESS':
        return 2;
      case 'SUCCESS':
        return 3;
      case 'REJECTED':
      case 'PENDING':
      default:
        return 1;
    }
  }

  function statusMeta(status, awaitingPaymentVerification, isExtension) {
    // คำขอต่อล็อก (ร้านเดิมต่อล็อกเดิม) ข้ามขั้นตรวจร้าน/จัดล็อก เริ่มที่รอชำระเงินเลย
    if (isExtension && status === 'IN_PROGRESS') {
      return awaitingPaymentVerification
        ? { text: 'ต่อล็อก · ส่งสลิปแล้ว รอแอดมินยืนยัน', badge: 'bg-warning text-dark', icon: 'bi-hourglass-split' }
        : { text: 'ต่อล็อกเดิมแล้ว รอชำระเงิน', badge: 'bg-info text-dark', icon: 'bi-arrow-repeat' };
    }
    if (isExtension && status === 'SUCCESS') {
      return { text: 'ต่อล็อกสำเร็จ', badge: 'bg-success text-white', icon: 'bi-patch-check-fill' };
    }
    switch (status) {
      case 'APPROVED':
        return { text: 'ร้านผ่านตรวจสอบ รอจัดล็อก', badge: 'bg-primary text-white', icon: 'bi-shop-window' };
      case 'IN_PROGRESS':
        return awaitingPaymentVerification
          ? { text: 'ส่งสลิปแล้ว รอแอดมินยืนยัน', badge: 'bg-warning text-dark', icon: 'bi-hourglass-split' }
          : { text: 'ได้รับล็อกแล้ว รอชำระเงิน', badge: 'bg-info text-dark', icon: 'bi-wallet2' };
      case 'SUCCESS':
        return { text: 'เสร็จสิ้นการจอง', badge: 'bg-success text-white', icon: 'bi-patch-check-fill' };
      case 'REJECTED':
        return { text: 'ไม่ผ่านการตรวจสอบ', badge: 'bg-danger text-white', icon: 'bi-x-circle-fill' };
      case 'PENDING':
      default:
        return { text: 'รอการตรวจสอบร้านค้า', badge: 'bg-warning text-dark', icon: 'bi-search' };
    }
  }

  function getPageData() {
    const body = document.body;
    const rawData = body?.dataset?.pageData;
    if (rawData) {
      try {
        return JSON.parse(decodeURIComponent(rawData));
      } catch (error) {
        return { booking: null, notifications: [] };
      }
    }

    return window.BOOKING_PAGE_DATA || { booking: null, notifications: [] };
  }

  function renderStepper(booking) {
    const container = document.getElementById('progressStepContainer');
    if (!container) return;

    const step = booking ? bookingStep(booking.status) : 1;
    const items = [
      { id: 1, label: 'รอการตรวจสอบ', icon: 'bi-search' },
      { id: 2, label: 'ชำระเงิน', icon: 'bi-wallet2' },
      { id: 3, label: 'เสร็จสิ้นการจอง', icon: 'bi-patch-check-fill' }
    ];

    container.innerHTML = items.map((item) => {
      const isActive = step === item.id;
      const isDone = step > item.id;
      return `
        <div class="step-item ${isDone ? 'completed' : ''} ${isActive ? 'active' : ''}">
          <div class="step-icon-circle">${isDone ? '<i class="bi bi-check-lg"></i>' : `<i class="bi ${item.icon}"></i>`}</div>
          <div class="step-text">${item.label}</div>
          ${item.id < 3 ? `<div class="step-connector ${step > item.id ? 'filled' : ''}"></div>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderBookingCard(booking) {
    const badgeContainer = document.getElementById('statusBadgeContainer');
    const scenarioContent = document.getElementById('scenarioContent');
    const dateEl = document.getElementById('bookingDate');
    const timeEl = document.getElementById('bookingTime');
    const numberEl = document.getElementById('bookingNumber');

    if (dateEl) dateEl.textContent = booking ? booking.createdAt : '-';
    if (timeEl) timeEl.textContent = booking ? booking.createdTime : '-';
    if (numberEl) numberEl.textContent = booking ? `#BK-${String(booking.id).padStart(6, '0')}` : '#BK-000000';

    if (badgeContainer) {
      if (!booking) {
        badgeContainer.innerHTML = '<span class="badge bg-secondary text-white px-3 py-2">ยังไม่มีรายการจอง</span>';
      } else {
        const meta = statusMeta(booking.status, booking.awaitingPaymentVerification, booking.isExtension);
        badgeContainer.innerHTML = `<span class="badge ${meta.badge} px-3 py-2"><i class="bi ${meta.icon} me-1"></i>${meta.text}</span>`;
      }
    }

    if (!scenarioContent) return;

    if (!booking) {
      scenarioContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon"><i class="bi bi-inbox"></i></div>
          <h3>ยังไม่มีรายการจอง</h3>
          <p>เริ่มต้นที่หน้าเลือกโซนเพื่อสร้างรายการจองใหม่</p>
          <a href="/select-zone" class="btn btn-custom-primary btn-custom px-4">ไปเลือกโซน</a>
        </div>
      `;
      return;
    }

    // ร้านที่มีล็อกอยู่แล้ว (หรือรายการนี้เป็นการต่อล็อก) ไม่ใช่การจองแผงใหม่ — ปุ่มหลักคือต่อล็อก จองเพิ่มเป็นปุ่มรอง
    const step = bookingStep(booking.status);
    const pageData = getPageData();
    const isExistingShop = Boolean(pageData.hasActiveLock || booking.isExtension);
    let bookingActionButton;
    if (isExistingShop) {
      bookingActionButton = `
        ${pageData.canExtendLock ? `<a href="/booking-stall/extend" class="btn btn-custom-primary btn-custom w-100 py-3 shadow-sm text-center"><i class="bi bi-arrow-repeat me-2"></i>ต่อล็อก</a>` : ''}
        <a href="/select-zone" class="btn btn-outline-primary btn-custom w-100 py-3 text-center"><i class="bi bi-plus-circle me-2"></i>จองล็อกเพิ่ม</a>`;
    } else {
      bookingActionButton = step >= 2
        ? `<a href="/select-zone" class="btn btn-custom-primary btn-custom w-100 py-3 shadow-sm text-center"><i class="bi bi-grid me-2"></i>จองแผงใหม่</a>`
        : `<a href="/select-zone" class="btn btn-outline-primary btn-custom w-100 py-3 text-center"><i class="bi bi-plus-circle me-2"></i>จองเพิ่ม</a>`;
    }

    let paymentSection = '';
    if (booking.status === 'IN_PROGRESS' && booking.awaitingPaymentVerification) {
      let slipVerifyAlert = '';
      if (booking.slipVerified === true) {
        slipVerifyAlert = `<div class="pay-alert pay-alert--success"><i class="bi bi-patch-check-fill"></i><span>ระบบตรวจสอบสลิปอัตโนมัติแล้ว: <strong>สลิปจริง ยอดถูกต้อง</strong> รอแอดมินยืนยันขั้นสุดท้าย</span></div>`;
      } else if (booking.slipVerified === false) {
        slipVerifyAlert = `<div class="pay-alert pay-alert--danger"><i class="bi bi-exclamation-triangle-fill"></i><span>ระบบตรวจสอบสลิปอัตโนมัติแล้วพบปัญหา: <strong>${booking.slipVerifyReason || 'ตรวจสอบไม่ผ่าน'}</strong> — ถ้ามั่นใจว่าโอนถูกต้องแล้ว กรุณาติดต่อแอดมิน</span></div>`;
      } else if ((booking.slipVerifyReason || '').startsWith('[ตรวจเอง]')) {
        // ตรวจอัตโนมัติไม่ได้ (สลิปไม่มี QR / ระบบตรวจสลิปใช้ไม่ได้) — ไม่ได้แปลว่าสลิปผิด แค่รอแอดมินตรวจเอง
        // ปัญหาฝั่งระบบ (เช่น "Package ของคุณหมดอายุแล้ว" จาก SlipOK) ผู้ขายไม่ต้องรู้สาเหตุ — แอดมินยังเห็นเต็มในหน้าอนุมัติ
        const isNoQr = booking.slipVerifyReason.includes('QR');
        const sellerReason = isNoQr
          ? booking.slipVerifyReason.replace('[ตรวจเอง]', '').trim()
          : 'ระบบตรวจสลิปอัตโนมัติใช้งานไม่ได้ชั่วคราว แอดมินจะตรวจเอง';
        slipVerifyAlert = `<div class="pay-alert pay-alert--warning"><i class="bi bi-qr-code-scan"></i><span>${sellerReason} — อาจใช้เวลานานกว่าปกติ</span></div>`;
      }
      paymentSection = `
        <div class="pay-box">
          <div class="pay-box__title"><i class="bi bi-hourglass-split"></i>ชำระเงินแล้ว รอแอดมินตรวจสลิป</div>
          ${slipVerifyAlert}
          <p class="pay-box__note">แอดมินกำลังตรวจสอบสลิปโอนเงินของคุณสำหรับ<strong>${lockMention(booking.slotLabel)}</strong> เมื่อยืนยันแล้ว ระบบจะแจ้งเลขล็อกและยืนยันว่าเป็นของคุณอย่างเป็นทางการ</p>
          <img src="${booking.paymentSlipImage}" alt="สลิปโอนเงินที่ส่งไปแล้ว" class="pay-slip-preview" />
          <form action="/booking-payment/remove-slip" method="POST" class="mt-3 js-remove-slip-form">
            <button type="submit" class="btn btn-outline-danger btn-custom"><i class="bi bi-arrow-repeat me-1"></i>ลบสลิปแล้วอัปโหลดใหม่</button>
          </form>
        </div>
      `;
    } else if (booking.status === 'IN_PROGRESS') {
      const slipRejectedAlert = (booking.slipVerifyReason || '').startsWith('[แอดมินปฏิเสธสลิป]')
        ? `<div class="pay-alert pay-alert--danger"><i class="bi bi-x-octagon-fill"></i><span>สลิปที่ส่งไปไม่ผ่านการตรวจสอบ: <strong>${booking.slipVerifyReason.replace('[แอดมินปฏิเสธสลิป]', '').trim()}</strong> กรุณาอัปโหลดสลิปใหม่</span></div>`
        : '';
      // กำหนดชำระเงินที่แอดมินกำหนดตอนจัดล็อก (ปกติ 6 ชม. หรือก่อนตลาดเปิดของวันเริ่มขาย — ดู utils/paymentDeadline.js)
      const paymentDeadlineAlert = booking.paymentDeadline
        ? `<div class="pay-alert ${booking.paymentDeadlineOverdue ? 'pay-alert--danger' : 'pay-alert--warning'}"><i class="bi bi-alarm-fill"></i><span>${booking.paymentDeadlineSameDay
          ? (booking.paymentDeadlineOverdue ? 'เลยกำหนดชำระแล้ว (ขายวันนี้ต้องชำระก่อนตลาดเปิด)' : 'ขายวันนี้ ต้องชำระก่อนตลาดเปิด')
          : (booking.paymentDeadlineOverdue ? 'ใบเสนอราคาหมดอายุแล้ว (เลยกำหนดชำระ)' : 'กรุณาชำระเงินภายใน')}: <strong>${booking.paymentDeadline}</strong></span></div>`
        : '';
      // ส่วนลดชดเชยฝนตก (utils/rainCompensation.js) — ต้องใช้ทั้งหมดในครั้งเดียว ส่วนที่เกินยอดจะหายไป
      const wallet = booking.rainWallet || {};
      const payable = typeof booking.payableTotal === 'number' ? booking.payableTotal : booking.grandTotal;
      let rainBox = '';
      if (booking.rainDiscount > 0) {
        rainBox = `
          <div class="rain-pay rain-pay--used">
            <div><i class="bi bi-cloud-rain-fill me-1"></i>ใช้ส่วนลดชดเชยฝนตกแล้ว <strong>-${formatMoney(booking.rainDiscount)}</strong> เหลือโอน <strong>${formatMoney(payable)}</strong></div>
            ${booking.rainDiscountForfeit > 0 ? `<div class="rain-pay__hint">ส่วนลดเกินยอด ${formatMoney(booking.rainDiscountForfeit)} ไม่ถูกเก็บไว้</div>` : ''}
            <form action="/booking-payment/rain-discount/cancel" method="POST" class="rain-pay__form">
              <button type="submit" class="btn btn-sm btn-outline-secondary">ยกเลิกใช้ส่วนลด</button>
            </form>
          </div>`;
      } else if (wallet.canApply) {
        const over = Math.max(0, Math.floor(wallet.total - booking.grandTotal));
        rainBox = `
          <div class="rain-pay">
            <div><i class="bi bi-cloud-rain-fill me-1"></i>คุณมีส่วนลดชดเชยฝนตก <strong>${formatMoney(wallet.total)}</strong> (${wallet.count} ครั้ง)</div>
            <div class="rain-pay__hint">ต้องใช้ทั้งหมดในครั้งเดียว แลกเป็นเงินสดไม่ได้${over > 0 ? ` — ส่วนลดมากกว่ายอดนี้ ส่วนต่าง ${formatMoney(over)} จะหายไป ไม่ถูกเก็บไว้` : ''}</div>
            <form action="/booking-payment/rain-discount" method="POST" class="rain-pay__form js-rain-discount-form" data-over="${over}" data-payable="${Math.max(0, booking.grandTotal - wallet.total)}">
              <button type="submit" class="btn btn-custom-primary btn-custom"><i class="bi bi-tag-fill me-1"></i>ใช้ส่วนลดทั้งหมด ${formatMoney(wallet.total)}</button>
            </form>
          </div>`;
      }
      paymentSection = `
        <div class="pay-box">
          <div class="pay-box__title"><i class="bi bi-wallet2"></i>อัปโหลดสลิปโอนเงินเพื่อยืนยันการชำระเงิน</div>
          ${slipRejectedAlert}
          ${paymentDeadlineAlert}
          ${rainBox}
          <p class="pay-box__note">${booking.isExtension
            ? `ต่อ${lockMention(booking.slotLabel)}เดิมให้แล้ว ไม่ต้องรอแอดมินจัดล็อก กรุณาชำระเงินและแนบสลิปโอนเงินภายในกำหนด แอดมินตรวจสลิปแล้วล็อกก็เป็นของคุณต่อ`
            : 'แอดมินจัดล็อกให้คุณแล้ว กรุณาชำระเงินและแนบสลิปโอนเงินเพื่อยืนยัน แอดมินจะตรวจสอบสลิปก่อนยืนยันล็อกให้เป็นของคุณ (เลขล็อกจะแจ้งให้ทราบหลังยืนยันการชำระเงิน)'}</p>
          <div class="pay-qr">
            ${booking.promptPayQr ? `<img src="${booking.promptPayQr}" alt="PromptPay QR" />` : ''}
            <div class="pay-qr__row"><span>พร้อมเพย์</span><strong>${booking.promptPayId || '-'}</strong></div>
            <div class="pay-qr__total">${formatMoney(payable)}</div>
          </div>
          <form action="/booking-payment/confirm" method="POST" enctype="multipart/form-data" class="pay-upload-form">
            <input type="file" name="paymentSlip" accept="image/*" required />
            <button type="submit" class="btn btn-custom-primary btn-custom text-nowrap px-4"><i class="bi bi-upload me-1"></i>ส่งสลิปโอนเงิน</button>
          </form>
        </div>
      `;
    } else if (booking.status === 'REJECTED') {
      // เหตุผลจากแอดมิน (ปฏิเสธคำขอ / ยกเลิกเพราะไม่ชำระเงิน) — ไม่มีเหตุผลก็บอกให้ติดต่อแอดมิน
      const reasonText = booking.rejectReason ? escapeHtml(booking.rejectReason) : '';
      paymentSection = `
        <div class="pay-alert pay-alert--danger"><i class="bi bi-x-octagon-fill"></i><span>${reasonText
          ? `แอดมินปฏิเสธ/ยกเลิกคำขอนี้ — เหตุผล: <strong>${reasonText}</strong>`
          : 'แอดมินปฏิเสธ/ยกเลิกคำขอนี้ กรุณาติดต่อแอดมินหากต้องการทราบเหตุผล'}</span></div>
      `;
    } else if (booking.status === 'SUCCESS' && !booking.paymentSlipImage && booking.rainDiscount > 0) {
      paymentSection = `
        <div class="pay-box">
          <div class="pay-box__title text-success-custom"><i class="bi bi-check-circle-fill"></i>ชำระด้วยส่วนลดชดเชยฝนตกครบแล้ว ${lockMention(booking.slotLabel)} เป็นของคุณเรียบร้อย</div>
          <p class="pay-box__note">ใช้ส่วนลด ${formatMoney(booking.rainDiscount)} ครอบคลุมยอดทั้งหมด ไม่ต้องโอนเงิน${booking.rainDiscountForfeit > 0 ? ` (ส่วนลดเกินยอด ${formatMoney(booking.rainDiscountForfeit)} ไม่ถูกเก็บไว้)` : ''}</p>
        </div>
      `;
    } else if (booking.status === 'SUCCESS' && booking.paymentSlipImage) {
      paymentSection = `
        <div class="pay-box">
          <div class="pay-box__title text-success-custom"><i class="bi bi-check-circle-fill"></i>ชำระเงินแล้ว ${lockMention(booking.slotLabel)} เป็นของคุณเรียบร้อย</div>
          <img src="${booking.paymentSlipImage}" alt="สลิปโอนเงิน" class="pay-slip-preview" />
        </div>
      `;
    }

    const priceStatusTag = booking.isFinalPrice
      ? `<span class="quote-card__tag quote-card__tag--final"><i class="bi bi-check-circle-fill"></i>ราคาจริงหลังแอดมินจัดล็อกให้แล้ว</span>`
      : `<span class="quote-card__tag quote-card__tag--estimate"><i class="bi bi-info-circle-fill"></i>ราคาประเมิน (ราคาต่ำสุดของโซน) อาจสูงกว่านี้</span>`;
    const cornerInterestRow = booking.cornerZoneNote
      ? `<div class="quote-card__row"><span><i class="bi bi-star-fill text-warning me-1"></i>สนใจแผงพิเศษ</span><strong>${booking.cornerZoneNote}</strong></div>`
      : '';
    const cornerAssignedTag = booking.isSpecialCornerLot
      ? `<span class="quote-card__tag quote-card__tag--corner"><i class="bi bi-star-fill"></i>ล็อกที่ได้เป็นแผงพิเศษ +${formatMoney(booking.cornerExtraPerDay)}/ล็อก/วัน (รวมในค่าเช่าแล้ว)</span>`
      : '';

    scenarioContent.innerHTML = `
      <div class="quote-card">
        <div class="quote-card__head">
          <span>ใบเสนอราคา${booking.isExtension ? ' · ต่อล็อก' : ''}</span>
          <span>#BK-${String(booking.id).padStart(6, '0')}</span>
        </div>
        <div class="quote-card__round">${booking.roundNumber ? `รอบที่ ${booking.roundNumber}` : '-'} · ${booking.roundDateRangeText || '-'}</div>
        <div class="quote-card__rule"></div>
        <div class="quote-card__row"><span>ผู้จอง</span><strong>${booking.customerName || '-'}</strong></div>
        <div class="quote-card__row"><span>เบอร์</span><strong>${booking.customerPhone || '-'}</strong></div>
        <div class="quote-card__row"><span>ร้าน</span><strong>${booking.shopName || '-'}</strong></div>
        <div class="quote-card__row"><span>ขาย</span><strong>${booking.storeDetailSnapshot || '-'}</strong></div>
        <div class="quote-card__row"><span>ประเภท</span><strong>${booking.productType || '-'}</strong></div>
        <div class="quote-card__rule"></div>
        <div class="quote-card__row"><span>จำนวนล็อค</span><strong>${booking.stallCount} ล็อค</strong></div>
        <div class="quote-card__row"><span>ราคา/ล็อค</span><strong>${formatMoney(booking.dailyStallPrice)}/วัน</strong></div>
        <div class="quote-card__row"><span>โซน / แผง</span><strong>${booking.slotLabel ? `${booking.zoneLabel} / ${booking.slotLabel}` : 'รอยืนยันการชำระเงิน'}</strong></div>
        ${booking.sellDaysList ? `<div class="quote-card__row quote-card__row--note"><span>วันที่ขาย (${booking.rentalDays} วัน)</span><strong>${booking.sellDaysList}</strong></div>` : ''}
        ${cornerInterestRow}
        <div class="quote-card__row"><span>เครื่องใช้ไฟฟ้า</span><strong>${escapeHtml(booking.applianceText || `${booking.smallApplianceCount} เครื่องเล็ก / ${booking.largeApplianceCount} เครื่องใหญ่`)}</strong></div>
        <div class="quote-card__rule"></div>
        ${priceStatusTag}
        ${cornerAssignedTag}
        <div class="quote-card__row"><span>ค่าเช่าแผง</span><strong>${formatMoney(booking.rentTotal)}</strong></div>
        <div class="quote-card__row"><span>ค่าไฟสว่าง</span><strong>${formatMoney(booking.lightTotal)}</strong></div>
        <div class="quote-card__row"><span>ค่าเครื่องใช้ไฟฟ้า/พัดลม</span><strong>${formatMoney(booking.applianceTotal)}</strong></div>
        ${booking.rainDiscount > 0 ? `
        <div class="quote-card__row"><span>ยอดก่อนหักส่วนลด</span><strong>${formatMoney(booking.grandTotal)}</strong></div>
        <div class="quote-card__row"><span><i class="bi bi-cloud-rain me-1"></i>ส่วนลดชดเชยฝนตก</span><strong>-${formatMoney(Math.min(booking.rainDiscount, booking.grandTotal))}</strong></div>` : ''}
        <div class="quote-card__total">
          <span>${booking.isFinalPrice ? 'ยอดชำระรวม (รวม VAT)' : 'ยอดประเมินรวม (รวม VAT)'}</span>
          <strong>${formatMoney(booking.rainDiscount > 0 ? booking.payableTotal : booking.grandTotal)}</strong>
        </div>
      </div>

      ${paymentSection}

      <div class="d-grid gap-2 d-md-flex justify-content-md-end mt-4">
        ${bookingActionButton}
      </div>
    `;
  }

  function renderTimeline(booking) {
    const container = document.getElementById('timelineContainer');
    if (!container) return;

    const step = booking ? bookingStep(booking.status) : 0;
    const items = booking && booking.isExtension ? [
      { title: 'ต่อล็อกเดิม', desc: `ร้านเดิมต่อ${lockMention(booking.slotLabel)} ไม่ต้องรอแอดมินตรวจร้านหรือจัดล็อกใหม่`, stage: 1 },
      { title: 'ชำระเงิน', desc: booking.status === 'IN_PROGRESS'
        ? (booking.awaitingPaymentVerification
          ? 'ส่งสลิปโอนเงินแล้ว รอแอดมินตรวจสอบและยืนยัน'
          : 'กรุณาชำระเงินและอัปโหลดสลิปโอนเงินภายในกำหนด ถ้าไม่ชำระ ล็อกจะกลับไปสิ้นสุดวันเดิม')
        : 'ชำระค่าต่อล็อกและแนบสลิปโอนเงิน', stage: 2 },
      { title: 'ต่อล็อกสำเร็จ', desc: 'ขยายสัญญาล็อกเดิมของคุณเรียบร้อยในระบบ', stage: 3 }
    ] : [
      { title: 'รอการตรวจสอบร้านค้า', desc: 'ระบบได้รับคำขอจองและแอดมินกำลังตรวจสอบร้านค้า', stage: 1 },
      { title: 'ได้รับล็อก / ชำระเงิน', desc: booking && booking.status === 'IN_PROGRESS'
        ? (booking.awaitingPaymentVerification
          ? 'ส่งสลิปโอนเงินแล้ว รอแอดมินตรวจสอบและยืนยัน'
          : 'แอดมินจัดล็อกให้แล้ว กรุณาอัปโหลดสลิปโอนเงิน (เลขล็อกจะแจ้งให้ทราบหลังยืนยันการชำระเงิน)')
        : 'แอดมินจัดสรรล็อกให้ และผู้จองชำระเงินยืนยันสิทธิ์พื้นที่ขาย', stage: 2 },
      { title: 'เสร็จสิ้นการจอง', desc: 'ล็อกถูกบันทึกเป็นของผู้จองเรียบร้อยในระบบ', stage: 3 }
    ];

    container.innerHTML = items.map((item) => `
      <div class="timeline-node ${step >= item.stage ? 'active' : ''}">
        <div class="timeline-marker"></div>
        <h6 class="fw-bold mb-1 ${step >= item.stage ? 'text-dark-custom' : 'text-muted'}">${step >= item.stage ? '✓ ' : ''}${item.title}</h6>
        <p class="text-muted small m-0">${item.desc}</p>
      </div>
    `).join('');
  }

  function initBookingStatusPage() {
    const data = getPageData();
    renderStepper(data.booking || null);
    renderBookingCard(data.booking || null);
    renderTimeline(data.booking || null);
  }

  function switchScenario(step) {
    const data = getPageData();
    const booking = data.booking ? { ...data.booking } : null;
    if (!booking) return;
    if (step === 1) booking.status = 'PENDING';
    if (step === 2) booking.status = 'IN_PROGRESS';
    if (step === 3) booking.status = 'SUCCESS';
    renderStepper(booking);
    renderBookingCard(booking);
    renderTimeline(booking);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.page === 'booking-status') {
      initBookingStatusPage();
    }
  });

  // ปุ่ม "ลบสลิปแล้วอัปโหลดใหม่" — ถามยืนยันด้วยกล่องกลางของเว็บ (public/js/common/dialogs.js) แทน confirm() ของเบราว์เซอร์
  // ฟอร์มถูกวาดด้วย innerHTML เลยดัก submit ที่ document; ยืนยันแล้วส่งด้วย requestSubmit() เพื่อให้ tabSession.js แนบ tabToken
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form.classList || !form.classList.contains('js-remove-slip-form') || form.dataset.confirmed === '1') return;
    if (!window.showConfirmDialog) return;
    event.preventDefault();
    window.showConfirmDialog({
      title: 'ลบสลิปแล้วอัปโหลดใหม่?',
      message: 'สลิปเดิมจะถูกลบออกจากระบบ แล้วคุณแนบสลิปใหม่ได้ทันที\nสลิปใหม่จะถูกตรวจอัตโนมัติอีกครั้ง',
      tone: 'danger',
      icon: 'fa-solid fa-rotate',
      confirmText: 'ลบสลิป',
      cancelText: 'ยกเลิก',
      onConfirm: () => {
        form.dataset.confirmed = '1';
        form.requestSubmit();
      }
    });
  });

  // ปุ่ม "ใช้ส่วนลดทั้งหมด" — ใช้แล้วยกเลิกได้จนกว่าจะส่งสลิป แต่ถ้าส่วนลดครอบคลุมยอดทั้งหมด ระบบยืนยันการชำระเงินทันที
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form.classList || !form.classList.contains('js-rain-discount-form') || form.dataset.confirmed === '1') return;
    if (!window.showConfirmDialog) return;
    event.preventDefault();
    const over = Number(form.dataset.over || 0);
    const payable = Number(form.dataset.payable || 0);
    const lines = ['ส่วนลดชดเชยฝนตกต้องใช้ทั้งหมดในครั้งเดียว'];
    if (over > 0) lines.push(`ส่วนลดมากกว่ายอดที่ต้องจ่าย ส่วนต่าง ${formatMoney(over)} จะหายไป ไม่ถูกเก็บไว้ใช้ครั้งหน้า`);
    lines.push(payable > 0 ? `หักแล้วเหลือโอน ${formatMoney(payable)}` : 'ส่วนลดครอบคลุมยอดทั้งหมด ไม่ต้องโอนเงิน ระบบยืนยันการชำระเงินให้ทันที');
    window.showConfirmDialog({
      title: 'ใช้ส่วนลดชดเชยฝนตก?',
      message: lines.join('\n'),
      icon: 'fa-solid fa-cloud-rain',
      confirmText: 'ใช้ส่วนลด',
      cancelText: 'ยกเลิก',
      onConfirm: () => {
        form.dataset.confirmed = '1';
        form.requestSubmit();
      }
    });
  });

  window.switchScenario = switchScenario;
  window.initBookingStatusPage = initBookingStatusPage;
})();
