const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');
const navToggleIcon = navToggle.querySelector('i');

function openNavMenu() {
    navMenu.classList.add('active');
    navToggleIcon.classList.remove('fa-bars');
    navToggleIcon.classList.add('fa-times');
    document.documentElement.classList.add('nav-menu-open');
    document.body.classList.add('nav-menu-open');
}

function closeNavMenu() {
    navMenu.classList.remove('active');
    navToggleIcon.classList.remove('fa-times');
    navToggleIcon.classList.add('fa-bars');
    document.documentElement.classList.remove('nav-menu-open');
    document.body.classList.remove('nav-menu-open');
}

navToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (navMenu.classList.contains('active')) {
        closeNavMenu();
    } else {
        openNavMenu();
    }
});

// ปิดเมนูเมื่อแตะพื้นที่ว่างนอกเมนู
document.addEventListener('click', (event) => {
    if (!navMenu.classList.contains('active')) return;
    if (navMenu.contains(event.target)) return;
    closeNavMenu();
});

// ปิดเมนูเมื่อกด Esc
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navMenu.classList.contains('active')) {
        closeNavMenu();
    }
});

// ปิดเมนูอัตโนมัติถ้าขยายจอกว้างขึ้นจนพ้นโหมดมือถือ
window.addEventListener('resize', () => {
    if (window.innerWidth > 992 && navMenu.classList.contains('active')) {
        closeNavMenu();
    }
});

// เมนู "เพิ่มเติม" (<details class="nav-dropdown">) — ปิดเองเมื่อคลิกนอกเมนู หรือเปิดเมนูอื่นซ้อน
//
// .nav-links มี overflow-x:auto บนจอกว้าง (ให้เลื่อนเมนูที่ล้นแนวนอนได้) แต่ CSS overflow บังคับให้
// overflow-y พลอยกลายเป็น auto ไปด้วยเสมอเมื่อ overflow-x ไม่ใช่ visible (ตามสเปก ไม่มีทางแยกแกนได้ด้วย
// CSS ล้วน) พาเนล .nav-dropdown__panel ที่เป็น position:absolute เลยโดนเก็บ/ตัดอยู่ในกล่องเลื่อนนั้นไปด้วย
// (เห็นเป็นกล่องเล็กมี scrollbar ของตัวเอง) แก้โดยสลับพาเนลเป็น position:fixed คำนวณตำแหน่งจริงจาก
// getBoundingClientRect() ของปุ่มตอนเปิด — fixed หลุดพ้นการตัดของ ancestor ที่ overflow ไม่ใช่ visible เสมอ
// (ยกเว้น ancestor มี transform/filter/perspective ซึ่ง navbar นี้ไม่มี)
function positionDropdownPanel(dropdown) {
    const summary = dropdown.querySelector('summary');
    const panel = dropdown.querySelector('.nav-dropdown__panel');
    if (!summary || !panel) return;
    if (window.innerWidth <= 992) {
        // มือถือ: พาเนลกางแบบ inline อยู่แล้ว (ดู CSS) ไม่ต้องคำนวณตำแหน่งลอย
        panel.style.position = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.left = '';
        return;
    }
    const rect = summary.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = `${rect.bottom}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
    panel.style.left = 'auto';
}

document.querySelectorAll('.nav-dropdown').forEach((dropdown) => {
    dropdown.addEventListener('toggle', () => {
        if (!dropdown.open) return;
        document.querySelectorAll('.nav-dropdown[open]').forEach((other) => {
            if (other !== dropdown) other.open = false;
        });
        positionDropdownPanel(dropdown);
    });
});

// อัปเดตตำแหน่งพาเนลถ้าหน้าต่างถูกย่อ/ขยายระหว่างเปิดเมนูอยู่
window.addEventListener('resize', () => {
    document.querySelectorAll('.nav-dropdown[open]').forEach(positionDropdownPanel);
});

document.addEventListener('click', (event) => {
    document.querySelectorAll('.nav-dropdown[open]').forEach((dropdown) => {
        if (!dropdown.contains(event.target)) {
            dropdown.open = false;
        }
    });
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        document.querySelectorAll('.nav-dropdown[open]').forEach((dropdown) => {
            dropdown.open = false;
        });
    }
});
