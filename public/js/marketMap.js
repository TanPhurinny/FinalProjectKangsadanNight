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
// เฉพาะแอดมิน/staff ที่เห็นสถานะ "ว่าง" ของล็อก — role อื่นเห็นล็อกว่างเป็นช่องเปล่าในผัง กด/ชี้ไม่ได้ และไม่มีตัวเลขล็อกว่าง
const CAN_SEE_VACANCY = IS_ADMIN || IS_STAFF;

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
                BOOKING_BY_STALL[stall.code] = { shop, product, productDetail, tags: productDetail.split(' ').join(','), image: null, closedAt: n % 7 === 0 ? new Date(Date.now() - n * 60000).toISOString() : null, promo: n % 5 === 0 ? 'ซื้อ 2 แถม 1 ถึง 3 ทุ่ม' : null };
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

// ==========================================
// ชั้นข้อมูล (layer) — สลับว่าสีบนล็อกที่มีร้านแล้วบอกเรื่องอะไร
// แต่ละชั้น: label/icon, paint(cell, code) ระบายสีล็อก, legend() คำอธิบายสี, zoneStat(code) สรุปในการ์ดโซน,
// summary() แถบสรุปเหนือผัง — เพิ่มชั้นใหม่ได้โดยเพิ่ม entry ใน LAYERS ไม่ต้องแก้โค้ดวาดผัง
// ข้อมูลภายในของแต่ละชั้น server ส่งมาเฉพาะ role ที่เห็นได้ (ดู getMarketMapPage) ชั้นไหนไม่มีข้อมูลจะไม่โชว์ปุ่ม
// ==========================================
const INSPECTION = readJsonScript('inspectionLayerJson') || null;
const HAS_INSPECTION = !!(INSPECTION && INSPECTION.byCode);

// โหมดทดลอง ?demo=1 — สุ่มผลตรวจให้ล็อกที่มีร้าน (รวมร้านจำลอง) ที่ยังไม่มีข้อมูลจริง ไว้ดูสีของชั้นผลตรวจ
if (HAS_INSPECTION && new URLSearchParams(window.location.search).get('demo') === '1') {
    const DEMO_RESULTS = [
        { status: 'ok' },
        { status: 'ok' },
        { status: 'pending' },
        { status: 'issue', issue: { noShow: true } },
        { status: 'ok' },
        { status: 'issue', excess: { small: 2, large: 0 } },
        { status: 'pending' }
    ];
    let n = 0;
    Object.keys(ZONES_DATA).forEach((z) => (ZONES_DATA[z].columns || []).forEach((column) => column.stalls.forEach((stall) => {
        if (stall.status !== 'BOOKED' || INSPECTION.byCode[stall.code]) return;
        const demo = DEMO_RESULTS[n % DEMO_RESULTS.length];
        INSPECTION.byCode[stall.code] = {
            stallId: null, // demo บันทึกจริงไม่ได้
            status: demo.status,
            cleanlinessPassed: null,
            checkedAt: null,
            issue: Object.assign({ noShow: false, sublease: false, otherMarket: false, wrongSeller: false, otherIssueNote: '' }, demo.issue),
            excess: Object.assign({ small: 0, large: 0 }, demo.excess)
        };
        n += 1;
    })));
}

const INSPECTION_STATUS = {
    ok: { label: 'ตรวจแล้ว ปกติ', short: 'ปกติ', color: '#2e9e5b' },
    issue: { label: 'มีปัญหา', short: 'มีปัญหา', color: '#c0392b' },
    pending: { label: 'ยังไม่ตรวจ', short: 'ยังไม่ตรวจ', color: '#ffe08a' },
    na: { label: 'ยังไม่ชำระเงิน (ไม่ต้องตรวจ)', short: 'ไม่ต้องตรวจ', color: '#fff' }
};

// รายการปัญหาที่อ่านง่าย จากบันทึกล่าสุดของวันนี้ — ใช้ทั้งตอนโหลดหน้าและหลังบันทึกด่วนจากผัง
function inspectionProblems(r) {
    if (!r) return [];
    const issue = r.issue || {};
    const excess = r.excess || {};
    const problems = [];
    if (issue.noShow) problems.push('ไม่มาขาย');
    if (issue.sublease) problems.push('ปล่อยเช่าช่วง');
    if (issue.otherMarket) problems.push('ไปขายตลาดอื่น');
    if (issue.wrongSeller) problems.push('คนขายไม่ตรงชื่อ');
    if (issue.otherIssueNote && issue.otherIssueNote.trim()) problems.push(issue.otherIssueNote.trim());
    if (excess.small > 0 || excess.large > 0) problems.push(`ไฟเกิน (เล็ก ${excess.small} / ใหญ่ ${excess.large})`);
    if (r.cleanlinessPassed === false) problems.push('ความสะอาดไม่ผ่าน');
    return problems;
}

function inspectionOf(code) {
    return (HAS_INSPECTION && INSPECTION.byCode[code]) || null;
}

function inspectionStatusOf(code) {
    const r = inspectionOf(code);
    return r ? r.status : 'na';
}

function shopTagsOf(d) {
    return [...new Set(String((d && d.tags) || '').split(',').map((t) => t.trim()).filter(Boolean))];
}

function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// นับผลตรวจเฉพาะล็อกที่ผังแสดงว่ามีร้าน (status BOOKED) — ล็อกที่จ่ายเงินแล้วแต่ Stall ถูกปล่อยเป็นว่าง
// (เช่น โดนตัดสิทธิ์เพราะไม่ต่อสัญญา) จะไม่มีสีบนผัง ถ้านับรวมตัวเลขจะไม่ตรงกับที่เห็น
function inspectionCounts(stalls) {
    const counts = { total: 0, checked: 0, issue: 0, pending: 0 };
    stalls.forEach((s) => {
        const r = s.status === 'BOOKED' && inspectionOf(s.code);
        if (!r) return;
        counts.total += 1;
        if (r.status === 'pending') counts.pending += 1;
        else counts.checked += 1;
        if (r.status === 'issue') counts.issue += 1;
    });
    return counts;
}

function allStalls() {
    return Object.keys(ZONES_DATA).flatMap((code) => stallsOfZone(code));
}

function stallsOfZone(code) {
    const list = [];
    ((ZONES_DATA[code] && ZONES_DATA[code].columns) || []).forEach((column) => column.stalls.forEach((stall) => {
        if (stall.status !== 'PLACEHOLDER') list.push(stall);
    }));
    return list;
}

function legendItem(color, label, extraStyle = '') {
    return `<div class="leg"><div class="leg-box" style="background:${color};${extraStyle}"></div>${label}</div>`;
}

const LAYERS = {
    category: {
        label: 'หมวดสินค้า',
        icon: 'fa-tags',
        available: true,
        paint: applyCategoryColor,
        legend: () => '',
        zoneStat(code) {
            const stalls = stallsOfZone(code);
            const free = stalls.filter((s) => s.status !== 'BOOKED' && s.status !== 'MAINTENANCE').length;
            return `ว่าง <b>${free}</b> / ${stalls.length}`;
        },
        summary: () => ''
    },
    inspection: {
        label: 'ผลตรวจวันนี้',
        icon: 'fa-clipboard-check',
        available: HAS_INSPECTION,
        hidesBookedLegend: true,
        paint(cell, code) {
            const status = inspectionStatusOf(code);
            cell.classList.add('insp', `insp-${status}`);
        },
        legend() {
            return legendItem(INSPECTION_STATUS.ok.color, INSPECTION_STATUS.ok.label)
                + legendItem(INSPECTION_STATUS.issue.color, `${INSPECTION_STATUS.issue.label} (!)`)
                + legendItem(INSPECTION_STATUS.pending.color, INSPECTION_STATUS.pending.label)
                + legendItem('repeating-linear-gradient(45deg,#fff 0 3px,#cfd8db 3px 5px)', INSPECTION_STATUS.na.label);
        },
        zoneStat(code) {
            const { total, checked, issue } = inspectionCounts(stallsOfZone(code));
            if (!total) return 'ไม่มีร้านต้องตรวจ';
            return `ตรวจ <b>${checked}</b> / ${total}${issue ? ` <span class="zc-issue">! ${issue}</span>` : ''}`;
        },
        summary() {
            const { total, checked, issue, pending } = inspectionCounts(allStalls());
            const pct = total ? Math.round((checked / total) * 100) : 0;
            return `
                <span class="ls-date">${escapeHtml(INSPECTION.dateLabel || '')}</span>
                <span class="ls-progress" title="ตรวจแล้ว ${checked} จาก ${total} ร้าน">
                    ตรวจแล้ว <b>${checked}</b>/${total}
                    <span class="ls-bar"><span style="width:${pct}%"></span></span>
                </span>
                <button type="button" class="qtag lf-btn lf-issue" data-layer-filter="INSP_ISSUE">! มีปัญหา <b>${issue}</b></button>
                <button type="button" class="qtag lf-btn lf-pending" data-layer-filter="INSP_PENDING">ยังไม่ตรวจ <b>${pending}</b></button>
                <button type="button" class="qtag lf-btn lf-notopen" data-layer-filter="INSP_CLOSED" title="ร้านที่ผู้ขายกดปิดร้านวันนี้ ไม่ต้องเดินไปตรวจ">แจ้งปิดร้าน <b>${allStalls().filter((st) => st.status === 'BOOKED' && isClosedToday(st.code)).length}</b></button>
                ${IS_STAFF ? `<button type="button" class="qtag lf-btn lf-walk${walkMode ? ' active' : ''}" data-action="walk"><i class="fa-solid fa-person-walking"></i> ${walkMode ? 'กำลังเดินตรวจ' : 'เริ่มเดินตรวจ'}</button>` : ''}`;
        }
    }
};

const EXPIRY_STATUS = {
    expired: { label: 'หมดสิทธิ์แล้ว', color: '#c0392b' },
    critical: { label: 'เหลือ ≤ 1 วัน', color: '#e67e22' },
    near: { label: 'ใกล้หมดสัญญา', color: '#e2b83a' },
    ok: { label: 'สัญญายังไม่ใกล้หมด', color: '#8a9aa0' },
    none: { label: 'ไม่มีวันหมดสัญญาในระบบ', color: '#fff' }
};

function expiryKeyOf(stall) {
    if (!stall) return 'none';
    if (stall.expiryState) return stall.expiryState;
    return stall.bookingEndDate ? 'ok' : 'none';
}

function expiryCounts(stalls) {
    const counts = { expired: 0, critical: 0, near: 0 };
    stalls.forEach((s) => {
        if (s.status !== 'BOOKED') return;
        const key = expiryKeyOf(s);
        if (counts[key] !== undefined) counts[key] += 1;
    });
    return counts;
}

LAYERS.expiry = {
    label: 'หมดสัญญา',
    icon: 'fa-hourglass-half',
    // วันหมดสัญญาของทุกล็อก server ส่งให้เฉพาะแอดมิน/staff (role อื่นเห็นแค่ล็อกตัวเอง)
    available: CAN_SEE_VACANCY,
    hidesBookedLegend: true,
    paint(cell, code) {
        const stall = findStall(code);
        cell.classList.add('exp', `exp-${expiryKeyOf(stall)}`);
        if (willFreeWithin(stall, expiryAheadDays)) cell.classList.add('exp-will-free');
    },
    legend() {
        return ['expired', 'critical', 'near', 'ok'].map((key) => legendItem(EXPIRY_STATUS[key].color, EXPIRY_STATUS[key].label)).join('')
            + legendItem('repeating-linear-gradient(45deg,#fff 0 3px,#cfd8db 3px 5px)', EXPIRY_STATUS.none.label);
    },
    zoneStat(code) {
        const { expired, critical, near } = expiryCounts(stallsOfZone(code));
        if (!expired && !critical && !near) return 'ไม่มีล็อกใกล้หมด';
        return `ใกล้หมด <b>${critical + near}</b>${expired ? ` <span class="zc-issue">หมดแล้ว ${expired}</span>` : ''}`;
    },
    summary() {
        const { expired, critical, near } = expiryCounts(allStalls());
        const link = IS_ADMIN ? '<a class="ls-link" href="/admin/slots/expiring">ดูรายการทั้งหมด <i class="fa-solid fa-arrow-right fa-xs"></i></a>' : '';
        const bulk = IS_ADMIN ? `<button type="button" class="qtag lf-btn lf-select${bulkMode ? ' active' : ''}" data-action="bulk"><i class="fa-regular fa-square-check"></i> เลือกหลายล็อก</button>` : '';
        return `
            <button type="button" class="qtag lf-btn lf-issue" data-layer-filter="EXP_LAPSED">หมดสิทธิ์แล้ว <b>${expired}</b></button>
            <button type="button" class="qtag lf-btn lf-warn" data-layer-filter="EXP_SOON">ใกล้หมดสัญญา <b>${critical + near}</b></button>
            <label class="ls-ahead" title="ดูล่วงหน้าว่าภายในกี่วันจะมีล็อกว่างเพิ่ม (นับล็อกที่สัญญาหมดก่อนวันนั้น)">
                <span>ดูล่วงหน้า</span>
                <input type="range" min="0" max="30" step="1" value="${expiryAheadDays}" data-action="ahead" aria-label="ดูล่วงหน้ากี่วัน">
                <b data-ahead-text>${aheadSummaryText()}</b>
            </label>
            ${bulk}
            ${link}`;
    }
};

// ==========================================
// ชั้นงานซ่อม (แอดมิน/staff) — คำร้องที่ยังไม่ปิด ปักหมุดตามรหัสล็อกในช่องตำแหน่ง
// ==========================================
const REPAIRS = readJsonScript('repairLayerJson') || null;
const HAS_REPAIRS = !!(REPAIRS && REPAIRS.byCode);
const REPAIR_STATUS = {
    PENDING: { label: 'รอตรวจสอบ', color: '#e2b83a' },
    APPROVED: { label: 'อนุมัติแล้ว รอซ่อม', color: '#2c7be5' },
    IN_PROGRESS: { label: 'กำลังซ่อม', color: '#e67e22' }
};
function repairsOf(code) {
    return (HAS_REPAIRS && REPAIRS.byCode[code]) || [];
}
// สถานะที่ "ด่วนสุด" ของล็อก: รอตรวจสอบ > อนุมัติแล้ว > กำลังซ่อม (ใหม่สุดที่ยังไม่มีคนรับ ขึ้นก่อน)
function repairStatusOf(code) {
    const list = repairsOf(code);
    if (!list.length) return null;
    return ['PENDING', 'APPROVED', 'IN_PROGRESS'].find((st) => list.some((r) => r.status === st));
}

LAYERS.repair = {
    label: 'งานซ่อม',
    icon: 'fa-screwdriver-wrench',
    available: HAS_REPAIRS,
    hidesBookedLegend: true,
    paint(cell) { cell.classList.add('rep-base'); },
    // หมุดงานซ่อมขึ้นได้ทั้งล็อกที่มีร้านและล็อกว่าง
    paintAll(cell, code) {
        const st = repairStatusOf(code);
        if (!st) return;
        cell.classList.add('rep', `rep-${st.toLowerCase()}`);
        cell.insertAdjacentHTML('beforeend', `<i class="cell-mark cell-mark-repair fa-solid fa-wrench" aria-hidden="true"></i>${repairsOf(code).length > 1 ? `<span class="cell-mark cell-mark-count">${repairsOf(code).length}</span>` : ''}`);
    },
    legend() {
        return Object.keys(REPAIR_STATUS).map((k) => legendItem(REPAIR_STATUS[k].color, REPAIR_STATUS[k].label)).join('')
            + legendItem('#eef1f2', 'ไม่มีงานซ่อมค้าง');
    },
    zoneStat(code) {
        const n = stallsOfZone(code).filter((s) => repairStatusOf(s.code)).length;
        return n ? `งานซ่อมค้าง <span class="zc-issue">${n} ล็อก</span>` : 'ไม่มีงานซ่อมค้าง';
    },
    summary() {
        const counts = { PENDING: 0, APPROVED: 0, IN_PROGRESS: 0 };
        Object.values(REPAIRS.byCode).forEach((list) => list.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; }));
        const unpinned = REPAIRS.unpinned ? `<span class="ls-note">อีก ${REPAIRS.unpinned} คำร้องไม่ได้ระบุรหัสล็อก</span>` : '';
        return `
            <button type="button" class="qtag lf-btn lf-warn" data-layer-filter="REP_ANY">ล็อกที่มีงานค้าง <b>${Object.keys(REPAIRS.byCode).length}</b></button>
            <span class="ls-note">รอตรวจสอบ <b>${counts.PENDING}</b> · รอซ่อม <b>${counts.APPROVED}</b> · กำลังซ่อม <b>${counts.IN_PROGRESS}</b></span>
            ${unpinned}
            <a class="ls-link" href="/admin/requests">จัดการคำร้อง <i class="fa-solid fa-arrow-right fa-xs"></i></a>`;
    }
};

// ทาสีเพิ่มเติมให้ทุกล็อก (รวมล็อกว่าง) ตามชั้นที่เลือก + สถานะเลือกหลายล็อก
function decorateAnyCell(cell, code) {
    const layer = LAYERS[currentLayer];
    if (layer.paintAll) layer.paintAll(cell, code);
    if (bulkSelection.has(code)) cell.classList.add('bulk-selected');
    if (walkMode && walkCurrent === code) cell.classList.add('walk-current');
}

// ==========================================
// แอดมิน: ดูล่วงหน้า (แถบเลื่อนวัน) — ล็อกที่สัญญาหมดภายใน N วันจะว่างเพิ่ม
// ==========================================
let expiryAheadDays = 0;
function willFreeWithin(stall, days) {
    if (!days || !stall || stall.status !== 'BOOKED' || !stall.bookingEndDate) return false;
    const left = daysLeftUntil(stall.bookingEndDate);
    return left !== null && left <= days;
}
function aheadSummaryText() {
    if (!expiryAheadDays) return 'วันนี้';
    const n = allStalls().filter((s) => willFreeWithin(s, expiryAheadDays)).length;
    return `${expiryAheadDays} วัน · จะว่าง ${n} ล็อก`;
}

// ==========================================
// แอดมิน: เลือกหลายล็อกบนผัง แล้วแจ้งเตือนหมดอายุ/ปล่อยล็อกพร้อมกัน (ใช้ endpoint เดิมของหน้าจัดแผง)
// แตะล็อกเพื่อเลือก — ใช้ได้ทั้งมือถือ (ไม่ต้องกด Shift/ลาก)
// ==========================================
let bulkMode = false;
const bulkSelection = new Set();

function setBulkMode(on) {
    if (bulkMode === on) return;
    bulkMode = on;
    if (!on) bulkSelection.clear();
    document.body.classList.toggle('bulk-on', on);
    renderBulkBar();
    if (activeZone) renderGrid(activeZone);
    const btn = document.querySelector('#layerSummary [data-action="bulk"]');
    if (btn) btn.classList.toggle('active', on);
}

function toggleBulkStall(code) {
    if (bulkSelection.has(code)) bulkSelection.delete(code);
    else bulkSelection.add(code);
    const cell = document.querySelector(`.stall-cell[data-stall="${code}"]`);
    if (cell) cell.classList.toggle('bulk-selected', bulkSelection.has(code));
    renderBulkBar();
}

// ความสูงจริงของแถบล่างจอ — การ์ดร้าน/ลิ้นชัก/ปุ่มซูมใช้หลบไม่ให้ถูกบัง (แถบสูงไม่เท่ากันตามจอ)
function syncDockHeight() {
    const dock = [...document.querySelectorAll('.action-dock')].find((el) => !el.hidden);
    document.body.style.setProperty('--dock-h', dock ? `${dock.offsetHeight}px` : '0px');
}
window.addEventListener('resize', syncDockHeight);

function renderBulkBar() {
    let bar = document.getElementById('bulkBar');
    if (!bulkMode) { if (bar) bar.hidden = true; syncDockHeight(); return; }
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'bulkBar';
        bar.className = 'action-dock';
        document.body.appendChild(bar);
    }
    const n = bulkSelection.size;
    const lapsed = [...bulkSelection].filter((c) => (findStall(c) || {}).expiryState === 'expired').length;
    bar.hidden = false;
    bar.innerHTML = `
        <div class="ad-info"><span class="ad-line"><b>${n}</b> ล็อกที่เลือก</span> <small>แตะล็อกบนผังเพื่อเลือก/ยกเลิก</small></div>
        <div class="ad-actions">
            <button type="button" class="ad-btn" data-bulk="notify" ${n ? '' : 'disabled'}><i class="fa-regular fa-bell"></i> แจ้งเตือนหมดอายุ</button>
            <button type="button" class="ad-btn ad-danger" data-bulk="release" ${lapsed ? '' : 'disabled'} title="ปล่อยได้เฉพาะล็อกที่หมดสิทธิ์แล้ว"><i class="fa-solid fa-lock-open"></i> ปล่อยล็อก (${lapsed})</button>
            <button type="button" class="ad-btn ad-ghost" data-bulk="cancel">เสร็จ</button>
        </div>`;
    bar.querySelector('[data-bulk="cancel"]').onclick = () => setBulkMode(false);
    bar.querySelector('[data-bulk="notify"]').onclick = () => confirmBulk('notify');
    bar.querySelector('[data-bulk="release"]').onclick = () => confirmBulk('release');
    syncDockHeight();
}

function confirmBulk(action) {
    const codes = [...bulkSelection].filter((c) => action !== 'release' || (findStall(c) || {}).expiryState === 'expired');
    if (!codes.length) return;
    const isRelease = action === 'release';
    window.showConfirmDialog({
        title: isRelease ? `ปล่อย ${codes.length} ล็อกให้ว่าง?` : `แจ้งเตือนหมดอายุ ${codes.length} ล็อก?`,
        message: isRelease
            ? `${codes.join(', ')} จะกลับเป็นว่างให้คนอื่นจองได้ เช็คหน้างานก่อนว่าร้านออกจากพื้นที่แล้วจริง`
            : `ส่งแจ้งเตือนในระบบ + อีเมลให้ผู้เช่า ${codes.join(', ')}`,
        tone: isRelease ? 'danger' : 'warning',
        confirmText: isRelease ? 'ปล่อยล็อก' : 'ส่งแจ้งเตือน',
        onConfirm: () => runBulk(action, codes)
    });
}

async function runBulk(action, codes) {
    const path = action === 'release' ? '/admin/slots/release-stall' : '/admin/slots/notify-expiring';
    const results = { ok: [], fail: [] };
    const bar = document.getElementById('bulkBar');
    for (let i = 0; i < codes.length; i += 1) {
        if (bar) bar.querySelector('.ad-info').innerHTML = `กำลังทำรายการ <b>${i + 1}/${codes.length}</b>`;
        try {
            // endpoint เดิมตอบเป็น redirect พร้อม ?success= / ?error= — อ่านผลจาก URL ปลายทาง
            const response = await fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ stallCode: codes[i], returnTo: '/admin/slots' })
            });
            const params = new URL(response.url).searchParams;
            if (response.ok && params.get('success')) results.ok.push(codes[i]);
            else results.fail.push(`${codes[i]} (${params.get('error') || response.status})`);
        } catch (e) {
            results.fail.push(`${codes[i]} (เชื่อมต่อไม่ได้)`);
        }
    }
    if (action === 'release') {
        results.ok.forEach((code) => {
            const stall = findStall(code);
            if (stall) { stall.status = 'AVAILABLE'; delete stall.expiryState; }
        });
    }
    bulkSelection.clear();
    renderBulkBar();
    renderLayerChrome();
    if (activeZone) renderGrid(activeZone);
    window.showAlertDialog({
        title: results.fail.length ? 'ทำรายการไม่ครบ' : 'เรียบร้อย',
        message: `สำเร็จ ${results.ok.length} ล็อก${results.fail.length ? ` · ไม่สำเร็จ: ${results.fail.join(', ')}` : ''}`,
        tone: results.fail.length ? 'warning' : 'success'
    });
}

// ==========================================
// staff: โหมดเดินตรวจ — เรียงร้านที่ยังไม่ตรวจตามเส้นทางเดินจริง แถบล่างจอบอก "ร้านถัดไป"
// บันทึกผลตรวจด่วนแล้วเด้งไปร้านถัดไปเอง
// ==========================================
let walkMode = false;
let walkCurrent = null;

function walkQueue() {
    if (!HAS_INSPECTION) return [];
    return (INSPECTION.walkOrder || Object.keys(INSPECTION.byCode))
        .filter((code) => (findStall(code) || {}).status === 'BOOKED' && inspectionStatusOf(code) === 'pending');
}

function setWalkMode(on) {
    if (walkMode === on) return;
    walkMode = on;
    document.body.classList.toggle('walk-on', on);
    if (on) {
        walkCurrent = walkQueue()[0] || null;
        if (walkCurrent) openStallDeepLink(walkCurrent, true);
    } else {
        walkCurrent = null;
    }
    renderWalkBar();
    const btn = document.querySelector('#layerSummary [data-action="walk"]');
    if (btn) btn.classList.toggle('active', on);
}

function walkStep(delta) {
    const queue = walkQueue();
    if (!queue.length) { walkCurrent = null; renderWalkBar(); return; }
    const idx = queue.indexOf(walkCurrent);
    if (idx === -1) {
        // ร้านปัจจุบันเพิ่งตรวจเสร็จ (หลุดจากคิว) — ไปร้านที่ยังไม่ตรวจถัดไปตามเส้นทาง ไม่ย้อนกลับไปต้นคิว
        const order = INSPECTION.walkOrder || [];
        const pos = order.indexOf(walkCurrent);
        walkCurrent = queue.find((code) => order.indexOf(code) > pos) || queue[0];
    } else {
        walkCurrent = queue[(idx + delta + queue.length) % queue.length];
    }
    renderWalkBar();
    hideInfo();
    openStallDeepLink(walkCurrent, true);
}

function renderWalkBar() {
    let bar = document.getElementById('walkBar');
    if (!walkMode) { if (bar) bar.hidden = true; syncDockHeight(); return; }
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'walkBar';
        bar.className = 'action-dock';
        document.body.appendChild(bar);
    }
    const { total, checked } = inspectionCounts(allStalls());
    const pct = total ? Math.round((checked / total) * 100) : 0;
    const d = walkCurrent ? BOOKING_BY_STALL[walkCurrent] : null;
    bar.hidden = false;
    bar.innerHTML = walkCurrent ? `
        <div class="ad-info">
            <span class="ad-kicker">ร้านถัดไป · ตรวจแล้ว ${checked}/${total}</span>
            <span class="ad-line"><b>${escapeHtml(walkCurrent)}</b> ${escapeHtml(d ? d.shop : '')}</span>
            <span class="ad-progress"><span style="width:${pct}%"></span></span>
        </div>
        <div class="ad-actions">
            <button type="button" class="ad-btn ad-ghost" data-walk="prev" aria-label="ร้านก่อนหน้า"><i class="fa-solid fa-chevron-left"></i></button>
            <button type="button" class="ad-btn" data-walk="open"><i class="fa-solid fa-location-crosshairs"></i> เปิดร้านนี้</button>
            <button type="button" class="ad-btn ad-ghost" data-walk="next" aria-label="ร้านถัดไป"><i class="fa-solid fa-chevron-right"></i></button>
            <button type="button" class="ad-btn ad-ghost" data-walk="stop">จบ</button>
        </div>` : `
        <div class="ad-info"><b>ตรวจครบทุกร้านแล้ว</b> <small>ตรวจแล้ว ${checked}/${total} — อย่าลืมกด "ส่งงาน" ที่หน้าตรวจตลาด</small></div>
        <div class="ad-actions">
            <a class="ad-btn" href="/staff/marketinspection">ไปส่งงาน</a>
            <button type="button" class="ad-btn ad-ghost" data-walk="stop">จบ</button>
        </div>`;
    const on = (sel, fn) => { const el = bar.querySelector(sel); if (el) el.onclick = fn; };
    on('[data-walk="prev"]', () => walkStep(-1));
    on('[data-walk="next"]', () => walkStep(1));
    on('[data-walk="open"]', () => { hideInfo(); openStallDeepLink(walkCurrent, true); });
    on('[data-walk="stop"]', () => setWalkMode(false));
    syncDockHeight();
}

// ปุ่ม action ที่อยู่ในแถบสรุปของชั้นข้อมูล (เลือกหลายล็อก / เดินตรวจ / แถบเลื่อนวัน)
function bindSummaryActions(summary) {
    const bulk = summary.querySelector('[data-action="bulk"]');
    if (bulk) bulk.addEventListener('click', () => setBulkMode(!bulkMode));
    const walk = summary.querySelector('[data-action="walk"]');
    if (walk) walk.addEventListener('click', () => setWalkMode(!walkMode));
    const ahead = summary.querySelector('[data-action="ahead"]');
    if (ahead) {
        let timer = null;
        ahead.addEventListener('input', () => {
            expiryAheadDays = Number(ahead.value) || 0;
            const text = summary.querySelector('[data-ahead-text]');
            if (text) text.textContent = aheadSummaryText();
            clearTimeout(timer);
            timer = setTimeout(() => { if (activeZone) renderGrid(activeZone); }, 60);
        });
    }
}

// แตะล็อกที่มีร้าน: โหมดเลือกหลายล็อก = เลือก/ยกเลิก, ปกติ = เปิดการ์ดร้าน
function onBookedStallClick(code) {
    if (bulkMode) { toggleBulkStall(code); return; }
    if (walkMode) { walkCurrent = code; renderWalkBar(); }
    showInfo(code);
}

const LAYER_KEYS = Object.keys(LAYERS).filter((key) => LAYERS[key].available);
const layerParam = new URLSearchParams(window.location.search).get('layer');
// staff ใช้ผังนี้เพื่อตามงานตรวจเป็นหลัก จึงเปิดชั้นผลตรวจเป็นค่าเริ่มต้น — role อื่นเริ่มที่หมวดสินค้า
let currentLayer = LAYER_KEYS.includes(layerParam)
    ? layerParam
    : (IS_STAFF && LAYER_KEYS.includes('inspection') ? 'inspection' : 'category');

// ตัวกรองที่ทำให้ล็อกอื่นจางลง (ให้เห็นเฉพาะที่ตรง) — ตัวกรองหมวดสินค้าใช้เงื่อนไขแยกอยู่แล้ว
function isDimmingFilter(status) {
    return isLayerFilter(status) || ['HAS_MENU', 'NEW', 'FAV', 'RECENT', 'OPEN', 'PROMO'].includes(status);
}

// ==========================================
// ร้านโปรด — เก็บในเครื่อง (localStorage) ด้วยชื่อร้าน ไม่ใช่รหัสล็อก เพราะร้านเดิมย้ายล็อกได้ทุกรอบ
// ==========================================
const FAV_KEY = 'kangsadan.favoriteShops';
let favoriteShops = new Set();
try { favoriteShops = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch (e) { favoriteShops = new Set(); }

function isFavorite(code) {
    const d = BOOKING_BY_STALL[code];
    return !!(d && favoriteShops.has(d.shop));
}

function toggleFavorite(code) {
    const d = BOOKING_BY_STALL[code];
    if (!d) return false;
    if (favoriteShops.has(d.shop)) favoriteShops.delete(d.shop);
    else favoriteShops.add(d.shop);
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...favoriteShops])); } catch (e) { /* โหมดส่วนตัวบางเบราว์เซอร์เขียนไม่ได้ */ }
    updateQuickTagCounts();
    if (currentStatusFilter === 'FAV') refreshFilterResults();
    else if (activeZone) renderGrid(activeZone);
    return favoriteShops.has(d.shop);
}

// ร้านเปิดเป็นค่าเริ่มต้น — server ส่ง closedAt มาเฉพาะร้านที่ผู้ขายกด "ปิดร้านวันนี้"
function isClosedToday(code) {
    const d = BOOKING_BY_STALL[code];
    return !!(d && d.closedAt);
}

function formatClock(value) {
    return new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function hasPromo(code) {
    const d = BOOKING_BY_STALL[code];
    return !!(d && d.promo && !d.closedAt);
}

function hasMenu(code) {
    const d = BOOKING_BY_STALL[code];
    return !!(d && (d.menuImages || []).length);
}

// เลขในปุ่มค้นหาด่วน (มีรูปเมนู / ร้านใหม่ / ร้านโปรด) นับเป็นจำนวนล็อกบนผัง
function updateQuickTagCounts() {
    const booked = allStalls().filter((s) => s.status === 'BOOKED');
    const counts = {
        HAS_MENU: booked.filter((s) => hasMenu(s.code)).length,
        NEW: booked.filter((s) => BOOKING_BY_STALL[s.code] && BOOKING_BY_STALL[s.code].isNew).length,
        FAV: booked.filter((s) => isFavorite(s.code)).length,
        RECENT: booked.filter((s) => isRecent(s.code)).length,
        OPEN: booked.filter((s) => !isClosedToday(s.code)).length,
        PROMO: booked.filter((s) => hasPromo(s.code)).length
    };
    Object.keys(counts).forEach((key) => {
        const el = document.querySelector(`[data-qcount="${key}"]`);
        if (el) el.textContent = counts[key];
    });
}

function paintStallLayer(cell, code) {
    LAYERS[currentLayer].paint(cell, code);
    // เครื่องหมายเล็กบนล็อก: ดาว = ร้านโปรด (มุมซ้ายบน), สมุด = มีรูปเมนู (มุมขวาล่าง)
    if (isFavorite(code)) cell.insertAdjacentHTML('beforeend', '<i class="cell-mark cell-mark-fav fa-solid fa-star" aria-hidden="true"></i>');
    if (hasMenu(code)) cell.insertAdjacentHTML('beforeend', '<i class="cell-mark cell-mark-menu fa-solid fa-book-open" aria-hidden="true"></i>');
    // โปรวันนี้: ป้าย "โปร" มุมขวาบน (ไม่แสดงในชั้นผลตรวจ ซึ่งใช้มุมนี้บอกว่ามีปัญหา)
    if (hasPromo(code) && currentLayer !== 'inspection') cell.insertAdjacentHTML('beforeend', '<span class="cell-mark cell-mark-promo" aria-hidden="true">โปร</span>');
    // ร้านที่แจ้งปิดวันนี้: จางลง + ป้าย "ปิด" มุมซ้ายล่าง
    if (isClosedToday(code)) {
        cell.classList.add('shop-closed');
        cell.insertAdjacentHTML('beforeend', '<span class="cell-mark cell-mark-closed" aria-hidden="true">ปิด</span>');
    }
}

// ตัวกรองที่มาจากแถบสรุปของชั้นข้อมูล (INSP_* = ผลตรวจ, EXP_* = หมดสัญญา) — เปลี่ยนชั้นแล้วล้างทิ้ง
function isLayerFilter(status) {
    return /^(INSP|EXP|REP)_/.test(String(status || ''));
}

function renderLayerChrome() {
    const layer = LAYERS[currentLayer];

    const legend = document.getElementById('layerLegend');
    if (legend) legend.innerHTML = layer.legend();
    const legBooked = document.getElementById('legBooked');
    if (legBooked) legBooked.classList.toggle('d-none', !!layer.hidesBookedLegend);

    const summary = document.getElementById('layerSummary');
    if (summary) {
        const html = layer.summary();
        summary.innerHTML = html;
        summary.hidden = !html;
        summary.querySelectorAll('[data-layer-filter]').forEach((btn) => {
            if (btn.dataset.layerFilter === currentStatusFilter) btn.classList.add('active');
            btn.addEventListener('click', () => quickStatusFilter(btn, btn.dataset.layerFilter));
        });
        bindSummaryActions(summary);
    }

    document.querySelectorAll('#layerTabs .layer-tab').forEach((tab) => {
        const on = tab.dataset.layer === currentLayer;
        tab.classList.toggle('active', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    document.querySelectorAll('#zoneCards .zone-card').forEach((card) => {
        const stat = card.querySelector('.zc-stat');
        if (stat) stat.innerHTML = layer.zoneStat(card.dataset.zone);
    });
}

function setLayer(key) {
    if (!LAYER_KEYS.includes(key) || key === currentLayer) return;
    currentLayer = key;
    // โหมดเลือกหลายล็อก/เดินตรวจผูกกับชั้นของมัน เปลี่ยนชั้นแล้วปิด
    if (key !== 'expiry') setBulkMode(false);
    if (key !== 'inspection') setWalkMode(false);
    // ตัวกรองของชั้นเดิมไม่มีปุ่มให้กดปิดในชั้นใหม่ ล้างทิ้งไม่ให้ไฮไลต์ค้าง
    if (isLayerFilter(currentStatusFilter)) currentStatusFilter = null;

    // เก็บชั้นที่เลือกไว้ในลิงก์ ส่งต่อให้คนอื่นเปิดแล้วเจอมุมมองเดียวกัน
    const url = new URL(window.location.href);
    url.searchParams.set('layer', key);
    window.history.replaceState(null, '', url);

    renderLayerChrome();
    refreshFilterResults();
}

function buildLayerTabs() {
    const box = document.getElementById('layerTabs');
    if (!box) return;
    // มีชั้นเดียวไม่ต้องมีแถบให้สลับ
    if (LAYER_KEYS.length < 2) {
        const bar = document.getElementById('layerBar');
        if (bar) bar.classList.add('d-none');
        return;
    }
    LAYER_KEYS.forEach((key) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'layer-tab';
        tab.dataset.layer = key;
        tab.setAttribute('role', 'tab');
        tab.innerHTML = `<i class="fa-solid ${LAYERS[key].icon} fa-xs"></i> ${LAYERS[key].label}`;
        tab.addEventListener('click', () => setLayer(key));
        box.appendChild(tab);
    });
}

// ข้อความ+ปุ่มลัดในการ์ดรายละเอียดล็อก แยกตาม role (ผู้ขาย/ลูกค้า/แอดมิน/staff)
const REPAIR_STATUS_LABELS = { PENDING: 'รอตรวจสอบ', APPROVED: 'อนุมัติแล้ว', IN_PROGRESS: 'กำลังซ่อม' };

// การ์ดสุขภาพล็อกของผู้ขาย: สัญญา / ความสะอาด / ไฟเกิน / แจ้งซ่อมค้าง — ช่องละเรื่อง อ่านจบในแวบเดียว
function myStallHealthHtml(id, stall) {
    const h = (VIEWER.stallHealth || {})[id] || {};
    const cells = [];

    if (stall && stall.bookingEndDate) {
        const left = daysLeftUntil(stall.bookingEndDate);
        const tone = left !== null && left < 0 ? 'bad' : left !== null && left <= 3 ? 'warn' : 'good';
        cells.push(['สัญญา', left === null ? '-' : left < 0 ? 'หมดแล้ว' : `เหลือ ${left} วัน`, `ถึง ${formatThaiDate(stall.bookingEndDate)}`, tone]);
    }
    if (h.cleanliness) {
        cells.push(['ความสะอาด', h.cleanliness.passed ? 'ผ่าน' : 'ไม่ผ่าน', `ตรวจ ${formatThaiDate(h.cleanliness.at)}`, h.cleanliness.passed ? 'good' : 'bad']);
    } else {
        cells.push(['ความสะอาด', 'ยังไม่มีผล', 'เฉพาะร้านอาหาร', 'muted']);
    }
    if (h.excess) {
        cells.push(['ไฟเกิน', `฿${Number(h.excess.subtotal || 0).toLocaleString('th-TH')}`, `เล็ก ${h.excess.small} · ใหญ่ ${h.excess.large} (${formatThaiDate(h.excess.at)})`, 'warn']);
    } else {
        cells.push(['ไฟเกิน', 'ไม่มี', 'ไม่พบเครื่องใช้ไฟฟ้าเกิน', 'good']);
    }
    const repairs = h.openRepairs || [];
    cells.push(['แจ้งซ่อม', repairs.length ? `ค้าง ${repairs.length}` : 'ไม่มีค้าง',
        repairs.length ? repairs.map((r) => `${r.category} (${REPAIR_STATUS_LABELS[r.status] || r.status})`).join(', ') : 'ทุกงานเสร็จแล้ว',
        repairs.length ? 'warn' : 'good']);

    const os = VIEWER.openStatus || {};
    const openRow = `
        <div class="ich-open${os.isOpen === false ? ' is-closed' : ''}">
            <span><b>${os.isOpen === false ? 'ปิดร้านแล้ววันนี้' : 'ร้านเปิดอยู่'}</b>${os.isOpen === false
                ? ` เมื่อ ${formatClock(os.closedAt)} น.`
                : ' ไม่ได้มาขาย/เก็บร้านแล้ว กดปิดร้าน'}</span>
            <button type="button" class="ich-open-btn" data-open-toggle>${os.isOpen === false ? 'ยกเลิกการปิด' : 'ปิดร้านวันนี้'}</button>
        </div>`;
    return openRow + `<div class="ic-health">${cells.map(([label, value, sub, tone]) => `
        <div class="ich ich-${tone}">
            <span class="ich-label">${escapeHtml(label)}</span>
            <b class="ich-value">${escapeHtml(value)}</b>
            <span class="ich-sub">${escapeHtml(sub)}</span>
        </div>`).join('')}</div>`;
}

// ผู้ขายกดปิดร้านวันนี้ (หรือยกเลิกการปิด) จากการ์ดล็อกตัวเอง — ใช้ endpoint เดียวกับหน้าแรกผู้ขาย (POST /shop-status)
async function saveMyShopOpen(open, code) {
    try {
        const response = await fetch('/shop-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ open })
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || 'บันทึกไม่สำเร็จ');
        VIEWER.openStatus = payload;
        MY_STALLS.forEach((c) => { if (BOOKING_BY_STALL[c]) BOOKING_BY_STALL[c].closedAt = payload.isOpen ? null : payload.closedAt; });
        updateQuickTagCounts();
        if (activeZone) renderGrid(activeZone);
        showInfo(code);
        showMapToast(payload.isOpen ? 'ยกเลิกการปิดแล้ว ร้านกลับมาเปิดตามปกติ' : 'ปิดร้านวันนี้แล้ว ลูกค้าเห็นบนผังว่าร้านปิด');
    } catch (error) {
        window.showAlertDialog({ title: 'บันทึกไม่สำเร็จ', message: error.message, tone: 'danger' });
    }
}

function toggleMyShopOpen(code) {
    const isOpen = !(VIEWER.openStatus && VIEWER.openStatus.isOpen === false);
    if (!isOpen) { saveMyShopOpen(true, code); return; }
    window.showConfirmDialog({
        title: 'ปิดร้านวันนี้?',
        message: 'ลูกค้าจะเห็นบนผังตลาดว่าร้านปิดแล้ว ร้านจะกลับมาเปิดเองในวันขายถัดไป (กดยกเลิกได้ถ้ากดพลาด)',
        tone: 'warning',
        confirmText: 'ปิดร้าน',
        onConfirm: () => saveMyShopOpen(false, code)
    });
}

function renderRoleActions(id, zone, isVacant) {
    const noteEl = document.getElementById('icRoleNote');
    const actionsEl = document.getElementById('icRoleActions');
    const notes = [];
    const actions = [];
    const stall = findStall(id);

    if (MY_STALLS.has(id)) {
        notes.push('<b>ล็อกของคุณ</b>');
        notes.push(myStallHealthHtml(id, stall));
        actions.push(['/booking-stall/extend', 'ต่อล็อก']);
        actions.push([`/repair?stall=${encodeURIComponent(id)}`, 'แจ้งซ่อมล็อกนี้']);
    } else if (IS_ADMIN || IS_STAFF) {
        if (stall && stall.bookingEndDate) {
            const left = daysLeftUntil(stall.bookingEndDate);
            const leftText = left === null ? '' : left < 0 ? ' (หมดสัญญาแล้ว)' : ` (เหลือ ${left} วัน)`;
            notes.push(`<div>หมดสัญญา ${formatThaiDate(stall.bookingEndDate)}${leftText}</div>`);
        }
        const insp = inspectionOf(id);
        if (!isVacant) {
            const d0 = BOOKING_BY_STALL[id] || {};
            if (d0.closedAt) notes.push(`<div>ผู้ขายแจ้ง<b>ปิดร้านวันนี้</b> เมื่อ ${formatClock(d0.closedAt)} น.</div>`);
        }
        if (insp) {
            const st = INSPECTION_STATUS[insp.status];
            const list = inspectionProblems(insp);
            const problems = list.length ? ` — ${list.map(escapeHtml).join(', ')}` : '';
            notes.push(`<div>ผลตรวจวันนี้: <b class="insp-note insp-note-${insp.status}">${st.short}</b>${problems}</div>`);
        } else if (HAS_INSPECTION && !isVacant) {
            notes.push(`<div>ผลตรวจวันนี้: <b class="insp-note insp-note-na">${INSPECTION_STATUS.na.short}</b> — ยังไม่ชำระเงิน</div>`);
        }
        if (IS_ADMIN) actions.push(['/admin/slots', 'จัดการที่หน้าจัดแผง']);
        if (IS_STAFF && !isVacant) actions.push([`/staff/marketinspection?q=${encodeURIComponent(id)}`, insp && insp.status === 'pending' ? 'ไปบันทึกผลตรวจ' : 'ไปหน้าตรวจตลาด']);
    }

    noteEl.innerHTML = notes.join('');
    const openToggle = noteEl.querySelector('[data-open-toggle]');
    if (openToggle) openToggle.addEventListener('click', () => toggleMyShopOpen(id));
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
// บันทึกผลตรวจด่วนจากผัง (staff) — ใช้ API เดียวกับหน้าตรวจตลาด (/staff/marketinspection/*)
// เฉพาะล็อกที่ชำระเงินแล้ว (มีใน INSPECTION.byCode) และอยู่ในชั้นผลตรวจ
// ==========================================
const QUICK_ISSUES = [
    ['noShow', 'ไม่มาขาย'],
    ['sublease', 'ปล่อยเช่าช่วง'],
    ['otherMarket', 'ไปขายตลาดอื่น'],
    ['wrongSeller', 'คนขายไม่ตรงชื่อ']
];

function renderQuickInspect(id) {
    const box = document.getElementById('icQuickInspect');
    box.innerHTML = '';
    const r = inspectionOf(id);
    if (!IS_STAFF || !r || currentLayer !== 'inspection') return;

    const issue = r.issue || {};
    const excess = r.excess || {};
    box.innerHTML = `
        <div class="qi-head">บันทึกผลตรวจด่วน <small>${r.stallId ? '' : '(โหมดทดลอง บันทึกจริงไม่ได้)'}</small></div>
        <button type="button" class="qi-ok" data-qi="ok"><i class="fa-solid fa-check"></i> ตรวจแล้ว ปกติ</button>
        <div class="qi-or">หรือระบุปัญหาที่พบ</div>
        <div class="qi-checks">
            ${QUICK_ISSUES.map(([key, label]) => `<label class="qi-check"><input type="checkbox" name="${key}" ${issue[key] ? 'checked' : ''}> ${label}</label>`).join('')}
        </div>
        <input type="text" class="qi-note" name="otherIssueNote" maxlength="1000" placeholder="ปัญหาอื่นๆ (ถ้ามี)" value="${escapeHtml(issue.otherIssueNote || '')}">
        <div class="qi-excess">
            <span>ไฟเกิน</span>
            <label>เล็ก <input type="number" name="small" min="0" max="50" value="${excess.small || 0}"></label>
            <label>ใหญ่ <input type="number" name="large" min="0" max="50" value="${excess.large || 0}"></label>
        </div>
        <button type="button" class="qi-save" data-qi="issue">บันทึกปัญหา</button>
        <div class="qi-msg" role="status"></div>`;
    box.querySelector('[data-qi="ok"]').addEventListener('click', () => saveQuickInspect(id, true));
    box.querySelector('[data-qi="issue"]').addEventListener('click', () => saveQuickInspect(id, false));
}

async function postInspection(path, body) {
    const response = await fetch(`/staff/marketinspection/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.message || 'บันทึกไม่สำเร็จ');
    return payload;
}

async function saveQuickInspect(id, markOk) {
    const r = inspectionOf(id);
    const box = document.getElementById('icQuickInspect');
    const msg = box.querySelector('.qi-msg');
    if (!r || !r.stallId) {
        msg.textContent = 'โหมดทดลอง: ไม่ได้บันทึกจริง';
        return;
    }
    const issue = { noShow: false, sublease: false, otherMarket: false, wrongSeller: false, otherIssueNote: '' };
    let small = 0;
    let large = 0;
    if (!markOk) {
        QUICK_ISSUES.forEach(([key]) => { issue[key] = box.querySelector(`input[name="${key}"]`).checked; });
        issue.otherIssueNote = box.querySelector('input[name="otherIssueNote"]').value.trim();
        small = Math.max(0, parseInt(box.querySelector('input[name="small"]').value, 10) || 0);
        large = Math.max(0, parseInt(box.querySelector('input[name="large"]').value, 10) || 0);
    }
    const hadExcess = (r.excess && (r.excess.small > 0 || r.excess.large > 0));

    box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    msg.className = 'qi-msg';
    msg.textContent = 'กำลังบันทึก...';
    try {
        // บันทึกเป็น "เร็คอร์ดล่าสุดของวันนี้" ทับของเดิม — ปกติ = ล้างปัญหา + ทำเครื่องหมายว่าตรวจแล้ว
        await postInspection('issue', Object.assign({ stallId: r.stallId }, issue));
        // บันทึกไฟเกินเฉพาะตอนมีค่า หรือเคยบันทึกไว้วันนี้แล้วต้องล้าง — ไม่สร้างเร็คอร์ด 0 โดยไม่จำเป็น
        if (small > 0 || large > 0 || hadExcess) await postInspection('electric-excess', { stallId: r.stallId, smallCount: small, largeCount: large });
        if (markOk) await postInspection('inspection-check', { stallId: r.stallId, isInspected: true });

        r.issue = issue;
        r.excess = { small, large };
        r.checkedAt = new Date().toISOString();
        r.status = inspectionProblems(r).length ? 'issue' : 'ok';
        renderLayerChrome();
        if (activeZone) renderGrid(activeZone);
        showInfo(id);
        const after = document.querySelector('#icQuickInspect .qi-msg');
        if (after) { after.className = 'qi-msg qi-msg-ok'; after.textContent = walkMode ? 'บันทึกแล้ว กำลังไปร้านถัดไป...' : 'บันทึกแล้ว'; }
        // โหมดเดินตรวจ: บันทึกเสร็จเด้งไปร้านที่ยังไม่ตรวจถัดไปตามเส้นทางเอง
        if (walkMode) setTimeout(() => walkStep(0), 700);
    } catch (error) {
        msg.className = 'qi-msg qi-msg-err';
        msg.textContent = error.message;
        box.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
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

// ป้ายเมนูเด่นใน tooltip — โชว์ไม่เกิน 5 ป้าย ที่เหลือบอกเป็นจำนวน
const TT_TAG_LIMIT = 5;
function renderTooltipTags(tags) {
    const box = document.getElementById('tt-tags');
    const group = document.getElementById('tt-tags-group');
    box.innerHTML = '';
    tags.slice(0, TT_TAG_LIMIT).forEach((tag) => {
        const chip = document.createElement('span');
        chip.className = 'menu-tag';
        chip.textContent = tag;
        box.appendChild(chip);
    });
    if (tags.length > TT_TAG_LIMIT) {
        const more = document.createElement('span');
        more.className = 'menu-tag menu-tag-more';
        more.textContent = `+${tags.length - TT_TAG_LIMIT}`;
        box.appendChild(more);
    }
    group.style.display = tags.length ? '' : 'none';
}

function showStallTooltip(e, code, stall) {
    const img = document.getElementById('tt-image');
    const bk = BOOKING_BY_STALL[code];
    const mine = MY_STALLS.has(code);
    stallTooltip.className = 'stall-tooltip';
    const tags = [mine ? 'ล็อกของคุณ' : '', bk && bk.isNew && stall.status === 'BOOKED' ? 'ร้านใหม่' : '', isFavorite(code) && stall.status === 'BOOKED' ? '★ ร้านโปรด' : ''].filter(Boolean);
    document.getElementById('tt-stall-id').textContent = code + (tags.length ? ` · ${tags.join(' · ')}` : '');
    img.hidden = true;
    img.removeAttribute('src');

    let hint = '';
    if (stall.status === 'BOOKED') {
        stallTooltip.classList.add('tt-booked');
        if (bk && bk.image) { img.src = bk.image; img.hidden = false; }
        setTt('tt-shop', bk ? bk.shop : 'มีร้านค้าแล้ว');
        setTt('tt-product', bk ? (categoryOf(code) || {}).label : '');
        setTt('tt-detail', bk && bk.productDetail && bk.productDetail !== '-' ? bk.productDetail : '');
        renderTooltipTags(shopTagsOf(bk));
        hint = bk && ((bk.menuImages || []).length) ? 'คลิกเพื่อดูรายละเอียดและรูปเมนู' : 'คลิกเพื่อดูรายละเอียด';
        if (currentLayer === 'inspection') {
            const insp = inspectionOf(code);
            const st = INSPECTION_STATUS[insp ? insp.status : 'na'];
            const list = inspectionProblems(insp);
            const problems = list.length ? ` (${list.join(', ')})` : '';
            hint = `ผลตรวจวันนี้: ${st.short}${problems} · ${hint}`;
        }
    } else if (stall.status === 'MAINTENANCE') {
        renderTooltipTags([]);
        stallTooltip.classList.add('tt-maint');
        setTt('tt-shop', 'อยู่ระหว่างซ่อมบำรุง');
        setTt('tt-product', '');
        setTt('tt-detail', 'ยังจองไม่ได้ในตอนนี้');
    } else {
        renderTooltipTags([]);
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
        if (currentStatusFilter === 'INSP_ISSUE') return stall.status === 'BOOKED' && inspectionStatusOf(id) === 'issue';
        if (currentStatusFilter === 'INSP_PENDING') return stall.status === 'BOOKED' && inspectionStatusOf(id) === 'pending';
        if (currentStatusFilter === 'EXP_LAPSED') return stall.status === 'BOOKED' && stall.expiryState === 'expired';
        if (currentStatusFilter === 'EXP_SOON') return stall.status === 'BOOKED' && (stall.expiryState === 'critical' || stall.expiryState === 'near');
        if (currentStatusFilter === 'HAS_MENU') return stall.status === 'BOOKED' && hasMenu(id);
        if (currentStatusFilter === 'NEW') return stall.status === 'BOOKED' && !!(BOOKING_BY_STALL[id] && BOOKING_BY_STALL[id].isNew);
        if (currentStatusFilter === 'FAV') return stall.status === 'BOOKED' && isFavorite(id);
        if (currentStatusFilter === 'RECENT') return stall.status === 'BOOKED' && isRecent(id);
        if (currentStatusFilter === 'OPEN') return stall.status === 'BOOKED' && !isClosedToday(id);
        if (currentStatusFilter === 'PROMO') return stall.status === 'BOOKED' && hasPromo(id);
        if (currentStatusFilter === 'INSP_CLOSED') return stall.status === 'BOOKED' && isClosedToday(id);
        if (currentStatusFilter === 'REP_ANY') return !!repairStatusOf(id);
        if (currentStatusFilter === 'EMPTY') {
            if (!CAN_SEE_VACANCY) return false;
            return stall.status !== 'BOOKED' && stall.status !== 'MAINTENANCE';
        }
        return stall.status === currentStatusFilter;
    }
    if (currentQuery) {
        const d = BOOKING_BY_STALL[id];
        if (!d) return false;
        return (d.shop + d.product + d.productDetail + (d.tags || '')).toLowerCase().includes(currentQuery.toLowerCase());
    }
    return false;
}

// การ์ดสลับโซนด้านข้างใน drawer (กดแล้วเปิดโซนนั้นทันที) — ตัวเลขสรุปมาจากชั้นข้อมูลที่เลือกอยู่ (LAYERS[..].zoneStat)
function renderZoneCards(z) {
    const box = document.getElementById('zoneCards');
    if (!box) return;
    if (!box.dataset.built) {
        box.dataset.built = '1';
        Object.keys(ZONES_DATA).sort().forEach((code) => {
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
            stat.innerHTML = LAYERS[currentLayer].zoneStat(code);

            btn.append(title, desc);
            if (CAN_SEE_VACANCY) btn.appendChild(stat);
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
    renderZoneInsights(z);
    applyZoom();
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

function drawerStatsHtml(total, booked, maintenance) {
    const vacant = CAN_SEE_VACANCY ? ` &nbsp;·&nbsp; ว่าง <b>${total - booked - maintenance}</b>` : '';
    return `ทั้งหมด <b>${total}</b> ล็อก &nbsp;·&nbsp; จอง <b>${booked}</b> &nbsp;·&nbsp; ซ่อมบำรุง <b>${maintenance}</b>${vacant}`;
}

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
            paintStallLayer(cell, pos.code);
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                onBookedStallClick(pos.code);
            });
        } else if (stall.status === 'MAINTENANCE') {
            maintenance += 1;
            cell.classList.add('maintenance');
        } else if (CAN_SEE_VACANCY) {
            cell.classList.add('vacant-clickable');
            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                showVacantInfo(pos.code, z);
            });
        } else {
            cell.classList.add('vacant-hidden');
        }

        if ((currentQuery || currentStatusFilter || currentCategoryFilter) && stallMatchesFilter(pos.code, stall)) cell.classList.add('s-match');
        else if (currentCategoryFilter || isDimmingFilter(currentStatusFilter)) cell.classList.add('dimmed');
        decorateAnyCell(cell, pos.code, stall);
        if (!cell.classList.contains('vacant-hidden')) bindStallTooltip(cell, pos.code, stall);
        layout.appendChild(cell);
    });

    grid.appendChild(layout);
    document.getElementById('drawerStats').innerHTML = drawerStatsHtml(ZONE_D_LAYOUT.length, booked, maintenance);
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
                paintStallLayer(cell, id);
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onBookedStallClick(id);
                });
            } else if (stall.status === 'MAINTENANCE') {
                maintenance += 1;
                cell.classList.add('maintenance');
            } else if (CAN_SEE_VACANCY) {
                cell.classList.add('vacant-clickable');
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showVacantInfo(id, z);
                });
            } else {
                cell.classList.add('vacant-hidden');
            }

            if ((currentQuery || currentStatusFilter || currentCategoryFilter) && stallMatchesFilter(id, stall)) cell.classList.add('s-match');
            else if (currentCategoryFilter || isDimmingFilter(currentStatusFilter)) cell.classList.add('dimmed');
            decorateAnyCell(cell, id, stall);
            if (!cell.classList.contains('vacant-hidden')) bindStallTooltip(cell, id, stall);
            (isPaired(stall) ? getSmallWrap(stall.groupId) : col).appendChild(cell);
        });

        wrap.appendChild(col);
        grid.appendChild(wrap);
    });

    document.getElementById('drawerStats').innerHTML = drawerStatsHtml(total, booked, maintenance);
}

// ปุ่มร้านโปรด + แชร์ร้าน ในการ์ดร้าน
function renderCardTools(id) {
    const favBtn = document.getElementById('icFavBtn');
    const paintFav = () => {
        const on = isFavorite(id);
        favBtn.classList.toggle('active', on);
        favBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        favBtn.innerHTML = `<i class="fa-${on ? 'solid' : 'regular'} fa-star"></i> ${on ? 'ร้านโปรดแล้ว' : 'ร้านโปรด'}`;
    };
    paintFav();
    favBtn.onclick = () => { toggleFavorite(id); paintFav(); };
    document.getElementById('icShareBtn').onclick = () => shareStall(id);
    // นำทาง (public/js/marketNav.js) — ซ่อนถ้ายังคำนวณทางไปล็อกนี้ไม่ได้ (เช่น โซนอื่นๆ นอกผังหลัก)
    const navBtn = document.getElementById('icNavBtn');
    // การ์ดที่เปิดจากลิงก์ ?stall= ตอนโหลดหน้า แสดงก่อน marketNav.js โหลดเสร็จ — ยังเช็คไม่ได้ก็แสดงปุ่มไว้ก่อน
    const canNav = !window.canNavigateTo || window.canNavigateTo(id);
    navBtn.classList.toggle('d-none', !canNav);
    navBtn.onclick = () => { if (window.openNavigator) window.openNavigator(id); };
    // QR/ป้ายหน้าร้าน: เจ้าของล็อก + แอดมิน/staff (ลูกค้าใช้ปุ่มแชร์แทน)
    const qrBtn = document.getElementById('icQrBtn');
    const canQr = MY_STALLS.has(id) || CAN_SEE_VACANCY;
    qrBtn.classList.toggle('d-none', !canQr);
    qrBtn.onclick = () => openQrViewer(id);
}

function openQrViewer(id) {
    const d = BOOKING_BY_STALL[id] || {};
    document.getElementById('qrStall').textContent = id;
    document.getElementById('qrTitle').textContent = d.shop || '';
    document.getElementById('qrImage').src = `/market-map/qr/${encodeURIComponent(id)}.svg`;
    document.getElementById('qrSignLink').href = `/market-map/sign/${encodeURIComponent(id)}`;
    const dl = document.getElementById('qrDownload');
    dl.href = `/market-map/qr/${encodeURIComponent(id)}.svg?download=1`;
    const viewer = document.getElementById('qrViewer');
    viewer.hidden = false;
    document.body.classList.add('mv-open');
    viewer.querySelector('.mv-close').focus();
}

function closeQrViewer() {
    document.getElementById('qrViewer').hidden = true;
    document.body.classList.remove('mv-open');
}

// แชร์ร้าน: มือถือใช้เมนูแชร์ของเครื่อง, คอมคัดลอกลิงก์ — ลิงก์เปิดผังที่ล็อกนี้พร้อมการ์ดร้าน
async function shareStall(id) {
    const d = BOOKING_BY_STALL[id] || {};
    const url = `${window.location.origin}/market-map?stall=${encodeURIComponent(id)}`;
    trackView(id, 'share');
    if (navigator.share) {
        try {
            await navigator.share({ title: `${d.shop || 'ร้านค้า'} — ตลาดกังสดาลไนท์`, text: `ร้าน ${d.shop || ''} แผง ${id}`, url });
            return;
        } catch (e) {
            if (e && e.name === 'AbortError') return;
        }
    }
    try {
        await navigator.clipboard.writeText(url);
        showMapToast('คัดลอกลิงก์ร้านแล้ว ส่งให้เพื่อนได้เลย');
    } catch (e) {
        showMapToast(url, 6000);
    }
}

let toastTimer = null;
function showMapToast(text, ms = 2500) {
    let toast = document.getElementById('mapToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'mapToast';
        toast.className = 'map-toast';
        toast.setAttribute('role', 'status');
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
}

// ==========================================
// ส่วนเสริมในการ์ดร้าน: โพสต์ล่าสุด / ร้านข้างๆ / ทางไปห้องน้ำ-ที่ทิ้งขยะ-ออฟฟิศ
// ==========================================
function formatAgo(value) {
    const t = new Date(value).getTime();
    if (Number.isNaN(t)) return '';
    const mins = Math.round((Date.now() - t) / 60000);
    if (mins < 60) return `${Math.max(1, mins)} นาทีที่แล้ว`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} ชม.ที่แล้ว`;
    const days = Math.round(hours / 24);
    return days < 30 ? `${days} วันที่แล้ว` : formatThaiDate(value);
}

// ล็อกติดกันในคอลัมน์เดียวกัน (บน/ล่าง) — ข้ามช่องเว้น (placeholder)
function neighborsOf(code) {
    const zone = findZoneForStall(code);
    if (!zone) return [];
    for (const column of ZONES_DATA[zone].columns || []) {
        const list = (column.stalls || []).filter((st) => st.status !== 'PLACEHOLDER');
        const idx = list.findIndex((st) => st.code === code);
        if (idx === -1) continue;
        return [list[idx - 1], list[idx + 1]].filter(Boolean);
    }
    return [];
}

// จุดห้องน้ำ/ที่ทิ้งขยะ/ออฟฟิศอยู่จุดเดียวกันด้านล่างผัง (ข้างโซน C ใกล้ทางเข้า-ออก) — บอกทางจากโซนของร้าน
const FACILITIES = {
    restroom: { label: 'ห้องน้ำ', icon: 'fa-restroom' },
    trash: { label: 'จุดทิ้งขยะ', icon: 'fa-dumpster' },
    office: { label: 'ออฟฟิศตลาด', icon: 'fa-user-tie' }
};
const FACILITY_ROUTE = {
    A: 'เดินลงทางใต้ตามแนวโซน A จนสุด อยู่ข้างโซน C ใกล้ทางเข้า-ออก',
    B: 'เดินลงทางใต้จนสุดโซน B แล้วเลี้ยวซ้ายไปทางโซน C ใกล้ทางเข้า-ออก',
    F: 'เดินลงทางใต้จนสุดโซน F แล้วเลี้ยวซ้ายไปทางโซน C ใกล้ทางเข้า-ออก',
    C: 'อยู่ติดโซน C ด้านทางเข้า-ออก เดินไม่กี่ก้าว',
    D: 'เดินลงทางเดินหลักไปทางใต้จนสุด อยู่ข้างโซน C ใกล้ทางเข้า-ออก',
    E: 'เดินลงทางเดินหลักไปทางใต้จนสุด อยู่ข้างโซน C ใกล้ทางเข้า-ออก',
    X: 'เดินลงทางใต้ผ่านโซน B จนสุด แล้วเลี้ยวซ้ายไปทางโซน C ใกล้ทางเข้า-ออก'
};
const FACILITY_DEFAULT_ROUTE = 'อยู่ด้านล่างของผัง ข้างโซน C ใกล้ทางเข้า-ออก';

function goToFacility(kind, fromZone) {
    hideInfo();
    closeZone();
    const btn = document.querySelector(`.btn-facility-${kind}`);
    if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.classList.remove('facility-ping');
        void btn.offsetWidth;
        btn.classList.add('facility-ping');
        setTimeout(() => btn.classList.remove('facility-ping'), 4000);
    }
    showMapToast(`${FACILITIES[kind].label}: ${FACILITY_ROUTE[fromZone] || FACILITY_DEFAULT_ROUTE}`, 5000);
}

function renderCardExtras(id, d) {
    // โพสต์ล่าสุดของร้านในคอมมูนิตี้
    const postEl = document.getElementById('icPost');
    if (d.post) {
        postEl.innerHTML = `
            <div class="ics-head">โพสต์ล่าสุดของร้าน <small>${escapeHtml(formatAgo(d.post.at))}</small></div>
            <a class="ic-post" href="${VIEWER.isGuest ? '/login' : '/community'}">
                ${d.post.image ? `<img src="${escapeHtml(d.post.image)}" alt="" loading="lazy">` : ''}
                <span>${escapeHtml(d.post.excerpt || 'ดูโพสต์')}</span>
            </a>`;
        postEl.classList.remove('d-none');
    } else {
        postEl.classList.add('d-none');
    }

    // ร้านข้างๆ (กดเพื่อเปิดร้านนั้น) — เจ้าของล็อกเห็นคำเตือนถ้าข้างๆ ขายประเภทเดียวกัน
    const nbEl = document.getElementById('icNeighbors');
    const neighbors = neighborsOf(id).filter((st) => st.status === 'BOOKED' && BOOKING_BY_STALL[st.code]);
    if (neighbors.length) {
        const mine = MY_STALLS.has(id);
        const myTags = new Set(shopTagsOf(d).map((t) => t.toLowerCase()));
        const items = neighbors.map((st) => {
            const nd = BOOKING_BY_STALL[st.code];
            const sameSubtype = d.subtype && nd.subtype && d.subtype === nd.subtype;
            const overlap = shopTagsOf(nd).some((t) => myTags.has(t.toLowerCase()));
            const warn = mine && (sameSubtype || overlap);
            return `<button type="button" class="nb-item${warn ? ' nb-warn' : ''}" data-nb="${escapeHtml(st.code)}">
                <b>${escapeHtml(st.code)}</b><span>${escapeHtml(nd.shop)}</span>
                <small>${escapeHtml(((categoryOf(st.code) || {}).label) || '')}${warn ? ' · ขายคล้ายร้านคุณ' : ''}</small>
            </button>`;
        }).join('');
        nbEl.innerHTML = `<div class="ics-head">ร้านข้างๆ</div><div class="nb-list">${items}</div>`;
        nbEl.querySelectorAll('[data-nb]').forEach((b) => b.addEventListener('click', () => { hideInfo(); openStallDeepLink(b.dataset.nb, true); }));
        nbEl.classList.remove('d-none');
    } else {
        nbEl.classList.add('d-none');
    }

    // ทางไปห้องน้ำ / ที่ทิ้งขยะ / ออฟฟิศ
    const fcEl = document.getElementById('icFacilities');
    const zone = findZoneForStall(id);
    fcEl.innerHTML = `<div class="ics-head">ใกล้ร้านนี้ <small>${escapeHtml(FACILITY_ROUTE[zone] || FACILITY_DEFAULT_ROUTE)}</small></div>
        <div class="fc-list">${Object.keys(FACILITIES).map((k) => `<button type="button" class="fc-btn" data-fc="${k}"><i class="fa-solid ${FACILITIES[k].icon}"></i> ${FACILITIES[k].label}</button>`).join('')}</div>`;
    fcEl.querySelectorAll('[data-fc]').forEach((b) => b.addEventListener('click', () => goToFacility(b.dataset.fc, zone)));
    fcEl.classList.remove('d-none');
}

// ==========================================
// ดูล่าสุด (เก็บในเครื่อง) + สถิติการเปิดดูร้านให้ผู้ขาย (ส่งแบบ beacon ไม่รอผล)
// ==========================================
const RECENT_KEY = 'kangsadan.recentShops';
const RECENT_MAX = 8;
let recentShops = [];
try { recentShops = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { recentShops = []; }

function isRecent(code) {
    const d = BOOKING_BY_STALL[code];
    return !!(d && recentShops.includes(d.shop));
}

function rememberRecent(code) {
    const d = BOOKING_BY_STALL[code];
    if (!d) return;
    recentShops = [d.shop, ...recentShops.filter((name) => name !== d.shop)].slice(0, RECENT_MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentShops)); } catch (e) { /* เขียนไม่ได้ก็ข้าม */ }
    updateQuickTagCounts();
}

const trackedViews = new Set();
function trackView(code, kind) {
    // แอดมิน/staff ไม่นับ, เจ้าของไม่นับร้านตัวเอง, นับครั้งเดียวต่อร้านต่อประเภทต่อการเปิดหน้า
    if (CAN_SEE_VACANCY || MY_STALLS.has(code) || !navigator.sendBeacon) return;
    if (new URLSearchParams(window.location.search).get('demo') === '1') return;
    const key = `${code}:${kind}`;
    if (trackedViews.has(key)) return;
    trackedViews.add(key);
    navigator.sendBeacon('/market-map/track', new Blob([JSON.stringify({ code, kind })], { type: 'application/json' }));
}

// ==========================================
// แอดมิน: สถิติโซน (อัตราเช่า / รายได้คาดการณ์ต่อวัน / สัดส่วนหมวดสินค้า) ในลิ้นชักโซน
// ==========================================
function renderZoneInsights(z) {
    const box = document.getElementById('zoneInsights');
    if (!box || !IS_ADMIN) return;
    const stalls = stallsOfZone(z);
    const booked = stalls.filter((st) => st.status === 'BOOKED');
    const rate = stalls.length ? Math.round((booked.length / stalls.length) * 100) : 0;
    const revenue = booked.reduce((sum, st) => sum + (Number(st.pricePerDay) || 0), 0);
    const potential = stalls.reduce((sum, st) => sum + (st.status === 'MAINTENANCE' ? 0 : (Number(st.pricePerDay) || 0)), 0);
    const catCounts = [...CATEGORIES, OTHER_CATEGORY].map((cat) => ({
        ...cat,
        n: booked.filter((st) => (categoryOf(st.code) || {}).key === cat.key).length
    })).filter((c) => c.n);
    const baht = (v) => `฿${Math.round(v).toLocaleString('th-TH')}`;
    box.innerHTML = `
        <div class="zi-tile"><span>อัตราเช่า</span><b>${rate}%</b><small>${booked.length}/${stalls.length} ล็อก</small></div>
        <div class="zi-tile"><span>รายได้คาดการณ์/วัน</span><b>${baht(revenue)}</b><small>เต็มโซน ${baht(potential)}</small></div>
        <div class="zi-mix">
            <span>สัดส่วนหมวดสินค้า</span>
            <div class="zi-bar" role="img" aria-label="${catCounts.map((c) => `${c.label} ${c.n} ร้าน`).join(', ') || 'ยังไม่มีร้าน'}">
                ${catCounts.map((c) => `<span style="flex:${c.n};background:${c.color}" title="${c.label} ${c.n} ร้าน"></span>`).join('') || '<span class="zi-empty"></span>'}
            </div>
            <div class="zi-legend">${catCounts.map((c) => `<span><i style="background:${c.color}"></i>${c.label} ${c.n}</span>`).join('')}</div>
        </div>`;
}

// ==========================================
// ซูมผังในลิ้นชัก — ปุ่ม +/−/พอดีจอ และถ่าง/หุบสองนิ้วบนมือถือ (จำค่าไว้ในเครื่อง)
// ==========================================
const ZOOM_KEY = 'kangsadan.mapZoom';
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.6;
let zoomLevel = Number(localStorage.getItem(ZOOM_KEY)) || (window.innerWidth < 600 ? 0.8 : 1);

function setZoom(value, persist = true) {
    zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
    if (persist) { try { localStorage.setItem(ZOOM_KEY, String(zoomLevel)); } catch (e) { /* ข้าม */ } }
    applyZoom();
}

function applyZoom() {
    const grid = document.getElementById('stallGrid');
    if (grid) grid.style.zoom = zoomLevel;
    const label = document.getElementById('zoomLabel');
    if (label) label.textContent = `${Math.round(zoomLevel * 100)}%`;
}

function fitZoom() {
    const grid = document.getElementById('stallGrid');
    const wrap = document.getElementById('drawerGrid');
    if (!grid || !wrap) return;
    grid.style.zoom = 1;
    const natural = grid.scrollWidth;
    const avail = wrap.clientWidth - 24;
    setZoom(natural > avail ? Math.max(ZOOM_MIN, Math.floor((avail / natural) * 20) / 20) : 1);
}

(function setupZoom() {
    const ctl = document.getElementById('zoomCtl');
    if (!ctl) return;
    ctl.querySelector('[data-zoom="in"]').addEventListener('click', () => setZoom(zoomLevel + 0.1));
    ctl.querySelector('[data-zoom="out"]').addEventListener('click', () => setZoom(zoomLevel - 0.1));
    ctl.querySelector('[data-zoom="fit"]').addEventListener('click', fitZoom);
    const wrap = document.getElementById('drawerGrid');
    let pinch = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    wrap.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) pinch = { d: dist(e.touches), z: zoomLevel };
    }, { passive: true });
    wrap.addEventListener('touchmove', (e) => {
        if (!pinch || e.touches.length !== 2) return;
        e.preventDefault();
        setZoom(pinch.z * (dist(e.touches) / pinch.d), false);
    }, { passive: false });
    wrap.addEventListener('touchend', () => {
        if (!pinch) return;
        pinch = null;
        setZoom(zoomLevel);
    });
    applyZoom();
})();

// ปุ่มห้องน้ำ/ขยะ/ออฟฟิศบนภาพรวมผัง: บอกตำแหน่ง
document.querySelectorAll('.btn-facility').forEach((btn) => {
    const kind = ['restroom', 'trash', 'office'].find((k) => btn.classList.contains(`btn-facility-${k}`));
    if (kind) btn.addEventListener('click', () => showMapToast(`${FACILITIES[kind].label}: ${FACILITY_DEFAULT_ROUTE}`, 4000));
});

(function setupQrViewer() {
    const viewer = document.getElementById('qrViewer');
    if (!viewer) return;
    viewer.querySelectorAll('[data-qr-close]').forEach((el) => el.addEventListener('click', closeQrViewer));
    document.addEventListener('keydown', (e) => { if (!viewer.hidden && e.key === 'Escape') closeQrViewer(); });
})();

// ป้ายเมนูเด่น (กดแล้วค้นร้านอื่นที่ขายคล้ายกัน) + ปุ่ม "ดูเมนูร้าน" ในการ์ดร้าน
function renderCardMenu(id, d) {
    const tags = shopTagsOf(d);
    const wrap = document.getElementById('icTagsWrap');
    const box = document.getElementById('icTags');
    box.innerHTML = '';
    tags.forEach((tag) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'menu-tag menu-tag-btn';
        chip.textContent = tag;
        chip.title = `ค้นหาร้านที่ขาย "${tag}"`;
        chip.addEventListener('click', () => searchByTag(tag));
        box.appendChild(chip);
    });
    wrap.classList.toggle('d-none', !tags.length);

    const btn = document.getElementById('icMenuBtn');
    const sections = menuSectionsOf(d);
    btn.classList.toggle('d-none', !sections.length);
    const menuCount = (d.menuImages || []).length;
    document.getElementById('icMenuCount').textContent = menuCount ? `${menuCount} รูป` : (tags.length ? `${tags.length} รายการ` : `${(d.photos || []).length} รูป`);
    btn.onclick = () => openMenuViewer(id);
}

// กดป้ายเมนู: ค้นด้วยคำนั้นทั้งตลาด ลิ้นชักโซนยังเปิดอยู่ ร้านที่ตรงในโซนนี้มีกรอบเขียว ส่วนโซนอื่นที่มีร้านตรงจะมีป้ายที่การ์ดโซน
function searchByTag(tag) {
    hideInfo();
    document.getElementById('searchInput').value = tag;
    doSearch(tag);
}

function showVacantInfo(id, zone) {
    document.getElementById('ic-head').textContent = `แผง ${id} — ว่าง`;
    document.getElementById('ic-image').classList.add('d-none');
    document.querySelector('#infoCard .ic-grid').classList.add('d-none');
    document.getElementById('icTagsWrap').classList.add('d-none');
    document.getElementById('icMenuBtn').classList.add('d-none');
    document.getElementById('icNewBadge').classList.add('d-none');
    document.getElementById('icOpenBadge').classList.add('d-none');
    document.getElementById('icPromo').classList.add('d-none');
    document.getElementById('icTools').classList.add('d-none');
    document.getElementById('icQuickInspect').innerHTML = '';
    ['icPost', 'icNeighbors', 'icFacilities'].forEach((elId) => document.getElementById(elId).classList.add('d-none'));
    renderRoleActions(id, zone, true);
    document.getElementById('infoCard').classList.add('show');
    document.getElementById('infoCardBackdrop').classList.add('show');
}

function showInfo(id) {
    const d = BOOKING_BY_STALL[id];
    if (!d) return;
    document.querySelector('#infoCard .ic-grid').classList.remove('d-none');
    document.getElementById('icTools').classList.remove('d-none');
    renderRoleActions(id, (findStall(id) && zoneOf(id)) || '', false);
    renderQuickInspect(id);

    document.getElementById('ic-head').textContent = `แผง ${id} — ${d.shop}`;
    document.getElementById('icNewBadge').classList.toggle('d-none', !d.isNew);
    const closedBadge = document.getElementById('icOpenBadge');
    closedBadge.classList.toggle('d-none', !d.closedAt);
    if (d.closedAt) closedBadge.textContent = `ปิดร้านแล้ววันนี้ · ปิดเมื่อ ${formatClock(d.closedAt)} น.`;
    const promoEl = document.getElementById('icPromo');
    promoEl.classList.toggle('d-none', !hasPromo(id));
    if (hasPromo(id)) promoEl.querySelector('span').textContent = d.promo;
    renderCardTools(id);
    renderCardExtras(id, d);
    rememberRecent(id);
    trackView(id, 'card');
    document.getElementById('ic-shop').textContent = d.shop;
    document.getElementById('ic-product').textContent = (categoryOf(id) || {}).label || d.product;
    document.getElementById('ic-detail').textContent = d.productDetail || '-';
    document.getElementById('ic-summary').textContent = d.summary || '';
    document.getElementById('icSummaryWrap').classList.toggle('d-none', !d.summary);
    renderCardMenu(id, d);

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

// ==========================================
// หน้าต่างดูเมนูร้าน — แท็บ: รูปเมนู / รายการเมนู (shopTags) / รูปสินค้า แสดงเฉพาะแท็บที่ร้านมีข้อมูล
// ==========================================
function menuSectionsOf(d) {
    const sections = [];
    const menuImages = (d && d.menuImages) || [];
    const tags = shopTagsOf(d);
    const photos = (d && d.photos) || [];
    if (menuImages.length) sections.push({ key: 'menu', label: 'รูปเมนู', count: menuImages.length, images: menuImages });
    if (tags.length) sections.push({ key: 'items', label: 'รายการเมนู', count: tags.length, items: tags });
    if (photos.length) sections.push({ key: 'photos', label: 'รูปสินค้า', count: photos.length, images: photos });
    return sections;
}

const menuViewer = { code: null, sections: [], section: null, index: 0 };

function openMenuViewer(code) {
    const d = BOOKING_BY_STALL[code];
    const sections = menuSectionsOf(d);
    if (!sections.length) return;
    menuViewer.code = code;
    menuViewer.sections = sections;
    document.getElementById('mvStall').textContent = code;
    document.getElementById('mvTitle').textContent = d.shop;

    const tabs = document.getElementById('mvTabs');
    tabs.innerHTML = '';
    sections.forEach((sec) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'mv-tab';
        tab.dataset.section = sec.key;
        tab.setAttribute('role', 'tab');
        tab.innerHTML = `${sec.label} <span class="mv-tab-count">${sec.count}</span>`;
        tab.addEventListener('click', () => showMenuSection(sec.key));
        tabs.appendChild(tab);
    });
    tabs.classList.toggle('d-none', sections.length < 2);

    showMenuSection(sections[0].key);
    hideStallTooltip();
    trackView(code, 'menu');
    const viewer = document.getElementById('menuViewer');
    viewer.hidden = false;
    document.body.classList.add('mv-open');
    viewer.querySelector('.mv-close').focus();
}

function closeMenuViewer() {
    document.getElementById('menuViewer').hidden = true;
    document.body.classList.remove('mv-open');
    const btn = document.getElementById('icMenuBtn');
    if (btn && !btn.classList.contains('d-none')) btn.focus();
}

function showMenuSection(key) {
    const sec = menuViewer.sections.find((s) => s.key === key);
    if (!sec) return;
    menuViewer.section = sec;
    menuViewer.index = 0;
    document.querySelectorAll('#mvTabs .mv-tab').forEach((tab) => {
        const on = tab.dataset.section === key;
        tab.classList.toggle('active', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    const isList = !!sec.items;
    document.getElementById('mvStage').classList.toggle('d-none', isList);
    document.getElementById('mvThumbs').classList.toggle('d-none', isList || sec.images.length < 2);
    const list = document.getElementById('mvList');
    list.classList.toggle('d-none', !isList);

    if (isList) {
        list.innerHTML = '';
        sec.items.forEach((item) => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mv-item';
            btn.textContent = item;
            btn.title = `ค้นหาร้านที่ขาย "${item}"`;
            btn.addEventListener('click', () => { closeMenuViewer(); searchByTag(item); });
            li.appendChild(btn);
            list.appendChild(li);
        });
        return;
    }

    const thumbs = document.getElementById('mvThumbs');
    thumbs.innerHTML = '';
    sec.images.forEach((url, i) => {
        const t = document.createElement('button');
        t.type = 'button';
        t.className = 'mv-thumb';
        t.setAttribute('aria-label', `${sec.label} รูปที่ ${i + 1}`);
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        t.appendChild(img);
        t.addEventListener('click', () => showMenuImage(i));
        thumbs.appendChild(t);
    });
    showMenuImage(0);
}

function showMenuImage(i) {
    const sec = menuViewer.section;
    if (!sec || !sec.images) return;
    const n = sec.images.length;
    menuViewer.index = (i + n) % n;
    const url = sec.images[menuViewer.index];
    const img = document.getElementById('mvImage');
    img.src = url;
    img.alt = `${sec.label} ${menuViewer.index + 1}`;
    document.getElementById('mvImageLink').href = url;
    document.getElementById('mvCounter').textContent = `${menuViewer.index + 1} / ${n}`;
    document.getElementById('mvPrev').classList.toggle('d-none', n < 2);
    document.getElementById('mvNext').classList.toggle('d-none', n < 2);
    document.querySelectorAll('#mvThumbs .mv-thumb').forEach((t, idx) => t.classList.toggle('active', idx === menuViewer.index));
}

(function setupMenuViewer() {
    const viewer = document.getElementById('menuViewer');
    if (!viewer) return;
    viewer.querySelectorAll('[data-mv-close]').forEach((el) => el.addEventListener('click', closeMenuViewer));
    document.getElementById('mvPrev').addEventListener('click', () => showMenuImage(menuViewer.index - 1));
    document.getElementById('mvNext').addEventListener('click', () => showMenuImage(menuViewer.index + 1));
    document.addEventListener('keydown', (e) => {
        if (viewer.hidden) return;
        if (e.key === 'Escape') closeMenuViewer();
        else if (e.key === 'ArrowLeft') showMenuImage(menuViewer.index - 1);
        else if (e.key === 'ArrowRight') showMenuImage(menuViewer.index + 1);
    });
    // ปัดซ้าย/ขวาบนมือถือเพื่อเปลี่ยนรูป
    const stage = document.getElementById('mvStage');
    let startX = null;
    stage.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        startX = null;
        if (Math.abs(dx) > 40) showMenuImage(menuViewer.index + (dx < 0 ? 1 : -1));
    });
})();

function hideInfo() {
    document.getElementById('infoCard').classList.remove('show');
    document.getElementById('infoCardBackdrop').classList.remove('show');
}
window.hideInfo = hideInfo;

const STATUS_LABELS = {
    EMPTY: 'แผงว่าง',
    BOOKED: 'แผงที่มีร้านค้าแล้ว',
    INSP_ISSUE: 'ร้านที่ตรวจพบปัญหาวันนี้',
    INSP_PENDING: 'ร้านที่ยังไม่ตรวจวันนี้',
    EXP_LAPSED: 'ล็อกที่หมดสิทธิ์แล้ว',
    EXP_SOON: 'ล็อกที่ใกล้หมดสัญญา',
    HAS_MENU: 'ร้านที่มีรูปเมนู',
    NEW: 'ร้านใหม่',
    FAV: 'ร้านโปรดของคุณ',
    RECENT: 'ร้านที่ดูล่าสุด',
    OPEN: 'ร้านที่เปิดอยู่ตอนนี้',
    PROMO: 'ร้านที่มีโปรวันนี้',
    INSP_CLOSED: 'ร้านที่แจ้งปิดร้านวันนี้',
    REP_ANY: 'ล็อกที่มีงานซ่อมค้าง'
};

function refreshFilterResults() {
    const badge = document.getElementById('resultBadge');
    const clrBtn = document.getElementById('clearBtn');

    if (!currentQuery && !currentStatusFilter && !currentCategoryFilter) {
        badge.classList.remove('show');
        clrBtn.classList.remove('show');
        document.querySelectorAll('.zone-block').forEach((el) => el.classList.remove('search-match'));
        document.querySelectorAll('#zoneCards .zone-card').forEach((el) => el.classList.remove('zc-match'));
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
    document.querySelectorAll('#zoneCards .zone-card').forEach((el) => el.classList.toggle('zc-match', mz.has(el.dataset.zone)));

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
    document.querySelectorAll('.qtag, .cat-chip, .lf-btn').forEach((t) => t.classList.remove('active'));
    refreshFilterResults();
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    currentStatusFilter = null;
    currentCategoryFilter = null;
    document.querySelectorAll('.qtag, .cat-chip, .lf-btn').forEach((t) => t.classList.remove('active'));
    doSearch('');
}

function quickStatusFilter(btn, status) {
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.qtag, .cat-chip, .lf-btn').forEach((t) => t.classList.remove('active'));
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
    document.querySelectorAll('.qtag, .cat-chip, .lf-btn').forEach((t) => t.classList.remove('active'));
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
        chip.dataset.cat = cat.key;
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
buildLayerTabs();
renderLayerChrome();
updateQuickTagCounts();
(function setupActions() {
    const mine = document.getElementById('btnMyStall');
    if (mine) {
        if (IS_SELLER && MY_STALLS.size) mine.classList.remove('d-none');
        mine.addEventListener('click', goToMyStall);
    }
    const rnd = document.getElementById('btnRandomFood');
    if (rnd) rnd.addEventListener('click', randomFoodShop);
})();

// คำแนะนำตอนพิมพ์ค้นหา (แบบ Google) — ดู public/js/common/searchSuggest.js
// ดัชนีคำมาจากร้านในผัง: ชื่อร้าน, คำค้นของร้าน (shopTags), คำในรายละเอียดสินค้า และชื่อหมวด
window.createSearchSuggest && createSearchSuggest({
    input: document.getElementById('searchInput'),
    list: document.getElementById('searchSuggest'),
    kinds: {
        shop: { label: 'ร้าน', order: 0, icon: 'fa-store' },
        tag: { label: 'คำค้น', order: 1, popular: true },
        category: { label: 'หมวด', order: 2, icon: 'fa-tag', popular: true },
        product: { label: 'สินค้า', order: 3 }
    },
    buildEntries() {
        const entries = [];
        Object.keys(BOOKING_BY_STALL).forEach((code) => {
            if (!findZoneForStall(code)) return;
            const d = BOOKING_BY_STALL[code];
            entries.push({ label: d.shop, kind: 'shop', stall: code });
            String(d.tags || '').split(',').forEach((t) => entries.push({ label: t, kind: 'tag', stall: code }));
            String(d.productDetail || '').split(/[\s,/]+/).forEach((w) => entries.push({ label: w, kind: 'product', stall: code }));
            // ใส่ชื่อหมวดภาษาอังกฤษ (food/fashion/...) เป็นคำค้นแฝง เผื่อพิมพ์อังกฤษ
            const cat = categoryOf(code);
            if (cat) entries.push({ label: cat.label, kind: 'category', stall: code, alias: cat.key.replace(/_/g, ' ') });
        });
        return entries;
    },
    onSearch: doSearch,
    onPick(it) {
        // เลือกหมวด: ใช้ตัวกรองหมวดเดียวกับปุ่มหมวดสินค้า (ชื่อหมวดในข้อมูลร้านอาจเป็นอังกฤษ ค้นเป็นข้อความจะไม่เจอ)
        if (it.kind === 'category') {
            const cat = [...CATEGORIES, OTHER_CATEGORY].find((c) => c.label === it.label);
            const chip = cat && document.querySelector(`.cat-chip[data-cat="${cat.key}"]`);
            if (chip) {
                if (currentCategoryFilter !== cat.key) toggleCategoryFilter(cat.key, chip);
                return true;
            }
        }
        // เลือกชื่อร้านที่มีล็อกเดียว: ค้นด้วยชื่อร้าน แล้วพาไปที่ล็อกนั้นและเปิดการ์ดร้านเลย
        if (it.kind === 'shop' && it.stalls.size === 1) {
            document.getElementById('searchInput').value = it.label;
            doSearch(it.label);
            hideInfo();
            openStallDeepLink([...it.stalls][0], true);
            return true;
        }
        return false;
    }
});

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
