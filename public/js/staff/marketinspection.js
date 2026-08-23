document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('inspectionSearch');
    const zoneFilter = document.getElementById('zoneFilter');
    const issueFilter = document.getElementById('issueFilter');
    const table = document.getElementById('inspectionTable');
    const flowHint = document.getElementById('inspectionFlowHint');
    const totalCountEl = document.getElementById('totalCount');
    const visibleCountEl = document.getElementById('visibleCount');
    const vacantCountEl = document.getElementById('vacantCount');
    const flaggedCountEl = document.getElementById('flaggedCount');
    const rows = Array.from(document.querySelectorAll('.inspection-row'));
    const noResults = document.getElementById('noResults');
    const issueLabelMap = {
        ALL: 'ทุกหัวข้อ',
        'no-show': 'ไม่มาขาย',
        sublease: 'ปล่อยเช่าช่วง',
        'other-market': 'ไปเปิดท้ายหรือขายอื่น',
        'wrong-seller': 'ขายไม่ตรง(แจ้งเจ้าของล็อค)',
        'electric-overuse': 'เครื่องใช้ไฟฟ้าเกิน',
        'other-issue': 'ปัญหาอื่นๆ'
    };
    let searchDebounceTimer = null;

    function getAnyIssueChecked(row) {
        return Array.from(row.querySelectorAll('input[type="checkbox"][data-issue]')).some((input) => input.checked);
    }

    function getIssueChecked(row, issue) {
        if (issue === 'ALL') return true;
        const issueInput = row.querySelector(`input[type="checkbox"][data-issue="${issue}"]`);
        return issueInput ? issueInput.checked : false;
    }

    function syncFlowHint(issue) {
        if (!flowHint) return;
        const issueLabel = issueLabelMap[issue] || issueLabelMap.ALL;
        flowHint.textContent = `โหมดตรวจ: ${issueLabel}`;
    }

    function syncCounters(visibleRows) {
        const totalCount = rows.length;
        const visibleCount = visibleRows.length;
        const vacantCount = visibleRows.filter((row) => row.classList.contains('is-vacant')).length;
        const flaggedCount = visibleRows.filter((row) => getAnyIssueChecked(row)).length;

        if (totalCountEl) totalCountEl.textContent = String(totalCount);
        if (visibleCountEl) visibleCountEl.textContent = String(visibleCount);
        if (vacantCountEl) vacantCountEl.textContent = String(vacantCount);
        if (flaggedCountEl) flaggedCountEl.textContent = String(flaggedCount);
    }

    function updateIssueMode(issue) {
        const issueMode = issue || 'ALL';
        if (table) table.dataset.activeIssue = issueMode;
        syncFlowHint(issueMode);
    }

    function applyFilter() {
        const search = String(searchInput?.value || '').trim().toLowerCase();
        const zone = String(zoneFilter?.value || 'ALL').toUpperCase();
        const issue = String(issueFilter?.value || 'ALL');

        const visibleRows = [];

        rows.forEach((row) => {
            const searchText = String(row.dataset.search || '').toLowerCase();
            const rowZone = String(row.dataset.zone || '').toUpperCase();

            const passSearch = !search || searchText.includes(search);
            const passZone = zone === 'ALL' || rowZone === zone;
            // ถ้าเลือกหัวข้อเฉพาะ: แสดงทั้งหมดแต่ไฮไลต์คอลัมน์นั้น (ไม่ซ่อน row)
            const passIssue = issue === 'ALL' ? true : true;

            const shouldShow = passSearch && passZone && passIssue;
            row.style.display = shouldShow ? '' : 'none';
            if (shouldShow) {
                visibleRows.push(row);
                const checkedForIssue = getIssueChecked(row, issue);
                row.classList.toggle('is-issue-matched', issue !== 'ALL' && checkedForIssue);
            }
        });

        updateIssueMode(issue);
        syncCounters(visibleRows);

        if (noResults) {
            noResults.classList.toggle('d-none', visibleRows.length > 0);
        }
    }

    function debounceApplyFilter() {
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }

        searchDebounceTimer = setTimeout(() => {
            applyFilter();
        }, 140);
    }

    rows.forEach((row) => {
        const checkboxes = row.querySelectorAll('input[type="checkbox"][data-issue]');
        checkboxes.forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                applyFilter();
            });
        });
    });

    if (searchInput) searchInput.addEventListener('input', debounceApplyFilter);
    if (zoneFilter) zoneFilter.addEventListener('change', applyFilter);
    if (issueFilter) issueFilter.addEventListener('change', applyFilter);

    applyFilter();
});
