// โหมด "เดินตรวจ" — ตรวจสถานะร้าน (ไม่มาขาย/เช่าช่วง/...) และความสะอาดในการ์ดเดียวต่อร้าน เรียงตามเส้นทางเดิน
// ยิง /staff/marketinspection/issue และ /cleanliness เดิมพร้อมกันตอนกด "บันทึกและร้านถัดไป"
// แล้วอัปเดตตารางงานตรวจปัญหา/ความสะอาด/ผังให้ตรงกัน (ดู marketinspection.js, marketinspection-cleanliness.js)
//
// หลายคนเดินตรวจพร้อมกัน: เจ้าหน้าที่แบ่งร้านกันเองนอกระบบ หน้านี้แค่ช่วยเลือกร้าน — เปิดมาที่ผังภาพรวม
// (สีบอกตรวจแล้ว/ยัง ของทั้งทีม) แตะร้านหรือค้นหาร้านเพื่อเปิดการ์ดตรวจ — สถานะทีมดึงใหม่ทุก 20 วิ จาก
// /walk/status (ดู utils/inspectionAssignment.js) ไม่ล็อกร้าน ร้านที่คนอื่นตรวจแล้วบันทึกซ้ำได้ แค่บอกให้รู้
document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('walkModePanel');
    const cardEl = document.getElementById('walkCard');
    const zoneSelect = document.getElementById('walkZoneFilter');
    const searchInput = document.getElementById('walkSearch');
    const jumpSelect = document.getElementById('walkJump');
    const dayStatusSelect = document.getElementById('walkDayStatusFilter');
    const progressText = document.getElementById('walkProgressText');
    const progressFill = document.getElementById('walkProgressFill');
    const teamBar = document.getElementById('walkTeamBar');
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

    function timeLabel(value) {
        if (!value) return '';
        return new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    }

    // --- สถานะทั้งทีมจากเซิร์ฟเวอร์ (ร้านไหนตรวจแล้วโดยใคร) ---
    let team = null; // ผลล่าสุดจาก /walk/status
    function walkInfo(it) {
        return team && team.byStall ? (team.byStall[it.id] || null) : null;
    }
    function isDone(it) {
        return !!walkInfo(it);
    }

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
            const headMeta = Array.from(row.querySelectorAll('.stall-meta')).map((el) => el.textContent.trim());

            return {
                row,
                id: row.dataset.stallId,
                code,
                zone: row.dataset.zone,
                // ปล่อยเช่าช่วงที่แอดมินอนุมัติแล้ววันนี้ ('sublet') — ตรวจตามปกติ แต่ไม่ต้องติ๊ก "ปล่อยเช่าช่วง"
                dayStatus: row.dataset.dayStatus || 'normal',
                isFood: !!cleanRow,
                cleanRow,
                headMain: row.querySelector('.stall-main')?.textContent.trim() || code,
                headMeta,
                // ใช้ค้นหา: รหัสล็อก + ชื่อร้าน + ชื่อผู้ขาย + สินค้า (อยู่ใน stall-meta ทั้งหมด)
                searchText: `${code} ${headMeta.join(' ')}`.toLowerCase(),
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
                issueSyncedKey: null,
                touched: false // แก้ค่าในการ์ดแล้ว — ห้ามเอาค่าจากเซิร์ฟเวอร์มาทับ
            };
        });

    let visible = items.slice();
    let index = 0;
    let saving = false;
    let userNavigated = false; // เลือกร้านเองแล้ว (ผัง/ค้นหา/ข้ามไปล็อก) — โหลดสถานะทีมครั้งแรกจะไม่ย้ายการ์ดให้

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

    // --- แถบความคืบหน้า + รายการข้ามไปล็อก + แถบทีม ---
    function renderProgress() {
        const total = visible.length;
        const done = visible.filter((it) => isDone(it)).length;
        if (progressText) progressText.textContent = total ? `ร้านที่ ${Math.min(index + 1, total)} / ${total} · ตรวจแล้ว ${done}` : 'ไม่พบร้าน';
        if (progressFill) progressFill.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';

        if (jumpSelect) {
            const cur = currentItem();
            jumpSelect.innerHTML = visible.map((it, i) =>
                `<option value="${i}" ${cur && cur === it ? 'selected' : ''}>${isDone(it) ? '✓ ' : ''}${esc(it.code)}</option>`
            ).join('');
        }
        renderTeamBar();
    }

    function renderTeamBar() {
        if (!teamBar) return;
        if (!team) {
            teamBar.innerHTML = '<span class="walk-team-muted">กำลังโหลดสถานะทีม...</span>';
            return;
        }
        const members = team.team.map((member) =>
            `<span class="walk-team-member ${member.isMe ? 'is-me' : ''}">${esc(member.isMe ? 'คุณ' : member.name)} ${member.done}</span>`
        ).join('');
        teamBar.innerHTML = `
            <div class="walk-team-summary">
                <span><b>ทีมตรวจแล้ว ${team.doneCount}/${team.totalCount}</b></span>
                <span>ยังไม่ตรวจ ${team.uninspectedCount}</span>
            </div>
            ${members ? `<div class="walk-team-members">${members}</div>` : ''}`;
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

    // ร้านที่ตรวจแล้ววันนี้: บอกว่าใครตรวจ กี่โมง — คนอื่นตรวจแล้วก็บันทึกซ้ำได้ (ไม่บล็อก) แค่เตือนว่าจะทับผลเดิม
    function inspectedByHtml(it) {
        const info = walkInfo(it);
        if (!info) return '';
        if (info.mine) {
            return `<div class="walk-inspected-by is-mine"><i class="fas fa-user-check"></i> คุณตรวจร้านนี้แล้ว เวลา ${esc(timeLabel(info.inspectedAt))}</div>`;
        }
        return `<div class="walk-inspected-by"><i class="fas fa-user-check"></i> ตรวจแล้วโดย <b>${esc(info.inspectorName)}</b> เวลา ${esc(timeLabel(info.inspectedAt))}
            <small>บันทึกซ้ำได้ ผลใหม่จะแทนผลเดิม</small></div>`;
    }

    function renderCard(errorMessage) {
        renderProgress();
        const it = currentItem();

        if (!it) {
            cardEl.innerHTML = '<div class="walk-empty">ไม่พบร้านที่ค้นหา ลองเปลี่ยนคำค้นหรือโซน</div>';
            return;
        }

        const d = it.draft;
        const anyIssue = d.noShow || d.sublease || d.otherMarket || d.wrongSeller || !!d.otherIssueNote || !!electricLabel(it);
        const isLast = index >= visible.length - 1;

        cardEl.innerHTML = `
            <div class="walk-card-head">
                <div class="walk-card-code">${esc(it.headMain)}</div>
                ${isDone(it) ? '<span class="walk-done-badge"><i class="fas fa-check"></i> ตรวจแล้ว</span>' : ''}
            </div>
            <div class="walk-card-meta">${it.headMeta.map((line) => `<div>${esc(line)}</div>`).join('')}</div>
            ${inspectedByHtml(it)}

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
                <div class="walk-finished-title">ร้านในรายการนี้ตรวจครบแล้ว</div>
                <div class="walk-finished-sub">${team && team.uninspectedCount
                    ? `ทั้งตลาดยังไม่ได้ตรวจอีก ${team.uninspectedCount} ร้าน — ดูบนผังหรือล้างคำค้น/เปลี่ยนโซน`
                    : 'ไปหน้างานตรวจปัญหาเพื่อกด "ส่งงาน" ได้เลย'}</div>
                <button type="button" class="walk-btn walk-btn-primary" data-walk-to-map="1"><i class="fas fa-border-all"></i> ดูผังภาพรวม</button>
                <button type="button" class="walk-btn" data-walk-to-submit="1">ไปหน้าส่งงาน</button>
                <button type="button" class="walk-btn" data-walk-review="1">กลับไปดูร้านแรก</button>
            </div>`;
    }

    function goTo(newIndex) {
        if (newIndex < 0 || newIndex >= visible.length) return;
        userNavigated = true;
        index = newIndex;
        renderCard();
        window.scrollTo({ top: panel.offsetTop > 120 ? panel.offsetTop - 60 : 0, behavior: 'smooth' });
    }

    // ร้านถัดไปที่ยังไม่มีใครตรวจ (ต่อจากร้านปัจจุบัน แล้ววนกลับไปต้นลิสต์) — ไม่มี = ตรวจครบแล้ว
    function findNextPending() {
        for (let i = index + 1; i < visible.length; i += 1) {
            if (!isDone(visible[i])) return i;
        }
        for (let i = 0; i < index; i += 1) {
            if (!isDone(visible[i])) return i;
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

    function hasAnyProblem(it) {
        const d = it.draft;
        const cleanFailed = it.isFood && !d.noShow && failCount(it) > 0;
        return d.noShow || d.sublease || d.otherMarket || d.wrongSeller || !!d.otherIssueNote || !!electricLabel(it) || cleanFailed;
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

            // ตั้งเป็นตรวจแล้วทันทีไม่ต้องรอ poll (เซิร์ฟเวอร์บันทึกคนตรวจให้แล้ว ถ้าวันนี้ยังไม่มีใครตรวจร้านนี้)
            if (team && !team.byStall[it.id]) {
                team.byStall[it.id] = { stallCode: it.code, inspectorName: 'คุณ', inspectedAt: new Date().toISOString(), mine: true };
                team.doneCount += 1;
                team.uninspectedCount = Math.max(0, team.uninspectedCount - 1);
                const me = team.team.find((member) => member.isMe);
                if (me) me.done += 1;
                else team.team.push({ name: 'คุณ', done: 1, isMe: true });
            }
            if (team && team.byStall[it.id]) team.byStall[it.id].hasIssue = hasAnyProblem(it);
            it.touched = false;
            saving = false;
            if (walkMap) walkMap.refresh();
            refreshTeam(); // ยอดทีม/ยอดแต่ละคนนับจากเซิร์ฟเวอร์ — ดึงใหม่เลยไม่ต้องรอ poll 20 วิ

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

    // --- สถานะทีม: ดึงใหม่ทุก 20 วิ — ร้านที่เพื่อนเพิ่งตรวจจะเปลี่ยนสีบนผัง และการ์ดเติมค่าล่าสุดที่เพื่อนบันทึก ---
    function applyServerIssue(it) {
        const info = walkInfo(it);
        if (!info || !info.issue || it.touched || it === currentItem()) return;
        ['noShow', 'sublease', 'otherMarket', 'wrongSeller', 'otherIssueNote'].forEach((key) => {
            it.draft[key] = info.issue[key];
        });
        it.issueSyncedKey = issueKey(it);
        syncIssueToTable(it);
    }

    async function refreshTeam() {
        try {
            const response = await fetch('/staff/marketinspection/walk/status', { headers: { Accept: 'application/json' } });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw new Error(payload.message || 'โหลดสถานะไม่สำเร็จ');
            const firstLoad = !team;
            team = payload;
            items.forEach(applyServerIssue);
            if (walkMap) walkMap.refresh();
            if (firstLoad && !saving && !userNavigated) {
                // เปิดหน้ามาก่อนรู้สถานะทีม — ย้ายการ์ดไปร้านแรกที่ยังไม่มีใครตรวจ
                const firstPending = visible.findIndex((it) => !isDone(it));
                index = firstPending === -1 ? 0 : firstPending;
                renderCard();
            } else if (!saving) {
                // ไม่ render การ์ดใหม่ (กันสิ่งที่ติ๊กไว้/ตำแหน่งเลื่อนหาย) — อัปเดตแค่แถบความคืบหน้า/ทีม
                renderProgress();
            }
        } catch (error) {
            console.error(error);
        }
    }

    // --- events (delegation บนการ์ด เพราะ render ใหม่ทุกครั้ง) ---
    cardEl.addEventListener('click', (event) => {
        const target = event.target.closest('button');
        if (!target) return;
        const it = currentItem();

        if (target.dataset.walkChip && it) {
            it.draft[target.dataset.walkChip] = !it.draft[target.dataset.walkChip];
            it.touched = true;
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
        } else if (target.dataset.walkToMap && walkMap) {
            walkMap.setViewMode('zone');
        }
    });

    cardEl.addEventListener('input', (event) => {
        const it = currentItem();
        if (!it) return;
        if (event.target.id === 'walkOtherNote') {
            it.draft.otherIssueNote = event.target.value.trim();
            it.touched = true;
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

    // --- กรองรายการ: โซน + ค้นหา (รหัสล็อก/ชื่อร้าน/ชื่อผู้ขาย) + แผงวันนี้ (ปล่อยเช่าช่วง) ---
    function applyFilter(openItem) {
        const zone = zoneSelect ? zoneSelect.value : 'ALL';
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const dayStatus = dayStatusSelect ? dayStatusSelect.value : 'ALL';
        const current = openItem || currentItem();
        visible = items.filter((it) =>
            (zone === 'ALL' || String(it.zone).toUpperCase() === zone.toUpperCase()) &&
            (dayStatus === 'ALL' || it.dayStatus === dayStatus) &&
            (!query || it.searchText.includes(query)));
        const keep = current ? visible.indexOf(current) : -1;
        if (keep !== -1) {
            index = keep;
        } else {
            const firstPending = visible.findIndex((it) => !isDone(it));
            index = firstPending === -1 ? 0 : firstPending;
        }
        renderCard();
    }

    if (zoneSelect) zoneSelect.addEventListener('change', () => applyFilter());
    if (dayStatusSelect) dayStatusSelect.addEventListener('change', () => applyFilter());
    if (searchInput) {
        let timer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => applyFilter(), 200);
        });
        // Enter = เปิดการ์ดร้านแรกที่ตรงคำค้น (ถ้าอยู่บนผังจะสลับมาที่การ์ด)
        searchInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            applyFilter();
            if (visible.length && walkMap) walkMap.setViewMode('table');
            goTo(0);
        });
    }
    if (jumpSelect) jumpSelect.addEventListener('change', () => goTo(Number(jumpSelect.value)));

    // --- ผังภาพรวม (ตัวสร้างผังเดียวกับโหมดอื่น) สีตามผลตรวจของทั้งทีม แตะล็อกเพื่อเปิดการ์ดร้านนั้น ---
    const itemByCode = {};
    items.forEach((it) => { itemByCode[it.code] = it; });
    // แผงที่ลาหยุดวันนี้ไม่อยู่ในรายการตรวจ (ปิดการบันทึกไว้) — จำไว้แยกเพื่อระบายลายบนผัง
    const leaveCodes = new Set(Array.from(document.querySelectorAll('#inspectionTable .inspection-row[data-day-status="leave"]')).map((row) => row.dataset.stallCode));

    const walkMap = typeof window.createInspectionMap === 'function' ? window.createInspectionMap({
        ids: {
            toggleTable: 'walkViewToggleCard', toggleZone: 'walkViewToggleMap',
            tableWrap: 'walkCardWrap', mapWrap: 'walkMapWrap',
            overview: 'walkZoneOverview', detail: 'walkZoneDetail',
            detailTitle: 'walkZoneDetailTitle', canvas: 'walkZoneCanvas'
        },
        resolveStatus(code) {
            const it = itemByCode[code];
            if (!it) return leaveCodes.has(code) ? 'leave' : 'vacant';
            const info = walkInfo(it);
            if (!info) return it.dayStatus === 'sublet' ? 'sublet' : 'pending';
            return info.hasIssue ? 'failed' : 'passed';
        },
        statusLabel(status) {
            if (status === 'passed') return 'ตรวจแล้ว ปกติ';
            if (status === 'failed') return 'ตรวจแล้ว มีปัญหา';
            if (status === 'pending') return 'ยังไม่ตรวจ';
            if (status === 'sublet') return 'เช่าช่วงวันนี้ · ยังไม่ตรวจ';
            if (status === 'leave') return 'ลาหยุดวันนี้';
            return 'ว่าง';
        },
        tooltipMeta(status, code) {
            if (status === 'vacant') return 'ล็อคว่าง';
            if (status === 'leave') return 'แอดมินอนุมัติลาหยุดแล้ว ไม่ต้องตรวจ';
            if (status === 'sublet') return 'ร้านอื่นขายแทน (อนุมัติแล้ว) — ตรวจตามปกติ ไม่ต้องติ๊กปล่อยเช่าช่วง · คลิกเพื่อตรวจ';
            const it = itemByCode[code];
            const info = it ? walkInfo(it) : null;
            if (info) return esc(`ตรวจโดย ${info.mine ? 'คุณ' : info.inspectorName} ${timeLabel(info.inspectedAt)} · คลิกเพื่อเปิดร้านนี้`);
            return 'คลิกเพื่อตรวจร้านนี้';
        },
        isClickable: (status) => status !== 'vacant' && status !== 'leave',
        onCellClick(code, api) {
            const it = itemByCode[code];
            if (!it) return;
            userNavigated = true;
            // ร้านถูกกรองออกอยู่ — ล้างตัวกรองให้เห็นทุกร้าน แล้วเปิดร้านนี้
            if (!visible.includes(it)) {
                if (zoneSelect) zoneSelect.value = 'ALL';
                if (searchInput) searchInput.value = '';
                if (dayStatusSelect) dayStatusSelect.value = 'ALL';
            }
            applyFilter(it);
            api.setViewMode('table');
            window.scrollTo({ top: panel.offsetTop > 120 ? panel.offsetTop - 60 : 0, behavior: 'smooth' });
        }
    }) : null;

    applyFilter();
    refreshTeam();
    // ดึงสถานะทีมทุก 20 วิ ขณะหน้าจอเปิดอยู่ — ผังของทุกคนเห็นร้านที่เพื่อนเพิ่งตรวจ
    setInterval(() => {
        if (!document.hidden) refreshTeam();
    }, 20000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshTeam();
    });

    // เปิดมาที่โหมดเดินตรวจ + ผังภาพรวมเป็นค่าเริ่มต้น (รอบปัจจุบัน) — เลือกร้านจากผังหรือค้นหา แล้วตรวจในการ์ด
    if (modeTabWalk) modeTabWalk.click();
    if (walkMap) walkMap.setViewMode('zone');
});
