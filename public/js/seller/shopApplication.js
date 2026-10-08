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

// --- ประเภทสินค้า: บอกโซนที่จองล็อกได้หลังอนุมัติ (ค่ามาจาก utils/zoneAccess.js ผ่าน data-zones) ---
(function () {
    const select = document.getElementById('productTypeSelect');
    const hint = document.getElementById('productTypeZoneHint');
    if (!select || !hint) return;
    const defaultText = hint.textContent;
    function syncZoneHint() {
        const option = select.selectedOptions[0];
        const zones = option && option.value ? option.dataset.zones : '';
        hint.textContent = zones
            ? `ประเภทนี้จองล็อกได้ในโซน ${zones} — แก้ประเภทเองไม่ได้หลังอนุมัติ`
            : defaultText;
    }
    select.addEventListener('change', syncZoneHint);
    syncZoneHint();
})();

// --- เมนูเด่น/คำค้นหา: พิมพ์แล้วกด Enter/, เด้งเป็นป้าย (แบบเดียวกับ shopProfile.js) เก็บค่าจริงคั่นจุลภาคใน hidden input ---
(function () {
    const box = document.getElementById('shopTagsBox');
    const field = document.getElementById('shopTagsField');
    const hidden = document.getElementById('shopTagsHidden');
    if (!box || !field || !hidden) return;

    let tags = String(hidden.value || '').split(',').map((t) => t.trim()).filter(Boolean);

    function syncHidden() {
        hidden.value = tags.join(',');
    }

    function renderTags() {
        box.querySelectorAll('.tag-chip').forEach((chip) => chip.remove());
        tags.forEach((tag, index) => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            const label = document.createElement('span');
            label.textContent = tag;
            chip.appendChild(label);
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'tag-chip-remove';
            removeBtn.title = 'ลบป้ายนี้';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', function () {
                tags.splice(index, 1);
                syncHidden();
                renderTags();
            });
            chip.appendChild(removeBtn);
            box.insertBefore(chip, field);
        });
    }

    function addTagFromField() {
        const value = field.value.replace(/,/g, '').trim();
        if (!value) return;
        if (!tags.includes(value)) tags.push(value);
        field.value = '';
        syncHidden();
        renderTags();
    }

    field.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTagFromField();
        } else if (e.key === 'Backspace' && !field.value && tags.length) {
            tags.pop();
            syncHidden();
            renderTags();
        }
    });
    field.addEventListener('blur', addTagFromField);
    box.addEventListener('click', function (e) {
        if (e.target === box) field.focus();
    });

    renderTags();
})();

// --- แกลเลอรีรูปสินค้า/รูปเมนู: เลือกได้หลายรูป ลบทีละรูปก่อนส่ง (แบบเดียวกับ bindGalleryUpload ใน shopProfile.js
// แต่ไม่มีรูปเดิม เพราะใบสมัครเป็นของใหม่ทุกครั้ง) — เก็บไฟล์จริงไว้ใน input ผ่าน DataTransfer ---
function bindApplicationGallery(inputId, labelId) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;

    const maxImages = Number(input.dataset.max) || 4;
    let selectedFiles = [];

    function syncInput() {
        const dt = new DataTransfer();
        selectedFiles.forEach((file) => dt.items.add(file));
        input.files = dt.files;
    }

    function renderPreviews() {
        label.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'upload-thumb-item';
            const img = document.createElement('img');
            img.alt = `รูปที่ ${index + 1}`;
            img.src = URL.createObjectURL(file);
            img.onload = () => URL.revokeObjectURL(img.src);
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'upload-thumb-remove';
            removeBtn.title = 'ลบรูปนี้';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                selectedFiles.splice(index, 1);
                syncInput();
                renderPreviews();
            });
            item.append(img, removeBtn);
            label.appendChild(item);
        });
        if (selectedFiles.length < maxImages) {
            const addBox = document.createElement('div');
            addBox.className = 'upload-add-icon';
            addBox.innerHTML = '<i class="fa-solid fa-camera"></i><span>เพิ่มรูป</span>';
            label.appendChild(addBox);
        }
    }

    input.addEventListener('change', function (e) {
        const incoming = Array.from(e.target.files || []);
        selectedFiles = selectedFiles.concat(incoming).slice(0, maxImages);
        syncInput();
        renderPreviews();
    });

    renderPreviews();
}

bindApplicationGallery('productImagesUpload', 'productImagesUploadLabel');
bindApplicationGallery('menuImagesUpload', 'menuImagesUploadLabel');
