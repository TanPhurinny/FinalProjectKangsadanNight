/* Slots page interactions */
function readJsonScript(id) {
    const el = document.getElementById(id);
    if (!el) return {};
    try {
        return JSON.parse(el.textContent);
    } catch (e) {
        return {};
    }
}

const ZONES_DATA = readJsonScript('zonesDataJson');
const BOOKING_BY_STALL = readJsonScript('bookingByStallJson');

let activeZone = null;
let selectedStall = null;
let currentQuery = '';
let currentStatusFilter = null; // 'EMPTY' | 'BOOKED' | 'MAINTENANCE' | 'NEAR_EXPIRY' | 'SPECIAL' | null
let showLotColors = false; // เปิด/ปิดสีมุมพิเศษบนผัง

function stallMatchesFilter(id, stall) {
    if (currentStatusFilter) {
        if (currentStatusFilter === 'EMPTY') {
            return stall.status !== 'BOOKED' && stall.status !== 'MAINTENANCE';
        }
        if (currentStatusFilter === 'NEAR_EXPIRY') {
            return stall.expiryState === 'near' || stall.expiryState === 'expired';
        }
        if (currentStatusFilter === 'SPECIAL') {
            return !!stall.lotColor && stall.lotColor !== 'ไม่มี';
        }
        return stall.status === currentStatusFilter;
    }
    if (currentQuery) {
        const d = BOOKING_BY_STALL[id];
        if (!d) return false;
        return (d.shop + d.product + d.name + d.note).toLowerCase().includes(currentQuery.toLowerCase());
    }
    return false;
}

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

// โซน D ในผังจริงเป็นรูปตัว L (แถวบน D201-D208 8 ช่อง, ต่อลงมาแนวตั้ง D209 ใต้ D208,
// และมีกลุ่ม D211-D212 แยกอยู่ระดับล่างซ้าย) เก็บตำแหน่งจริงไว้ตรงนี้เพราะฐานข้อมูลไม่มีพิกัด x/y
const ZONE_D_LAYOUT = [
    { code: 'D201', col: 3, row: 1 }, { code: 'D202', col: 4, row: 1 },
    { code: 'D203', col: 5, row: 1 }, { code: 'D204', col: 6, row: 1 },
    { code: 'D205', col: 7, row: 1 }, { code: 'D206', col: 8, row: 1 },
    { code: 'D207', col: 9, row: 1 }, { code: 'D208', col: 10, row: 1 },
    { code: 'D211', col: 2, row: 2 }, { code: 'D212', col: 3, row: 2 },
    { code: 'D209', col: 10, row: 2 }
];

// map สีจริงของล็อคมุมพิเศษ (จาก CSV) ไปเป็น class สี — ฟ้า กับ ฟ้า-A9 ใช้เฉดเดียวกัน (ต่างกันแค่ส่วนเพิ่มราคา)
function lotColorClass(color) {
    if (!showLotColors) return '';
    if (color === 'ชมพู') return 'lot-pink';
    if (color === 'ฟ้า' || color === 'ฟ้า-A9') return 'lot-blue';
    if (color === 'เหลือง') return 'lot-yellow';
    return '';
}

function toggleLotColors(btn) {
    showLotColors = !showLotColors;
    btn.classList.toggle('active', showLotColors);
    if (activeZone) renderGrid(activeZone);
}
window.toggleLotColors = toggleLotColors;

function renderDZoneGrid(z, stallByCode) {
    const grid = document.getElementById('stallGrid');
    const layout = document.createElement('div');
    layout.className = 'zone-d-layout';

    const label = document.createElement('div');
    label.className = 'zone-d-tag';
    label.style.gridColumn = '1 / 2';
    label.style.gridRow = '2 / 3';
    label.textContent = 'D2';
    layout.appendChild(label);

    let booked = 0;
    let maintenance = 0;

    ZONE_D_LAYOUT.forEach((pos) => {
        const stall = stallByCode[pos.code];
        if (!stall) return;

        const cell = document.createElement('div');
        cell.className = 'stall-cell zone-d-cell tt-below';
        cell.style.gridColumn = `${pos.col} / ${pos.col + 1}`;
        cell.style.gridRow = `${pos.row} / ${pos.row + 1}`;
        cell.textContent = pos.code;
        cell.dataset.stall = pos.code;
        const lotClass = lotColorClass(stall.lotColor);
        if (lotClass) cell.classList.add(lotClass);

        const bk = BOOKING_BY_STALL[pos.code];
        if (stall.status === 'BOOKED') {
            booked += 1;
            cell.classList.add('booked');
            if (stall.expiryState === 'expired') cell.classList.add('expired');
            else if (stall.expiryState === 'near') cell.classList.add('near-expiry');
            const expiryNote = stall.expiryState === 'expired'
                ? '\n⚠ หมดอายุแล้ว'
                : stall.expiryState === 'near' ? '\n⚠ ใกล้หมดอายุ' : '';
            cell.dataset.tooltip = `แผง ${pos.code}\n${bk ? `${bk.shop}\nขาย: ${bk.product}\n(คลิกดูรายละเอียด)` : 'จองแล้ว'}${expiryNote}`;
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                showInfo(pos.code);
            });
        } else if (stall.status === 'MAINTENANCE') {
            maintenance += 1;
            cell.classList.add('maintenance');
            cell.dataset.tooltip = `แผง ${pos.code}\nอยู่ระหว่างซ่อมบำรุง`;
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                selectEmpty(pos.code, cell);
            });
        } else {
            cell.dataset.tooltip = `แผง ${pos.code}\nว่าง\n${lotPriceLabel(stall)}`;
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                selectEmpty(pos.code, cell);
            });
        }

        if (pos.code === selectedStall) cell.classList.add('selected');
        if ((currentQuery || currentStatusFilter) && stallMatchesFilter(pos.code, stall)) cell.classList.add('s-match');
        layout.appendChild(cell);
    });

    grid.appendChild(layout);
    document.getElementById('drawerStats').innerHTML = `ทั้งหมด <b>${ZONE_D_LAYOUT.length}</b> ล็อก &nbsp;·&nbsp; จอง <b>${booked}</b> &nbsp;·&nbsp; ซ่อมบำรุง <b>${maintenance}</b> &nbsp;·&nbsp; ว่าง <b>${ZONE_D_LAYOUT.length - booked - maintenance}</b>`;
}

function renderGrid(z) {
    const grid = document.getElementById('stallGrid');
    grid.innerHTML = '';

    if (z === 'D') {
        const stallByCode = {};
        (ZONES_DATA[z].columns || []).forEach((column) => {
            column.stalls.forEach((stall) => { stallByCode[stall.code] = stall; });
        });
        renderDZoneGrid(z, stallByCode);
        return;
    }

    let total = 0;
    let booked = 0;
    let maintenance = 0;

    // โซน E, X, C ในผังจริงมีแถวเดียวเรียงตามแนวนอน (ซ้ายไปขวา) ไม่ใช่เรียงลงมาแนวตั้งแบบโซนอื่น
    const isHorizontalZone = ['E', 'X', 'C'].includes(z);

    (ZONES_DATA[z].columns || []).forEach((column) => {
        const wrapClasses = ['col-wrap'];
        if (isHorizontalZone) wrapClasses.push('col-wrap-horizontal');
        if (column.groupEnd) wrapClasses.push('col-group-end');

        const wrap = document.createElement('div');
        wrap.className = wrapClasses.join(' ');

        const lbl = document.createElement('div');
        lbl.className = 'col-lbl';
        lbl.textContent = column.rowCode;
        wrap.appendChild(lbl);

        const col = document.createElement('div');
        col.className = isHorizontalZone ? 'stall-col stall-col-horizontal' : 'stall-col';

        // ล็อกเล็ก (โซน T ที่แทรกอยู่ในคอลัมน์ B2) บางคู่วางซ้อนกันแบ่งครึ่งบน-ล่างของล็อคปกติ 1 ล็อกตามผังจริง
        // (groupSize 2 = จับคู่ซ้อน, groupSize 1 = อยู่เดี่ยวเต็มล็อคปกติ — ดู T_GROUP_SIZES ใน marketController.js)
        const isPaired = (s) => s.small && s.groupSize === 2;
        let smallWrap = null;
        let currentGroupId = null;
        const getSmallWrap = (groupId) => {
            if (!smallWrap || groupId !== currentGroupId) {
                currentGroupId = groupId;
                smallWrap = document.createElement('div');
                smallWrap.className = 'small-lot-pair';
                col.appendChild(smallWrap);
            }
            return smallWrap;
        };

        column.stalls.forEach((stall, stallIndex) => {
            const id = stall.code;

            if (stall.status === 'PLACEHOLDER') {
                const placeholderCell = document.createElement('div');
                placeholderCell.className = isPaired(stall) ? 'stall-cell stall-cell-small placeholder' : 'stall-cell placeholder';
                placeholderCell.textContent = 'x';
                (isPaired(stall) ? getSmallWrap(stall.groupId) : col).appendChild(placeholderCell);
                return;
            }

            total += 1;
            const cell = document.createElement('div');
            cell.className = isPaired(stall) ? 'stall-cell stall-cell-small' : 'stall-cell';
            cell.textContent = id;
            cell.dataset.stall = id;
            // แถวบนสุดของแต่ละคอลัมน์ชิดขอบบน drawer-grid เหมือนกัน ทำให้ tooltip ที่โผล่ขึ้นด้านบนโดนตัดขาด
            if (isHorizontalZone || stallIndex === 0) cell.classList.add('tt-below');
            const lotClass = lotColorClass(stall.lotColor);
            if (lotClass) cell.classList.add(lotClass);

            const bk = BOOKING_BY_STALL[id];

            if (stall.status === 'BOOKED') {
                booked += 1;
                cell.classList.add('booked');
                if (stall.expiryState === 'expired') cell.classList.add('expired');
                else if (stall.expiryState === 'near') cell.classList.add('near-expiry');
                const expiryNote = stall.expiryState === 'expired'
                    ? '\n⚠ หมดอายุแล้ว'
                    : stall.expiryState === 'near' ? '\n⚠ ใกล้หมดอายุ' : '';
                cell.dataset.tooltip = `แผง ${id}\n${bk ? `${bk.shop}\nขาย: ${bk.product}\n(คลิกดูรายละเอียด)` : 'จองแล้ว'}${expiryNote}`;
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showInfo(id);
                });
            } else if (stall.status === 'MAINTENANCE') {
                maintenance += 1;
                cell.classList.add('maintenance');
                cell.dataset.tooltip = `แผง ${id}\nอยู่ระหว่างซ่อมบำรุง`;
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectEmpty(id, cell);
                });
            } else {
                cell.dataset.tooltip = `แผง ${id}\nว่าง\n${lotPriceLabel(stall)}`;
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectEmpty(id, cell);
                });
            }

            if (id === selectedStall) cell.classList.add('selected');
            if ((currentQuery || currentStatusFilter) && stallMatchesFilter(id, stall)) cell.classList.add('s-match');
            (isPaired(stall) ? getSmallWrap(stall.groupId) : col).appendChild(cell);
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

function lotPriceLabel(stall) {
    if (!stall.lotType || stall.pricePerDay == null) return 'ยังไม่ระบุราคา';
    const colorText = stall.lotColor && stall.lotColor !== 'ไม่มี' ? ` (สี ${stall.lotColor})` : '';
    return `${stall.lotType}${colorText} — ${stall.pricePerDay.toLocaleString('th-TH')} บาท/วัน`;
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
    document.getElementById('ic-detail').textContent = d.productDetail || '-';
    document.getElementById('ic-date').textContent = d.date;
    document.getElementById('ic-name').textContent = d.name;
    document.getElementById('ic-phone').textContent = d.phone;
    document.getElementById('ic-note').textContent = d.note;

    const icImage = document.getElementById('ic-image');
    if (d.image) {
        icImage.src = d.image;
        icImage.classList.remove('d-none');
    } else {
        icImage.classList.add('d-none');
        icImage.removeAttribute('src');
    }

    document.getElementById('infoCard').classList.add('show');
    document.getElementById('infoCardBackdrop').classList.add('show');
}

function hideInfo() {
    document.getElementById('infoCard').classList.remove('show');
    document.getElementById('infoCardBackdrop').classList.remove('show');
}
window.hideInfo = hideInfo;

const STATUS_LABELS = { EMPTY: 'แผงว่าง', BOOKED: 'แผงที่จองแล้ว', MAINTENANCE: 'แผงซ่อมบำรุง', SPECIAL: 'แผงมุมพิเศษ' };

function refreshFilterResults() {
    const badge = document.getElementById('resultBadge');
    const clrBtn = document.getElementById('clearBtn');

    if (!currentQuery && !currentStatusFilter) {
        badge.classList.remove('show');
        clrBtn.classList.remove('show');
        document.querySelectorAll('.zone-block').forEach((el) => el.classList.remove('search-match'));
        if (activeZone) renderGrid(activeZone);
        return;
    }

    clrBtn.classList.add('show');
    let total = 0;
    const mz = new Set();

    Object.keys(ZONES_DATA).forEach((z) => {
        (ZONES_DATA[z].columns || []).forEach((column) => {
            column.stalls.forEach((stall) => {
                if (stall.status === 'PLACEHOLDER') return;
                if (stallMatchesFilter(stall.code, stall)) {
                    total += 1;
                    mz.add(z);
                }
            });
        });
    });

    document.querySelectorAll('.zone-block').forEach((el) => {
        const z = el.id.replace('zone-', '');
        if (mz.has(z)) el.classList.add('search-match');
        else el.classList.remove('search-match');
    });

    badge.textContent = currentStatusFilter
        ? `พบ ${total} แผง (${STATUS_LABELS[currentStatusFilter]})`
        : `พบ ${total} ร้าน`;
    badge.classList.add('show');
    if (activeZone) renderGrid(activeZone);
}

function doSearch(q) {
    currentQuery = q.trim();
    currentStatusFilter = null;
    document.querySelectorAll('.qtag').forEach((t) => t.classList.remove('active'));
    refreshFilterResults();
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    currentStatusFilter = null;
    document.querySelectorAll('.qtag').forEach((t) => t.classList.remove('active'));
    doSearch('');
}

function quickStatusFilter(btn, status) {
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.qtag').forEach((t) => t.classList.remove('active'));
    currentQuery = '';

    if (currentStatusFilter === status) {
        currentStatusFilter = null;
        refreshFilterResults();
        return;
    }

    currentStatusFilter = status;
    btn.classList.add('active');
    refreshFilterResults();
}

window.openZone = openZone;
window.closeZone = closeZone;
window.clearSearch = clearSearch;
window.quickStatusFilter = quickStatusFilter;

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => doSearch(e.target.value));
    }
});
