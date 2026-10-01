// เช็คอิน "ร้านเปิดแล้ว" / "ปิดร้าน" ในหน้าแรกผู้ขาย — POST /shop-status แล้วอัปเดตการ์ดทันที
(function () {
    const card = document.getElementById('openCheckin');
    const btn = document.getElementById('openCheckinBtn');
    if (!card || !btn) return;
    const label = document.getElementById('openCheckinLabel');
    const sub = document.getElementById('openCheckinSub');
    const hhmm = (d) => new Date(d).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    function render(status) {
        card.dataset.open = status.isOpen ? '1' : '0';
        card.classList.toggle('is-open', status.isOpen);
        label.textContent = status.isOpen ? 'ร้านเปิดอยู่' : 'ปิดร้านแล้ววันนี้';
        sub.textContent = status.isOpen
            ? `เปิดตั้งแต่ ${hhmm(status.openedAt)} น. · ลูกค้าเห็นป้าย "เปิดอยู่" บนผังตลาดแล้ว`
            : `ปิดเมื่อ ${hhmm(status.closedAt || new Date())} น. · ถ้ายังขายต่อ กดเปิดใหม่ได้`;
        btn.textContent = status.isOpen ? 'ปิดร้าน' : 'เปิดร้านอีกครั้ง';
    }

    async function save(open) {
        btn.disabled = true;
        try {
            const response = await fetch('/shop-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ open })
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw new Error(payload.message || 'บันทึกไม่สำเร็จ');
            render(payload);
        } catch (error) {
            if (window.showAlertDialog) window.showAlertDialog({ title: 'บันทึกไม่สำเร็จ', message: error.message, tone: 'danger' });
        } finally {
            btn.disabled = false;
        }
    }

    btn.addEventListener('click', () => {
        const isOpen = card.dataset.open === '1';
        if (!isOpen) { save(true); return; }
        // ปิดร้านต้องยืนยันก่อน กันกดพลาดตอนยังขายอยู่
        window.showConfirmDialog({
            title: 'ปิดร้านวันนี้?',
            message: 'ป้าย "เปิดอยู่" บนผังตลาดจะหายไป กดเปิดใหม่ได้ภายหลัง',
            tone: 'warning',
            confirmText: 'ปิดร้าน',
            onConfirm: () => save(false)
        });
    });
})();
