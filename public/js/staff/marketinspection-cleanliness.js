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

    // --- สลับโหมด เดินตรวจ / งานตรวจปัญหา / งานตรวจความสะอาด ---
    const MODE_PANELS = {
        walk: { tab: document.getElementById('modeTabWalk'), panel: document.getElementById('walkModePanel') },
        issue: { tab: document.getElementById('modeTabIssue'), panel: document.getElementById('issueModePanel') },
        cleanliness: { tab: document.getElementById('modeTabCleanliness'), panel: document.getElementById('cleanlinessModePanel') }
    };
    const cleanlinessModePanel = MODE_PANELS.cleanliness.panel;

    function setInspectionMode(mode) {
        Object.keys(MODE_PANELS).forEach((key) => {
            const { tab, panel } = MODE_PANELS[key];
            if (panel) panel.classList.toggle('d-none', key !== mode);
            if (tab) tab.classList.toggle('active', key === mode);
        });
    }

    Object.keys(MODE_PANELS).forEach((key) => {
        if (MODE_PANELS[key].tab) MODE_PANELS[key].tab.addEventListener('click', () => setInspectionMode(key));
    });

    if (!cleanlinessModePanel) return; // ไม่มีโหมดความสะอาดในหน้านี้ (เช่น error state) — ไม่ต้องทำอะไรต่อ

    // --- ค้นหา + กรองโซน/สถานะ + สถิติในตารางความสะอาด ---
    const cleanlinessSearch = document.getElementById('cleanlinessSearch');
    const cleanlinessZoneFilter = document.getElementById('cleanlinessZoneFilter');
    const cleanlinessStatusFilter = document.getElementById('cleanlinessStatusFilter');
    const cleanlinessRows = Array.from(document.querySelectorAll('.cleanliness-row'));
    const cleanlinessNoResults = document.getElementById('cleanlinessNoResults');
    const cleanTotalCountEl = document.getElementById('cleanTotalCount');
    const cleanVisibleCountEl = document.getElementById('cleanVisibleCount');
    const cleanPassedCountEl = document.getElementById('cleanPassedCount');
    const cleanFailedCountEl = document.getElementById('cleanFailedCount');
    const cleanPendingCountEl = document.getElementById('cleanPendingCount');

    function getRowStatus(row) {
        const badge = row.querySelector('[data-role="cleanliness-status"]');
        if (!badge) return 'pending';
        if (badge.classList.contains('status-passed')) return 'passed';
        if (badge.classList.contains('status-failed')) return 'failed';
        return 'pending';
    }

    // สถิตินับตามแถวที่ผ่านตัวกรองโซน/ค้นหา (ไม่นับตัวกรองสถานะ เพื่อให้ยังเห็นภาพรวมของโซนนั้น)
    function syncCleanlinessStats(scopeRows, visibleCount) {
        let passed = 0;
        let failed = 0;
        let pending = 0;

        scopeRows.forEach((row) => {
            const status = getRowStatus(row);
            if (status === 'passed') passed += 1;
            else if (status === 'failed') failed += 1;
            else pending += 1;
        });

        if (cleanTotalCountEl) cleanTotalCountEl.textContent = String(cleanlinessRows.length);
        if (cleanVisibleCountEl) cleanVisibleCountEl.textContent = String(visibleCount);
        if (cleanPassedCountEl) cleanPassedCountEl.textContent = String(passed);
        if (cleanFailedCountEl) cleanFailedCountEl.textContent = String(failed);
        if (cleanPendingCountEl) cleanPendingCountEl.textContent = String(pending);
    }

    function applyCleanlinessFilter() {
        const search = String(cleanlinessSearch?.value || '').trim().toLowerCase();
        const zone = String(cleanlinessZoneFilter?.value || 'ALL').toUpperCase();
        const statusFilter = String(cleanlinessStatusFilter?.value || 'ALL');
        const scopeRows = [];
        let visibleCount = 0;

        cleanlinessRows.forEach((row) => {
            const searchText = String(row.dataset.search || '').toLowerCase();
            const rowZone = String(row.dataset.zone || '').toUpperCase();
            const inScope = (!search || searchText.includes(search)) && (zone === 'ALL' || rowZone === zone);
            const shouldShow = inScope && (statusFilter === 'ALL' || getRowStatus(row) === statusFilter);
            row.style.display = shouldShow ? '' : 'none';
            if (inScope) scopeRows.push(row);
            if (shouldShow) visibleCount += 1;
        });

        syncCleanlinessStats(scopeRows, visibleCount);
        if (cleanlinessNoResults) cleanlinessNoResults.classList.toggle('d-none', visibleCount > 0 || !cleanlinessRows.length);
    }

    if (cleanlinessSearch) cleanlinessSearch.addEventListener('input', applyCleanlinessFilter);
    if (cleanlinessZoneFilter) cleanlinessZoneFilter.addEventListener('change', applyCleanlinessFilter);
    if (cleanlinessStatusFilter) cleanlinessStatusFilter.addEventListener('change', applyCleanlinessFilter);

    // --- ผังตลาด (ใช้ตัวสร้างผังเดียวกับโหมดงานตรวจปัญหา) สีล็อกตามผลตรวจความสะอาด ---
    const rowByStallCode = {};
    cleanlinessRows.forEach((row) => { rowByStallCode[row.dataset.stallCode] = row; });

    const cleanlinessMap = typeof window.createInspectionMap === 'function' ? window.createInspectionMap({
        ids: {
            toggleTable: 'cleanViewToggleTable', toggleZone: 'cleanViewToggleZone',
            tableWrap: 'cleanlinessTableWrap', mapWrap: 'cleanlinessMapWrap',
            overview: 'cleanlinessZoneOverview', detail: 'cleanlinessZoneDetail',
            detailTitle: 'cleanlinessZoneDetailTitle', canvas: 'cleanlinessZoneCanvas'
        },
        // ล็อกที่ไม่ใช่ร้านอาหารไม่มีแถวในตาราง จึงแสดงเป็นสีเทา (ไม่ต้องตรวจ)
        resolveStatus(code) {
            const row = rowByStallCode[code];
            return row ? getRowStatus(row) : 'vacant';
        },
        statusLabel(status) {
            if (status === 'passed') return 'ผ่าน';
            if (status === 'failed') return 'ไม่ผ่าน';
            if (status === 'pending') return 'ยังไม่ตรวจ';
            return 'ไม่ใช่ร้านอาหาร/ว่าง';
        },
        tooltipMeta: (status) => (status === 'vacant' ? 'ไม่ต้องตรวจความสะอาด' : 'คลิกเพื่อเปิดเช็คลิสต์ร้านนี้'),
        isClickable: (status) => status !== 'vacant',
        onCellClick(code, api) {
            const row = rowByStallCode[code];
            if (!row) return;
            if (row.querySelector('[data-role="open-cleanliness-form"]')) {
                openCleanlinessForm(row);
                return;
            }
            // รอบย้อนหลังเปิดฟอร์มไม่ได้ — กลับไปตารางแล้วเลื่อนไปแถวนั้นแทน
            api.setViewMode('table');
            window.requestAnimationFrame(() => {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.remove('stall-cell-flash');
                void row.offsetWidth;
                row.classList.add('stall-cell-flash');
                setTimeout(() => row.classList.remove('stall-cell-flash'), 1500);
            });
        }
    }) : null;

    applyCleanlinessFilter();

    // อัปเดตผลตรวจของร้านหนึ่งในตาราง/ผัง/สถิติ — ใช้ทั้งตอนบันทึกจากฟอร์มนี้และจากโหมดเดินตรวจ
    function applyInspectionResult(stallId, inspection, rowOverride) {
        RESULTS_BY_STALL_ID[stallId] = inspection;
        const row = rowOverride || cleanlinessRows.find((r) => r.dataset.stallId === String(stallId));
        if (!row) return;

        const badge = row.querySelector('[data-role="cleanliness-status"]');
        if (badge) {
            badge.classList.remove('status-passed', 'status-failed', 'status-pending');
            badge.classList.add(inspection.overallPassed ? 'status-passed' : 'status-failed');
            badge.textContent = inspection.overallPassed ? 'ผ่าน' : 'ไม่ผ่าน';
        }
        const checkedAtCell = row.querySelector('[data-role="cleanliness-checked-at"]');
        if (checkedAtCell) {
            checkedAtCell.textContent = new Date(inspection.checkedAt).toLocaleString('th-TH');
        }
        // ผ่านตัวกรองใหม่ + วาดผังใหม่ — ถ้าเรียกจากฟอร์ม (rowOverride) จะหาร้านถัดไปก่อนแล้วค่อย apply เอง
        if (!rowOverride) {
            applyCleanlinessFilter();
            if (cleanlinessMap) cleanlinessMap.refresh();
        }
    }

    window.cleanlinessInspection = {
        checklist: CHECKLIST,
        itemIds: ITEM_IDS,
        results: RESULTS_BY_STALL_ID,
        applyResult: (stallId, inspection) => applyInspectionResult(stallId, inspection)
    };

    // --- ฟอร์มเช็คลิสต์ (modal ต่อร้าน) ---
    const formBackdrop = document.getElementById('cleanlinessFormBackdrop');
    const formModal = document.getElementById('cleanlinessFormModal');
    const formTitle = document.getElementById('cleanlinessFormTitle');
    const formSubtitle = document.getElementById('cleanlinessFormSubtitle');
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
                // ค่าเริ่มต้นตั้งเป็น "ผ่าน" ไว้ก่อนทุกข้อ (ข้อไหนมีปัญหาค่อยติ๊ก "ไม่ผ่าน" เอง) — เร็วกว่าตอนเดินตรวจจริง
                // ที่ส่วนใหญ่ผ่านหมดอยู่แล้ว ยกเว้นเคยบันทึกผลร้านนี้ไว้แล้วว่าข้อไหนไม่ผ่าน ให้เคารพค่าที่บันทึกไว้
                const current = itemResults[item.id];
                const isFail = current === false;
                return `
                    <div class="cleanliness-item-row" data-item-id="${item.id}">
                        <div class="cleanliness-item-label">${item.id} ${item.label}</div>
                        <div class="cleanliness-item-options">
                            <label class="cleanliness-radio-option">
                                <input type="radio" name="cleanliness-item-${item.id}" value="pass" ${!isFail ? 'checked' : ''}>
                                ผ่าน
                            </label>
                            <label class="cleanliness-radio-option">
                                <input type="radio" name="cleanliness-item-${item.id}" value="fail" ${isFail ? 'checked' : ''}>
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

    // หาแถวถัดไปที่ยังมองเห็นอยู่ (เคารพการค้นหา) ต่อจาก currentRow ในลำดับที่แสดงบนตาราง
    function findNextVisibleRow(currentRow) {
        const currentIndex = cleanlinessRows.indexOf(currentRow);
        if (currentIndex === -1) return null;
        for (let i = currentIndex + 1; i < cleanlinessRows.length; i += 1) {
            if (cleanlinessRows[i].style.display !== 'none') return cleanlinessRows[i];
        }
        return null;
    }

    function openCleanlinessForm(row, options = {}) {
        activeStallId = row.dataset.stallId;
        activeRow = row;

        // ดึงข้อมูลล็อก/ร้านค้าจากแถวในตารางมาโชว์บนหัวฟอร์มเลย (เลขล็อก, แถว+ชื่อร้าน, ผู้ขาย+เบอร์,
        // สินค้าหลัก) กันไม่ให้ staff ต้องปิดฟอร์มแล้วเลื่อนกลับไปดูตารางว่ากำลังตรวจร้านไหนอยู่
        // — สำคัญมากตอนเด้งไปร้านถัดไปอัตโนมัติหลังบันทึก (ดู saveCleanlinessForm)
        const stallCode = row.querySelector('.stall-main')?.textContent?.trim() || '';
        const metaLines = Array.from(row.querySelectorAll('.stall-meta')).map((el) => el.textContent.trim());
        formTitle.textContent = `เช็คลิสต์ตรวจสอบคุณภาพร้านค้า - ${stallCode}`;
        if (formSubtitle) {
            // ใช้ textContent ต่อบรรทัด ไม่ใช่ innerHTML — ชื่อร้าน/ผู้ขาย/สินค้ามาจากข้อมูลที่ผู้ใช้กรอกเอง
            // (seller ฝั่งสมัคร) ถ้าใส่ innerHTML ตรงๆ แล้วมีอักขระ HTML ปนอยู่ เสี่ยง stored XSS ได้
            formSubtitle.replaceChildren(...metaLines.map((line) => {
                const div = document.createElement('div');
                div.textContent = line;
                return div;
            }));
        }

        renderChecklistForm(RESULTS_BY_STALL_ID[activeStallId] || null);

        if (options.flashSaved && formBody) {
            const flash = document.createElement('div');
            flash.className = 'cleanliness-form-flash';
            flash.innerHTML = '<i class="fas fa-check-circle"></i> บันทึกร้านก่อนหน้าแล้ว — ตรวจร้านนี้ต่อได้เลย';
            formBody.prepend(flash);
        }

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

            applyInspectionResult(activeStallId, payload.inspection, activeRow);

            // ตรวจ+บันทึกเสร็จแล้วเด้งไปร้านถัดไปในลิสต์ที่มองเห็นอยู่ (เคารพตัวกรอง) ทันที
            // ไม่ต้องปิดฟอร์มแล้วกดเปิดร้านถัดไปเอง — ปิดฟอร์มเฉพาะตอนตรวจครบร้านสุดท้ายแล้วเท่านั้น
            // หาร้านถัดไปก่อน apply ตัวกรองใหม่ (ไม่งั้นร้านที่เพิ่งบันทึกอาจหายจากลิสต์กลางทาง)
            const savedRow = activeRow;
            const nextRow = findNextVisibleRow(savedRow);
            applyCleanlinessFilter();
            if (cleanlinessMap) cleanlinessMap.refresh();

            if (nextRow) {
                openCleanlinessForm(nextRow, { flashSaved: true });
            } else {
                closeCleanlinessForm();
                if (window.showAlertDialog) {
                    window.showAlertDialog({
                        title: 'ตรวจครบทุกร้านแล้ว',
                        message: `บันทึกผลตรวจความสะอาดร้านสุดท้ายแล้ว: ${payload.inspection.overallPassed ? 'ผ่าน' : 'ไม่ผ่าน'}`,
                        tone: payload.inspection.overallPassed ? 'success' : 'danger'
                    });
                }
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
