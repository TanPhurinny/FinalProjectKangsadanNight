/* Slots page interactions */
const ZONES = {
    A: {
        name: 'โซน A',
        sub: 'แฟชั่น / อาหาร',
        cols: [['A1', 19], ['A2', 19], ['A3', 19], ['A4', 21], ['A5', 21], ['A6', 22], ['A7', 22], ['A8', 23], ['A9', 23]],
    },
    B: {
        name: 'โซน B',
        sub: 'อาหาร',
        cols: [['B1', 15], ['B2', 15], ['B3', 15], ['B4', 15], ['B5', 15], ['B6', 15], ['B7', 15], ['B8', 10], ['B9', 10]],
    },
    C: { name: 'โซน C', sub: 'แฟชั่น', cols: [['C1', 12]] },
    D: { name: 'โซน D', sub: 'ฟู้ดทรัค', cols: [['D1', 6], ['D2', 6]] },
    E: { name: 'โซน E', sub: 'แฟชั่น', cols: [['E1', 4]] },
    F: {
        name: 'โซน F',
        sub: 'อาหาร',
        cols: [['F1', 15], ['F2', 15], ['F3', 15], ['F4', 15], ['F5', 15], ['F6', 15], ['F7', 15]],
    },
};

const BOOKED = {
    A205: { shop: 'ร้านเสื้อผ้าวินเทจ', product: 'เสื้อผ้า', name: 'สมชาย รักดี', phone: '082-333-9999', date: '15 ต.ค. 68', note: 'ต้องการไฟเพิ่ม' },
    A306: { shop: 'แฟชั่นเกาหลีสยาม', product: 'เสื้อผ้า', name: 'มาลี สวยงาม', phone: '089-111-2233', date: '14 ต.ค. 68', note: '-' },
    A307: { shop: 'ร้านกระเป๋าหนัง', product: 'กระเป๋า', name: 'ปรีชา ค้าดี', phone: '085-000-1122', date: '12 ต.ค. 68', note: '-' },
    A104: { shop: 'หมูปิ้งป้าแดง', product: 'หมูปิ้ง', name: 'แดง มีสุข', phone: '081-999-3344', date: '16 ต.ค. 68', note: '-' },
    A502: { shop: 'เสื้อยืดสกรีน', product: 'เสื้อผ้า', name: 'ก้อง อินดี้', phone: '091-555-7788', date: '15 ต.ค. 68', note: '-' },
    B205: { shop: 'ของทอดสดใหม่', product: 'ของทอด', name: 'กนิษฐา ขยัน', phone: '089-321-9876', date: '13 ต.ค. 68', note: '-' },
    B306: { shop: 'ขนมไทยโบราณ', product: 'ขนม', name: 'สุนีย์ หวานใจ', phone: '082-100-2020', date: '11 ต.ค. 68', note: '-' },
    B507: { shop: 'ก๋วยเตี๋ยวเรือป้าลี', product: 'ก๋วยเตี๋ยว', name: 'ลี ขายดี', phone: '083-456-7890', date: '15 ต.ค. 68', note: '-' },
    B410: { shop: 'ผัดไทยลุงแสง', product: 'ผัดไทย', name: 'แสง มีฝีมือ', phone: '087-000-5566', date: '14 ต.ค. 68', note: '-' },
    C101: { shop: 'เครื่องดื่มชาไทย', product: 'เครื่องดื่ม', name: 'วิชัย ธุรกิจ', phone: '083-500-6060', date: '16 ต.ค. 68', note: '-' },
    C106: { shop: 'น้ำผลไม้ปั่น', product: 'เครื่องดื่ม', name: 'สิริ แก้วสวย', phone: '088-123-4567', date: '14 ต.ค. 68', note: '-' },
    D101: { shop: 'Burger Truck BKK', product: 'ฟู้ดทรัค', name: 'เอกพล คนขยัน', phone: '089-987-6543', date: '10 ต.ค. 68', note: 'ใช้ไฟเยอะ มีตู้แช่' },
    D204: { shop: 'ไก่ย่างธัญพืช', product: 'ไก่ย่าง', name: 'ประวิทย์ ดีมาก', phone: '084-777-5533', date: '15 ต.ค. 68', note: '-' },
    F201: { shop: 'หมูปิ้งเจ๊จู', product: 'หมูปิ้ง', name: 'สมหญิง ใจดี', phone: '081-234-5678', date: '14 ต.ค. 68', note: 'ใกล้ทางเดินหลัก' },
    F305: { shop: 'ผัดไทยคุณแม่', product: 'ผัดไทย', name: 'วาสนา มีสุข', phone: '086-777-8899', date: '15 ต.ค. 68', note: '-' },
    F406: { shop: 'ก๋วยเตี๋ยวเรือโบราณ', product: 'ก๋วยเตี๋ยว', name: 'ทวีศักดิ์ ดีงาม', phone: '087-654-3210', date: '10 ต.ค. 68', note: '-' },
    F512: { shop: 'ของทอดกรอบทอง', product: 'ของทอด', name: 'อัมพร คีรี', phone: '085-999-1234', date: '12 ต.ค. 68', note: '-' },
    E102: { shop: 'กระโปรงย้อมสี', product: 'เสื้อผ้า', name: 'พิม สุดชิค', phone: '092-333-5555', date: '16 ต.ค. 68', note: '-' },
};

let activeZone = null;
let selectedStall = null;
let currentQuery = '';

function openZone(z) {
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

    const zd = ZONES[z];
    document.getElementById('drawerTitle').textContent = zd.name;
    document.getElementById('drawerSub').textContent = zd.sub;
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

    ZONES[z].cols.forEach(([prefix, count]) => {
        const wrap = document.createElement('div');
        wrap.className = 'col-wrap';

        const lbl = document.createElement('div');
        lbl.className = 'col-lbl';
        lbl.textContent = prefix;
        wrap.appendChild(lbl);

        const col = document.createElement('div');
        col.className = 'stall-col';
        total += count;

        for (let i = 1; i <= count; i++) {
            const id = prefix + i.toString().padStart(2, '0');
            const cell = document.createElement('div');
            cell.className = 'stall-cell';
            cell.textContent = id;
            cell.dataset.stall = id;

            const bk = BOOKED[id];
            if (bk) {
                booked += 1;
                cell.classList.add('booked');
                cell.title = bk.shop;
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showInfo(id);
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
        }

        wrap.appendChild(col);
        grid.appendChild(wrap);
    });

    document.getElementById('drawerStats').innerHTML = `ทั้งหมด <b>${total}</b> ล็อก &nbsp;·&nbsp; จอง <b>${booked}</b> &nbsp;·&nbsp; ว่าง <b>${total - booked}</b>`;
}

function selectEmpty(id, cell) {
    document.querySelectorAll('.stall-cell.selected').forEach((c) => c.classList.remove('selected'));
    cell.classList.add('selected');
    selectedStall = id;
    hideInfo();
}

function showInfo(id) {
    const d = BOOKED[id];
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
    const d = BOOKED[id];
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

    Object.entries(BOOKED).forEach(([id, d]) => {
        if ((d.shop + d.product + d.name + d.note).toLowerCase().includes(currentQuery.toLowerCase())) {
            total += 1;
            mz.add(id.match(/^[A-Z]+/)[0]);
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
