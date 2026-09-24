const PRICING_DATA = window.PRICING_DATA || {};
const PRICE_PER_STALL_PER_DAY = Number(PRICING_DATA.zonePrice || 0);
const LIGHT_UNIT_PRICE = Number(PRICING_DATA.lightUnitPrice || 15);
const SMALL_PRICE = Number(PRICING_DATA.smallAppliancePrice || 20);
const LARGE_PRICE = Number(PRICING_DATA.largeAppliancePrice || 40);
const MAX_STALLS_PER_SELLER = Number(PRICING_DATA.maxStallsPerSeller || 2);
const IS_FASHION_SELLER = Boolean(PRICING_DATA.isFashionSeller);

const dateStartInput = document.getElementById('dateStart');
const dateEndInput = document.getElementById('dateEnd');
const stallCountInput = document.getElementById('stallCount');
const stallCountNote = document.getElementById('stallCountNote');
const smallApplianceInput = document.getElementById('smallApplianceCount');
const largeApplianceInput = document.getElementById('largeApplianceCount');
const bookingForm = document.getElementById('bookingForm');
const submitBtn = bookingForm ? bookingForm.querySelector('.btn-confirm') : null;

const EXISTING_LOCK_COUNT = parseInt(stallCountInput.dataset.existingLocks, 10) || 0;
const stallCountNoteDefault = stallCountNote ? stallCountNote.textContent : '';

function isStallCountValid() {
    if (IS_FASHION_SELLER) return true;
    const value = parseInt(stallCountInput.value, 10) || 1;
    return EXISTING_LOCK_COUNT + value <= MAX_STALLS_PER_SELLER;
}

// เช็คสดทันทีที่พิมพ์ ไม่ต้องรอกด submit ถึงจะรู้ว่าเกิน cap
function validateStallCountLive() {
    if (!stallCountInput) return;
    const valid = isStallCountValid();
    stallCountInput.classList.toggle('field-input--error', !valid);
    if (stallCountNote) {
        stallCountNote.classList.toggle('field-note--error', !valid);
        if (!valid) {
            const remaining = Math.max(0, MAX_STALLS_PER_SELLER - EXISTING_LOCK_COUNT);
            stallCountNote.textContent = `เกินจำนวนที่จองได้ — จองเพิ่มได้อีกไม่เกิน ${remaining} ล็อคเท่านั้น (รวมทุกโซน ไม่เกิน ${MAX_STALLS_PER_SELLER} ล็อค/คน/รอบ)`;
        } else {
            stallCountNote.textContent = stallCountNoteDefault;
        }
    }
}
if (stallCountInput) {
    stallCountInput.addEventListener('input', validateStallCountLive);
    stallCountInput.addEventListener('change', validateStallCountLive);
}

function calculateDays() {
    const startVal = dateStartInput.value;
    const endVal = dateEndInput.value;
    if (!startVal || !endVal) return 1;

    const startDate = new Date(startVal);
    const endDate = new Date(endVal);
    const diffMs = endDate.getTime() - startDate.getTime();
    if (Number.isNaN(diffMs) || diffMs < 0) return 1;

    return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

function readCount(input, fallback = 0) {
    const parsed = parseInt(input.value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, parsed);
}

function formatBaht(value) {
    return Number(value || 0).toLocaleString('th-TH') + ' บาท';
}

function recalcSummary() {
    const days = calculateDays();
    const stallCount = Math.max(1, readCount(stallCountInput, 1));
    const smallCount = readCount(smallApplianceInput);
    const largeCount = readCount(largeApplianceInput);

    const rentTotal = PRICE_PER_STALL_PER_DAY * stallCount * days;
    const lightTotal = LIGHT_UNIT_PRICE * stallCount * days;
    const applianceTotal = ((smallCount * SMALL_PRICE) + (largeCount * LARGE_PRICE)) * days;
    const grandTotal = rentTotal + lightTotal + applianceTotal;

    document.getElementById('rentalDaysText').textContent = days + ' วัน';
    document.getElementById('rentTotalText').textContent = formatBaht(rentTotal);
    document.getElementById('lightTotalText').textContent = formatBaht(lightTotal);
    document.getElementById('applianceTotalText').textContent = formatBaht(applianceTotal);

    document.getElementById('grandTotalText').textContent = formatBaht(grandTotal);
}

// วันเริ่ม/สิ้นสุดขายถูกจำกัดตาม "ช่วง" ของรอบที่เลือก (ดู utils/bookingRound.js ฝั่งเซิร์ฟเวอร์)
// ใช้ input type="date" ปกติ แต่ตั้ง min/max ปิดวันที่ไม่เกี่ยวออกไป ไม่ให้เลือกได้
const roundChoiceInputs = document.querySelectorAll('input[name="roundChoice"]');
const phaseHintBox = document.getElementById('phaseHintBox');
const fullRoundBtn = document.getElementById('fullRoundBtn');
const cornerZoneSection = document.getElementById('cornerZoneSection');

function getSelectedRound() {
    return document.querySelector('input[name="roundChoice"]:checked');
}

// วันนี้แบบ YYYY-MM-DD เทียบ string ได้ตรงกับ input type="date" (รอบที่เปิดจองอยู่แล้ว
// cycleStart อาจเป็นวันที่ผ่านมาแล้ว ต้องกันไม่ให้เลือกวันที่ผ่านมาแล้วในปฏิทิน)
function todayDateInputValue() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function resetCornerZoneToNone() {
    const noneOption = document.querySelector('input[name="cornerZone"][value="0"]');
    if (noneOption) noneOption.checked = true;
}

function applySelectedRound() {
    const selected = getSelectedRound();
    if (!selected) return;

    const cycleStart = selected.dataset.cycleStart || '';
    const cycleEnd = selected.dataset.cycleEnd || '';
    const phase = selected.dataset.phase;
    const maxAdvanceStart = selected.dataset.maxAdvanceStart || '';
    const allowCorner = selected.dataset.allowCorner === '1';

    if (phaseHintBox) phaseHintBox.textContent = selected.dataset.hint || '';

    // ช่วงที่ 1 (จันทร์-อังคาร): จองเต็มรอบ 14 วันเท่านั้น กดปุ่มเต็มรอบได้
    // ช่วงที่ 2 (พุธ-จบรอบ): เลือกวันที่เองในกรอบรอบ ขั้นต่ำ 3 วัน หรือจองทีละวัน วันเริ่มล่วงหน้าได้แค่พรุ่งนี้เท่านั้น
    const today = todayDateInputValue();
    const effectiveMin = cycleStart > today ? cycleStart : today;
    dateStartInput.min = effectiveMin;
    dateStartInput.max = (phase === 2 || phase === '2') && maxAdvanceStart ? maxAdvanceStart : cycleEnd;
    dateEndInput.min = effectiveMin;
    dateEndInput.max = cycleEnd;

    if (phase === 1 || phase === '1') {
        dateStartInput.value = cycleStart;
        dateEndInput.value = cycleEnd;
        if (fullRoundBtn) fullRoundBtn.style.display = '';
    } else if (fullRoundBtn) {
        fullRoundBtn.style.display = 'none';
    }

    if (phase === 2 || phase === '2') {
        dateStartInput.value = cycleStart > (maxAdvanceStart || cycleStart) ? cycleStart : (maxAdvanceStart || cycleStart);
        dateEndInput.value = cycleEnd;
    }

    // ไม่ซ่อนทั้ง section ตอนขอล็อคเต็งไม่ได้ (จะทำให้เลขหัวข้อ 01-06 กระโดดข้าม 05 หายไปดูแปลก)
    // แค่หรี่ + ปิดกดไม่ได้แทน ให้เห็นว่ามีตัวเลือกนี้อยู่แต่ยังใช้ไม่ได้ช่วงนี้
    if (cornerZoneSection) {
        cornerZoneSection.classList.toggle('is-disabled', !allowCorner);
    }
    if (!allowCorner) resetCornerZoneToNone();

    recalcSummary();
}

roundChoiceInputs.forEach((el) => {
    el.addEventListener('change', applySelectedRound);
});
if (fullRoundBtn) {
    fullRoundBtn.addEventListener('click', () => {
        const selected = getSelectedRound();
        if (!selected) return;
        dateStartInput.value = selected.dataset.cycleStart || '';
        dateEndInput.value = selected.dataset.cycleEnd || '';
        recalcSummary();
    });
}
applySelectedRound();

[dateStartInput, dateEndInput, stallCountInput, smallApplianceInput, largeApplianceInput].forEach((el) => {
    el.addEventListener('change', recalcSummary);
    el.addEventListener('input', recalcSummary);
});

document.querySelectorAll('input[name="cornerZone"]').forEach((el) => {
    el.addEventListener('change', recalcSummary);
});

bookingForm.addEventListener('submit', (event) => {
    const selected = getSelectedRound();

    if (!selected || selected.disabled) {
        event.preventDefault();
        window.showAlertDialog({ title: 'เลือกรอบการจองก่อน', message: 'กรุณาเลือกรอบการจองที่เปิดให้จองอยู่', tone: 'warning' });
        return;
    }

    if (!dateStartInput.value || !dateEndInput.value) {
        event.preventDefault();
        window.showAlertDialog({ title: 'กรอกวันที่ไม่ครบ', message: 'กรุณาเลือกวันที่ขายให้ครบถ้วน', tone: 'warning' });
        return;
    }

    const startDate = new Date(dateStartInput.value);
    const endDate = new Date(dateEndInput.value);
    if (endDate < startDate) {
        event.preventDefault();
        window.showAlertDialog({ title: 'วันที่ไม่ถูกต้อง', message: 'วันที่สิ้นสุดต้องมากกว่าหรือเท่ากับวันที่เริ่มขาย', tone: 'warning' });
        return;
    }

    const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const phase = selected.dataset.phase;
    const minDays = parseInt(selected.dataset.minDays, 10) || 1;
    const allowSingleDay = selected.dataset.allowSingleDay === '1';
    const cornerZoneChecked = document.querySelector('input[name="cornerZone"]:checked');
    const cornerZoneValue = cornerZoneChecked ? parseInt(cornerZoneChecked.value, 10) : 0;

    if (cornerZoneValue > 0 && selected.dataset.allowCorner !== '1') {
        event.preventDefault();
        window.showAlertDialog({ title: 'เลือกล็อคเต็งไม่ได้', message: 'เลือกล็อคเต็ง (แผงพิเศษ) ได้เฉพาะช่วงจันทร์-อังคารก่อนเปิดรอบเท่านั้น', tone: 'warning' });
        return;
    }

    // จำกัดจำนวนล็อคต่อคำขอ รวมล็อคที่มีอยู่แล้วในรอบนี้ (เช็คเบื้องต้นฝั่ง client — ของจริงเช็คซ้ำฝั่ง server เสมอ)
    if (!isStallCountValid()) {
        event.preventDefault();
        const remaining = Math.max(0, MAX_STALLS_PER_SELLER - EXISTING_LOCK_COUNT);
        window.showAlertDialog({ title: 'จองเกินจำนวนที่กำหนด', message: `คุณมีล็อคอยู่แล้ว ${EXISTING_LOCK_COUNT} ล็อคในรอบนี้ จองเพิ่มได้อีกไม่เกิน ${remaining} ล็อค (รวมทุกโซน ไม่เกิน ${MAX_STALLS_PER_SELLER} ล็อค/คน/รอบ) ยกเว้นร้านแฟชั่นที่ขึ้นอยู่กับดุลยพินิจแอดมิน`, tone: 'warning' });
        return;
    }

    if (phase === 1 || phase === '1') {
        // ช่วงจันทร์-อังคารก่อนเปิดรอบ: ล็อคเต็งและล็อคปกติต้องจองเต็มรอบ 14 วันเหมือนกัน บังคับน้อยกว่านี้ไม่ได้
        const isFullRound = dateStartInput.value === selected.dataset.cycleStart && dateEndInput.value === selected.dataset.cycleEnd;
        if (!isFullRound) {
            event.preventDefault();
            window.showAlertDialog({ title: 'จองได้แค่เต็มรอบ', message: 'ช่วงจันทร์-อังคารก่อนเปิดรอบ จองได้เฉพาะเต็มรอบ 14 วันเท่านั้น (รวมถึงล็อคเต็งด้วย)', tone: 'warning' });
            return;
        }
    }

    if (diffDays < minDays && !(allowSingleDay && diffDays === 1)) {
        event.preventDefault();
        window.showAlertDialog({ title: 'จองวันน้อยเกินไป', message: `ช่วงนี้ต้องจองต่อเนื่องอย่างน้อย ${minDays} วัน หรือจองทีละ 1 วัน`, tone: 'warning' });
        return;
    }

    if ((phase === 2 || phase === '2') && selected.dataset.maxAdvanceStart) {
        const maxAdvance = new Date(selected.dataset.maxAdvanceStart);
        if (startDate > maxAdvance) {
            event.preventDefault();
            window.showAlertDialog({ title: 'จองล่วงหน้าเกินกำหนด', message: 'จองล่วงหน้าได้แค่ 1 วันก่อนวันขายเท่านั้น', tone: 'warning' });
            return;
        }
    }

    // ผ่านทุกเงื่อนไขแล้ว กันกดซ้ำ/ดับเบิลคลิกส่งฟอร์มซ้อน ระหว่างรอ server ตอบกลับ
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังบันทึก...';
    }
});

recalcSummary();

validateStallCountLive();
