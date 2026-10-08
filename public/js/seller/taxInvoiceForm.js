/* ฟอร์มขอใบกำกับภาษี (หน้า "ร้านค้าของฉัน") — จัดรูปแบบตัวเลขตามช่อง ตรวจข้อมูลก่อนส่ง
   กติกาเดียวกับฝั่ง server ใน utils/taxProfileValidation.js (server ตรวจซ้ำเสมอ) */
(function () {
    const form = document.getElementById('taxInvoiceForm');
    if (!form) return;

    const $ = (id) => document.getElementById(id);
    const digitsOnly = (text) => String(text || '').replace(/\D/g, '');

    // ---------- ตัวจัดรูปแบบ/ตรวจ ----------
    function formatTaxId(text) {
        const d = digitsOnly(text).slice(0, 13);
        return [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12, 13)].filter(Boolean).join('-');
    }
    function hasValidCheckDigit(d) {
        if (d.length !== 13) return false;
        let sum = 0;
        for (let i = 0; i < 12; i += 1) sum += Number(d[i]) * (13 - i);
        return ((11 - (sum % 11)) % 10) === Number(d[12]);
    }
    function formatPhone(text) {
        const d = digitsOnly(text).slice(0, 10);
        if (d.length <= 2) return d;
        if (d.startsWith('02')) return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 9)].filter(Boolean).join('-');
        return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join('-');
    }
    const isValidPhone = (text) => /^0\d{8,9}$/.test(digitsOnly(text));
    const money = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ---------- ส่วนที่ 1: เลือกใบเสนอราคา ----------
    const quoteBoxes = Array.from(form.querySelectorAll('input[name="bookingRequestIds"]'));
    const pickAll = $('pickAllQuotations');
    const summary = $('quotationSummary');
    const submitBtn = $('taxSubmitBtn');

    function updateQuotationSummary() {
        const picked = quoteBoxes.filter((box) => box.checked);
        const total = picked.reduce((sum, box) => sum + (Number(box.dataset.amount) || 0), 0);
        summary.textContent = picked.length
            ? `เลือกแล้ว ${picked.length} ใบ · ยอดรวม ${money(total)} บาท`
            : 'เลือกแล้ว 0 ใบ';
        summary.classList.toggle('has-pick', picked.length > 0);
        submitBtn.textContent = picked.length ? `ส่งคำขอใบกำกับภาษี (${picked.length} ใบ)` : 'ส่งคำขอใบกำกับภาษี';
        if (pickAll) {
            pickAll.checked = picked.length === quoteBoxes.length && quoteBoxes.length > 0;
            pickAll.indeterminate = picked.length > 0 && picked.length < quoteBoxes.length;
        }
        if (picked.length) $('quotationError').hidden = true;
    }
    quoteBoxes.forEach((box) => box.addEventListener('change', updateQuotationSummary));
    if (pickAll) {
        pickAll.addEventListener('change', () => {
            quoteBoxes.forEach((box) => { box.checked = pickAll.checked; });
            updateQuotationSummary();
        });
    }
    updateQuotationSummary();

    // ---------- ส่วนที่ 2: โหมดโปรไฟล์ ----------
    const btnUseExisting = $('btnUseExisting');
    const btnUseNew = $('btnUseNew');
    const existingBlock = $('existingProfileBlock');
    const newBlock = $('newProfileBlock');
    const profileSelect = $('taxInvoiceProfileId');
    const typeInput = $('taxpayerTypeInput');
    const taxIdInput = $('taxIdInput');
    const nameInput = $('taxpayerNameInput');
    const branchGroup = $('branchGroup');
    const branchKind = $('branchKind');
    const branchNo = $('branchNo');
    const branchValue = $('branchValue');
    const phoneInput = $('phoneInput');
    const addressInput = $('addressInput');
    const newFields = [typeInput, taxIdInput, nameInput, branchValue, phoneInput, addressInput];
    let mode = 'new';

    const BRANCH_LABEL = 'สาขาที่ ';

    function setMode(next) {
        mode = next;
        const isNew = mode === 'new';
        btnUseNew.classList.toggle('active', isNew);
        btnUseExisting.classList.toggle('active', !isNew);
        existingBlock.style.display = isNew ? 'none' : '';
        newBlock.style.display = isNew ? '' : 'none';
        profileSelect.disabled = isNew;
        if (isNew) profileSelect.value = '';
        newFields.forEach((el) => { el.disabled = !isNew; });
        applyType();
        showPreview();
        $('profileError').hidden = true;
    }

    // ---------- ตัวอย่างโปรไฟล์เดิมที่เลือก ----------
    const preview = $('profilePreview');
    function showPreview() {
        const option = profileSelect.options[profileSelect.selectedIndex];
        if (mode !== 'existing' || !option || !option.value) { preview.hidden = true; return; }
        const d = option.dataset;
        preview.innerHTML = '';
        const rows = [
            ['ชื่อ', d.name],
            ['เลขผู้เสียภาษี', d.taxid],
            d.type === 'COMPANY' ? ['สาขา', d.branch || 'สำนักงานใหญ่'] : null,
            d.phone ? ['เบอร์โทร', d.phone] : null,
            ['ที่อยู่', d.address]
        ].filter(Boolean);
        rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            const l = document.createElement('span');
            l.textContent = label;
            const v = document.createElement('b');
            v.textContent = value;
            row.append(l, v);
            preview.appendChild(row);
        });
        preview.hidden = false;
        $('profileError').hidden = true;
    }
    profileSelect.addEventListener('change', showPreview);

    // ---------- ประเภทผู้เสียภาษี (นิติบุคคล / บุคคลธรรมดา) ----------
    function applyType() {
        const isCompany = typeInput.value === 'COMPANY';
        $('taxIdLabel').textContent = isCompany ? 'เลขประจำตัวผู้เสียภาษี (13 หลัก)' : 'เลขบัตรประชาชน (13 หลัก)';
        nameInput.placeholder = isCompany ? 'เช่น บริษัท ตัวอย่าง จำกัด' : 'เช่น นายสมชาย ใจดี';
        nameInput.autocomplete = isCompany ? 'organization' : 'name';
        branchGroup.style.display = isCompany ? '' : 'none';
        branchValue.disabled = mode !== 'new' || !isCompany;
        updateNameHint();
    }
    typeInput.addEventListener('change', () => { applyType(); saveDraft(); });

    // ---------- เลขผู้เสียภาษี ----------
    const existingTaxIds = Array.from(profileSelect.options)
        .filter((option) => option.value)
        .map((option) => digitsOnly(option.dataset.taxid));

    function setHint(el, text, tone) {
        el.textContent = text || '';
        el.classList.toggle('is-ok', tone === 'ok');
        el.classList.toggle('is-warn', tone === 'warn');
        el.classList.toggle('is-error', tone === 'error');
    }

    function updateTaxIdHint() {
        const d = digitsOnly(taxIdInput.value);
        if (!d.length) { setHint($('taxIdHint'), ''); return; }
        if (d.length < 13) { setHint($('taxIdHint'), `กรอกแล้ว ${d.length}/13 หลัก`); return; }
        if (existingTaxIds.includes(d)) {
            setHint($('taxIdHint'), 'มีโปรไฟล์เลขนี้อยู่แล้ว — เลือก "ใช้โปรไฟล์เดิม" ได้เลย', 'warn');
            return;
        }
        if (hasValidCheckDigit(d)) setHint($('taxIdHint'), '✓ เลขครบ 13 หลักและผ่านการตรวจเลขท้าย', 'ok');
        else setHint($('taxIdHint'), '⚠ เลขนี้ไม่ผ่านการตรวจเลขท้าย ตรวจตัวเลขอีกครั้ง (ส่งต่อได้ แอดมินจะตรวจซ้ำ)', 'warn');
    }
    taxIdInput.addEventListener('input', () => {
        taxIdInput.value = formatTaxId(taxIdInput.value);
        clearInvalid(taxIdInput);
        updateTaxIdHint();
        saveDraft();
    });

    // ---------- ชื่อ ----------
    function updateNameHint() {
        $('nameCounter').textContent = `${nameInput.value.length}/120`;
        const v = nameInput.value.trim();
        const looksCompany = /บริษัท|บจก|ห้างหุ้นส่วน|หจก|จำกัด|มหาชน/.test(v);
        if (typeInput.value === 'COMPANY' && v.length > 3 && !looksCompany) {
            setHint($('nameHint'), ' · ชื่อนิติบุคคลมักมีคำว่า บริษัท / ห้างหุ้นส่วน / จำกัด', 'warn');
        } else {
            setHint($('nameHint'), '');
        }
    }
    nameInput.addEventListener('input', () => { clearInvalid(nameInput); updateNameHint(); saveDraft(); });

    // ---------- สาขา ----------
    function syncBranch() {
        const isBranch = branchKind.value === 'BRANCH';
        branchNo.hidden = !isBranch;
        const no = digitsOnly(branchNo.value);
        branchValue.value = isBranch ? (no ? `${BRANCH_LABEL}${no.padStart(5, '0')}` : '') : 'สำนักงานใหญ่';
        setHint($('branchHint'), isBranch && !no ? 'กรอกเลขที่สาขา (เช่น 00001)' : '');
    }
    branchKind.addEventListener('change', () => { syncBranch(); saveDraft(); });
    branchNo.addEventListener('input', () => {
        branchNo.value = digitsOnly(branchNo.value).slice(0, 5);
        clearInvalid(branchNo);
        syncBranch();
        saveDraft();
    });
    branchNo.addEventListener('blur', () => {
        if (branchNo.value) branchNo.value = branchNo.value.padStart(5, '0');
        syncBranch();
    });

    // ---------- เบอร์โทร ----------
    phoneInput.addEventListener('input', () => {
        phoneInput.value = formatPhone(phoneInput.value);
        clearInvalid(phoneInput);
        const d = digitsOnly(phoneInput.value);
        if (!d.length) setHint($('phoneHint'), '');
        else if (isValidPhone(d)) setHint($('phoneHint'), '✓ รูปแบบเบอร์ถูกต้อง', 'ok');
        else setHint($('phoneHint'), 'เบอร์ไทย 9–10 หลัก ขึ้นต้นด้วย 0');
        saveDraft();
    });

    // ---------- ที่อยู่ ----------
    function updateAddressHint() {
        const len = addressInput.value.trim().length;
        $('addressCounter').textContent = `${addressInput.value.length}/300`;
        setHint($('addressHint'), len && len < 10 ? ` · พิมพ์เพิ่มอีก ${10 - len} ตัวอักษร` : '');
    }
    addressInput.addEventListener('input', () => { clearInvalid(addressInput); updateAddressHint(); saveDraft(); });

    // ---------- เติมจากข้อมูลร้าน ----------
    let prefill = {};
    try { prefill = JSON.parse($('taxPrefillJson').textContent) || {}; } catch (_) { /* ไม่มีข้อมูลก็ไม่เติม */ }

    function fillFields(values) {
        if (values.type) typeInput.value = values.type;
        applyType();
        if (values.taxId != null) taxIdInput.value = formatTaxId(values.taxId);
        if (values.name != null) nameInput.value = values.name;
        if (values.phone != null) phoneInput.value = formatPhone(values.phone);
        if (values.address != null) addressInput.value = values.address;
        if (values.branchKind) branchKind.value = values.branchKind;
        if (values.branchNo != null) branchNo.value = values.branchNo;
        syncBranch();
        updateTaxIdHint();
        updateNameHint();
        updateAddressHint();
        phoneInput.dispatchEvent(new Event('input'));
    }

    $('btnPrefill').addEventListener('click', () => {
        const person = typeInput.value === 'INDIVIDUAL';
        const picked = person ? (prefill.individual || {}) : (prefill.company || {});
        const values = {};
        if (picked.name) values.name = picked.name;
        if (picked.taxId) values.taxId = picked.taxId;
        if (prefill.phone) values.phone = prefill.phone;
        if (prefill.address) values.address = prefill.address;
        if (!Object.keys(values).length) {
            setFormError('ยังไม่มีข้อมูลร้านให้เติม กรุณากรอกเอง');
            return;
        }
        fillFields(values);
        setFormError('');
        saveDraft();
    });

    // ---------- ฉบับร่างอัตโนมัติ (เก็บในเครื่องนี้เท่านั้น ล้างเมื่อส่งสำเร็จ) ----------
    const DRAFT_KEY = 'taxInvoiceDraft.v1';
    function readDraft() {
        try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (_) { return null; }
    }
    function clearDraftStore() {
        try { localStorage.removeItem(DRAFT_KEY); } catch (_) { /* ignore */ }
    }
    function saveDraft() {
        if (mode !== 'new') return;
        const draft = {
            type: typeInput.value,
            taxId: taxIdInput.value,
            name: nameInput.value,
            branchKind: branchKind.value,
            branchNo: branchNo.value,
            phone: phoneInput.value,
            address: addressInput.value
        };
        const hasContent = draft.taxId || draft.name || draft.phone || draft.address || draft.branchNo;
        try {
            if (hasContent) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
            else localStorage.removeItem(DRAFT_KEY);
        } catch (_) { /* ไม่มี storage ก็ใช้ฟอร์มได้ตามปกติ */ }
        $('draftNote').hidden = !hasContent;
    }
    $('btnClearDraft').addEventListener('click', () => {
        clearDraftStore();
        fillFields({ type: 'COMPANY', taxId: '', name: '', phone: '', address: '', branchKind: 'HQ', branchNo: '' });
        $('draftNote').hidden = true;
    });

    // ---------- ตรวจก่อนส่ง ----------
    function markInvalid(el, message, hintEl) {
        el.classList.add('is-invalid');
        el.setAttribute('aria-invalid', 'true');
        if (hintEl && message) setHint(hintEl, message, 'error');
    }
    function clearInvalid(el) {
        el.classList.remove('is-invalid');
        el.removeAttribute('aria-invalid');
    }
    function setFormError(message) {
        const box = $('formError');
        box.textContent = message;
        box.hidden = !message;
    }

    form.addEventListener('submit', (event) => {
        const problems = [];
        const flag = (el, message, hintEl) => { markInvalid(el, message, hintEl); problems.push(el); };

        if (!quoteBoxes.some((box) => box.checked)) {
            $('quotationError').hidden = false;
            problems.push(quoteBoxes[0] || $('quotationSummary'));
        }

        if (mode === 'existing') {
            if (!profileSelect.value) {
                $('profileError').hidden = false;
                problems.push(profileSelect);
            }
        } else {
            const taxDigits = digitsOnly(taxIdInput.value);
            if (taxDigits.length !== 13) flag(taxIdInput, `เลขต้องครบ 13 หลัก (ตอนนี้ ${taxDigits.length} หลัก)`, $('taxIdHint'));
            if (!nameInput.value.trim()) flag(nameInput, ' · กรุณากรอกชื่อที่จะขึ้นในใบกำกับภาษี', $('nameHint'));
            if (typeInput.value === 'COMPANY' && branchKind.value === 'BRANCH' && !digitsOnly(branchNo.value)) {
                flag(branchNo, 'กรอกเลขที่สาขา (เช่น 00001)', $('branchHint'));
            }
            if (phoneInput.value.trim() && !isValidPhone(phoneInput.value)) flag(phoneInput, 'เบอร์ไทย 9–10 หลัก ขึ้นต้นด้วย 0', $('phoneHint'));
            if (addressInput.value.trim().length < 10) flag(addressInput, ' · กรุณากรอกที่อยู่ให้ครบ (อย่างน้อย 10 ตัวอักษร)', $('addressHint'));
        }

        if (problems.length) {
            event.preventDefault();
            setFormError('กรุณาแก้ไขรายการที่มีเครื่องหมายสีแดงก่อนส่งคำขอ');
            problems[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (typeof problems[0].focus === 'function') problems[0].focus({ preventScroll: true });
            return;
        }

        setFormError('');
        if (branchNo.value) branchNo.value = branchNo.value.padStart(5, '0');
        syncBranch();
        submitBtn.disabled = true; // กันกดซ้ำ
        submitBtn.textContent = 'กำลังส่งคำขอ…';
    });

    btnUseExisting.addEventListener('click', () => setMode('existing'));
    btnUseNew.addEventListener('click', () => setMode('new'));

    // ---------- เริ่มต้น ----------
    const hasProfiles = profileSelect.options.length > 1;
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'tax_invoice_requested') clearDraftStore();

    syncBranch();
    setMode(hasProfiles ? 'existing' : 'new');

    const draft = readDraft();
    if (draft) {
        fillFields({
            type: draft.type, taxId: draft.taxId, name: draft.name, phone: draft.phone,
            address: draft.address, branchKind: draft.branchKind, branchNo: draft.branchNo
        });
        $('draftNote').hidden = false;
    }
    updateNameHint();
    updateAddressHint();
})();
