const PAGE_DATA = window.PAGE_DATA || {};
const REQUEST_DATA = PAGE_DATA.bookingRequest || {};
const ZONE_BY_CODE = PAGE_DATA.zoneByCode || {};
const BOOKED_STALLS = new Set(PAGE_DATA.bookedStalls || []);

let currentSelectedStall = String(REQUEST_DATA.assignedStallCode || '').trim().toUpperCase() || null;
let currentZone = (REQUEST_DATA.zone || Object.keys(ZONE_BY_CODE)[0] || 'A').toUpperCase();

const tooltip = document.getElementById('adminTooltip');
const confirmOverlay = document.getElementById('confirmOverlay');
const zoneBtns = document.querySelectorAll('.btn-zone');
const overviewBlocks = document.querySelectorAll('.ov-zone-block');
const toggleBtns = document.querySelectorAll('.toggle-btn');
const zoneButtonsPanel = document.getElementById('zoneButtons');
const zoneOverviewPanel = document.getElementById('zoneOverviewCanvas');

function setApplicantData() {
    document.getElementById('app-name').textContent = REQUEST_DATA.sellerName || '-';
    document.getElementById('app-shop').textContent = REQUEST_DATA.shopName || '-';
    document.getElementById('app-phone').textContent = REQUEST_DATA.phone || '-';
    document.getElementById('app-zone').textContent = REQUEST_DATA.zoneText || '-';
    document.getElementById('app-date').textContent = REQUEST_DATA.dateText || '-';
    document.getElementById('app-note').textContent = REQUEST_DATA.note || '-';
    document.getElementById('app-product-type').textContent = REQUEST_DATA.productTypeLabel || '-';
    document.getElementById('app-product-name').textContent = REQUEST_DATA.productName || '-';
    document.getElementById('app-product-detail').textContent = REQUEST_DATA.productDetail || '-';

    const imageEl = document.getElementById('app-image');
    if (REQUEST_DATA.productImage) {
        imageEl.src = REQUEST_DATA.productImage;
        imageEl.style.display = 'block';
    }
}

function renderZoneButtons() {
    const availableZones = Object.keys(ZONE_BY_CODE);
    zoneBtns.forEach((btn) => {
        const zone = (btn.dataset.zone || '').toUpperCase();
        btn.style.display = availableZones.includes(zone) ? 'inline-flex' : 'none';
    });
    overviewBlocks.forEach((block) => {
        const zone = (block.dataset.zone || '').toUpperCase();
        block.style.display = availableZones.includes(zone) ? 'flex' : 'none';
    });
}

function setActiveZoneBtn(zoneCode) {
    zoneBtns.forEach((b) => {
        b.classList.toggle('active', (b.dataset.zone || '').toUpperCase() === zoneCode);
    });
    overviewBlocks.forEach((b) => {
        b.classList.toggle('active', (b.dataset.zone || '').toUpperCase() === zoneCode);
    });
}

function setViewMode(mode) {
    toggleBtns.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    zoneButtonsPanel.style.display = mode === 'overview' ? 'none' : 'flex';
    zoneOverviewPanel.style.display = mode === 'overview' ? 'block' : 'none';
}

// โซน D ในผังจริงเป็นรูปตัว L (แถวบน D201-D208 8 ช่อง, ต่อลงมาแนวตั้ง D209-D210 ใต้ D208,
// และมีกลุ่ม D211-D212 แยกอยู่ระดับล่างซ้าย) เก็บตำแหน่งจริงไว้ตรงนี้เพราะฐานข้อมูลไม่มีพิกัด x/y
const ZONE_D_LAYOUT = [
    { code: 'D201', col: 3, row: 1 }, { code: 'D202', col: 4, row: 1 },
    { code: 'D203', col: 5, row: 1 }, { code: 'D204', col: 6, row: 1 },
    { code: 'D205', col: 7, row: 1 }, { code: 'D206', col: 8, row: 1 },
    { code: 'D207', col: 9, row: 1 }, { code: 'D208', col: 10, row: 1 },
    { code: 'D211', col: 2, row: 2 }, { code: 'D212', col: 3, row: 2 },
    { code: 'D209', col: 10, row: 2 },
    { code: 'D210', col: 10, row: 3 }
];

function makeStallCell(code, stall) {
    const cell = document.createElement('div');
    cell.className = stall && stall.small ? 'stall-cell stall-cell-small' : 'stall-cell';
    cell.textContent = code;

    const isBooked = BOOKED_STALLS.has(code);
    if (isBooked) {
        cell.classList.add('booked');
        cell.addEventListener('mouseenter', (e) => showTooltip(e, code));
        cell.addEventListener('mouseleave', hideTooltip);
        cell.addEventListener('mousemove', moveTooltip);
    } else {
        cell.addEventListener('click', () => {
            document.querySelectorAll('.stall-cell').forEach((c) => c.classList.remove('selected'));
            cell.classList.add('selected');
            currentSelectedStall = code;
        });
    }

    if (code === currentSelectedStall) {
        cell.classList.add('selected');
    }

    return cell;
}

function renderDZoneGrid(gridContainer, stallByCode) {
    const layout = document.createElement('div');
    layout.className = 'zone-d-layout';

    const label = document.createElement('div');
    label.className = 'zone-d-tag';
    label.style.gridColumn = '1 / 2';
    label.style.gridRow = '2 / 3';
    label.textContent = 'D2';
    layout.appendChild(label);

    ZONE_D_LAYOUT.forEach((pos) => {
        const stall = stallByCode[pos.code];
        if (!stall) return;

        const cell = makeStallCell(pos.code, stall);
        cell.classList.add('zone-d-cell');
        cell.style.gridColumn = `${pos.col} / ${pos.col + 1}`;
        cell.style.gridRow = `${pos.row} / ${pos.row + 1}`;
        layout.appendChild(cell);
    });

    gridContainer.appendChild(layout);
}

function renderGrid(zoneKey) {
    const gridContainer = document.getElementById('adminGrid');
    gridContainer.innerHTML = '';

    const zoneData = ZONE_BY_CODE[zoneKey];
    if (!zoneData || !zoneData.columns.length) {
        gridContainer.innerHTML = '<div style="padding:24px; color:#666;">ไม่มีข้อมูลแผงสำหรับโซนนี้</div>';
        return;
    }

    if (zoneKey === 'D') {
        const stallByCode = {};
        zoneData.columns.forEach((column) => {
            column.stalls.forEach((stall) => { stallByCode[stall.code] = stall; });
        });
        renderDZoneGrid(gridContainer, stallByCode);
        return;
    }

    // โซน E, X, C ในผังจริงมีแถวเดียวเรียงตามแนวนอน (ซ้ายไปขวา) ไม่ใช่เรียงลงมาแนวตั้งแบบโซนอื่น
    const isHorizontalZone = ['E', 'X', 'C'].includes(zoneKey);

    zoneData.columns.forEach((column) => {
        const blockClasses = ['col-block'];
        if (column.groupEnd) blockClasses.push('col-group-end');

        const blockDiv = document.createElement('div');
        blockDiv.className = blockClasses.join(' ');

        const lbl = document.createElement('div');
        lbl.className = 'col-lbl';
        lbl.textContent = column.rowCode;

        const wrap = document.createElement('div');
        wrap.className = isHorizontalZone ? 'col-wrap col-wrap-horizontal' : 'col-wrap';
        wrap.appendChild(lbl);

        const colDiv = document.createElement('div');
        colDiv.className = isHorizontalZone ? 'stall-column stall-column-horizontal' : 'stall-column';

        column.stalls.forEach((stall) => {
            if (stall.status === 'PLACEHOLDER') {
                const placeholderCell = document.createElement('div');
                placeholderCell.className = stall.small ? 'stall-cell stall-cell-small placeholder' : 'stall-cell placeholder';
                placeholderCell.textContent = 'x';
                colDiv.appendChild(placeholderCell);
                return;
            }

            colDiv.appendChild(makeStallCell(stall.code, stall));
        });

        wrap.appendChild(colDiv);
        blockDiv.appendChild(wrap);
        gridContainer.appendChild(blockDiv);
    });
}

function showTooltip(e, stallName) {
    document.getElementById('tt-stall-id').textContent = stallName;
    document.getElementById('tt-shop').textContent = 'มีผู้จองแล้ว';
    document.getElementById('tt-lock').textContent = stallName;
    document.getElementById('tt-date').textContent = '-';
    document.getElementById('tt-name').textContent = '-';
    document.getElementById('tt-phone').textContent = '-';
    document.getElementById('tt-note').textContent = 'ล็อกนี้ไม่ว่าง';

    tooltip.style.display = 'block';
    moveTooltip(e);
}

function hideTooltip() {
    tooltip.style.display = 'none';
}

function moveTooltip(e) {
    let x = e.clientX + 15;
    let y = e.clientY + 15;

    if (x + tooltip.offsetWidth > window.innerWidth) {
        x = e.clientX - tooltip.offsetWidth - 10;
    }
    if (y + tooltip.offsetHeight > window.innerHeight) {
        y = e.clientY - tooltip.offsetHeight - 10;
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}

function confirmStall() {
    if (!currentSelectedStall) {
        if (window.Swal && typeof window.Swal.fire === 'function') {
            Swal.fire({
                icon: 'warning',
                title: 'ยังไม่ได้เลือกแผงค้า',
                text: 'กรุณาคลิกเลือกแผงค้า 1 ล็อกบนแผนที่เพื่อจัดแผงให้ลูกค้า',
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#3BB8D4'
            });
        } else {
            alert('กรุณาคลิกเลือกแผงค้า 1 ล็อกบนแผนที่เพื่อจัดแผงให้ลูกค้า');
        }
        return;
    }
    openConfirmSummary();
}

function openConfirmSummary() {
    document.getElementById('c-stall').textContent = currentSelectedStall;
    document.getElementById('c-shop').textContent = document.getElementById('app-shop').textContent || '-';
    document.getElementById('c-name').textContent = document.getElementById('app-name').textContent || '-';
    document.getElementById('c-phone').textContent = document.getElementById('app-phone').textContent || '-';
    document.getElementById('c-zone').textContent = document.getElementById('app-zone').textContent || '-';
    document.getElementById('c-date').textContent = document.getElementById('app-date').textContent || '-';
    confirmOverlay.classList.add('active');
}

function closeConfirmSummary() {
    confirmOverlay.classList.remove('active');
}

function closeConfirmOnOverlay(event) {
    if (event.target === confirmOverlay) {
        closeConfirmSummary();
    }
}

function postForm(action, fields) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = action;

    Object.keys(fields).forEach((key) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(fields[key] || '');
        form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
}

function submitConfirmStall() {
    postForm('/admin/booking-stall/confirm', {
        requestId: REQUEST_DATA.id || '',
        selectedStall: currentSelectedStall || ''
    });
}

function rejectStall() {
    const ok = window.confirm('คุณแน่ใจหรือไม่ที่จะปฏิเสธคำขอนี้?');
    if (!ok) return;

    postForm('/admin/booking-stall/reject', {
        requestId: REQUEST_DATA.id || ''
    });
}

function selectZone(selectedZone) {
    if (!ZONE_BY_CODE[selectedZone]) return;
    currentZone = selectedZone;
    setActiveZoneBtn(selectedZone);
    renderGrid(selectedZone);
}

document.addEventListener('DOMContentLoaded', () => {
    setApplicantData();
    renderZoneButtons();
    setActiveZoneBtn(currentZone);
    renderGrid(currentZone);
    setViewMode('buttons');

    zoneBtns.forEach((btn) => {
        btn.addEventListener('click', function () {
            selectZone(String(this.dataset.zone || '').toUpperCase());
        });
    });

    overviewBlocks.forEach((block) => {
        block.addEventListener('click', function () {
            selectZone(String(this.dataset.zone || '').toUpperCase());
        });
    });

    toggleBtns.forEach((btn) => {
        btn.addEventListener('click', function () {
            setViewMode(this.dataset.mode);
        });
    });
});

window.confirmStall = confirmStall;
window.closeConfirmSummary = closeConfirmSummary;
window.closeConfirmOnOverlay = closeConfirmOnOverlay;
window.submitConfirmStall = submitConfirmStall;
window.rejectStall = rejectStall;
