// โหมด "เดินตรวจ" — ตรวจสถานะร้าน (ไม่มาขาย/เช่าช่วง/...) และความสะอาดในการ์ดเดียวต่อร้าน เรียงตามเส้นทางเดิน
// ยิง /staff/marketinspection/issue และ /cleanliness เดิมพร้อมกันตอนกด "บันทึกและร้านถัดไป"
// แล้วอัปเดตตารางงานตรวจปัญหา/ความสะอาด/ผังให้ตรงกัน (ดู marketinspection.js, marketinspection-cleanliness.js)
//
// หลายคนเดินตรวจพร้อมกัน: แต่ละคนกด "รับร้าน" แล้วเซิร์ฟเวอร์สุ่มชุดร้านที่ยังไม่มีใครรับให้ (/walk/claim)
// การ์ดเดินเฉพาะร้านในชุดของตัวเอง สถานะทั้งทีมดึงใหม่ทุก 20 วิ (/walk/status) — ดู utils/inspectionAssignment.js
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

    // --- ใบงานของทีม (เซิร์ฟเวอร์เป็นตัวตัดสินว่าร้านไหนของใคร ตรวจแล้วหรือยัง) ---
    const teamBar = document.getElementById('walkTeamBar');
    let team = null; // ผลล่าสุดจาก /walk/status
    function walkInfo(it) {
        return team && team.byStall ? (team.byStall[it.id] || null) : null;
    }
    function isDone(it) {
        return !!walkInfo(it)?.done;
    }
    function heldByOther(it) {
        const info = walkInfo(it);
        return info && !info.mine && !info.done ? info : null;
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

    const itemById = {};
    items.forEach((it) => { itemById[it.id] = it; });

    let visible = [];
    let index = 0;
    let saving = false;
    let extra = null; // ร้านนอกชุดของตัวเองที่เปิดจากผัง (ยังไม่มีใครรับ/ตรวจแล้ว อยากแก้ผล)

    // ชุดร้านของฉันตามลำดับเส้นทางจากเซิร์ฟเวอร์ — คงร้านที่เปิดอยู่ไว้ถ้ายังอยู่ในชุด
    function rebuildVisible() {
        const current = currentItem();
        visible = (team ? team.mine : []).map((row) => itemById[String(row.stallId)]).filter(Boolean);
        if (extra && !visible.includes(extra)) visible.push(extra);
        const keep = current ? visible.indexOf(current) : -1;
        if (keep !== -1) {
            index = keep;
        } else {
            const firstPending = visible.findIndex((it) => !isDone(it));
            index = firstPending === -1 ? 0 : firstPending;
        }
    }

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
        const done = visible.filter((it) => isDone(it)).length;
        if (progressText) progressText.textContent = total ? `ชุดของคุณ ร้านที่ ${Math.min(index + 1, total)} / ${total} · ตรวจแล้ว ${done}` : 'ยังไม่มีร้านในมือ';
        if (progressFill) progressFill.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';

        if (jumpSelect) {
            const cur = currentItem();
            jumpSelect.innerHTML = visible.map((it, i) =>
                `<option value="${i}" ${cur && cur === it ? 'selected' : ''}>${isDone(it) ? '✓ ' : ''}${esc(it.code)}</option>`
            ).join('');
        }
        renderTeamBar();
    }

    // แถบทีม: ตรวจแล้วทั้งตลาด / กำลังตรวจ / ยังไม่มีคนรับ + ยอดของแต่ละคน
    function renderTeamBar() {
        if (!teamBar) return;
        if (!team) {
            teamBar.innerHTML = '<span class="walk-team-muted">กำลังโหลดสถานะทีม...</span>';
            return;
        }
        const myPending = team.mine.filter((row) => !row.done).length;
        const members = team.team.map((member) =>
            `<span class="walk-team-member ${member.isMe ? 'is-me' : ''}">${esc(member.isMe ? 'คุณ' : member.name)} ${member.done}/${member.total}</span>`
        ).join('');
        teamBar.innerHTML = `
            <div class="walk-team-summary">
                <span><b>ทีมตรวจแล้ว ${team.doneCount}/${team.totalCount}</b></span>
                <span>กำลังตรวจ ${team.inProgressCount}</span>
                <span>ยังไม่มีคนรับ ${team.unclaimedCount}</span>
            </div>
            ${members ? `<div class="walk-team-members">${members}</div>` : ''}
            ${myPending ? `<button type="button" class="walk-btn walk-btn-sm" data-walk-release="1"><i class="fas fa-rotate-left"></i> คืนร้านที่ยังไม่ตรวจ (${myPending})</button>` : ''}`;
    }

    // ป้าย "กำลังตรวจโดย ..." ในตารางงานตรวจปัญหา กันคนอื่นติ๊กร้านที่มีเจ้าของใบงานอยู่
    function syncHolderBadges() {
        items.forEach((it) => {
            const held = heldByOther(it);
            const host = it.row.querySelector('.stall-main');
            if (!host) return;
            let badge = it.row.querySelector('.walk-holder-badge');
            if (!held) {
                if (badge) badge.remove();
                return;
            }
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'walk-holder-badge';
                host.insertAdjacentElement('afterend', badge);
            }
            badge.textContent = `กำลังตรวจโดย ${held.holderName}`;
        });
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
            renderClaimScreen(errorMessage);
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

    // ยังไม่มีร้านในมือ — ให้กดรับชุดใหม่ (สุ่มจากร้านที่ยังไม่มีใครรับ เฉพาะโซนที่เลือกไว้ถ้าเลือก)
    function renderClaimScreen(errorMessage) {
        const zone = zoneSelect ? zoneSelect.value : 'ALL';
        const nothingLeft = team && team.unclaimedCount === 0;
        cardEl.innerHTML = `
            <div class="walk-finished">
                <i class="fas fa-${nothingLeft ? 'circle-check' : 'person-walking'}"></i>
                <div class="walk-finished-title">${nothingLeft ? 'ทุกร้านมีคนรับไปตรวจแล้ว' : 'ยังไม่มีร้านในมือ'}</div>
                <div class="walk-finished-sub">${nothingLeft
                    ? 'รอทีมตรวจให้ครบ แล้วไปหน้างานตรวจปัญหาเพื่อกด "ส่งงาน"'
                    : `ระบบจะสุ่มชุดร้านที่ยังไม่มีใครรับให้ ${zone === 'ALL' ? '' : `ในโซน ${esc(zone)} `}เรียงตามเส้นทางเดิน ไม่ซ้ำกับคนอื่น`}</div>
                <div class="walk-error ${errorMessage ? '' : 'd-none'}">${esc(errorMessage || '')}</div>
                ${nothingLeft
                    ? '<button type="button" class="walk-btn walk-btn-primary" data-walk-to-submit="1">ไปหน้าส่งงาน</button>'
                    : `<button type="button" class="walk-btn walk-btn-primary" data-walk-claim="1" ${!team || saving ? 'disabled' : ''}>
                        <i class="fas fa-hand"></i> ${saving ? 'กำลังสุ่มร้าน...' : 'รับร้านที่จะตรวจ'}</button>`}
            </div>`;
    }

    function renderFinished() {
        renderProgress();
        const canClaimMore = team && team.unclaimedCount > 0;
        cardEl.innerHTML = `
            <div class="walk-finished">
                <i class="fas fa-circle-check"></i>
                <div class="walk-finished-title">ตรวจชุดของคุณครบแล้ว</div>
                <div class="walk-finished-sub">${canClaimMore
                    ? `ยังมีร้านที่ไม่มีใครรับอีก ${team.unclaimedCount} ร้าน — รับเพิ่มได้เลย`
                    : 'ไปหน้างานตรวจปัญหาเพื่อกด "ส่งงาน" ได้เลย'}</div>
                ${canClaimMore ? '<button type="button" class="walk-btn walk-btn-primary" data-walk-claim="1"><i class="fas fa-hand"></i> รับร้านเพิ่ม</button>' : ''}
                <button type="button" class="walk-btn ${canClaimMore ? '' : 'walk-btn-primary'}" data-walk-to-submit="1">ไปหน้าส่งงาน</button>
                <button type="button" class="walk-btn" data-walk-review="1">กลับไปดูร้านแรก</button>
            </div>`;
    }

    // --- เซิร์ฟเวอร์: ดึงสถานะทีม / รับร้าน / คืนร้าน ---
    function applyTeam(payload) {
        team = payload;
        rebuildVisible();
        syncHolderBadges();
        if (walkMap) walkMap.refresh();
    }

    function renderCurrent(errorMessage) {
        if (!visible.length) {
            renderProgress();
            renderClaimScreen(errorMessage);
        } else if (visible.every((it) => isDone(it)) && !extra) {
            renderFinished();
        } else {
            renderCard(errorMessage);
        }
    }

    async function refreshTeam() {
        try {
            const response = await fetch('/staff/marketinspection/walk/status', { headers: { Accept: 'application/json' } });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw new Error(payload.message || 'โหลดสถานะไม่สำเร็จ');
            const before = currentItem();
            applyTeam(payload);
            // ไม่ render การ์ดใหม่ระหว่างกรอกข้อมูลร้านเดิม (กันสิ่งที่ติ๊กไว้/ตำแหน่งเลื่อนหาย) — อัปเดตแค่แถบความคืบหน้า
            if (!saving && before && before === currentItem()) renderProgress();
            else if (!saving) renderCurrent();
        } catch (error) {
            console.error(error);
        }
    }

    async function claimBatch() {
        if (saving) return;
        saving = true;
        renderCurrent();
        try {
            const payload = await postJson('/staff/marketinspection/walk/claim', { zone: zoneSelect ? zoneSelect.value : 'ALL' });
            extra = null;
            saving = false;
            applyTeam(payload);
            renderCurrent(payload.claimedCount ? '' : payload.message);
        } catch (error) {
            console.error(error);
            saving = false;
            renderCurrent(error.message || 'รับร้านไม่สำเร็จ กรุณาลองใหม่');
        }
    }

    function releaseRemaining() {
        const run = async () => {
            try {
                const payload = await postJson('/staff/marketinspection/walk/release', {});
                extra = null;
                applyTeam(payload);
                renderCurrent();
            } catch (error) {
                console.error(error);
                renderCurrent(error.message || 'คืนร้านไม่สำเร็จ กรุณาลองใหม่');
            }
        };
        if (!window.showConfirmDialog) {
            run();
            return;
        }
        window.showConfirmDialog({
            title: 'คืนร้านที่ยังไม่ตรวจ',
            message: 'ร้านที่ยังไม่ได้ตรวจในชุดของคุณจะกลับไปให้คนอื่นรับต่อ ร้านที่ตรวจแล้วยังนับเป็นของคุณ',
            tone: 'warning',
            confirmText: 'คืนร้าน',
            onConfirm: run
        });
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
        if (!response.ok || !payload.success) {
            const error = new Error(payload.message || 'บันทึกไม่สำเร็จ');
            error.conflict = !!payload.conflict; // 409: ร้านนี้อยู่ในใบงานของคนอื่น
            throw error;
        }
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

            // ตั้งเป็นตรวจแล้วทันทีไม่ต้องรอ poll รอบถัดไป (เซิร์ฟเวอร์ปิดใบงานให้แล้วตอนบันทึก)
            if (team) {
                team.byStall[it.id] = { ...(team.byStall[it.id] || {}), stallCode: it.code, done: true, mine: true };
                const mineRow = team.mine.find((row) => String(row.stallId) === it.id);
                if (mineRow) mineRow.done = true;
            }
            if (extra === it) extra = null;
            saving = false;
            syncHolderBadges();
            if (walkMap) walkMap.refresh();

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
            if (error.conflict) refreshTeam();
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
        } else if (target.dataset.walkClaim) {
            claimBatch();
        }
    });

    if (teamBar) {
        teamBar.addEventListener('click', (event) => {
            if (event.target.closest('[data-walk-release]')) releaseRemaining();
        });
    }

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

    // ตัวเลือกโซนใช้ตอนกดรับร้าน (สุ่มเฉพาะในโซนนั้น) — ชุดที่รับมาแล้วไม่ถูกกรองออก
    if (zoneSelect) zoneSelect.addEventListener('change', () => { if (!saving) renderCurrent(); });
    if (jumpSelect) jumpSelect.addEventListener('change', () => goTo(Number(jumpSelect.value)));

    // --- ผังตลาด (ตัวสร้างผังเดียวกับโหมดอื่น) สีตามความคืบหน้าการเดินตรวจ กดล็อกเพื่อกระโดดไปการ์ดร้านนั้น ---
    const itemByCode = {};
    items.forEach((it) => { itemByCode[it.code] = it; });

    function hasAnyProblem(it) {
        const d = it.draft;
        const cleanFailed = it.isFood && !d.noShow && failCount(it) > 0;
        return d.noShow || d.sublease || d.otherMarket || d.wrongSeller || !!d.otherIssueNote || !!electricLabel(it) || cleanFailed;
    }

    const walkMap = typeof window.createInspectionMap === 'function' ? window.createInspectionMap({
        ids: {
            toggleTable: 'walkViewToggleCard', toggleZone: 'walkViewToggleMap',
            tableWrap: 'walkCardWrap', mapWrap: 'walkMapWrap',
            overview: 'walkZoneOverview', detail: 'walkZoneDetail',
            detailTitle: 'walkZoneDetailTitle', canvas: 'walkZoneCanvas'
        },
        resolveStatus(code) {
            const it = itemByCode[code];
            if (!it) return 'vacant';
            if (!isDone(it)) return 'pending';
            return hasAnyProblem(it) ? 'failed' : 'passed';
        },
        statusLabel(status) {
            if (status === 'passed') return 'ตรวจแล้ว ปกติ';
            if (status === 'failed') return 'ตรวจแล้ว มีปัญหา';
            if (status === 'pending') return 'ยังไม่ตรวจ';
            return 'ว่าง';
        },
        tooltipMeta: (status) => (status === 'vacant' ? 'ล็อคว่าง' : 'คลิกเพื่อตรวจร้านนี้'),
        isClickable: (status) => status !== 'vacant',
        onCellClick(code, api) {
            const it = itemByCode[code];
            if (!it) return;
            const held = heldByOther(it);
            if (held) {
                if (window.showAlertDialog) {
                    window.showAlertDialog({ title: 'มีคนตรวจร้านนี้อยู่', message: `ล็อก ${code} อยู่ในชุดของ ${held.holderName}`, tone: 'warning' });
                }
                return;
            }
            // ร้านนอกชุดของตัวเอง (ยังไม่มีใครรับ/ตรวจแล้ว) เปิดตรวจได้ทีละร้าน ต่อท้ายชุดไว้ชั่วคราว
            if (!visible.includes(it)) {
                extra = it;
                visible.push(it);
            }
            index = visible.indexOf(it);
            api.setViewMode('table');
            renderCard();
        }
    }) : null;

    renderCurrent();
    refreshTeam();
    // ดึงสถานะทีมทุก 20 วิ ขณะหน้าจอเปิดอยู่ (ทุกแท็บ ป้าย "กำลังตรวจโดย" ในตารางจะได้ตรง และขยับ heartbeat
    // ให้ร้านในมือไม่ถูกคืนอัตโนมัติ) — ล็อกจอ/สลับแอปนานเกิน STALE_MINUTES ร้านที่ยังไม่ตรวจจะกลับเข้ากองกลาง
    setInterval(() => {
        if (!document.hidden) refreshTeam();
    }, 20000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshTeam();
    });

    // เปิดมาที่โหมดเดินตรวจเป็นค่าเริ่มต้น (รอบปัจจุบัน) — งานจริงเริ่มจากเดินตรวจ
    if (modeTabWalk) modeTabWalk.click();
});
