document.addEventListener('DOMContentLoaded', () => {
    function readJsonScript(id) {
        const el = document.getElementById(id);
        if (!el) return null;
        try {
            return JSON.parse(el.textContent || 'null');
        } catch (_) {
            return null;
        }
    }

    const CHECKLIST = readJsonScript('cleanlinessChecklistJson') || [];
    const RESULTS_BY_STALL_ID = readJsonScript('cleanlinessByStallIdJson') || {};
    const ITEM_IDS = CHECKLIST.flatMap((category) => category.items.map((item) => item.id));

    // --- สลับโหมด งานตรวจปัญหา / งานตรวจความสะอาด ---
    const modeTabIssue = document.getElementById('modeTabIssue');
    const modeTabCleanliness = document.getElementById('modeTabCleanliness');
    const issueModePanel = document.getElementById('issueModePanel');
    const cleanlinessModePanel = document.getElementById('cleanlinessModePanel');

    function setInspectionMode(mode) {
        const showCleanliness = mode === 'cleanliness';
        if (issueModePanel) issueModePanel.classList.toggle('d-none', showCleanliness);
        if (cleanlinessModePanel) cleanlinessModePanel.classList.toggle('d-none', !showCleanliness);
        if (modeTabIssue) modeTabIssue.classList.toggle('active', !showCleanliness);
        if (modeTabCleanliness) modeTabCleanliness.classList.toggle('active', showCleanliness);
    }

    if (modeTabIssue) modeTabIssue.addEventListener('click', () => setInspectionMode('issue'));
    if (modeTabCleanliness) modeTabCleanliness.addEventListener('click', () => setInspectionMode('cleanliness'));

    if (!cleanlinessModePanel) return; // ไม่มีโหมดความสะอาดในหน้านี้ (เช่น error state) — ไม่ต้องทำอะไรต่อ

    // --- ค้นหา + สถิติในตารางความสะอาด ---
    const cleanlinessSearch = document.getElementById('cleanlinessSearch');
    const cleanlinessRows = Array.from(document.querySelectorAll('.cleanliness-row'));
    const cleanlinessNoResults = document.getElementById('cleanlinessNoResults');
    const cleanTotalCountEl = document.getElementById('cleanTotalCount');
    const cleanPassedCountEl = document.getElementById('cleanPassedCount');
    const cleanFailedCountEl = document.getElementById('cleanFailedCount');
    const cleanPendingCountEl = document.getElementById('cleanPendingCount');

    function syncCleanlinessStats() {
        const total = cleanlinessRows.length;
        let passed = 0;
        let failed = 0;
        let pending = 0;

        cleanlinessRows.forEach((row) => {
            const badge = row.querySelector('[data-role="cleanliness-status"]');
            if (!badge) return;
            if (badge.classList.contains('status-passed')) passed += 1;
            else if (badge.classList.contains('status-failed')) failed += 1;
            else pending += 1;
        });

        if (cleanTotalCountEl) cleanTotalCountEl.textContent = String(total);
        if (cleanPassedCountEl) cleanPassedCountEl.textContent = String(passed);
        if (cleanFailedCountEl) cleanFailedCountEl.textContent = String(failed);
        if (cleanPendingCountEl) cleanPendingCountEl.textContent = String(pending);
    }

    function applyCleanlinessSearch() {
        const search = String(cleanlinessSearch?.value || '').trim().toLowerCase();
        let visibleCount = 0;

        cleanlinessRows.forEach((row) => {
            const searchText = String(row.dataset.search || '').toLowerCase();
            const shouldShow = !search || searchText.includes(search);
            row.style.display = shouldShow ? '' : 'none';
            if (shouldShow) visibleCount += 1;
        });

        if (cleanlinessNoResults) cleanlinessNoResults.classList.toggle('d-none', visibleCount > 0 || !cleanlinessRows.length);
    }

    if (cleanlinessSearch) cleanlinessSearch.addEventListener('input', applyCleanlinessSearch);

    syncCleanlinessStats();
    applyCleanlinessSearch();

    // --- ฟอร์มเช็คลิสต์ (modal ต่อร้าน) ---
    const formBackdrop = document.getElementById('cleanlinessFormBackdrop');
    const formModal = document.getElementById('cleanlinessFormModal');
    const formTitle = document.getElementById('cleanlinessFormTitle');
    const formBody = document.getElementById('cleanlinessFormBody');
    const formCancelBtn = document.getElementById('cleanlinessFormCancel');
    const formCloseBtn = document.getElementById('cleanlinessFormClose');
    const formSaveBtn = document.getElementById('cleanlinessFormSave');
    let activeStallId = null;
    let activeRow = null;

    function renderChecklistForm(existingResult) {
        const itemResults = existingResult?.itemResults || {};
        const note = existingResult?.note || '';

        const categoriesHtml = CHECKLIST.map((category) => {
            const itemsHtml = category.items.map((item) => {
                const current = itemResults[item.id];
                return `
                    <div class="cleanliness-item-row" data-item-id="${item.id}">
                        <div class="cleanliness-item-label">${item.id} ${item.label}</div>
                        <div class="cleanliness-item-options">
                            <label class="cleanliness-radio-option">
                                <input type="radio" name="cleanliness-item-${item.id}" value="pass" ${current === true ? 'checked' : ''}>
                                ผ่าน
                            </label>
                            <label class="cleanliness-radio-option">
                                <input type="radio" name="cleanliness-item-${item.id}" value="fail" ${current === false ? 'checked' : ''}>
                                ไม่ผ่าน
                            </label>
                        </div>
                    </div>`;
            }).join('');

            return `
                <div class="cleanliness-category">
                    <div class="cleanliness-category-title">${category.id}. ${category.title}</div>
                    ${itemsHtml}
                </div>`;
        }).join('');

        formBody.innerHTML = `
            ${categoriesHtml}
            <label class="cleanliness-note-label" for="cleanlinessFormNote">หมายเหตุเพิ่มเติม (ถ้ามี)</label>
            <textarea id="cleanlinessFormNote" maxlength="1000" placeholder="รายละเอียดเพิ่มเติม">${note}</textarea>
            <div class="cleanliness-form-error d-none" id="cleanlinessFormError"></div>
        `;
    }

    function collectFormResults() {
        const itemResults = {};
        let allAnswered = true;

        ITEM_IDS.forEach((id) => {
            const checked = formBody.querySelector(`input[name="cleanliness-item-${id}"]:checked`);
            if (!checked) {
                allAnswered = false;
                return;
            }
            itemResults[id] = checked.value === 'pass';
        });

        const noteInput = document.getElementById('cleanlinessFormNote');
        const note = noteInput ? noteInput.value.trim() : '';

        return { allAnswered, itemResults, note };
    }

    function openCleanlinessForm(row) {
        activeStallId = row.dataset.stallId;
        activeRow = row;

        const stallCode = row.querySelector('.stall-main')?.textContent?.trim() || '';
        formTitle.textContent = `เช็คลิสต์ตรวจสอบคุณภาพร้านค้า - ${stallCode}`;

        renderChecklistForm(RESULTS_BY_STALL_ID[activeStallId] || null);

        formBackdrop.classList.remove('d-none');
        formModal.classList.remove('d-none');
        document.body.classList.add('excess-panel-open');
    }

    function closeCleanlinessForm() {
        formBackdrop.classList.add('d-none');
        formModal.classList.add('d-none');
        document.body.classList.remove('excess-panel-open');
        activeStallId = null;
        activeRow = null;
    }

    document.querySelectorAll('[data-role="open-cleanliness-form"]').forEach((button) => {
        button.addEventListener('click', () => {
            const row = button.closest('.cleanliness-row');
            if (row) openCleanlinessForm(row);
        });
    });

    if (formCancelBtn) formCancelBtn.addEventListener('click', closeCleanlinessForm);
    if (formCloseBtn) formCloseBtn.addEventListener('click', closeCleanlinessForm);
    if (formBackdrop) formBackdrop.addEventListener('click', closeCleanlinessForm);

    async function saveCleanlinessForm() {
        if (!activeStallId || !activeRow) return;

        const { allAnswered, itemResults, note } = collectFormResults();
        const errorEl = document.getElementById('cleanlinessFormError');

        if (!allAnswered) {
            if (errorEl) {
                errorEl.textContent = 'กรุณาตรวจครบทุกข้อก่อนบันทึก';
                errorEl.classList.remove('d-none');
            }
            return;
        }

        formSaveBtn.disabled = true;
        if (errorEl) errorEl.classList.add('d-none');

        try {
            const response = await fetch('/staff/marketinspection/cleanliness', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stallId: activeStallId, itemResults, note })
            });
            const payload = await response.json();

            if (!response.ok || !payload.success) {
                throw new Error(payload.message || 'บันทึกไม่สำเร็จ');
            }

            RESULTS_BY_STALL_ID[activeStallId] = payload.inspection;

            const badge = activeRow.querySelector('[data-role="cleanliness-status"]');
            if (badge) {
                badge.classList.remove('status-passed', 'status-failed', 'status-pending');
                badge.classList.add(payload.inspection.overallPassed ? 'status-passed' : 'status-failed');
                badge.textContent = payload.inspection.overallPassed ? 'ผ่าน' : 'ไม่ผ่าน';
            }
            const checkedAtCell = activeRow.querySelector('[data-role="cleanliness-checked-at"]');
            if (checkedAtCell) {
                checkedAtCell.textContent = new Date(payload.inspection.checkedAt).toLocaleString('th-TH');
            }

            syncCleanlinessStats();
            closeCleanlinessForm();

            if (window.showAlertDialog) {
                window.showAlertDialog({
                    title: 'บันทึกสำเร็จ',
                    message: `บันทึกผลตรวจความสะอาดแล้ว: ${payload.inspection.overallPassed ? 'ผ่าน' : 'ไม่ผ่าน'}`,
                    tone: payload.inspection.overallPassed ? 'success' : 'danger'
                });
            }
        } catch (error) {
            console.error(error);
            if (errorEl) {
                errorEl.textContent = error.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่';
                errorEl.classList.remove('d-none');
            }
        } finally {
            formSaveBtn.disabled = false;
        }
    }

    if (formSaveBtn) formSaveBtn.addEventListener('click', saveCleanlinessForm);
});
