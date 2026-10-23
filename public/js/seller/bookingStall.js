// ฟอร์มจองแผงค้า (views/seller/Booking_stall.ejs) — ทุกอย่างที่คำนวณตรงนี้เป็นแค่ preview
// เซิร์ฟเวอร์ตรวจกติการอบ/โควตา/ราคาซ้ำทั้งหมดตอน POST /booking-stall เสมอ (routes/sellerRoute.js)
(function () {
    const DATA = window.BOOKING_DATA || {};
    const KINDS = DATA.applianceKinds || {};
    const PRESETS = DATA.appliancePresets || [];
    const ZONE_PRICE = Number(DATA.zonePrice || 0);
    const LIGHT_UNIT_PRICE = Number(DATA.lightUnitPrice || 15);
    const MAX_STALLS = Number(DATA.maxStallsPerSeller || 2);
    const IS_FASHION = Boolean(DATA.isFashionSeller);
    const MAX_WATT = Number(DATA.smallApplianceMaxWatt || 1200);
    const MAX_QTY = Number(DATA.maxQtyPerItem || 20);
    const HOLIDAY_SET = new Set(DATA.holidays || []);
    const BOOKED_SET = new Set(DATA.bookedDates || []);
    const TODAY = DATA.todayKey || toKey(new Date());
    // ขายวันนี้เลยต้องชำระก่อนบ่าย 3 — เลยเวลานั้น (ตามนาฬิกาเซิร์ฟเวอร์) วันแรกที่เริ่มได้คือพรุ่งนี้
    const CUTOFF_HOUR = Number(DATA.sameDayCutoffHour || 15);
    const FIRST_START = DATA.sameDayClosed ? addDaysKey(TODAY, 1) : TODAY;
    const DRAFT_KEY = `bookingDraft:${DATA.userId || 0}:${DATA.zone || ''}`;
    const DRAFT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

    const $ = (id) => document.getElementById(id);
    const form = $('bookingForm');
    if (!form) return;

    const dateStartInput = $('dateStart');
    const dateEndInput = $('dateEnd');
    const stallCountInput = $('stallCount');
    const storeDetailInput = $('storeDetail');
    const applianceItemsInput = $('applianceItemsInput');
    const roundInputs = Array.from(document.querySelectorAll('input[name="roundChoice"]'));
    const cornerInputs = Array.from(document.querySelectorAll('input[name="cornerZone"]'));
    const cornerZoneSection = $('cornerZoneSection');

    // ── วันที่: ทำงานกับ string "YYYY-MM-DD" ตรงกับ input type="date" เทียบ/เรียงได้ด้วย string เลย ──
    function pad(n) { return String(n).padStart(2, '0'); }
    function toKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    function parseKey(key) {
        const p = String(key || '').split('-').map(Number);
        return p[0] && p[1] && p[2] ? new Date(p[0], p[1] - 1, p[2]) : null;
    }
    function addDaysKey(key, n) {
        const d = parseKey(key);
        if (!d) return '';
        d.setDate(d.getDate() + n);
        return toKey(d);
    }
    function daysBetween(startKey, endKey) {
        const a = parseKey(startKey);
        const b = parseKey(endKey);
        if (!a || !b || b < a) return 0;
        return Math.round((b - a) / 86400000) + 1;
    }
    function thaiShort(key) {
        const d = parseKey(key);
        return d ? d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }) : '-';
    }
    function thaiLong(key) {
        const d = parseKey(key);
        return d ? d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' }) : '-';
    }
    function formatBaht(value) { return `${Number(value || 0).toLocaleString('th-TH')} บาท`; }
    function escapeHtml(text) {
        return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ปฏิทินกำหนดเอง (public/js/common/datePicker.js) — เบลอวันหยุดกลางช่วงให้กดไม่ได้ ซึ่งปฏิทินเนทีฟทำไม่ได้
    const startPicker = window.createDatePicker ? window.createDatePicker(dateStartInput, { disabledDates: HOLIDAY_SET }) : null;
    const endPicker = window.createDatePicker ? window.createDatePicker(dateEndInput, { disabledDates: HOLIDAY_SET }) : null;

    // ── รอบที่เลือก ──
    function getRound() {
        const el = roundInputs.find((input) => input.checked && !input.disabled);
        if (!el) return null;
        const d = el.dataset;
        const r = {
            key: el.value,
            roundNumber: d.roundNumber,
            cycleStart: d.cycleStart,
            cycleEnd: d.cycleEnd,
            phase: String(d.phase),
            minDays: parseInt(d.minDays, 10) || 1,
            allowSingleDay: d.allowSingleDay === '1',
            allowCorner: d.allowCorner === '1',
            maxAdvanceStart: d.maxAdvanceStart || '',
            paymentDeadline: d.paymentDeadline || '',
            existingLocks: parseInt(d.existingLocks, 10) || 0
        };
        // ช่วงรายวัน: เริ่มได้ตั้งแต่วันนี้ (หรือวันแรกของรอบ) ถึงพรุ่งนี้ / ช่วงจองยาว: ต้องเต็มรอบ
        r.startMin = r.cycleStart > FIRST_START ? r.cycleStart : FIRST_START;
        r.startMax = r.phase === '2' && r.maxAdvanceStart && r.maxAdvanceStart < r.cycleEnd ? r.maxAdvanceStart : r.cycleEnd;
        return r;
    }

    function setDates(startKey, endKey) {
        dateStartInput.value = startKey || '';
        dateEndInput.value = endKey || '';
    }

    function applyRound(keepDates) {
        const r = getRound();
        const hintBox = $('phaseHintBox');
        if (!r) {
            if (hintBox) hintBox.textContent = 'ยังไม่มีรอบที่เปิดให้จองตอนนี้';
            setDates('', '');
            refreshAll();
            return;
        }

        if (startPicker) startPicker.setOptions({ min: r.startMin, max: r.startMax });
        if (endPicker) endPicker.setOptions({ min: r.startMin, max: r.cycleEnd });
        dateStartInput.min = r.startMin;
        dateStartInput.max = r.startMax;
        dateEndInput.min = r.startMin;
        dateEndInput.max = r.cycleEnd;

        if (r.phase === '1') {
            // จันทร์-อังคาร: จองได้แค่เต็มรอบ — ล็อกวันที่ไว้เลย ไม่ต้องให้แก้แล้วไปเจอ error ตอนกดส่ง
            setDates(r.cycleStart, r.cycleEnd);
            if (hintBox) hintBox.innerHTML = '<i class="fa-solid fa-lock status-strip__icon"></i><span>ช่วงนี้จองได้เฉพาะ <b>เต็มรอบ 14 วัน</b> ระบบเลือกวันให้แล้ว — ขอล็อคเต็ง (แผงพิเศษ) ได้ในหัวข้อ 04</span>';
        } else {
            const start = dateStartInput.value;
            const end = dateEndInput.value;
            const keep = keepDates && start >= r.startMin && start <= r.startMax && end >= start && end <= r.cycleEnd;
            if (!keep) {
                const defaultStart = r.startMax >= r.startMin ? r.startMax : r.startMin;
                setDates(defaultStart, r.cycleEnd);
            }
            const sameDayNote = DATA.sameDayClosed
                ? `เลย ${CUTOFF_HOUR}:00 น. แล้ว เริ่มขายวันนี้ไม่ได้`
                : `ขายวันนี้ต้องจ่ายก่อน <b>${CUTOFF_HOUR}:00 น.</b>`;
            if (hintBox) hintBox.innerHTML = `<span>จองได้ <b>ทีละ 1 วัน</b> หรือ <b>${r.minDays} วันขึ้นไปติดกัน</b> · เริ่มขายได้ไม่เกินพรุ่งนี้ · ${sameDayNote} · ช่วงนี้ขอล็อคเต็งไม่ได้</span>`;
        }
        [startPicker, endPicker].forEach((p) => { if (p) p.setOptions({ locked: r.phase === '1' }); });

        // ไม่ซ่อนหัวข้อแผงพิเศษตอนขอไม่ได้ (เลขหัวข้อจะกระโดด) แค่หรี่ + กดไม่ได้
        if (cornerZoneSection) cornerZoneSection.classList.toggle('is-disabled', !r.allowCorner);
        if (!r.allowCorner) {
            const none = cornerInputs.find((el) => el.value === '0');
            if (none) none.checked = true;
        }
        pendingStart = null;
        refreshAll();
    }

    // ── ปุ่มลัดวันที่ (ช่วงรายวัน) ──
    function renderDateChips(r) {
        const startRow = $('startChips');
        const lengthRow = $('lengthChips');
        const show = r && r.phase === '2' && r.startMin <= r.startMax;
        startRow.hidden = !show;
        lengthRow.hidden = !show;
        startRow.querySelectorAll('.chip').forEach((el) => el.remove());
        lengthRow.querySelectorAll('.chip').forEach((el) => el.remove());
        if (!show) return;

        const start = dateStartInput.value;
        const end = dateEndInput.value;
        for (let key = r.startMin; key <= r.startMax; key = addDaysKey(key, 1)) {
            if (HOLIDAY_SET.has(key)) continue;
            const label = key === TODAY ? `วันนี้ (จ่ายก่อน ${CUTOFF_HOUR}:00)` : (key === addDaysKey(TODAY, 1) ? 'พรุ่งนี้' : '');
            const chip = makeChip(`${label ? label + ' · ' : ''}${thaiShort(key)}`, key === start, false, () => {
                const length = Math.max(1, daysBetween(start, end));
                const newEnd = addDaysKey(key, length - 1);
                setDates(key, newEnd <= r.cycleEnd ? newEnd : r.cycleEnd);
                refreshAll();
            });
            startRow.appendChild(chip);
        }

        const lengths = [1, r.minDays, 7].filter((n, i, arr) => arr.indexOf(n) === i);
        lengths.forEach((n) => {
            const target = addDaysKey(start, n - 1);
            const chip = makeChip(n === 1 ? 'วันเดียว' : `${n} วัน`, end === target, !start || target > r.cycleEnd, () => {
                setDates(start, target);
                refreshAll();
            });
            lengthRow.appendChild(chip);
        });
        const toEnd = daysBetween(start, r.cycleEnd);
        if (toEnd > 0 && !lengths.includes(toEnd)) {
            lengthRow.appendChild(makeChip(`ถึงจบรอบ (${toEnd} วัน)`, end === r.cycleEnd, toEnd === 2, () => {
                setDates(start, r.cycleEnd);
                refreshAll();
            }));
        }
    }

    function makeChip(text, active, disabled, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `chip${active ? ' chip--active' : ''}`;
        btn.textContent = text;
        btn.disabled = Boolean(disabled);
        btn.addEventListener('click', onClick);
        return btn;
    }

    // ── ปฏิทินย่อ 14 วันของรอบ: เห็นวันที่จะขาย วันหยุด และวันที่มีคำขอของตัวเองอยู่แล้วในทีเดียว ──
    let pendingStart = null;
    const WEEKDAY_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

    function renderMiniCal(r) {
        const cal = $('miniCal');
        const tip = $('miniCalTip');
        cal.innerHTML = '';
        if (!r) return;
        const start = dateStartInput.value;
        const end = dateEndInput.value;
        const interactive = r.phase === '2';
        if (tip) {
            tip.hidden = !interactive;
            tip.textContent = pendingStart ? 'แตะวันสุดท้ายที่จะขาย (แตะวันเดิม = ขายวันเดียว)' : 'แตะวันเริ่ม แล้วแตะวันสุดท้าย';
        }

        for (let key = r.cycleStart; key <= r.cycleEnd; key = addDaysKey(key, 1)) {
            const d = parseKey(key);
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'mc-day';
            cell.innerHTML = `<span class="mc-day__wd">${WEEKDAY_TH[d.getDay()]}</span><span class="mc-day__num">${d.getDate()}</span>`;
            const isPast = key < r.startMin;
            const isHoliday = HOLIDAY_SET.has(key);
            const inRange = start && end && key >= start && key <= end;
            if (isPast) cell.classList.add('mc-day--past');
            if (isHoliday) { cell.classList.add('mc-day--holiday'); cell.title = 'วันหยุด ไม่คิดเงิน'; }
            if (BOOKED_SET.has(key)) { cell.classList.add('mc-day--mine'); cell.title = 'มีคำขอ/ล็อกของคุณในวันนี้แล้ว'; }
            if (inRange && !isHoliday) cell.classList.add('mc-day--sel');
            if (inRange && isHoliday) cell.classList.add('mc-day--sel-hol');
            if (key === start) cell.classList.add('mc-day--start');
            if (key === end) cell.classList.add('mc-day--end');
            if (key === pendingStart) cell.classList.add('mc-day--pending');
            if (key === TODAY) cell.classList.add('mc-day--today');

            const canStart = key >= r.startMin && key <= r.startMax && !isHoliday;
            const canEnd = pendingStart && key >= pendingStart && key <= r.cycleEnd;
            cell.disabled = !interactive || isPast || (!canStart && !canEnd);
            if (!cell.disabled) cell.addEventListener('click', () => onCalTap(r, key, canStart));
            cal.appendChild(cell);
        }
    }

    function onCalTap(r, key, canStart) {
        if (pendingStart && key >= pendingStart) {
            setDates(pendingStart, key);
            pendingStart = null;
        } else if (canStart) {
            setDates(key, key);
            pendingStart = key;
        }
        refreshAll();
    }

    // ── ตรวจวันที่ทันทีที่เลือก (เดิมรู้ว่าผิดตอนกดส่งแล้วเท่านั้น) ──
    function countHolidays(startKey, endKey) {
        let count = 0;
        for (let key = startKey; key && key <= endKey; key = addDaysKey(key, 1)) {
            if (HOLIDAY_SET.has(key)) count += 1;
        }
        return count;
    }

    function getDateInfo() {
        const start = dateStartInput.value;
        const end = dateEndInput.value;
        const days = daysBetween(start, end);
        const holidays = days ? countHolidays(start, end) : 0;
        return { start, end, days, holidays, billable: Math.max(0, days - holidays) };
    }

    function dateError(r, info) {
        if (!r) return 'ยังไม่มีรอบที่เปิดให้จอง';
        if (!info.start || !info.end) return 'กรุณาเลือกวันที่ขายให้ครบ';
        if (info.end < info.start) return 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มขาย';
        if (info.start < r.cycleStart || info.end > r.cycleEnd) return 'วันที่ต้องอยู่ในรอบที่เลือก (ห้ามจองข้ามรอบ)';
        if (info.start < TODAY) return 'เลือกวันที่ที่ผ่านมาแล้วไม่ได้';
        if (info.start === TODAY && DATA.sameDayClosed) return `เลย ${CUTOFF_HOUR}:00 น. แล้ว จองขายวันนี้ไม่ได้ (ขายวันนี้ต้องชำระก่อน ${CUTOFF_HOUR}:00 น.) — เลือกเริ่มพรุ่งนี้`;
        if (r.phase === '1' && (info.start !== r.cycleStart || info.end !== r.cycleEnd)) return 'ช่วงนี้จองได้เฉพาะเต็มรอบ 14 วัน';
        if (r.phase === '2') {
            if (r.startMin > r.startMax) {
                return r.startMin > r.cycleEnd
                    ? `เลย ${CUTOFF_HOUR}:00 น. ของวันสุดท้ายของรอบแล้ว จองรอบนี้ไม่ได้ — เลือกรอบถัดไป`
                    : `รอบนี้เริ่มจองรายวันได้ตั้งแต่${thaiLong(addDaysKey(r.cycleStart, -1))} (ล่วงหน้าได้ 1 วันก่อนวันขาย)`;
            }
            if (info.start > r.startMax) return 'เริ่มขายได้ไม่เกินพรุ่งนี้ (จองล่วงหน้าได้แค่ 1 วัน)';
            if (info.days < r.minDays && !(r.allowSingleDay && info.days === 1)) {
                return `จองได้ 1 วัน หรือ ${r.minDays} วันขึ้นไปติดกัน — ตอนนี้เลือก ${info.days} วัน`;
            }
        }
        if (info.billable <= 0) return 'ช่วงที่เลือกเป็นวันหยุดทั้งหมด กรุณาเลือกวันอื่น';
        return '';
    }

    // ── จำนวนล็อก + โควตาต่อรอบ ──
    function stallLimit(r) {
        if (IS_FASHION) return 20;
        return Math.max(0, MAX_STALLS - (r ? r.existingLocks : 0));
    }
    function readStallCount() {
        return Math.max(1, parseInt(stallCountInput.value, 10) || 1);
    }
    function stallError(r) {
        if (IS_FASHION) return '';
        const limit = stallLimit(r);
        if (limit <= 0) return `รอบนี้คุณมีคำขอ/ล็อกครบ ${MAX_STALLS} ล็อกแล้ว จองเพิ่มไม่ได้ (เลือกรอบอื่นได้)`;
        if (readStallCount() > limit) return `จองเพิ่มได้อีกไม่เกิน ${limit} ล็อกในรอบนี้ (รวมทุกโซน ไม่เกิน ${MAX_STALLS} ล็อก/คน/รอบ)`;
        return '';
    }
    function renderQuota(r) {
        const cells = $('quotaCells');
        const text = $('quotaText');
        if (!cells || !text) return;
        const existing = r ? r.existingLocks : 0;
        const requested = readStallCount();
        cells.innerHTML = '';
        for (let i = 0; i < MAX_STALLS; i += 1) {
            const cell = document.createElement('span');
            cell.className = 'quota__cell';
            if (i < existing) cell.classList.add('quota__cell--used');
            else if (i < existing + requested) cell.classList.add('quota__cell--new');
            cells.appendChild(cell);
        }
        text.textContent = existing
            ? `มีแล้ว ${existing} + จองนี้ ${requested} / ${MAX_STALLS} ล็อก`
            : `จองนี้ ${requested} / ${MAX_STALLS} ล็อกในรอบนี้`;
    }

    // ── ปุ่ม − / + ──
    function bindStepper(root, onChange) {
        const input = root.querySelector('input');
        root.querySelectorAll('[data-step]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const min = input.min !== '' ? Number(input.min) : 0;
                const max = input.max !== '' ? Number(input.max) : Infinity;
                const next = Math.min(max, Math.max(min, (parseInt(input.value, 10) || 0) + Number(btn.dataset.step)));
                input.value = next;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                if (onChange) onChange(next);
            });
        });
    }
    document.querySelectorAll('[data-stepper]').forEach((root) => bindStepper(root));

    // ── รายการเครื่องใช้ไฟฟ้า/พัดลม (ระบุชื่อทุกรายการ) ──
    let appliances = [];
    let nextApplianceId = 1;
    let applianceTouched = false;

    function isFanKind(kind) { return Boolean(KINDS[kind] && KINDS[kind].isFan); }

    // เดาประเภทจากชื่อ: ตรงกับรายการยอดนิยม หรือเป็นพัดลมที่บอกขนาดนิ้วมา
    function guessKindFromName(name) {
        const text = String(name || '').trim();
        const preset = PRESETS.find((p) => p.name === text);
        if (preset) return preset.kind;
        if (/พัดลม/.test(text)) {
            const inch = text.match(/(\d{1,2})\s*(นิ้ว|")/);
            if (inch) return Number(inch[1]) <= 18 ? 'FAN_SMALL' : 'FAN_LARGE';
            return 'FAN_SMALL';
        }
        return null;
    }

    function itemNote(item) {
        if (isFanKind(item.kind)) {
            const inch = String(item.name || '').match(/(\d{1,2})\s*(นิ้ว|")/);
            if (inch && Number(inch[1]) > 24) return { text: 'พัดลมใหญ่กว่า 24 นิ้ว ต้องติดต่อแอดมินก่อนนำมา', warn: true };
            return null;
        }
        if (item.kind === 'SMALL' && item.watt > MAX_WATT) {
            return { text: `เกิน ${MAX_WATT.toLocaleString('th-TH')} วัตต์ นับเป็นเครื่องใหญ่`, warn: true };
        }
        return null;
    }

    function addAppliance(item) {
        const name = String(item.name || '').trim();
        const existing = name && appliances.find((a) => a.name === name && a.kind === item.kind);
        if (existing) {
            existing.qty = Math.min(MAX_QTY, existing.qty + 1);
        } else {
            appliances.push({ id: nextApplianceId++, name, kind: KINDS[item.kind] ? item.kind : 'SMALL', qty: Math.min(MAX_QTY, Math.max(1, parseInt(item.qty, 10) || 1)), watt: parseInt(item.watt, 10) || null });
        }
    }

    function renderAppliances(focusId) {
        const list = $('applianceList');
        list.innerHTML = '';
        appliances.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'ap-row';
            row.dataset.id = item.id;
            const kindOptions = Object.keys(KINDS).map((k) => `<option value="${k}" ${k === item.kind ? 'selected' : ''}>${escapeHtml(KINDS[k].label)} · ${KINDS[k].price} บ.</option>`).join('');
            row.innerHTML = `
                <div class="ap-row__main">
                    <input type="text" class="field-input ap-name" list="appliancePresetList" maxlength="60" placeholder="ชื่อเครื่อง เช่น หม้อทอด, พัดลม 16 นิ้ว" value="${escapeHtml(item.name)}" aria-label="ชื่อเครื่องใช้ไฟฟ้า">
                    <select class="field-input ap-kind" aria-label="ประเภท">${kindOptions}</select>
                </div>
                <div class="ap-row__meta">
                    <label class="ap-watt" ${isFanKind(item.kind) ? 'hidden' : ''}>
                        <input type="number" inputmode="numeric" class="field-input ap-watt-input" min="1" max="20000" placeholder="วัตต์" value="${item.watt || ''}" aria-label="กำลังไฟ (วัตต์)">
                        <span>W</span>
                    </label>
                    <div class="stepper stepper--sm">
                        <button type="button" class="stepper__btn" data-step="-1" aria-label="ลดจำนวน">−</button>
                        <input type="number" inputmode="numeric" class="stepper__input ap-qty" min="1" max="${MAX_QTY}" value="${item.qty}" aria-label="จำนวน">
                        <button type="button" class="stepper__btn" data-step="1" aria-label="เพิ่มจำนวน">+</button>
                    </div>
                    <span class="ap-row__fee"></span>
                    <button type="button" class="ap-remove" aria-label="ลบรายการ"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <p class="ap-row__note" hidden></p>`;
            list.appendChild(row);

            const nameInput = row.querySelector('.ap-name');
            const kindSelect = row.querySelector('.ap-kind');
            const wattLabel = row.querySelector('.ap-watt');
            const wattInput = row.querySelector('.ap-watt-input');
            const qtyInput = row.querySelector('.ap-qty');

            const syncRow = () => {
                const note = itemNote(item);
                const noteEl = row.querySelector('.ap-row__note');
                noteEl.hidden = !note;
                noteEl.textContent = note ? note.text : '';
                noteEl.classList.toggle('ap-row__note--warn', Boolean(note && note.warn));
                wattLabel.hidden = isFanKind(item.kind);
                const fee = KINDS[item.kind] ? KINDS[item.kind].price * item.qty : 0;
                row.querySelector('.ap-row__fee').textContent = `${fee} บ./วัน`;
                nameInput.classList.toggle('field-input--error', applianceTouched && !item.name);
                onAppliancesChanged();
            };

            nameInput.addEventListener('input', () => {
                item.name = nameInput.value.trim();
                const guess = guessKindFromName(item.name);
                if (guess && !item.kindLocked) {
                    item.kind = guess;
                    kindSelect.value = guess;
                }
                syncRow();
            });
            kindSelect.addEventListener('change', () => {
                item.kind = kindSelect.value;
                item.kindLocked = true;
                syncRow();
            });
            wattInput.addEventListener('input', () => {
                item.watt = parseInt(wattInput.value, 10) || null;
                // เกินเกณฑ์เครื่องเล็ก → ย้ายเป็นเครื่องใหญ่ให้เลย (เซิร์ฟเวอร์ปรับแบบเดียวกันใน parseApplianceItems)
                if (item.kind === 'SMALL' && item.watt > MAX_WATT) {
                    item.kind = 'LARGE';
                    kindSelect.value = 'LARGE';
                    const noteEl = row.querySelector('.ap-row__note');
                    syncRow();
                    noteEl.hidden = false;
                    noteEl.textContent = `เกิน ${MAX_WATT.toLocaleString('th-TH')} วัตต์ ระบบนับเป็นเครื่องใหญ่ให้แล้ว`;
                    return;
                }
                syncRow();
            });
            qtyInput.addEventListener('input', () => {
                item.qty = Math.min(MAX_QTY, Math.max(1, parseInt(qtyInput.value, 10) || 1));
                syncRow();
            });
            bindStepper(row.querySelector('.stepper'));
            row.querySelector('.ap-remove').addEventListener('click', () => {
                appliances = appliances.filter((a) => a.id !== item.id);
                renderAppliances();
            });
            syncRow();
            if (focusId === item.id) nameInput.focus();
        });
        $('applianceEmpty').hidden = appliances.length > 0;
        onAppliancesChanged();
    }

    function serializeAppliances() {
        applianceItemsInput.value = JSON.stringify(appliances.map((a) => ({ name: a.name, kind: a.kind, qty: a.qty, watt: a.watt })));
    }

    function applianceError() {
        if (appliances.some((a) => !a.name)) return 'กรุณาระบุชื่อเครื่องใช้ไฟฟ้า/พัดลมให้ครบทุกรายการ (เช่น หม้อทอด, พัดลม 16 นิ้ว) หรือกด × ลบแถวที่ไม่ใช้';
        return '';
    }

    function onAppliancesChanged() {
        serializeAppliances();
        if (applianceTouched) showError('applianceError', applianceError());
        recalc();
        scheduleDraftSave();
    }

    function renderPresetChips() {
        const box = $('presetChips');
        PRESETS.forEach((preset) => {
            const kind = KINDS[preset.kind];
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip chip--preset';
            chip.innerHTML = `${escapeHtml(preset.name)} <small>${kind ? kind.price : ''}</small>`;
            chip.addEventListener('click', () => {
                addAppliance({ name: preset.name, kind: preset.kind, qty: 1 });
                renderAppliances();
            });
            box.appendChild(chip);
        });
    }

    $('addApplianceBtn').addEventListener('click', () => {
        addAppliance({ name: '', kind: 'SMALL', qty: 1 });
        renderAppliances(appliances[appliances.length - 1].id);
    });

    // ── สรุปยอด ──
    function totals() {
        const info = getDateInfo();
        const stalls = readStallCount();
        const counts = { SMALL: 0, LARGE: 0, FAN_SMALL: 0, FAN_LARGE: 0 };
        appliances.forEach((a) => { if (counts[a.kind] !== undefined) counts[a.kind] += a.qty; });
        const price = (k) => (KINDS[k] ? KINDS[k].price : 0);
        const rent = ZONE_PRICE * stalls * info.billable;
        const light = LIGHT_UNIT_PRICE * stalls * info.billable;
        const appliance = (counts.SMALL * price('SMALL') + counts.LARGE * price('LARGE')) * info.billable;
        const fan = (counts.FAN_SMALL * price('FAN_SMALL') + counts.FAN_LARGE * price('FAN_LARGE')) * info.billable;
        return { info, stalls, counts, rent, light, appliance, fan, grand: rent + light + appliance + fan };
    }

    function deadlineText(r, info) {
        if (!r || !info.start) return '';
        if (info.start === TODAY) return `ขายวันนี้เลย: ต้องชำระเงินภายในวันนี้ ก่อน ${CUTOFF_HOUR}:00 น. (แอดมินจัดล็อกให้แล้วจ่ายได้ทันที)`;
        const base = 'ชำระเงินภายใน 6 ชม. หลังแอดมินจัดล็อกให้';
        if (r.phase === '1' && r.paymentDeadline) return `${base} และไม่เกิน${thaiLong(r.paymentDeadline)} (จองยาวต้องจ่ายก่อนวันพุธ)`;
        return `${base} และก่อนเริ่มขาย${thaiLong(info.start)}`;
    }

    function recalc() {
        const t = totals();
        const r = getRound();
        $('rentTotalText').textContent = formatBaht(t.rent);
        $('rentDetailText').textContent = t.info.days
            ? `${ZONE_PRICE.toLocaleString('th-TH')} × ${t.stalls} ล็อก × ${t.info.billable} วัน${t.info.holidays ? ` (เลือก ${t.info.days} วัน หักวันหยุด ${t.info.holidays} วัน)` : ''}`
            : '';
        $('lightTotalText').textContent = formatBaht(t.light);
        $('applianceTotalText').textContent = formatBaht(t.appliance);
        $('fanTotalText').textContent = formatBaht(t.fan);
        $('grandTotalText').textContent = formatBaht(t.grand);
        $('stickyAmount').textContent = formatBaht(t.grand);
        $('stickyMeta').textContent = t.info.days
            ? `${t.stalls} ล็อก · ${t.info.billable} วัน · ${thaiShort(t.info.start)}${t.info.days > 1 ? ' – ' + thaiShort(t.info.end) : ''}`
            : 'ยังไม่ได้เลือกวัน';
        $('deadlineText').textContent = deadlineText(r, t.info);
    }

    function showError(id, message) {
        const el = $(id);
        if (!el) return;
        el.hidden = !message;
        el.textContent = message || '';
    }

    function refreshAll() {
        const r = getRound();
        const info = getDateInfo();
        const dErr = dateError(r, info);
        showError('dateError', info.start || info.end ? dErr : '');
        dateStartInput.classList.toggle('field-input--error', Boolean(dErr) && Boolean(info.start));
        dateEndInput.classList.toggle('field-input--error', Boolean(dErr) && Boolean(info.end));

        if (!IS_FASHION) stallCountInput.max = Math.max(1, stallLimit(r));
        const sErr = stallError(r);
        const note = $('stallCountNote');
        if (note) {
            if (!note.dataset.default) note.dataset.default = note.textContent.trim();
            note.textContent = sErr || note.dataset.default;
            note.classList.toggle('field-note--error', Boolean(sErr));
        }
        stallCountInput.classList.toggle('field-input--error', Boolean(sErr));

        renderDateChips(r);
        renderMiniCal(r);
        renderQuota(r);
        recalc();
        scheduleDraftSave();
    }

    // ── บันทึกร่างในเครื่อง (localStorage) — เผลอกดย้อนกลับ/รีเฟรช ข้อมูลไม่หาย ──
    let draftTimer = null;
    let draftEnabled = false;
    function scheduleDraftSave() {
        if (!draftEnabled) return;
        clearTimeout(draftTimer);
        draftTimer = setTimeout(saveDraft, 400);
    }
    function saveDraft() {
        try {
            const corner = cornerInputs.find((el) => el.checked);
            localStorage.setItem(DRAFT_KEY, JSON.stringify({
                savedAt: Date.now(),
                roundChoice: (getRound() || {}).key || '',
                dateStart: dateStartInput.value,
                dateEnd: dateEndInput.value,
                stallCount: stallCountInput.value,
                storeDetail: storeDetailInput.value,
                cornerZone: corner ? corner.value : '0',
                appliances: appliances.map((a) => ({ name: a.name, kind: a.kind, qty: a.qty, watt: a.watt }))
            }));
        } catch (e) { /* โหมดส่วนตัว/ปิด storage — ไม่บันทึกร่างก็ใช้งานต่อได้ */ }
    }
    function readDraft() {
        try {
            const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
            if (draft && Date.now() - Number(draft.savedAt || 0) < DRAFT_MAX_AGE_MS) return draft;
        } catch (e) { /* ignore */ }
        return null;
    }
    function clearDraft() {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    }

    function restoreValues(values, items) {
        if (values.roundChoice) {
            const radio = roundInputs.find((el) => el.value === values.roundChoice && !el.disabled);
            if (radio) radio.checked = true;
        }
        if (values.dateStart || values.dateEnd) setDates(values.dateStart, values.dateEnd);
        if (values.stallCount) stallCountInput.value = values.stallCount;
        if (typeof values.storeDetail === 'string') storeDetailInput.value = values.storeDetail;
        if (values.cornerZone) {
            const corner = cornerInputs.find((el) => el.value === String(values.cornerZone));
            if (corner) corner.checked = true;
        }
        appliances = [];
        (items || []).forEach((item) => addAppliance(item));
    }

    // ── จองเหมือนครั้งก่อน ──
    const repeatBtn = $('repeatBtn');
    if (repeatBtn && DATA.lastBooking) {
        repeatBtn.addEventListener('click', () => {
            const last = DATA.lastBooking;
            const r = getRound();
            stallCountInput.value = IS_FASHION ? last.stallCount : Math.max(1, Math.min(last.stallCount, stallLimit(r) || 1));
            if (last.storeDetail) storeDetailInput.value = last.storeDetail;
            appliances = [];
            (last.items || []).forEach((item) => addAppliance(item));
            renderAppliances();
            refreshAll();
            repeatBtn.textContent = 'ใช้ข้อมูลเดิมแล้ว ✓';
            repeatBtn.disabled = true;
            // รายการจากการจองรุ่นเก่ามีแค่จำนวน ไม่มีชื่อ — พาไปกรอกชื่อให้ครบ
            if (appliances.some((a) => !a.name)) {
                applianceTouched = true;
                onAppliancesChanged();
                renderAppliances();
                $('sectionAppliances').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    // ── ตรวจทานก่อนส่ง ──
    const overlay = $('reviewOverlay');
    function openReview() {
        const t = totals();
        const r = getRound();
        const corner = cornerInputs.find((el) => el.checked);
        const rows = [
            ['รอบ', r ? `รอบที่ ${r.roundNumber}` : '-'],
            ['วันที่ขาย', `${thaiShort(t.info.start)}${t.info.days > 1 ? ' – ' + thaiShort(t.info.end) : ''} · ${t.info.days} วัน${t.info.holidays ? ` (คิดเงิน ${t.info.billable} วัน)` : ''}`],
            ['โซน', `โซน ${DATA.zone} · ${ZONE_PRICE.toLocaleString('th-TH')} บาท/ล็อก/วัน`],
            ['จำนวนล็อก', `${t.stalls} ล็อก`],
            ['เครื่องใช้ไฟฟ้า/พัดลม', appliances.length
                ? appliances.map((a) => `${escapeHtml(a.name)} ×${a.qty} <span class="muted">(${escapeHtml(KINDS[a.kind] ? KINDS[a.kind].label : a.kind)})</span>`).join('<br>')
                : 'ไม่มี'],
            ['แผงพิเศษ', corner && corner.value !== '0' ? `สนใจ ${escapeHtml(corner.dataset.label || '')} (+${corner.value} บาท/ล็อก/วัน หากได้รับจัดให้)` : 'ไม่สนใจ'],
            ['รายละเอียดร้าน', escapeHtml(storeDetailInput.value.trim() || '-')]
        ];
        $('reviewList').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
        $('reviewTotal').textContent = formatBaht(t.grand);
        $('reviewDeadline').textContent = deadlineText(r, t.info);
        overlay.hidden = false;
        document.body.classList.add('no-scroll');
        $('reviewConfirm').focus();
    }
    function closeReview() {
        overlay.hidden = true;
        document.body.classList.remove('no-scroll');
    }
    $('reviewClose').addEventListener('click', closeReview);
    $('reviewEdit').addEventListener('click', closeReview);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeReview(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !overlay.hidden) closeReview(); });

    let submitting = false;
    $('reviewConfirm').addEventListener('click', () => {
        if (submitting) return;
        submitting = true;
        const btn = $('reviewConfirm');
        btn.disabled = true;
        btn.textContent = 'กำลังส่งคำขอ...';
        serializeAppliances();
        clearDraft();
        draftEnabled = false;
        form.submit();
    });

    function validateAll() {
        const r = getRound();
        applianceTouched = true;
        renderAppliances();
        const checks = [
            [dateError(r, getDateInfo()), $('sectionDates')],
            [stallError(r), stallCountInput],
            [applianceError(), $('sectionAppliances')]
        ];
        showError('dateError', checks[0][0]);
        const failed = checks.find(([message]) => message);
        if (failed) {
            failed[1].scrollIntoView({ behavior: 'smooth', block: 'center' });
            window.showAlertDialog({ title: 'ยังกรอกไม่ครบ', message: failed[0], tone: 'warning' });
            return false;
        }
        return true;
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (validateAll()) openReview();
    });
    $('stickySubmit').addEventListener('click', () => {
        if (validateAll()) openReview();
    });

    // แถบยอดรวมติดล่างจอ: ซ่อนเมื่อเลื่อนถึงหัวข้อสรุปยอดแล้ว (ไม่ให้ซ้อนกับปุ่มยืนยันจริง)
    const sticky = $('stickyTotal');
    if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
            sticky.classList.toggle('sticky-total--hidden', entries[0].isIntersecting);
        }, { threshold: 0.15 }).observe($('sectionSummary'));
    }
    document.body.classList.add('has-sticky-total');

    // ── ผูก event ──
    roundInputs.forEach((el) => el.addEventListener('change', () => applyRound(false)));
    [dateStartInput, dateEndInput].forEach((el) => el.addEventListener('change', () => { pendingStart = null; refreshAll(); }));
    stallCountInput.addEventListener('input', refreshAll);
    storeDetailInput.addEventListener('input', scheduleDraftSave);
    cornerInputs.forEach((el) => el.addEventListener('change', scheduleDraftSave));
    $('draftClearBtn').addEventListener('click', () => {
        clearDraft();
        window.location.reload();
    });

    // ── เริ่มต้น: ค่าที่เซิร์ฟเวอร์ตีกลับมาก่อน > ร่างในเครื่อง > ค่าเริ่มต้น ──
    renderPresetChips();
    let restored = false;
    if (DATA.formValues) {
        let items = [];
        try { items = JSON.parse(DATA.formValues.applianceItems || '[]') || []; } catch (e) { items = []; }
        restoreValues(DATA.formValues, Array.isArray(items) ? items : []);
        restored = true;
    } else {
        const draft = readDraft();
        if (draft) {
            restoreValues(draft, draft.appliances || []);
            restored = true;
            $('draftBanner').hidden = false;
        }
    }
    applyRound(restored);
    renderAppliances();
    draftEnabled = true;
})();
