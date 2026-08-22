const cards = document.querySelectorAll('.booking-card');
const modal = document.getElementById('detailModal');
const searchInput = document.getElementById('shopSearch');

const countAllEl = document.getElementById('count-all');
const countPendingEl = document.getElementById('count-pending');
const countApprovedEl = document.getElementById('count-approved');
const countRejectedEl = document.getElementById('count-rejected');
const visibleCountEl = document.getElementById('visibleCount');

let currentApplication = null;
let currentStatus = 'all';
let currentSearch = '';

function submitReview(applicationId, action, reason) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `/admin/seller-applications/${action}`;

    const idField = document.createElement('input');
    idField.type = 'hidden';
    idField.name = 'applicationId';
    idField.value = String(applicationId);
    form.appendChild(idField);

    if (action === 'reject') {
        const reasonField = document.createElement('input');
        reasonField.type = 'hidden';
        reasonField.name = 'reason';
        reasonField.value = reason || '';
        form.appendChild(reasonField);
    }

    document.body.appendChild(form);
    form.submit();
}

function submitApprove(applicationId, shopName) {
    window.showConfirmDialog({
        title: 'อนุมัติร้านค้านี้?',
        message: `ยืนยันอนุมัติใบสมัครร้าน "${shopName}" — บัญชีนี้จะเปลี่ยนเป็นผู้ขายทันที`,
        tone: 'neutral',
        confirmText: 'อนุมัติ',
        cancelText: 'ยกเลิก',
        onConfirm: () => submitReview(applicationId, 'approve')
    });
}

function submitReject(applicationId) {
    window.showConfirmDialog({
        title: 'ปฏิเสธใบสมัครนี้?',
        message: '',
        tone: 'danger',
        confirmText: 'ปฏิเสธ',
        cancelText: 'ยกเลิก',
        inputPlaceholder: 'ระบุเหตุผล (ไม่บังคับ)',
        onConfirm: (reason) => submitReview(applicationId, 'reject', reason || '')
    });
}

function renderModalFooterActions(rawStatus) {
    const footer = document.getElementById('m-footer-actions');
    if (!footer || !currentApplication) {
        return;
    }

    let html = '';
    if (rawStatus === 'pending') {
        html = `
            <button type="button" class="btn-action btn-reject" id="m-reject-btn">ปฏิเสธ</button>
            <button type="button" class="btn-action btn-approve" id="m-approve-btn">อนุมัติร้านค้า</button>
        `;
    }

    footer.innerHTML = html;
    footer.style.display = html ? 'flex' : 'none';

    const approveBtn = document.getElementById('m-approve-btn');
    const rejectBtn = document.getElementById('m-reject-btn');
    if (approveBtn) {
        approveBtn.onclick = () => submitApprove(currentApplication.applicationId, currentApplication.shopName);
    }
    if (rejectBtn) {
        rejectBtn.onclick = () => submitReject(currentApplication.applicationId);
    }
}

function applyFilters() {
    let visibleCount = 0;

    cards.forEach((card) => {
        const cStatus = card.dataset.status;
        const cShop = (card.dataset.shop || '').toLowerCase();

        const matchStatus = currentStatus === 'all' || cStatus === currentStatus;
        const matchSearch = !currentSearch || cShop.includes(currentSearch);
        const isVisible = matchStatus && matchSearch;

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
    const counters = { all: 0, pending: 0, approved: 0, rejected: 0 };

    cards.forEach((card) => {
        counters.all += 1;
        const status = card.dataset.status;
        if (status in counters) {
            counters[status] += 1;
        }
    });

    if (countAllEl) countAllEl.textContent = counters.all;
    if (countPendingEl) countPendingEl.textContent = counters.pending;
    if (countApprovedEl) countApprovedEl.textContent = counters.approved;
    if (countRejectedEl) countRejectedEl.textContent = counters.rejected;
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

if (searchInput) {
    searchInput.addEventListener('input', (event) => {
        currentSearch = event.target.value.trim().toLowerCase();
        applyFilters();
    });
}

const clearFiltersBtn = document.getElementById('clearFiltersBtn');
if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
        currentSearch = '';
        if (searchInput) searchInput.value = '';
        setStatusFilter('all');
    });
}

function openDetail(payload) {
    currentApplication = payload;

    document.getElementById('m-shop').innerText = payload.shopName;
    document.getElementById('m-product-type').innerText = payload.productType;
    document.getElementById('m-product-detail').innerText = payload.productDetail;
    document.getElementById('m-seller-name').innerText = payload.sellerName;
    document.getElementById('m-id-card').innerText = payload.idCardNumber;
    document.getElementById('m-name').innerText = payload.applicantName;
    document.getElementById('m-phone').innerText = payload.phoneNumber;
    document.getElementById('m-bank-provider').innerText = payload.bankName;
    document.getElementById('m-bank-account').innerText = payload.bankAccountNumber;
    document.getElementById('m-bank-name').innerText = payload.bankAccountName;
    document.getElementById('m-address').innerText = [payload.houseNumber, payload.subdistrict, payload.district, payload.province].filter(Boolean).join(' ');
    document.getElementById('m-email').innerText = payload.email;
    document.getElementById('m-start').innerText = payload.createdAtText;
    document.getElementById('m-status').innerText = payload.statusLabel
        + (payload.rawStatus === 'rejected' && payload.rejectReason ? ` (${payload.rejectReason})` : '');

    const shopImageEl = document.getElementById('m-shop-image');
    const shopImageEmptyEl = document.getElementById('m-shop-image-empty');
    const imageUrl = String(payload.shopCoverImage || '').trim();
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

    renderModalFooterActions(payload.rawStatus);

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
        openDetail(payload);
    } catch (error) {
        // ignore malformed payload to avoid breaking the list interaction
    }
}

function closePopup() {
    if (modal) {
        modal.classList.remove('active');
    }
    currentApplication = null;
}

function closeModalOnOverlay(event) {
    if (event.target === modal) {
        closePopup();
    }
}

window.openDetailFromElement = openDetailFromElement;
window.closePopup = closePopup;
window.closeModalOnOverlay = closeModalOnOverlay;

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closePopup();
    }
});

updateSummaryCounters();
setStatusFilter(currentStatus);
