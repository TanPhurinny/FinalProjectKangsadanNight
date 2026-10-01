// "ปิดร้านวันนี้" ในหน้าแรกผู้ขาย — ร้านเปิดเป็นค่าเริ่มต้น กดปิดเมื่อไม่ได้มาขาย/เก็บร้านแล้ว (กดยกเลิกได้ถ้ากดพลาด)
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
        card.classList.toggle('is-closed', !status.isOpen);
        label.textContent = status.isOpen ? 'ร้านเปิดอยู่' : 'ปิดร้านแล้ววันนี้';
        sub.textContent = status.isOpen
            ? 'ลูกค้าเห็นร้านคุณบนผังตลาดตามปกติ · วันนี้ไม่ได้มาขายหรือเก็บร้านแล้ว กดปิดร้าน'
            : `ปิดเมื่อ ${hhmm(status.closedAt)} น. · ร้านจะกลับมาเปิดเองในวันขายถัดไป`;
        btn.textContent = status.isOpen ? 'ปิดร้านวันนี้' : 'ยกเลิกการปิดร้าน';
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
        if (card.dataset.open !== '1') { save(true); return; }
        window.showConfirmDialog({
            title: 'ปิดร้านวันนี้?',
            message: 'ลูกค้าจะเห็นบนผังตลาดว่าร้านปิดแล้ว ร้านจะกลับมาเปิดเองในวันขายถัดไป (กดยกเลิกได้ถ้ากดพลาด)',
            tone: 'warning',
            confirmText: 'ปิดร้าน',
            onConfirm: () => save(false)
        });
    });
})();
