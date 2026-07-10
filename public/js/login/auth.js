function showRegister() {
    document.getElementById('loginPage').classList.add('d-none');
    document.getElementById('forgotPage').classList.add('d-none');
    document.getElementById('registerPage').classList.remove('d-none');
}

function showLogin() {
    document.getElementById('registerPage').classList.add('d-none');
    document.getElementById('forgotPage').classList.add('d-none');
    document.getElementById('loginPage').classList.remove('d-none');
}

function showForgotPassword() {
    document.getElementById('loginPage').classList.add('d-none');
    document.getElementById('registerPage').classList.add('d-none');
    document.getElementById('forgotPage').classList.remove('d-none');
}

function toggleSellerFields() {
    const roleSelect = document.getElementById('roleSelect');
    const sellerFields = document.getElementById('sellerFields');

    if (!roleSelect || !sellerFields) return;

    const role = roleSelect.value;
    const inputs = sellerFields.querySelectorAll('input, select, textarea');

    if (role === 'SELLER') {
        sellerFields.classList.remove('d-none');
        inputs.forEach((input) => {
            if (input.type !== 'file') input.setAttribute('required', '');
        });
    } else {
        sellerFields.classList.add('d-none');
        inputs.forEach((input) => input.removeAttribute('required'));
    }
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
        window.location.href = result.redirectPath || '/profile';
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
        toggleSellerFields();
        showLogin();
    } catch (error) {
        renderMessage('error', 'เกิดข้อผิดพลาดในการสมัครสมาชิก');
    }
}

window.showRegister = showRegister;
window.showLogin = showLogin;
window.showForgotPassword = showForgotPassword;
window.toggleSellerFields = toggleSellerFields;

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

    toggleSellerFields();

    const activeTab = document.body.dataset.activeTab || 'login';
    if (activeTab === 'register') {
        showRegister();
    } else if (activeTab === 'forgot') {
        showForgotPassword();
    } else {
        showLogin();
    }
});
