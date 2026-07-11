const liveDate = document.getElementById('live-date');
if (liveDate) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    liveDate.textContent = new Date().toLocaleDateString('th-TH', options);
}

const searchInput = document.getElementById('searchInput');
const filters = document.querySelectorAll('.status-filter');
const rows = document.querySelectorAll('.request-row');
const cards = document.querySelectorAll('.request-card');
const visibleCounter = document.getElementById('totalVisibleCount');
const emptyFilteredTableRow = document.getElementById('emptyFilteredTableRow');
const emptyFilteredCardRow = document.getElementById('emptyFilteredCardRow');
let currentFilter = 'ALL';

function applyFilters() {
    const term = (searchInput ? searchInput.value : '').toLowerCase().trim();
    let visibleRows = 0;
    let visibleCards = 0;

    rows.forEach(row => {
        const matchText = row.dataset.search.includes(term);
        const matchStatus = currentFilter === 'ALL' || row.dataset.status === currentFilter;
        const show = matchText && matchStatus;
        row.style.display = show ? '' : 'none';
        if (show) visibleRows += 1;
    });

    cards.forEach(card => {
        const matchText = card.dataset.search.includes(term);
        const matchStatus = currentFilter === 'ALL' || card.dataset.status === currentFilter;
        const show = matchText && matchStatus;
        card.style.display = show ? '' : 'none';
        if (show) visibleCards += 1;
    });

    if (emptyFilteredTableRow) {
        emptyFilteredTableRow.classList.toggle('d-none', rows.length === 0 || visibleRows > 0);
    }

    if (emptyFilteredCardRow) {
        emptyFilteredCardRow.classList.toggle('d-none', cards.length === 0 || visibleCards > 0);
    }

    const visible = rows.length > 0 ? visibleRows : visibleCards;
    if (visibleCounter) visibleCounter.textContent = String(visible);
}

if (searchInput) searchInput.addEventListener('input', applyFilters);
filters.forEach(btn => {
    btn.addEventListener('click', () => {
        filters.forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        applyFilters();
    });
});

applyFilters();

const requestDetailModal = document.getElementById('requestDetailModal');
if (requestDetailModal) {
    const detailImage = document.getElementById('detailImage');
    const detailImageWrap = document.getElementById('detailImageWrap');
    const detailImageEmpty = document.getElementById('detailImageEmpty');
    const statusBadgeClass = {
        PENDING: 'bg-warning text-dark',
        IN_PROGRESS: 'bg-info text-dark',
        SUCCESS: 'bg-success'
    };

    requestDetailModal.addEventListener('show.bs.modal', (event) => {
        const btn = event.relatedTarget;
        if (!btn) return;
        const d = btn.dataset;

        if (d.image) {
            detailImage.src = d.image;
            detailImageWrap.classList.remove('d-none');
            detailImageEmpty.classList.add('d-none');
        } else {
            detailImage.src = '';
            detailImageWrap.classList.add('d-none');
            detailImageEmpty.classList.remove('d-none');
        }

        document.getElementById('detailLocation').textContent = d.location;
        document.getElementById('detailRequester').textContent = d.requester;
        document.getElementById('detailCategory').textContent = d.category;
        document.getElementById('detailDescription').textContent = d.description;
        document.getElementById('detailDate').textContent = d.date;

        const badge = document.getElementById('detailStatusBadge');
        badge.textContent = d.statusLabel;
        badge.className = 'badge ' + (statusBadgeClass[d.status] || 'bg-secondary');
    });

    detailImage.addEventListener('click', () => {
        if (detailImage.src) window.open(detailImage.src, '_blank');
    });
}
