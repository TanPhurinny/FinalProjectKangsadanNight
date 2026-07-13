/* Slots page interactions */
const ZONES_DATA = window.ZONES_DATA || {};
const BOOKING_BY_STALL = window.BOOKING_BY_STALL || {};

let activeZone = null;
let selectedStall = null;
let currentQuery = '';

function openZone(z) {
    if (!ZONES_DATA[z]) return;

    activeZone = z;
    selectedStall = null;
    hideInfo();

    document.querySelectorAll('.zone-block').forEach((el) => {
        if (el.id === `zone-${z}`) {
            el.classList.add('zone-active');
            el.classList.remove('dimmed');
        } else {
            el.classList.add('dimmed');
            el.classList.remove('zone-active');
        }
    });

    const zd = ZONES_DATA[z];
    document.getElementById('drawerTitle').textContent = `โซน ${z}`;
    document.getElementById('drawerSub').textContent = zd.description || '';
    document.getElementById('zonePill').className = `zone-pill pill-${z}`;
    document.getElementById('zoneDot').className = `zone-dot dot-${z}`;

    renderGrid(z);
    document.getElementById('drawer').classList.add('open');
    document.getElementById('backdrop').classList.add('show');
}

function closeZone() {
    activeZone = null;
    selectedStall = null;
    hideInfo();
    document.querySelectorAll('.zone-block').forEach((el) => el.classList.remove('zone-active', 'dimmed'));
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('backdrop').classList.remove('show');
}

function renderGrid(z) {
    const grid = document.getElementById('stallGrid');
    grid.innerHTML = '';
    let total = 0;
    let booked = 0;
    let maintenance = 0;

    (ZONES_DATA[z].columns || []).forEach((column) => {
        const wrap = document.createElement('div');
        wrap.className = column.small ? 'col-wrap col-wrap-small' : 'col-wrap';

        const lbl = document.createElement('div');
        lbl.className = 'col-lbl';
        lbl.textContent = column.rowCode;
        wrap.appendChild(lbl);

        const col = document.createElement('div');
        col.className = 'stall-col';

        column.stalls.forEach((stall) => {
            const id = stall.code;
            total += 1;
            const cell = document.createElement('div');
            cell.className = column.small ? 'stall-cell stall-cell-small' : 'stall-cell';
            cell.textContent = id;
            cell.dataset.stall = id;

            const bk = BOOKING_BY_STALL[id];

            if (stall.status === 'BOOKED') {
                booked += 1;
                cell.classList.add('booked');
                if (bk) cell.title = bk.shop;
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showInfo(id);
                });
            } else if (stall.status === 'MAINTENANCE') {
                maintenance += 1;
                cell.classList.add('maintenance');
                cell.title = 'อยู่ระหว่างซ่อมบำรุง';
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectEmpty(id, cell);
                });
            } else {
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectEmpty(id, cell);
                });
            }

            if (id === selectedStall) cell.classList.add('selected');
            if (currentQuery) tryHighlight(cell, id);
            col.appendChild(cell);
        });

        wrap.appendChild(col);
        grid.appendChild(wrap);
    });

    document.getElementById('drawerStats').innerHTML = `ทั้งหมด <b>${total}</b> ล็อก &nbsp;·&nbsp; จอง <b>${booked}</b> &nbsp;·&nbsp; ซ่อมบำรุง <b>${maintenance}</b> &nbsp;·&nbsp; ว่าง <b>${total - booked - maintenance}</b>`;
}

function selectEmpty(id, cell) {
    document.querySelectorAll('.stall-cell.selected').forEach((c) => c.classList.remove('selected'));
    cell.classList.add('selected');
    selectedStall = id;
    hideInfo();
}

function showInfo(id) {
    const d = BOOKING_BY_STALL[id];
    if (!d) return;

    document.querySelectorAll('.stall-cell.selected').forEach((c) => c.classList.remove('selected'));
    const cell = document.querySelector(`[data-stall="${id}"]`);
    if (cell) cell.classList.add('selected');
    selectedStall = id;

    document.getElementById('ic-head').textContent = `แผง ${id} — ${d.shop}`;
    document.getElementById('ic-shop').textContent = d.shop;
    document.getElementById('ic-product').textContent = d.product;
    document.getElementById('ic-date').textContent = d.date;
    document.getElementById('ic-name').textContent = d.name;
    document.getElementById('ic-phone').textContent = d.phone;
    document.getElementById('ic-note').textContent = d.note;

    const infoCard = document.getElementById('infoCard');
    infoCard.classList.add('show');
    infoCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideInfo() {
    document.getElementById('infoCard').classList.remove('show');
}

function tryHighlight(cell, id) {
    const d = BOOKING_BY_STALL[id];
    if (!d) return;
    if ((d.shop + d.product + d.name + d.note).toLowerCase().includes(currentQuery.toLowerCase())) {
        cell.classList.add('s-match');
    }
}

function doSearch(q) {
    currentQuery = q.trim();
    const badge = document.getElementById('resultBadge');
    const clrBtn = document.getElementById('clearBtn');

    document.querySelectorAll('.qtag').forEach((t) => t.classList.remove('active'));

    if (!currentQuery) {
        badge.classList.remove('show');
        clrBtn.classList.remove('show');
        document.querySelectorAll('.zone-block').forEach((el) => el.classList.remove('search-match'));
        if (activeZone) renderGrid(activeZone);
        return;
    }

    clrBtn.classList.add('show');
    let total = 0;
    const mz = new Set();

    Object.entries(BOOKING_BY_STALL).forEach(([id, d]) => {
        if ((d.shop + d.product + d.name + d.note).toLowerCase().includes(currentQuery.toLowerCase())) {
            total += 1;
            const zoneMatch = id.match(/^[A-Z]+/);
            if (zoneMatch) mz.add(zoneMatch[0]);
        }
    });

    document.querySelectorAll('.zone-block').forEach((el) => {
        const z = el.id.replace('zone-', '');
        if (mz.has(z)) el.classList.add('search-match');
        else el.classList.remove('search-match');
    });

    badge.textContent = `พบ ${total} ร้าน`;
    badge.classList.add('show');
    if (activeZone) renderGrid(activeZone);
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.qtag').forEach((t) => t.classList.remove('active'));
    doSearch('');
}

function quickSearch(btn, q) {
    document.getElementById('searchInput').value = q;
    document.querySelectorAll('.qtag').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    doSearch(q);
}

window.openZone = openZone;
window.closeZone = closeZone;
window.clearSearch = clearSearch;
window.quickSearch = quickSearch;

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => doSearch(e.target.value));
    }
});
