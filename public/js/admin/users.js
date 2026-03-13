document.addEventListener('DOMContentLoaded', function() {
    // --- ระบบค้นหาและกรองบทบาท ---
    const searchInput = document.getElementById('searchInput');
    const roleFilter = document.getElementById('roleFilter');
    const tableRows = document.querySelectorAll('.user-row');
    const noDataRow = document.getElementById('noDataRow');

    function filterUsers() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const selectedRole = roleFilter.value;
        let visibleCount = 0;

        tableRows.forEach(row => {
            const name = row.getAttribute('data-name') || "";
            const username = row.getAttribute('data-username') || "";
            const role = row.getAttribute('data-role') || "";

            const matchesSearch = name.includes(searchTerm) || username.includes(searchTerm);
            const matchesRole = (selectedRole === 'ALL' || role === selectedRole);

            if (matchesSearch && matchesRole) {
                row.style.display = "";
                visibleCount++;
            } else {
                row.style.display = "none";
            }
        });

        // แสดงข้อความเมื่อไม่พบข้อมูล
        if (noDataRow) {
            noDataRow.classList.toggle('d-none', visibleCount > 0);
        }
    }

    if (searchInput) searchInput.addEventListener('input', filterUsers);
    if (roleFilter) roleFilter.addEventListener('change', filterUsers);
});

/**
 * ฟังก์ชันแสดงรายละเอียดข้อมูลสมาชิกอย่างละเอียด
 */
function viewUserDetail(uString) {
    const u = JSON.parse(uString);
    
    // กำหนดสีและไอคอนตาม Role
    let roleConfig = { class: 'role-customer', icon: 'fa-user' };
    if (u.role === 'ADMIN') roleConfig = { class: 'role-admin', icon: 'fa-user-shield' };
    else if (u.role === 'STAFF') roleConfig = { class: 'role-staff', icon: 'fa-user-tie' };
    else if (u.role === 'SELLER') roleConfig = { class: 'role-seller', icon: 'fa-store' };

    let content = `
        <div class="text-center mb-4 pt-2">
            <div class="profile-avatar-wrapper mb-3">
                <div class="profile-avatar shadow-sm border">
                    <i class="fas ${roleConfig.icon} fa-3x"></i>
                </div>
                <div class="status-indicator ${roleConfig.class}"></div>
            </div>
            <h3 class="fw-bold text-dark mb-1">${u.name}</h3>
            <span class="badge ${roleConfig.class} px-3 py-2 rounded-pill shadow-sm">
                <i class="fas ${roleConfig.icon} me-1"></i> ${u.role}
            </span>
        </div>

        <div class="info-group">
            <div class="info-item">
                <label>ชื่อ-นามสกุล</label>
                <div class="value">${u.name}</div>
            </div>
            <div class="info-item">
                <label>ชื่อผู้ใช้งาน (Username)</label>
                <div class="value text-primary fw-bold">${u.username}</div>
            </div>
            <div class="info-item">
                <label>เบอร์โทรศัพท์</label>
                <div class="value">${u.phoneNumber || '<span class="text-muted">ไม่ระบุ</span>'}</div>
            </div>
            <div class="info-item border-0">
                <label>วันที่เข้าร่วมระบบ</label>
                <div class="value">${new Date(u.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
        </div>
    `;

    if (u.shop) {
        content += `
            <div class="shop-card-detail mt-4 p-3 rounded-4">
                <h6 class="fw-bold d-flex align-items-center mb-3">
                    <i class="fas fa-store-alt me-2"></i> ข้อมูลร้านค้าที่ลงทะเบียน
                </h6>
                <div class="row g-2">
                    <div class="col-6">
                        <small class="text-muted d-block">ชื่อร้าน</small>
                        <span class="fw-bold">${u.shop.shopName || '-'}</span>
                    </div>
                    <div class="col-6">
                        <small class="text-muted d-block">ประเภทสินค้า</small>
                        <span class="fw-bold">${u.shop.productType || '-'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    document.getElementById('detailBody').innerHTML = content;
    new bootstrap.Modal(document.getElementById('userDetailModal')).show();
}

function openEditModal(id, name, role) {
    document.getElementById('modalUserId').value = id;
    document.getElementById('modalUserName').innerText = name;
    document.getElementById('modalRoleSelect').value = role;
    new bootstrap.Modal(document.getElementById('editRoleModal')).show();
}

function deleteUser(id) {
    if (confirm('⚠️ คำเตือน: ข้อมูลการจองและร้านค้าของสมาชิกคนนี้จะหายไปทั้งหมด ยืนยันการลบ?')) {
        window.location.href = `/admin/users/delete/${id}`;
    }
}