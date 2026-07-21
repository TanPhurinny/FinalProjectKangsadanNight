if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

const flashSuccess = document.body.dataset.flashSuccess;
const flashError = document.body.dataset.flashError;
if ((flashSuccess || flashError) && window.Swal && typeof Swal.fire === 'function') {
    Swal.fire({
        icon: flashSuccess ? 'success' : 'error',
        title: flashSuccess || flashError,
        confirmButtonColor: '#3BB8D4'
    });
    const url = new URL(window.location.href);
    url.searchParams.delete('success');
    url.searchParams.delete('error');
    window.history.replaceState({}, '', url);
}

window.addEventListener('pageshow', () => {
    window.scrollTo(0, 0);
});

window.addEventListener('load', () => {
    window.scrollTo(0, 0);
});

const searchInput = document.getElementById('announcementSearch');
const catPills = document.querySelectorAll('.cat-pill');
const announcementCols = document.querySelectorAll('.announcement-col');
const emptyFilteredAnnouncements = document.getElementById('emptyFilteredAnnouncements');
const sortSelect = document.getElementById('announcementSort');
const announcementGrid = document.getElementById('announcementGrid');
const STORAGE_KEY = 'kangsadan_home_filters';
let currentCategory = 'ALL';

function filterAnnouncements() {
    const term = (searchInput?.value || '').toLowerCase().trim();
    let visible = 0;

    announcementCols.forEach((col) => {
        const matchCategory = currentCategory === 'ALL' || col.dataset.category === currentCategory;
        const matchSearch = col.dataset.search.includes(term);
        const show = matchCategory && matchSearch;
        col.style.display = show ? '' : 'none';
        if (show) visible += 1;
    });

    if (emptyFilteredAnnouncements) {
        emptyFilteredAnnouncements.classList.toggle('d-none', visible > 0 || announcementCols.length === 0);
    }

    saveFilterState();
}

function sortAnnouncements() {
    if (!announcementGrid || !sortSelect) return;

    const cols = Array.from(announcementCols);
    const sortType = sortSelect.value;

    cols.sort((a, b) => {
        if (sortType === 'oldest') {
            return Number(a.dataset.date) - Number(b.dataset.date);
        }
        if (sortType === 'title-asc') {
            return a.dataset.title.localeCompare(b.dataset.title, 'th');
        }
        return Number(b.dataset.date) - Number(a.dataset.date);
    });

    cols.forEach((col) => announcementGrid.appendChild(col));
    saveFilterState();
}

function saveFilterState() {
    const payload = {
        term: searchInput ? searchInput.value : '',
        category: currentCategory,
        sort: sortSelect ? sortSelect.value : 'newest'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadFilterState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);

        if (searchInput && typeof saved.term === 'string') {
            searchInput.value = saved.term;
        }
        if (saved.category) {
            currentCategory = saved.category;
            catPills.forEach((pill) => {
                pill.classList.toggle('active', pill.dataset.category === saved.category);
            });
        }
        if (sortSelect && saved.sort) {
            sortSelect.value = saved.sort;
        }
    } catch (error) {
        localStorage.removeItem(STORAGE_KEY);
    }
}

if (searchInput) searchInput.addEventListener('input', filterAnnouncements);
if (sortSelect) {
    sortSelect.addEventListener('change', () => {
        sortAnnouncements();
        filterAnnouncements();
    });
}
catPills.forEach((pill) => {
    pill.addEventListener('click', () => {
        catPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        currentCategory = pill.dataset.category;
        filterAnnouncements();
    });
});

loadFilterState();
sortAnnouncements();
filterAnnouncements();

const modalEl = document.getElementById('announcementModal');
function openAnnouncementImage(imageUrl, encodedTitle = '') {
    if (!imageUrl) return;

    let title = 'รูปประกาศ';
    if (encodedTitle) {
        try {
            title = decodeURIComponent(encodedTitle);
        } catch (error) {
            title = encodedTitle;
        }
    }

    if (window.Swal && typeof Swal.fire === 'function') {
        Swal.fire({
            title,
            imageUrl,
            imageAlt: title,
            width: 'min(92vw, 1100px)',
            confirmButtonText: 'ปิด',
            confirmButtonColor: '#3BB8D4',
            showCloseButton: true
        });
        return;
    }

    window.open(imageUrl, '_blank', 'noopener,noreferrer');
}

window.openAnnouncementImage = openAnnouncementImage;

if (modalEl) {
    const modal = new bootstrap.Modal(modalEl);
    const titleEl = document.getElementById('modalAnnouncementTitle');
    const contentEl = document.getElementById('modalAnnouncementContent');
    const metaEl = document.getElementById('modalAnnouncementMeta');
    const imageWrapEl = document.getElementById('modalAnnouncementImageWrap');
    const imageEl = document.getElementById('modalAnnouncementImage');

    document.querySelectorAll('.announcement-readmore').forEach((btn) => {
        btn.addEventListener('click', () => {
            titleEl.textContent = btn.dataset.title || '';
            contentEl.textContent = btn.dataset.content || '';
            metaEl.textContent = `${btn.dataset.category || '-'} | ${btn.dataset.date || '-'}`;

            if (btn.dataset.image && imageEl && imageWrapEl) {
                imageEl.src = btn.dataset.image;
                imageEl.onclick = () => openAnnouncementImage(btn.dataset.image, encodeURIComponent(btn.dataset.title || 'รูปประกาศ'));
                imageWrapEl.classList.remove('d-none');
            } else if (imageEl && imageWrapEl) {
                imageEl.src = '';
                imageEl.onclick = null;
                imageWrapEl.classList.add('d-none');
            }

            modal.show();
        });
    });
}
