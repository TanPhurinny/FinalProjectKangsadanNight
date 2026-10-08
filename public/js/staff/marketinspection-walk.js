// โหมด "เดินตรวจ" — ตรวจสถานะร้าน (ไม่มาขาย/เช่าช่วง/...) และความสะอาดในการ์ดเดียวต่อร้าน เรียงตามเส้นทางเดิน
// ไม่มี API ใหม่: ยิง /staff/marketinspection/issue และ /cleanliness เดิมพร้อมกันตอนกด "บันทึกและร้านถัดไป"
// แล้วอัปเดตตารางงานตรวจปัญหา/ความสะอาด/ผังให้ตรงกัน (ดู marketinspection.js, marketinspection-cleanliness.js)
document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('walkModePanel');
    const cardEl = document.getElementById('walkCard');
    const zoneSelect = document.getElementById('walkZoneFilter');
    const jumpSelect = document.getElementById('walkJump');
    const progressText = document.getElementById('walkProgressText');
    const progressFill = document.getElementById('walkProgressFill');
    const modeTabWalk = document.getElementById('modeTabWalk');
    if (!panel || !cardEl) return;

    const cleanApi = window.cleanlinessInspection || null;
    const CHECKLIST = cleanApi ? cleanApi.checklist : [];
    const ITEM_IDS = cleanApi ? cleanApi.itemIds : [];

    const ISSUE_CHIPS = [
        { key: 'noShow', label: 'ไม่มาขาย' },
        { key: 'sublease', label: 'ปล่อยเช่าช่วง' },
        { key: 'otherMarket', label: 'ไปเปิดท้ายหรือขายอื่น' },
        { key: 'wrongSeller', label: 'ขายไม่ตรง (แจ้งเจ้าของล็อค)' }
    ];
    const ISSUE_INPUT_ATTR = { noShow: 'no-show', sublease: 'sublease', otherMarket: 'other-market', wrongSeller: 'wrong-seller' };

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // --- เก็บ "ร้านที่ตรวจแล้ว" ไว้ใน sessionStorage กันรีเฟรชแล้วเริ่มใหม่ (ผูกกับวันที่/รอบของหน้า) ---
    const storageKey = `walkDone:${document.querySelector('.inspection-subtitle')?.textContent.trim() || ''}`;
    function loadDone() {
        try {
            return new Set(JSON.parse(sessionStorage.getItem(storageKey) || '[]'));
        } catch (_) {
            return new Set();
        }
    }
    function persistDone() {
        try {
            sessionStorage.setItem(storageKey, JSON.stringify(Array.from(doneIds)));
        } catch (_) { /* ไม่มี storage ก็แค่เริ่มใหม่ตอนรีเฟรช */ }
    }
    const doneIds = loadDone();

    // --- สร้างรายการร้านจากตารางงานตรวจปัญหา (เรียงตามเส้นทางเดินจากเซิร์ฟเวอร์อยู่แล้ว) ข้ามล็อกว่าง ---
    const cleanRowByCode = {};
    document.querySelectorAll('.cleanliness-row').forEach((row) => { cleanRowByCode[row.dataset.stallCode] = row; });

    const items = Array.from(document.querySelectorAll('#inspectionTable .inspection-row'))
        .filter((row) => !row.classList.contains('is-vacant') && row.querySelector('input[data-role="issue-field"]:not([disabled])'))
        .map((row) => {
            const code = row.dataset.stallCode;
            const isChecked = (issue) => !!row.querySelector(`input[data-issue="${issue}"]`)?.checked;
            const cleanRow = cleanRowByCode[code] || null;
            const saved = cleanApi && cleanRow ? cleanApi.results[row.dataset.stallId] : null;
            const itemResults = {};
            ITEM_IDS.forEach((id) => { itemResults[id] = saved?.itemResults?.[id] !== false; }); // ค่าเริ่มต้น "ผ่าน"

            return {
                row,
                id: row.dataset.stallId,
                code,
                zone: row.dataset.zone,
                isFood: !!cleanRow,
                cleanRow,
                headMain: row.querySelector('.stall-main')?.textContent.trim() || code,
                headMeta: Array.from(row.querySelectorAll('.stall-meta')).map((el) => el.textContent.trim()),
                electricBtn: row.querySelector('.electric-excess-btn'),
                draft: {
                    noShow: isChecked('no-show'),
                    sublease: isChecked('sublease'),
                    otherMarket: isChecked('other-market'),
                    wrongSeller: isChecked('wrong-seller'),
                    otherIssueNote: row.querySelector('.other-issue-input')?.value.trim() || '',
                    itemResults,
                    cleanNote: saved?.note || '',
                    cleanOpen: false
                },
                issueSyncedKey: null
            };
        });

    let visible = items.slice();
    let index = 0;
    let saving = false;

    function issueKey(it) {
        const d = it.draft;
        return JSON.stringify([d.noShow, d.sublease, d.otherMarket, d.wrongSeller, d.otherIssueNote]);
    }

    function failCount(it) {
        return ITEM_IDS.filter((id) => it.draft.itemResults[id] === false).length;
    }

    function electricLabel(it) {
        const btn = it.electricBtn;
        if (!btn || btn.dataset.active !== 'true') return null;
        return btn.textContent.replace(/\s+/g, ' ').trim();
    }

    function currentItem() {
        return visible[index] || null;
    }

    // --- แถบความคืบหน้า + รายการข้ามไปล็อก ---
    function renderProgress() {
        const total = visible.length;
        const done = visible.filter((it) => doneIds.has(it.id)).length;
        if (progressText) progressText.textContent = total ? `ร้านที่ ${Math.min(index + 1, total)} / ${total} · ตรวจแล้ว ${done}` : 'ไม่มีร้านให้ตรวจ';
        if (progressFill) progressFill.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';

        if (jumpSelect) {
            const cur = currentItem();
            jumpSelect.innerHTML = visible.map((it, i) =>
                `<option value="${i}" ${cur && cur === it ? 'selected' : ''}>${doneIds.has(it.id) ? '✓ ' : ''}${esc(it.code)}</option>`
            ).join('');
        }
    }

    function chipHtml(it) {
        const d = it.draft;
        const chips = ISSUE_CHIPS.map((chip) =>
            `<button type="button" class="walk-chip ${d[chip.key] ? 'is-on' : ''}" data-walk-chip="${chip.key}" aria-pressed="${d[chip.key]}">${esc(chip.label)}</button>`
        ).join('');
        const electric = electricLabel(it);
        const electricChip = `<button type="button" class="walk-chip ${electric ? 'is-on' : ''}" data-walk-electric="1">
            <i class="fas fa-plug"></i> ${electric ? esc(electric) : 'เครื่องใช้ไฟฟ้าเกิน'}</button>`;
        return chips + electricChip;
    }

    function cleanlinessHtml(it) {
        if (!it.isFood) return '';
        if (it.draft.noShow) {
            return '<div class="walk-section walk-skip"><i class="fas fa-ban"></i> ไม่มาขาย — ข้ามการตรวจความสะอาด</div>';
        }

        const fails = failCount(it);
        const summary = fails === 0
            ? '<span class="walk-pass"><i class="fas fa-check-circle"></i> ผ่านทุกข้อ</span>'
            : `<span class="walk-fail"><i class="fas fa-times-circle"></i> ไม่ผ่าน ${fails} ข้อ</span>`;

        let body = '';
        if (it.draft.cleanOpen) {
            body = CHECKLIST.map((category) => `
                <div class="cleanliness-category">
                    <div class="cleanliness-category-title">${esc(category.id)}. ${esc(category.title)}</div>
                    ${category.items.map((item) => {
                        const isFail = it.draft.itemResults[item.id] === false;
                        return `
                        <div class="cleanliness-item-row" data-item-id="${esc(item.id)}">
                            <div class="cleanliness-item-label">${esc(item.id)} ${esc(item.label)}</div>
                            <div class="cleanliness-item-options">
                                <label class="cleanliness-radio-option"><input type="radio" name="walk-${esc(item.id)}" value="pass" ${!isFail ? 'checked' : ''}> ผ่าน</label>
                                <label class="cleanliness-radio-option"><input type="radio" name="walk-${esc(item.id)}" value="fail" ${isFail ? 'checked' : ''}> ไม่ผ่าน</label>
                            </div>
                        </div>`;
                    }).join('')}
                </div>`).join('') + `
                <label class="cleanliness-note-label" for="walkCleanNote">หมายเหตุความสะอาด (ถ้ามี)</label>
                <textarea id="walkCleanNote" class="walk-textarea" maxlength="1000" placeholder="รายละเอียดเพิ่มเติม">${esc(it.draft.cleanNote)}</textarea>`;
        }

        return `
            <div class="walk-section">
                <div class="walk-section-head">
                    <div class="walk-section-title"><i class="fas fa-broom"></i> ความสะอาด</div>
                    <div class="walk-clean-summary">${summary}</div>
                </div>
                <button type="button" class="walk-toggle-clean" data-walk-toggle-clean="1">
                    <i class="fas fa-chevron-${it.draft.cleanOpen ? 'up' : 'down'}"></i> ${it.draft.cleanOpen ? 'ซ่อนเช็คลิสต์' : 'เปิดเช็คลิสต์'}
                </button>
                ${body}
            </div>`;
    }

    function renderCard(errorMessage) {
        renderProgress();
        const it = currentItem();

        if (!it) {
            cardEl.innerHTML = '<div class="walk-empty">ไม่มีร้านที่ต้องตรวจในโซนนี้</div>';
            return;
        }

        const d = it.draft;
        const anyIssue = d.noShow || d.sublease || d.otherMarket || d.wrongSeller || !!d.otherIssueNote || !!electricLabel(it);
        const isLast = index >= visible.length - 1;

        cardEl.innerHTML = `
            <div class="walk-card-head">
                <div class="walk-card-code">${esc(it.headMain)}</div>
                ${doneIds.has(it.id) ? '<span class="walk-done-badge"><i class="fas fa-check"></i> ตรวจแล้ว</span>' : ''}
            </div>
            <div class="walk-card-meta">${it.headMeta.map((line) => `<div>${esc(line)}</div>`).join('')}</div>

            <div class="walk-section">
                <div class="walk-section-head">
                    <div class="walk-section-title"><i class="fas fa-store"></i> สถานะร้าน</div>
                    <div class="walk-status ${anyIssue ? 'has-issue' : 'is-ok'}">${anyIssue ? 'พบปัญหา' : 'ปกติ'}</div>
                </div>
                <div class="walk-chips">${chipHtml(it)}</div>
                <input type="text" id="walkOtherNote" class="walk-input" maxlength="1000" placeholder="ปัญหาอื่นๆ (พิมพ์รายละเอียดถ้ามี)" value="${esc(d.otherIssueNote)}">
            </div>

            ${cleanlinessHtml(it)}

            <div class="walk-error ${errorMessage ? '' : 'd-none'}" id="walkError">${esc(errorMessage || '')}</div>

            <div class="walk-actions">
                <button type="button" class="walk-btn" data-walk-prev="1" ${index === 0 ? 'disabled' : ''}><i class="fas fa-arrow-left"></i> ก่อนหน้า</button>
                <button type="button" class="walk-btn" data-walk-skip="1" ${isLast ? 'disabled' : ''}>ข้าม</button>
                <button type="button" class="walk-btn walk-btn-primary" data-walk-save="1" ${saving ? 'disabled' : ''}>
                    ${saving ? 'กำลังบันทึก...' : 'บันทึกและร้านถัดไป'} <i class="fas fa-arrow-right"></i>
                </button>
            </div>`;
    }

    function renderFinished() {
        renderProgress();
        cardEl.innerHTML = `
            <div class="walk-finished">
                <i class="fas fa-circle-check"></i>
                <div class="walk-finished-title">ตรวจครบทุกร้านแล้ว</div>
                <div class="walk-finished-sub">ไปหน้างานตรวจปัญหาเพื่อกด "ส่งงาน" ได้เลย</div>
                <button type="button" class="walk-btn walk-btn-primary" data-walk-to-submit="1">ไปหน้าส่งงาน</button>
                <button type="button" class="walk-btn" data-walk-review="1">กลับไปดูร้านแรก</button>
            </div>`;
    }

    function goTo(newIndex) {
        if (newIndex < 0 || newIndex >= visible.length) return;
        index = newIndex;
        renderCard();
        window.scrollTo({ top: panel.offsetTop > 120 ? panel.offsetTop - 60 : 0, behavior: 'smooth' });
    }

    // ร้านถัดไปที่ยังไม่ตรวจ (ต่อจากร้านปัจจุบัน แล้ววนกลับไปต้นลิสต์) — ไม่มี = ตรวจครบแล้ว
    function findNextPending() {
        for (let i = index + 1; i < visible.length; i += 1) {
            if (!doneIds.has(visible[i].id)) return i;
        }
        for (let i = 0; i < index; i += 1) {
            if (!doneIds.has(visible[i].id)) return i;
        }
        return -1;
    }

    async function postJson(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || 'บันทึกไม่สำเร็จ');
        return payload;
    }

    // ซิงก์ค่าที่บันทึกแล้วกลับเข้าตารางงานตรวจปัญหา (ตั้งค่าตรงๆ ไม่ยิง event change กันบันทึกซ้ำ)
    function syncIssueToTable(it) {
        Object.keys(ISSUE_INPUT_ATTR).forEach((key) => {
            const input = it.row.querySelector(`input[data-issue="${ISSUE_INPUT_ATTR[key]}"]`);
            if (input) input.checked = !!it.draft[key];
        });
        const noteInput = it.row.querySelector('.other-issue-input');
        if (noteInput) {
            noteInput.value = it.draft.otherIssueNote;
            noteInput.dataset.lastSaved = it.draft.otherIssueNote;
        }
        if (typeof window.inspectionRefreshIssueView === 'function') window.inspectionRefreshIssueView();
    }

    async function saveCurrent() {
        const it = currentItem();
        if (!it || saving) return;
        const d = it.draft;

        saving = true;
        renderCard();

        try {
            // 1) สถานะร้าน — ข้ามถ้าค่าเดิมเพิ่งบันทึกสำเร็จไปแล้ว (กรณีกดลองใหม่หลังความสะอาดพลาด)
            if (it.issueSyncedKey !== issueKey(it)) {
                await postJson('/staff/marketinspection/issue', {
                    stallId: it.id,
                    noShow: d.noShow,
                    sublease: d.sublease,
                    otherMarket: d.otherMarket,
                    wrongSeller: d.wrongSeller,
                    otherIssueNote: d.otherIssueNote
                });
                it.issueSyncedKey = issueKey(it);
                syncIssueToTable(it);
            }

            // 2) ความสะอาด — เฉพาะร้านอาหารที่มาขาย
            if (it.isFood && !d.noShow && cleanApi) {
                const payload = await postJson('/staff/marketinspection/cleanliness', {
                    stallId: it.id,
                    itemResults: d.itemResults,
                    note: d.cleanNote
                });
                cleanApi.applyResult(it.id, payload.inspection);
            }

            doneIds.add(it.id);
            persistDone();
            saving = false;

            const next = findNextPending();
            if (next === -1) {
                renderFinished();
            } else {
                index = next;
                renderCard();
                window.scrollTo({ top: panel.offsetTop > 120 ? panel.offsetTop - 60 : 0, behavior: 'smooth' });
            }
        } catch (error) {
            console.error(error);
            saving = false;
            renderCard(error.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
        }
    }

    // --- events (delegation บนการ์ด เพราะ render ใหม่ทุกครั้ง) ---
    cardEl.addEventListener('click', (event) => {
        const target = event.target.closest('button');
        if (!target) return;
        const it = currentItem();

        if (target.dataset.walkChip && it) {
            it.draft[target.dataset.walkChip] = !it.draft[target.dataset.walkChip];
            renderCard();
        } else if (target.dataset.walkElectric && it) {
            if (it.electricBtn) it.electricBtn.click(); // เปิดแผงเครื่องใช้ไฟฟ้าเกินเดิม (บันทึกในแผงเลย)
        } else if (target.dataset.walkToggleClean && it) {
            it.draft.cleanOpen = !it.draft.cleanOpen;
            renderCard();
        } else if (target.dataset.walkSave) {
            saveCurrent();
        } else if (target.dataset.walkPrev) {
            goTo(index - 1);
        } else if (target.dataset.walkSkip) {
            goTo(index + 1);
        } else if (target.dataset.walkToSubmit) {
            document.getElementById('modeTabIssue')?.click();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (target.dataset.walkReview) {
            goTo(0);
        }
    });

    cardEl.addEventListener('input', (event) => {
        const it = currentItem();
        if (!it) return;
        if (event.target.id === 'walkOtherNote') {
            it.draft.otherIssueNote = event.target.value.trim();
        } else if (event.target.id === 'walkCleanNote') {
            it.draft.cleanNote = event.target.value.trim();
        }
    });

    cardEl.addEventListener('change', (event) => {
        const it = currentItem();
        if (!it || event.target.type !== 'radio') return;
        const itemId = event.target.name.replace(/^walk-/, '');
        it.draft.itemResults[itemId] = event.target.value === 'pass';
        // อัปเดตเฉพาะข้อความสรุป ไม่ render ใหม่ทั้งการ์ด (กันเลื่อนหน้าจอเด้งกลับตอนติ๊กกลางเช็คลิสต์)
        const summary = cardEl.querySelector('.walk-clean-summary');
        if (summary) {
            const fails = failCount(it);
            summary.innerHTML = fails === 0
                ? '<span class="walk-pass"><i class="fas fa-check-circle"></i> ผ่านทุกข้อ</span>'
                : `<span class="walk-fail"><i class="fas fa-times-circle"></i> ไม่ผ่าน ${fails} ข้อ</span>`;
        }
    });

    // แผงเครื่องใช้ไฟฟ้าเกินบันทึกแล้วจะอัปเดตปุ่มในตาราง — ดักเพื่อรีเฟรชชิปบนการ์ด
    items.forEach((it) => {
        if (!it.electricBtn) return;
        new MutationObserver(() => {
            if (currentItem() === it && !saving) renderCard();
        }).observe(it.electricBtn, { attributes: true, childList: true, subtree: true });
    });

    function applyZone() {
        const zone = zoneSelect ? zoneSelect.value : 'ALL';
        visible = items.filter((it) => zone === 'ALL' || String(it.zone).toUpperCase() === zone.toUpperCase());
        const firstPending = visible.findIndex((it) => !doneIds.has(it.id));
        index = firstPending === -1 ? 0 : firstPending;
        renderCard();
    }

    if (zoneSelect) zoneSelect.addEventListener('change', applyZone);
    if (jumpSelect) jumpSelect.addEventListener('change', () => goTo(Number(jumpSelect.value)));

    applyZone();

    // เปิดมาที่โหมดเดินตรวจเป็นค่าเริ่มต้น (รอบปัจจุบัน) — งานจริงเริ่มจากเดินตรวจ
    if (modeTabWalk) modeTabWalk.click();
});
