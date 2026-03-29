const statusBtns = document.querySelectorAll('#statusFilters .btn-filter');
const zoneBtns = document.querySelectorAll('#zoneFilters .btn-filter');
const cards = document.querySelectorAll('.booking-card');
const modal = document.getElementById('detailModal');
const searchInput = document.getElementById('shopSearch');

const countAllEl = document.getElementById('count-all');
const countPendingEl = document.getElementById('count-pending');
const countApprovedEl = document.getElementById('count-approved');
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

function confirmArrangeStall(stall) {
    navigateToBookingStall(stall);
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

function openDetail(shop, stall, zoneType, start, end, name, phone, status, note) {
    currentBooking = {
        shop,
        stall,
        status
    };

    document.getElementById('m-shop').innerText = shop;
    document.getElementById('m-stall').innerText = stall;
    document.getElementById('m-zone').innerText = zoneType;
    document.getElementById('m-start').innerText = start;
    document.getElementById('m-end').innerText = end;
    document.getElementById('m-name').innerText = name;
    document.getElementById('m-phone').innerText = phone;
    document.getElementById('m-note').innerText = note;

    const approveBtn = document.getElementById('m-approve-btn');
    approveBtn.onclick = () => confirmArrangeStall(stall);

    const footer = document.getElementById('m-footer-actions');
    footer.style.display = status === 'pending' ? 'flex' : 'none';

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
window.rejectBooking = rejectBooking;
window.rejectCurrentBooking = rejectCurrentBooking;

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closePopup();
    }
});

updateSummaryCounters();
applyFilters();
