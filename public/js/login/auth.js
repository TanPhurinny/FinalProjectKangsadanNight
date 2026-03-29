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

window.showRegister = showRegister;
window.showLogin = showLogin;
window.showForgotPassword = showForgotPassword;
window.toggleSellerFields = toggleSellerFields;

document.addEventListener('DOMContentLoaded', () => {
    const toggleButtons = document.querySelectorAll('.password-toggle');
    toggleButtons.forEach((button) => {
        button.addEventListener('click', togglePasswordVisibility);
    });

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
