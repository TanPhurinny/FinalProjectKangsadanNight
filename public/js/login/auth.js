function setActiveTab(index) {
    const buttons = document.querySelectorAll('.auth-tabswitch button');
    buttons.forEach((button, i) => button.classList.toggle('active', i === index));
}

function showRegister() {
    document.getElementById('loginPage').classList.add('d-none');
    document.getElementById('forgotPage').classList.add('d-none');
    document.getElementById('registerPage').classList.remove('d-none');
    resetRegisterSteps();
    setActiveTab(1);
}

function showLogin() {
    document.getElementById('registerPage').classList.add('d-none');
    document.getElementById('forgotPage').classList.add('d-none');
    document.getElementById('loginPage').classList.remove('d-none');
    setActiveTab(0);
}

function showForgotPassword() {
    document.getElementById('loginPage').classList.add('d-none');
    document.getElementById('registerPage').classList.add('d-none');
    document.getElementById('forgotPage').classList.remove('d-none');
    setActiveTab(0);
}

function resetRegisterSteps() {
    const step1 = document.getElementById('regStep1');
    const step2 = document.getElementById('regStep2');
    if (!step1 || !step2) return;

    step1.classList.remove('d-none');
    step2.classList.add('d-none');
    updateRegNextButton();
}

// สำหรับผู้ใช้ทั่วไป (CUSTOMER) ปุ่ม "ถัดไป" จะสมัครสมาชิกทันที (submit ตรง)
// ส่วนพ่อค้า/แม่ค้า (SELLER) จะพาไปกรอกข้อมูลร้านค้าที่ขั้นตอนที่ 2 ก่อน
function updateRegNextButton() {
    const roleSelect = document.getElementById('roleSelect');
    const nextBtn = document.getElementById('regNextBtn');
    if (!roleSelect || !nextBtn) return;

    if (roleSelect.value === 'SELLER') {
        nextBtn.type = 'button';
        nextBtn.textContent = 'ถัดไป';
    } else {
        nextBtn.type = 'submit';
        nextBtn.textContent = 'สร้างบัญชี';
    }
}

function goToRegStep2() {
    const step1 = document.getElementById('regStep1');
    const step2 = document.getElementById('regStep2');
    if (!step1 || !step2) return;

    const step1Fields = step1.querySelectorAll('input, select');
    for (const field of step1Fields) {
        if (!field.checkValidity()) {
            field.reportValidity();
            return;
        }
    }

    step1.classList.add('d-none');
    step2.classList.remove('d-none');
}

function goToRegStep1() {
    const step1 = document.getElementById('regStep1');
    const step2 = document.getElementById('regStep2');
    if (!step1 || !step2) return;

    step2.classList.add('d-none');
    step1.classList.remove('d-none');
}

function togglePasswordVisibility(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const passwordInput = button.previousElementSibling;
    const icon = button.querySelector('i');

    if (!passwordInput || !icon) return;

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        button.classList.add('active');
    } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
        button.classList.remove('active');
    }
}

function autoDismissAlert(alertBox, delay = 3000) {
    if (!alertBox) return;

    setTimeout(() => {
        alertBox.classList.add('alert-auto-fade');
        setTimeout(() => alertBox.remove(), 400);
    }, delay);
}

function renderMessage(type, message) {
    const authMessage = document.getElementById('authMessage');

    if (!authMessage) return;

    if (!message) {
        authMessage.innerHTML = '';
        return;
    }

    const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
    const alertBox = document.createElement('div');
    alertBox.className = `alert ${alertClass} small text-center mb-0`;
    alertBox.textContent = message;

    authMessage.innerHTML = '';
    authMessage.appendChild(alertBox);
    autoDismissAlert(alertBox);
}

async function submitJsonForm(form, bodyObject) {
    const response = await fetch(form.action, {
        method: form.method || 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(bodyObject)
    });

    return response.json();
}

async function submitFormData(form) {
    const formData = new FormData(form);

    const response = await fetch(form.action, {
        method: form.method || 'POST',
        headers: {
            'Accept': 'application/json'
        },
        body: formData
    });

    // tolerate HTML redirects or non-JSON responses
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }

    // fallback: try to parse text and infer success message
    const text = await response.text();
    // if server redirected to login page with success message, return success
    if (text && /สมัครสำเร็จ|สมัครสมาชิกสำเร็จ|success/i.test(text)) {
        return { success: true, message: 'สมัครสมาชิกสำเร็จ' };
    }

    return { success: false, message: text || 'server returned non-json response' };
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
        renderMessage(null, '');
        const result = await submitJsonForm(form, payload);

        if (!result.success) {
            renderMessage('error', result.message || 'เข้าสู่ระบบไม่สำเร็จ');
            return;
        }

        renderMessage('success', result.message || 'เข้าสู่ระบบสำเร็จ');

        if (result.token && window.setTabToken) {
            window.setTabToken(result.token);
        }

        const redirectPath = result.redirectPath || '/profile';
        const separator = redirectPath.includes('?') ? '&' : '?';
        window.location.href = result.token
            ? `${redirectPath}${separator}tabToken=${encodeURIComponent(result.token)}`
            : redirectPath;
    } catch (error) {
        renderMessage('error', 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    }
}

async function handleForgotSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
        renderMessage(null, '');
        const result = await submitJsonForm(form, payload);

        if (!result.success) {
            renderMessage('error', result.message || 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
            return;
        }

        renderMessage('success', result.message || 'รีเซ็ตรหัสผ่านสำเร็จ');
        form.reset();
        showLogin();
    } catch (error) {
        renderMessage('error', 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน');
    }
}

async function handleRegisterSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;

    try {
        renderMessage(null, '');
        const result = await submitFormData(form);

        if (!result.success) {
            renderMessage('error', result.message || 'สมัครสมาชิกไม่สำเร็จ');
            return;
        }

        renderMessage('success', result.message || 'สมัครสมาชิกสำเร็จ');
        form.reset();
        showLogin();
    } catch (error) {
        renderMessage('error', 'เกิดข้อผิดพลาดในการสมัครสมาชิก');
    }
}

window.showRegister = showRegister;
window.showLogin = showLogin;
window.showForgotPassword = showForgotPassword;
window.updateRegNextButton = updateRegNextButton;
window.goToRegStep2 = goToRegStep2;
window.goToRegStep1 = goToRegStep1;

document.addEventListener('DOMContentLoaded', () => {
    const toggleButtons = document.querySelectorAll('.password-toggle');
    toggleButtons.forEach((button) => {
        button.addEventListener('click', togglePasswordVisibility);
    });

    const loginForm = document.querySelector('#loginPage form');
    const forgotForm = document.querySelector('#forgotPage form');
    const registerForm = document.querySelector('#registerPage form');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmit);
    }

    if (forgotForm) {
        forgotForm.addEventListener('submit', handleForgotSubmit);
    }

    if (registerForm) {
        registerForm.addEventListener('submit', handleRegisterSubmit);
    }

    updateRegNextButton();

    document.querySelectorAll('.auth-page .alert-success, .auth-page .alert-danger').forEach((alertBox) => {
        autoDismissAlert(alertBox);
    });

    const activeTab = document.body.dataset.activeTab || 'login';
    if (activeTab === 'register') {
        showRegister();
    } else if (activeTab === 'forgot') {
        showForgotPassword();
    } else {
        showLogin();
    }
});
