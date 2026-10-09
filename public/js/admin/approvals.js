// เลื่อนหน้าไปหาแบนเนอร์แจ้งเตือน (error/warning) อัตโนมัติหลัง redirect กลับมา
// กันแอดมินพลาดเห็นตอนหน้ายาวและ scroll ผ่านไปแล้ว — ไม่ใช้ pop up เพราะแอดมินต้องเลื่อนดูรูปสลิป
// เทียบยอดไปพร้อมกันด้วย pop up จะบังหน้าจอ
const flashBannerEl = document.getElementById('flashBanner');
if (flashBannerEl) {
    flashBannerEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashBannerEl.classList.add('flash-banner--flash');
    setTimeout(() => flashBannerEl.classList.remove('flash-banner--flash'), 1600);
}

// ส่งรอบที่กำลังดูไปด้วย ให้ controller redirect กลับมาหน้ารอบเดิม (ดู approvalsUrl ใน approvalController.js)
function appendRoundField(form) {
    const round = (window.APPROVAL_PAGE_STATE || {}).round;
    if (!round) return;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'round';
    input.value = String(round);
    form.appendChild(input);
}

function navigateToBookingRequest(requestId) {
    window.location.href = `/admin/booking-stall?requestId=${encodeURIComponent(String(requestId || ''))}`;
}

function submitApproval(requestId, status, reason) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/admin/approvals/confirm';

    const requestField = document.createElement('input');
    requestField.type = 'hidden';
    requestField.name = 'requestId';
    requestField.value = String(requestId);

    const statusField = document.createElement('input');
    statusField.type = 'hidden';
    statusField.name = 'status';
    statusField.value = status;

    form.appendChild(requestField);
    form.appendChild(statusField);

    if (reason) {
        const reasonField = document.createElement('input');
        reasonField.type = 'hidden';
        reasonField.name = 'reason';
        reasonField.value = reason;
        form.appendChild(reasonField);
    }

    appendRoundField(form);

    document.body.appendChild(form);
    form.submit();
}

// กล่องยืนยัน/แจ้งเตือนทั้งหมดในหน้านี้ใช้ window.showConfirmDialog()/showAlertDialog()
// กลางจาก public/js/common/dialogs.js (โหลดไว้ก่อนไฟล์นี้ใน views/admin/approvals.ejs)
function submitConfirmPayment(requestId) {
    window.showConfirmDialog({
        title: 'ยืนยันการชำระเงิน',
        message: 'ตรวจสลิปโอนเงินแล้วถูกต้องใช่ไหม? เลขล็อกจะถูกเปิดเผยให้ลูกค้าเห็นทันทีหลังกดยืนยัน',
        tone: 'success',
        confirmText: 'ยืนยันการชำระเงิน',
        onConfirm: () => {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/admin/approvals/confirm-payment';

            const requestField = document.createElement('input');
            requestField.type = 'hidden';
            requestField.name = 'requestId';
            requestField.value = String(requestId);

            form.appendChild(requestField);
            appendRoundField(form);
            document.body.appendChild(form);
            form.submit();
        }
    });
}

function submitRejectSlip(requestId) {
    window.showConfirmDialog({
        title: 'สลิปไม่ถูกต้อง',
        message: 'ระบุเหตุผลที่สลิปไม่ถูกต้อง (เช่น ยอดไม่ตรง/สลิปคนละคน/รูปไม่ชัด) ระบบจะล้างสลิปเดิมทิ้งและให้ผู้ขายอัปโหลดใหม่ ล็อกที่จัดไว้ยังเป็นของผู้ขายเหมือนเดิม',
        tone: 'danger',
        confirmText: 'ปฏิเสธสลิปนี้',
        inputPlaceholder: 'เหตุผลที่สลิปไม่ถูกต้อง',
        onConfirm: (reason) => {
            const trimmedReason = String(reason || '').trim();
            if (!trimmedReason) {
                window.showAlertDialog({ title: 'กรุณาระบุเหตุผล', message: 'ต้องระบุเหตุผลก่อนปฏิเสธสลิป', tone: 'warning' });
                return;
            }

            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/admin/approvals/reject-slip';

            const requestField = document.createElement('input');
            requestField.type = 'hidden';
            requestField.name = 'requestId';
            requestField.value = String(requestId);

            const reasonField = document.createElement('input');
            reasonField.type = 'hidden';
            reasonField.name = 'reason';
            reasonField.value = trimmedReason;

            form.appendChild(requestField);
            form.appendChild(reasonField);
            appendRoundField(form);
            document.body.appendChild(form);
            form.submit();
        }
    });
}

function submitForcePayment(requestId) {
    window.showConfirmDialog({
        title: 'ยืนยันการชำระเงินโดยไม่ตรวจสลิป',
        message: 'ยืนยันการชำระเงินโดยไม่ใช้ผลตรวจสลิปอัตโนมัติ (ตรวจสอบด้วยตาเองแล้ว) ใช่ไหม?',
        tone: 'warning',
        confirmText: 'ยืนยันต่อโดยไม่ตรวจสลิป',
        onConfirm: () => {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/admin/approvals/confirm-payment';

            const requestField = document.createElement('input');
            requestField.type = 'hidden';
            requestField.name = 'requestId';
            requestField.value = String(requestId);

            const forceField = document.createElement('input');
            forceField.type = 'hidden';
            forceField.name = 'force';
            forceField.value = '1';

            form.appendChild(requestField);
            form.appendChild(forceField);
            appendRoundField(form);
            document.body.appendChild(form);
            form.submit();
        }
    });
}


// ยกเลิกคำขอที่จัดล็อกแล้ว (เลยกำหนดจ่าย/ผู้ขายแจ้งยกเลิก) — ต้องผ่าน rejectBookingStall เพราะคืนล็อกด้วย
// (คำขอต่อล็อก: ล็อกกลับเป็นสัญญาเดิม ไม่ถูกปล่อยเป็นว่าง ดู releaseOrRestoreStalls ใน utils/stallRenewal.js)
function submitCancelAssignment(detail) {
    const isExtend = detail.kind === 'extend';
    window.showConfirmDialog({
        title: 'ยกเลิกการจัดล็อก',
        message: isExtend
            ? `ยกเลิกคำขอต่อล็อก #${detail.id} ของ "${detail.shop}" — ล็อก ${detail.assignedStallCode || ''} จะกลับเป็นสัญญาเดิม ระบุเหตุผลให้ผู้ขายเห็นได้ (ไม่บังคับ)`
            : `ยกเลิกคำขอ #${detail.id} ของ "${detail.shop}" — ล็อก ${detail.assignedStallCode || ''} จะกลับเป็นว่างให้คนอื่นจองได้ ระบุเหตุผลให้ผู้ขายเห็นได้ (ไม่บังคับ)`,
        tone: 'danger',
        confirmText: 'ยกเลิกการจัดล็อก',
        inputPlaceholder: 'เหตุผล เช่น ไม่ชำระเงินภายในกำหนด (ไม่บังคับ)',
        onConfirm: (reason) => postForm('/admin/booking-stall/reject', { requestId: detail.id, reason: String(reason || '').trim() })
    });
}

const closeStaleBtn = document.getElementById('closeStaleRound');
if (closeStaleBtn) {
    closeStaleBtn.addEventListener('click', () => window.showConfirmDialog({
        title: 'ปิดคำขอค้างทั้งรอบ',
        message: `ปฏิเสธ/ยกเลิกคำขอที่ค้างในรอบนี้ ${closeStaleBtn.dataset.count} รายการพร้อมกัน (ไม่รวมรายการที่ส่งสลิปแล้ว) ล็อกที่ยังถืออยู่จะถูกคืน และผู้ขายเห็นเหตุผลในแจ้งเตือน`,
        tone: 'danger',
        confirmText: 'ปิดทั้งหมด',
        inputPlaceholder: 'เหตุผล (ไม่ใส่ = "หมดรอบแล้ว ไม่ได้ดำเนินการต่อ")',
        onConfirm: (reason) => postForm('/admin/approvals/reject-stale-round', { reason: String(reason || '').trim() }) // round แนบโดย appendRoundField
    }));
}

function submitRejectRequest(detail) {
    window.showConfirmDialog({
        title: detail.kind === 'extend' ? 'ปฏิเสธคำขอต่อล็อก' : 'ปฏิเสธการจอง',
        message: `ระบุเหตุผลที่ปฏิเสธคำขอ #${detail.id} ของ "${detail.shop}" (จะแสดงให้ผู้ขายเห็น ไม่ระบุก็ได้)`,
        tone: 'danger',
        confirmText: 'ปฏิเสธคำขอ',
        inputPlaceholder: 'เหตุผลที่ปฏิเสธ (ไม่บังคับ)',
        onConfirm: (reason) => submitApproval(detail.id, 'REJECTED', String(reason || '').trim())
    });
}

function postForm(action, fields) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = action;
    Object.entries(fields).forEach(([name, value]) => {
        if (value === undefined || value === null || value === '') return;
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = String(value);
        form.appendChild(input);
    });
    appendRoundField(form);
    document.body.appendChild(form);
    form.submit();
}

// ---------- ตัวกรอง: ประเภท (จองใหม่/ต่อล็อก) × ขั้นตอน × โซน × คำค้น ----------
const pageState = window.APPROVAL_PAGE_STATE || { isEditable: true };
const rows = Array.from(document.querySelectorAll('.q-row'));
const sectionsEls = Array.from(document.querySelectorAll('.queue-section'));
const kindBtns = Array.from(document.querySelectorAll('.f-chip[data-kind]'));
const stageBtns = Array.from(document.querySelectorAll('.f-chip[data-stage]'));
const zoneBtns = Array.from(document.querySelectorAll('.f-chip[data-zone]'));
const searchInput = document.getElementById('shopSearch');
const visibleCountEl = document.getElementById('visibleCount');
const filteredEmptyEl = document.getElementById('filteredEmpty');
const resetBtn = document.getElementById('resetFilters');
const modal = document.getElementById('detailModal');

const TODO_STAGES = ['slip', 'overdue', 'assign'];
const DEFAULT_FILTERS = { kind: 'all', stage: 'all', zone: 'all', search: '' };
const filters = { ...DEFAULT_FILTERS };

// จำตัวกรองไว้ใน sessionStorage (แยกตามรอบ) — ทุกปุ่มส่งฟอร์มแล้วโหลดหน้าใหม่ ถ้าไม่จำ แอดมินที่ไล่ปิดงานทีละรายการ
// ต้องกดตัวกรองใหม่ทุกครั้ง (ปิดแท็บแล้วหายเอง ไม่ค้างข้ามวัน)
const FILTER_STORAGE_KEY = `approvalsFilters:${pageState.round || 'current'}`;
function saveFilters() {
    try {
        sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    } catch (error) { /* โหมดส่วนตัว/ปิด storage ก็แค่ไม่จำ */ }
}
function loadFilters() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(FILTER_STORAGE_KEY) || 'null');
        if (saved && typeof saved === 'object') {
            Object.keys(DEFAULT_FILTERS).forEach((key) => {
                if (typeof saved[key] === 'string') filters[key] = saved[key];
            });
        }
    } catch (error) { /* ค่าเสียก็ใช้ค่าเริ่มต้น */ }
}

function stageMatches(stageFilter, stage) {
    if (stageFilter === 'all') return true;
    if (stageFilter === 'todo') return TODO_STAGES.includes(stage);
    return stage === stageFilter;
}

// ignore = แถวตัวกรองที่กำลังนับเลขให้ (นับตามตัวกรองแถวอื่น ไม่นับแถวตัวเอง) — ตัวเลขบนปุ่มจึงบอกว่า "กดแล้วจะเห็นกี่รายการ"
function matches(row, ignore) {
    const d = row.dataset;
    return (ignore === 'kind' || filters.kind === 'all' || d.kind === filters.kind)
        && (ignore === 'stage' || stageMatches(filters.stage, d.stage))
        && (ignore === 'zone' || filters.zone === 'all' || d.zone === filters.zone)
        && (!filters.search || d.search.includes(filters.search));
}

function paintChips(buttons, key, countFor) {
    buttons.forEach((btn) => {
        const value = btn.dataset[key];
        const isActive = filters[key] === value;
        const count = countFor(value);
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
        btn.classList.toggle('is-empty', count === 0 && !isActive);
        const countEl = btn.querySelector('[data-count]');
        if (countEl) countEl.textContent = count;
    });
}

function applyFilters() {
    let visible = 0;
    rows.forEach((row) => {
        const show = matches(row);
        row.hidden = !show;
        if (show) visible += 1;
    });
    sectionsEls.forEach((section) => {
        const shown = section.querySelectorAll('.q-row:not([hidden])').length;
        section.hidden = shown === 0;
        const countEl = section.querySelector('[data-section-count]');
        if (countEl) countEl.textContent = shown;
    });

    const countRows = (ignore, test) => rows.filter((row) => matches(row, ignore) && test(row.dataset)).length;
    paintChips(kindBtns, 'kind', (kind) => countRows('kind', (d) => kind === 'all' || d.kind === kind));
    paintChips(stageBtns, 'stage', (stage) => countRows('stage', (d) => stageMatches(stage, d.stage)));
    paintChips(zoneBtns, 'zone', (zone) => countRows('zone', (d) => zone === 'all' || d.zone === zone));

    if (searchInput && searchInput.value.trim().toLowerCase() !== filters.search) searchInput.value = filters.search;
    if (visibleCountEl) visibleCountEl.textContent = visible;
    if (filteredEmptyEl) filteredEmptyEl.classList.toggle('d-none', !(rows.length && visible === 0));
    const isFiltered = Object.keys(DEFAULT_FILTERS).some((key) => filters[key] !== DEFAULT_FILTERS[key]);
    if (resetBtn) resetBtn.disabled = !isFiltered;
    saveFilters();
}

[[kindBtns, 'kind'], [stageBtns, 'stage'], [zoneBtns, 'zone']].forEach(([buttons, key]) => {
    buttons.forEach((btn) => btn.addEventListener('click', () => {
        filters[key] = btn.dataset[key];
        applyFilters();
    }));
});

if (searchInput) {
    searchInput.addEventListener('input', (event) => {
        filters.search = event.target.value.trim().toLowerCase();
        applyFilters();
    });
}

[resetBtn, ...document.querySelectorAll('[data-reset-filters]')].filter(Boolean).forEach((btn) => {
    btn.addEventListener('click', () => {
        Object.assign(filters, DEFAULT_FILTERS);
        applyFilters();
    });
});

// ---------- ปุ่มบนแถว ----------
function readDetail(row) {
    try {
        return JSON.parse(row.dataset.detail || '{}');
    } catch (error) {
        return {};
    }
}

function runAction(action, detail) {
    if (action === 'assign') return navigateToBookingRequest(detail.id);
    if (action === 'cancel') return submitCancelAssignment(detail);
    if (action === 'reject') return submitRejectRequest(detail);
    if (action === 'confirm-payment') return submitConfirmPayment(detail.id);
    if (action === 'reject-slip') return submitRejectSlip(detail.id);
    if (action === 'quotation') { window.location.href = `/admin/quotations/${detail.id}`; return undefined; }
    return openDetail(detail);
}

rows.forEach((row) => {
    row.addEventListener('click', (event) => {
        const actionBtn = event.target.closest('[data-action]');
        if (event.target.closest('a')) return; // ลิงก์ใบเสนอราคา
        runAction(actionBtn ? actionBtn.dataset.action : 'detail', readDetail(row));
    });
});

// ---------- หน้าต่างรายละเอียด: ปุ่มตามขั้นตอน ----------
// รอบที่ผ่านไปแล้ว (isEditable = false) ไม่มีปุ่มจัดล็อก/เปลี่ยนล็อก เหลือแค่ปุ่มปิดงาน
const STAGE_ACTIONS = {
    assign: (d) => (pageState.isEditable !== false
        ? [
            { action: 'reject', label: d.kind === 'extend' ? 'ปฏิเสธคำขอต่อ' : 'ปฏิเสธการจอง', tone: 'danger-ghost' },
            { action: 'assign', label: d.kind === 'extend' ? `ยืนยันล็อกเดิม ${d.extension ? d.extension.originalStallText : ''}`.trim() : 'จัดล็อก', tone: 'go' }
        ]
        : [{ action: 'reject', label: 'ปฏิเสธ (หมดรอบแล้ว)', tone: 'danger-ghost' }]),
    slip: () => [
        { action: 'reject-slip', label: 'สลิปไม่ถูกต้อง', tone: 'danger-ghost' },
        { action: 'confirm-payment', label: 'ยืนยันการชำระเงิน', tone: 'go' }
    ],
    overdue: () => [
        ...(pageState.isEditable !== false ? [{ action: 'assign', label: 'เปลี่ยนล็อก', tone: 'ghost' }] : []),
        { action: 'cancel', label: 'ยกเลิกการจัดล็อก', tone: 'danger' }
    ],
    awaiting: () => [
        { action: 'cancel', label: 'ยกเลิกการจัดล็อก', tone: 'danger-ghost' },
        ...(pageState.isEditable !== false ? [{ action: 'assign', label: 'เปลี่ยนล็อก', tone: 'ghost' }] : [])
    ],
    done: () => [{ action: 'quotation', label: 'ใบเสนอราคา', tone: 'ghost' }],
    rejected: () => []
};

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function openDetail(detail) {
    const isExtend = detail.kind === 'extend';
    setText('m-kicker', `${isExtend ? 'ต่อล็อก' : 'จองใหม่'} #${detail.id}${isExtend && detail.extendOfRequestId ? ` · ต่อจากคำขอ #${detail.extendOfRequestId}` : ''}`);
    setText('m-title', detail.shop);
    setText('m-shop', detail.shop);
    setText('m-zone', detail.zoneLabel);
    setText('m-name', detail.sellerName);
    setText('m-phone', detail.phone);
    setText('m-start', detail.createdAtText);
    setText('m-note', detail.note);
    setText('m-assigned-stall', detail.assignedStallCode || '-');

    const stageEl = document.getElementById('m-stage');
    if (stageEl) {
        const extra = (detail.stage === 'awaiting' || detail.stage === 'overdue') && detail.paymentDeadlineText
            ? ` · กำหนดจ่าย ${detail.paymentDeadlineText}` : '';
        const reason = detail.stage === 'rejected' && detail.rejectReason ? ` · ${detail.rejectReason}` : '';
        stageEl.className = `modal-stage modal-stage--${detail.stage}`;
        stageEl.textContent = `${detail.stageLabel}${extra}${reason}`;
    }

    const extEl = document.getElementById('m-ext');
    if (extEl) {
        const ext = detail.extension;
        extEl.classList.toggle('d-none', !ext);
        if (ext) {
            const cutoffLine = ext.cutoffState === 'passed'
                ? '<span class="flag flag--danger">เลย 20:00 แล้ว</span> ล็อกเดิมยังถูกกันไว้ให้คำขอนี้'
                : ext.cutoffText ? `ต้องจัดก่อน <span class="mono">${escapeHtml(ext.cutoffText)}</span>` : '';
            extEl.innerHTML = `
                <div><span class="modal-ext__label">ล็อกเดิม</span><span class="mono">${escapeHtml(ext.originalStallText)}</span></div>
                <div><span class="modal-ext__label">สัญญาเดิมหมด</span><span class="mono">${escapeHtml(ext.originalEndText)}</span></div>
                ${detail.stage === 'assign' && cutoffLine ? `<div class="modal-ext__wide">${cutoffLine}</div>` : ''}`;
        }
    }

    const booking = detail.booking;
    setText('m-rental-dates', booking ? `${booking.rentalStartDateText} – ${booking.rentalEndDateText} (${booking.rentalDays} วัน, คิดเงิน ${booking.billableDays} วัน)` : '-');
    setText('m-stall-appliance', booking ? `${booking.stallCount} ล็อก · เครื่องเล็ก ${booking.smallApplianceCount} · เครื่องใหญ่ ${booking.largeApplianceCount}` : '-');
    setText('m-price-label', booking ? (detail.isFinalPrice ? 'ยอดจริง' : 'ยอดประเมิน') : 'ยอด');
    setText('m-price', booking ? `${Number(booking.grandTotal).toLocaleString('th-TH')} บาท` : '-');

    const tags = [];
    if (detail.cornerZoneNote) tags.push(`<span class="tag tag--corner">สนใจล็อกเต็ง: ${escapeHtml(detail.cornerZoneNote)}</span>`);
    if (detail.rejectReason && detail.stage !== 'rejected') tags.push(`<span class="tag tag--slip-bad">เหตุผลที่ปฏิเสธครั้งก่อน: ${escapeHtml(detail.rejectReason)}</span>`);
    const tagsEl = document.getElementById('m-tags');
    if (tagsEl) {
        tagsEl.innerHTML = tags.join('');
        tagsEl.classList.toggle('d-none', tags.length === 0);
    }

    const slipBox = document.getElementById('m-payment-slip-box');
    const slipUrl = String(detail.paymentSlipImage || '').trim();
    if (slipBox) {
        slipBox.classList.toggle('d-none', !slipUrl);
        if (slipUrl) {
            document.getElementById('m-payment-slip').src = slipUrl;
            document.getElementById('m-payment-slip-link').href = slipUrl;
            setText('m-slip-expected', booking ? `ต้องชำระ ${Number(booking.grandTotal).toLocaleString('th-TH')} บาท` : '');
            const slipTag = detail.slipVerified === true
                ? '<span class="tag tag--slip-ok">สลิปจริง ยอดตรง</span>'
                : detail.slipVerified === false
                    ? `<span class="tag tag--slip-bad">สลิปมีปัญหา: ${escapeHtml(detail.slipVerifyReason || 'ตรวจไม่ผ่าน')}</span>`
                    : '<span class="tag tag--slip-pending">ยังไม่ตรวจสลิปอัตโนมัติ</span>';
            document.getElementById('m-slip-tags').innerHTML = slipTag;
        }
    }

    const imageUrl = String(detail.productImage || '').trim();
    const shopImageEl = document.getElementById('m-shop-image');
    const shopImageEmptyEl = document.getElementById('m-shop-image-empty');
    if (shopImageEl && shopImageEmptyEl) {
        shopImageEl.src = imageUrl;
        shopImageEl.classList.toggle('d-none', !imageUrl);
        shopImageEmptyEl.classList.toggle('d-none', Boolean(imageUrl));
    }

    const footer = document.getElementById('m-footer-actions');
    if (footer) {
        const actions = (STAGE_ACTIONS[detail.stage] || (() => []))(detail);
        footer.innerHTML = '';
        actions.forEach((item) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `q-btn q-btn--${item.tone}`;
            btn.textContent = item.label;
            btn.addEventListener('click', () => runAction(item.action, detail));
            footer.appendChild(btn);
        });
        footer.hidden = actions.length === 0;
    }

    modal.classList.add('active');
    const closeBtn = modal.querySelector('.btn-close');
    if (closeBtn) closeBtn.focus();
}

function closePopup() {
    if (modal) modal.classList.remove('active');
}

function closeModalOnOverlay(event) {
    if (event.target === modal) closePopup();
}

window.openDetail = openDetail;
window.closePopup = closePopup;
window.closeModalOnOverlay = closeModalOnOverlay;
window.submitApproval = submitApproval;
window.submitForcePayment = submitForcePayment;

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePopup();
});

// ---------- เวลาเหลือ: นับถอยหลังกำหนดจ่าย/เส้นตาย 20:00 อัปเดตทุก 1 นาที (เวลาจริงอยู่ใน title) ----------
function formatDuration(ms) {
    const totalMinutes = Math.max(1, Math.round(Math.abs(ms) / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days) return `${days} วัน ${hours} ชม.`;
    if (hours) return `${hours} ชม. ${minutes} นาที`;
    return `${minutes} นาที`;
}

const deadlineFlags = Array.from(document.querySelectorAll('[data-deadline]'));
deadlineFlags.forEach((flag) => {
    const exact = flag.querySelector('.mono');
    if (exact) flag.title = flag.textContent.trim().replace(/\s+/g, ' ');
});

function updateDeadlines() {
    const now = Date.now();
    deadlineFlags.forEach((flag) => {
        const deadline = Number(flag.dataset.deadline);
        if (!deadline) return;
        const left = deadline - now;
        const isCutoff = flag.dataset.deadlineKind === 'cutoff';
        let text;
        if (left > 0) {
            text = isCutoff ? `ต้องจัดใน ${formatDuration(left)}` : `เหลือเวลาจ่าย ${formatDuration(left)}`;
        } else {
            text = isCutoff ? `เลยเวลา 20:00 มา ${formatDuration(left)}` : `เลยกำหนดจ่ายมา ${formatDuration(left)}`;
        }
        flag.textContent = text;
        flag.classList.toggle('flag--danger', left <= 0);
        flag.classList.toggle('flag--warn', left > 0 && left <= (isCutoff ? 24 : 2) * 60 * 60 * 1000);
        flag.classList.toggle('flag--plain', left > (isCutoff ? 24 : 2) * 60 * 60 * 1000);
    });
}
updateDeadlines();
setInterval(updateDeadlines, 60 * 1000);

loadFilters();
applyFilters();
