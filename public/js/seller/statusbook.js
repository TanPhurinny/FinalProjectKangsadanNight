(function () {
  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString('th-TH')} บาท`;
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

  function statusMeta(status, awaitingPaymentVerification) {
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

    return window.BOOKING_PAGE_DATA || window.NOTIFICATION_PAGE_DATA || { booking: null, notifications: [] };
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
        const meta = statusMeta(booking.status, booking.awaitingPaymentVerification);
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

    const step = bookingStep(booking.status);
    const bookingActionButton = step >= 2
      ? `<a href="/select-zone" class="btn btn-custom-primary btn-custom w-100 py-3 shadow-sm text-center"><i class="bi bi-grid me-2"></i>จองแผงใหม่</a>`
      : `<a href="/select-zone" class="btn btn-outline-primary btn-custom w-100 py-3 text-center"><i class="bi bi-plus-circle me-2"></i>จองเพิ่ม</a>`;

    let paymentSection = '';
    if (booking.status === 'IN_PROGRESS' && booking.awaitingPaymentVerification) {
      paymentSection = `
        <div class="payment-upload-box mt-4 p-3 border rounded-3 bg-light">
          <button type="button" class="btn btn-warning btn-custom disabled mb-2" disabled><i class="bi bi-hourglass-split me-1"></i>ชำระเงินแล้ว รอตรวจ</button>
          <p class="text-muted small mb-3">แอดมินกำลังตรวจสอบสลิปโอนเงินของคุณสำหรับล็อก <strong>${booking.slotLabel}</strong> เมื่อยืนยันแล้ว ระบบจะแจ้งเตือนว่าล็อกนี้เป็นของคุณอย่างเป็นทางการ</p>
          <img src="${booking.paymentSlipImage}" alt="สลิปโอนเงินที่ส่งไปแล้ว" class="img-fluid rounded" style="max-width:260px;" />
        </div>
      `;
    } else if (booking.status === 'IN_PROGRESS') {
      paymentSection = `
        <div class="payment-upload-box mt-4 p-3 border rounded-3 bg-light">
          <h6 class="fw-bold mb-2 text-dark-custom"><i class="bi bi-wallet2 me-2"></i>อัปโหลดสลิปโอนเงินเพื่อยืนยันการชำระเงิน</h6>
          <p class="text-muted small mb-3">คุณได้รับล็อก <strong>${booking.slotLabel}</strong> แล้ว กรุณาชำระเงินและแนบสลิปโอนเงินเพื่อยืนยัน แอดมินจะตรวจสอบสลิปก่อนยืนยันล็อกให้เป็นของคุณ</p>
          <div class="bank-transfer-box mb-3 p-3 border rounded-3 bg-white">
            <h6 class="fw-bold mb-2 text-dark-custom"><i class="bi bi-bank me-2"></i>บัญชีสำหรับโอนเงิน</h6>
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-1">
              <span class="text-muted small">ธนาคาร</span>
              <span class="fw-semibold">กสิกรไทย (KBank)</span>
            </div>
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-1">
              <span class="text-muted small">ชื่อบัญชี</span>
              <span class="fw-semibold">ตลาดนัดกังสดาลไนท์</span>
            </div>
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-1">
              <span class="text-muted small">เลขที่บัญชี</span>
              <span class="fw-semibold">123-4-56789-0</span>
            </div>
            <p class="text-muted small mb-0 mt-2"><i class="bi bi-info-circle me-1"></i>เลขบัญชีนี้เป็นข้อมูลจำลองสำหรับสาธิตระบบเท่านั้น</p>
          </div>
          <form action="/booking-payment/confirm" method="POST" enctype="multipart/form-data" class="d-flex flex-column flex-sm-row gap-2">
            <input type="file" name="paymentSlip" accept="image/*" class="form-control" required />
            <button type="submit" class="btn btn-custom-primary btn-custom text-nowrap px-4"><i class="bi bi-upload me-1"></i>ส่งสลิปโอนเงิน</button>
          </form>
        </div>
      `;
    } else if (booking.status === 'SUCCESS' && booking.paymentSlipImage) {
      paymentSection = `
        <div class="payment-upload-box mt-4 p-3 border rounded-3 bg-light">
          <h6 class="fw-bold mb-2 text-success-custom"><i class="bi bi-check-circle-fill me-2"></i>ชำระเงินแล้ว ล็อก ${booking.slotLabel} เป็นของคุณเรียบร้อย</h6>
          <img src="${booking.paymentSlipImage}" alt="สลิปโอนเงิน" class="img-fluid rounded" style="max-width:260px;" />
        </div>
      `;
    }

    scenarioContent.innerHTML = `
      <div class="booking-summary-grid">
        <div class="summary-pill">
          <small>เลขที่การจอง</small>
          <strong>#BK-${String(booking.id).padStart(6, '0')}</strong>
        </div>
        <div class="summary-pill">
          <small>โซน / แผง</small>
          <strong>${booking.zoneLabel} / ${booking.slotLabel}</strong>
        </div>
        <div class="summary-pill">
          <small>วันที่เช่า</small>
          <strong>${booking.rentalStartDate} - ${booking.rentalEndDate}</strong>
        </div>
        <div class="summary-pill">
          <small>จำนวนล็อก</small>
          <strong>${booking.stallCount} ล็อก</strong>
        </div>
      </div>

      <div class="details-box">
        <div class="details-row"><span>ค่าเช่าแผง</span><strong>${formatMoney(booking.rentTotal)}</strong></div>
        <div class="details-row"><span>ค่าไฟสว่าง</span><strong>${formatMoney(booking.lightTotal)}</strong></div>
        <div class="details-row"><span>ค่าเครื่องใช้ไฟฟ้า</span><strong>${formatMoney(booking.applianceTotal)}</strong></div>
        <div class="details-row"><span>รวมทั้งสิ้น</span><strong>${formatMoney(booking.grandTotal)}</strong></div>
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
    const items = [
      { title: 'รอการตรวจสอบร้านค้า', desc: 'ระบบได้รับคำขอจองและแอดมินกำลังตรวจสอบร้านค้า', stage: 1 },
      { title: 'ได้รับล็อก / ชำระเงิน', desc: booking && booking.status === 'IN_PROGRESS'
        ? (booking.awaitingPaymentVerification
          ? `ส่งสลิปโอนเงินสำหรับล็อก ${booking.slotLabel} แล้ว รอแอดมินตรวจสอบและยืนยัน`
          : `ได้รับล็อก ${booking.slotLabel} แล้ว กรุณาอัปโหลดสลิปโอนเงิน`)
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

  function renderNotificationPage(notifications, booking) {
    const list = document.getElementById('notificationList');
    if (!list) return;

    const notificationData = Array.isArray(notifications) ? notifications : [];
    const unreadCount = notificationData.filter((item) => !item.isRead).length;
    const readCount = notificationData.length - unreadCount;

    const badgeAll = document.getElementById('badgeAll');
    const badgeUnread = document.getElementById('badgeUnread');
    const badgeRead = document.getElementById('badgeRead');
    const globalBadge = document.getElementById('globalNavBadge');
    if (badgeAll) badgeAll.textContent = String(notificationData.length);
    if (badgeUnread) badgeUnread.textContent = String(unreadCount);
    if (badgeRead) badgeRead.textContent = String(readCount);
    if (globalBadge) globalBadge.textContent = String(unreadCount);

    if (!notificationData.length) {
      list.innerHTML = `
        <div class="col-12">
          <div class="empty-state empty-state--card">
            <div class="empty-state__icon"><i class="bi bi-bell-slash"></i></div>
            <h3>ยังไม่มีการแจ้งเตือน</h3>
            <p>เมื่อมีการเปลี่ยนสถานะการจอง ระบบจะแสดงรายการที่นี่</p>
            <a href="/booking-status" class="btn btn-custom-primary btn-custom px-4">ไปหน้าสถานะการจอง</a>
          </div>
        </div>
      `;
      return;
    }

    list.innerHTML = notificationData.map((item) => {
      const iconMap = {
        'pending-review': ['bi-search', 'border-type-pending-review', 'text-warning'],
        'pending-payment': ['bi-wallet2', 'border-type-pending-payment', 'text-warning'],
        'success-payment': ['bi-check-circle-fill', 'border-type-success', 'text-success-custom'],
        'success-receipt': ['bi-file-earmark-text', 'border-type-success', 'text-success-custom'],
        'cancelled': ['bi-x-circle-fill', 'border-type-cancelled', 'text-danger']
      };
      const [iconClass, borderClass, iconColor] = iconMap[item.type] || ['bi-bell', 'border-type-pending-review', 'text-warning'];

      return `
        <div class="col-12">
          <div class="card card-custom noti-card-item mb-3 ${item.isRead ? 'read' : 'unread'} ${borderClass} hover-lift slide-up">
            <div class="card-body d-flex p-3 justify-content-between align-items-start flex-wrap gap-2">
              <div class="d-flex gap-3 align-items-start flex-grow-1">
                <div class="icon-shape bg-light ${iconColor}">
                  <i class="bi ${iconClass} fs-4"></i>
                </div>
                <div>
                  <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
                    <h6 class="fw-bold m-0 text-dark-custom">${item.title}</h6>
                    ${item.isNew ? '<span class="badge bg-danger-custom text-white font-monospace px-2 py-1" style="font-size:0.65rem;">NEW</span>' : ''}
                  </div>
                  <p class="text-muted small mb-2">${item.desc}</p>
                  <span class="text-muted" style="font-size:0.75rem;"><i class="bi bi-clock me-1"></i>${item.date} | ${item.time}</span>
                </div>
              </div>
              <button class="btn btn-sm btn-light border hover-lift px-3 text-nowrap ms-auto align-self-center" onclick="openNotiModal('${item.id}')">ดูรายละเอียด</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    window.__notificationData = notificationData;
    window.__bookingForNotification = booking || null;
  }

  function openNotiModal(id) {
    const notifications = window.__notificationData || [];
    const item = notifications.find((entry) => String(entry.id) === String(id));
    if (!item) return;

    const modalTitle = document.getElementById('modalNotiTitle');
    const modalBody = document.getElementById('modalNotiBody');
    if (modalTitle) modalTitle.textContent = item.title;
    if (modalBody) {
      modalBody.innerHTML = `
        <div class="text-center mb-4">
          <i class="bi bi-info-circle text-primary-custom fs-1"></i>
          <h5 class="fw-bold mt-2">รายละเอียดการแจ้งเตือน</h5>
        </div>
        <div class="details-box">
          <div class="details-row"><span>ประเภท</span><strong>${item.type}</strong></div>
          <div class="details-row"><span>ข้อความ</span><strong>${item.desc}</strong></div>
          <div class="details-row"><span>วันที่</span><strong>${item.date} ${item.time}</strong></div>
        </div>
      `;
    }

    if (window.bootstrap && document.getElementById('notiModal')) {
      const modal = new bootstrap.Modal(document.getElementById('notiModal'));
      modal.show();
    }
  }

  function initBookingStatusPage() {
    const data = getPageData();
    renderStepper(data.booking || null);
    renderBookingCard(data.booking || null);
    renderTimeline(data.booking || null);
  }

  function initNotificationsPage() {
    const data = getPageData();
    renderNotificationPage(data.notifications || [], data.booking || null);
  }

  function filterNotifications(type) {
    const data = window.__notificationData || [];
    const list = document.getElementById('notificationList');
    if (!list) return;

    const filtered = data.filter((item) => {
      if (type === 'all') return true;
      if (type === 'unread') return !item.isRead;
      if (type === 'read') return item.isRead;
      return true;
    });

    if (!filtered.length) {
      list.innerHTML = `
        <div class="col-12">
          <div class="empty-state empty-state--card">
            <div class="empty-state__icon"><i class="bi bi-inbox"></i></div>
            <h3>ไม่มีข้อมูลในหมวดหมู่นี้</h3>
            <p>ลองเลือกหมวดอื่นหรือกลับไปดูสถานะการจอง</p>
          </div>
        </div>
      `;
      return;
    }

    list.innerHTML = filtered.map((item) => {
      const iconMap = {
        'pending-review': ['bi-search', 'border-type-pending-review', 'text-warning'],
        'pending-payment': ['bi-wallet2', 'border-type-pending-payment', 'text-warning'],
        'success-payment': ['bi-check-circle-fill', 'border-type-success', 'text-success-custom'],
        'success-receipt': ['bi-file-earmark-text', 'border-type-success', 'text-success-custom'],
        'cancelled': ['bi-x-circle-fill', 'border-type-cancelled', 'text-danger']
      };
      const [iconClass, borderClass, iconColor] = iconMap[item.type] || ['bi-bell', 'border-type-pending-review', 'text-warning'];
      return `
        <div class="col-12">
          <div class="card card-custom noti-card-item mb-3 ${item.isRead ? 'read' : 'unread'} ${borderClass} hover-lift slide-up">
            <div class="card-body d-flex p-3 justify-content-between align-items-start flex-wrap gap-2">
              <div class="d-flex gap-3 align-items-start flex-grow-1">
                <div class="icon-shape bg-light ${iconColor}"><i class="bi ${iconClass} fs-4"></i></div>
                <div>
                  <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
                    <h6 class="fw-bold m-0 text-dark-custom">${item.title}</h6>
                    ${item.isNew ? '<span class="badge bg-danger-custom text-white font-monospace px-2 py-1" style="font-size:0.65rem;">NEW</span>' : ''}
                  </div>
                  <p class="text-muted small mb-2">${item.desc}</p>
                  <span class="text-muted" style="font-size:0.75rem;"><i class="bi bi-clock me-1"></i>${item.date} | ${item.time}</span>
                </div>
              </div>
              <button class="btn btn-sm btn-light border hover-lift px-3 text-nowrap ms-auto align-self-center" onclick="openNotiModal('${item.id}')">ดูรายละเอียด</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function markAllAsRead() {
    const data = window.__notificationData || [];
    data.forEach((item) => {
      item.isRead = true;
      item.isNew = false;
    });
    renderNotificationPage(data, window.__bookingForNotification || null);
    if (window.bootstrap) {
      const toastEl = document.getElementById('liveToast');
      if (toastEl) {
        const toast = new bootstrap.Toast(toastEl, { delay: 2500 });
        const titleEl = document.getElementById('toastTitle');
        const messageEl = document.getElementById('toastMessage');
        if (titleEl) titleEl.textContent = 'ระบบอัปเดตสำเร็จ';
        if (messageEl) messageEl.textContent = 'ปรับสถานะการแจ้งเตือนเป็นอ่านแล้วทั้งหมด';
        toast.show();
      }
    }
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
    if (document.body.dataset.page === 'notifications') {
      initNotificationsPage();
    }
  });

  window.openNotiModal = openNotiModal;
  window.markAllAsRead = markAllAsRead;
  window.filterNotifications = filterNotifications;
  window.switchScenario = switchScenario;
  window.initNotificationsPage = initNotificationsPage;
  window.initBookingStatusPage = initBookingStatusPage;
})();
