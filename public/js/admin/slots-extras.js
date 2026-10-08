/* ส่วนเสริมของหน้าผังตลาด /admin/slots (แอดมิน + staff)
   สรุปตัวเลข, ป้ายบนโซน, ชั้นผลตรวจวันนี้, ประวัติ 7 วันในการ์ดล็อก, เลือกหลายล็อก, คีย์ลัด,
   จำตัวกรอง, พิมพ์/CSV และซูม — ใช้สถานะ/ฟังก์ชันของผังผ่าน window.slotsApi (ดู slots.js) */
(function () {
    const api = window.slotsApi;
    if (!api) return;

    const ZONES = api.ZONES_DATA;
    const BOOKING = api.BOOKING_BY_STALL;

    function readJson(id) {
        try { return JSON.parse(document.getElementById(id).textContent); } catch (_) { return {}; }
    }
    const INSPECT = readJson('inspectionTodayJson');
    const INSPECT_BY_CODE = INSPECT.byCode || {};

    const STORE_KEY = 'slotsViewState.v1';
    const FLASH_KEY = 'slotsBulkFlash';
    const $ = (id) => document.getElementById(id);

    function storeGet(key) {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
    }
    function storeSet(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* ไม่มี storage ก็ใช้งานต่อได้ */ }
    }

    // ---------- ตัวช่วยอ่านข้อมูลล็อก ----------
    function forEachStall(callback) {
        Object.keys(ZONES).forEach((zone) => {
            (ZONES[zone].columns || []).forEach((column) => {
                column.stalls.forEach((stall) => {
                    if (stall.status !== 'PLACEHOLDER') callback(zone, stall);
                });
            });
        });
    }
    const isFree = (stall) => stall.status !== 'BOOKED' && stall.status !== 'MAINTENANCE';
    const isExpiring = (stall) => ['near', 'critical', 'expired'].includes(stall.expiryState);

    // ---------- สรุปตัวเลขทั้งตลาด ----------
    let inspectOn = false;

    function computeStats() {
        const stats = { total: 0, free: 0, booked: 0, maintenance: 0, expiring: 0, checked: 0, issues: 0, inspTotal: 0, zones: {} };
        forEachStall((zone, stall) => {
            const z = stats.zones[zone] || (stats.zones[zone] = { free: 0, expiring: 0, issues: 0, pending: 0 });
            stats.total += 1;
            if (stall.status === 'BOOKED') stats.booked += 1;
            else if (stall.status === 'MAINTENANCE') stats.maintenance += 1;
            else { stats.free += 1; z.free += 1; }
            if (isExpiring(stall)) { stats.expiring += 1; z.expiring += 1; }
            const insp = INSPECT_BY_CODE[stall.code];
            if (insp && stall.status === 'BOOKED') {
                stats.inspTotal += 1;
                if (insp.status === 'issue') { stats.issues += 1; z.issues += 1; }
                if (insp.status === 'pending') z.pending += 1;
                if (insp.status !== 'pending') stats.checked += 1;
            }
        });
        return stats;
    }

    function chip(label, value, extra, onClick, tone, active) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `stat-chip${tone ? ` tone-${tone}` : ''}${active ? ' active' : ''}`;
        const v = document.createElement('b');
        v.textContent = value;
        const l = document.createElement('span');
        l.textContent = label;
        btn.append(v, l);
        if (extra) {
            const e = document.createElement('small');
            e.textContent = extra;
            btn.append(e);
        }
        if (onClick) btn.addEventListener('click', onClick);
        else btn.classList.add('static');
        return btn;
    }

    function clickQuickTag(selector) {
        const tag = document.querySelector(selector);
        if (tag) tag.click();
    }

    function renderStrip() {
        const box = $('statsStrip');
        if (!box) return;
        const s = computeStats();
        const status = api.getState().status;
        const pct = s.total ? Math.round((s.booked / s.total) * 100) : 0;
        box.innerHTML = '';
        box.append(
            chip('ทั้งหมด', s.total, `เต็ม ${pct}%`, null),
            chip('ว่าง', s.free, '', () => clickQuickTag('.qtag-empty'), 'ok', status === 'EMPTY'),
            chip('จองแล้ว', s.booked, '', () => clickQuickTag('.qtag-booked'), '', status === 'BOOKED'),
            chip('ซ่อมบำรุง', s.maintenance, '', () => clickQuickTag('.qtag-maintenance'), 'warn', status === 'MAINTENANCE'),
            chip('ใกล้/หมดสัญญา', s.expiring, '', () => clickQuickTag('.qtag-near-expiry'), s.expiring ? 'bad' : '', status === 'NEAR_EXPIRY')
        );
        if (Object.keys(INSPECT_BY_CODE).length) {
            box.append(chip('ตรวจวันนี้', `${s.checked}/${s.inspTotal}`, s.issues ? `พบปัญหา ${s.issues}` : 'ไม่พบปัญหา', () => toggleInspect(), s.issues ? 'bad' : 'ok', inspectOn));
        }
    }

    // ---------- ป้ายตัวเลขบนโซนของผังหลัก ----------
    function renderZoneBadges() {
        const s = computeStats();
        document.querySelectorAll('.zone-block').forEach((block) => {
            const zone = block.id.replace('zone-', '');
            const z = s.zones[zone];
            let box = block.querySelector('.zone-badges');
            if (!box) {
                box = document.createElement('div');
                box.className = 'zone-badges';
                block.appendChild(box);
            }
            box.innerHTML = '';
            if (!z) return;
            const add = (text, cls) => {
                const span = document.createElement('span');
                span.className = `zb ${cls}`;
                span.textContent = text;
                box.appendChild(span);
            };
            add(`ว่าง ${z.free}`, z.free ? 'zb-free' : 'zb-none');
            if (z.expiring) add(`หมดสัญญา ${z.expiring}`, 'zb-bad');
            if (inspectOn && z.issues) add(`ปัญหา ${z.issues}`, 'zb-bad');
            if (inspectOn && z.pending) add(`รอตรวจ ${z.pending}`, 'zb-warn');
        });
    }

    // ---------- ชั้นผลตรวจวันนี้ ----------
    const INSPECT_LABELS = { ok: 'ตรวจแล้ว ปกติ', issue: 'พบปัญหา', pending: 'ยังไม่ตรวจ' };

    function renderInspectLegend() {
        const box = $('inspectLegend');
        if (!box) return;
        box.hidden = !inspectOn;
        if (!inspectOn) return;
        box.innerHTML = '';
        const title = document.createElement('b');
        title.textContent = `ผลตรวจวันนี้${INSPECT.dateLabel ? ` (${INSPECT.dateLabel})` : ''}:`;
        box.appendChild(title);
        [['ok', INSPECT_LABELS.ok], ['issue', INSPECT_LABELS.issue], ['pending', INSPECT_LABELS.pending]].forEach(([key, text]) => {
            const item = document.createElement('span');
            item.className = 'il-item';
            const dot = document.createElement('i');
            dot.className = `il-dot insp-${key}`;
            item.append(dot, document.createTextNode(text));
            box.appendChild(item);
        });
    }

    function toggleInspect(force) {
        inspectOn = typeof force === 'boolean' ? force : !inspectOn;
        $('toolInspect').classList.toggle('active', inspectOn);
        renderInspectLegend();
        renderZoneBadges();
        renderStrip();
        api.renderActiveGrid();
        saveState();
    }

    // ---------- เลือกหลายล็อก ----------
    let multiOn = false;
    const selected = new Set();

    function stallOf(code) { return api.findStallByCode(code); }

    function updateBulkBar() {
        const bar = $('bulkBar');
        bar.hidden = !multiOn;
        if (!multiOn) return;
        const notify = [];
        const release = [];
        selected.forEach((code) => {
            const st = stallOf(code);
            if (!st) return;
            if (st.expiryState === 'expired') release.push(code);
            else if (st.expiryState === 'near' || st.expiryState === 'critical') notify.push(code);
        });
        $('bulkCount').textContent = selected.size ? `เลือกแล้ว ${selected.size} ล็อก` : 'แตะล็อกที่ใกล้/หมดสัญญาเพื่อเลือก';
        const notifyBtn = $('bulkNotify');
        const releaseBtn = $('bulkRelease');
        notifyBtn.querySelector('span').textContent = `แจ้งเตือน (${notify.length})`;
        releaseBtn.querySelector('span').textContent = `ปล่อยล็อก (${release.length})`;
        notifyBtn.disabled = !notify.length;
        releaseBtn.disabled = !release.length;
        notifyBtn.dataset.codes = notify.join(',');
        releaseBtn.dataset.codes = release.join(',');
    }

    function toggleMulti(force) {
        multiOn = typeof force === 'boolean' ? force : !multiOn;
        if (!multiOn) selected.clear();
        $('toolMulti').classList.toggle('active', multiOn);
        document.body.classList.toggle('multi-mode', multiOn);
        if (multiOn) window.hideInfo();
        updateBulkBar();
        api.renderActiveGrid();
    }

    function runBulk(action, codes) {
        if (!codes.length) return;
        const isRelease = action === 'release';
        window.showConfirmDialog({
            title: isRelease ? `ปล่อย ${codes.length} ล็อก?` : `แจ้งเตือน ${codes.length} ร้าน?`,
            message: isRelease
                ? `ล็อก ${codes.join(', ')} จะกลับมาว่างพร้อมให้จองใหม่ทันที ตรวจสอบหน้างานแล้วว่าร้านเดิมออกจริงหรือยัง?`
                : `ส่งแจ้งเตือนในระบบ/อีเมลให้ร้านที่เช่าล็อก ${codes.join(', ')} ว่าใกล้หมดสัญญา ให้มาต่อสัญญา?`,
            tone: isRelease ? 'danger' : 'neutral',
            confirmText: isRelease ? 'ปล่อยล็อก' : 'ส่งแจ้งเตือน',
            onConfirm: async () => {
                try {
                    const response = await fetch('/admin/slots/bulk-action', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                        body: JSON.stringify({ action, stallCodes: codes })
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'failed');
                    try { sessionStorage.setItem(FLASH_KEY, JSON.stringify({ action, okCount: data.okCount, failCount: data.failCount })); } catch (_) { /* ignore */ }
                    window.location.reload();
                } catch (error) {
                    window.showAlertDialog({ title: 'ทำรายการไม่สำเร็จ', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', tone: 'danger' });
                }
            }
        });
    }

    function showBulkFlash() {
        let flash = null;
        try {
            flash = JSON.parse(sessionStorage.getItem(FLASH_KEY) || 'null');
            sessionStorage.removeItem(FLASH_KEY);
        } catch (_) { /* ignore */ }
        if (!flash) return;
        const verb = flash.action === 'release' ? 'ปล่อยล็อก' : 'แจ้งเตือนร้านค้า';
        const failText = flash.failCount ? ` ส่วนอีก ${flash.failCount} ล็อกไม่เข้าเงื่อนไข จึงถูกข้าม` : '';
        window.showAlertDialog({
            title: `${verb}เรียบร้อย`,
            message: `สำเร็จ ${flash.okCount} ล็อก${failText}`,
            tone: flash.okCount ? 'success' : 'warning'
        });
    }

    // ---------- ตกแต่งช่องล็อกตอนวาดผัง (เรียกจาก slots.js) ----------
    window.decorateStallCell = function (cell, code, stall) {
        if (inspectOn && stall.status === 'BOOKED') {
            const insp = INSPECT_BY_CODE[code];
            if (insp) cell.classList.add(`insp-${insp.status}`);
        }
        if (multiOn) {
            if (stall.status === 'BOOKED' && isExpiring(stall)) cell.classList.add('multi-ok');
            else cell.classList.add('multi-off');
            if (selected.has(code)) cell.classList.add('sel-multi');
        }
    };

    function bindGridMultiSelect() {
        // จับคลิกตอน capture ก่อนตัวจัดการของช่องล็อก (ที่เปิดการ์ด/เลือกแผง) จะทำงาน
        $('stallGrid').addEventListener('click', (event) => {
            if (!multiOn) return;
            const cell = event.target.closest('.stall-cell');
            if (!cell) return;
            event.stopPropagation();
            event.preventDefault();
            const code = cell.dataset.stall;
            const stall = code && stallOf(code);
            if (!stall || stall.status !== 'BOOKED' || !isExpiring(stall)) return;
            if (selected.has(code)) selected.delete(code);
            else selected.add(code);
            cell.classList.toggle('sel-multi', selected.has(code));
            updateBulkBar();
        }, true);
    }

    // ---------- ประวัติ 7 วันในการ์ดล็อก ----------
    const historyCache = new Map();
    const REPAIR_STATUS = { PENDING: 'รอรับเรื่อง', APPROVED: 'อนุมัติแล้ว', IN_PROGRESS: 'กำลังดำเนินการ' };
    let infoShownFor = null;

    function renderHistory(data) {
        const wrap = $('icHistory');
        const days = $('icHistoryDays');
        const notes = $('icHistoryNotes');
        const repairs = $('icHistoryRepairs');
        days.innerHTML = '';
        notes.innerHTML = '';
        repairs.innerHTML = '';

        (data.days || []).forEach((day) => {
            const el = document.createElement('div');
            const att = day.attendance;
            el.className = `hday att-${att}${day.isToday ? ' today' : ''}`;
            const lab = document.createElement('span');
            lab.className = 'hday-label';
            lab.textContent = day.label;
            const main = document.createElement('span');
            main.className = 'hday-main';
            main.textContent = att === 'noShow' ? 'ไม่มา' : (att === 'present' ? 'มา' : '—');
            const marks = document.createElement('span');
            marks.className = 'hday-marks';
            if (day.cleanliness === 'passed') marks.textContent = '✓';
            else if (day.cleanliness === 'failed') marks.textContent = '✗';
            if (day.problems.length) marks.textContent += '⚠';
            el.append(lab, main, marks);
            el.title = [
                day.label,
                att === 'noShow' ? 'ไม่มาขาย' : (att === 'present' ? 'มาขาย' : 'ไม่มีบันทึก'),
                day.cleanliness ? `ความสะอาด${day.cleanliness === 'passed' ? 'ผ่าน' : `ไม่ผ่าน ${day.failedCount} ข้อ`}` : null,
                ...day.problems
            ].filter(Boolean).join(' · ');
            days.appendChild(el);

            if (att === 'noShow' || day.problems.length || day.cleanliness === 'failed') {
                const li = document.createElement('li');
                const parts = [];
                if (att === 'noShow') parts.push('ไม่มาขาย');
                if (day.cleanliness === 'failed') parts.push(`ความสะอาดไม่ผ่าน ${day.failedCount} ข้อ`);
                parts.push(...day.problems);
                li.textContent = `${day.label}: ${parts.join(', ')}`;
                notes.appendChild(li);
            }
        });

        if (!notes.children.length) {
            const li = document.createElement('li');
            li.className = 'ok';
            li.textContent = 'ไม่พบปัญหาใน 7 วันที่ผ่านมา';
            notes.appendChild(li);
        }

        if ((data.repairs || []).length) {
            const title = document.createElement('b');
            title.textContent = 'งานซ่อมที่ยังไม่ปิด: ';
            repairs.appendChild(title);
            repairs.appendChild(document.createTextNode(
                data.repairs.map((r) => `${r.category || 'แจ้งซ่อม'} (${REPAIR_STATUS[r.status] || r.status})`).join(', ')
            ));
        }
        wrap.classList.remove('d-none');
    }

    window.onStallInfoShown = function (code) {
        infoShownFor = code;
        const wrap = $('icHistory');
        wrap.classList.add('d-none');
        if (historyCache.has(code)) {
            renderHistory(historyCache.get(code));
            return;
        }
        fetch(`/admin/slots/stall-history/${encodeURIComponent(code)}`, { headers: { Accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                if (!data) return;
                historyCache.set(code, data);
                if (infoShownFor === code) renderHistory(data);
            })
            .catch(() => { /* ไม่มีประวัติก็ยังใช้การ์ดได้ */ });
    };

    // ---------- จำตัวกรอง + โซนล่าสุด ----------
    let lastZone = null;

    function saveState() {
        const st = api.getState();
        storeSet(STORE_KEY, { query: st.query, status: st.status, lotColors: st.lotColors, inspect: inspectOn, lastZone });
    }

    window.onZoneOpened = function (zone) {
        lastZone = zone;
        saveState();
    };

    window.onFilterChange = function () {
        renderStrip();
        saveState();
    };

    function renderLastZoneButton() {
        const btn = $('toolLastZone');
        if (!lastZone || !ZONES[lastZone]) { btn.hidden = true; return; }
        btn.hidden = false;
        btn.innerHTML = '';
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-clock-rotate-left';
        btn.append(icon, document.createTextNode(` กลับโซน ${lastZone}`));
        btn.onclick = () => api.openZone(lastZone);
    }

    function clearAll() {
        api.clearAllFilters();
        if (inspectOn) toggleInspect(false);
        if (multiOn) toggleMulti(false);
        saveState();
    }

    // ---------- พิมพ์ผัง / ส่งออก CSV ----------
    function stallStatusText(stall) {
        if (stall.status === 'MAINTENANCE') return 'ซ่อมบำรุง';
        if (stall.status === 'BOOKED') return stall.expiryState === 'expired' ? 'จองแล้ว (หมดสัญญา)' : 'จองแล้ว';
        return 'ว่าง';
    }

    function csvCell(value) {
        let text = value == null ? '' : String(value);
        if (/^[=+\-@]/.test(text)) text = `'${text}`; // กัน Excel ตีความเป็นสูตร
        return `"${text.replace(/"/g, '""')}"`;
    }

    function exportCsv() {
        const st = api.getState();
        const filtering = Boolean(st.query || st.status);
        const header = ['โซน', 'ล็อก', 'สถานะ', 'ร้านค้า', 'ผู้เช่า', 'เบอร์โทร', 'ประเภทสินค้า', 'ระยะเวลาเช่า', 'เหลือ (วัน)', 'การชำระเงิน', 'ผลตรวจวันนี้', 'ปัญหาวันนี้'];
        const lines = [header.map(csvCell).join(',')];
        let count = 0;
        forEachStall((zone, stall) => {
            if (filtering && !api.stallMatchesFilter(stall.code, stall)) return;
            const occ = stall.occupant || {};
            const legacy = BOOKING[stall.code] || {};
            const insp = INSPECT_BY_CODE[stall.code];
            lines.push([
                zone, stall.code, stallStatusText(stall),
                occ.shopName || legacy.shop || '',
                occ.renterName || legacy.name || '',
                occ.phone || legacy.phone || '',
                [occ.productTypeText, occ.productSubtype].filter(Boolean).join(' · ') || legacy.product || '',
                occ.rentalPeriodText || '',
                occ.daysUntilExpiry != null ? occ.daysUntilExpiry : '',
                occ.paymentStatusText || '',
                insp ? INSPECT_LABELS[insp.status] : '',
                insp && insp.problems ? insp.problems.join(', ') : ''
            ].map(csvCell).join(','));
            count += 1;
        });
        if (!count) {
            window.showAlertDialog({ title: 'ไม่มีข้อมูลให้ส่งออก', message: 'ตัวกรองปัจจุบันไม่พบล็อกใดเลย', tone: 'warning' });
            return;
        }
        const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        link.href = url;
        link.download = `slots-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function printMap() {
        const stamp = $('printStamp');
        if (stamp) stamp.textContent = `ณ ${new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`;
        window.print();
    }

    // ---------- ซูมผัง (ปุ่ม + / − และใช้สองนิ้วบนมือถือ) ----------
    function makeZoom(target, touchArea, host, limits) {
        if (!target || !touchArea || !host) return;
        const min = limits.min;
        const max = limits.max;
        let scale = 1;
        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'zoom-val';
        label.title = 'กลับเป็น 100%';

        function apply(next) {
            scale = Math.min(max, Math.max(min, Math.round(next * 100) / 100));
            target.style.zoom = scale === 1 ? '' : String(scale);
            label.textContent = `${Math.round(scale * 100)}%`;
        }

        function button(text, aria, delta) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'zoom-btn';
            btn.textContent = text;
            btn.setAttribute('aria-label', aria);
            btn.addEventListener('click', () => apply(scale + delta));
            return btn;
        }

        label.addEventListener('click', () => apply(1));
        host.append(button('−', 'ซูมออก', -0.15), label, button('+', 'ซูมเข้า', 0.15));
        apply(1);

        let startDist = 0;
        let startScale = 1;
        const distance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
        touchArea.addEventListener('touchstart', (event) => {
            if (event.touches.length === 2) {
                startDist = distance(event.touches);
                startScale = scale;
            }
        }, { passive: true });
        touchArea.addEventListener('touchmove', (event) => {
            if (event.touches.length !== 2 || !startDist) return;
            event.preventDefault();
            apply(startScale * (distance(event.touches) / startDist));
        }, { passive: false });
        touchArea.addEventListener('touchend', () => { startDist = 0; });
    }

    // ---------- คีย์ลัด ----------
    function jumpToStall(raw) {
        const code = String(raw || '').trim().toUpperCase();
        const zone = api.findZoneOfStall(code);
        const input = $('searchInput');
        if (!zone) {
            input.classList.add('not-found');
            setTimeout(() => input.classList.remove('not-found'), 900);
            return false;
        }
        api.openZone(zone);
        requestAnimationFrame(() => {
            const cell = document.querySelector(`.stall-cell[data-stall="${code}"]`);
            if (cell) cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            const stall = api.findStallByCode(code);
            if (stall && stall.status === 'BOOKED') api.showInfo(code);
            else if (cell) api.selectEmpty(code, cell);
        });
        return true;
    }

    function bindKeyboard() {
        const input = $('searchInput');
        input.title = 'กด / เพื่อค้นหา · พิมพ์รหัสล็อก (เช่น B104) แล้วกด Enter เพื่อไปที่ล็อก';

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && /^[A-Za-z]\d{3}$/.test(input.value.trim())) {
                if (jumpToStall(input.value)) event.preventDefault();
            }
        });

        document.addEventListener('keydown', (event) => {
            const tag = (event.target.tagName || '').toLowerCase();
            const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable;

            if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                input.focus();
                input.select();
                return;
            }
            if (event.key !== 'Escape') return;

            if (event.target === input && input.value) { // Esc ในช่องค้นหา = ล้างคำค้น
                api.clearAllFilters();
                return;
            }
            if (typing) { event.target.blur(); return; }

            const infoCard = $('infoCard');
            if (infoCard && infoCard.classList.contains('show')) { window.hideInfo(); return; }
            if ($('drawer').classList.contains('open')) { api.closeZone(); return; }
            if (multiOn) { toggleMulti(false); return; }
            const st = api.getState();
            if (st.query || st.status) api.clearAllFilters();
        });
    }

    // ---------- เริ่มทำงาน ----------
    document.addEventListener('DOMContentLoaded', () => {
        $('toolInspect').addEventListener('click', () => toggleInspect());
        $('toolMulti').addEventListener('click', () => toggleMulti());
        $('toolPrint').addEventListener('click', printMap);
        $('toolCsv').addEventListener('click', exportCsv);
        $('toolClearAll').addEventListener('click', clearAll);
        $('bulkNotify').addEventListener('click', (e) => runBulk('notify', (e.currentTarget.dataset.codes || '').split(',').filter(Boolean)));
        $('bulkRelease').addEventListener('click', (e) => runBulk('release', (e.currentTarget.dataset.codes || '').split(',').filter(Boolean)));
        $('bulkClear').addEventListener('click', () => {
            selected.clear();
            updateBulkBar();
            api.renderActiveGrid();
        });
        $('bulkExit').addEventListener('click', () => toggleMulti(false));
        $('bulkPickExpiring').addEventListener('click', () => {
            forEachStall((zone, stall) => {
                if (stall.status === 'BOOKED' && isExpiring(stall)) selected.add(stall.code);
            });
            updateBulkBar();
            api.renderActiveGrid();
        });

        bindGridMultiSelect();
        bindKeyboard();
        makeZoom($('mapShell'), $('mapZoomWrap'), $('mapZoomCtl'), { min: 0.5, max: 1.8 });
        makeZoom($('stallGrid'), document.querySelector('.drawer-grid'), $('gridZoomCtl'), { min: 0.6, max: 2 });

        // กู้ค่าที่จำไว้ (ตัวกรอง/ชั้นผลตรวจ/โซนล่าสุด)
        const saved = storeGet(STORE_KEY);
        if (saved) {
            lastZone = saved.lastZone || null;
            if (saved.query || saved.status || saved.lotColors) {
                api.restore({ query: saved.query, status: saved.status, lotColors: saved.lotColors });
            }
            if (saved.inspect && Object.keys(INSPECT_BY_CODE).length) toggleInspect(true);
        }

        renderStrip();
        renderZoneBadges();
        renderLastZoneButton();
        showBulkFlash();
    });
})();
