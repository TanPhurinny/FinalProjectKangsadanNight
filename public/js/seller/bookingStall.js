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
    const MAX_QTY = Number(DATA.maxQtyPerItem || 20);
    const HOLIDAY_SET = new Set(DATA.holidays || []);
    const BOOKED_SET = new Set(DATA.bookedDates || []);
    const TODAY = DATA.todayKey || toKey(new Date());
    // ขายวันนี้เลยต้องชำระก่อนบ่าย 3 — เลยเวลานั้น (ตามนาฬิกาเซิร์ฟเวอร์) วันแรกที่เริ่มได้คือพรุ่งนี้
    const CUTOFF_HOUR = Number(DATA.sameDayCutoffHour || 15);
    let FIRST_START = DATA.sameDayClosed ? addDaysKey(TODAY, 1) : TODAY;
    // ส่วนต่างนาฬิกาเครื่องผู้ใช้กับเซิร์ฟเวอร์ — ใช้เช็คว่าเลย 15:00 / ข้ามวันแล้วหรือยังตามเวลาตลาด
    const CLOCK_OFFSET_MS = DATA.serverNowMs ? Number(DATA.serverNowMs) - Date.now() : 0;
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
            if (hintBox) hintBox.innerHTML = '<i class="fa-solid fa-lock status-strip__icon"></i><span>ช่วงนี้จองได้เฉพาะ <b>เต็มรอบ 14 วัน</b> ระบบเลือกวันให้แล้ว — ขอล็อคเต็ง (แผงพิเศษ) ได้ในหัวข้อแผงพิเศษด้านล่าง</span>';
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

    // ── เครื่องใช้ไฟฟ้า/พัดลม: ใช้ไหม → เลือกขนาดก่อน (เล็ก/ใหญ่/พัดลมเล็ก/พัดลมใหญ่) → เลือกเครื่องของขนาดนั้น ──
    let appliances = [];
    let nextApplianceId = 1;
    let applianceTouched = false;
    // '' = ยังไม่ตอบ / 'none' = ไม่ใช้ / 'use' = ใช้ — ต้องตอบเอง กันลืมแจ้งแล้วโดนเก็บหน้างานแพงกว่า
    // เลือก "ไม่ใช้" แล้วรายการที่เคยเลือกไว้ยังจำไว้ (ไม่ถูกส่ง) กดกลับเป็น "ใช้" ก็ได้คืน
    let applianceChoice = '';
    // ขนาดที่กำลังเลือกเครื่องอยู่ — ทุกเครื่องที่เพิ่มในแผงนี้ได้ประเภทนี้เลย ไม่ต้องเลือกประเภทซ้ำ
    let activeKind = '';

    // เกณฑ์ของตลาด: เครื่องเล็กไม่เกิน 1,200 วัตต์ (และขนาดไม่เกิน 250,000 ลบ.ซม.) นอกนั้นนับเป็นเครื่องใหญ่
    const WATT_TEXT = Number(DATA.smallApplianceMaxWatt || 1200).toLocaleString('th-TH');
    const KIND_RULE = {
        SMALL: `ไม่เกิน ${WATT_TEXT} วัตต์`,
        LARGE: `เกิน ${WATT_TEXT} วัตต์`,
        FAN_SMALL: 'ใบพัด 10–18 นิ้ว',
        FAN_LARGE: 'ใบพัด 18–24 นิ้ว'
    };
    const KIND_INFO = {
        SMALL: { title: 'เครื่องเล็ก', desc: 'เช่น เครื่องปั่น เครื่องปิ้งขนมปัง กาน้ำร้อน', icon: 'fa-plug' },
        LARGE: { title: 'เครื่องใหญ่', desc: 'เช่น กระทะ/เตาไฟฟ้า เตาอบ หม้อทอด ตู้แช่', icon: 'fa-fire' },
        FAN_SMALL: { title: 'พัดลมเล็ก', desc: 'เช่น พัดลมตั้งโต๊ะ พัดลมตั้งพื้นทั่วไป', icon: 'fa-fan' },
        FAN_LARGE: { title: 'พัดลมใหญ่', desc: 'เช่น พัดลมอุตสาหกรรม', icon: 'fa-fan' }
    };
    const KIND_ORDER = ['SMALL', 'LARGE', 'FAN_SMALL', 'FAN_LARGE'];

    function activeItems() { return applianceChoice === 'use' ? appliances : []; }
    function isFanKind(kind) { return Boolean(KINDS[kind] && KINDS[kind].isFan); }
    function presetFor(item) { return PRESETS.find((p) => p.name === item.name && p.kind === item.kind) || null; }
    function clampQty(n) { return Math.min(MAX_QTY, Math.max(1, parseInt(n, 10) || 1)); }
    function countOfKind(kind) { return appliances.filter((a) => a.kind === kind).reduce((n, a) => n + a.qty, 0); }

    // เดาประเภทจากชื่อที่พิมพ์เอง ใช้แค่เตือนเมื่อดูเหมือนเลือกขนาดผิด (ไม่ย้ายให้เอง — ผู้ขายเลือกขนาดมาแล้ว)
    function guessKindFromName(name) {
        const text = String(name || '').trim();
        const preset = PRESETS.find((p) => p.name === text);
        if (preset) return preset.kind;
        if (/พัดลม/.test(text)) {
            const inch = text.match(/(\d{1,2})\s*(นิ้ว|")/);
            return inch && Number(inch[1]) > 18 ? 'FAN_LARGE' : 'FAN_SMALL';
        }
        if (/ปิ้งขนมปัง|กาน้ำ|กาต้ม|หุงข้าว|ปั่น|ไมโครเวฟ|ตู้เย็นเล็ก|ชาร์จ|วาฟเฟิล|เครื่องชั่ง/.test(text)) return 'SMALL';
        if (/ทอด|กระทะ|เตา|อบ|ย่าง|ตู้แช่|ตู้เย็นใหญ่|ทำน้ำแข็ง/.test(text)) return 'LARGE';
        return null;
    }

    function addAppliance(item) {
        const name = String(item.name || '').trim();
        const kind = KINDS[item.kind] ? item.kind : 'SMALL';
        const existing = name && appliances.find((a) => a.name === name && a.kind === kind);
        if (existing) {
            existing.qty = clampQty(existing.qty + (parseInt(item.qty, 10) || 1));
        } else {
            appliances.push({ id: nextApplianceId++, name, kind, qty: clampQty(item.qty) });
        }
    }

    // การ์ดเลือกขนาด: บอกราคาและจำนวนที่เลือกไปแล้วในขนาดนั้น
    function renderKindCards() {
        $('applianceKinds').innerHTML = KIND_ORDER.map((kind) => {
            const info = KIND_INFO[kind];
            const count = countOfKind(kind);
            return `<button type="button" class="ap-kind-card${kind === activeKind ? ' is-active' : ''}${count ? ' has-items' : ''}" data-kind="${kind}" aria-pressed="${kind === activeKind}">
                <i class="fa-solid ${info.icon}${kind === 'FAN_LARGE' ? ' ap-kind-card__big' : ''}"></i>
                <span class="ap-kind-card__body">
                    <strong>${info.title} <span class="ap-kind-card__price">${KINDS[kind].price} บ./${KINDS[kind].unit}/วัน</span></strong>
                    <span class="ap-kind-card__rule">${KIND_RULE[kind]}</span>
                    <small>${info.desc}</small>
                </span>
                ${count ? `<span class="ap-kind-card__count">${count}</span>` : ''}
            </button>`;
        }).join('');
    }

    $('applianceKinds').addEventListener('click', (event) => {
        const card = event.target.closest('[data-kind]');
        if (!card) return;
        activeKind = card.dataset.kind;
        $('applianceCustomName').value = '';
        renderAppliances();
        $('appliancePanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // แผงของขนาดที่เลือก: ไทล์เครื่องยอดนิยม + เครื่องอื่นพิมพ์ชื่อเอง
    function renderPanel() {
        const panel = $('appliancePanel');
        panel.hidden = !activeKind;
        if (!activeKind) return;
        const info = KIND_INFO[activeKind];
        $('appliancePanelHead').innerHTML = `<strong>${info.title}</strong> (${KIND_RULE[activeKind]}) · ${KINDS[activeKind].price} บาท/${KINDS[activeKind].unit}/วัน — แตะเครื่องที่จะนำมา`;

        $('applianceTiles').innerHTML = PRESETS.map((p, index) => ({ p, index })).filter(({ p }) => p.kind === activeKind).map(({ p, index }) => {
            const item = appliances.find((a) => a.name === p.name && a.kind === p.kind);
            const qty = item ? item.qty : 0;
            return `<div class="ap-tile${qty ? ' is-on' : ''}">
                <button type="button" class="ap-tile__main" data-preset="${index}" aria-label="เพิ่ม ${escapeHtml(p.name)}">
                    <i class="fa-solid ${escapeHtml(p.icon || 'fa-plug')}"></i>
                    <span class="ap-tile__name">${escapeHtml(p.name)}</span>
                </button>
                ${qty ? `<div class="ap-tile__qty">
                    <button type="button" data-preset-step="-1" data-preset="${index}" aria-label="ลด">−</button>
                    <span>${qty}</span>
                    <button type="button" data-preset-step="1" data-preset="${index}" aria-label="เพิ่ม">+</button>
                </div>` : ''}
            </div>`;
        }).join('');

        $('applianceCustomName').placeholder = `ไม่มีในรายการ? พิมพ์ชื่อ${info.title}`;
        renderCustomList();
    }

    $('applianceTiles').addEventListener('click', (event) => {
        const btn = event.target.closest('[data-preset]');
        if (!btn) return;
        const preset = PRESETS[Number(btn.dataset.preset)];
        if (!preset) return;
        const item = appliances.find((a) => a.name === preset.name && a.kind === preset.kind);
        const step = btn.dataset.presetStep ? Number(btn.dataset.presetStep) : 1;
        if (!item) {
            if (step > 0) addAppliance({ name: preset.name, kind: preset.kind, qty: 1 });
        } else if (item.qty + step <= 0) {
            appliances = appliances.filter((a) => a !== item);
        } else {
            item.qty = clampQty(item.qty + step);
        }
        renderAppliances();
    });

    // เครื่องอื่นของขนาดนี้ (พิมพ์เอง) — แถวที่ไม่มีชื่อมาจากการจองรุ่นเก่า ให้พิมพ์ชื่อในแถวได้เลย
    function renderCustomList() {
        const list = $('applianceList');
        const rows = appliances.filter((a) => a.kind === activeKind && !presetFor(a));
        list.innerHTML = rows.map((item) => `<div class="ap-custom-row" data-id="${item.id}">
                ${item.name
                    ? `<span class="ap-custom-row__name">${escapeHtml(item.name)}</span>`
                    : `<input type="text" class="field-input ap-custom-row__input${applianceTouched ? ' field-input--error' : ''}" maxlength="60" placeholder="ใส่ชื่อเครื่อง" aria-label="ชื่อเครื่อง">`}
                <div class="ap-tile__qty ap-custom-row__qty">
                    <button type="button" data-custom-step="-1" aria-label="ลด">−</button>
                    <span>${item.qty}</span>
                    <button type="button" data-custom-step="1" aria-label="เพิ่ม">+</button>
                </div>
                <button type="button" class="ap-remove" data-custom-remove aria-label="ลบรายการ"><i class="fa-solid fa-xmark"></i></button>
            </div>`).join('');
    }

    $('applianceList').addEventListener('click', (event) => {
        const row = event.target.closest('[data-id]');
        if (!row) return;
        const item = appliances.find((a) => a.id === Number(row.dataset.id));
        if (!item) return;
        const stepBtn = event.target.closest('[data-custom-step]');
        if (event.target.closest('[data-custom-remove]') || (stepBtn && item.qty + Number(stepBtn.dataset.customStep) <= 0)) {
            appliances = appliances.filter((a) => a !== item);
        } else if (stepBtn) {
            item.qty = clampQty(item.qty + Number(stepBtn.dataset.customStep));
        } else {
            return;
        }
        renderAppliances();
    });
    $('applianceList').addEventListener('change', (event) => {
        const input = event.target.closest('.ap-custom-row__input');
        const row = event.target.closest('[data-id]');
        if (!input || !row) return;
        const item = appliances.find((a) => a.id === Number(row.dataset.id));
        if (item && input.value.trim()) {
            item.name = input.value.trim().slice(0, 60);
            renderAppliances();
        }
    });

    function addCustomAppliance() {
        const input = $('applianceCustomName');
        const name = input.value.trim().slice(0, 60);
        if (!name || !activeKind) return;
        addAppliance({ name, kind: activeKind, qty: 1 });
        input.value = '';
        $('applianceCustomHint').hidden = true;
        renderAppliances();
        input.focus();
    }
    $('applianceCustomAdd').addEventListener('click', addCustomAppliance);
    $('applianceCustomName').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addCustomAppliance();
        }
    });
    // ชื่อที่พิมพ์ดูเหมือนอีกขนาด (เช่น "หม้อทอด" ในเครื่องเล็ก) → เตือนพร้อมปุ่มย้ายไปขนาดที่น่าจะถูก
    $('applianceCustomName').addEventListener('input', () => {
        const hint = $('applianceCustomHint');
        const name = $('applianceCustomName').value.trim();
        const guess = guessKindFromName(name);
        const inch = name.match(/(\d{1,2})\s*(นิ้ว|")/);
        if (isFanKind(activeKind) && /พัดลม/.test(name) && inch && Number(inch[1]) > 24) {
            hint.hidden = false;
            hint.innerHTML = 'พัดลมใหญ่กว่า 24 นิ้ว ต้องติดต่อแอดมินก่อนนำมา';
        } else if (guess && guess !== activeKind) {
            hint.hidden = false;
            hint.innerHTML = `"${escapeHtml(name)}" ส่วนใหญ่เป็น<b>${KIND_INFO[guess].title}</b> <button type="button" class="link-btn" data-move-kind="${guess}">เพิ่มเป็น${KIND_INFO[guess].title}แทน</button>`;
        } else {
            hint.hidden = true;
        }
    });
    $('applianceCustomHint').addEventListener('click', (event) => {
        const btn = event.target.closest('[data-move-kind]');
        if (!btn) return;
        activeKind = btn.dataset.moveKind;
        addCustomAppliance();
    });

    function renderApplianceSummary() {
        const box = $('applianceSummary');
        const items = activeItems();
        if (!items.length) {
            box.innerHTML = '<span class="ap-summary__empty">ยังไม่ได้เลือกเครื่อง — เลือกขนาดด้านบนก่อน แล้วแตะเครื่องที่จะนำมา</span>';
            return;
        }
        const fee = items.reduce((sum, a) => sum + KINDS[a.kind].price * a.qty, 0);
        const lines = KIND_ORDER.map((kind) => {
            const ofKind = items.filter((a) => a.kind === kind);
            if (!ofKind.length) return '';
            return `<li><b>${KIND_INFO[kind].title}:</b> ${ofKind.map((a) => `${escapeHtml(a.name || 'ยังไม่ใส่ชื่อ')} ×${a.qty}`).join(', ')}</li>`;
        }).join('');
        box.innerHTML = `<div class="ap-summary__top"><span class="ap-summary__label">เลือกแล้ว ${items.reduce((n, a) => n + a.qty, 0)} เครื่อง</span>
            <strong class="ap-summary__fee">${fee} บาท/วัน</strong></div>
            <ul class="ap-summary__list">${lines}</ul>`;
    }

    function renderAppliances() {
        document.querySelectorAll('.ap-choice__btn').forEach((btn) => {
            const on = btn.dataset.choice === applianceChoice;
            btn.classList.toggle('is-on', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        $('appliancePicker').hidden = applianceChoice !== 'use';
        renderKindCards();
        renderPanel();
        renderApplianceSummary();
        onAppliancesChanged();
    }

    function serializeAppliances() {
        applianceItemsInput.value = JSON.stringify(activeItems().map((a) => ({ name: a.name, kind: a.kind, qty: a.qty })));
    }

    function applianceError() {
        if (!applianceChoice) return 'ยังไม่ได้ตอบว่าจะนำเครื่องใช้ไฟฟ้า/พัดลมมาไหม — กด "ไม่ใช้" หรือ "ใช้" แล้วเลือกเครื่อง';
        if (applianceChoice === 'use' && !appliances.length) return 'เลือกขนาด แล้วเลือกเครื่องที่จะนำมาอย่างน้อย 1 รายการ หรือเปลี่ยนเป็น "ไม่ใช้"';
        if (applianceChoice === 'use' && appliances.some((a) => !a.name)) return 'ใส่ชื่อเครื่องให้ครบทุกรายการ หรือกด × ลบรายการที่ไม่ใช้';
        return '';
    }

    function onAppliancesChanged() {
        serializeAppliances();
        if (applianceTouched) showError('applianceError', applianceError());
        recalc();
        scheduleDraftSave();
    }

    document.querySelectorAll('.ap-choice__btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            applianceChoice = btn.dataset.choice;
            renderAppliances();
        });
    });

    // ── สรุปยอด ──
    function totals() {
        const info = getDateInfo();
        const stalls = readStallCount();
        const counts = { SMALL: 0, LARGE: 0, FAN_SMALL: 0, FAN_LARGE: 0 };
        activeItems().forEach((a) => { if (counts[a.kind] !== undefined) counts[a.kind] += a.qty; });
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
        renderSteps();
    }

    // ── ความคืบหน้าแบบเดียวกับฟอร์มสมัครร้าน: เลขขั้นเป็นสีเขียว + "ครบแล้ว" เมื่อขั้นนั้นกรอกครบ
    // แถบล่างจอบอกว่าครบกี่ขั้นและเหลือขั้นไหน (ขั้นบังคับ 3 ขั้น — แผงพิเศษไม่บังคับ ไม่นับ) ──
    const STEPS = [
        { key: 'dates', label: 'วันที่ขาย', check: () => !dateError(getRound(), getDateInfo()) },
        { key: 'stalls', label: 'จำนวนล็อก', check: () => !stallError(getRound()) },
        { key: 'appliances', label: 'เครื่องใช้ไฟฟ้า', check: () => !applianceError() }
    ];

    function renderSteps() {
        const results = STEPS.map((step) => ({ ...step, done: step.check() }));
        const doneCount = results.filter((s) => s.done).length;
        const remaining = results.filter((s) => !s.done);
        const complete = remaining.length === 0;

        results.forEach((step) => {
            const section = document.querySelector(`.form-section[data-progress-step="${step.key}"]`);
            if (!section) return;
            section.classList.toggle('is-complete', step.done);
            const badge = section.querySelector('.form-section__done');
            if (badge) badge.hidden = !step.done;
        });

        $('stickyFill').style.width = `${(doneCount / STEPS.length) * 100}%`;
        const text = $('stickyProgress');
        text.textContent = complete
            ? 'กรอกครบแล้ว พร้อมตรวจทาน'
            : `กรอกแล้ว ${doneCount}/${STEPS.length} ขั้น · เหลือ: ${remaining.map((s) => s.label).join(', ')}`;
        text.classList.toggle('is-complete', complete);
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
                appliances: appliances.map((a) => ({ name: a.name, kind: a.kind, qty: a.qty })),
                applianceChoice
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
        applianceChoice = ['none', 'use'].includes(values.applianceChoice)
            ? values.applianceChoice
            : (appliances.length ? 'use' : (values.noAppliances ? 'none' : ''));
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
            // ครั้งก่อนไม่ได้แจ้งเครื่องใช้ไฟฟ้า = ใช้คำตอบเดิมว่า "ไม่ใช้"
            applianceChoice = appliances.length ? 'use' : 'none';
            renderAppliances();
            refreshAll();
            repeatBtn.textContent = 'ใช้ข้อมูลเดิมแล้ว ✓';
            repeatBtn.disabled = true;
            // รายการจากการจองรุ่นเก่ามีแค่จำนวน ไม่มีชื่อ — พาไปกรอกชื่อให้ครบ
            const unnamed = appliances.find((a) => !a.name);
            if (unnamed) {
                activeKind = unnamed.kind;
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
            ['เครื่องใช้ไฟฟ้า/พัดลม', activeItems().length
                ? activeItems().map((a) => `${escapeHtml(a.name)} ×${a.qty} <span class="muted">(${escapeHtml(KINDS[a.kind] ? KINDS[a.kind].label : a.kind)})</span>`).join('<br>')
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
        // ต้องส่งผ่าน event "submit" — tabSession.js แนบ tabToken ของแท็บตอนนั้น (form.submit() ข้าม event
        // ทำให้เซิร์ฟเวอร์ไปใช้ cookie ที่แชร์กันทุกแท็บ คำขออาจไปเป็นของบัญชีที่ล็อกอินอีกแท็บ)
        if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
        } else {
            const token = window.getTabToken ? window.getTabToken() : null;
            if (token && !form.querySelector('input[name="tabToken"]')) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = 'tabToken';
                input.value = token;
                form.appendChild(input);
            }
            form.submit();
        }
    });

    function validateAll() {
        const r = getRound();
        applianceTouched = true;
        const unnamed = appliances.find((a) => !a.name);
        if (applianceChoice === 'use' && unnamed) activeKind = unnamed.kind;
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
        if (submitting) return; // ยืนยันจากหน้าตรวจทานแล้ว ปล่อยให้ส่งจริง
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
    storeDetailInput.addEventListener('input', () => { renderSteps(); scheduleDraftSave(); });
    cornerInputs.forEach((el) => el.addEventListener('change', () => { renderSteps(); scheduleDraftSave(); }));
    $('draftClearBtn').addEventListener('click', () => {
        clearDraft();
        window.location.reload();
    });

    // ── หน้าเปิดค้างไว้: ข้าม 15:00 → ปิดการเริ่มขายวันนี้ / ข้ามวัน → บันทึกร่างแล้วโหลดหน้าใหม่ (รอบ/ช่วงคำนวณใหม่ฝั่งเซิร์ฟเวอร์) ──
    function marketDateKey(ms) {
        // en-CA ให้รูปแบบ YYYY-MM-DD ตรงกับ key ที่ใช้ทั้งไฟล์
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    }
    function checkMarketClock() {
        const nowMs = Date.now() + CLOCK_OFFSET_MS;
        if (marketDateKey(nowMs) !== TODAY) {
            // เปิดหน้าใหม่ด้วย GET เสมอ — หน้านี้อาจเป็นผลของ POST (เซิร์ฟเวอร์ตีกลับ) ถ้า reload() จะส่งฟอร์มซ้ำ
            saveDraft();
            const token = window.getTabToken ? window.getTabToken() : null;
            window.location.href = `/booking-stall?zone=${encodeURIComponent(DATA.zone || '')}${DATA.shopId ? `&shop=${DATA.shopId}` : ''}${token ? `&tabToken=${encodeURIComponent(token)}` : ''}`;
            return;
        }
        if (!DATA.sameDayClosed && DATA.sameDayCutoffMs && nowMs >= Number(DATA.sameDayCutoffMs)) {
            DATA.sameDayClosed = true;
            FIRST_START = addDaysKey(TODAY, 1);
            const hadToday = dateStartInput.value === TODAY;
            if (hadToday) {
                // เลื่อนไปเริ่มพรุ่งนี้โดยคงจำนวนวันเดิม (ไม่ให้ยอดเงินเปลี่ยนเพราะวันสิ้นสุดเด้งไปจบรอบ)
                const r = getRound();
                const length = Math.max(1, daysBetween(dateStartInput.value, dateEndInput.value));
                const newEnd = addDaysKey(FIRST_START, length - 1);
                setDates(FIRST_START, r && newEnd > r.cycleEnd ? r.cycleEnd : newEnd);
            }
            applyRound(true);
            if (hadToday) {
                window.showAlertDialog({
                    title: `เลย ${CUTOFF_HOUR}:00 น. แล้ว`,
                    message: `ขายวันนี้ต้องชำระก่อน ${CUTOFF_HOUR}:00 น. ระบบเลื่อนวันขายไปเริ่มพรุ่งนี้ (จำนวนวันเท่าเดิม) ให้แล้ว กรุณาตรวจวันที่อีกครั้ง`,
                    tone: 'warning'
                });
            }
        }
    }
    setInterval(checkMarketClock, 30 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkMarketClock(); });

    // ── เริ่มต้น: ค่าที่เซิร์ฟเวอร์ตีกลับมาก่อน > ร่างในเครื่อง > ค่าเริ่มต้น ──
    let restored = false;
    if (DATA.formValues) {
        let items = [];
        try { items = JSON.parse(DATA.formValues.applianceItems || '[]') || []; } catch (e) { items = []; }
        // ส่งฟอร์มมาแล้ว (เซิร์ฟเวอร์ตีกลับ) รายการว่าง = ผู้ขายเลือก "ไม่ใช้" ไว้
        restoreValues({ ...DATA.formValues, noAppliances: true }, Array.isArray(items) ? items : []);
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
