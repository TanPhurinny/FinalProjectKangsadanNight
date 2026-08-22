const imageUpload = document.getElementById('imageUpload');
const imagePreview = document.getElementById('imagePreview');
const submitBtn = document.getElementById('submitBtn');
const shopApplicationForm = document.querySelector('form');

if (imageUpload && imagePreview) {
    imageUpload.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                imagePreview.src = e.target.result;
                imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            imagePreview.src = '';
            imagePreview.style.display = 'none';
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
