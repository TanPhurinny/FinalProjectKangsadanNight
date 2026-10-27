// "ปิดร้านวันนี้" ในหน้าแรกผู้ขาย — ร้านเปิดเป็นค่าเริ่มต้น กดปิดเมื่อไม่ได้มาขาย/เก็บร้านแล้ว (กดยกเลิกได้ถ้ากดพลาด)
// ปิดแยกต่อร้าน: ปุ่มใหญ่ในแถบหัวหน้า = ร้านแรก, รายการ [data-open-shop] = ร้านอื่นของผู้ใช้ที่มีล็อกใช้งาน
(function () {
    const card = document.getElementById('openCheckin');
    const btn = document.getElementById('openCheckinBtn');
    if (!card || !btn) return;
    const label = document.getElementById('openCheckinLabel');
    const sub = document.getElementById('openCheckinSub');
    const hhmm = (d) => new Date(d).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    function renderMain(status) {
        card.dataset.open = status.isOpen ? '1' : '0';
        card.classList.toggle('is-open', status.isOpen);
        card.classList.toggle('is-closed', !status.isOpen);
        label.textContent = status.isOpen ? 'ร้านเปิดอยู่' : 'ปิดร้านแล้ววันนี้';
        sub.textContent = status.isOpen
            ? 'ลูกค้าเห็นร้านคุณบนผังตลาดตามปกติ · วันนี้ไม่ได้มาขายหรือเก็บร้านแล้ว กดปิดร้าน'
            : `ปิดเมื่อ ${hhmm(status.closedAt)} น. · ร้านจะกลับมาเปิดเองในวันขายถัดไป`;
        btn.textContent = status.isOpen ? 'ปิดร้านวันนี้' : 'ยกเลิกการปิดร้าน';
    }

    function renderRow(row, status) {
        row.dataset.open = status.isOpen ? '1' : '0';
        row.classList.toggle('is-open', status.isOpen);
        row.classList.toggle('is-closed', !status.isOpen);
        row.querySelector('[data-open-state]').textContent = status.isOpen ? 'เปิดอยู่' : `ปิดเมื่อ ${hhmm(status.closedAt)} น.`;
        row.querySelector('[data-open-btn]').textContent = status.isOpen ? 'ปิดร้านวันนี้' : 'ยกเลิกการปิด';
    }

    async function save(shopId, open, button, render) {
        button.disabled = true;
        try {
            const response = await fetch('/shop-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ open, shopId })
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw new Error(payload.message || 'บันทึกไม่สำเร็จ');
            render(payload);
        } catch (error) {
            if (window.showAlertDialog) window.showAlertDialog({ title: 'บันทึกไม่สำเร็จ', message: error.message, tone: 'danger' });
        } finally {
            button.disabled = false;
        }
    }

    function toggle(el, shopId, button, render) {
        if (el.dataset.open !== '1') { save(shopId, true, button, render); return; }
        window.showConfirmDialog({
            title: 'ปิดร้านวันนี้?',
            message: 'ลูกค้าจะเห็นบนผังตลาดว่าร้านปิดแล้ว ร้านจะกลับมาเปิดเองในวันขายถัดไป (กดยกเลิกได้ถ้ากดพลาด)',
            tone: 'warning',
            confirmText: 'ปิดร้าน',
            onConfirm: () => save(shopId, false, button, render)
        });
    }

    btn.addEventListener('click', () => toggle(card, card.dataset.shopId, btn, renderMain));
    card.querySelectorAll('[data-open-shop]').forEach((row) => {
        const rowBtn = row.querySelector('[data-open-btn]');
        rowBtn.addEventListener('click', () => toggle(row, row.dataset.openShop, rowBtn, (status) => renderRow(row, status)));
    });
})();
