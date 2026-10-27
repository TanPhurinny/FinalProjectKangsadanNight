// หน้าหลักผู้ขาย: นาฬิกาสด, นับถอยหลังสัญญาล็อก, ส่วนต่างๆ เผยตอนเลื่อน + ตัวเลขนับขึ้น,
// โปรวันนี้ (ไอเดียโปร + ตัวอย่างบนผังแบบสด), QR ร้าน, แชร์/คัดลอกลิงก์ร้าน
// ปุ่มปิดร้านวันนี้อยู่ใน public/js/seller/openStatus.js
(function () {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pad = (n) => String(n).padStart(2, '0');

    // ---------- นาฬิกาบนแถบหัว ----------
    const clock = document.getElementById('liveClock');
    if (clock) {
        const tickClock = () => {
            const now = new Date();
            clock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        };
        tickClock();
        setInterval(tickClock, 1000);
    }

    // ---------- นับถอยหลังถึง 20:00 ของวันขายสุดท้าย ----------
    const cd = document.querySelector('.sh-countdown');
    if (cd) {
        const cutoff = new Date(cd.dataset.cutoff).getTime();
        const el = (k) => cd.querySelector(`[data-cd="${k}"]`);
        const bar = cd.querySelector('[data-cd-bar]');
        const WEEK = 7 * 24 * 3600 * 1000;
        let timer = null;
        const tick = () => {
            const left = Math.max(0, cutoff - Date.now());
            const sec = Math.floor(left / 1000);
            el('d').textContent = Math.floor(sec / 86400);
            el('h').textContent = pad(Math.floor((sec % 86400) / 3600));
            el('m').textContent = pad(Math.floor((sec % 3600) / 60));
            el('s').textContent = pad(sec % 60);
            // แถบเวลาที่เหลือ เทียบกับ 7 วันสุดท้าย
            if (bar) bar.style.transform = `scaleX(${Math.min(1, left / WEEK)})`;
            // เหลือไม่ถึง 1 วัน: เปลี่ยนเป็นโทนเตือน
            cd.classList.toggle('is-urgent', left < 24 * 3600 * 1000);
            if (left <= 0) {
                cd.classList.add('is-over');
                clearInterval(timer);
            }
        };
        timer = setInterval(tick, 1000);
        tick();
    }

    // ---------- ตัวเลขนับขึ้นจาก 0 ----------
    function countUp(node) {
        const target = Number(node.dataset.count);
        if (!Number.isFinite(target) || target <= 0 || reduceMotion) return;
        const start = performance.now();
        const duration = Math.min(1200, 400 + target * 20);
        const step = (t) => {
            const p = Math.min(1, (t - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            node.textContent = Math.round(target * eased).toLocaleString('th-TH');
            if (p < 1) requestAnimationFrame(step);
        };
        node.textContent = '0';
        requestAnimationFrame(step);
    }

    // ---------- เผยทีละส่วนตอนเลื่อนเข้าจอ ----------
    const revealEls = document.querySelectorAll('.sh-reveal');
    const reveal = (node) => {
        node.classList.add('is-in');
        node.querySelectorAll('[data-count]').forEach(countUp);
    };
    if (!('IntersectionObserver' in window) || reduceMotion) {
        revealEls.forEach((node) => node.classList.add('is-in'));
    } else {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                reveal(entry.target);
                io.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        revealEls.forEach((node) => io.observe(node));
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

    // ---------- โปรวันนี้ ----------
    const promoForm = document.getElementById('promoForm');
    if (promoForm) {
        const input = document.getElementById('promoText');
        const clearBtn = document.getElementById('promoClear');
        const count = document.getElementById('promoCount');
        const meter = document.getElementById('promoMeter');
        const status = document.getElementById('promoStatus');
        const preview = document.getElementById('promoPreview');
        const saveBtn = promoForm.querySelector('button[type="submit"]');
        const max = Number(input.maxLength) || 80;
        let saved = input.value.trim();

        // ตัวนับตัวอักษร + ตัวอย่างการ์ดร้านบนผังเปลี่ยนตามที่พิมพ์
        function syncDraft() {
            const text = input.value.trim();
            count.textContent = input.value.length;
            meter.style.width = `${Math.round((input.value.length / max) * 100)}%`;
            preview.querySelector('span').textContent = text || 'ยังไม่มีโปร';
            preview.classList.toggle('is-empty', !text);
            if (text !== saved) status.textContent = 'ยังไม่ได้บันทึก';
            else status.textContent = saved ? 'กำลังแสดงบนผังตลาด' : '';
        }
        input.addEventListener('input', syncDraft);

        // ไอเดียโปร: แตะแล้วใส่ข้อความให้ (ยังไม่บันทึกจนกด "บันทึกโปร")
        promoForm.querySelectorAll('[data-promo-idea]').forEach((chip) => {
            chip.addEventListener('click', () => {
                input.value = chip.dataset.promoIdea.slice(0, max);
                syncDraft();
                input.focus();
                preview.classList.remove('is-pop');
                void preview.offsetWidth;
                preview.classList.add('is-pop');
            });
        });

        async function savePromo(text) {
            saveBtn.disabled = true;
            clearBtn.disabled = true;
            try {
                const response = await fetch('/shop-promo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ text })
                });
                const payload = await response.json();
                if (!response.ok || !payload.success) throw new Error(payload.message || 'บันทึกไม่สำเร็จ');
                const has = !!payload.text;
                saved = payload.text || '';
                input.value = saved;
                promoForm.classList.toggle('has-promo', has);
                clearBtn.hidden = !has;
                syncDraft();
                toast(has ? 'บันทึกโปรแล้ว ลูกค้าเห็นบนผังตลาดทันที' : 'ลบโปรวันนี้แล้ว');
            } catch (error) {
                if (window.showAlertDialog) window.showAlertDialog({ title: 'บันทึกไม่สำเร็จ', message: error.message, tone: 'danger' });
            } finally {
                saveBtn.disabled = false;
                clearBtn.disabled = false;
            }
        }

        promoForm.addEventListener('submit', (e) => {
            e.preventDefault();
            savePromo(input.value);
        });
        clearBtn.addEventListener('click', () => savePromo(''));
    }

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
