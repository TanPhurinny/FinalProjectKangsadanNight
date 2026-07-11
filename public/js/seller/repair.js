// เปิดหน้าต่างรายละเอียดการแจ้งซ่อมทั้งหมด
function openDetailModal(el) {
    const d = el.dataset;

    const img = document.getElementById('detailImage');
    const imgEmpty = document.getElementById('detailImageEmpty');
    if (d.image) {
        img.src = d.image;
        img.style.display = 'block';
        imgEmpty.style.display = 'none';
    } else {
        img.style.display = 'none';
        imgEmpty.style.display = 'flex';
    }

    document.getElementById('detailLocation').textContent = d.location;
    document.getElementById('detailCategory').textContent = d.category;
    document.getElementById('detailDescription').textContent = d.description;
    document.getElementById('detailDate').textContent = d.date;

    const statusEl = document.getElementById('detailStatus');
    statusEl.textContent = d.statusLabel;
    statusEl.className = 'status-badge status-' + d.status;

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

// Script สำหรับ Preview รูปภาพเมื่อผู้ใช้อัปโหลด
const imageUpload = document.getElementById('imageUpload');
const imagePreview = document.getElementById('imagePreview');
const submitBtn = document.getElementById('submitBtn');

imageUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block'; // แสดงรูปภาพทับเครื่องหมายบวก
        }
        reader.readAsDataURL(file);
    } else {
        imagePreview.src = '';
        imagePreview.style.display = 'none';
    }
});

// ปิดการส่งฟอร์มซ้อนและแสดง loading state
document.querySelector('form').addEventListener('submit', function(e) {
    if (!submitBtn.disabled) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังส่งข้อมูล...';
    }
});

// ซ่อนข้อความ success/error หลังจาก 5 วินาที
window.addEventListener('load', function() {
    const alertDivs = document.querySelectorAll('[style*="background-color"]');
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
