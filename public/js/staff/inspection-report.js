document.addEventListener('DOMContentLoaded', () => {
    // --- เลือกวัน (รอบเดียวกัน) ---
    const dateSelect = document.getElementById('dateFilterSelect');
    if (dateSelect) {
        dateSelect.addEventListener('change', () => {
            window.location.href = `/staff/marketinspection/report?round=${dateSelect.dataset.round}&date=${dateSelect.value}`;
        });
    }

    // --- สลับแท็บ แยกตามร้าน / หมวดปัญหา / หมวดความสะอาด ---
    const tabButtons = Array.from(document.querySelectorAll('[data-report-tab]'));
    const panels = Array.from(document.querySelectorAll('.report-tab-panel'));

    function setTab(name) {
        tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.reportTab === name));
        panels.forEach((panel) => panel.classList.toggle('d-none', panel.id !== `reportTab-${name}`));
        try { sessionStorage.setItem('reportTab', name); } catch (_) { /* ไม่มี storage ก็ใช้แท็บแรก */ }
    }

    tabButtons.forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.reportTab)));
    let savedTab = null;
    try { savedTab = sessionStorage.getItem('reportTab'); } catch (_) { /* ignore */ }
    if (savedTab && tabButtons.some((btn) => btn.dataset.reportTab === savedTab)) setTab(savedTab);

    // --- ตัวกรองแท็บแยกตามร้าน ---
    const storeRows = Array.from(document.querySelectorAll('.store-row'));
    const storeSearch = document.getElementById('storeSearch');
    const storeZone = document.getElementById('storeZone');
    const storeStatus = document.getElementById('storeStatus');
    const storeNoResults = document.getElementById('storeNoResults');

    function matchesStatus(row, status) {
        if (status === 'ALL') return true;
        if (status === 'problem') return row.dataset.problem === '1';
        if (status === 'noShow') return row.dataset.attendance === 'noShow';
        if (status === 'unchecked') return row.dataset.attendance === 'unchecked';
        if (status === 'cleanFailed') return row.dataset.clean === 'failed';
        return true;
    }

    function applyStoreFilter() {
        const search = String(storeSearch?.value || '').trim().toLowerCase();
        const zone = storeZone ? storeZone.value : 'ALL';
        const status = storeStatus ? storeStatus.value : 'ALL';
        let visible = 0;

        storeRows.forEach((row) => {
            const show = (!search || row.dataset.search.includes(search))
                && (zone === 'ALL' || row.dataset.zone === zone)
                && matchesStatus(row, status);
            row.style.display = show ? '' : 'none';
            if (show) visible += 1;
        });

        if (storeNoResults) storeNoResults.classList.toggle('d-none', visible > 0 || !storeRows.length);
    }

    [storeSearch, storeZone, storeStatus].forEach((el) => {
        if (el) el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', applyStoreFilter);
    });

    // --- ตัวกรองแท็บความสะอาด ---
    const cleanRows = Array.from(document.querySelectorAll('.clean-row'));
    const cleanStatus = document.getElementById('cleanStatus');
    const cleanNoResults = document.getElementById('cleanNoResults');

    if (cleanStatus) {
        cleanStatus.addEventListener('change', () => {
            let visible = 0;
            cleanRows.forEach((row) => {
                const show = cleanStatus.value === 'ALL' || row.dataset.clean === cleanStatus.value;
                row.style.display = show ? '' : 'none';
                if (show) visible += 1;
            });
            if (cleanNoResults) cleanNoResults.classList.toggle('d-none', visible > 0 || !cleanRows.length);
        });
    }
});
