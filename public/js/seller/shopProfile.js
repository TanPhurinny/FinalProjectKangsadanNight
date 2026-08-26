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

// ── แกลเลอรีรูปสินค้า: มีรูปเดิมที่บันทึกไว้แล้ว + เพิ่ม/ลบได้หลายรูปก่อนกดบันทึก ──
const productImagesUpload = document.getElementById('productImagesUpload');
const productImagesUploadLabel = document.getElementById('productImagesUploadLabel');
const removeProductImageIdsInput = document.getElementById('removeProductImageIdsInput');

if (productImagesUpload && productImagesUploadLabel) {
    const maxProductImages = productImagesUpload.dataset.max ? Number(productImagesUpload.dataset.max) : 6;
    let existingCount = productImagesUpload.dataset.existing ? Number(productImagesUpload.dataset.existing) : 0;
    const removedIds = [];
    let selectedFiles = [];

    function allowedNewCount() {
        return Math.max(0, maxProductImages - existingCount);
    }

    function syncProductImagesInput() {
        const dt = new DataTransfer();
        selectedFiles.forEach((file) => dt.items.add(file));
        productImagesUpload.files = dt.files;
    }

    function renderProductImagePreviews() {
        productImagesUploadLabel.innerHTML = '';
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
                    syncProductImagesInput();
                    renderProductImagePreviews();
                });
                productImagesUploadLabel.appendChild(item);
            };
            reader.readAsDataURL(file);
        });
        if (selectedFiles.length < allowedNewCount()) {
            const addBox = document.createElement('div');
            addBox.className = 'upload-add-icon';
            productImagesUploadLabel.appendChild(addBox);
        }
    }

    productImagesUpload.addEventListener('change', function (e) {
        const incoming = Array.from(e.target.files || []);
        selectedFiles = selectedFiles.concat(incoming).slice(0, allowedNewCount());
        syncProductImagesInput();
        renderProductImagePreviews();
    });

    document.querySelectorAll('.existing-remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const imageId = btn.dataset.imageId;
            removedIds.push(imageId);
            if (removeProductImageIdsInput) removeProductImageIdsInput.value = removedIds.join(',');
            const thumb = btn.closest('.existing-thumb');
            if (thumb) thumb.remove();
            existingCount = Math.max(0, existingCount - 1);
            if (selectedFiles.length > allowedNewCount()) {
                selectedFiles = selectedFiles.slice(0, allowedNewCount());
                syncProductImagesInput();
            }
            renderProductImagePreviews();
        });
    });

    renderProductImagePreviews();
}

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
