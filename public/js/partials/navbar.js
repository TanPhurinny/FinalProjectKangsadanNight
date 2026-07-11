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
