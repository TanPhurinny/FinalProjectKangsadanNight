// หน้าหลักผู้ขาย: นับถอยหลังสัญญาล็อก (เดินทุกวินาที), QR ร้าน, คัดลอกลิงก์ร้าน
// ปุ่มปิดร้านวันนี้อยู่ใน public/js/seller/openStatus.js
(function () {
    // ---------- นับถอยหลังถึง 20:00 ของวันขายสุดท้าย ----------
    const cd = document.querySelector('.sh-countdown');
    if (cd) {
        const cutoff = new Date(cd.dataset.cutoff).getTime();
        const el = (k) => cd.querySelector(`[data-cd="${k}"]`);
        const pad = (n) => String(n).padStart(2, '0');
        const tick = () => {
            const left = Math.max(0, cutoff - Date.now());
            const sec = Math.floor(left / 1000);
            el('d').textContent = Math.floor(sec / 86400);
            el('h').textContent = pad(Math.floor((sec % 86400) / 3600));
            el('m').textContent = pad(Math.floor((sec % 3600) / 60));
            el('s').textContent = pad(sec % 60);
            // เหลือไม่ถึง 1 วัน: เปลี่ยนเป็นโทนเตือน
            cd.classList.toggle('is-urgent', left < 24 * 3600 * 1000);
            if (left <= 0) {
                cd.classList.add('is-over');
                clearInterval(timer);
            }
        };
        const timer = setInterval(tick, 1000);
        tick();
    }

    // ---------- toast เล็กๆ ----------
    let toastTimer = null;
    function toast(text) {
        let t = document.getElementById('shToast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'shToast';
            t.className = 'sh-toast';
            t.setAttribute('role', 'status');
            document.body.appendChild(t);
        }
        t.textContent = text;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
    }

    // ---------- คัดลอกลิงก์ร้าน (มือถือที่มีเมนูแชร์ใช้เมนูแชร์ของเครื่อง) ----------
    document.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const url = `${window.location.origin}${btn.dataset.copy}`;
            try {
                if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
                    await navigator.share({ title: 'ร้านของฉันในตลาดกังสดาลไนท์', url });
                    return;
                }
                await navigator.clipboard.writeText(url);
                toast('คัดลอกลิงก์ร้านแล้ว ส่งให้ลูกค้าได้เลย');
            } catch (e) {
                if (e && e.name === 'AbortError') return;
                toast(url);
            }
        });
    });

    // ---------- QR ร้าน ----------
    const dialog = document.getElementById('qrDialog');
    if (dialog) {
        document.querySelectorAll('[data-qr]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const code = encodeURIComponent(btn.dataset.qr);
                dialog.querySelector('[data-qr-code]').textContent = btn.dataset.qr;
                dialog.querySelector('[data-qr-img]').src = `/market-map/qr/${code}.svg`;
                dialog.querySelector('[data-qr-sign]').href = `/market-map/sign/${code}`;
                dialog.querySelector('[data-qr-download]').href = `/market-map/qr/${code}.svg?download=1`;
                dialog.showModal();
            });
        });
        dialog.querySelector('[data-qr-close]').addEventListener('click', () => dialog.close());
        // แตะพื้นหลังนอกกล่องเพื่อปิด
        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    }
})();
