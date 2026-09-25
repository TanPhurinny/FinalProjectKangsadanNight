/* Market map page interactions (customer/seller, read-only) — clone ของ
   public/js/admin/slots.js ตัด selectEmpty/near-expiry/expired ออก เพราะไม่มี
   action จัดแผงให้ลูกค้า และไม่มีข้อมูลผู้จอง (name/phone/date/note) ส่งมาจาก server แล้ว */
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
const VIEWER = Object.assign({ role: 'CUSTOMER', allowedZones: [], myStalls: [] }, readJsonScript('viewerJson'));
const MY_STALLS = new Set(VIEWER.myStalls || []);
const IS_SELLER = VIEWER.role === 'SELLER';
const IS_ADMIN = VIEWER.role === 'ADMIN';
const IS_STAFF = VIEWER.role === 'STAFF';

// ==========================================
// หมวดสินค้า: ใน DB ชื่อประเภทปนหลายแบบ (FOOD / Food / อาหาร) จึงรวมเป็นหมวดเดียวกันก่อนใช้แสดงสี/กรอง
// ==========================================
const CATEGORIES = [
    { key: 'FOOD', label: 'อาหาร', color: '#e67e22', match: /^(food|อาหาร)$/i },
    { key: 'FASHION', label: 'แฟชั่น', color: '#8e44ad', match: /^(fashion|แฟชั่น)$/i },
    { key: 'EVENT_BOOTH', label: 'บูธกิจกรรม', color: '#16a085', match: /^(event[ _]?booth|บูธกิจกรรม)$/i }
];
const OTHER_CATEGORY = { key: 'OTHER', label: 'อื่นๆ', color: '#607d8b' };

function categoryOf(code) {
    const bk = BOOKING_BY_STALL[code];
    if (!bk) return null;
    const name = String(bk.product || '').trim();
    return CATEGORIES.find((c) => c.match.test(name)) || OTHER_CATEGORY;
}

function applyCategoryColor(cell, code) {
    const cat = categoryOf(code);
    if (!cat) return;
    cell.classList.add('has-cat');
    cell.style.setProperty('--cat', cat.color);
}

// โหมดทดลอง ?demo=1 — จำลองร้านหลายหมวดลงล็อกว่างเฉพาะในเบราว์เซอร์ (ไม่แตะ DB, รีเฟรชแล้วหาย) ไว้ดูสี/ตัวกรองหมวด
if (new URLSearchParams(window.location.search).get('demo') === '1') {
    const DEMO_SHOPS = [
        ['Food', 'ข้าวมันไก่ป้าแดง', 'ข้าวมันไก่ ข้าวหมูแดง'],
        ['อาหาร', 'หมูปิ้งนมสด', 'หมูปิ้ง ไก่ย่าง ข้าวเหนียว'],
        ['Fashion', 'Nong Vintage', 'เสื้อยืด กางเกงยีนส์มือสอง'],
        ['แฟชั่น', 'กระเป๋าผ้าลายไทย', 'กระเป๋า หมวก ผ้าพันคอ'],
        ['Event Booth', 'บูธชิมฟรี น้ำดื่ม', 'กิจกรรมแจกสินค้าตัวอย่าง'],
        ['เครื่องดื่ม', 'ชาไทยเย็นชื่นใจ', 'ชาไทย กาแฟ โกโก้ปั่น'],
        ['ของฝาก', 'ของฝากกังสดาล', 'พวงกุญแจ แม่เหล็กติดตู้เย็น'],
        ['ของเล่น', 'ร้านตุ๊กตาหมี', 'ตุ๊กตา ของเล่นเด็ก'],
        ['Food', 'ก๋วยเตี๋ยวเรือเจ๊หน่อย', 'ก๋วยเตี๋ยวเรือ ต้มยำ']
    ];
    let n = 0;
    Object.keys(ZONES_DATA).forEach((z) => {
        (ZONES_DATA[z].columns || []).forEach((column) => {
            column.stalls.forEach((stall) => {
                if (stall.status === 'PLACEHOLDER' || stall.status === 'MAINTENANCE' || stall.status === 'BOOKED') return;
                n += 1;
                if (n % 3 !== 0) return;
                const [product, shop, productDetail] = DEMO_SHOPS[(n / 3) % DEMO_SHOPS.length | 0];
                stall.status = 'BOOKED';
                BOOKING_BY_STALL[stall.code] = { shop, product, productDetail, image: null };
            });
        });
    });
}

function zoneOf(code) {
    return Object.keys(ZONES_DATA).find((z) => (ZONES_DATA[z].columns || []).some((column) => column.stalls.some((st) => st.code === code))) || '';
}

function findStall(code) {
    for (const z of Object.keys(ZONES_DATA)) {
        for (const column of (ZONES_DATA[z].columns || [])) {
            const hit = column.stalls.find((st) => st.code === code);
            if (hit) return hit;
        }
    }
    return null;
}

function formatThaiDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysLeftUntil(value) {
    const end = new Date(value);
    if (Number.isNaN(end.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.round((end - today) / 86400000);
}

// ข้อความ+ปุ่มลัดในการ์ดรายละเอียดล็อก แยกตาม role (ผู้ขาย/ลูกค้า/แอดมิน/staff)
function renderRoleActions(id, zone, isVacant) {
    const noteEl = document.getElementById('icRoleNote');
    const actionsEl = document.getElementById('icRoleActions');
    const notes = [];
    const actions = [];
    const stall = findStall(id);

    if (MY_STALLS.has(id)) {
        notes.push('<b>ล็อกของคุณ</b>');
        if (stall && stall.bookingEndDate) {
            const left = daysLeftUntil(stall.bookingEndDate);
            const leftText = left === null ? '' : left < 0 ? ' (หมดสัญญาแล้ว)' : ` (เหลือ ${left} วัน)`;
            notes.push(`หมดสัญญา ${formatThaiDate(stall.bookingEndDate)}${leftText}`);
        }
        actions.push(['/booking-stall/extend', 'ต่อล็อก']);
    } else if (IS_SELLER && isVacant) {
        if ((VIEWER.allowedZones || []).includes(zone)) {
            notes.push('แผงว่าง จองได้ตามประเภทสินค้าของคุณ');
            actions.push([`/booking-stall?zone=${encodeURIComponent(zone)}`, `จองโซน ${zone}`]);
        } else {
            notes.push(`โซน ${zone} ไม่ตรงกับประเภทสินค้าของคุณ จึงจองไม่ได้`);
        }
    } else if (VIEWER.role === 'CUSTOMER' && isVacant) {
        notes.push('แผงนี้ยังว่าง สนใจขายของที่ตลาดกังสดาล?');
        actions.push(['/shop-application', 'สมัครเป็นผู้ขาย']);
    } else if (IS_ADMIN || IS_STAFF) {
        if (stall && stall.bookingEndDate) {
            const left = daysLeftUntil(stall.bookingEndDate);
            const leftText = left === null ? '' : left < 0 ? ' (หมดสัญญาแล้ว)' : ` (เหลือ ${left} วัน)`;
            notes.push(`หมดสัญญา ${formatThaiDate(stall.bookingEndDate)}${leftText}`);
        }
        if (IS_ADMIN) actions.push(['/admin/slots', 'จัดการที่หน้าจัดแผง']);
        if (IS_STAFF && !isVacant) actions.push(['/staff/marketinspection', 'ไปหน้าตรวจตลาด']);
    }

    noteEl.innerHTML = notes.join('<br>');
    noteEl.classList.toggle('d-none', !notes.length);
    actionsEl.innerHTML = '';
    actions.forEach(([href, label]) => {
        const a = document.createElement('a');
        a.className = 'ic-role-btn';
        a.href = href;
        a.textContent = label;
        actionsEl.appendChild(a);
    });
    actionsEl.classList.toggle('d-none', !actions.length);
}

// ==========================================
// TOOLTIP ลอยตามเมาส์ — หน้าตาเหมือนหน้าจัดแผงของแอดมิน แต่โชว์เฉพาะข้อมูลที่ลูกค้า/ผู้ขายดูได้
// (ชื่อร้าน/ประเภท/ขายอะไร/รูป; วันหมดสัญญาเฉพาะเจ้าของล็อก+แอดมิน) ไม่มีชื่อผู้จอง/เบอร์โทร/ราคา
// ==========================================
const stallTooltip = document.getElementById('stallTooltip');

function setTt(id, text) {
    const el = document.getElementById(id);
    const box = el.closest('.tt-group');
    el.textContent = text || '';
    if (box) box.style.display = text ? '' : 'none';
}

function showStallTooltip(e, code, stall) {
    const img = document.getElementById('tt-image');
    const bk = BOOKING_BY_STALL[code];
    const mine = MY_STALLS.has(code);
    stallTooltip.className = 'stall-tooltip';
    document.getElementById('tt-stall-id').textContent = code + (mine ? ' · ล็อกของคุณ' : '');
    img.hidden = true;
    img.removeAttribute('src');

    let hint = '';
    if (stall.status === 'BOOKED') {
        stallTooltip.classList.add('tt-booked');
        if (bk && bk.image) { img.src = bk.image; img.hidden = false; }
        setTt('tt-shop', bk ? bk.shop : 'มีร้านค้าแล้ว');
        setTt('tt-product', bk ? (categoryOf(code) || {}).label : '');
        setTt('tt-detail', bk && bk.productDetail && bk.productDetail !== '-' ? bk.productDetail : '');
        hint = 'คลิกเพื่อดูรายละเอียด';
    } else if (stall.status === 'MAINTENANCE') {
        stallTooltip.classList.add('tt-maint');
        setTt('tt-shop', 'อยู่ระหว่างซ่อมบำรุง');
        setTt('tt-product', '');
        setTt('tt-detail', 'ยังจองไม่ได้ในตอนนี้');
    } else {
        stallTooltip.classList.add('tt-vacant');
        setTt('tt-shop', 'ว่าง พร้อมให้จอง');
        setTt('tt-product', '');
        setTt('tt-detail', '');
        hint = 'คลิกเพื่อดูรายละเอียด';
    }

    const showExpiry = (mine || IS_ADMIN || IS_STAFF) && stall.status === 'BOOKED' && stall.bookingEndDate;
    if (showExpiry) {
        const left = daysLeftUntil(stall.bookingEndDate);
        setTt('tt-expiry', `${formatThaiDate(stall.bookingEndDate)}${left === null ? '' : left < 0 ? ' (หมดสัญญาแล้ว)' : ` (เหลือ ${left} วัน)`}`);
    } else {
        setTt('tt-expiry', '');
    }
    document.getElementById('tt-hint').textContent = hint;

    stallTooltip.style.display = 'block';
    moveStallTooltip(e);
}

function moveStallTooltip(e) {
    const w = stallTooltip.offsetWidth;
    const h = stallTooltip.offsetHeight;
    let x = e.clientX + 20;
    let y = e.clientY - h / 2;
    if (x + w > window.innerWidth) x = e.clientX - w - 20;
    if (x < 4) x = 4;
    if (y < 4) y = 4;
    if (y + h > window.innerHeight) y = window.innerHeight - h - 4;
    stallTooltip.style.left = `${x}px`;
    stallTooltip.style.top = `${y}px`;
}

function hideStallTooltip() {
    stallTooltip.style.display = 'none';
}

function bindStallTooltip(cell, code, stall) {
    if (!window.matchMedia('(hover: hover)').matches) return;
    cell.addEventListener('mouseenter', (e) => showStallTooltip(e, code, stall));
    cell.addEventListener('mousemove', moveStallTooltip);
    cell.addEventListener('mouseleave', hideStallTooltip);
    cell.addEventListener('click', hideStallTooltip);
}

let activeZone = null;
let currentQuery = '';
let currentStatusFilter = null; // 'EMPTY' | 'BOOKED' | null
let currentCategoryFilter = null; // key ใน CATEGORIES | 'OTHER' | null

function stallMatchesFilter(id, stall) {
    if (currentCategoryFilter) {
        const cat = categoryOf(id);
        return !!cat && cat.key === currentCategoryFilter;
    }
    if (currentStatusFilter) {
        if (currentStatusFilter === 'EMPTY') {
            return stall.status !== 'BOOKED' && stall.status !== 'MAINTENANCE';
        }
        return stall.status === currentStatusFilter;
    }
    if (currentQuery) {
        const d = BOOKING_BY_STALL[id];
        if (!d) return false;
        return (d.shop + d.product + d.productDetail).toLowerCase().includes(currentQuery.toLowerCase());
    }
    return false;
}

// การ์ดสลับโซนด้านข้างใน drawer (กดแล้วเปิดโซนนั้นทันที) แสดงจำนวนล็อกว่าง/ทั้งหมดของแต่ละโซน
function zoneStallCounts(code) {
    let total = 0;
    let free = 0;
    ((ZONES_DATA[code] && ZONES_DATA[code].columns) || []).forEach((column) => {
        column.stalls.forEach((stall) => {
            if (stall.status === 'PLACEHOLDER') return;
            total += 1;
            if (stall.status !== 'BOOKED' && stall.status !== 'MAINTENANCE') free += 1;
        });
    });
    return { total, free };
}

function renderZoneCards(z) {
    const box = document.getElementById('zoneCards');
    if (!box) return;
    if (!box.dataset.built) {
        box.dataset.built = '1';
        Object.keys(ZONES_DATA).sort().forEach((code) => {
            const { total, free } = zoneStallCounts(code);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'zone-card';
            btn.dataset.zone = code;
            btn.style.setProperty('--zc-bg', `var(--zone-${code}-bg, #eee)`);
            btn.style.setProperty('--zc-cl', `var(--zone-${code}-cl, #333)`);

            const title = document.createElement('span');
            title.className = 'zc-title';
            title.textContent = `โซน ${code}`;
            const desc = document.createElement('span');
            desc.className = 'zc-desc';
            desc.textContent = ZONES_DATA[code].description || '';
            const stat = document.createElement('span');
            stat.className = 'zc-stat';
            stat.innerHTML = `ว่าง <b>${free}</b> / ${total}`;

            btn.append(title, desc, stat);
            if (IS_SELLER) {
                const mine = (VIEWER.myStalls || []).filter((c) => ((ZONES_DATA[code].columns || []).some((col) => col.stalls.some((st) => st.code === c)))).length;
                const badge = document.createElement('span');
                const allowed = (VIEWER.allowedZones || []).includes(code);
                badge.className = `zc-badge ${allowed ? 'zc-ok' : 'zc-no'}`;
                badge.textContent = mine ? `ล็อกของคุณ ${mine}` : (allowed ? 'จองได้' : 'ไม่ตรงประเภท');
                btn.appendChild(badge);
            }
            btn.addEventListener('click', () => openZone(code));
            box.appendChild(btn);
        });
    }
    box.querySelectorAll('.zone-card').forEach((el) => {
        const on = el.dataset.zone === z;
        el.classList.toggle('active', on);
        el.setAttribute('aria-current', on ? 'true' : 'false');
    });
}

function openZone(z) {
    if (!ZONES_DATA[z]) return;

    activeZone = z;
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
    renderZoneCards(z);
    document.getElementById('drawer').classList.add('open');
    document.getElementById('backdrop').classList.add('show');
}

function closeZone() {
    activeZone = null;
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

        const bk = BOOKING_BY_STALL[pos.code];
        if (MY_STALLS.has(pos.code)) cell.classList.add('mine');
        if (IS_ADMIN || IS_STAFF || MY_STALLS.has(pos.code)) {
            if (stall.expiryState === 'expired') cell.classList.add('expired');
            else if (stall.expiryState === 'critical') cell.classList.add('expiry-critical');
            else if (stall.expiryState === 'near') cell.classList.add('expiry-near');
        }
        if (stall.status === 'BOOKED') {
            booked += 1;
            cell.classList.add('booked');
            applyCategoryColor(cell, pos.code);
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                showInfo(pos.code);
            });
        } else if (stall.status === 'MAINTENANCE') {
            maintenance += 1;
            cell.classList.add('maintenance');
        } else {
            cell.classList.add('vacant-clickable');
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                showVacantInfo(pos.code, z);
            });
        }

        if ((currentQuery || currentStatusFilter || currentCategoryFilter) && stallMatchesFilter(pos.code, stall)) cell.classList.add('s-match');
        else if (currentCategoryFilter) cell.classList.add('dimmed');
        bindStallTooltip(cell, pos.code, stall);
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

        column.stalls.forEach((stall) => {
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
            if (isHorizontalZone) cell.classList.add('tt-below');

            const bk = BOOKING_BY_STALL[id];

            if (MY_STALLS.has(id)) cell.classList.add('mine');
            if (IS_ADMIN || IS_STAFF || MY_STALLS.has(id)) {
                if (stall.expiryState === 'expired') cell.classList.add('expired');
                else if (stall.expiryState === 'critical') cell.classList.add('expiry-critical');
                else if (stall.expiryState === 'near') cell.classList.add('expiry-near');
            }

            if (stall.status === 'BOOKED') {
                booked += 1;
                cell.classList.add('booked');
                applyCategoryColor(cell, id);
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showInfo(id);
                });
            } else if (stall.status === 'MAINTENANCE') {
                maintenance += 1;
                cell.classList.add('maintenance');
            } else {
                cell.classList.add('vacant-clickable');
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showVacantInfo(id, z);
                });
            }

            if ((currentQuery || currentStatusFilter || currentCategoryFilter) && stallMatchesFilter(id, stall)) cell.classList.add('s-match');
            else if (currentCategoryFilter) cell.classList.add('dimmed');
            bindStallTooltip(cell, id, stall);
            (isPaired(stall) ? getSmallWrap(stall.groupId) : col).appendChild(cell);
        });

        wrap.appendChild(col);
        grid.appendChild(wrap);
    });

    document.getElementById('drawerStats').innerHTML = `ทั้งหมด <b>${total}</b> ล็อก &nbsp;·&nbsp; จอง <b>${booked}</b> &nbsp;·&nbsp; ซ่อมบำรุง <b>${maintenance}</b> &nbsp;·&nbsp; ว่าง <b>${total - booked - maintenance}</b>`;
}

function showVacantInfo(id, zone) {
    document.getElementById('ic-head').textContent = `แผง ${id} — ว่าง`;
    document.getElementById('ic-image').classList.add('d-none');
    document.querySelector('#infoCard .ic-grid').classList.add('d-none');
    renderRoleActions(id, zone, true);
    document.getElementById('infoCard').classList.add('show');
    document.getElementById('infoCardBackdrop').classList.add('show');
}

function showInfo(id) {
    const d = BOOKING_BY_STALL[id];
    if (!d) return;
    document.querySelector('#infoCard .ic-grid').classList.remove('d-none');
    renderRoleActions(id, (findStall(id) && zoneOf(id)) || '', false);

    document.getElementById('ic-head').textContent = `แผง ${id} — ${d.shop}`;
    document.getElementById('ic-shop').textContent = d.shop;
    document.getElementById('ic-product').textContent = (categoryOf(id) || {}).label || d.product;
    document.getElementById('ic-detail').textContent = d.productDetail || '-';

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

const STATUS_LABELS = { EMPTY: 'แผงว่าง', BOOKED: 'แผงที่มีร้านค้าแล้ว' };

function refreshFilterResults() {
    const badge = document.getElementById('resultBadge');
    const clrBtn = document.getElementById('clearBtn');

    if (!currentQuery && !currentStatusFilter && !currentCategoryFilter) {
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

    const catLabel = currentCategoryFilter
        ? ([...CATEGORIES, OTHER_CATEGORY].find((c) => c.key === currentCategoryFilter) || {}).label
        : null;
    badge.textContent = catLabel
        ? `พบ ${total} ร้าน (หมวด${catLabel})`
        : currentStatusFilter
            ? `พบ ${total} แผง (${STATUS_LABELS[currentStatusFilter]})`
            : `พบ ${total} ร้าน`;
    badge.classList.add('show');
    if (activeZone) renderGrid(activeZone);
}

function doSearch(q) {
    currentQuery = q.trim();
    currentStatusFilter = null;
    currentCategoryFilter = null;
    document.querySelectorAll('.qtag, .cat-chip').forEach((t) => t.classList.remove('active'));
    refreshFilterResults();
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    currentStatusFilter = null;
    currentCategoryFilter = null;
    document.querySelectorAll('.qtag, .cat-chip').forEach((t) => t.classList.remove('active'));
    doSearch('');
}

function quickStatusFilter(btn, status) {
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.qtag, .cat-chip').forEach((t) => t.classList.remove('active'));
    currentQuery = '';
    currentCategoryFilter = null;

    if (currentStatusFilter === status) {
        currentStatusFilter = null;
        refreshFilterResults();
        return;
    }

    currentStatusFilter = status;
    btn.classList.add('active');
    refreshFilterResults();
}

function findZoneForStall(code) {
    for (const z of Object.keys(ZONES_DATA)) {
        const columns = ZONES_DATA[z].columns || [];
        if (columns.some((column) => (column.stalls || []).some((s) => s.code === code))) {
            return z;
        }
    }
    return null;
}

// เปิดจากลิงก์ deep link (เช่น จากหน้าคอมมูนิตี้ที่คลิกเลขล็อกของร้าน) — ?stall=A101
// เปิดโซนที่ล็อกนั้นอยู่ให้อัตโนมัติ, เลื่อนจอไปหา, ไฮไลต์ และเปิดการ์ดข้อมูลร้านถ้าล็อกนั้นมีร้านจองอยู่
function openStallDeepLink(code, showCard = true) {
    const zone = findZoneForStall(code);
    if (!zone) return;

    openZone(zone);

    requestAnimationFrame(() => {
        const cell = document.querySelector(`.stall-cell[data-stall="${code}"]`);
        if (!cell) return;

        cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        cell.classList.add('deeplink-target');
        setTimeout(() => cell.classList.remove('deeplink-target'), 3000);

        if (showCard && cell.classList.contains('booked')) {
            showInfo(code);
        }
    });
}

// สคริปต์นี้โหลดแบบไม่มี defer อยู่ท้าย body จึง DOM พร้อมใช้งานแล้ว ไม่ต้องรอ DOMContentLoaded
const stallParam = new URLSearchParams(window.location.search).get('stall');
if (stallParam) {
    openStallDeepLink(stallParam.trim().toUpperCase());
}

// ==========================================
// แถบหมวดสินค้า (สี+กรอง), ปุ่มไปล็อกของฉัน (ผู้ขาย), ปุ่มสุ่มร้านอาหาร
// ==========================================
function toggleCategoryFilter(key, chip) {
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.qtag, .cat-chip').forEach((t) => t.classList.remove('active'));
    currentQuery = '';
    currentStatusFilter = null;

    if (currentCategoryFilter === key) {
        currentCategoryFilter = null;
    } else {
        currentCategoryFilter = key;
        chip.classList.add('active');
    }
    refreshFilterResults();
}

function buildCategoryBar() {
    const box = document.getElementById('catChips');
    if (!box) return;
    const counts = {};
    Object.keys(BOOKING_BY_STALL).forEach((code) => {
        const cat = categoryOf(code);
        if (cat) counts[cat.key] = (counts[cat.key] || 0) + 1;
    });
    [...CATEGORIES, OTHER_CATEGORY].filter((c) => counts[c.key]).forEach((cat) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'cat-chip';
        chip.style.setProperty('--cat', cat.color);
        chip.innerHTML = `<i class="cat-dot"></i>${cat.label} <small>${counts[cat.key]}</small>`;
        chip.addEventListener('click', () => toggleCategoryFilter(cat.key, chip));
        box.appendChild(chip);
    });
}

let myStallIndex = 0;
function goToMyStall() {
    const list = [...MY_STALLS].filter((c) => findZoneForStall(c));
    if (!list.length) return;
    openStallDeepLink(list[myStallIndex % list.length], false);
    myStallIndex += 1;
}

let lastRandomStall = null;
function randomFoodShop() {
    const foods = Object.keys(BOOKING_BY_STALL).filter((code) => {
        const cat = categoryOf(code);
        return cat && cat.key === 'FOOD' && findZoneForStall(code);
    });
    if (!foods.length) return;
    let pick = foods[Math.floor(Math.random() * foods.length)];
    if (foods.length > 1 && pick === lastRandomStall) {
        pick = foods[(foods.indexOf(pick) + 1) % foods.length];
    }
    lastRandomStall = pick;
    hideInfo();
    openStallDeepLink(pick, true);
}

buildCategoryBar();
(function setupActions() {
    const mine = document.getElementById('btnMyStall');
    if (mine) {
        if (IS_SELLER && MY_STALLS.size) mine.classList.remove('d-none');
        mine.addEventListener('click', goToMyStall);
    }
    const rnd = document.getElementById('btnRandomFood');
    if (rnd) rnd.addEventListener('click', randomFoodShop);
})();

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
