const categorySelect = document.getElementById('categorySelect');
const zoneSelect = document.getElementById('zoneSelect');
const cards = document.querySelectorAll('.booking-card');

// โซนไหนอยู่หมวดหมู่ไหน (ตรงกับ productCategory ของ Zone ในฐานข้อมูล)
const ZONE_CATEGORY = { A: 'FASHION', B: 'FOOD', C: 'FASHION', D: 'FOOD', E: 'FASHION', F: 'FOOD' };
const modal = document.getElementById('detailModal');
const searchInput = document.getElementById('shopSearch');

const countAllEl = document.getElementById('count-all');
const countPendingEl = document.getElementById('count-pending');
const countApprovedEl = document.getElementById('count-approved');
const countInProgressEl = document.getElementById('count-in_progress');
const countAwaitingSlipEl = document.getElementById('count-awaiting_slip');
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
let currentCategory = 'all';
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

function confirmArrangeStall(stall) {
    navigateToBookingStall(stall);
}

function submitConfirmPayment(requestId) {
    Swal.fire({
        title: 'ยืนยันการชำระเงิน?',
        text: 'ยืนยันว่าตรวจสอบสลิปโอนเงินแล้ว และต้องการปิดล็อกให้ร้านนี้เป็นทางการ',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3BB8D4',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (!result.isConfirmed) {
            return;
        }

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
    });
}

// สถานะ pending = ยังไม่ได้ตรวจสอบร้าน -> ตรวจร้าน (อนุมัติ/ปฏิเสธ)
// สถานะ approved = ร้านผ่านตรวจสอบแล้ว รอจัดล็อก -> จัดล็อก / ปฏิเสธ
// สถานะ in_progress + ยังไม่มีสลิป = จัดล็อกแล้ว รอผู้ขายชำระเงิน -> แก้ไขล็อกได้
// สถานะ in_progress + มีสลิปแล้ว = รอแอดมินตรวจสลิป -> ยืนยันการชำระเงิน (หรือแก้ไขล็อกถ้าจัดผิด)
// สถานะ success/rejected = จบขั้นตอนแล้ว ไม่มีปุ่มดำเนินการ
function renderModalFooterActions(rawStatus) {
    const footer = document.getElementById('m-footer-actions');
    if (!footer || !currentBooking) {
        return;
    }

    const hasPaymentSlip = Boolean(currentBooking.paymentSlipImage);

    let html = '';
    if (rawStatus === 'pending') {
        html = `
            <button type="button" class="btn-action btn-reject" id="m-reject-btn">ปฏิเสธร้านค้า</button>
            <button type="button" class="btn-action btn-approve" id="m-approve-btn">อนุมัติร้านค้า</button>
        `;
    } else if (rawStatus === 'approved') {
        html = `
            <button type="button" class="btn-action btn-reject" id="m-reject-btn">ปฏิเสธร้านค้า</button>
            <button type="button" class="btn-action btn-approve" id="m-approve-btn">จัดล็อกให้ร้านนี้</button>
        `;
    } else if (rawStatus === 'in_progress' && hasPaymentSlip) {
        html = `
            <button type="button" class="btn-action btn-neutral" id="m-edit-stall-btn">แก้ไขล็อกที่จัดให้</button>
            <button type="button" class="btn-action btn-approve" id="m-confirm-payment-btn">ยืนยันการชำระเงิน</button>
        `;
    } else if (rawStatus === 'in_progress') {
        html = `<button type="button" class="btn-action btn-approve" id="m-approve-btn">แก้ไขล็อกที่จัดให้</button>`;
    }

    footer.innerHTML = html;
    footer.style.display = html ? 'flex' : 'none';

    const approveBtn = document.getElementById('m-approve-btn');
    const rejectBtn = document.getElementById('m-reject-btn');
    const editStallBtn = document.getElementById('m-edit-stall-btn');
    const confirmPaymentBtn = document.getElementById('m-confirm-payment-btn');
    if (approveBtn) {
        approveBtn.onclick = rawStatus === 'pending'
            ? () => submitApproval(currentBooking.requestId, 'APPROVED')
            : () => navigateToBookingRequest(currentBooking.requestId);
    }
    if (rejectBtn) {
        rejectBtn.onclick = () => submitApproval(currentBooking.requestId, 'REJECTED');
    }
    if (editStallBtn) {
        editStallBtn.onclick = () => navigateToBookingRequest(currentBooking.requestId);
    }
    if (confirmPaymentBtn) {
        confirmPaymentBtn.onclick = () => submitConfirmPayment(currentBooking.requestId);
    }
}

function getStatusClass(status) {
    if (status === 'approved' || status === 'rejected') {
        return status;
    }
    return 'pending';
}

function getStatusText(status) {
    if (status === 'approved') {
        return 'อนุมัติแล้ว';
    }
    if (status === 'rejected') {
        return 'ปฏิเสธ';
    }
    return 'รออนุมัติ';
}

function updateCardStatus(stall, nextStatus) {
    const card = document.querySelector(`.booking-card[data-stall="${stall}"]`);
    if (!card) {
        return;
    }

    card.dataset.status = nextStatus;

    const badge = card.querySelector('.badge');
    if (badge) {
        badge.className = `badge ${getStatusClass(nextStatus)}`;
        badge.textContent = getStatusText(nextStatus);
    }

    const actions = card.querySelector('.card-actions');
    if (actions) {
        actions.style.display = nextStatus === 'pending' ? 'flex' : 'none';
    }
}

function rejectBooking(stall, shopName) {
    const confirmed = window.confirm(`ยืนยันปฏิเสธการจองร้าน ${shopName} ?`);
    if (!confirmed) {
        return;
    }

    updateCardStatus(stall, 'rejected');
    updateSummaryCounters();
    applyFilters();

    if (currentBooking && currentBooking.stall === stall) {
        currentBooking.status = 'rejected';
        closePopup();
    }
}

function rejectCurrentBooking() {
    if (!currentBooking) {
        closePopup();
        return;
    }

    rejectBooking(currentBooking.stall, currentBooking.shop);
}

function applyFilters() {
    let visibleCount = 0;

    cards.forEach((card) => {
        const cStatus = card.dataset.status;
        const cZone = card.dataset.zone;
        const cShop = (card.dataset.shop || '').toLowerCase();

        const hasSlip = card.dataset.hasSlip === 'true';
        const matchStatus = currentStatus === 'all'
            || (currentStatus === 'in_progress'
                ? cStatus === 'in_progress' && !hasSlip
                : currentStatus === 'awaiting_slip'
                    ? cStatus === 'in_progress' && hasSlip
                    : cStatus === currentStatus);
        const matchZone = currentZone === 'all' || cZone === currentZone;
        const matchCategory = currentCategory === 'all' || ZONE_CATEGORY[cZone] === currentCategory;
        const matchSearch = !currentSearch || cShop.includes(currentSearch);
        const isVisible = matchStatus && matchZone && matchCategory && matchSearch;

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
        awaiting_slip: 0,
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
        const hasSlip = card.dataset.hasSlip === 'true';

        if (status === 'in_progress') {
            if (hasSlip) {
                counters.awaiting_slip += 1;
            } else {
                counters.in_progress += 1;
            }
        } else if (status in counters) {
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

    if (countAwaitingSlipEl) {
        countAwaitingSlipEl.textContent = counters.awaiting_slip;
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

const summaryCards = document.querySelectorAll('.summary-card[data-status-filter]');

function setStatusFilter(status) {
    currentStatus = status;
    summaryCards.forEach((card) => {
        card.classList.toggle('active', card.dataset.statusFilter === status);
    });
    applyFilters();
}

summaryCards.forEach((card) => {
    card.addEventListener('click', () => {
        setStatusFilter(card.dataset.statusFilter);
    });
});

if (zoneSelect) {
    zoneSelect.addEventListener('change', () => {
        currentZone = zoneSelect.value;
        applyFilters();
    });
}

if (categorySelect) {
    categorySelect.addEventListener('change', () => {
        currentCategory = categorySelect.value;
        applyFilters();
    });
}

if (searchInput) {
    searchInput.addEventListener('input', (event) => {
        currentSearch = event.target.value.trim().toLowerCase();
        applyFilters();
    });
}

const clearFiltersBtn = document.getElementById('clearFiltersBtn');
if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
        currentZone = 'all';
        currentCategory = 'all';
        currentSearch = '';
        if (searchInput) searchInput.value = '';

        if (zoneSelect) zoneSelect.value = 'all';
        if (categorySelect) categorySelect.value = 'all';

        setStatusFilter('all');
    });
}

function openDetail(
    shop,
    zoneType,
    name,
    phone,
    statusLabel,
    requestId,
    createdAtText,
    rawStatus,
    shopImage,
    smallApplianceCount,
    largeApplianceCount,
    electricityFee,
    rentalStartDateText,
    rentalEndDateText,
    grandTotalText,
    paymentSlipImage
) {
    currentBooking = {
        shop,
        zoneType,
        statusLabel,
        requestId,
        rawStatus,
        shopImage,
        paymentSlipImage
    };

    document.getElementById('m-shop').innerText = shop;
    document.getElementById('m-zone').innerText = zoneType;
    document.getElementById('m-start').innerText = createdAtText;
    document.getElementById('m-name').innerText = name;
    document.getElementById('m-phone').innerText = phone;
    document.getElementById('m-status').innerText = statusLabel;
    document.getElementById('m-small-appliance').innerText = `${Number(smallApplianceCount || 0)} ชิ้น`;
    document.getElementById('m-large-appliance').innerText = `${Number(largeApplianceCount || 0)} ชิ้น`;
    document.getElementById('m-electricity-fee').innerText = `${Number(electricityFee || 0).toLocaleString('th-TH')} บาท`;
    document.getElementById('m-rental-start').innerText = rentalStartDateText || '-';
    document.getElementById('m-rental-end').innerText = rentalEndDateText || '-';
    document.getElementById('m-grand-total').innerText = grandTotalText || '-';

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
    const slipImg = document.getElementById('m-payment-slip');
    const slipInstructionEl = document.getElementById('m-slip-instruction');
    const slipAmountEl = document.getElementById('m-slip-amount');
    if (slipBox && slipImg) {
        const slipUrl = String(paymentSlipImage || '').trim();
        if (slipUrl) {
            slipImg.src = slipUrl;
            slipBox.classList.remove('d-none');

            // รอตรวจสอบ = เน้นสีเตือนให้เห็นชัดว่าต้องตรวจก่อนกดยืนยัน / ยืนยันแล้ว = แจ้งผลเฉยๆ ไม่ต้องทำอะไรต่อ
            const awaitingReview = rawStatus === 'in_progress';
            slipBox.classList.toggle('payment-slip-box-pending', awaitingReview);
            if (slipInstructionEl) {
                slipInstructionEl.innerText = awaitingReview
                    ? 'ตรวจสอบยอดโอนในสลิปให้ตรงกับยอดที่ต้องชำระด้านล่าง แล้วกด "ยืนยันการชำระเงิน" ที่ท้ายรายการ'
                    : 'ยืนยันการชำระเงินแล้ว';
            }
            if (slipAmountEl) {
                slipAmountEl.innerText = grandTotalText || '-';
            }
        } else {
            slipImg.src = '';
            slipBox.classList.add('d-none');
            slipBox.classList.remove('payment-slip-box-pending');
        }
    }

    renderModalFooterActions(rawStatus);

    modal.classList.add('active');
}

function openDetailFromElement(element) {
    if (!element || !element.dataset) {
        return;
    }

    const raw = element.dataset.detail;
    if (!raw) {
        return;
    }

    try {
        const payload = JSON.parse(decodeURIComponent(raw));
        openDetail(
            payload.productName || '-',
            payload.zoneLabel || '-',
            payload.sellerName || '-',
            payload.phone || '-',
            payload.statusLabel || '-',
            payload.requestId,
            payload.createdAtText || '-',
            payload.rawStatus || 'pending',
            payload.productImage || '',
            payload.smallApplianceCount || 0,
            payload.largeApplianceCount || 0,
            payload.electricityFee || 0,
            payload.rentalStartDateText || '-',
            payload.rentalEndDateText || '-',
            payload.grandTotalText || '-',
            payload.paymentSlipImage || ''
        );
    } catch (error) {
        // ignore malformed payload to avoid breaking the list interaction
    }
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

const slipLightbox = document.getElementById('slipLightbox');
const slipLightboxImg = document.getElementById('slipLightboxImg');

function openSlipLightbox(imageUrl) {
    if (!slipLightbox || !slipLightboxImg || !imageUrl) {
        return;
    }

    slipLightboxImg.src = imageUrl;
    slipLightbox.classList.add('active');
}

function closeSlipLightbox() {
    if (!slipLightbox) {
        return;
    }

    slipLightbox.classList.remove('active');
    if (slipLightboxImg) {
        slipLightboxImg.src = '';
    }
}

window.openDetail = openDetail;
window.openDetailFromElement = openDetailFromElement;
window.closePopup = closePopup;
window.closeModalOnOverlay = closeModalOnOverlay;
window.confirmArrangeStall = confirmArrangeStall;
window.rejectBooking = rejectBooking;
window.rejectCurrentBooking = rejectCurrentBooking;
window.submitApproval = submitApproval;
window.openSlipLightbox = openSlipLightbox;
window.closeSlipLightbox = closeSlipLightbox;

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (slipLightbox && slipLightbox.classList.contains('active')) {
            closeSlipLightbox();
            return;
        }
        closePopup();
    }
});

updateSummaryCounters();
setStatusFilter(currentStatus);
