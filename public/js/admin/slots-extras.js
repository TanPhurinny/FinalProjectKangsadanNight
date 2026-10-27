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
        // ผลตรวจเป็นของวันนี้เท่านั้น — เปลี่ยนไปดูวันอื่นในหน้าเดิมแล้วไม่ต้องโชว์
        if (api.IS_TODAY_VIEW && Object.keys(INSPECT_BY_CODE).length) {
            box.append(chip('ตรวจวันนี้', `${s.checked}/${s.inspTotal}`, s.issues ? `พบปัญหา ${s.issues}` : 'ไม่พบปัญหา', () => toggleInspect(), s.issues ? 'bad' : 'ok', inspectOn));
        }
    }

    // ---------- แถบสรุปของโซนในผังล็อก (หน้าแผงค้า) ----------
    // หน้าตาเดียวกับแถบสรุปของหน้าโซน (chip) แต่นับเฉพาะโซนที่เปิด และเป็นของวันที่กำลังดู
    // กดช่องไหน = กรองล็อกแบบนั้น ตัวกรองตัวเดียวกับ "ค้นหาด่วน" ของหน้าโซน เข้า/ออกโซนแล้วยังกรองอยู่
    function countZone(zoneCode) {
        const c = { total: 0, free: 0, booked: 0, unpaid: 0, fresh: 0, expiring: 0, maintenance: 0, freed: 0 };
        forEachStall((zone, stall) => {
            if (zone !== zoneCode) return;
            c.total += 1;
            if (stall.status === 'BOOKED') {
                c.booked += 1;
                if (stall.dayState === 'unpaid') c.unpaid += 1;
                if (stall.occupant && stall.occupant.isNewCustomer) c.fresh += 1;
            } else if (stall.status === 'MAINTENANCE') {
                c.maintenance += 1;
            } else {
                c.free += 1;
            }
            if (isExpiring(stall)) c.expiring += 1;
            if (stall.freedFromToday) c.freed += 1;
        });
        return c;
    }

    function renderZoneStrip() {
        const box = $('zoneStatsStrip');
        const { zone, status, query } = api.getState();
        if (!box || !zone) return;
        const c = countZone(zone);
        const pct = c.total ? Math.round((c.booked / c.total) * 100) : 0;
        const pick = (value) => () => api.setStatusFilter(value);
        box.innerHTML = '';
        box.append(
            chip(`ทั้งโซน ${zone}`, c.total, `เต็ม ${pct}%`, pick(null), '', !status && !query),
            chip('ว่าง', c.free, '', pick('EMPTY'), 'ok', status === 'EMPTY'),
            chip('จองแล้ว', c.booked, c.unpaid ? `รอจ่าย ${c.unpaid}` : '', pick('BOOKED'), '', status === 'BOOKED'),
            chip('ร้านใหม่', c.fresh, '', pick('NEW'), '', status === 'NEW'),
            chip('ซ่อมบำรุง', c.maintenance, '', pick('MAINTENANCE'), 'warn', status === 'MAINTENANCE'),
            chip('ใกล้/หมดสัญญา', c.expiring, '', pick('NEAR_EXPIRY'), c.expiring ? 'bad' : '', status === 'NEAR_EXPIRY')
        );
        // ดูวันอื่น: ล็อกที่วันนี้ยังมีร้านแต่วันนั้นว่างแล้ว
        if (!api.IS_TODAY_VIEW) {
            box.append(chip('ว่างเพิ่มจากวันนี้', c.freed, '', pick('FREED'), c.freed ? 'ok' : '', status === 'FREED'));
        }
        const drawerSearch = $('drawerSearch');
        if (drawerSearch && document.activeElement !== drawerSearch) drawerSearch.value = query || '';
    }

    // ---------- ป้ายตัวเลขบนโซนของผังหลัก ----------
    function renderZoneBadges() {
        const s = computeStats();
        document.querySelectorAll('.zone-block').forEach((block) => {
            // โซนที่มีหลายกล่อง (โซน G) แสดงป้ายตัวเลขแค่กล่องเดียว — กล่องเล็กติด data-badges="off"
            if (block.dataset.badges === 'off') return;
            const zone = zoneOfBlock(block);
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
        const rentalLink = $('icRentalLink');
        if (rentalLink) rentalLink.href = `/admin/rental-statements/stall/${encodeURIComponent(code)}`;
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
        renderZoneStrip();
        saveState();
    };

    window.onFilterChange = function () {
        renderStrip();
        renderZoneStrip();
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
        if (stall.status === 'BOOKED') {
            if (stall.expiryState === 'expired') return 'จองแล้ว (หมดสัญญา)';
            return stall.dayState === 'unpaid' ? 'จองแล้ว (รอยืนยันสลิป)' : 'จองแล้ว (ยืนยันสลิปแล้ว)';
        }
        return stall.freedFromToday ? 'ว่าง (ว่างเพิ่มจากวันนี้)' : 'ว่าง';
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
        // ชื่อไฟล์ใช้วันที่ของผังที่กำลังดู (ดูล่วงหน้าได้ ไม่ใช่วันนี้เสมอไป)
        const fileDate = api.VIEW_DATE.dateKey ? api.VIEW_DATE.dateKey.replace(/-/g, '') : `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
        link.download = `slots-${fileDate}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function printMap() {
        const stamp = $('printStamp');
        if (stamp) {
            stamp.textContent = api.IS_TODAY_VIEW
                ? `ณ ${new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`
                : `ของวันที่ ${api.VIEW_DATE.label} (คาดการณ์จากการจองที่เข้ามาแล้ว)`;
        }
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

    // ---------- เลือกวันที่ดูผัง (แถบวัน วาดใส่ [data-day-ctl] ทั้งเหนือผังและในผังล็อก) ----------
    // เปลี่ยนวันแล้วดึง GET /admin/slots/day?date= มาวาดผังใหม่ในหน้าเดิม (api.applyDayData) ไม่โหลดหน้าใหม่ โซน/ตัวกรองที่เปิดอยู่ยังอยู่
    // ที่อยู่ในแถบเบราว์เซอร์อัปเดตตาม (?date=&zone=) กดย้อนกลับได้ รีเฟรชแล้วได้วันเดิม
    const DAY_CACHE_LIMIT = 12;
    const dayCache = new Map(); // dateKey -> ข้อมูลวันนั้น — กด ◀ ▶ วันข้างๆ ได้ทันที
    let stripDays = (api.VIEW_DATE.strip || []).slice();
    let dayRequest = null;

    function dayUrl(dateKey) {
        const params = new URLSearchParams();
        if (dateKey && dateKey !== api.VIEW_DATE.todayKey) params.set('date', dateKey);
        const zone = api.getState().zone;
        if (zone) params.set('zone', zone);
        const query = params.toString();
        return `/admin/slots${query ? `?${query}` : ''}`;
    }

    function shiftKey(dateKey, days) {
        const d = new Date(`${dateKey}T00:00:00`);
        d.setDate(d.getDate() + days);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function inRange(dateKey) {
        const v = api.VIEW_DATE;
        return Boolean(dateKey) && dateKey >= v.minKey && dateKey <= v.maxKey;
    }

    // withStrip = ขอแถบวันชุดใหม่ (ล้อมรอบวันนั้น) มาด้วย — ใช้ตอนกระโดดไปวันที่อยู่นอกแถบที่แสดงอยู่
    function fetchDay(dateKey, withStrip) {
        const cached = dayCache.get(dateKey);
        if (cached && !withStrip) return Promise.resolve(cached);
        return fetch(`/admin/slots/day?date=${dateKey}${withStrip ? '' : '&strip=0'}`, { headers: { Accept: 'application/json' } })
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((data) => {
                dayCache.set(dateKey, data);
                if (dayCache.size > DAY_CACHE_LIMIT) dayCache.delete(dayCache.keys().next().value);
                return data;
            });
    }

    // โหลดวันข้างๆ ไว้ก่อน กด ◀ ▶ แล้วเปลี่ยนทันที
    function prefetchNeighbours(dateKey) {
        [shiftKey(dateKey, 1), shiftKey(dateKey, -1)].forEach((key) => {
            if (inRange(key) && !dayCache.has(key)) fetchDay(key, false).catch(() => { /* โหลดตอนกดจริงอีกที */ });
        });
    }

    function goToDate(dateKey, { push = true } = {}) {
        if (!inRange(dateKey) || dateKey === api.VIEW_DATE.dateKey) return;
        const needStrip = !stripDays.some((day) => day.key === dateKey);
        const token = {};
        dayRequest = token;
        document.body.classList.add('day-loading');
        renderDayCtl(dateKey);
        fetchDay(dateKey, needStrip)
            .then((data) => {
                if (dayRequest !== token) return; // กดวันอื่นต่อไปแล้ว
                if (needStrip && data.viewDate.strip) stripDays = data.viewDate.strip.slice();
                const wasToday = api.IS_TODAY_VIEW;
                api.applyDayData({ ...data, viewDate: { ...data.viewDate, strip: stripDays } });
                // ผลตรวจ/เลือกหลายล็อก (แจ้งเตือน-ปล่อยล็อก) ใช้ได้เฉพาะวันนี้
                if (wasToday && !api.IS_TODAY_VIEW) {
                    if (inspectOn) toggleInspect(false);
                    if (multiOn) toggleMulti(false);
                }
                document.querySelectorAll('[data-when]').forEach((node) => {
                    node.hidden = (node.dataset.when === 'today') !== api.IS_TODAY_VIEW;
                });
                if (push) history.pushState({ dateKey }, '', dayUrl(dateKey));
                document.body.classList.remove('day-loading');
                renderStrip();
                renderZoneStrip();
                renderZoneBadges();
                renderDayCtl();
                prefetchNeighbours(dateKey);
            })
            .catch(() => {
                if (dayRequest === token) window.location.href = dayUrl(dateKey); // ดึงไม่ได้ โหลดทั้งหน้าแทน
            });
    }

    // ---------- วาดแถบวัน ----------
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function offsetText(offset) {
        if (offset === 0) return 'วันนี้';
        if (offset === 1) return 'พรุ่งนี้';
        if (offset === -1) return 'เมื่อวาน';
        return offset > 0 ? `อีก ${offset} วัน` : `${-offset} วันก่อน`;
    }

    function longDateLabel(dateKey) {
        return new Date(`${dateKey}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: '2-digit' });
    }

    function iconButton(className, icon, title, onClick) {
        const btn = el('button', className);
        btn.type = 'button';
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.innerHTML = `<i class="fa-solid ${icon}"></i>`;
        btn.addEventListener('click', onClick);
        return btn;
    }

    // โครงแถบวัน สร้างครั้งเดียวต่อกล่อง แล้วค่อยอัปเดตข้อความ/ช่องวันตอนเปลี่ยนวัน
    function buildDayCtl(box, index) {
        box.innerHTML = '';
        const head = el('div', 'dctl-head');
        const prev = iconButton('dctl-step', 'fa-chevron-left', 'วันก่อนหน้า', () => goToDate(shiftKey(api.VIEW_DATE.dateKey, -1)));
        const next = iconButton('dctl-step', 'fa-chevron-right', 'วันถัดไป', () => goToDate(shiftKey(api.VIEW_DATE.dateKey, 1)));

        const title = el('div', 'dctl-title');
        const line = el('div', 'dctl-line');
        line.append(el('b', 'dctl-date'), el('span', 'dctl-tag'));
        title.append(line, el('div', 'dctl-sub'));

        const today = el('button', 'dctl-today', 'กลับวันนี้');
        today.type = 'button';
        today.addEventListener('click', () => goToDate(api.VIEW_DATE.todayKey));

        const cal = el('span', 'dctl-cal');
        cal.title = 'เลือกวันจากปฏิทิน';
        const input = el('input', 'dctl-cal-input');
        input.type = 'date';
        input.id = `dayPicker${index}`;
        input.setAttribute('aria-label', 'เลือกวันที่');
        input.value = api.VIEW_DATE.dateKey;
        cal.appendChild(input);

        head.append(prev, title, next, today, cal);
        const track = el('div', 'dctl-track');
        track.setAttribute('aria-label', 'เลือกวัน');
        box.append(head, track);

        // ปฏิทินตัวเดียวกับหน้าจองแผง (public/js/common/datePicker.js) — ข้อความวันที่เป็นภาษาไทย
        if (window.createDatePicker) window.createDatePicker(input, { min: api.VIEW_DATE.minKey, max: api.VIEW_DATE.maxKey });
        input.addEventListener('change', () => { if (input.value) goToDate(input.value); });
        // เก็บอ้างอิงช่องจริงไว้ — datePicker.js ก็อป class ไปใส่ช่องแสดงผลด้วย หาด้วย class จะได้ช่องแสดงผลแทน
        box.dayInput = input;
        box.dataset.built = '1';
    }

    function dayChip(day) {
        const chip = el('button', 'dchip');
        chip.type = 'button';
        chip.dataset.key = day.key;
        chip.classList.toggle('is-today', day.offset === 0);
        chip.classList.toggle('is-past', day.offset < 0);
        chip.classList.toggle('is-holiday', Boolean(day.isHoliday));
        chip.classList.toggle('round-start', Boolean(day.roundStart));
        const dayNum = Number(day.key.slice(8));
        chip.title = `${longDateLabel(day.key)} · รอบ ${day.roundNumber} วันที่ ${day.roundDay}/14`
            + (day.isHoliday ? ' · วันหยุด' : ` · ว่าง ${day.free} ล็อก`);

        if (day.roundStart) chip.appendChild(el('span', 'dchip-round', `รอบ ${day.roundNumber}`));
        chip.appendChild(el('span', 'dchip-wd', day.offset === 0 ? 'วันนี้' : day.weekday));
        chip.appendChild(el('span', 'dchip-num', dayNum === 1 ? day.dayLabel : String(dayNum)));
        if (day.isHoliday) chip.appendChild(el('span', 'dchip-hol', 'หยุด'));
        chip.addEventListener('click', () => goToDate(day.key));
        return chip;
    }

    // pendingKey = วันที่เพิ่งกด (กำลังโหลด) — ไฮไลต์ช่องนั้นไว้ก่อนเลย ให้รู้ว่ากดติด
    function renderDayCtl(pendingKey) {
        const v = api.VIEW_DATE;
        const target = pendingKey || v.dateKey;
        const viewed = stripDays.find((d) => d.key === v.dateKey);
        if (viewed && !pendingKey) viewed.free = v.free; // ช่องของวันที่ดูใช้ตัวเลขเดียวกับผัง
        document.querySelectorAll('[data-day-ctl]').forEach((box, index) => {
            if (!box.dataset.built) buildDayCtl(box, index);
            box.classList.toggle('is-other-day', !v.isToday);
            box.classList.toggle('is-loading', Boolean(pendingKey));
            const [prev, next] = box.querySelectorAll('.dctl-step');
            prev.disabled = !inRange(shiftKey(target, -1));
            next.disabled = !inRange(shiftKey(target, 1));
            box.querySelector('.dctl-today').hidden = target === v.todayKey;

            if (!pendingKey) {
                box.querySelector('.dctl-date').textContent = longDateLabel(v.dateKey);
                box.querySelector('.dctl-tag').textContent = offsetText(v.dayOffset);
                const parts = [`รอบ ${v.roundNumber} · วันที่ ${v.roundDay}/${v.roundLength}`];
                if (v.isHoliday) parts.push('วันหยุด');
                if (!v.isToday) parts.push('คาดการณ์จากการจองที่เข้ามาแล้ว อาจเปลี่ยนได้ระหว่างรอบ');
                box.querySelector('.dctl-sub').textContent = parts.join(' · ');
                if (box.dayInput.value !== v.dateKey) box.dayInput.value = v.dateKey;
            }

            const track = box.querySelector('.dctl-track');
            const keys = stripDays.map((d) => d.key).join(',');
            if (track.dataset.keys !== keys) {
                track.innerHTML = '';
                stripDays.forEach((d) => track.appendChild(dayChip(d)));
                track.dataset.keys = keys;
            }
            track.querySelectorAll('.dchip').forEach((chip) => {
                const on = chip.dataset.key === target;
                chip.classList.toggle('active', on);
                chip.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            const active = track.querySelector('.dchip.active');
            if (active && track.clientWidth) {
                const left = active.offsetLeft - track.offsetLeft - (track.clientWidth - active.offsetWidth) / 2;
                track.scrollTo({ left, behavior: track.dataset.scrolled ? 'smooth' : 'auto' });
                track.dataset.scrolled = '1';
            }
        });
    }

    function bindDayBar() {
        renderDayCtl();
        prefetchNeighbours(api.VIEW_DATE.dateKey);
        // ปุ่มย้อนกลับ/ไปข้างหน้าของเบราว์เซอร์ = ย้อนวันที่ดู
        window.addEventListener('popstate', () => {
            const key = new URLSearchParams(window.location.search).get('date') || api.VIEW_DATE.todayKey;
            goToDate(key, { push: false });
        });
        // ช่องค้นหาในผังล็อก ใช้ตัวค้นหาเดียวกับช่องค้นหาด้านบน
        const drawerSearch = $('drawerSearch');
        if (drawerSearch) {
            let timer = null;
            drawerSearch.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    $('searchInput').value = drawerSearch.value;
                    api.doSearch(drawerSearch.value);
                }, 200);
            });
        }
        // คำอธิบายสีพับไว้ กดปุ่ม "สี" เพื่อเปิด
        const legendBtn = $('drawerLegendBtn');
        const legend = $('drawerLegend');
        if (legendBtn && legend) {
            legendBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                legend.hidden = !legend.hidden;
                legendBtn.setAttribute('aria-expanded', legend.hidden ? 'false' : 'true');
            });
            document.addEventListener('click', (event) => {
                if (!legend.hidden && !legend.contains(event.target)) {
                    legend.hidden = true;
                    legendBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }

        // ดูวันนี้แล้วเปิดแท็บค้างข้ามตี 5 (ขึ้นวันขายใหม่ ดู businessDateOf ใน utils/shopOpenStatus.js) ให้โหลดใหม่เอง สีจะได้ตรงกับวันนั้น
        const businessDayKey = () => {
            const d = new Date(Date.now() - 5 * 60 * 60 * 1000);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        setInterval(() => {
            if (api.IS_TODAY_VIEW && businessDayKey() !== api.VIEW_DATE.todayKey && !document.body.classList.contains('multi-mode')) window.location.reload();
        }, 5 * 60 * 1000);
    }

    // มาจากการเปลี่ยนวันตอนเปิดผังล็อกอยู่ (?zone=) — เปิดโซนนั้นให้เลย
    function openZoneFromUrl() {
        const zone = String(new URLSearchParams(window.location.search).get('zone') || '').toUpperCase();
        if (zone && ZONES[zone]) api.openZone(zone);
    }

    // ---------- เริ่มทำงาน ----------
    document.addEventListener('DOMContentLoaded', () => {
        bindDayBar();
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
        openZoneFromUrl();
    });
})();
