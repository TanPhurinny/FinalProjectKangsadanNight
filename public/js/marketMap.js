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
                BOOKING_BY_STALL[stall.code] = { shop, product, productDetail, tags: productDetail.split(' ').join(','), image: null };
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
        { status: 'ok', problems: [] },
        { status: 'ok', problems: [] },
        { status: 'pending', problems: [] },
        { status: 'issue', problems: ['ไม่มาขาย'] },
        { status: 'ok', problems: [] },
        { status: 'issue', problems: ['ไฟเกิน (เล็ก 2 / ใหญ่ 0)'] },
        { status: 'pending', problems: [] }
    ];
    let n = 0;
    Object.keys(ZONES_DATA).forEach((z) => (ZONES_DATA[z].columns || []).forEach((column) => column.stalls.forEach((stall) => {
        if (stall.status !== 'BOOKED' || INSPECTION.byCode[stall.code]) return;
        INSPECTION.byCode[stall.code] = Object.assign({ cleanlinessPassed: null, checkedAt: null }, DEMO_RESULTS[n % DEMO_RESULTS.length]);
        n += 1;
    })));
}

const INSPECTION_STATUS = {
    ok: { label: 'ตรวจแล้ว ปกติ', short: 'ปกติ', color: '#2e9e5b' },
    issue: { label: 'มีปัญหา', short: 'มีปัญหา', color: '#c0392b' },
    pending: { label: 'ยังไม่ตรวจ', short: 'ยังไม่ตรวจ', color: '#ffe08a' },
    na: { label: 'ยังไม่ชำระเงิน (ไม่ต้องตรวจ)', short: 'ไม่ต้องตรวจ', color: '#fff' }
};

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
                <button type="button" class="qtag lf-btn lf-issue" data-insp-filter="INSP_ISSUE">! มีปัญหา <b>${issue}</b></button>
                <button type="button" class="qtag lf-btn lf-pending" data-insp-filter="INSP_PENDING">ยังไม่ตรวจ <b>${pending}</b></button>`;
        }
    }
};

const LAYER_KEYS = Object.keys(LAYERS).filter((key) => LAYERS[key].available);
const layerParam = new URLSearchParams(window.location.search).get('layer');
// staff ใช้ผังนี้เพื่อตามงานตรวจเป็นหลัก จึงเปิดชั้นผลตรวจเป็นค่าเริ่มต้น — role อื่นเริ่มที่หมวดสินค้า
let currentLayer = LAYER_KEYS.includes(layerParam)
    ? layerParam
    : (IS_STAFF && LAYER_KEYS.includes('inspection') ? 'inspection' : 'category');

function paintStallLayer(cell, code) {
    LAYERS[currentLayer].paint(cell, code);
}

function isInspectionFilter(status) {
    return status === 'INSP_ISSUE' || status === 'INSP_PENDING';
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
        summary.querySelectorAll('[data-insp-filter]').forEach((btn) => {
            if (btn.dataset.inspFilter === currentStatusFilter) btn.classList.add('active');
            btn.addEventListener('click', () => quickStatusFilter(btn, btn.dataset.inspFilter));
        });
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
    // ตัวกรองผลตรวจใช้ได้เฉพาะในชั้นผลตรวจ ออกจากชั้นแล้วล้างทิ้ง ไม่ให้ไฮไลต์ค้างแบบไม่มีปุ่มให้กดปิด
    if (key !== 'inspection' && isInspectionFilter(currentStatusFilter)) currentStatusFilter = null;

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
    } else if (IS_ADMIN || IS_STAFF) {
        if (stall && stall.bookingEndDate) {
            const left = daysLeftUntil(stall.bookingEndDate);
            const leftText = left === null ? '' : left < 0 ? ' (หมดสัญญาแล้ว)' : ` (เหลือ ${left} วัน)`;
            notes.push(`หมดสัญญา ${formatThaiDate(stall.bookingEndDate)}${leftText}`);
        }
        const insp = inspectionOf(id);
        if (insp) {
            const st = INSPECTION_STATUS[insp.status];
            const problems = insp.problems && insp.problems.length ? ` — ${insp.problems.map(escapeHtml).join(', ')}` : '';
            notes.push(`ผลตรวจวันนี้: <b class="insp-note insp-note-${insp.status}">${st.short}</b>${problems}`);
        } else if (HAS_INSPECTION && !isVacant) {
            notes.push(`ผลตรวจวันนี้: <b class="insp-note insp-note-na">${INSPECTION_STATUS.na.short}</b> — ยังไม่ชำระเงิน`);
        }
        if (IS_ADMIN) actions.push(['/admin/slots', 'จัดการที่หน้าจัดแผง']);
        if (IS_STAFF && !isVacant) actions.push([`/staff/marketinspection?q=${encodeURIComponent(id)}`, insp && insp.status === 'pending' ? 'ไปบันทึกผลตรวจ' : 'ไปหน้าตรวจตลาด']);
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
        renderTooltipTags(shopTagsOf(bk));
        hint = bk && ((bk.menuImages || []).length) ? 'คลิกเพื่อดูรายละเอียดและรูปเมนู' : 'คลิกเพื่อดูรายละเอียด';
        if (currentLayer === 'inspection') {
            const insp = inspectionOf(code);
            const st = INSPECTION_STATUS[insp ? insp.status : 'na'];
            const problems = insp && insp.problems && insp.problems.length ? ` (${insp.problems.join(', ')})` : '';
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
                showInfo(pos.code);
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
        else if (currentCategoryFilter || isInspectionFilter(currentStatusFilter)) cell.classList.add('dimmed');
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
                    showInfo(id);
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
            else if (currentCategoryFilter || isInspectionFilter(currentStatusFilter)) cell.classList.add('dimmed');
            if (!cell.classList.contains('vacant-hidden')) bindStallTooltip(cell, id, stall);
            (isPaired(stall) ? getSmallWrap(stall.groupId) : col).appendChild(cell);
        });

        wrap.appendChild(col);
        grid.appendChild(wrap);
    });

    document.getElementById('drawerStats').innerHTML = drawerStatsHtml(total, booked, maintenance);
}

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

const STATUS_LABELS = { EMPTY: 'แผงว่าง', BOOKED: 'แผงที่มีร้านค้าแล้ว', INSP_ISSUE: 'ร้านที่ตรวจพบปัญหาวันนี้', INSP_PENDING: 'ร้านที่ยังไม่ตรวจวันนี้' };

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
