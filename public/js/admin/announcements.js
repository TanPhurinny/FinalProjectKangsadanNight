document.addEventListener('DOMContentLoaded', function() {
    // แสดงวันที่ปัจจุบัน
    const dateEl = document.getElementById('live-date');
    if(dateEl) {
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        dateEl.innerText = new Date().toLocaleDateString('th-TH', options);
    }

    // ระบบ Filter (Live Search)
    const searchInput = document.getElementById('searchInput');
    const roleFilter = document.getElementById('roleFilter');
    const cards = document.querySelectorAll('.announcement-item');

    function applyFilters() {
        const term = searchInput.value.toLowerCase();
        const role = roleFilter.value;

        cards.forEach(card => {
            const title = card.querySelector('.card-title').innerText.toLowerCase();
            const cardRoles = (card.dataset.roles || '')
                .split(',')
                .map(r => r.trim())
                .filter(Boolean);
            const isRoleMatched = role === 'ALL' || cardRoles.includes(role);
            const isVisible = title.includes(term) && isRoleMatched;
            card.style.display = isVisible ? 'block' : 'none';
        });
    }

    if(searchInput) searchInput.addEventListener('input', applyFilters);
    if(roleFilter) roleFilter.addEventListener('change', applyFilters);
});

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function mapAudienceLabel(role) {
    if (role === 'GUEST') return 'ผู้เยี่ยมชม';
    if (role === 'CUSTOMER') return 'ลูกค้า';
    if (role === 'SELLER') return 'พ่อค้าแม่ค้า';
    return role;
}

function openAnnouncementImage(imageUrl, encodedTitle = '') {
    if (!imageUrl) return;

    let title = 'รูปประกาศ';
    if (encodedTitle) {
        try {
            title = decodeURIComponent(encodedTitle);
        } catch (error) {
            title = encodedTitle;
        }
    }

    Swal.fire({
        title,
        imageUrl,
        imageAlt: title,
        width: 'min(92vw, 1100px)',
        confirmButtonText: 'ปิด',
        confirmButtonColor: '#3BB8D4',
        showCloseButton: true
    });
}

function viewAnnouncementDetail(dataString) {
    const data = JSON.parse(dataString);
    const audienceRoles = Array.isArray(data.targetRoles) && data.targetRoles.length > 0
        ? data.targetRoles
        : [data.targetRole || 'CUSTOMER'];

    const createdAtText = new Date(data.createdAt).toLocaleString('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    const imagePath = data.image ? `/uploads/announcements/${encodeURIComponent(data.image)}` : '';
    const encodedTitle = encodeURIComponent(data.title || 'รูปประกาศ');

    const imageHtml = data.image
        ? `<img src="${imagePath}" alt="announcement" class="announcement-preview-image clickable" onclick="openAnnouncementImage('${imagePath}', '${encodedTitle}')"><small class="announcement-preview-hint">คลิกรูปเพื่อดูภาพเต็ม</small>`
        : '<div class="announcement-preview-empty"><i class="fas fa-image"></i></div>';

    const audiencesHtml = audienceRoles
        .map((role) => `<span class="preview-audience-chip">${escapeHtml(mapAudienceLabel(role))}</span>`)
        .join('');

    const description = escapeHtml(data.content).replace(/\n/g, '<br>');

    Swal.fire({
        title: escapeHtml(data.title),
        html: `
            <div class="announcement-preview">
                ${imageHtml}
                <div class="announcement-preview-meta">
                    <span class="preview-category">${escapeHtml(data.category || 'ทั่วไป')}</span>
                    <span class="preview-date"><i class="far fa-clock"></i> ${escapeHtml(createdAtText)}</span>
                </div>
                <div class="preview-audiences">${audiencesHtml}</div>
                <p class="announcement-preview-content">${description}</p>
            </div>
        `,
        width: 720,
        confirmButtonText: 'ปิด',
        confirmButtonColor: '#3BB8D4'
    });
}

// ฟังก์ชันเตรียม Modal สำหรับสร้างใหม่
function prepareCreate() {
    const form = document.getElementById('announcementForm');
    document.getElementById('modalTitle').innerText = 'สร้างประกาศใหม่';
    form.action = '/admin/announcements'; // Path สำหรับสร้าง (POST)
    form.reset();

    const customerCheckbox = document.getElementById('audienceCustomer');
    if (customerCheckbox) {
        customerCheckbox.checked = true;
    }

    const importantCheckbox = document.getElementById('formIsImportant');
    if (importantCheckbox) {
        importantCheckbox.checked = false;
    }
}

// ฟังก์ชันเตรียม Modal สำหรับแก้ไข (ดึงข้อมูลเก่ามาใส่)
function prepareEdit(dataString) {
    const data = JSON.parse(dataString);
    const form = document.getElementById('announcementForm');
    const selectedRoles = Array.isArray(data.targetRoles) && data.targetRoles.length > 0
        ? data.targetRoles
        : [data.targetRole || 'CUSTOMER'];
    
    document.getElementById('modalTitle').innerText = 'แก้ไขประกาศ';
    // เปลี่ยน Path ให้ส่งไปที่ Update Route (POST /admin/announcements/:id/update)
    form.action = `/admin/announcements/${data.id}/update`;
    
    document.getElementById('formTitle').value = data.title;
    document.getElementById('formCategory').value = data.category;
    document.getElementById('formContent').value = data.content;
    document.getElementById('formIsImportant').checked = Boolean(data.isImportant);

    document.querySelectorAll('input[name="targetRoles"]').forEach((checkbox) => {
        checkbox.checked = selectedRoles.includes(checkbox.value);
    });
    
    new bootstrap.Modal(document.getElementById('announcementModal')).show();
}

// ฟังก์ชันลบ (ใช้ SweetAlert2)
function confirmDelete(id, title) {
    window.showConfirmDialog({
        title: 'ยืนยันการลบ?',
        message: `คุณกำลังจะลบประกาศ "${title}"`,
        tone: 'danger',
        confirmText: 'ใช่, ลบเลย',
        cancelText: 'ยกเลิก',
        onConfirm: () => {
            // สร้างฟอร์มชั่วคราวเพื่อส่ง POST ไปที่ลบ (หรือใช้ GET ตาม Route ที่คุณตั้ง)
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = `/admin/announcements/${id}/delete`;
            document.body.appendChild(form);
            form.submit();
        }
    });
}