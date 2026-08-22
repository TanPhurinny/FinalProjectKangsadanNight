// กล่องยืนยัน/แจ้งเตือนกลางของทั้งเว็บ (สไตล์ gridgeist) — ใช้แทน window.confirm()/window.alert() เดิม
// ที่เป็นกล่องเบราว์เซอร์ล้วนๆ ไม่มีดีไซน์ ใช้ได้ทุกหน้าแค่แปะ <script src="/js/common/dialogs.js">
// ก่อนสคริปต์ของหน้านั้นๆ แล้วเรียก window.showConfirmDialog(...) / window.showAlertDialog(...)
// ไม่ต้องมี markup หรือ CSS เพิ่มในหน้านั้น — ฉีด DOM + style ให้เองตอนโหลด
(function () {
    if (window.showConfirmDialog && window.showAlertDialog) return; // กันโหลดซ้ำ

    const STYLE = `
        .gd-overlay {
            position: fixed; inset: 0; background: rgba(18, 48, 58, 0.55);
            z-index: 20000; display: flex; align-items: center; justify-content: center;
            opacity: 0; visibility: hidden; transition: opacity 0.15s ease, visibility 0.15s ease;
            padding: 16px; font-family: 'Kanit', sans-serif;
        }
        .gd-overlay.active { opacity: 1; visibility: visible; }
        .gd-dialog {
            width: 100%; max-width: 380px; background: #fff;
            border: 1px solid #d7e3e6; border-radius: 4px;
            padding: 28px 24px 22px; text-align: center;
            transform: translateY(8px) scale(0.98); transition: transform 0.15s ease;
        }
        .gd-overlay.active .gd-dialog { transform: translateY(0) scale(1); }
        .gd-dialog__icon {
            width: 56px; height: 56px; margin: 0 auto 14px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center; font-size: 1.6rem;
        }
        .gd-dialog__icon--success { background: rgba(39, 174, 96, 0.12); color: #27AE60; }
        .gd-dialog__icon--danger { background: rgba(192, 57, 43, 0.12); color: #c0392b; }
        .gd-dialog__icon--warning { background: rgba(201, 138, 46, 0.12); color: #c98a2e; }
        .gd-dialog__icon--neutral { background: rgba(44, 147, 168, 0.12); color: #2C93A8; }
        .gd-dialog__title { font-size: 1.05rem; font-weight: 700; color: #12303a; margin: 0 0 8px; }
        .gd-dialog__message { font-size: 0.88rem; color: #5b7a84; line-height: 1.6; margin: 0 0 22px; white-space: pre-line; }
        .gd-dialog__input {
            width: 100%; padding: 9px 12px; margin: -10px 0 20px; border-radius: 4px;
            border: 1px solid #d7e3e6; font-family: inherit; font-size: 0.88rem; color: #12303a;
        }
        .gd-dialog__input:focus { outline: none; border-color: #2C93A8; }
        .gd-dialog__actions { display: flex; gap: 10px; }
        .gd-dialog__btn {
            flex: 1; padding: 10px 14px; border-radius: 4px; font-size: 0.88rem;
            font-weight: 600; font-family: inherit; cursor: pointer; border: 1px solid transparent;
            transition: filter 0.15s ease, background 0.15s ease;
        }
        .gd-dialog__btn--cancel { background: #fff; border-color: #d7e3e6; color: #5b7a84; }
        .gd-dialog__btn--cancel:hover { background: #f6f8f8; }
        .gd-dialog__btn--success { background: #27AE60; border-color: #27AE60; color: #fff; }
        .gd-dialog__btn--danger { background: #c0392b; border-color: #c0392b; color: #fff; }
        .gd-dialog__btn--warning { background: #c98a2e; border-color: #c98a2e; color: #fff; }
        .gd-dialog__btn--neutral { background: #2C93A8; border-color: #2C93A8; color: #fff; }
        .gd-dialog__btn--success:hover, .gd-dialog__btn--danger:hover,
        .gd-dialog__btn--warning:hover, .gd-dialog__btn--neutral:hover { filter: brightness(0.92); }
    `;

    const ICONS = {
        success: 'fa-solid fa-circle-check',
        danger: 'fa-solid fa-triangle-exclamation',
        warning: 'fa-solid fa-circle-exclamation',
        neutral: 'fa-solid fa-circle-info'
    };

    function injectStyle() {
        if (document.getElementById('gd-dialog-style')) return;
        const styleEl = document.createElement('style');
        styleEl.id = 'gd-dialog-style';
        styleEl.textContent = STYLE;
        document.head.appendChild(styleEl);
    }

    function ensureFontAwesome() {
        const hasFa = Array.from(document.styleSheets).some((s) => {
            try { return (s.href || '').includes('font-awesome'); } catch (e) { return false; }
        }) || document.querySelector('link[href*="font-awesome"]');
        if (hasFa) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(link);
    }

    function buildOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'gd-overlay';
        overlay.innerHTML = `
            <div class="gd-dialog">
                <div class="gd-dialog__icon"><i></i></div>
                <h3 class="gd-dialog__title"></h3>
                <p class="gd-dialog__message"></p>
                <input type="text" class="gd-dialog__input" style="display:none;">
                <div class="gd-dialog__actions">
                    <button type="button" class="gd-dialog__btn gd-dialog__btn--cancel" data-role="cancel">ยกเลิก</button>
                    <button type="button" class="gd-dialog__btn" data-role="confirm">ยืนยัน</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }

    injectStyle();
    ensureFontAwesome();
    const overlay = buildOverlay();
    const dialogEl = overlay.querySelector('.gd-dialog');
    const iconEl = overlay.querySelector('.gd-dialog__icon');
    const iconTagEl = iconEl.querySelector('i');
    const titleEl = overlay.querySelector('.gd-dialog__title');
    const messageEl = overlay.querySelector('.gd-dialog__message');
    const inputEl = overlay.querySelector('.gd-dialog__input');
    const actionsEl = overlay.querySelector('.gd-dialog__actions');
    const cancelBtn = overlay.querySelector('[data-role="cancel"]');
    const confirmBtn = overlay.querySelector('[data-role="confirm"]');
    let pendingConfirm = null;

    function close() {
        overlay.classList.remove('active');
        pendingConfirm = null;
        inputEl.style.display = 'none';
        inputEl.value = '';
    }

    cancelBtn.addEventListener('click', close);
    confirmBtn.addEventListener('click', () => {
        const action = pendingConfirm;
        const inputValue = inputEl.value;
        close();
        if (action) action(inputValue);
    });
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && overlay.classList.contains('active')) close();
    });

    // showConfirmDialog({ title, message, tone, icon, confirmText, cancelText, inputPlaceholder, onConfirm })
    // tone: 'success' | 'danger' | 'warning' | 'neutral' (default 'neutral')
    // inputPlaceholder (optional): แสดงช่องกรอกข้อความ, ค่าที่กรอกจะถูกส่งเป็นอาร์กิวเมนต์แรกของ onConfirm(value)
    window.showConfirmDialog = function showConfirmDialog(options) {
        const opts = options || {};
        const tone = opts.tone || 'neutral';
        pendingConfirm = typeof opts.onConfirm === 'function' ? opts.onConfirm : null;

        titleEl.textContent = opts.title || 'ยืนยันการทำรายการ';
        messageEl.textContent = opts.message || '';
        iconTagEl.className = opts.icon || ICONS[tone] || ICONS.neutral;
        iconEl.className = `gd-dialog__icon gd-dialog__icon--${tone}`;
        confirmBtn.textContent = opts.confirmText || 'ยืนยัน';
        confirmBtn.className = `gd-dialog__btn gd-dialog__btn--${tone}`;
        cancelBtn.textContent = opts.cancelText || 'ยกเลิก';
        cancelBtn.style.display = '';
        actionsEl.style.display = '';
        if (opts.inputPlaceholder) {
            inputEl.placeholder = opts.inputPlaceholder;
            inputEl.style.display = '';
        } else {
            inputEl.style.display = 'none';
        }
        overlay.classList.add('active');
        if (opts.inputPlaceholder) inputEl.focus();
    };

    // showAlertDialog({ title, message, tone, icon, okText }) — กล่องแจ้งเตือนบรรทัดเดียว ปุ่มเดียว
    window.showAlertDialog = function showAlertDialog(options) {
        const opts = options || {};
        const tone = opts.tone || 'neutral';
        pendingConfirm = null;

        titleEl.textContent = opts.title || 'แจ้งเตือน';
        messageEl.textContent = opts.message || '';
        iconTagEl.className = opts.icon || ICONS[tone] || ICONS.neutral;
        iconEl.className = `gd-dialog__icon gd-dialog__icon--${tone}`;
        confirmBtn.textContent = opts.okText || 'ตกลง';
        confirmBtn.className = `gd-dialog__btn gd-dialog__btn--${tone}`;
        cancelBtn.style.display = 'none';
        overlay.classList.add('active');
    };
})();
