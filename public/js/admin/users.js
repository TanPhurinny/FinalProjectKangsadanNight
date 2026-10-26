/* ========================================
   หน้าจัดการผู้ใช้งาน (/admin/users)
   ข้อมูลทั้งหมดฝังมาใน #usersData (controller เลือกเฉพาะฟิลด์ที่แสดงได้ ไม่มีรหัสผ่าน)
   กรอง/เรียง/แบ่งหน้าฝั่ง client ทั้งหมด สถานะตัวกรองเก็บใน query string ให้รีเฟรชแล้วอยู่ที่เดิม
   ======================================== */
(function () {
    'use strict';

    const PAGE_SIZE = 25;
    const NEW_DAYS = 30;
    const DAY_MS = 24 * 60 * 60 * 1000;

    const ROLES = {
        ADMIN: { label: 'ผู้ดูแล', icon: 'fa-user-shield', desc: 'เข้าถึงหลังบ้านทั้งหมด รวมถึงจัดการผู้ใช้และสิทธิ์' },
        STAFF: { label: 'พนักงาน', icon: 'fa-user-tie', desc: 'จัดการคำขอ ล็อก งานซ่อม และตรวจตลาด แต่จัดการผู้ใช้ไม่ได้' },
        SELLER: { label: 'ผู้ขาย', icon: 'fa-store', desc: 'จองล็อก จัดการร้านค้า แจ้งซ่อม และแจ้งปิดร้าน' },
        CUSTOMER: { label: 'ลูกค้า', icon: 'fa-user', desc: 'ดูผังตลาด ร้านค้า และคอมมูนิตี้ สมัครเป็นผู้ขายได้' }
    };
    const ROLE_ORDER = ['ADMIN', 'STAFF', 'SELLER', 'CUSTOMER'];
    const FILTERS = {
        shop: (u) => Boolean(u.shop),
        stall: (u) => u.stalls.length > 0,
        new: (u) => u.createdAt && Date.now() - new Date(u.createdAt).getTime() <= NEW_DAYS * DAY_MS,
        incomplete: (u) => !u.phoneNumber || !u.email,
        blacklist: (u) => u.isBlacklisted
    };

    const app = document.getElementById('umApp');
    const meId = Number(app.dataset.me) || null;
    let users = [];
    try {
        users = JSON.parse(document.getElementById('usersData').textContent || '[]');
    } catch (e) {
        users = [];
    }
    const byId = new Map(users.map((u) => [u.id, u]));
    users.forEach((u) => {
        // ข้อความรวมสำหรับค้นหา (ตัวพิมพ์เล็ก + เบอร์แบบตัวเลขล้วน)
        u._search = [
            u.name, u.username, u.email, u.phoneNumber,
            u.phoneNumber ? u.phoneNumber.replace(/\D/g, '') : '',
            u.shop && u.shop.shopName, u.shop && u.shop.productType,
            u.stalls.map((s) => s.code).join(' '), '#' + u.id
        ].filter(Boolean).join(' ').toLowerCase();
    });

    const state = { q: '', role: 'ALL', filters: new Set(), sort: 'role', page: 1 };
    const selected = new Set();
    let visible = [];
    let drawerUserId = null;
    let lastFocus = null;

    const $ = (id) => document.getElementById(id);
    const els = {
        index: $('roleIndex'), search: $('searchInput'), sort: $('sortSelect'), chips: $('filterChips'),
        meta: $('resultMeta'), clear: $('clearFilters'), rows: $('userRows'), empty: $('emptyState'),
        pager: $('pager'), selectPage: $('selectPage'),
        bulk: $('bulkBar'), bulkCount: $('bulkCount'), bulkIds: $('bulkIds'), bulkRole: $('bulkRole'), bulkApply: $('bulkApply'),
        drawer: $('drawer'), drawerScrim: $('drawerScrim'), drawerBody: $('drawerBody'), drawerPos: $('drawerPos'),
        dialog: $('dialog'), dialogScrim: $('dialogScrim'), dialogForm: $('dialogForm'), dialogTitle: $('dialogTitle'),
        dialogBody: $('dialogBody'), dialogConfirm: $('dialogConfirm'), toast: $('toast')
    };

    // ---------- ตัวช่วย ----------
    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ไฮไลต์คำค้นในข้อความ (escape ก่อนเสมอ)
    function mark(value) {
        const text = String(value == null ? '' : value);
        const term = state.q.trim();
        if (!term || term.startsWith('#')) return esc(text);
        const idx = text.toLowerCase().indexOf(term.toLowerCase());
        if (idx < 0) return esc(text);
        return esc(text.slice(0, idx)) + '<mark>' + esc(text.slice(idx, idx + term.length)) + '</mark>' + esc(text.slice(idx + term.length));
    }

    function fmtDate(iso, opts) {
        if (!iso) return '-';
        return new Date(iso).toLocaleDateString('th-TH', opts || { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function relative(iso) {
        if (!iso) return '';
        const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
        if (days <= 0) return 'วันนี้';
        if (days === 1) return 'เมื่อวาน';
        if (days < 30) return days + ' วันก่อน';
        if (days < 365) return Math.floor(days / 30) + ' เดือนก่อน';
        return Math.floor(days / 365) + ' ปีก่อน';
    }

    function daysUntil(iso) {
        if (!iso) return null;
        const end = new Date(iso);
        end.setHours(23, 59, 59, 999);
        return Math.ceil((end.getTime() - Date.now()) / DAY_MS);
    }

    function age(iso) {
        if (!iso) return null;
        const b = new Date(iso);
        const now = new Date();
        let years = now.getFullYear() - b.getFullYear();
        if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) years--;
        return years >= 0 && years < 130 ? years : null;
    }

    function initial(name) {
        return esc((String(name || '?').trim().charAt(0) || '?').toUpperCase());
    }

    function avatar(u, size) {
        const cls = 'um-avatar um-avatar--' + u.role.toLowerCase() + (size ? ' um-avatar--' + size : '');
        if (u.avatarUrl) {
            return '<span class="' + cls + '"><img src="' + esc(u.avatarUrl) + '" alt="" loading="lazy" onerror="this.remove()">' + initial(u.name) + '</span>';
        }
        return '<span class="' + cls + '">' + initial(u.name) + '</span>';
    }

    function roleTag(role) {
        const r = ROLES[role] || ROLES.CUSTOMER;
        return '<span class="um-role um-role--' + role.toLowerCase() + '"><i class="fa-solid ' + r.icon + '"></i>' + r.label + '<small>' + role + '</small></span>';
    }

    function toast(message, kind) {
        els.toast.className = 'um-toast' + (kind ? ' um-toast--' + kind : '');
        els.toast.innerHTML = '<i class="fa-solid ' + (kind === 'danger' ? 'fa-circle-exclamation' : 'fa-circle-check') + '"></i> ' + esc(message);
        els.toast.hidden = false;
        clearTimeout(toast._t);
        toast._t = setTimeout(() => { els.toast.hidden = true; }, 3200);
    }

    function copy(text, label) {
        const done = () => toast('คัดลอก' + (label ? label : '') + 'แล้ว');
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        } else {
            fallbackCopy(text, done);
        }
    }

    function fallbackCopy(text, done) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('คัดลอกไม่สำเร็จ', 'danger'); }
        ta.remove();
    }

    // ---------- สถานะใน URL ----------
    function readUrl() {
        const p = new URLSearchParams(location.search);
        state.q = p.get('q') || '';
        state.role = ROLE_ORDER.includes(p.get('role')) ? p.get('role') : 'ALL';
        state.sort = ['role', 'name', 'newest', 'oldest', 'activity'].includes(p.get('sort')) ? p.get('sort') : 'role';
        state.filters = new Set((p.get('f') || '').split(',').filter((f) => FILTERS[f]));
        state.page = Math.max(1, parseInt(p.get('page'), 10) || 1);
    }

    function writeUrl() {
        const p = new URLSearchParams();
        if (state.q) p.set('q', state.q);
        if (state.role !== 'ALL') p.set('role', state.role);
        if (state.filters.size) p.set('f', [...state.filters].join(','));
        if (state.sort !== 'role') p.set('sort', state.sort);
        if (state.page > 1) p.set('page', state.page);
        const qs = p.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }

    // ---------- กรอง/เรียง ----------
    function matchesBase(u) {
        const q = state.q.trim().toLowerCase();
        if (q) {
            const idMatch = q.match(/^#(\d+)$/);
            if (idMatch ? u.id !== Number(idMatch[1]) : !u._search.includes(q)) return false;
        }
        for (const f of state.filters) if (!FILTERS[f](u)) return false;
        return true;
    }

    function compare(a, b) {
        switch (state.sort) {
            case 'name': return a.name.localeCompare(b.name, 'th');
            case 'newest': return (b.createdAt || '').localeCompare(a.createdAt || '');
            case 'oldest': return (a.createdAt || '').localeCompare(b.createdAt || '');
            case 'activity': return b.counts.bookingRequests - a.counts.bookingRequests || a.name.localeCompare(b.name, 'th');
            default: return ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name, 'th');
        }
    }

    // ---------- วาดหน้า ----------
    function renderIndex(base) {
        const counts = { ALL: base.length };
        ROLE_ORDER.forEach((r) => { counts[r] = base.filter((u) => u.role === r).length; });
        const cells = [{ key: 'ALL', label: 'ทั้งหมด', icon: 'fa-users' }].concat(ROLE_ORDER.map((r) => ({ key: r, label: ROLES[r].label, icon: ROLES[r].icon })));
        els.index.innerHTML = cells.map((c) => {
            const share = counts.ALL ? Math.round((counts[c.key] / counts.ALL) * 100) : 0;
            const active = state.role === c.key;
            return '<button type="button" class="um-index-cell um-index-cell--' + c.key.toLowerCase() + (active ? ' is-active' : '') + '" data-role="' + c.key + '" aria-pressed="' + active + '">'
                + '<span class="um-index-label"><i class="fa-solid ' + c.icon + '"></i>' + c.label + (c.key !== 'ALL' ? '<small>' + c.key + '</small>' : '') + '</span>'
                + '<span class="um-index-num">' + counts[c.key].toLocaleString('th-TH') + '</span>'
                + '<span class="um-index-bar"><span style="width:' + (c.key === 'ALL' ? 100 : share) + '%"></span></span>'
                + '<span class="um-index-share">' + (c.key === 'ALL' ? 'สมาชิกตามตัวกรอง' : share + '% ของทั้งหมด') + '</span>'
                + '</button>';
        }).join('');
    }

    function renderChips() {
        els.chips.querySelectorAll('.um-chip').forEach((chip) => {
            const f = chip.dataset.filter;
            const on = state.filters.has(f);
            chip.classList.toggle('is-active', on);
            chip.setAttribute('aria-pressed', on);
            chip.querySelector('b').textContent = users.filter(FILTERS[f]).length;
        });
    }

    function contactCell(u) {
        const parts = [];
        if (u.phoneNumber) parts.push('<button type="button" class="um-copy" data-copy="' + esc(u.phoneNumber) + '" data-copy-label="เบอร์" title="คัดลอกเบอร์"><i class="fa-solid fa-phone"></i>' + mark(u.phoneNumber) + '</button>');
        if (u.email) parts.push('<button type="button" class="um-copy" data-copy="' + esc(u.email) + '" data-copy-label="อีเมล" title="คัดลอกอีเมล"><i class="fa-solid fa-envelope"></i><span class="um-ellipsis">' + mark(u.email) + '</span></button>');
        if (!parts.length) return '<span class="um-muted">ไม่มีข้อมูลติดต่อ</span>';
        return parts.join('');
    }

    function shopCell(u) {
        if (!u.shop && !u.stalls.length) return '<span class="um-muted">—</span>';
        let html = '';
        if (u.shop) {
            html += '<div class="um-shop-name">' + (u.shop.isVerified ? '<i class="fa-solid fa-circle-check um-verified" title="ร้านยืนยันแล้ว"></i>' : '')
                + mark(u.shop.shopName || 'ร้านยังไม่ตั้งชื่อ') + '</div>';
        }
        if (u.stalls.length) {
            html += '<div class="um-stall-list">' + u.stalls.map((s) => {
                const left = daysUntil(s.endDate);
                const warn = left !== null && left <= 7;
                return '<span class="um-stall' + (warn ? ' is-warn' : '') + '" title="' + (s.endDate ? 'หมดสัญญา ' + fmtDate(s.endDate) : '') + '">' + mark(s.code) + '</span>';
            }).join('') + '</div>';
        }
        return html;
    }

    function rowHtml(u) {
        const isMe = u.id === meId;
        const isNew = FILTERS.new(u);
        const checked = selected.has(u.id);
        return '<div class="um-row' + (checked ? ' is-selected' : '') + (u.isBlacklisted ? ' is-blacklisted' : '') + '" data-id="' + u.id + '" tabindex="0" role="row" aria-label="เปิดรายละเอียด ' + esc(u.name) + '">'
            + '<label class="um-check" data-stop><input type="checkbox" data-select="' + u.id + '"' + (checked ? ' checked' : '') + (isMe ? ' disabled title="เลือกบัญชีตัวเองไม่ได้"' : '') + ' aria-label="เลือก ' + esc(u.name) + '"></label>'
            + '<div class="um-member">' + avatar(u)
            + '<div class="um-member-text"><div class="um-name">' + mark(u.name)
            + (isMe ? '<span class="um-flag um-flag--me">คุณ</span>' : '')
            + (isNew ? '<span class="um-flag um-flag--new">ใหม่</span>' : '')
            + (u.isBlacklisted ? '<span class="um-flag um-flag--danger">แบล็กลิสต์</span>' : '')
            + '</div><div class="um-username">@' + mark(u.username) + ' <span>#' + u.id + '</span></div></div></div>'
            + '<div class="um-contact" data-stop>' + contactCell(u) + '</div>'
            + '<div class="um-role-cell">' + roleTag(u.role) + '</div>'
            + '<div class="um-shop">' + shopCell(u) + '</div>'
            + '<div class="um-joined"><span>' + fmtDate(u.createdAt) + '</span><small>' + relative(u.createdAt) + '</small></div>'
            + '<div class="um-col-actions" data-stop>'
            + '<button type="button" class="um-icon-btn" data-action="role" data-id="' + u.id + '" title="เปลี่ยนบทบาท" aria-label="เปลี่ยนบทบาท ' + esc(u.name) + '"><i class="fa-solid fa-user-gear"></i></button>'
            + '<button type="button" class="um-icon-btn um-icon-btn--danger" data-action="delete" data-id="' + u.id + '" title="ลบผู้ใช้" aria-label="ลบ ' + esc(u.name) + '"' + (isMe ? ' disabled' : '') + '><i class="fa-solid fa-trash-can"></i></button>'
            + '</div></div>';
    }

    function renderPager(pages) {
        if (pages <= 1) { els.pager.innerHTML = ''; return; }
        const items = [];
        const add = (p) => items.push('<button type="button" class="um-page-btn' + (p === state.page ? ' is-active' : '') + '" data-page="' + p + '"' + (p === state.page ? ' aria-current="page"' : '') + '>' + p + '</button>');
        items.push('<button type="button" class="um-page-btn" data-page="' + (state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + ' aria-label="หน้าก่อน"><i class="fa-solid fa-chevron-left"></i></button>');
        for (let p = 1; p <= pages; p++) {
            if (p === 1 || p === pages || Math.abs(p - state.page) <= 1) add(p);
            else if (Math.abs(p - state.page) === 2) items.push('<span class="um-page-gap">…</span>');
        }
        items.push('<button type="button" class="um-page-btn" data-page="' + (state.page + 1) + '"' + (state.page === pages ? ' disabled' : '') + ' aria-label="หน้าถัดไป"><i class="fa-solid fa-chevron-right"></i></button>');
        els.pager.innerHTML = items.join('');
    }

    function render() {
        const base = users.filter(matchesBase);
        renderIndex(base);
        renderChips();
        visible = base.filter((u) => state.role === 'ALL' || u.role === state.role).sort(compare);

        const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
        if (state.page > pages) state.page = pages;
        const start = (state.page - 1) * PAGE_SIZE;
        const pageRows = visible.slice(start, start + PAGE_SIZE);

        els.rows.innerHTML = pageRows.map(rowHtml).join('');
        els.empty.hidden = visible.length > 0;
        els.meta.innerHTML = visible.length
            ? 'แสดง <b>' + (start + 1) + '–' + (start + pageRows.length) + '</b> จาก <b>' + visible.length.toLocaleString('th-TH') + '</b> คน'
                + (visible.length !== users.length ? ' <span class="um-muted">(ทั้งระบบ ' + users.length.toLocaleString('th-TH') + ' คน)</span>' : '')
            : 'ไม่พบผู้ใช้';
        els.clear.hidden = !(state.q || state.role !== 'ALL' || state.filters.size);
        renderPager(pages);
        syncSelectPage(pageRows);
        writeUrl();
    }

    // ---------- เลือกหลายคน ----------
    function selectableOnPage() {
        return [...els.rows.querySelectorAll('input[data-select]:not(:disabled)')];
    }

    function syncSelectPage() {
        const boxes = selectableOnPage();
        const on = boxes.filter((b) => b.checked).length;
        els.selectPage.checked = boxes.length > 0 && on === boxes.length;
        els.selectPage.indeterminate = on > 0 && on < boxes.length;
        els.selectPage.disabled = boxes.length === 0;
        syncBulk();
    }

    function syncBulk() {
        els.bulk.hidden = selected.size === 0;
        document.body.classList.toggle('has-bulk', selected.size > 0);
        els.bulkCount.textContent = selected.size;
        els.bulkIds.innerHTML = [...selected].map((id) => '<input type="hidden" name="userIds" value="' + id + '">').join('');
        els.bulkApply.disabled = !els.bulkRole.value;
    }

    function setSelected(id, on) {
        if (id === meId) return;
        if (on) selected.add(id); else selected.delete(id);
        const row = els.rows.querySelector('.um-row[data-id="' + id + '"]');
        if (row) row.classList.toggle('is-selected', on);
    }

    // ---------- แผงรายละเอียด ----------
    function drawerHtml(u) {
        const isMe = u.id === meId;
        const yrs = age(u.birthDate);
        const r = ROLES[u.role];
        let html = '<header class="um-dossier">' + avatar(u, 'lg')
            + '<div><h2 class="um-dossier-name" id="drawerName">' + esc(u.name) + '</h2>'
            + '<div class="um-dossier-sub">@' + esc(u.username) + ' · #' + u.id + '</div>'
            + '<div class="um-dossier-tags">' + roleTag(u.role)
            + (isMe ? '<span class="um-flag um-flag--me">บัญชีของคุณ</span>' : '')
            + (FILTERS.new(u) ? '<span class="um-flag um-flag--new">สมาชิกใหม่</span>' : '')
            + '</div></div></header>';

        html += '<div class="um-quick">'
            + (u.phoneNumber ? '<a class="um-quick-btn" href="tel:' + esc(u.phoneNumber.replace(/[^\d+]/g, '')) + '"><i class="fa-solid fa-phone"></i>โทร</a>' : '<span class="um-quick-btn is-off"><i class="fa-solid fa-phone"></i>ไม่มีเบอร์</span>')
            + (u.email ? '<a class="um-quick-btn" href="mailto:' + esc(u.email) + '"><i class="fa-solid fa-envelope"></i>อีเมล</a>' : '<span class="um-quick-btn is-off"><i class="fa-solid fa-envelope"></i>ไม่มีอีเมล</span>')
            + '<button type="button" class="um-quick-btn" data-copy="' + esc(u.username) + '" data-copy-label="ชื่อผู้ใช้"><i class="fa-solid fa-at"></i>คัดลอกชื่อผู้ใช้</button>'
            + (u.stalls.length ? '<a class="um-quick-btn" href="/market-map?stall=' + encodeURIComponent(u.stalls[0].code) + '"><i class="fa-solid fa-map-location-dot"></i>ดูบนผัง</a>' : '')
            + '</div>';

        if (u.isBlacklisted) {
            html += '<div class="um-notice um-notice--danger um-notice--tight"><i class="fa-solid fa-ban"></i><div><b>อยู่ในแบล็กลิสต์</b> ตั้งแต่ ' + fmtDate(u.blacklistedAt)
                + (u.blacklistReason ? '<br>เหตุผล: ' + esc(u.blacklistReason) : '')
                + '<br><a href="/admin/sellers/scores">จัดการที่หน้าคะแนนผู้ขาย →</a></div></div>';
        }

        const field = (label, value, copyVal, copyLabel) => '<div class="um-field"><dt>' + label + '</dt><dd>' + value
            + (copyVal ? ' <button type="button" class="um-mini-copy" data-copy="' + esc(copyVal) + '" data-copy-label="' + copyLabel + '" aria-label="คัดลอก' + copyLabel + '"><i class="fa-regular fa-copy"></i></button>' : '') + '</dd></div>';
        html += '<section class="um-section"><h3 class="um-section-title"><span>01</span>ข้อมูลบัญชี</h3><dl class="um-fields">'
            + field('ชื่อ-นามสกุล', esc(u.name))
            + field('ชื่อผู้ใช้', '<span class="um-strong">' + esc(u.username) + '</span>', u.username, 'ชื่อผู้ใช้')
            + field('เบอร์โทรศัพท์', u.phoneNumber ? esc(u.phoneNumber) : '<span class="um-muted">ไม่ระบุ</span>', u.phoneNumber, 'เบอร์')
            + field('อีเมล', u.email ? '<span class="um-break">' + esc(u.email) + '</span>' : '<span class="um-muted">ไม่ระบุ</span>', u.email, 'อีเมล')
            + field('วันเกิด', u.birthDate ? fmtDate(u.birthDate, { day: 'numeric', month: 'long', year: 'numeric' }) + (yrs !== null ? ' <span class="um-muted">(' + yrs + ' ปี)</span>' : '') : '<span class="um-muted">ไม่ระบุ</span>')
            + field('สมัครเมื่อ', fmtDate(u.createdAt, { day: 'numeric', month: 'long', year: 'numeric' }) + ' <span class="um-muted">· ' + relative(u.createdAt) + '</span>')
            + '</dl></section>';

        html += '<section class="um-section"><h3 class="um-section-title"><span>02</span>ร้านค้าและล็อก</h3>';
        if (u.shop) {
            html += '<div class="um-shop-card">'
                + (u.shop.image ? '<img src="' + esc(u.shop.image) + '" alt="" loading="lazy" onerror="this.remove()">' : '<span class="um-shop-ph"><i class="fa-solid fa-store"></i></span>')
                + '<div><div class="um-strong">' + esc(u.shop.shopName || 'ร้านยังไม่ตั้งชื่อ')
                + (u.shop.isVerified ? ' <i class="fa-solid fa-circle-check um-verified" title="ร้านยืนยันแล้ว"></i>' : '') + '</div>'
                + '<div class="um-muted">' + esc([u.shop.productType, u.shop.productSubtype].filter(Boolean).join(' · ') || 'ยังไม่ระบุประเภทสินค้า') + '</div>'
                + (u.shop.productDetail ? '<p class="um-shop-detail">' + esc(u.shop.productDetail) + '</p>' : '')
                + '</div></div>';
        } else {
            html += '<p class="um-muted um-pad">ยังไม่ได้ลงทะเบียนร้านค้า</p>';
        }
        if (u.stalls.length) {
            html += '<ul class="um-stall-rows">' + u.stalls.map((s) => {
                const left = daysUntil(s.endDate);
                let status = '<span class="um-muted">ไม่มีวันหมดสัญญา</span>';
                if (left !== null) {
                    status = left < 0 ? '<span class="um-danger">เลยกำหนด</span>'
                        : '<span class="' + (left <= 7 ? 'um-warn' : 'um-muted') + '">หมด ' + fmtDate(s.endDate) + ' · อีก ' + left + ' วัน</span>';
                }
                return '<li><b class="um-stall">' + esc(s.code) + '</b>' + status + '<a href="/market-map?stall=' + encodeURIComponent(s.code) + '" class="um-link">ผัง <i class="fa-solid fa-arrow-right"></i></a></li>';
            }).join('') + '</ul>';
        }
        html += '</section>';

        const stat = (n, label, href) => '<' + (href ? 'a href="' + href + '"' : 'div') + ' class="um-stat"><b>' + n + '</b><span>' + label + '</span></' + (href ? 'a' : 'div') + '>';
        html += '<section class="um-section"><h3 class="um-section-title"><span>03</span>กิจกรรมในระบบ</h3><div class="um-stats">'
            + stat(u.counts.bookingRequests, 'คำขอจองล็อก')
            + stat(u.counts.repairs, 'แจ้งซ่อม')
            + stat(u.counts.posts, 'โพสต์คอมมูนิตี้')
            + stat(u.counts.eventBooths, 'คำขอบูธกิจกรรม')
            + '</div></section>';

        html += '<section class="um-section" id="roleSection"><h3 class="um-section-title"><span>04</span>บทบาทและสิทธิ์</h3>'
            + '<form action="/admin/users/update-role" method="POST" class="um-role-form">'
            + '<input type="hidden" name="userId" value="' + u.id + '">'
            + '<div class="um-role-options">' + ROLE_ORDER.map((key) => {
                const disabled = isMe && key !== 'ADMIN';
                return '<label class="um-role-option um-role-option--' + key.toLowerCase() + (disabled ? ' is-disabled' : '') + '">'
                    + '<input type="radio" name="newRole" value="' + key + '"' + (u.role === key ? ' checked' : '') + (disabled ? ' disabled' : '') + '>'
                    + '<span class="um-role-option-body"><span class="um-role-option-head"><i class="fa-solid ' + ROLES[key].icon + '"></i>' + ROLES[key].label + '<small>' + key + '</small>'
                    + (u.role === key ? '<em>ปัจจุบัน</em>' : '') + '</span><span class="um-role-option-desc">' + ROLES[key].desc + '</span></span></label>';
            }).join('') + '</div>'
            + (isMe ? '<p class="um-hint"><i class="fa-solid fa-lock"></i> ลดสิทธิ์บัญชีตัวเองไม่ได้ เพื่อกันล็อกตัวเองออกจากหลังบ้าน</p>' : '')
            + '<button type="submit" class="um-btn um-btn--block" disabled data-role-submit>เลือกบทบาทใหม่เพื่อบันทึก</button>'
            + '</form></section>';

        if (!isMe) {
            html += '<section class="um-section um-danger-zone"><h3 class="um-section-title"><span>05</span>ลบบัญชี</h3>'
                + '<p class="um-muted">ลบแล้วกู้คืนไม่ได้ ร้านค้าและข้อมูลที่ผูกกับบัญชีนี้จะถูกลบไปด้วย</p>'
                + '<button type="button" class="um-btn um-btn--danger-ghost" data-action="delete" data-id="' + u.id + '"><i class="fa-solid fa-trash-can"></i> ลบผู้ใช้นี้</button></section>';
        }
        return html;
    }

    function openDrawer(id, focusRole) {
        const u = byId.get(id);
        if (!u) return;
        if (els.drawer.hidden) lastFocus = document.activeElement;
        drawerUserId = id;
        els.drawerBody.innerHTML = drawerHtml(u);
        const pos = visible.findIndex((v) => v.id === id);
        els.drawerPos.textContent = pos >= 0 ? (pos + 1) + ' / ' + visible.length : '';
        els.drawer.querySelector('[data-action="prev"]').disabled = pos <= 0;
        els.drawer.querySelector('[data-action="next"]').disabled = pos < 0 || pos >= visible.length - 1;
        els.drawer.hidden = false;
        els.drawerScrim.hidden = false;
        document.body.classList.add('um-lock');
        requestAnimationFrame(() => els.drawer.classList.add('is-open'));
        els.rows.querySelectorAll('.um-row.is-current').forEach((r) => r.classList.remove('is-current'));
        const row = els.rows.querySelector('.um-row[data-id="' + id + '"]');
        if (row) row.classList.add('is-current');
        history.replaceState(null, '', location.pathname + location.search + '#user-' + id);

        const form = els.drawerBody.querySelector('.um-role-form');
        const submit = form.querySelector('[data-role-submit]');
        form.addEventListener('change', () => {
            const picked = form.querySelector('input[name="newRole"]:checked');
            const changed = picked && picked.value !== u.role;
            submit.disabled = !changed;
            submit.textContent = changed ? 'บันทึก: เปลี่ยนเป็น' + ROLES[picked.value].label : 'เลือกบทบาทใหม่เพื่อบันทึก';
        });
        if (focusRole) {
            const section = els.drawerBody.querySelector('#roleSection');
            section.scrollIntoView({ block: 'start' });
            const radio = section.querySelector('input:checked') || section.querySelector('input');
            if (radio) radio.focus();
        } else {
            els.drawerBody.scrollTop = 0;
            els.drawer.querySelector('[data-action="close-drawer"]').focus();
        }
    }

    function closeDrawer() {
        if (els.drawer.hidden) return;
        els.drawer.classList.remove('is-open');
        els.drawerScrim.hidden = true;
        document.body.classList.remove('um-lock');
        drawerUserId = null;
        els.rows.querySelectorAll('.um-row.is-current').forEach((r) => r.classList.remove('is-current'));
        history.replaceState(null, '', location.pathname + location.search);
        setTimeout(() => { if (!drawerUserId) els.drawer.hidden = true; }, 200);
        if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    }

    function stepDrawer(dir) {
        const pos = visible.findIndex((v) => v.id === drawerUserId);
        const next = visible[pos + dir];
        if (!next) return;
        // ให้หน้าตารางตามไปหน้าที่คนถัดไปอยู่
        const page = Math.floor((pos + dir) / PAGE_SIZE) + 1;
        if (page !== state.page) { state.page = page; render(); }
        openDrawer(next.id);
    }

    // ---------- กล่องยืนยัน ----------
    function openDialog(opts) {
        els.dialogTitle.textContent = opts.title;
        els.dialogBody.innerHTML = opts.body;
        els.dialogForm.action = opts.action;
        els.dialogConfirm.textContent = opts.confirm;
        els.dialogConfirm.className = 'um-btn' + (opts.danger ? ' um-btn--danger' : '');
        els.dialog.hidden = false;
        els.dialogScrim.hidden = false;
        const gate = els.dialogBody.querySelector('[data-confirm-text]');
        if (gate) {
            els.dialogConfirm.disabled = true;
            gate.addEventListener('input', () => { els.dialogConfirm.disabled = gate.value.trim() !== gate.dataset.confirmText; });
            gate.focus();
        } else {
            els.dialogConfirm.disabled = false;
            els.dialogConfirm.focus();
        }
        els.dialogForm.onsubmit = opts.onSubmit || null;
    }

    function closeDialog() {
        els.dialog.hidden = true;
        els.dialogScrim.hidden = true;
    }

    function confirmDelete(id) {
        const u = byId.get(id);
        if (!u || id === meId) return;
        const extras = [];
        if (u.shop) extras.push('ร้าน "' + esc(u.shop.shopName || 'ไม่มีชื่อ') + '"');
        if (u.stalls.length) extras.push('ล็อกที่ถืออยู่ ' + u.stalls.map((s) => esc(s.code)).join(', '));
        if (u.counts.bookingRequests) extras.push('คำขอจอง ' + u.counts.bookingRequests + ' รายการ');
        openDialog({
            title: 'ลบผู้ใช้ ' + u.name + '?',
            action: '/admin/users/' + u.id + '/delete',
            confirm: 'ลบถาวร',
            danger: true,
            body: '<div class="um-dialog-user">' + avatar(u) + '<div><b>' + esc(u.name) + '</b><div class="um-muted">@' + esc(u.username) + ' · ' + ROLES[u.role].label + '</div></div></div>'
                + '<p>การลบกู้คืนไม่ได้' + (extras.length ? ' และจะกระทบ: ' + extras.join(' · ') : '') + '</p>'
                + '<label class="um-gate"><span>พิมพ์ <code>' + esc(u.username) + '</code> เพื่อยืนยัน</span>'
                + '<input type="text" autocomplete="off" spellcheck="false" data-confirm-text="' + esc(u.username) + '"></label>'
        });
    }

    // ---------- CSV ----------
    function exportCsv(list, label) {
        if (!list.length) { toast('ไม่มีรายชื่อให้ส่งออก', 'danger'); return; }
        const cell = (v) => {
            let s = String(v == null ? '' : v);
            if (/^[=+\-@]/.test(s)) s = "'" + s; // กันสูตรใน Excel
            return '"' + s.replace(/"/g, '""') + '"';
        };
        const head = ['ID', 'ชื่อ', 'ชื่อผู้ใช้', 'บทบาท', 'เบอร์โทร', 'อีเมล', 'ชื่อร้าน', 'ประเภทสินค้า', 'ล็อก', 'แบล็กลิสต์', 'สมัครเมื่อ'];
        const lines = [head.map(cell).join(',')].concat(list.map((u) => [
            u.id, u.name, u.username, u.role, u.phoneNumber, u.email,
            u.shop && u.shop.shopName, u.shop && u.shop.productType,
            u.stalls.map((s) => s.code).join(' '), u.isBlacklisted ? 'ใช่' : '',
            u.createdAt ? u.createdAt.slice(0, 10) : ''
        ].map(cell).join(',')));
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'users-' + label + '-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast('ส่งออก ' + list.length + ' คนแล้ว');
    }

    // ---------- อีเวนต์ ----------
    let searchTimer = null;
    els.search.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { state.q = els.search.value; state.page = 1; render(); }, 120);
    });
    els.sort.addEventListener('change', () => { state.sort = els.sort.value; state.page = 1; render(); });

    els.index.addEventListener('click', (e) => {
        const cell = e.target.closest('[data-role]');
        if (!cell) return;
        state.role = cell.dataset.role;
        state.page = 1;
        render();
    });

    els.chips.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-filter]');
        if (!chip) return;
        const f = chip.dataset.filter;
        if (state.filters.has(f)) state.filters.delete(f); else state.filters.add(f);
        state.page = 1;
        render();
    });

    function clearAll() {
        state.q = '';
        state.role = 'ALL';
        state.filters.clear();
        state.page = 1;
        els.search.value = '';
        render();
    }
    els.clear.addEventListener('click', clearAll);

    els.pager.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-page]');
        if (!btn || btn.disabled) return;
        state.page = Number(btn.dataset.page);
        render();
        document.querySelector('.um-table').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    els.selectPage.addEventListener('change', () => {
        selectableOnPage().forEach((box) => {
            box.checked = els.selectPage.checked;
            setSelected(Number(box.dataset.select), box.checked);
        });
        syncSelectPage();
    });

    els.rows.addEventListener('change', (e) => {
        const box = e.target.closest('input[data-select]');
        if (!box) return;
        setSelected(Number(box.dataset.select), box.checked);
        syncSelectPage();
    });

    els.rows.addEventListener('keydown', (e) => {
        const row = e.target.classList && e.target.classList.contains('um-row') ? e.target : null;
        if (!row) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(Number(row.dataset.id)); }
        if (e.key === 'ArrowDown' && row.nextElementSibling) { e.preventDefault(); row.nextElementSibling.focus(); }
        if (e.key === 'ArrowUp' && row.previousElementSibling) { e.preventDefault(); row.previousElementSibling.focus(); }
    });

    els.bulkRole.addEventListener('change', syncBulk);
    $('bulkClear').addEventListener('click', () => {
        selected.clear();
        els.rows.querySelectorAll('input[data-select]').forEach((b) => { b.checked = false; });
        els.rows.querySelectorAll('.um-row.is-selected').forEach((r) => r.classList.remove('is-selected'));
        syncSelectPage();
    });
    $('bulkExport').addEventListener('click', () => exportCsv(users.filter((u) => selected.has(u.id)), 'selected'));
    $('exportBtn').addEventListener('click', () => exportCsv(visible, state.role === 'ALL' ? 'all' : state.role.toLowerCase()));

    els.bulk.addEventListener('submit', (e) => {
        e.preventDefault();
        const role = els.bulkRole.value;
        if (!role || !selected.size) return;
        const picked = users.filter((u) => selected.has(u.id));
        const changing = picked.filter((u) => u.role !== role);
        const names = changing.slice(0, 6).map((u) => '<li>' + esc(u.name) + ' <span class="um-muted">' + ROLES[u.role].label + ' → ' + ROLES[role].label + '</span></li>').join('');
        openDialog({
            title: 'เปลี่ยนบทบาท ' + selected.size + ' คนเป็น' + ROLES[role].label + '?',
            action: '/admin/users/bulk-role',
            confirm: 'ยืนยันเปลี่ยนบทบาท',
            danger: role === 'ADMIN',
            body: (changing.length
                ? '<ul class="um-dialog-list">' + names + (changing.length > 6 ? '<li class="um-muted">และอีก ' + (changing.length - 6) + ' คน</li>' : '') + '</ul>'
                : '<p>ทุกคนที่เลือกเป็น' + ROLES[role].label + 'อยู่แล้ว</p>')
                + (role === 'ADMIN' ? '<p class="um-danger"><i class="fa-solid fa-triangle-exclamation"></i> ผู้ดูแลเข้าถึงหลังบ้านทั้งหมด รวมถึงลบผู้ใช้คนอื่นได้</p>' : ''),
            onSubmit: (ev) => { ev.preventDefault(); els.bulk.submit(); }
        });
    });

    // คลิกทั่วทั้งหน้า: คัดลอก / เปิดแผง / ปุ่มคำสั่ง
    document.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('[data-copy]');
        if (copyBtn) { e.stopPropagation(); copy(copyBtn.dataset.copy, copyBtn.dataset.copyLabel); return; }

        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            const id = Number(actionBtn.dataset.id);
            switch (actionBtn.dataset.action) {
                case 'role': openDrawer(id, true); return;
                case 'delete': confirmDelete(id); return;
                case 'close-drawer': closeDrawer(); return;
                case 'prev': stepDrawer(-1); return;
                case 'next': stepDrawer(1); return;
                case 'close-dialog': closeDialog(); return;
                case 'clear-filters': clearAll(); return;
            }
        }

        const row = e.target.closest('.um-row[data-id]');
        if (row && !e.target.closest('[data-stop]')) openDrawer(Number(row.dataset.id));
    });
    els.drawerScrim.addEventListener('click', closeDrawer);
    els.dialogScrim.addEventListener('click', closeDialog);

    document.addEventListener('keydown', (e) => {
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (e.key === 'Escape') {
            if (!els.dialog.hidden) { closeDialog(); return; }
            if (!els.drawer.hidden) { closeDrawer(); return; }
            if (document.activeElement === els.search && els.search.value) { els.search.value = ''; state.q = ''; render(); }
            return;
        }
        if (typing || !els.dialog.hidden) return;
        if (e.key === '/' && els.drawer.hidden) { e.preventDefault(); els.search.focus(); els.search.select(); }
        if (!els.drawer.hidden && e.key === 'ArrowLeft') stepDrawer(-1);
        if (!els.drawer.hidden && e.key === 'ArrowRight') stepDrawer(1);
    });

    // ---------- เริ่มต้น ----------
    readUrl();
    els.search.value = state.q;
    els.sort.value = state.sort;
    render();

    const hashMatch = location.hash.match(/^#user-(\d+)$/);
    if (hashMatch && byId.has(Number(hashMatch[1]))) {
        const id = Number(hashMatch[1]);
        const pos = visible.findIndex((v) => v.id === id);
        if (pos >= 0) { state.page = Math.floor(pos / PAGE_SIZE) + 1; render(); }
        openDrawer(id);
    }

    // แจ้งผลจาก redirect แล้วลบ ?success/?error ออกจาก URL กันแจ้งซ้ำตอนรีเฟรช
    if (window.UM_FLASH) toast(window.UM_FLASH);
})();
