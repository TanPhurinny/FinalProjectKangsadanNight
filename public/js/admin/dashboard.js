// แดชบอร์ดแอดมิน: นาฬิกา, ตัวเลขนับขึ้น, tooltip กราฟ/ล็อก, ค้นหาล็อก, ฟีด,
// อัปเดตอัตโนมัติ (ดึงหน้าใหม่แล้วสลับเฉพาะส่วน data-live-id ไม่ต้องรีโหลดทั้งหน้า), ค้นหาเมนู Ctrl+K และคีย์ลัด
document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('dashboardRoot');
    if (!root) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const STORAGE_AUTO = 'adminDashboard.autoRefresh';
    const STORAGE_STALL_FILTER = 'adminDashboard.stallFilter';
    const STORAGE_ZONE_SORT = 'adminDashboard.zoneSort';
    const REFRESH_MS = 60 * 1000;
    let lastUpdatedAt = Date.now();

    const $ = (selector, scope = document) => scope.querySelector(selector);
    const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
    const numberFormat = new Intl.NumberFormat('th-TH');

    function storageGet(key, fallback) {
        try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; }
    }

    function storageSet(key, value) {
        try { localStorage.setItem(key, value); } catch (_) { /* โหมดส่วนตัวบางเบราว์เซอร์ */ }
    }

    // ---------- toast ----------
    const toast = document.getElementById('dbToast');
    let toastTimer = null;
    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
    }

    // ---------- นาฬิกา + คำทักทาย ----------
    const clockEl = document.getElementById('liveClock');
    const dateEl = document.getElementById('liveDate');
    const greetingEl = document.getElementById('greeting');
    function greetingFor(hour) {
        if (hour < 5) return 'ดึกแล้ว';
        if (hour < 12) return 'สวัสดีตอนเช้า';
        if (hour < 17) return 'สวัสดีตอนบ่าย';
        return 'สวัสดีตอนเย็น';
    }
    function tickClock() {
        const now = new Date();
        if (clockEl) clockEl.textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        if (dateEl) dateEl.textContent = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        if (greetingEl) greetingEl.textContent = greetingFor(now.getHours());
    }

    // ---------- เวลาแบบ "x นาทีก่อน" ----------
    function relativeTime(date) {
        const diff = Math.round((Date.now() - date.getTime()) / 1000);
        if (diff < 45) return 'เมื่อสักครู่';
        const minutes = Math.round(diff / 60);
        if (minutes < 60) return `${minutes} นาทีก่อน`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours} ชม.ก่อน`;
        const days = Math.round(hours / 24);
        if (days < 7) return `${days} วันก่อน`;
        return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    }
    function updateRelativeTimes() {
        $$('time[datetime]').forEach((el) => {
            const date = new Date(el.getAttribute('datetime'));
            if (!Number.isNaN(date.getTime())) el.textContent = relativeTime(date);
        });
        const lastUpdatedEl = document.getElementById('lastUpdated');
        if (lastUpdatedEl) lastUpdatedEl.textContent = relativeTime(new Date(lastUpdatedAt));
    }

    // ---------- ตัวเลขนับขึ้น ----------
    function animateCounters(scope = document) {
        $$('.count-up', scope).forEach((el) => {
            const target = Number.parseFloat(el.dataset.target || '0') || 0;
            const decimals = Number.parseInt(el.dataset.decimals || '0', 10);
            const render = (value) => {
                el.textContent = decimals ? value.toFixed(decimals) : numberFormat.format(Math.round(value));
            };
            if (reduceMotion || target === 0) {
                render(target);
                return;
            }
            const start = performance.now();
            const duration = 800;
            const step = (now) => {
                const progress = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                render(target * eased);
                if (progress < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    }

    // ---------- tooltip กราฟรายได้ ----------
    function showChartTip(group) {
        const tip = document.getElementById('chartTip');
        const wrap = group.closest('.chart-wrap');
        if (!tip || !wrap) return;
        const amount = Number(group.dataset.amount || 0);
        const count = Number(group.dataset.count || 0);
        tip.innerHTML = '';
        const strong = document.createElement('strong');
        strong.textContent = `฿${numberFormat.format(amount)}`;
        const label = document.createElement('span');
        label.textContent = `${group.dataset.label} · ${count} คำขอ`;
        tip.append(strong, label);
        const hit = group.querySelector('.bar-hit').getBoundingClientRect();
        const bar = group.querySelector('.bar, .bar-zero').getBoundingClientRect();
        const box = wrap.getBoundingClientRect();
        tip.style.left = `${hit.left - box.left + hit.width / 2}px`;
        tip.style.top = `${bar.top - box.top}px`;
        tip.hidden = false;
    }
    function hideChartTip() {
        const tip = document.getElementById('chartTip');
        if (tip) tip.hidden = true;
    }
    document.addEventListener('mouseover', (event) => {
        const group = event.target.closest('.bar-group');
        if (group) showChartTip(group);
    });
    document.addEventListener('mouseout', (event) => {
        const group = event.target.closest('.bar-group');
        if (group && !group.contains(event.relatedTarget)) hideChartTip();
    });
    document.addEventListener('focusin', (event) => {
        const group = event.target.closest && event.target.closest('.bar-group');
        if (group) showChartTip(group);
    });
    document.addEventListener('focusout', (event) => {
        if (event.target.closest && event.target.closest('.bar-group')) hideChartTip();
    });

    // ---------- tooltip จุดล็อก + ช่อง heatmap ----------
    const dotTip = document.getElementById('dotTip');
    const STATUS_LABEL = { AVAILABLE: 'ว่าง', BOOKED: 'จองแล้ว', MAINTENANCE: 'ซ่อมบำรุง' };
    const TIP_TARGET = '.dot, .heat-cell[data-tip]';
    function showDotTip(el) {
        if (!dotTip) return;
        dotTip.innerHTML = '';
        const strong = document.createElement('strong');
        const label = document.createElement('span');
        if (el.classList.contains('dot')) {
            strong.textContent = el.dataset.code;
            const end = el.dataset.status === 'BOOKED' && el.dataset.end ? ` · ถึง ${el.dataset.end}` : '';
            label.textContent = `${STATUS_LABEL[el.dataset.status] || el.dataset.status}${end}`;
        } else {
            strong.textContent = el.dataset.detail;
            label.textContent = el.dataset.tip;
        }
        dotTip.append(strong, label);
        const rect = el.getBoundingClientRect();
        dotTip.style.left = `${rect.left + rect.width / 2}px`;
        dotTip.style.top = `${rect.top}px`;
        dotTip.hidden = false;
    }
    document.addEventListener('mouseover', (event) => {
        const el = event.target.closest(TIP_TARGET);
        if (el) showDotTip(el);
    });
    document.addEventListener('mouseout', (event) => {
        if (event.target.closest(TIP_TARGET) && dotTip) dotTip.hidden = true;
    });
    document.addEventListener('focusin', (event) => {
        const el = event.target.closest && event.target.closest(TIP_TARGET);
        if (el) showDotTip(el);
    });
    document.addEventListener('focusout', (event) => {
        if (event.target.closest && event.target.closest(TIP_TARGET) && dotTip) dotTip.hidden = true;
    });
    window.addEventListener('scroll', () => { if (dotTip) dotTip.hidden = true; }, { passive: true });

    // ---------- สลับกราฟ/ตาราง ----------
    document.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-view-target]');
        if (!btn) return;
        const panel = btn.closest('.db-panel');
        $$('[data-view-target]', panel).forEach((other) => {
            const active = other === btn;
            other.classList.toggle('active', active);
            other.setAttribute('aria-selected', String(active));
        });
        $$('[data-view]', panel).forEach((view) => { view.hidden = view.id !== btn.dataset.viewTarget; });
    });

    // ---------- กรองฟีด ----------
    let feedFilter = 'all';
    function applyFeedFilter() {
        $$('[data-feed-filter]').forEach((chip) => chip.classList.toggle('active', chip.dataset.feedFilter === feedFilter));
        let visible = 0;
        $$('.feed-item').forEach((item) => {
            const show = feedFilter === 'all' || item.dataset.kind === feedFilter;
            item.hidden = !show;
            if (show) visible += 1;
        });
        const empty = document.getElementById('feedEmpty');
        if (empty) empty.classList.toggle('d-none', visible > 0);
    }
    document.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-feed-filter]');
        if (!chip) return;
        feedFilter = chip.dataset.feedFilter;
        applyFeedFilter();
    });

    // ---------- โซน: ค้นหา / ไฮไลต์สถานะ / เรียง ----------
    const searchInput = document.getElementById('zoneSearchInput');
    const sortSelect = document.getElementById('zoneSortSelect');
    let stallFilter = storageGet(STORAGE_STALL_FILTER, 'all');
    if (sortSelect) sortSelect.value = storageGet(STORAGE_ZONE_SORT, 'order');
    if (sortSelect && !sortSelect.value) sortSelect.value = 'order';

    function applyZoneTools() {
        const grid = document.getElementById('zonesGrid');
        if (!grid) return;
        const term = (searchInput?.value || '').trim().toLowerCase();
        const sortType = sortSelect?.value || 'order';
        const cards = $$('.zone-card', grid);

        $$('[data-stall-filter]').forEach((btn) => btn.classList.toggle('active', btn.dataset.stallFilter === stallFilter));

        let firstHit = null;
        cards.forEach((card) => {
            const match = !term || card.dataset.search.includes(term);
            card.hidden = !match;
            const dotsWrap = $('.stall-dots', card);
            if (!dotsWrap) return;
            const filtering = stallFilter !== 'all' || Boolean(term);
            dotsWrap.classList.toggle('filtering', filtering);
            $$('.dot', dotsWrap).forEach((dot) => {
                const statusOk = stallFilter === 'all' || dot.dataset.status === stallFilter;
                const codeHit = Boolean(term) && dot.dataset.code.toLowerCase().includes(term);
                // ค้นด้วยรหัสล็อก: จางล็อกอื่นในโซนนั้น / ค้นด้วยชื่อโซน: แสดงทุกล็อกตามตัวกรองสถานะ
                const zoneNameHit = term && !$$('.dot', dotsWrap).some((d) => d.dataset.code.toLowerCase().includes(term));
                dot.classList.toggle('match', statusOk && (!term || codeHit || zoneNameHit));
                dot.classList.toggle('hit', codeHit);
                if (codeHit && !firstHit) firstHit = dot;
            });
        });

        const sorters = {
            order: (a, b) => Number(a.dataset.order) - Number(b.dataset.order),
            'occupancy-desc': (a, b) => Number(b.dataset.occupancy) - Number(a.dataset.occupancy),
            'available-desc': (a, b) => Number(b.dataset.available) - Number(a.dataset.available),
            'maintenance-desc': (a, b) => Number(b.dataset.maintenance) - Number(a.dataset.maintenance)
        };
        const empty = document.getElementById('emptyFilteredZone');
        cards.sort(sorters[sortType] || sorters.order).forEach((card) => grid.insertBefore(card, empty));
        if (empty) empty.classList.toggle('d-none', cards.some((card) => !card.hidden));
        return firstHit;
    }

    if (searchInput) {
        searchInput.addEventListener('input', applyZoneTools);
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                const hit = applyZoneTools();
                if (hit) {
                    hit.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
                    hit.focus({ preventScroll: true });
                }
            }
            if (event.key === 'Escape') {
                searchInput.value = '';
                applyZoneTools();
                searchInput.blur();
            }
        });
    }
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            storageSet(STORAGE_ZONE_SORT, sortSelect.value);
            applyZoneTools();
        });
    }
    document.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-stall-filter]');
        if (!btn) return;
        stallFilter = btn.dataset.stallFilter;
        storageSet(STORAGE_STALL_FILTER, stallFilter);
        applyZoneTools();
    });

    // ---------- อัปเดตอัตโนมัติ ----------
    const autoBtn = document.getElementById('autoRefreshBtn');
    const autoState = document.getElementById('autoRefreshState');
    const refreshBtn = document.getElementById('refreshNowBtn');
    let autoTimer = null;
    let refreshing = false;

    function snapshotNumbers(scope) {
        const map = new Map();
        $$('[data-target]', scope).forEach((el, index) => map.set(index, el.dataset.target));
        return map;
    }

    async function refreshData({ silent } = {}) {
        if (refreshing) return;
        refreshing = true;
        refreshBtn?.classList.add('is-loading');
        try {
            const response = await fetch(window.location.pathname, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
            if (!response.ok || response.redirected) throw new Error(`HTTP ${response.status}`);
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            let changed = 0;
            $$('[data-live-id]').forEach((oldRegion) => {
                const fresh = doc.querySelector(`[data-live-id="${oldRegion.dataset.liveId}"]`);
                if (!fresh) return;
                const before = snapshotNumbers(oldRegion);
                oldRegion.replaceWith(fresh);
                // ไฮไลต์ช่องที่ตัวเลขเปลี่ยน ให้เห็นทันทีว่ามีอะไรใหม่
                $$('[data-target]', fresh).forEach((el, index) => {
                    if (before.has(index) && before.get(index) !== el.dataset.target) {
                        changed += 1;
                        (el.closest('.inbox-cell, .db-panel') || el).classList.add('is-changed');
                    }
                });
                $$('.count-up', fresh).forEach((el) => {
                    const target = Number.parseFloat(el.dataset.target || '0') || 0;
                    const decimals = Number.parseInt(el.dataset.decimals || '0', 10);
                    el.textContent = decimals ? target.toFixed(decimals) : numberFormat.format(target);
                });
            });
            // ผังจุดล็อกต้องกรอง/เรียงซ้ำหลังสลับ
            const freshGreeting = doc.querySelector('.db-lede');
            const lede = $('.db-lede');
            if (freshGreeting && lede) lede.innerHTML = freshGreeting.innerHTML;
            const freshExport = doc.getElementById('dashboardExport');
            const oldExport = document.getElementById('dashboardExport');
            if (freshExport && oldExport) oldExport.textContent = freshExport.textContent;
            lastUpdatedAt = Date.now();
            resetNewRequestBaseline();
            applyFeedFilter();
            applyZoneTools();
            updateRelativeTimes();
            scrollChartToLatest();
            if (!silent || changed) showToast(changed ? `อัปเดตแล้ว · มีตัวเลขเปลี่ยน ${changed} จุด` : 'อัปเดตข้อมูลแล้ว');
        } catch (error) {
            showToast('อัปเดตไม่สำเร็จ ลองใหม่อีกครั้ง');
        } finally {
            refreshing = false;
            refreshBtn?.classList.remove('is-loading');
        }
    }

    function setAutoRefresh(on, announce) {
        clearInterval(autoTimer);
        autoTimer = on ? setInterval(() => { if (!document.hidden) refreshData({ silent: true }); }, REFRESH_MS) : null;
        if (autoBtn) autoBtn.setAttribute('aria-pressed', String(on));
        if (autoState) autoState.textContent = on ? '60 วิ' : 'ปิด';
        storageSet(STORAGE_AUTO, on ? '1' : '0');
        if (announce) showToast(on ? 'เปิดอัปเดตอัตโนมัติทุก 60 วินาที' : 'ปิดอัปเดตอัตโนมัติแล้ว');
    }

    autoBtn?.addEventListener('click', () => setAutoRefresh(autoBtn.getAttribute('aria-pressed') !== 'true', true));
    refreshBtn?.addEventListener('click', () => refreshData());
    // กลับมาที่แท็บหลังหายไปนาน ๆ ให้ดึงข้อมูลใหม่ทันที (เฉพาะตอนเปิดอัตโนมัติ)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && autoTimer && Date.now() - lastUpdatedAt > REFRESH_MS) refreshData({ silent: true });
    });

    // ---------- ค้นหาเมนู (Ctrl+K) ----------
    const isAdmin = root.dataset.role === 'ADMIN';
    const PAGES = [
        { label: 'รายการจองรออนุมัติ', href: '/admin/approvals', icon: 'fa-file-signature', keywords: 'อนุมัติ จอง คำขอ สลิป approvals' },
        { label: 'คำร้องแจ้งซ่อม', href: '/admin/requests', icon: 'fa-screwdriver-wrench', keywords: 'ซ่อม แจ้งซ่อม repair' },
        { label: 'จัดการผังแผง', href: '/admin/slots', icon: 'fa-table-cells', keywords: 'ผัง แผง ล็อก slots' },
        { label: 'ล็อกใกล้หมดอายุ', href: '/admin/slots/expiring', icon: 'fa-hourglass-end', keywords: 'หมดอายุ หมดสัญญา ต่อ expiring' },
        { label: 'ผังตลาด', href: '/market-map', icon: 'fa-map', keywords: 'ผังตลาด แผนที่ map' },
        { label: 'ผังตลาด · ผลตรวจวันนี้', href: '/market-map?layer=inspection', icon: 'fa-clipboard-check', keywords: 'ตรวจ inspection' },
        { label: 'ผังตลาด · หมดสัญญา', href: '/market-map?layer=expiry', icon: 'fa-calendar-xmark', keywords: 'สัญญา expiry' },
        { label: 'ผังตลาด · งานซ่อม', href: '/market-map?layer=repair', icon: 'fa-wrench', keywords: 'ซ่อม repair' },
        { label: 'ใบสมัครร้านค้า', href: '/admin/seller-applications', icon: 'fa-id-card', keywords: 'สมัคร ผู้ขาย ร้าน applications' },
        { label: 'คำขอใบกำกับภาษี', href: '/admin/tax-invoice-requests', icon: 'fa-file-invoice', keywords: 'ภาษี ใบกำกับ tax' },
        { label: 'จัดการประกาศ', href: '/admin/announcements', icon: 'fa-bullhorn', keywords: 'ประกาศ announcement' },
        { label: 'แบนเนอร์คอมมูนิตี้', href: '/admin/community-banners', icon: 'fa-images', keywords: 'แบนเนอร์ banner community' },
        { label: 'จัดการผู้ใช้', href: '/admin/users', icon: 'fa-users-cog', keywords: 'ผู้ใช้ สมาชิก users', adminOnly: true },
        { label: 'การมาขายร้านค้า', href: '/admin/sellers/scores', icon: 'fa-calendar-check', keywords: 'คะแนน มาขาย blacklist scores', adminOnly: true },
        { label: 'วันหยุดรอบจอง', href: '/admin/booking-holidays', icon: 'fa-calendar-xmark', keywords: 'วันหยุด holiday', adminOnly: true }
    ].filter((page) => isAdmin || !page.adminOnly);

    const paletteOverlay = document.getElementById('paletteOverlay');
    const paletteInput = document.getElementById('paletteInput');
    const paletteList = document.getElementById('paletteList');
    const shortcutsOverlay = document.getElementById('shortcutsOverlay');
    let paletteResults = [];
    let paletteIndex = 0;
    let lastFocus = null;

    function renderPalette() {
        const term = (paletteInput.value || '').trim().toLowerCase();
        paletteResults = PAGES.filter((page) => !term || `${page.label} ${page.keywords} ${page.href}`.toLowerCase().includes(term));
        paletteIndex = Math.min(paletteIndex, Math.max(0, paletteResults.length - 1));
        paletteList.innerHTML = '';
        if (!paletteResults.length) {
            const li = document.createElement('li');
            li.className = 'pl-empty';
            li.textContent = 'ไม่พบหน้าที่ค้นหา';
            paletteList.appendChild(li);
            return;
        }
        paletteResults.forEach((page, index) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', String(index === paletteIndex));
            li.dataset.index = String(index);
            const icon = document.createElement('i');
            icon.className = `fas ${page.icon}`;
            const label = document.createElement('span');
            label.textContent = page.label;
            const hint = document.createElement('span');
            hint.className = 'pl-hint';
            hint.textContent = page.href;
            li.append(icon, label, hint);
            paletteList.appendChild(li);
        });
        const active = paletteList.querySelector('[aria-selected="true"]');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }

    function openOverlay(overlay) {
        closeOverlays();
        lastFocus = document.activeElement;
        overlay.hidden = false;
        if (overlay === paletteOverlay) {
            paletteInput.value = '';
            paletteIndex = 0;
            renderPalette();
            paletteInput.focus();
        } else {
            const closeBtn = overlay.querySelector('[data-close-overlay]');
            if (closeBtn) closeBtn.focus();
        }
    }

    function closeOverlays() {
        let closed = false;
        [paletteOverlay, shortcutsOverlay].forEach((overlay) => {
            if (overlay && !overlay.hidden) {
                overlay.hidden = true;
                closed = true;
            }
        });
        if (closed && lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
        return closed;
    }

    function goToPalette(index) {
        const page = paletteResults[index];
        if (page) window.location.href = page.href;
    }

    paletteInput?.addEventListener('input', () => { paletteIndex = 0; renderPalette(); });
    paletteInput?.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!paletteResults.length) return;
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            paletteIndex = (paletteIndex + delta + paletteResults.length) % paletteResults.length;
            renderPalette();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            goToPalette(paletteIndex);
        }
    });
    paletteList?.addEventListener('click', (event) => {
        const li = event.target.closest('li[data-index]');
        if (li) goToPalette(Number(li.dataset.index));
    });
    paletteList?.addEventListener('mousemove', (event) => {
        const li = event.target.closest('li[data-index]');
        if (li && Number(li.dataset.index) !== paletteIndex) {
            paletteIndex = Number(li.dataset.index);
            $$('li[data-index]', paletteList).forEach((item) => item.setAttribute('aria-selected', String(item === li)));
        }
    });
    [paletteOverlay, shortcutsOverlay].forEach((overlay) => {
        overlay?.addEventListener('click', (event) => {
            if (event.target === overlay || event.target.closest('[data-close-overlay]')) closeOverlays();
        });
    });
    document.getElementById('paletteBtn')?.addEventListener('click', () => openOverlay(paletteOverlay));
    document.getElementById('shortcutsBtn')?.addEventListener('click', () => openOverlay(shortcutsOverlay));

    // ---------- ปุ่ม "ทำได้เลย" ----------
    // ทุกปุ่มถามยืนยันผ่านกล่องกลาง (dialogs.js) ก่อนเสมอ แล้วเรียก endpoint เดิมของหน้าอนุมัติ/ผังแผง
    // ฝั่ง server เช็คเงื่อนไขซ้ำทีละรายการอยู่แล้ว (เช่น ปล่อยได้เฉพาะล็อกที่หมดสิทธิ์จริง)
    const BULK_LIMIT = 60; // ตรงกับ BULK_STALL_ACTION_LIMIT ใน approvalController

    function confirmDialog(options) {
        return new Promise((resolve) => {
            if (typeof window.showConfirmDialog !== 'function') {
                resolve(false);
                return;
            }
            window.showConfirmDialog({ ...options, onConfirm: () => resolve(true) });
            // กดยกเลิก/ปิดกล่อง = ไม่ทำอะไร promise ค้างไว้เฉยๆ ไม่มีผล
        });
    }

    function alertDialog(options) {
        if (typeof window.showAlertDialog === 'function') window.showAlertDialog(options);
        else showToast(options.message || options.title);
    }

    async function postJson(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        return data;
    }

    async function runBulkStallAction(action, codes) {
        let okCount = 0;
        let failCount = 0;
        for (let i = 0; i < codes.length; i += BULK_LIMIT) {
            const data = await postJson('/admin/slots/bulk-action', { action, stallCodes: codes.slice(i, i + BULK_LIMIT) });
            okCount += data.okCount || 0;
            failCount += data.failCount || 0;
        }
        return { okCount, failCount };
    }

    const QUICK_ACTIONS = {
        'confirm-slips': (btn) => ({
            dialog: {
                title: 'ยืนยันสลิปที่ยอดตรง',
                message: `ยืนยันการชำระเงิน ${btn.dataset.count} คำขอของรอบ ${btn.dataset.round} ที่ระบบตรวจแล้วว่ายอดในสลิปตรงกับยอดที่ต้องจ่าย\nล็อกจะเป็นของผู้ขายทันที`,
                tone: 'success',
                confirmText: 'ยืนยันทั้งหมด'
            },
            run: async () => {
                const data = await postJson('/admin/approvals/confirm-verified-slips', { round: btn.dataset.round });
                return `ยืนยันการชำระเงินแล้ว ${data.confirmed || 0} คำขอ`;
            }
        }),
        notify: (btn) => {
            const codes = btn.dataset.codes.split(',').filter(Boolean);
            return {
                dialog: {
                    title: 'แจ้งเตือนร้านใกล้หมดสัญญา',
                    message: `ส่งแจ้งเตือนในระบบและอีเมลให้ร้านที่เช่าล็อก ${codes.join(', ')} ให้มาต่อสัญญาก่อน 20:00 ของวันสุดท้าย?`,
                    tone: 'neutral',
                    confirmText: 'ส่งแจ้งเตือน'
                },
                run: async () => {
                    const result = await runBulkStallAction('notify', codes);
                    return `ส่งแจ้งเตือนแล้ว ${result.okCount} ร้าน${result.failCount ? ` · ไม่สำเร็จ ${result.failCount} (ไม่พบผู้เช่า)` : ''}`;
                }
            };
        },
        release: (btn) => {
            const codes = btn.dataset.codes.split(',').filter(Boolean);
            const preview = codes.length > 12 ? `${codes.slice(0, 12).join(', ')} และอีก ${codes.length - 12} ล็อก` : codes.join(', ');
            return {
                dialog: {
                    title: `ปล่อยล็อก ${codes.length} ล็อก`,
                    message: `ล็อก ${preview} เลยเส้นตาย 20:00 ของวันสุดท้ายแล้ว จะกลับมาว่างให้จองใหม่ทันที\nตรวจหน้างานแล้วว่าร้านเดิมออกจริงหรือยัง?`,
                    tone: 'danger',
                    confirmText: 'ปล่อยล็อก'
                },
                run: async () => {
                    const result = await runBulkStallAction('release', codes);
                    return `ปล่อยล็อกแล้ว ${result.okCount} ล็อก${result.failCount ? ` · ข้าม ${result.failCount} (ไม่เข้าเงื่อนไขแล้ว)` : ''}`;
                }
            };
        }
    };

    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-action]');
        if (!btn || btn.disabled || !QUICK_ACTIONS[btn.dataset.action]) return;
        const plan = QUICK_ACTIONS[btn.dataset.action](btn);
        const ok = await confirmDialog(plan.dialog);
        if (!ok) return;
        btn.disabled = true;
        try {
            const message = await plan.run();
            await refreshData({ silent: true });
            alertDialog({ title: 'เรียบร้อย', message, tone: 'success' });
        } catch (error) {
            btn.disabled = false;
            alertDialog({ title: 'ทำรายการไม่สำเร็จ', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', tone: 'danger' });
        }
    });

    // ---------- แจ้งเตือนคำขอ/สลิปใหม่ ----------
    // เช็คทุก 30 วินาทีด้วย endpoint เดียวกับหน้ารายการอนุมัติ (เบากว่าดึงทั้งหน้า) — มีของใหม่ขึ้นแถบด้านบน
    // + ตัวเลขบนชื่อแท็บ ให้เห็นแม้เปิดแท็บอื่นอยู่
    const POLL_MS = 30 * 1000;
    const baseTitle = document.title;
    const banner = document.getElementById('newBanner');
    const bannerText = document.getElementById('newBannerText');
    let pollSince = Date.now();
    let baseSlipCount = null;
    let bannerDismissedKey = '';
    let lastBannerKey = '';

    function resetNewRequestBaseline() {
        pollSince = Date.now();
        baseSlipCount = null;
        bannerDismissedKey = '';
        if (banner) banner.hidden = true;
        document.title = baseTitle;
    }

    async function pollNew() {
        try {
            const response = await fetch(`/admin/approvals/poll?since=${pollSince}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            if (!response.ok) return;
            const data = await response.json();
            if (!data.ok) return;
            if (baseSlipCount === null) baseSlipCount = data.slipCount;
            const newSlips = Math.max(0, data.slipCount - baseSlipCount);
            const total = data.newCount + newSlips;
            if (!total) return;
            const key = `${data.newCount}|${newSlips}`;
            lastBannerKey = key;
            const parts = [];
            if (data.newCount) parts.push(`คำขอจองใหม่ ${data.newCount} รายการ`);
            if (newSlips) parts.push(`สลิปใหม่ ${newSlips} ใบ`);
            document.title = `(${total}) ${baseTitle}`;
            if (key !== bannerDismissedKey && banner && bannerText) {
                const wasHidden = banner.hidden;
                bannerText.textContent = `มี${parts.join(' และ ')} ตั้งแต่เปิดหน้านี้`;
                banner.hidden = false;
                if (wasHidden) showToast(bannerText.textContent);
            }
        } catch (_) { /* เครือข่ายหลุดชั่วคราว รอรอบถัดไป */ }
    }

    document.getElementById('newBannerRefresh')?.addEventListener('click', () => refreshData());
    // ปิดแถบ = รับทราบชุดตัวเลขนี้แล้ว มีของใหม่เพิ่มอีกค่อยขึ้นใหม่
    document.getElementById('newBannerClose')?.addEventListener('click', () => {
        banner.hidden = true;
        bannerDismissedKey = lastBannerKey;
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && banner && banner.hidden) document.title = baseTitle;
    });

    // ---------- ส่งออก CSV / พิมพ์ ----------
    function readExport() {
        try { return JSON.parse(document.getElementById('dashboardExport').textContent); } catch (_) { return null; }
    }

    function csvCell(value) {
        const text = value === null || value === undefined ? '' : String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function downloadCsv() {
        const data = readExport();
        if (!data) {
            showToast('ไม่มีข้อมูลให้ดาวน์โหลด');
            return;
        }
        const rows = [];
        const section = (title, header, body) => {
            rows.push([title]);
            rows.push(header);
            body.forEach((row) => rows.push(row));
            rows.push([]);
        };
        rows.push(['สรุปแดชบอร์ดตลาดกังสดาลไนท์', new Date(data.generatedAt || Date.now()).toLocaleString('th-TH')]);
        rows.push([]);
        section('รายได้ที่ยืนยันแล้วรายวัน', ['วันที่', 'จำนวนคำขอ', 'ยอด (บาท)'], data.revenueDays.map((d) => [d.key, d.count, d.amount]));
        section('รายได้แยกประเภท (14 วัน)', ['ประเภท', 'ยอด (บาท)'], data.revenueByType.map((t) => [t.label, t.amount]));
        section('รายได้แยกโซน (14 วัน)', ['โซน', 'จำนวนคำขอ', 'ยอด (บาท)'], data.revenueByZone.map((z) => [z.zone, z.count, z.amount]));
        if (data.forecast) {
            const f = data.forecast;
            section(`คาดการณ์รายได้รอบ ${f.roundNumber}`, ['สถานะ', 'จำนวนคำขอ', 'ยอด (บาท)'], [
                ['ยืนยันแล้ว', f.confirmed.count, f.confirmed.amount],
                ['จัดล็อกแล้ว รอโอน', f.awaiting.count, f.awaiting.amount],
                ['ยังไม่จัดล็อก', f.unassigned.count, f.unassigned.amount],
                ['รวมที่เป็นไปได้', '', f.potential]
            ]);
        }
        section('สถานะรายโซน', ['โซน', 'ชื่อ', 'ทั้งหมด', 'จองแล้ว', 'ว่าง', 'ซ่อมบำรุง', 'จองแล้ว (%)'],
            data.zones.map((z) => [z.code, z.name, z.total, z.booked, z.available, z.maintenance, z.occupancyRate]));
        section('ผลตรวจตลาด 7 วัน (ตรวจ/พบปัญหา)', ['โซน', ...data.inspectionDays],
            data.inspection.map((r) => [r.code, ...r.cells.map((c) => (c.inspected ? `${c.inspected}/${c.problems}` : '-'))]));
        section('ร้านที่คนเปิดดูมากสุด 7 วัน', ['ร้าน', 'ล็อก', 'รวม', 'เปิดการ์ด', 'ดูเมนู', 'แชร์'],
            data.topShops.map((t) => [t.shopName, t.stallCode, t.total, t.card, t.menu, t.share]));

        // BOM ให้ Excel อ่านภาษาไทยถูก
        const csv = '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.download = `kangsadan-dashboard-${stamp}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('ดาวน์โหลด CSV แล้ว');
    }

    document.getElementById('csvBtn')?.addEventListener('click', downloadCsv);
    document.getElementById('printBtn')?.addEventListener('click', () => window.print());

    // ---------- คีย์ลัด ----------
    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            if (paletteOverlay.hidden) openOverlay(paletteOverlay);
            else closeOverlays();
            return;
        }
        if (event.key === 'Escape') {
            if (closeOverlays()) event.preventDefault();
            return;
        }
        const target = event.target;
        const typing = target.closest && target.closest('input, textarea, select, [contenteditable="true"]');
        const overlayOpen = !paletteOverlay.hidden || !shortcutsOverlay.hidden;
        if (typing || overlayOpen || event.ctrlKey || event.metaKey || event.altKey) return;

        if (event.key === '/') {
            event.preventDefault();
            searchInput?.focus();
            searchInput?.select();
        } else if (event.key === '?') {
            openOverlay(shortcutsOverlay);
        } else if (event.key === 'r' || event.key === 'R') {
            refreshData();
        } else if (event.key === 'e' || event.key === 'E') {
            downloadCsv();
        } else if (event.key === 'p' || event.key === 'P') {
            window.print();
        } else if (event.key === 'a' || event.key === 'A') {
            setAutoRefresh(autoBtn?.getAttribute('aria-pressed') !== 'true', true);
        } else if (/^[1-6]$/.test(event.key)) {
            const cell = document.querySelector(`.inbox-cell[data-shortcut-index="${event.key}"]`);
            if (cell) window.location.href = cell.getAttribute('href');
        }
    });

    // จอเล็กกราฟเลื่อนแนวนอนได้ — เลื่อนไปวันล่าสุดก่อน
    function scrollChartToLatest() {
        $$('.chart-wrap').forEach((wrap) => { wrap.scrollLeft = wrap.scrollWidth; });
    }

    // ---------- เริ่มต้น ----------
    tickClock();
    setInterval(tickClock, 1000);
    animateCounters();
    updateRelativeTimes();
    setInterval(updateRelativeTimes, 30 * 1000);
    applyFeedFilter();
    applyZoneTools();
    scrollChartToLatest();
    pollNew();
    setInterval(pollNew, POLL_MS);
    setAutoRefresh(storageGet(STORAGE_AUTO, '0') === '1', false);
});
