function bindImagePreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;

    input.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    });
}

bindImagePreview('productImageUpload', 'productImagePreview');
bindImagePreview('shopCoverImageUpload', 'shopCoverImagePreview');

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
