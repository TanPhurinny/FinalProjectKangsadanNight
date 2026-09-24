const imageUpload = document.getElementById('imageUpload');
const imagePreview = document.getElementById('imagePreview');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const submitBtn = document.getElementById('submitBtn');
const shopApplicationForm = document.querySelector('form');

if (imageUpload && imagePreview) {
    imageUpload.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                imagePreview.src = e.target.result;
                imagePreview.hidden = false;
                if (uploadPlaceholder) uploadPlaceholder.hidden = true;
            };
            reader.readAsDataURL(file);
        } else {
            imagePreview.src = '';
            imagePreview.hidden = true;
            if (uploadPlaceholder) uploadPlaceholder.hidden = false;
        }
    });
}

if (shopApplicationForm && submitBtn) {
    shopApplicationForm.addEventListener('submit', function () {
        if (!submitBtn.disabled) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'กำลังส่งข้อมูล...';
        }
    });
}

// --- กฎระเบียบร้านค้า: ต้องกดยอมรับก่อนถึงจะส่งใบสมัครได้ ---
const rulesOverlay = document.getElementById('rulesOverlay');
const rulesConsentCheckbox = document.getElementById('rulesConsentCheckbox');
const rulesAcceptBtn = document.getElementById('rulesAcceptBtn');
const termsAcceptedInput = document.getElementById('termsAcceptedInput');
const reopenRulesBtn = document.getElementById('reopenRulesBtn');

if (rulesConsentCheckbox && rulesAcceptBtn) {
    rulesConsentCheckbox.addEventListener('change', function () {
        rulesAcceptBtn.disabled = !rulesConsentCheckbox.checked;
    });
}

if (rulesAcceptBtn && rulesOverlay && termsAcceptedInput) {
    rulesAcceptBtn.addEventListener('click', function () {
        termsAcceptedInput.value = 'true';
        rulesOverlay.hidden = true;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'ส่งใบสมัคร';
        }
    });
}

if (reopenRulesBtn && rulesOverlay) {
    reopenRulesBtn.addEventListener('click', function () {
        rulesOverlay.hidden = false;
    });
}

// --- ประเภทสินค้าเฉพาะ: โชว์เฉพาะกลุ่ม checkbox ที่ตรงกับ "ประเภทสินค้า" ที่เลือกไว้ด้านบน ---
// (ช่วยจัดระยะห่างล็อกตอนแอดมินจัดล็อก ดู utils/productSubtypes.js / utils/stallSpacing.js)
const productTypeSelect = document.querySelector('select[name="productType"]');
const subtypePanels = document.querySelectorAll('.subtype-panel');
const subtypeHint = document.getElementById('productSubtypeHint');

function syncProductSubtypePanel() {
    if (!productTypeSelect) return;
    const selectedType = productTypeSelect.value;
    let matched = false;
    subtypePanels.forEach(function (panel) {
        const show = panel.dataset.productType === selectedType;
        panel.hidden = !show;
        if (show) matched = true;
        if (!show) {
            // ซ่อนกลุ่มไหนก็เลิกติ๊กของกลุ่มนั้น กันส่ง subtype ที่ไม่ตรงกับ productType ที่เลือกจริง
            panel.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
        }
    });
    if (subtypeHint) {
        subtypeHint.hidden = matched;
    }
    syncSubtypeCounts();
}

// นับจำนวนที่ติ๊กไว้ ทั้งรวม (badge บน label) และต่อกลุ่ม (badge บน summary แต่ละกลุ่ม)
// อัปเดตทุกครั้งที่ติ๊ก/เลิกติ๊ก ให้เห็นสดๆ ว่าเลือกไปกี่รายการแล้ว
const subtypeCountBadge = document.getElementById('subtypeCount');
function syncSubtypeCounts() {
    let total = 0;
    document.querySelectorAll('.subtype-group').forEach(function (group) {
        const checked = group.querySelectorAll('input[type="checkbox"][name="productSubtype"]:checked').length;
        const countBadge = group.querySelector('.subtype-group__count');
        if (countBadge) {
            countBadge.textContent = checked;
            countBadge.hidden = checked === 0;
        }
        total += checked;
    });
    if (subtypeCountBadge) {
        subtypeCountBadge.textContent = total;
        subtypeCountBadge.hidden = total === 0;
    }
}

if (productTypeSelect && subtypePanels.length) {
    productTypeSelect.addEventListener('change', syncProductSubtypePanel);
    syncProductSubtypePanel();
}

document.querySelectorAll('input[type="checkbox"][name="productSubtype"]').forEach(function (cb) {
    cb.addEventListener('change', syncSubtypeCounts);
});
syncSubtypeCounts();

// --- "อื่นๆ (ระบุ)" ติ๊กแล้วค่อยโชว์ช่องพิมพ์ ไม่ติ๊กก็เคลียร์ค่าทิ้ง ---
const subtypeOtherToggle = document.getElementById('subtypeOtherToggle');
const subtypeOtherInput = document.getElementById('subtypeOtherInput');
if (subtypeOtherToggle && subtypeOtherInput) {
    subtypeOtherToggle.addEventListener('change', function () {
        subtypeOtherInput.hidden = !subtypeOtherToggle.checked;
        if (!subtypeOtherToggle.checked) subtypeOtherInput.value = '';
    });
}
