const PRICING_DATA = window.PRICING_DATA || {};
const PRICE_PER_STALL_PER_DAY = Number(PRICING_DATA.zonePrice || 0);
const LIGHT_UNIT_PRICE = Number(PRICING_DATA.lightUnitPrice || 15);
const SMALL_PRICE = Number(PRICING_DATA.smallAppliancePrice || 20);
const LARGE_PRICE = Number(PRICING_DATA.largeAppliancePrice || 40);

const dateStartInput = document.getElementById('dateStart');
const dateEndInput = document.getElementById('dateEnd');
const stallCountInput = document.getElementById('stallCount');
const smallApplianceInput = document.getElementById('smallApplianceCount');
const largeApplianceInput = document.getElementById('largeApplianceCount');
const bookingForm = document.getElementById('bookingForm');

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

    // ช่วงที่ 1 (จันทร์-อังคาร): เลือกวันที่เองได้ในกรอบรอบ หรือกดปุ่มเต็มรอบ
    // ช่วงที่ 2 (พุธ): เลือกวันที่เองในกรอบรอบ ขั้นต่ำ 3 วัน
    // ช่วงที่ 3 (พฤหัส-จบรอบ): วันเริ่มจำกัดแค่วันนี้/พรุ่งนี้เท่านั้น
    dateStartInput.min = cycleStart;
    dateStartInput.max = (phase === '3' || phase === 3) && maxAdvanceStart ? maxAdvanceStart : cycleEnd;
    dateEndInput.min = cycleStart;
    dateEndInput.max = cycleEnd;

    if (phase === 1 || phase === '1') {
        dateStartInput.value = cycleStart;
        dateEndInput.value = cycleEnd;
        if (fullRoundBtn) fullRoundBtn.style.display = '';
    } else if (fullRoundBtn) {
        fullRoundBtn.style.display = 'none';
    }

    if (phase === 2 || phase === '2') {
        dateStartInput.value = cycleStart;
        dateEndInput.value = cycleEnd;
    }

    if (phase === 3 || phase === '3') {
        dateStartInput.value = cycleStart > (maxAdvanceStart || cycleStart) ? cycleStart : (maxAdvanceStart || cycleStart);
        dateEndInput.value = cycleEnd;
    }

    if (cornerZoneSection) {
        cornerZoneSection.style.display = allowCorner ? '' : 'none';
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
        window.alert('กรุณาเลือกรอบการจองที่เปิดให้จองอยู่');
        return;
    }

    if (!dateStartInput.value || !dateEndInput.value) {
        event.preventDefault();
        window.alert('กรุณาเลือกวันที่ขายให้ครบถ้วน');
        return;
    }

    const startDate = new Date(dateStartInput.value);
    const endDate = new Date(dateEndInput.value);
    if (endDate < startDate) {
        event.preventDefault();
        window.alert('วันที่สิ้นสุดต้องมากกว่าหรือเท่ากับวันที่เริ่มขาย');
        return;
    }

    const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const phase = selected.dataset.phase;
    const minDays = parseInt(selected.dataset.minDays, 10) || 1;
    const cornerZoneChecked = document.querySelector('input[name="cornerZone"]:checked');
    const cornerZoneValue = cornerZoneChecked ? parseInt(cornerZoneChecked.value, 10) : 0;

    if (cornerZoneValue > 0 && selected.dataset.allowCorner !== '1') {
        event.preventDefault();
        window.alert('เลือกล็อคเต็ง (แผงพิเศษ) ได้เฉพาะช่วงจันทร์-อังคารก่อนเปิดรอบเท่านั้น');
        return;
    }

    if ((phase === 1 || phase === '1') && cornerZoneValue === 0) {
        const isFullRound = dateStartInput.value === selected.dataset.cycleStart && dateEndInput.value === selected.dataset.cycleEnd;
        if (!isFullRound) {
            event.preventDefault();
            window.alert('ช่วงจันทร์-อังคารก่อนเปิดรอบ จองได้เฉพาะเต็มรอบ 14 วัน หรือเลือกล็อคเต็งเท่านั้น');
            return;
        }
    }

    if (diffDays < minDays) {
        event.preventDefault();
        window.alert(`ช่วงนี้ต้องจองต่อเนื่องอย่างน้อย ${minDays} วัน`);
        return;
    }

    if ((phase === 3 || phase === '3') && selected.dataset.maxAdvanceStart) {
        const maxAdvance = new Date(selected.dataset.maxAdvanceStart);
        if (startDate > maxAdvance) {
            event.preventDefault();
            window.alert('จองล่วงหน้าได้แค่ 1 วันก่อนวันขายเท่านั้น');
            return;
        }
    }
});

recalcSummary();
