// เลื่อนหน้าไปหาแบนเนอร์แจ้งเตือน (error/warning) อัตโนมัติหลัง redirect กลับมา
// กันแอดมินพลาดเห็นตอนหน้ายาวและ scroll ผ่านไปแล้ว — ไม่ใช้ pop up เพราะแอดมินต้องเลื่อนดูรูปสลิป
// เทียบยอดไปพร้อมกันด้วย pop up จะบังหน้าจอ
const flashBannerEl = document.getElementById('flashBanner');
if (flashBannerEl) {
    flashBannerEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashBannerEl.classList.add('flash-banner--flash');
    setTimeout(() => flashBannerEl.classList.remove('flash-banner--flash'), 1600);
}

const statusBtns = document.querySelectorAll('#statusFilters .btn-filter');
const zoneBtns = document.querySelectorAll('#zoneFilters .btn-filter');
const cards = document.querySelectorAll('.booking-card');
const modal = document.getElementById('detailModal');
const searchInput = document.getElementById('shopSearch');

const countAllEl = document.getElementById('count-all');
const countPendingEl = document.getElementById('count-pending');
const countApprovedEl = document.getElementById('count-approved');
const countInProgressEl = document.getElementById('count-in_progress');
const countSuccessEl = document.getElementById('count-success');
const countRejectedEl = document.getElementById('count-rejected');
const countAEl = document.getElementById('count-A');
const countBEl = document.getElementById('count-B');
const countCEl = document.getElementById('count-C');
const countDEl = document.getElementById('count-D');
const countEEl = document.getElementById('count-E');
const countFEl = document.getElementById('count-F');
const visibleCountEl = document.getElementById('visibleCount');

let currentBooking = null;

let currentStatus = 'all';
let currentZone = 'all';
let currentSearch = '';

function navigateToBookingStall(stall) {
    const zoneChar = stall.charAt(0);
    window.location.href = `/admin/booking-stall?zone=${zoneChar}&stall=${stall}`;
}

function navigateToBookingRequest(requestId) {
    window.location.href = `/admin/booking-stall?requestId=${encodeURIComponent(String(requestId || ''))}`;
}

function submitApproval(requestId, status) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/admin/approvals/confirm';

    const requestField = document.createElement('input');
    requestField.type = 'hidden';
    requestField.name = 'requestId';
    requestField.value = String(requestId);

    const statusField = document.createElement('input');
    statusField.type = 'hidden';
    statusField.name = 'status';
    statusField.value = status;

    form.appendChild(requestField);
    form.appendChild(statusField);
    document.body.appendChild(form);
    form.submit();
}

// กล่องยืนยัน/แจ้งเตือนทั้งหมดในหน้านี้ใช้ window.showConfirmDialog()/showAlertDialog()
// กลางจาก public/js/common/dialogs.js (โหลดไว้ก่อนไฟล์นี้ใน views/admin/approvals.ejs)
function submitConfirmPayment(requestId) {
    window.showConfirmDialog({
        title: 'ยืนยันการชำระเงิน',
        message: 'ตรวจสลิปโอนเงินแล้วถูกต้องใช่ไหม? เลขล็อกจะถูกเปิดเผยให้ลูกค้าเห็นทันทีหลังกดยืนยัน',
        tone: 'success',
        confirmText: 'ยืนยันการชำระเงิน',
        onConfirm: () => {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/admin/approvals/confirm-payment';

            const requestField = document.createElement('input');
            requestField.type = 'hidden';
            requestField.name = 'requestId';
            requestField.value = String(requestId);

            form.appendChild(requestField);
            document.body.appendChild(form);
            form.submit();
        }
    });
}

function submitRejectSlip(requestId) {
    window.showConfirmDialog({
        title: 'สลิปไม่ถูกต้อง',
        message: 'ระบุเหตุผลที่สลิปไม่ถูกต้อง (เช่น ยอดไม่ตรง/สลิปคนละคน/รูปไม่ชัด) ระบบจะล้างสลิปเดิมทิ้งและให้ผู้ขายอัปโหลดใหม่ ล็อกที่จัดไว้ยังเป็นของผู้ขายเหมือนเดิม',
        tone: 'danger',
        confirmText: 'ปฏิเสธสลิปนี้',
        inputPlaceholder: 'เหตุผลที่สลิปไม่ถูกต้อง',
        onConfirm: (reason) => {
            const trimmedReason = String(reason || '').trim();
            if (!trimmedReason) {
                window.showAlertDialog({ title: 'กรุณาระบุเหตุผล', message: 'ต้องระบุเหตุผลก่อนปฏิเสธสลิป', tone: 'warning' });
                return;
            }

            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/admin/approvals/reject-slip';

            const requestField = document.createElement('input');
            requestField.type = 'hidden';
            requestField.name = 'requestId';
            requestField.value = String(requestId);

            const reasonField = document.createElement('input');
            reasonField.type = 'hidden';
            reasonField.name = 'reason';
            reasonField.value = trimmedReason;

            form.appendChild(requestField);
            form.appendChild(reasonField);
            document.body.appendChild(form);
            form.submit();
        }
    });
}

function submitForcePayment(requestId) {
    window.showConfirmDialog({
        title: 'ยืนยันการชำระเงินโดยไม่ตรวจสลิป',
        message: 'ยืนยันการชำระเงินโดยไม่ใช้ผลตรวจสลิปอัตโนมัติ (ตรวจสอบด้วยตาเองแล้ว) ใช่ไหม?',
        tone: 'warning',
        confirmText: 'ยืนยันต่อโดยไม่ตรวจสลิป',
        onConfirm: () => {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/admin/approvals/confirm-payment';

            const requestField = document.createElement('input');
            requestField.type = 'hidden';
            requestField.name = 'requestId';
            requestField.value = String(requestId);

            const forceField = document.createElement('input');
            forceField.type = 'hidden';
            forceField.name = 'force';
            forceField.value = '1';

            form.appendChild(requestField);
            form.appendChild(forceField);
            document.body.appendChild(form);
            form.submit();
        }
    });
}

function confirmArrangeStall(stall) {
    navigateToBookingStall(stall);
}

function applyFilters() {
    let visibleCount = 0;

    cards.forEach((card) => {
        const cStatus = card.dataset.status;
        const cZone = card.dataset.zone;
        const cShop = (card.dataset.shop || '').toLowerCase();

        const matchStatus = currentStatus === 'all' || cStatus === currentStatus;
        const matchZone = currentZone === 'all' || cZone === currentZone;
        const matchSearch = !currentSearch || cShop.includes(currentSearch);
        const isVisible = matchStatus && matchZone && matchSearch;

        if (isVisible) {
            visibleCount += 1;
        }

        card.classList.toggle('d-none', !isVisible);
    });

    if (visibleCountEl) {
        visibleCountEl.textContent = visibleCount;
    }
}

function updateSummaryCounters() {
    const counters = {
        all: 0,
        pending: 0,
        approved: 0,
        in_progress: 0,
        success: 0,
        rejected: 0,
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        E: 0,
        F: 0
    };

    cards.forEach((card) => {
        counters.all += 1;

        const status = card.dataset.status;
        const zone = card.dataset.zone;

        if (status in counters) {
            counters[status] += 1;
        }

        if (zone in counters) {
            counters[zone] += 1;
        }
    });

    if (countAllEl) {
        countAllEl.textContent = counters.all;
    }

    if (countPendingEl) {
        countPendingEl.textContent = counters.pending;
    }

    if (countApprovedEl) {
        countApprovedEl.textContent = counters.approved;
    }

    if (countInProgressEl) {
        countInProgressEl.textContent = counters.in_progress;
    }

    if (countSuccessEl) {
        countSuccessEl.textContent = counters.success;
    }

    if (countRejectedEl) {
        countRejectedEl.textContent = counters.rejected;
    }

    if (countAEl) {
        countAEl.textContent = counters.A;
    }

    if (countBEl) {
        countBEl.textContent = counters.B;
    }

    if (countCEl) {
        countCEl.textContent = counters.C;
    }

    if (countDEl) {
        countDEl.textContent = counters.D;
    }

    if (countEEl) {
        countEEl.textContent = counters.E;
    }

    if (countFEl) {
        countFEl.textContent = counters.F;
    }
}

statusBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        statusBtns.forEach((item) => item.classList.remove('active'));
        btn.classList.add('active');
        currentStatus = btn.dataset.status;
        applyFilters();
    });
});

zoneBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        zoneBtns.forEach((item) => item.classList.remove('active'));
        btn.classList.add('active');
        currentZone = btn.dataset.zone;
        applyFilters();
    });
});

if (searchInput) {
    searchInput.addEventListener('input', (event) => {
        currentSearch = event.target.value.trim().toLowerCase();
        applyFilters();
    });
}

function openDetail(shop, zoneType, name, phone, statusLabel, note, requestId, createdAtText, rawStatus, shopImage, assignedStallCode, paymentSlipImage, paymentConfirmed, isExtension, extendOfRequestId, cornerZoneNote, isFinalPrice, booking, slipVerified, slipVerifyReason) {
    const pageState = window.APPROVAL_PAGE_STATE || { isEditable: true };
    currentBooking = {
        shop,
        zoneType,
        statusLabel,
        requestId,
        rawStatus,
        shopImage,
        assignedStallCode,
        paymentSlipImage,
        paymentConfirmed: Boolean(paymentConfirmed),
        isEditable: pageState.isEditable !== false
    };

    document.getElementById('m-shop').innerText = shop;
    document.getElementById('m-zone').innerText = zoneType;
    document.getElementById('m-start').innerText = createdAtText;
    document.getElementById('m-name').innerText = name;
    document.getElementById('m-phone').innerText = phone;
    document.getElementById('m-status').innerText = statusLabel;
    document.getElementById('m-note').innerText = note;
    document.getElementById('m-assigned-stall').innerText = assignedStallCode || '-';

    const tagsEl = document.getElementById('m-tags');
    if (tagsEl) {
        const tagsHtml = [];
        if (isExtension) {
            tagsHtml.push(`<span class="tag tag--extend"><i class="fa-solid fa-rotate"></i> ต่อล็อคจากคำขอ #${extendOfRequestId}</span>`);
        }
        if (cornerZoneNote) {
            tagsHtml.push(`<span class="tag tag--corner"><i class="fa-solid fa-star"></i> สนใจล็อคเต็ง: ${cornerZoneNote}</span>`);
        }
        if (paymentSlipImage && slipVerified === true) {
            tagsHtml.push('<span class="tag tag--slip-ok"><i class="fa-solid fa-circle-check"></i> สลิปจริง ยอดตรง</span>');
        } else if (paymentSlipImage && slipVerified === false) {
            tagsHtml.push(`<span class="tag tag--slip-bad"><i class="fa-solid fa-triangle-exclamation"></i> สลิปมีปัญหา: ${slipVerifyReason || 'ตรวจไม่ผ่าน'}</span>`);
        } else if (paymentSlipImage) {
            tagsHtml.push('<span class="tag tag--slip-pending"><i class="fa-solid fa-hourglass-half"></i> ยังไม่ตรวจสลิปอัตโนมัติ</span>');
        }
        tagsEl.innerHTML = tagsHtml.join('');
        tagsEl.classList.toggle('d-none', tagsHtml.length === 0);
    }

    const rentalDatesEl = document.getElementById('m-rental-dates');
    const stallApplianceEl = document.getElementById('m-stall-appliance');
    const priceLabelEl = document.getElementById('m-price-label');
    const priceEl = document.getElementById('m-price');
    if (booking) {
        if (rentalDatesEl) rentalDatesEl.innerText = `${booking.rentalStartDateText} - ${booking.rentalEndDateText} (${booking.rentalDays} วัน)`;
        if (stallApplianceEl) stallApplianceEl.innerText = `${booking.stallCount} ล็อก / เครื่องเล็ก ${booking.smallApplianceCount} + เครื่องใหญ่ ${booking.largeApplianceCount}`;
        if (priceLabelEl) priceLabelEl.innerText = isFinalPrice ? 'ราคาจริง:' : 'ราคาประเมิน:';
        if (priceEl) priceEl.innerText = `${Number(booking.grandTotal).toLocaleString('th-TH')} บาท`;
    } else {
        if (rentalDatesEl) rentalDatesEl.innerText = '-';
        if (stallApplianceEl) stallApplianceEl.innerText = '-';
        if (priceLabelEl) priceLabelEl.innerText = 'ราคา:';
        if (priceEl) priceEl.innerText = '-';
    }

    const shopImageEl = document.getElementById('m-shop-image');
    const shopImageEmptyEl = document.getElementById('m-shop-image-empty');
    const imageUrl = String(shopImage || '').trim();
    if (shopImageEl && shopImageEmptyEl) {
        if (imageUrl) {
            shopImageEl.src = imageUrl;
            shopImageEl.classList.remove('d-none');
            shopImageEmptyEl.classList.add('d-none');
        } else {
            shopImageEl.src = '';
            shopImageEl.classList.add('d-none');
            shopImageEmptyEl.classList.remove('d-none');
        }
    }

    const slipBox = document.getElementById('m-payment-slip-box');
    const slipImgEl = document.getElementById('m-payment-slip');
    const slipUrl = String(paymentSlipImage || '').trim();
    if (slipBox && slipImgEl) {
        if (slipUrl) {
            slipImgEl.src = slipUrl;
            slipBox.classList.remove('d-none');
        } else {
            slipImgEl.src = '';
            slipBox.classList.add('d-none');
        }
    }

    const approveBtn = document.getElementById('m-approve-btn');
    const rejectBtn = document.getElementById('m-reject-btn');
    const confirmPaymentBtn = document.getElementById('m-confirm-payment-btn');
    const rejectSlipBtn = document.getElementById('m-reject-slip-btn');
    if (approveBtn) {
        approveBtn.onclick = () => navigateToBookingRequest(currentBooking.requestId);
    }
    if (rejectBtn) {
        rejectBtn.onclick = () => window.showConfirmDialog({
            title: 'ปฏิเสธการจอง',
            message: `ยืนยันปฏิเสธการจองร้าน "${currentBooking.shop}" ใช่ไหม?`,
            tone: 'danger',
            confirmText: 'ปฏิเสธการจอง',
            onConfirm: () => submitApproval(currentBooking.requestId, 'REJECTED')
        });
    }
    if (confirmPaymentBtn) {
        confirmPaymentBtn.onclick = () => submitConfirmPayment(currentBooking.requestId);
    }
    if (rejectSlipBtn) {
        rejectSlipBtn.onclick = () => submitRejectSlip(currentBooking.requestId);
    }

    // ปุ่ม "อนุมัติ/ปฏิเสธ" ใช้ตอนสถานะยังเป็น pending เท่านั้น
    // ปุ่ม "ยืนยันการชำระเงิน"/"สลิปไม่ถูกต้อง" ใช้ตอนแอดมินจัดล็อกให้แล้ว (in_progress) และผู้ขายส่งสลิปมาแล้ว แต่ยังไม่ยืนยัน
    const canApproveReject = pageState.isEditable !== false && rawStatus === 'pending';
    const canConfirmPayment = pageState.isEditable !== false && rawStatus === 'in_progress' && Boolean(slipUrl) && !currentBooking.paymentConfirmed;

    if (approveBtn) approveBtn.classList.toggle('d-none', !canApproveReject);
    if (rejectBtn) rejectBtn.classList.toggle('d-none', !canApproveReject);
    if (confirmPaymentBtn) confirmPaymentBtn.classList.toggle('d-none', !canConfirmPayment);
    if (rejectSlipBtn) rejectSlipBtn.classList.toggle('d-none', !canConfirmPayment);

    const footer = document.getElementById('m-footer-actions');
    if (footer) {
        footer.style.display = (canApproveReject || canConfirmPayment) ? 'flex' : 'none';
    }

    modal.classList.add('active');
}

function closePopup() {
    if (modal) {
        modal.classList.remove('active');
    }

    currentBooking = null;
}

function closeModalOnOverlay(event) {
    if (event.target === modal) {
        closePopup();
    }
}

window.openDetail = openDetail;
window.closePopup = closePopup;
window.closeModalOnOverlay = closeModalOnOverlay;
window.confirmArrangeStall = confirmArrangeStall;
window.submitApproval = submitApproval;

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closePopup();
        closeConfirmDialog();
    }
});

updateSummaryCounters();
applyFilters();
