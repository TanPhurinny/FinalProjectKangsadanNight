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
    if (!step1) return;

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
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
        renderMessage(null, '');
        const result = await submitJsonForm(form, payload);

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
