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

// หารายละเอียดล็อก (มี expiryState) จาก ZONES_DATA ด้วยรหัสล็อก ไม่สนใจว่ากำลังดูโซนไหนอยู่บนจอตอนนี้
function findStallByCode(code) {
    for (const zoneCode of Object.keys(ZONES_DATA)) {
        for (const column of (ZONES_DATA[zoneCode].columns || [])) {
            const found = column.stalls.find((s) => s.code === code);
            if (found) return found;
        }
    }
    return null;
}

// ==========================================
// TOOLTIP ลอยตามเมาส์ (hover ดูรายละเอียดไว) — เหมือนหน้า /admin/booking-stall
// คลิกล็อกที่จองแล้วยังเปิด info-card แบบเดิม (ดูรายละเอียดครบ + ปุ่มปล่อยล็อก), อันนี้แค่ hover ดูไวๆ
// ==========================================
const adminTooltip = document.getElementById('adminTooltip');

function showStallTooltip(e, code, stall, status) {
    document.getElementById('tt-stall-id').textContent = code;
    adminTooltip.classList.toggle('tt-available', status !== 'BOOKED');

    const ttImage = document.getElementById('tt-image');

    if (status === 'BOOKED') {
        // ข้อมูลจริงจาก Slot->Booking->User->ShopDetail (ดู utils/stallOccupancy.js)
        // ถ้าไม่เจอข้อมูล (คำขอเก่า/หาไม่เจอ) โชว์ "-" แทน
        const occ = stall && stall.occupant;
        const badgeText = occ && occ.statusBadge === 'unpaid' ? ' 🟣 ยังไม่จ่ายเงิน'
            : (occ && occ.statusBadge === 'new' ? ' 🟢 ลูกค้าใหม่' : '');
        if (occ && occ.productImage) {
            ttImage.src = occ.productImage;
            ttImage.hidden = false;
        } else {
            ttImage.hidden = true;
            ttImage.removeAttribute('src');
        }
        document.getElementById('tt-label-shop').textContent = 'ชื่อร้านค้า';
        document.getElementById('tt-shop').textContent = ((occ && occ.shopName) || 'มีผู้จองแล้ว (ไม่พบชื่อร้าน)') + badgeText;
        // หมายเลขล็อกซ้ำกับหัว tooltip อยู่แล้ว ใช้ช่องนี้โชว์สถานะชำระเงินแทน
        document.getElementById('tt-label-lock').textContent = 'สถานะชำระเงิน';
        document.getElementById('tt-lock').textContent = (occ && occ.paymentStatusText) || '-';
        document.getElementById('tt-label-date').textContent = 'ระยะเวลาเช่า';
        document.getElementById('tt-date').textContent = (occ && occ.rentalPeriodText)
            ? occ.rentalPeriodText + (occ.daysUntilExpiry != null ? ` (เหลือ ${occ.daysUntilExpiry} วัน)` : '')
            : '-';
        document.getElementById('tt-label-name').textContent = 'ผู้จอง';
        document.getElementById('tt-name').textContent = (occ && occ.renterName) || '-';
        document.getElementById('tt-phone-group').style.display = '';
        document.getElementById('tt-label-phone').textContent = 'เบอร์โทรศัพท์';
        document.getElementById('tt-phone').textContent = (occ && occ.phone) || '-';
        document.getElementById('tt-label-note').textContent = 'ขายสินค้า';
        if (occ) {
            const priceText = occ.dailyStallPrice != null ? `${Number(occ.dailyStallPrice).toLocaleString('th-TH')} บาท/วัน` : null;
            const stallCountText = occ.stallCountForShop > 1 ? `ถือรวม ${occ.stallCountForShop} ล็อก` : null;
            document.getElementById('tt-note').textContent =
                [occ.productTypeText, occ.productSubtype, priceText, stallCountText, 'คลิกล็อกนี้เพื่อดูรายละเอียด'].filter(Boolean).join(' · ');
        } else {
            document.getElementById('tt-note').textContent = 'ล็อกนี้ไม่ว่าง · คลิกเพื่อดูรายละเอียด';
        }
    } else if (status === 'MAINTENANCE') {
        ttImage.hidden = true;
        document.getElementById('tt-label-shop').textContent = 'สถานะ';
        document.getElementById('tt-shop').textContent = 'อยู่ระหว่างซ่อมบำรุง';
        document.getElementById('tt-label-lock').textContent = 'ประเภท/ขนาด';
        document.getElementById('tt-lock').textContent = (stall && stall.lotType) || '-';
        document.getElementById('tt-label-date').textContent = 'ราคา/วัน';
        document.getElementById('tt-date').textContent = stall && stall.pricePerDay != null
            ? `${stall.pricePerDay.toLocaleString('th-TH')} บาท`
            : '-';
        document.getElementById('tt-label-name').textContent = 'มุมพิเศษ';
        document.getElementById('tt-name').textContent = '-';
        document.getElementById('tt-phone-group').style.display = 'none';
        document.getElementById('tt-label-note').textContent = 'หมายเหตุ';
        document.getElementById('tt-note').textContent = 'ปิดซ่อมบำรุงอยู่ ยังจองไม่ได้';
    } else {
        ttImage.hidden = true;
        const colorText = stall && stall.lotColor && stall.lotColor !== 'ไม่มี' ? `สี${stall.lotColor}` : '-';
        document.getElementById('tt-label-shop').textContent = 'สถานะ';
        document.getElementById('tt-shop').textContent = 'ว่าง — พร้อมให้จอง';
        document.getElementById('tt-label-lock').textContent = 'ประเภท/ขนาด';
        document.getElementById('tt-lock').textContent = (stall && stall.lotType) || '-';
        document.getElementById('tt-label-date').textContent = 'ราคา/วัน';
        document.getElementById('tt-date').textContent = stall && stall.pricePerDay != null
            ? `${stall.pricePerDay.toLocaleString('th-TH')} บาท`
            : '-';
        document.getElementById('tt-label-name').textContent = 'มุมพิเศษ';
        document.getElementById('tt-name').textContent = colorText;
        document.getElementById('tt-phone-group').style.display = 'none';
        document.getElementById('tt-label-note').textContent = 'หมายเหตุ';
        document.getElementById('tt-note').textContent = 'ล็อกว่าง';
    }

    adminTooltip.style.display = 'block';
    moveStallTooltip(e);
}

function hideStallTooltip() {
    adminTooltip.style.display = 'none';
}

function moveStallTooltip(e) {
    // ให้ tooltip โผล่ด้านข้างเมาส์ (แนวนอน) แทนบน/ล่าง กันไม่ให้ทับแถวล็อกที่อยู่ติดกัน
    let x = e.clientX + 20;
    let y = e.clientY - (adminTooltip.offsetHeight / 2);

    if (x + adminTooltip.offsetWidth > window.innerWidth) {
        x = e.clientX - adminTooltip.offsetWidth - 20;
    }
    if (x < 0) x = 4;

    if (y < 0) y = 4;
    if (y + adminTooltip.offsetHeight > window.innerHeight) {
        y = window.innerHeight - adminTooltip.offsetHeight - 4;
    }

    adminTooltip.style.left = `${x}px`;
    adminTooltip.style.top = `${y}px`;
}

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
            return stall.expiryState === 'near' || stall.expiryState === 'critical' || stall.expiryState === 'expired';
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

        cell.addEventListener('mouseenter', (e) => showStallTooltip(e, pos.code, stall, stall.status));
        cell.addEventListener('mouseleave', hideStallTooltip);
        cell.addEventListener('mousemove', moveStallTooltip);

        if (stall.status === 'BOOKED') {
            booked += 1;
            cell.classList.add('booked');
            if (stall.expiryState === 'expired') cell.classList.add('expired');
            else if (stall.expiryState === 'critical') cell.classList.add('expiry-critical');
            else if (stall.expiryState === 'near') cell.classList.add('expiry-near');
            // ป้ายสถานะร้าน (ไม่จ่ายเงิน/ลูกค้าใหม่) คำนวณไว้แล้วฝั่ง backend (ดู utils/stallOccupancy.js)
            if (stall.occupant && stall.occupant.statusBadge) {
                cell.classList.add(stall.occupant.statusBadge === 'unpaid' ? 'occ-unpaid' : 'occ-new');
            }
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                showInfo(pos.code);
            });
        } else if (stall.status === 'MAINTENANCE') {
            maintenance += 1;
            cell.classList.add('maintenance');
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                selectEmpty(pos.code, cell);
            });
        } else {
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

            cell.addEventListener('mouseenter', (e) => showStallTooltip(e, id, stall, stall.status));
            cell.addEventListener('mouseleave', hideStallTooltip);
            cell.addEventListener('mousemove', moveStallTooltip);

            if (stall.status === 'BOOKED') {
                booked += 1;
                cell.classList.add('booked');
                if (stall.expiryState === 'expired') cell.classList.add('expired');
                else if (stall.expiryState === 'critical') cell.classList.add('expiry-critical');
                else if (stall.expiryState === 'near') cell.classList.add('expiry-near');
                // ป้ายสถานะร้าน (ไม่จ่ายเงิน/ลูกค้าใหม่) คำนวณไว้แล้วฝั่ง backend (ดู utils/stallOccupancy.js)
                if (stall.occupant && stall.occupant.statusBadge) {
                    cell.classList.add(stall.occupant.statusBadge === 'unpaid' ? 'occ-unpaid' : 'occ-new');
                }
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showInfo(id);
                });
            } else if (stall.status === 'MAINTENANCE') {
                maintenance += 1;
                cell.classList.add('maintenance');
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

function showInfo(id) {
    const stallInfo = findStallByCode(id);
    // occ = ข้อมูลจริงจาก Slot->Booking->User->ShopDetail (ดู utils/stallOccupancy.js) ครบกว่า มี
    // subtype/สถานะจ่ายเงิน/ลูกค้าใหม่/ลิงก์อนุมัติ — d (เก่ากว่า) มีแค่ตอนคำขอมี assignedStallCode ตรงกัน
    // และมี productDetail (ขายอะไรบ้าง แบบข้อความอิสระ) ที่ occ ไม่มี จึงใช้ทั้งคู่ ผสมกันเลือกที่มีข้อมูลจริง
    const occ = stallInfo && stallInfo.occupant;
    const d = BOOKING_BY_STALL[id];
    if (!occ && !d) return;

    document.querySelectorAll('.stall-cell.selected').forEach((c) => c.classList.remove('selected'));
    const cell = document.querySelector(`[data-stall="${id}"]`);
    if (cell) cell.classList.add('selected');
    selectedStall = id;

    const shopName = (occ && occ.shopName) || (d && d.shop) || 'ไม่พบชื่อร้าน';
    const badgeText = occ && occ.statusBadge === 'unpaid' ? ' 🟣 ยังไม่จ่ายเงิน'
        : (occ && occ.statusBadge === 'new' ? ' 🟢 ลูกค้าใหม่' : '');

    document.getElementById('ic-head').textContent = `แผง ${id} — ${shopName}`;
    document.getElementById('ic-shop').textContent = shopName + badgeText;
    document.getElementById('ic-product').textContent = occ
        ? ([occ.productTypeText, occ.productSubtype].filter(Boolean).join(' · ') || '-')
        : (d ? d.product : '-');
    const stallCountText = occ && occ.stallCountForShop > 1 ? `ถือรวม ${occ.stallCountForShop} ล็อก` : null;
    document.getElementById('ic-detail').textContent = (d && d.productDetail) || stallCountText || '-';
    document.getElementById('ic-date').textContent = occ && occ.rentalPeriodText
        ? occ.rentalPeriodText + (occ.daysUntilExpiry != null ? ` (เหลือ ${occ.daysUntilExpiry} วัน)` : '')
        : ((d && d.date) || '-');
    document.getElementById('ic-payment').textContent = (occ && occ.paymentStatusText) || '-';
    document.getElementById('ic-name').textContent = (occ && occ.renterName) || (d && d.name) || '-';
    document.getElementById('ic-phone').textContent = (occ && occ.phone) || (d && d.phone) || '-';
    const priceText = occ && occ.dailyStallPrice != null ? `${Number(occ.dailyStallPrice).toLocaleString('th-TH')} บาท/วัน` : null;
    document.getElementById('ic-note').textContent = (d && d.note) || priceText || '-';

    const icImage = document.getElementById('ic-image');
    const imageUrl = (occ && occ.productImage) || (d && d.image);
    if (imageUrl) {
        icImage.src = imageUrl;
        icImage.classList.remove('d-none');
    } else {
        icImage.classList.add('d-none');
        icImage.removeAttribute('src');
    }

    // ลิงก์ไปหน้าอนุมัติ (เปิดที่ "รอบ" ของคำขอนี้เลย ไม่ auto-scroll ไปเจาะจงคำขอ หน้านั้นยังไม่รองรับ)
    const approvalsWrap = document.getElementById('icApprovalsLinkWrap');
    if (occ && occ.approvalsUrl) {
        document.getElementById('icApprovalsLink').href = occ.approvalsUrl;
        approvalsWrap.classList.remove('d-none');
    } else {
        approvalsWrap.classList.add('d-none');
    }

    // ล็อกที่หมดสัญญาแล้ว (expiryState === 'expired') โชว์ปุ่ม "ปล่อยล็อก" ให้แอดมินกดเอง ไม่มี auto-release
    document.getElementById('icExpiredActions').classList.toggle('d-none', !(stallInfo && stallInfo.expiryState === 'expired'));

    // ใกล้หมดสัญญา (near/critical แต่ยังไม่ expired) โชว์ปุ่ม "แจ้งเตือนร้านค้า" ให้แอดมินกดส่งอีเมลเตือนเอง
    const isExpiring = stallInfo && (stallInfo.expiryState === 'near' || stallInfo.expiryState === 'critical');
    document.getElementById('icExpiringActions').classList.toggle('d-none', !isExpiring);
    if (isExpiring) {
        document.getElementById('icExpiringNote').textContent = occ && occ.daysUntilExpiry != null
            ? `ล็อกนี้เหลืออีก ${occ.daysUntilExpiry} วันจะหมดสัญญา`
            : 'ล็อกนี้ใกล้หมดสัญญา';
    }

    document.getElementById('infoCard').classList.add('show');
    document.getElementById('infoCardBackdrop').classList.add('show');
}

function hideInfo() {
    document.getElementById('infoCard').classList.remove('show');
    document.getElementById('infoCardBackdrop').classList.remove('show');
}
window.hideInfo = hideInfo;

// ปล่อยล็อกที่หมดสัญญาแล้วกลับเป็นว่าง (ดู releaseExpiredStall ใน approvalController.js — เช็คซ้ำฝั่ง
// server ว่าหมดสัญญาจริงก่อนปล่อยเสมอ ไม่เชื่อฝั่ง client เฉยๆ)
// returnTo ส่งกลับ path หน้าปัจจุบันไปด้วย เพื่อให้ redirect กลับมาหน้าเดิมได้ถูก (ใช้ได้ทั้งจาก /admin/slots
// และ /admin/slots/expiring — ฝั่ง server whitelist ไว้แล้ว ดู resolveReturnPath ใน approvalController.js)
function submitStallActionForm(action, stallCode) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = action;
    [['stallCode', stallCode], ['returnTo', window.location.pathname]].forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
}

function releaseStall(code) {
    const stallCode = code || selectedStall;
    if (!stallCode) return;
    window.showConfirmDialog({
        title: 'ปล่อยล็อกนี้?',
        message: `ล็อก ${stallCode} จะกลับมาว่างพร้อมให้จองใหม่ทันที ตรวจสอบหน้างานแล้วว่าร้านเดิมออกจริงหรือยัง?`,
        tone: 'danger',
        confirmText: 'ปล่อยล็อก',
        onConfirm: () => submitStallActionForm('/admin/slots/release-stall', stallCode)
    });
}
window.releaseStall = releaseStall;

// แจ้งเตือนร้านค้าทางอีเมลว่าล็อกใกล้หมดสัญญา (ดู notifyStallExpiring ใน approvalController.js) —
// แอดมินกดเองเป็นครั้งๆ ไป ไม่มีระบบส่งอัตโนมัติ
function notifyExpiring(code) {
    const stallCode = code || selectedStall;
    if (!stallCode) return;
    window.showConfirmDialog({
        title: 'แจ้งเตือนร้านค้า?',
        message: `ส่งอีเมลแจ้งร้านค้าที่เช่าล็อก ${stallCode} ว่าใกล้หมดสัญญา ให้มาต่อสัญญา?`,
        tone: 'neutral',
        confirmText: 'ส่งแจ้งเตือน',
        onConfirm: () => submitStallActionForm('/admin/slots/notify-expiring', stallCode)
    });
}
window.notifyExpiring = notifyExpiring;

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
