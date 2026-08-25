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
    const inspectedCountEl = document.getElementById('inspectedCount');
    const rows = Array.from(document.querySelectorAll('.inspection-row'));
    const noResults = document.getElementById('noResults');
    const smallPrice = Number(document.body.dataset.smallAppliancePrice || 20);
    const largePrice = Number(document.body.dataset.largeAppliancePrice || 40);
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

    function isElectricExcessActive(row) {
        const button = row.querySelector('.electric-excess-btn');
        return button ? button.dataset.active === 'true' : false;
    }

    function isInspectedChecked(row) {
        const checkbox = row.querySelector('input[data-role="inspected"]');
        return checkbox ? checkbox.checked : false;
    }

    function getAnyIssueChecked(row) {
        const anyCheckbox = Array.from(row.querySelectorAll('input[type="checkbox"][data-issue]')).some((input) => input.checked);
        return anyCheckbox || isElectricExcessActive(row);
    }

    function getIssueChecked(row, issue) {
        if (issue === 'ALL') return true;
        if (issue === 'electric-overuse') return isElectricExcessActive(row);
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
        const inspectedCount = visibleRows.filter(isInspectedChecked).length;

        if (totalCountEl) totalCountEl.textContent = String(totalCount);
        if (visibleCountEl) visibleCountEl.textContent = String(visibleCount);
        if (vacantCountEl) vacantCountEl.textContent = String(vacantCount);
        if (flaggedCountEl) flaggedCountEl.textContent = String(flaggedCount);
        if (inspectedCountEl) inspectedCountEl.textContent = String(inspectedCount);
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
            row.classList.toggle('is-inspected', isInspectedChecked(row));
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

    // --- ล็อค/ปลดล็อคหัวข้อปัญหา (no-show/sublease/other-market/wrong-seller/เครื่องใช้ไฟฟ้าเกิน/ปัญหาอื่นๆ)
    // เมื่อติ๊ก "ตรวจสอบแล้ว" กันแก้ไขข้อมูลย้อนหลังโดยไม่ตั้งใจ ต้องกดปุ่ม "แก้ไข" เพื่อปลดล็อคก่อน ---
    function lockRowFields(row, locked) {
        if (!row) return;
        row.querySelectorAll('[data-role="issue-field"]').forEach((field) => {
            field.disabled = locked;
        });
        const excessBtn = row.querySelector('.electric-excess-btn');
        if (excessBtn) excessBtn.disabled = locked;
        const editBtn = row.querySelector('.row-edit-btn');
        if (editBtn) editBtn.classList.toggle('d-none', !locked);
    }

    document.querySelectorAll('.row-edit-btn').forEach((button) => {
        button.addEventListener('click', () => {
            lockRowFields(button.closest('.inspection-row'), false);
        });
    });

    document.querySelectorAll('input[data-role="inspected"]').forEach((checkbox) => {
        checkbox.addEventListener('change', async () => {
            const row = checkbox.closest('.inspection-row');
            const stallId = checkbox.dataset.stallId;
            const isInspected = checkbox.checked;

            checkbox.disabled = true;

            try {
                const response = await fetch('/staff/marketinspection/inspection-check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ stallId, isInspected })
                });
                const payload = await response.json();

                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || 'บันทึกไม่สำเร็จ');
                }
            } catch (error) {
                checkbox.checked = !isInspected; // การบันทึกล้มเหลว: คืนค่าเดิมให้ตรงกับสิ่งที่บันทึกจริงใน DB
                console.error(error);
                if (window.showAlertDialog) {
                    window.showAlertDialog({ title: 'บันทึกไม่สำเร็จ', message: error.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่', tone: 'danger' });
                }
            } finally {
                checkbox.disabled = false;
                if (row) row.classList.toggle('is-inspected', checkbox.checked);
                lockRowFields(row, checkbox.checked);
                applyFilter();
            }
        });
    });

    // --- บันทึกหัวข้อปัญหา (checkbox 4 ตัว + หมายเหตุปัญหาอื่นๆ) ลง DB จริง ---
    // ส่งค่าทุก field ของแถวไปพร้อมกันเสมอ (ตรงกับ event log record เดียวที่ backend สร้างต่อครั้ง)
    function collectRowIssueState(row) {
        const getChecked = (issue) => {
            const el = row.querySelector(`input[type="checkbox"][data-issue="${issue}"]`);
            return el ? el.checked : false;
        };
        const noteInput = row.querySelector('.other-issue-input');

        return {
            noShow: getChecked('no-show'),
            sublease: getChecked('sublease'),
            otherMarket: getChecked('other-market'),
            wrongSeller: getChecked('wrong-seller'),
            otherIssueNote: noteInput ? noteInput.value.trim() : ''
        };
    }

    async function saveRowIssue(row) {
        if (!row) return false;
        const stallId = row.dataset.stallId;
        if (!stallId) return false;

        try {
            const response = await fetch('/staff/marketinspection/issue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stallId, ...collectRowIssueState(row) })
            });
            const payload = await response.json();

            if (!response.ok || !payload.success) {
                throw new Error(payload.message || 'บันทึกไม่สำเร็จ');
            }

            const noteInput = row.querySelector('.other-issue-input');
            if (noteInput) noteInput.dataset.lastSaved = payload.issue.otherIssueNote || '';
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    document.querySelectorAll('input[type="checkbox"][data-role="issue-field"]').forEach((checkbox) => {
        checkbox.addEventListener('change', async () => {
            const row = checkbox.closest('.inspection-row');
            const previousChecked = !checkbox.checked;

            checkbox.disabled = true;
            const ok = await saveRowIssue(row);
            checkbox.disabled = false;

            if (!ok) checkbox.checked = previousChecked; // บันทึกล้มเหลว: คืนค่าเดิม
            applyFilter();
        });
    });

    document.querySelectorAll('.other-issue-input').forEach((input) => {
        input.addEventListener('blur', async () => {
            const currentValue = input.value.trim();
            if (currentValue === (input.dataset.lastSaved || '')) return; // ไม่มีการเปลี่ยนแปลง ไม่ต้องยิง request ซ้ำ

            const previousValue = input.dataset.lastSaved || '';
            const row = input.closest('.inspection-row');

            input.disabled = true;
            const ok = await saveRowIssue(row);
            input.disabled = false;

            if (!ok) input.value = previousValue; // บันทึกล้มเหลว: คืนค่าเดิม
        });
    });

    if (searchInput) searchInput.addEventListener('input', debounceApplyFilter);
    if (zoneFilter) zoneFilter.addEventListener('change', applyFilter);
    if (issueFilter) issueFilter.addEventListener('change', applyFilter);

    // --- แผงบันทึกเครื่องใช้ไฟฟ้าเกิน (popover บน desktop / bottom sheet บนมือถือ) ---
    const excessBackdrop = document.getElementById('excessPanelBackdrop');
    const excessPanel = document.getElementById('excessPanel');
    const excessTitle = document.getElementById('excessPanelTitle');
    const excessSmallInput = document.getElementById('excessSmallCount');
    const excessLargeInput = document.getElementById('excessLargeCount');
    const excessNoteInput = document.getElementById('excessNote');
    const excessSubtotalPreview = document.getElementById('excessSubtotalPreview');
    const excessError = document.getElementById('excessPanelError');
    const excessSaveBtn = document.getElementById('excessPanelSave');
    const excessCancelBtn = document.getElementById('excessPanelCancel');
    const excessCloseBtn = document.getElementById('excessPanelClose');
    let activeExcessButton = null;

    function clampCount(value) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed < 0) return 0;
        return Math.min(parsed, 50);
    }

    function syncExcessSubtotal() {
        const small = clampCount(excessSmallInput.value);
        const large = clampCount(excessLargeInput.value);
        const subtotal = (small * smallPrice) + (large * largePrice);
        excessSubtotalPreview.textContent = String(subtotal);
    }

    function resetExcessPanelPosition() {
        excessPanel.style.removeProperty('top');
        excessPanel.style.removeProperty('left');
        excessPanel.style.removeProperty('transform');
    }

    function openExcessPanel(button) {
        if (button.disabled) return;

        activeExcessButton = button;
        excessTitle.textContent = `เครื่องใช้ไฟฟ้าเกิน - ล็อค ${button.dataset.stallCode || ''}`;
        excessSmallInput.value = clampCount(button.dataset.smallCount || 0);
        excessLargeInput.value = clampCount(button.dataset.largeCount || 0);
        excessNoteInput.value = button.dataset.note || '';
        excessError.classList.add('d-none');
        excessError.textContent = '';
        syncExcessSubtotal();

        excessBackdrop.classList.remove('d-none');
        excessPanel.classList.remove('d-none');
        document.body.classList.add('excess-panel-open');
        resetExcessPanelPosition();
    }

    function closeExcessPanel() {
        excessBackdrop.classList.add('d-none');
        excessPanel.classList.add('d-none');
        document.body.classList.remove('excess-panel-open');
        activeExcessButton = null;
        resetExcessPanelPosition();
    }

    function renderExcessButtonState(button, record) {
        button.dataset.smallCount = String(record.smallCount);
        button.dataset.largeCount = String(record.largeCount);
        button.dataset.note = record.note || '';
        const isActive = record.smallCount > 0 || record.largeCount > 0;
        button.dataset.active = isActive ? 'true' : 'false';
        button.innerHTML = isActive
            ? `เล็ก x${record.smallCount} / ใหญ่ x${record.largeCount} • ${record.subtotal}฿`
            : '<i class="fas fa-plus"></i> ไม่มี';
    }

    async function saveExcessRecord() {
        if (!activeExcessButton) return;

        const stallId = activeExcessButton.dataset.stallId;
        const smallCount = clampCount(excessSmallInput.value);
        const largeCount = clampCount(excessLargeInput.value);
        const note = String(excessNoteInput.value || '').trim();

        excessSaveBtn.disabled = true;
        excessError.classList.add('d-none');

        try {
            const response = await fetch('/staff/marketinspection/electric-excess', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stallId, smallCount, largeCount, note })
            });
            const payload = await response.json();

            if (!response.ok || !payload.success) {
                throw new Error(payload.message || 'บันทึกไม่สำเร็จ');
            }

            renderExcessButtonState(activeExcessButton, payload.record);
            closeExcessPanel();
            applyFilter();
        } catch (error) {
            excessError.textContent = error.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่';
            excessError.classList.remove('d-none');
        } finally {
            excessSaveBtn.disabled = false;
        }
    }

    document.querySelectorAll('.electric-excess-btn').forEach((button) => {
        button.addEventListener('click', () => openExcessPanel(button));
    });

    document.querySelectorAll('.excess-step-btn').forEach((stepButton) => {
        stepButton.addEventListener('click', () => {
            const target = stepButton.dataset.step === 'large' ? excessLargeInput : excessSmallInput;
            const dir = Number(stepButton.dataset.dir || 0);
            target.value = clampCount(Number(target.value || 0) + dir);
            syncExcessSubtotal();
        });
    });

    if (excessSmallInput) excessSmallInput.addEventListener('input', syncExcessSubtotal);
    if (excessLargeInput) excessLargeInput.addEventListener('input', syncExcessSubtotal);
    if (excessSaveBtn) excessSaveBtn.addEventListener('click', saveExcessRecord);
    if (excessCancelBtn) excessCancelBtn.addEventListener('click', closeExcessPanel);
    if (excessCloseBtn) excessCloseBtn.addEventListener('click', closeExcessPanel);
    if (excessBackdrop) excessBackdrop.addEventListener('click', closeExcessPanel);

    applyFilter();

    // --- ปุ่ม "ส่งงาน" ตรวจตลาดรายวัน — popup ยืนยันสรุปยอดตรวจแล้ว/ทั้งหมด ก่อนส่งจริง ---
    const submitDayBtn = document.getElementById('submitDayBtn');
    if (submitDayBtn) {
        submitDayBtn.addEventListener('click', () => {
            const inspectedCount = inspectedCountEl ? inspectedCountEl.textContent : '0';
            const totalCount = totalCountEl ? totalCountEl.textContent : '0';

            if (!window.showConfirmDialog) return;
            window.showConfirmDialog({
                title: 'ยืนยันส่งงาน',
                message: `ตรวจสำเร็จไปแล้ว ${inspectedCount} ร้าน / ทั้งหมด ${totalCount} ร้าน ยืนยันส่งงานตรวจตลาดวันนี้?`,
                tone: 'success',
                confirmText: 'ยืนยัน',
                cancelText: 'ยกเลิก',
                onConfirm: async () => {
                    submitDayBtn.disabled = true;
                    try {
                        const response = await fetch('/staff/marketinspection/submit-day', { method: 'POST' });
                        const payload = await response.json();
                        if (!response.ok || !payload.success) {
                            throw new Error(payload.message || 'ส่งงานไม่สำเร็จ');
                        }
                        if (window.showAlertDialog) {
                            window.showAlertDialog({
                                title: 'ส่งงานสำเร็จ',
                                message: `บันทึกยอดตรวจวันนี้แล้ว: ${payload.inspectedCount} จาก ${payload.totalCount} ร้าน`,
                                tone: 'success'
                            });
                        }
                    } catch (error) {
                        console.error(error);
                        if (window.showAlertDialog) {
                            window.showAlertDialog({ title: 'ส่งงานไม่สำเร็จ', message: error.message || 'กรุณาลองใหม่', tone: 'danger' });
                        }
                    } finally {
                        submitDayBtn.disabled = false;
                    }
                }
            });
        });
    }
});

