// เปิดหน้าต่างรายละเอียดการแจ้งซ่อมทั้งหมด
function openDetailModal(el) {
    const d = el.dataset;
    const images = (d.images || '').split(',').filter(Boolean);

    const gallery = document.getElementById('detailImageGallery');
    const imgEmpty = document.getElementById('detailImageEmpty');
    if (images.length) {
        gallery.innerHTML = images.map((src) =>
            `<img src="${src}" alt="รูปแจ้งซ่อม" onclick="openLightbox('${src}')">`
        ).join('');
        gallery.style.display = 'grid';
        imgEmpty.style.display = 'none';
    } else {
        gallery.innerHTML = '';
        gallery.style.display = 'none';
        imgEmpty.style.display = 'flex';
    }

    document.getElementById('detailLocation').textContent = d.location;
    document.getElementById('detailCategory').textContent = d.category;
    document.getElementById('detailDescription').textContent = d.description;
    document.getElementById('detailDate').textContent = d.date;
    document.getElementById('detailAssigned').textContent = d.assigned || 'ยังไม่มีเจ้าหน้าที่รับเรื่อง';

    const statusEl = document.getElementById('detailStatus');
    statusEl.textContent = d.statusLabel;
    statusEl.className = 'status-badge status-' + d.status;

    const reasonRow = document.getElementById('detailRejectReasonRow');
    if (d.status === 'REJECTED' && d.rejectReason) {
        document.getElementById('detailRejectReason').textContent = d.rejectReason;
        reasonRow.style.display = '';
    } else {
        reasonRow.style.display = 'none';
    }

    document.getElementById('detailOverlay').classList.add('active');
}
function closeDetailModal(e) {
    if (e) e.stopPropagation();
    document.getElementById('detailOverlay').classList.remove('active');
}

// เปิด/ปิด Lightbox สำหรับดูรูปแจ้งซ่อมขนาดเต็ม
function openLightbox(src) {
    document.getElementById('lightboxImage').src = src;
    document.getElementById('lightboxOverlay').classList.add('active');
}
function closeLightbox(e) {
    if (e) e.stopPropagation();
    document.getElementById('lightboxOverlay').classList.remove('active');
}

// ── ตำแหน่งล็อค: สลับระหว่าง dropdown (จาก DB) กับช่องกรอกเอง "อื่นๆ" ──
const locationSelect = document.getElementById('locationSelect');
const locationOther = document.getElementById('locationOther');

function syncLocationField() {
    if (locationSelect.value === '__OTHER__') {
        locationSelect.removeAttribute('name');
        locationOther.setAttribute('name', 'location');
        locationOther.required = true;
        locationOther.style.display = '';
    } else {
        locationSelect.setAttribute('name', 'location');
        locationOther.removeAttribute('name');
        locationOther.required = false;
        locationOther.style.display = 'none';
    }
}
locationSelect.addEventListener('change', syncLocationField);
syncLocationField();

// ── แนบรูปได้หลายรูป พร้อม preview และปุ่มลบต่อรูป ──
const imageUpload = document.getElementById('imageUpload');
const uploadLabel = document.getElementById('uploadLabel');
const submitBtn = document.getElementById('submitBtn');
const MAX_REPAIR_IMAGES = imageUpload.dataset.max ? Number(imageUpload.dataset.max) : 5;

let selectedFiles = [];

function renderImagePreviews() {
    uploadLabel.innerHTML = '';
    selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const item = document.createElement('div');
            item.className = 'upload-thumb-item';
            item.innerHTML = `<img src="${e.target.result}" alt="Preview ${index + 1}">
                <button type="button" class="upload-thumb-remove" data-index="${index}" title="ลบรูปนี้">&times;</button>`;
            item.querySelector('.upload-thumb-remove').addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                removeSelectedFile(index);
            });
            uploadLabel.appendChild(item);
        };
        reader.readAsDataURL(file);
    });
    if (selectedFiles.length < MAX_REPAIR_IMAGES) {
        const addBox = document.createElement('div');
        addBox.className = 'upload-add-icon';
        uploadLabel.appendChild(addBox);
    }
}

function syncFileInput() {
    const dt = new DataTransfer();
    selectedFiles.forEach((file) => dt.items.add(file));
    imageUpload.files = dt.files;
}

function removeSelectedFile(index) {
    selectedFiles.splice(index, 1);
    syncFileInput();
    renderImagePreviews();
}

imageUpload.addEventListener('change', function (e) {
    const incoming = Array.from(e.target.files || []);
    selectedFiles = selectedFiles.concat(incoming).slice(0, MAX_REPAIR_IMAGES);
    syncFileInput();
    renderImagePreviews();
});

window.clearRepairImageSelection = function () {
    selectedFiles = [];
    syncFileInput();
    renderImagePreviews();
};

renderImagePreviews();

// ปิดการส่งฟอร์มซ้อนและแสดง loading state
document.querySelector('form').addEventListener('submit', function (e) {
    if (!submitBtn.disabled) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังส่งข้อมูล...';
    }
});

// ซ่อนข้อความ success/error หลังจาก 5 วินาที
window.addEventListener('load', function () {
    const alertDivs = document.querySelectorAll('.form-alert');
    alertDivs.forEach(alertDiv => {
        if (window.location.search.includes('success=true') || window.location.search.includes('error=')) {
            setTimeout(() => {
                alertDiv.style.opacity = '0';
                alertDiv.style.transition = 'opacity 0.3s ease';
                setTimeout(() => {
                    alertDiv.style.display = 'none';
                }, 300);
            }, 5000);
        }
    });
});
