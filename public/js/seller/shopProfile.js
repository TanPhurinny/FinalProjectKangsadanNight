function bindImagePreview(inputId, previewId, removeBtnId, removeFlagId, frameId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const removeBtn = document.getElementById(removeBtnId);
    const removeFlag = document.getElementById(removeFlagId);
    const frame = document.getElementById(frameId);
    if (!input || !preview) return;

    input.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        if (removeFlag) removeFlag.value = '';
        const reader = new FileReader();
        reader.onload = function (e) {
            preview.src = e.target.result;
            preview.style.display = 'block';
            if (removeBtn) removeBtn.style.display = 'flex';
            if (frame) frame.classList.add('has-image');
        };
        reader.readAsDataURL(file);
    });

    if (removeBtn) {
        removeBtn.addEventListener('click', function () {
            input.value = '';
            preview.src = '';
            preview.style.display = 'none';
            removeBtn.style.display = 'none';
            if (removeFlag) removeFlag.value = '1';
            if (frame) frame.classList.remove('has-image');
        });
    }
}

bindImagePreview('shopCoverImageUpload', 'shopCoverImagePreview', 'shopCoverImageRemoveBtn', 'removeShopCoverImageFlag', 'shopCoverImageFrame');

// ── เมนูเด่น/คำค้นหา: พิมพ์แล้วกด Enter/, เพื่อเด้งเป็นป้ายแยก กดกากบาทที่ป้ายเพื่อลบทิ้ง ──
// เก็บค่าจริงไว้ใน hidden input (คั่นด้วยจุลภาค) ให้ backend อ่านเหมือนเดิม ไม่ต้องแก้ฝั่ง server
(function () {
    const box = document.getElementById('shopTagsBox');
    const field = document.getElementById('shopTagsField');
    const hidden = document.getElementById('shopTagsHidden');
    if (!box || !field || !hidden) return;

    let tags = String(hidden.value || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

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
        const value = field.value.trim();
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

// ── แกลเลอรีรูป (รูปสินค้า / รูปเมนู): มีรูปเดิมที่บันทึกไว้แล้ว + เพิ่ม/ลบได้หลายรูปก่อนกดบันทึก ──
function bindGalleryUpload(wrapperId, inputId, labelId, removeIdsInputId) {
    const wrapper = document.getElementById(wrapperId);
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    const removeIdsInput = document.getElementById(removeIdsInputId);
    if (!wrapper || !input || !label) return;

    const maxImages = input.dataset.max ? Number(input.dataset.max) : 6;
    let existingCount = input.dataset.existing ? Number(input.dataset.existing) : 0;
    const removedIds = [];
    let selectedFiles = [];

    function allowedNewCount() {
        return Math.max(0, maxImages - existingCount);
    }

    function syncInput() {
        const dt = new DataTransfer();
        selectedFiles.forEach((file) => dt.items.add(file));
        input.files = dt.files;
    }

    function renderPreviews() {
        label.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const item = document.createElement('div');
                item.className = 'upload-thumb-item';
                item.innerHTML = `<img src="${e.target.result}" alt="Preview ${index + 1}">
                    <button type="button" class="upload-thumb-remove" data-index="${index}" title="ลบรูปนี้">&times;</button>`;
                item.querySelector('.upload-thumb-remove').addEventListener('click', function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    selectedFiles.splice(index, 1);
                    syncInput();
                    renderPreviews();
                });
                label.appendChild(item);
            };
            reader.readAsDataURL(file);
        });
        if (selectedFiles.length < allowedNewCount()) {
            const addBox = document.createElement('div');
            addBox.className = 'upload-add-icon';
            addBox.innerHTML = '<i class="fa-solid fa-camera"></i><span>เพิ่มรูป</span>';
            label.appendChild(addBox);
        }
    }

    input.addEventListener('change', function (e) {
        const incoming = Array.from(e.target.files || []);
        selectedFiles = selectedFiles.concat(incoming).slice(0, allowedNewCount());
        syncInput();
        renderPreviews();
    });

    // จำกัดเฉพาะปุ่มลบในแกลเลอรีนี้ — หน้านี้มีหลายแกลเลอรีที่ใช้คลาสเดียวกัน
    wrapper.querySelectorAll('.existing-remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            removedIds.push(btn.dataset.imageId);
            if (removeIdsInput) removeIdsInput.value = removedIds.join(',');
            const thumb = btn.closest('.existing-thumb');
            if (thumb) thumb.remove();
            existingCount = Math.max(0, existingCount - 1);
            if (selectedFiles.length > allowedNewCount()) {
                selectedFiles = selectedFiles.slice(0, allowedNewCount());
                syncInput();
            }
            renderPreviews();
        });
    });

    renderPreviews();
}

bindGalleryUpload('productImagesWrapper', 'productImagesUpload', 'productImagesUploadLabel', 'removeProductImageIdsInput');
bindGalleryUpload('menuImagesWrapper', 'menuImagesUpload', 'menuImagesUploadLabel', 'removeMenuImageIdsInput');

const shopProfileForm = document.querySelector('form[action="/shop-profile"]');
const submitBtn = document.getElementById('submitBtn');
if (shopProfileForm && submitBtn) {
    shopProfileForm.addEventListener('submit', function () {
        if (!submitBtn.disabled) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'กำลังบันทึก...';
        }
    });
}
