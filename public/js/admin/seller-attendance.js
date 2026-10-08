// หน้า "การมาขายของร้านค้า" (staff + admin): กรองตามสถานะ, ขยายดูรายละเอียดต่อล็อก, หน้าต่างยืนยัน Blacklist
(function () {
    const table = document.getElementById('attTable');
    if (!table) return;

    const cards = Array.from(document.querySelectorAll('#attCards .att-card'));
    const rows = Array.from(table.querySelectorAll('tr.att-row'));
    const emptyRow = document.getElementById('attEmpty');
    let activeFilter = 'all';

    function detailOf(row) {
        return document.getElementById(row.dataset.detail);
    }

    function applyFilter() {
        let visible = 0;
        rows.forEach((row) => {
            const show = activeFilter === 'all' || row.dataset.status === activeFilter;
            row.hidden = !show;
            const detail = detailOf(row);
            const expanded = row.querySelector('.att-toggle').getAttribute('aria-expanded') === 'true';
            if (detail) detail.hidden = !show || !expanded;
            if (show) visible += 1;
        });
        if (emptyRow) emptyRow.hidden = visible > 0 || !rows.length;
        cards.forEach((card) => {
            const on = card.dataset.filter === activeFilter;
            card.classList.toggle('active', on);
            card.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    cards.forEach((card) => {
        card.addEventListener('click', () => {
            // กดการ์ดที่เลือกอยู่ซ้ำ = กลับไปดูทั้งหมด
            activeFilter = activeFilter === card.dataset.filter ? 'all' : card.dataset.filter;
            applyFilter();
        });
    });

    table.addEventListener('click', (event) => {
        const toggle = event.target.closest('.att-toggle');
        if (!toggle) return;
        const row = toggle.closest('tr.att-row');
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        row.classList.toggle('is-open', expanded);
        const detail = detailOf(row);
        if (detail) detail.hidden = !expanded;
    });

    // ----- หน้าต่างยืนยัน Blacklist (เฉพาะแอดมิน) -----
    const dialog = document.getElementById('blacklistDialog');
    if (!dialog) return;
    const check = document.getElementById('blConfirmCheck');
    const submit = document.getElementById('blSubmit');
    const field = (id) => document.getElementById(id);

    table.addEventListener('click', (event) => {
        const button = event.target.closest('.att-bl-btn');
        if (!button) return;
        const data = button.dataset;
        const flagged = data.flagged === '1';
        field('blName').textContent = data.name;
        field('blStalls').textContent = data.stalls || '-';
        field('blAbsent').textContent = data.absent;
        field('blDates').textContent = data.absentDates ? '(' + data.absentDates + ')' : '';
        field('blUserId').value = data.userId;
        field('blReason').value = data.reason || '';
        const note = field('blNote');
        note.textContent = flagged
            ? 'ร้านนี้ขายไม่มาเกินเกณฑ์ของรอบ'
            : 'ร้านนี้ยังไม่ถึงเกณฑ์ที่ระบบแนะนำให้ Blacklist — โปรดแน่ใจว่ามีเหตุผลอื่นที่เหมาะสม';
        note.classList.toggle('is-warning', !flagged);
        check.checked = false;
        submit.disabled = true;
        dialog.showModal();
    });

    check.addEventListener('change', () => { submit.disabled = !check.checked; });
    field('blCancel').addEventListener('click', () => dialog.close());
    // กดนอกกล่องเพื่อปิด
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
})();
