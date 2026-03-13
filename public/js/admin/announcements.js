document.addEventListener('DOMContentLoaded', function() {
    const imgInput = document.getElementById('imgInput');
    const dropZone = document.getElementById('dropZone');
    const imgPreview = document.getElementById('imgPreview');
    const previewContainer = document.getElementById('previewContainer');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    const removeImgBtn = document.getElementById('removeImg');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const announceItems = document.querySelectorAll('.announcement-item');
    const noData = document.getElementById('noData');

    // 1. Image Upload Logic
    dropZone.addEventListener('click', () => imgInput.click());

    imgInput.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                imgPreview.src = e.target.result;
                previewContainer.classList.remove('d-none');
                uploadPlaceholder.classList.add('d-none');
            }
            reader.readAsDataURL(file);
        }
    });

    removeImgBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        imgInput.value = '';
        previewContainer.classList.add('d-none');
        uploadPlaceholder.classList.remove('d-none');
    });

    // 2. Tab Filtering Logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            // สลับสถานะปุ่ม
            tabBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const selectedRole = this.getAttribute('data-role');
            let visibleCount = 0;

            // กรองรายการ
            announceItems.forEach(item => {
                const itemRole = item.getAttribute('data-role');
                if (selectedRole === 'ALL' || itemRole === selectedRole) {
                    item.style.display = 'block';
                    item.classList.add('animate-in'); // เพิ่ม Animation
                    visibleCount++;
                } else {
                    item.style.display = 'none';
                }
            });

            // ตรวจสอบว่ามีข้อมูลไหม
            noData.classList.toggle('d-none', visibleCount > 0);
        });
    });
});