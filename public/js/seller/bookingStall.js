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
    const lightEnabled = document.querySelector('input[name="light"]:checked')?.value === 'yes';

    const rentTotal = PRICE_PER_STALL_PER_DAY * stallCount * days;
    const lightTotal = lightEnabled ? LIGHT_UNIT_PRICE * stallCount * days : 0;
    const applianceTotal = ((smallCount * SMALL_PRICE) + (largeCount * LARGE_PRICE)) * days;
    const grandTotal = rentTotal + lightTotal + applianceTotal;

    document.getElementById('rentalDaysText').textContent = days + ' วัน';
    document.getElementById('rentTotalText').textContent = formatBaht(rentTotal);
    document.getElementById('lightTotalText').textContent = formatBaht(lightTotal);
    document.getElementById('applianceTotalText').textContent = formatBaht(applianceTotal);
    document.getElementById('grandTotalText').textContent = formatBaht(grandTotal);
}

const today = new Date().toISOString().split('T')[0];
dateStartInput.min = today;
dateEndInput.min = today;

[dateStartInput, dateEndInput, stallCountInput, smallApplianceInput, largeApplianceInput].forEach((el) => {
    el.addEventListener('change', recalcSummary);
    el.addEventListener('input', recalcSummary);
});

document.querySelectorAll('input[name="light"]').forEach((el) => {
    el.addEventListener('change', recalcSummary);
});

bookingForm.addEventListener('submit', (event) => {
    if (!dateStartInput.value || !dateEndInput.value) {
        event.preventDefault();
        window.alert('กรุณาเลือกวันที่เช่าให้ครบถ้วน');
        return;
    }

    const startDate = new Date(dateStartInput.value);
    const endDate = new Date(dateEndInput.value);
    if (endDate < startDate) {
        event.preventDefault();
        window.alert('วันที่สิ้นสุดต้องมากกว่าหรือเท่ากับวันที่เริ่มเช่า');
        return;
    }
});

recalcSummary();
