const imageUpload = document.getElementById('imageUpload');
const imagePreview = document.getElementById('imagePreview');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const submitBtn = document.getElementById('submitBtn');
const shopApplicationForm = document.getElementById('shopApplicationForm');

// แจ้งส่วนอื่นของหน้า (พรีวิวการ์ด / บันทึกร่าง) ว่ามีอะไรเปลี่ยนที่ไม่ได้ยิง input/change เอง
function notifyForm(eventName) {
    if (shopApplicationForm) shopApplicationForm.dispatchEvent(new CustomEvent(eventName));
}

// --- ย่อรูปก่อนอัปโหลด: รูปจากมือถือ 5–10MB ย่อเหลือด้านยาว 1600px เป็น JPEG ---
// รูปเล็กอยู่แล้ว/ย่อแล้วไม่เล็กลง/เบราว์เซอร์เปิดไฟล์ไม่ได้ (เช่น HEIC บน Chrome) ใช้ไฟล์เดิม
// (เบราว์เซอร์ปัจจุบันหมุนรูปตาม EXIF ให้เองตอนวาดลง canvas)
const COMPRESS_MAX_SIDE = 1600;
const COMPRESS_QUALITY = 0.82;
const COMPRESS_MIN_BYTES = 400 * 1024;
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // ตรงกับ limits.fileSize ของ uploadShopApplication ใน routes/sellerRoute.js

function compressImage(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < COMPRESS_MIN_BYTES) {
        return Promise.resolve(file);
    }
    return new Promise(function (resolve) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function () {
            URL.revokeObjectURL(url);
            const scale = Math.min(1, COMPRESS_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.naturalWidth * scale);
            canvas.height = Math.round(img.naturalHeight * scale);
            const ctx = canvas.getContext('2d');
            // PNG โปร่งใสแปลงเป็น JPEG แล้วพื้นจะดำ — ปูพื้นขาวก่อน
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(function (blob) {
                if (!blob || blob.size >= file.size) return resolve(file);
                const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
                resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
            }, 'image/jpeg', COMPRESS_QUALITY);
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            resolve(file);
        };
        img.src = url;
    });
}

// ไฟล์ที่ยังใหญ่เกิน 5MB หลังย่อ server จะตีกลับทั้งฟอร์ม — ตัดออกและบอกตรงช่องนั้นเลย
function showUploadError(input, message) {
    const group = input.closest('.form-group');
    if (!group) return;
    let note = group.querySelector('.upload-error');
    if (!note) {
        note = document.createElement('p');
        note.className = 'field-hint field-hint--warn upload-error';
        group.appendChild(note);
    }
    note.textContent = message || '';
    note.hidden = !message;
}

function splitOversized(files) {
    const ok = files.filter((file) => file.size <= UPLOAD_MAX_BYTES);
    return { ok, rejected: files.length - ok.length };
}

if (imageUpload && imagePreview) {
    imageUpload.addEventListener('change', async function () {
        const original = imageUpload.files[0];
        if (!original) {
            imagePreview.src = '';
            imagePreview.hidden = true;
            if (uploadPlaceholder) uploadPlaceholder.hidden = false;
            notifyForm('images:change');
            return;
        }
        const file = await compressImage(original);
        const { ok, rejected } = splitOversized([file]);
        const dt = new DataTransfer();
        ok.forEach((f) => dt.items.add(f));
        imageUpload.files = dt.files;
        showUploadError(imageUpload, rejected ? 'รูปใหญ่เกิน 5MB ย่อแล้วยังไม่พอ กรุณาเลือกรูปอื่น' : '');
        if (ok.length) {
            imagePreview.src = URL.createObjectURL(ok[0]);
            imagePreview.onload = () => URL.revokeObjectURL(imagePreview.src);
            imagePreview.hidden = false;
            if (uploadPlaceholder) uploadPlaceholder.hidden = true;
        } else {
            imagePreview.hidden = true;
            if (uploadPlaceholder) uploadPlaceholder.hidden = false;
        }
        notifyForm('images:change');
    });
}

// --- กฎระเบียบร้านค้า: ต้องกดยอมรับก่อนถึงจะส่งใบสมัครได้ ---
const rulesOverlay = document.getElementById('rulesOverlay');
const rulesConsentCheckbox = document.getElementById('rulesConsentCheckbox');
const rulesAcceptBtn = document.getElementById('rulesAcceptBtn');
const termsAcceptedInput = document.getElementById('termsAcceptedInput');
const reopenRulesBtn = document.getElementById('reopenRulesBtn');

if (rulesConsentCheckbox && rulesAcceptBtn) {
    rulesConsentCheckbox.addEventListener('change', function () {
        rulesAcceptBtn.disabled = !rulesConsentCheckbox.checked;
    });
}

if (rulesAcceptBtn && rulesOverlay && termsAcceptedInput) {
    rulesAcceptBtn.addEventListener('click', function () {
        termsAcceptedInput.value = 'true';
        rulesOverlay.hidden = true;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'ส่งใบสมัคร';
        }
    });
}

if (reopenRulesBtn && rulesOverlay) {
    reopenRulesBtn.addEventListener('click', function () {
        rulesOverlay.hidden = false;
    });
}

// --- ประเภทสินค้าเฉพาะ: โชว์เฉพาะกลุ่ม checkbox ที่ตรงกับ "ประเภทสินค้า" ที่เลือกไว้ด้านบน ---
// (ช่วยจัดระยะห่างล็อกตอนแอดมินจัดล็อก ดู utils/productSubtypes.js / utils/stallSpacing.js)
// ประเภทสินค้าเป็นการ์ด radio — ค่าที่ส่งยังเป็น name="productType" เหมือนตอนเป็น <select>
const productTypeRadios = document.querySelectorAll('input[type="radio"][name="productType"]');
const subtypePanels = document.querySelectorAll('.subtype-panel');
const subtypeHint = document.getElementById('productSubtypeHint');

function syncProductSubtypePanel() {
    const checkedType = document.querySelector('input[type="radio"][name="productType"]:checked');
    const selectedType = checkedType ? checkedType.value : '';
    let matched = false;
    subtypePanels.forEach(function (panel) {
        const show = panel.dataset.productType === selectedType;
        panel.hidden = !show;
        if (show) matched = true;
        if (!show) {
            // ซ่อนกลุ่มไหนก็เลิกติ๊กของกลุ่มนั้น กันส่ง subtype ที่ไม่ตรงกับ productType ที่เลือกจริง
            panel.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
        }
    });
    if (subtypeHint) {
        subtypeHint.hidden = matched;
    }
    syncSubtypeCounts();
}

function checkedSubtypes() {
    return Array.from(document.querySelectorAll('input[type="checkbox"][name="productSubtype"]:checked')).map((cb) => cb.value);
}

// นับจำนวนที่ติ๊กไว้ ทั้งรวม (badge บน label) และต่อกลุ่ม (badge บน summary แต่ละกลุ่ม)
// อัปเดตทุกครั้งที่ติ๊ก/เลิกติ๊ก ให้เห็นสดๆ ว่าเลือกไปกี่รายการแล้ว + ป้าย "เลือกแล้ว" + คำแนะนำเมนูเด่น
const subtypeCountBadge = document.getElementById('subtypeCount');
function syncSubtypeCounts() {
    let total = 0;
    document.querySelectorAll('.subtype-group').forEach(function (group) {
        const checked = group.querySelectorAll('input[type="checkbox"][name="productSubtype"]:checked').length;
        const countBadge = group.querySelector('.subtype-group__count');
        if (countBadge) {
            countBadge.textContent = checked;
            countBadge.hidden = checked === 0;
        }
        total += checked;
    });
    if (subtypeCountBadge) {
        subtypeCountBadge.textContent = total;
        subtypeCountBadge.hidden = total === 0;
    }
    notifyForm('subtypes:change');
}

if (productTypeRadios.length && subtypePanels.length) {
    productTypeRadios.forEach(function (radio) {
        radio.addEventListener('change', syncProductSubtypePanel);
    });
    syncProductSubtypePanel();
}

document.querySelectorAll('input[type="checkbox"][name="productSubtype"]').forEach(function (cb) {
    cb.addEventListener('change', syncSubtypeCounts);
});
syncSubtypeCounts();

// --- "อื่นๆ (ระบุ)" ติ๊กแล้วค่อยโชว์ช่องพิมพ์ ไม่ติ๊กก็เคลียร์ค่าทิ้ง ---
const subtypeOtherToggle = document.getElementById('subtypeOtherToggle');
const subtypeOtherInput = document.getElementById('subtypeOtherInput');
if (subtypeOtherToggle && subtypeOtherInput) {
    subtypeOtherToggle.addEventListener('change', function () {
        subtypeOtherInput.hidden = !subtypeOtherToggle.checked;
        if (!subtypeOtherToggle.checked) subtypeOtherInput.value = '';
    });
}

// --- ป้าย "เลือกแล้ว": รายการที่ติ๊กกระจายอยู่หลายกลุ่ม รวมขึ้นด้านบนให้เห็นครบ กด × เอาออกได้ ---
(function () {
    const box = document.getElementById('subtypeSelected');
    const chips = document.getElementById('subtypeSelectedChips');
    if (!box || !chips || !shopApplicationForm) return;

    function render() {
        const values = checkedSubtypes();
        chips.innerHTML = '';
        values.forEach(function (value) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'subtype-chip';
            chip.title = 'เอาออก';
            chip.append(document.createTextNode(value));
            const x = document.createElement('span');
            x.setAttribute('aria-hidden', 'true');
            x.textContent = '×';
            chip.appendChild(x);
            chip.addEventListener('click', function () {
                const cb = Array.from(document.querySelectorAll('input[name="productSubtype"]')).find((el) => el.value === value);
                if (cb) {
                    cb.checked = false;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            chips.appendChild(chip);
        });
        box.hidden = values.length === 0;
    }

    shopApplicationForm.addEventListener('subtypes:change', render);
    render();
})();

// --- ค้นหา "ขายอะไรบ้าง": รายการเยอะและซ่อนในกลุ่ม พิมพ์แล้วกรองเฉพาะกลุ่มของประเภทที่เลือก + เปิดกลุ่มที่เจอให้เอง ---
// หาไม่เจอก็กดเอาคำที่พิมพ์ไปใส่ช่อง "อื่นๆ (ระบุเอง)" ได้เลย
(function () {
    const wrap = document.getElementById('subtypeSearchWrap');
    const input = document.getElementById('subtypeSearch');
    const noResult = document.getElementById('subtypeNoResult');
    const noResultText = document.getElementById('subtypeNoResultText');
    const useOtherBtn = document.getElementById('subtypeUseOtherBtn');
    if (!wrap || !input) return;

    // ไม่สนช่องว่างและตัวพิมพ์เล็ก/ใหญ่ ("ชา ไทย" เจอ "ชานม/ชาไทย")
    const normalize = (text) => String(text || '').toLowerCase().replace(/\s+/g, '');

    function activePanel() {
        return Array.from(subtypePanels).find((panel) => !panel.hidden) || null;
    }

    function applySearch() {
        const panel = activePanel();
        const query = normalize(input.value);
        let matchCount = 0;
        if (panel) {
            panel.querySelectorAll('.subtype-group').forEach(function (group) {
                let groupMatches = 0;
                group.querySelectorAll('.subtype-checkbox').forEach(function (label) {
                    const show = !query || normalize(label.textContent).includes(query);
                    label.hidden = !show;
                    if (show) groupMatches++;
                });
                group.hidden = groupMatches === 0;
                if (query) {
                    group.open = groupMatches > 0;
                } else {
                    // ล้างคำค้น = กลับไปเปิดเฉพาะกลุ่มที่ติ๊กไว้
                    group.open = !!group.querySelector('input[name="productSubtype"]:checked');
                }
                matchCount += groupMatches;
            });
        }
        const showNoResult = !!query && matchCount === 0;
        if (noResult) noResult.hidden = !showNoResult;
        if (noResultText) noResultText.textContent = input.value.trim();
    }

    function syncSearchVisibility() {
        wrap.hidden = !activePanel();
        input.value = '';
        applySearch();
    }

    input.addEventListener('input', applySearch);
    // Enter ในช่องค้นหาห้ามส่งฟอร์ม
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') e.preventDefault();
        if (e.key === 'Escape') {
            input.value = '';
            applySearch();
        }
    });
    productTypeRadios.forEach(function (radio) {
        radio.addEventListener('change', syncSearchVisibility);
    });
    syncSearchVisibility();

    if (useOtherBtn && subtypeOtherToggle && subtypeOtherInput) {
        useOtherBtn.addEventListener('click', function () {
            const text = input.value.trim();
            if (!text) return;
            const current = subtypeOtherInput.value.trim();
            subtypeOtherToggle.checked = true;
            subtypeOtherInput.hidden = false;
            subtypeOtherInput.value = current ? `${current}, ${text}` : text;
            const otherGroup = subtypeOtherInput.closest('details');
            if (otherGroup) otherGroup.open = true;
            input.value = '';
            applySearch();
            subtypeOtherInput.focus();
            notifyForm('subtypes:change');
        });
    }
})();

// --- เมนูเด่น/คำค้นหา: พิมพ์แล้วกด Enter/, เด้งเป็นป้าย (แบบเดียวกับ shopProfile.js) เก็บค่าจริงคั่นจุลภาคใน hidden input ---
// คืน api ให้ส่วนอื่นใช้ (แนะนำเมนูจากที่ติ๊ก / กู้ร่าง / พรีวิวการ์ด)
const SHOP_TAGS_MAX_LENGTH = 300; // ตรงกับ shopTags ใน sellerApplicationSchema
const shopTagsApi = (function () {
    const box = document.getElementById('shopTagsBox');
    const field = document.getElementById('shopTagsField');
    const hidden = document.getElementById('shopTagsHidden');
    if (!box || !field || !hidden) return null;

    let tags = [];

    function parseHidden() {
        tags = String(hidden.value || '').split(',').map((t) => t.trim()).filter(Boolean);
    }

    function syncHidden() {
        hidden.value = tags.join(',');
        notifyForm('tags:change');
    }

    function renderTags() {
        box.querySelectorAll('.tag-chip').forEach((chip) => chip.remove());
        tags.forEach((tag, index) => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            const label = document.createElement('span');
            label.textContent = tag;
            chip.appendChild(label);
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'tag-chip-remove';
            removeBtn.title = 'ลบป้ายนี้';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', function () {
                tags.splice(index, 1);
                syncHidden();
                renderTags();
            });
            chip.appendChild(removeBtn);
            box.insertBefore(chip, field);
        });
    }

    // เกิน 300 ตัวอักษร server จะตีกลับทั้งฟอร์ม — ไม่รับป้ายเพิ่ม แล้วกระพริบกรอบให้รู้
    function add(value) {
        const tag = String(value || '').replace(/,/g, '').trim();
        if (!tag || tags.includes(tag)) return false;
        if ([...tags, tag].join(',').length > SHOP_TAGS_MAX_LENGTH) {
            box.classList.add('tag-input-box--full');
            setTimeout(() => box.classList.remove('tag-input-box--full'), 900);
            return false;
        }
        tags.push(tag);
        syncHidden();
        renderTags();
        return true;
    }

    function addTagFromField() {
        if (!field.value.trim()) return;
        add(field.value);
        field.value = '';
    }

    field.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTagFromField();
        } else if (e.key === 'Backspace' && !field.value && tags.length) {
            tags.pop();
            syncHidden();
            renderTags();
        }
    });
    field.addEventListener('blur', addTagFromField);
    box.addEventListener('click', function (e) {
        if (e.target === box) field.focus();
    });

    parseHidden();
    renderTags();

    return {
        add,
        getTags: () => tags.slice(),
        // hidden ถูกตั้งค่าใหม่จากนอก widget (กู้ร่าง) — อ่านใหม่แล้ววาดใหม่
        reload() {
            parseHidden();
            renderTags();
            notifyForm('tags:change');
        }
    };
})();

// --- แนะนำเมนูเด่นจากรายการที่ติ๊กไว้: แตะทีเดียวเพิ่มเป็นป้าย ไม่ต้องพิมพ์ซ้ำ ---
(function () {
    const box = document.getElementById('tagSuggest');
    const chips = document.getElementById('tagSuggestChips');
    if (!box || !chips || !shopTagsApi || !shopApplicationForm) return;

    function render() {
        const existing = shopTagsApi.getTags();
        const suggestions = checkedSubtypes().filter((value) => !existing.includes(value)).slice(0, 8);
        chips.innerHTML = '';
        suggestions.forEach(function (value) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'tag-suggest__chip';
            chip.textContent = `+ ${value}`;
            chip.addEventListener('click', function () {
                shopTagsApi.add(value);
            });
            chips.appendChild(chip);
        });
        box.hidden = suggestions.length === 0;
    }

    shopApplicationForm.addEventListener('subtypes:change', render);
    shopApplicationForm.addEventListener('tags:change', render);
    render();
})();

// --- แกลเลอรีรูปสินค้า/รูปเมนู: เลือกได้หลายรูป ลบทีละรูปก่อนส่ง (แบบเดียวกับ bindGalleryUpload ใน shopProfile.js
// แต่ไม่มีรูปเดิม เพราะใบสมัครเป็นของใหม่ทุกครั้ง) — เก็บไฟล์จริง (ย่อแล้ว) ไว้ใน input ผ่าน DataTransfer ---
function bindApplicationGallery(inputId, labelId) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;

    const maxImages = Number(input.dataset.max) || 4;
    let selectedFiles = [];

    function syncInput() {
        const dt = new DataTransfer();
        selectedFiles.forEach((file) => dt.items.add(file));
        input.files = dt.files;
        notifyForm('images:change');
    }

    function renderPreviews() {
        label.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'upload-thumb-item';
            const img = document.createElement('img');
            img.alt = `รูปที่ ${index + 1}`;
            img.src = URL.createObjectURL(file);
            img.onload = () => URL.revokeObjectURL(img.src);
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'upload-thumb-remove';
            removeBtn.title = 'ลบรูปนี้';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                selectedFiles.splice(index, 1);
                syncInput();
                renderPreviews();
            });
            item.append(img, removeBtn);
            label.appendChild(item);
        });
        if (selectedFiles.length < maxImages) {
            const addBox = document.createElement('div');
            addBox.className = 'upload-add-icon';
            addBox.innerHTML = '<i class="fa-solid fa-camera"></i><span>เพิ่มรูป</span>';
            label.appendChild(addBox);
        }
    }

    input.addEventListener('change', async function (e) {
        const incoming = Array.from(e.target.files || []);
        // input.files ถูกแทนด้วยไฟล์ที่เพิ่งเลือก — คืนไฟล์เดิมไว้ก่อนระหว่างรอย่อรูป
        syncInput();
        label.classList.add('is-busy');
        const compressed = await Promise.all(incoming.map(compressImage));
        label.classList.remove('is-busy');
        const { ok, rejected } = splitOversized(compressed);
        showUploadError(input, rejected ? `ข้าม ${rejected} รูปที่ใหญ่เกิน 5MB` : '');
        selectedFiles = selectedFiles.concat(ok).slice(0, maxImages);
        syncInput();
        renderPreviews();
    });

    renderPreviews();
}

bindApplicationGallery('productImagesUpload', 'productImagesUploadLabel');
bindApplicationGallery('menuImagesUpload', 'menuImagesUploadLabel');

// --- ตัวช่วยกรอก: ช่องตัวเลขล้วน / นับตัวอักษร / ใช้ชื่อผู้ขายเป็นชื่อบัญชี ---
// เบอร์โทร/เลขบัญชีตัดขีด ช่องว่าง ตัวอักษรออกเอง (คนชอบก๊อปเลขบัญชีมาแบบ 123-4-56789-0)
document.querySelectorAll('[data-digits-only]').forEach(function (input) {
    input.addEventListener('input', function () {
        const digits = input.value.replace(/\D/g, '');
        if (digits !== input.value) input.value = digits;
    });
});

document.querySelectorAll('textarea[data-counter]').forEach(function (textarea) {
    const group = textarea.closest('.form-group');
    const counter = group && group.querySelector('.char-count');
    if (!counter) return;
    const max = Number(textarea.getAttribute('maxlength')) || 0;
    function syncCounter() {
        const length = textarea.value.length;
        counter.textContent = max ? `${length}/${max}` : String(length);
        counter.classList.toggle('char-count--near', max > 0 && length >= max * 0.9);
    }
    textarea.addEventListener('input', syncCounter);
    syncCounter();
});

(function () {
    const btn = document.getElementById('useSellerNameBtn');
    const sellerName = document.getElementById('sellerNameInput');
    const accountName = document.getElementById('bankAccountNameInput');
    if (!btn || !sellerName || !accountName) return;
    if (!sellerName.value.trim()) btn.hidden = true;
    btn.addEventListener('click', function () {
        accountName.value = sellerName.value.trim();
        accountName.dispatchEvent(new Event('input', { bubbles: true }));
        accountName.focus();
    });
})();

// --- ชื่อร้านซ้ำ: หยุดพิมพ์ครึ่งวินาทีแล้วถาม server (แค่เตือน ส่งได้ตามปกติ) ---
(function () {
    const input = document.getElementById('shopNameInput');
    const hint = document.getElementById('shopNameTakenHint');
    if (!input || !hint) return;
    let timer = null;
    let requestSeq = 0;

    function check() {
        const name = input.value.trim();
        const seq = ++requestSeq;
        if (!name) {
            hint.hidden = true;
            return;
        }
        fetch(`/shop-application/check-name?name=${encodeURIComponent(name)}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { taken: false }))
            .then((data) => {
                if (seq === requestSeq) hint.hidden = !data.taken;
            })
            .catch(() => {});
    }

    input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(check, 500);
    });
    if (input.value.trim()) check();
})();

// --- พรีวิวการ์ดร้านบนผังตลาด: อัปเดตสดจากชื่อร้าน ประเภท แนะนำร้าน เมนูเด่น และรูปแรก ---
(function () {
    const form = shopApplicationForm;
    const thumb = document.getElementById('previewThumb');
    const nameEl = document.getElementById('previewName');
    const typeEl = document.getElementById('previewType');
    const summaryEl = document.getElementById('previewSummary');
    const tagsEl = document.getElementById('previewTags');
    if (!form || !thumb || !nameEl) return;

    const shopName = document.getElementById('shopNameInput');
    const summary = document.getElementById('shopSummaryInput');
    const detail = document.getElementById('productDetailInput');
    const productImages = document.getElementById('productImagesUpload');
    const reuseBox = document.getElementById('reuseImagesBox');
    const reuseToggle = document.getElementById('reuseImagesToggle');
    let objectUrl = null;
    let thumbKey = null;

    // ลำดับเดียวกับฝั่ง server: รูปสินค้ารูปแรก → รูปปก → รูปเดิมจากใบสมัครก่อน
    function pickThumb() {
        const file = (productImages && productImages.files[0]) || (imageUpload && imageUpload.files[0]);
        if (file) return { key: `${file.name}:${file.size}:${file.lastModified}`, file };
        if (reuseBox && reuseToggle && reuseToggle.checked) {
            const url = reuseBox.dataset.firstProduct || reuseBox.dataset.cover;
            if (url) return { key: url, url };
        }
        return null;
    }

    function renderThumb() {
        const picked = pickThumb();
        const key = picked ? picked.key : null;
        if (key === thumbKey) return;
        thumbKey = key;
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
        }
        thumb.innerHTML = '';
        if (!picked) {
            thumb.innerHTML = '<i class="fa-solid fa-store"></i>';
            return;
        }
        const img = document.createElement('img');
        img.alt = '';
        if (picked.file) {
            objectUrl = URL.createObjectURL(picked.file);
            img.src = objectUrl;
        } else {
            img.src = picked.url;
        }
        thumb.appendChild(img);
    }

    function render() {
        const name = shopName ? shopName.value.trim() : '';
        nameEl.textContent = name || 'ชื่อร้านของคุณ';
        nameEl.classList.toggle('is-placeholder', !name);

        const checkedType = form.querySelector('input[name="productType"]:checked');
        const typeLabel = checkedType ? checkedType.closest('.type-card').querySelector('.type-card__label').textContent : '';
        typeEl.textContent = typeLabel || 'ประเภทสินค้า';
        typeEl.classList.toggle('is-placeholder', !typeLabel);

        // ไม่มีแนะนำร้าน ผังตลาดจะไม่มีบรรทัดนี้ — ใช้รายละเอียดสินค้าแสดงแทนแบบจาง ๆ ให้เห็นว่าควรเติม
        const summaryText = summary ? summary.value.trim() : '';
        const detailText = detail ? detail.value.trim() : '';
        summaryEl.textContent = summaryText || (detailText ? detailText.slice(0, 80) : 'แนะนำร้านสั้น ๆ จะขึ้นตรงนี้');
        summaryEl.classList.toggle('is-placeholder', !summaryText);

        tagsEl.innerHTML = '';
        const tags = shopTagsApi ? shopTagsApi.getTags() : [];
        tags.slice(0, 4).forEach(function (tag) {
            const chip = document.createElement('span');
            chip.textContent = tag;
            tagsEl.appendChild(chip);
        });
        if (tags.length > 4) {
            const more = document.createElement('span');
            more.textContent = `+${tags.length - 4}`;
            tagsEl.appendChild(more);
        }

        renderThumb();
    }

    ['input', 'change', 'tags:change', 'images:change'].forEach((type) => form.addEventListener(type, render));
    render();
})();

// --- ความคืบหน้า: นับช่องบังคับที่กรอกถูกแล้ว (แถบล่างจอ) + ติ๊กถูกที่หัวแต่ละขั้น ---
// ส่งฟอร์มไม่ผ่านก็เลื่อนไปช่องแรกที่ยังขาดให้อยู่กลางจอ แทนการให้เบราว์เซอร์เด้งไปซ่อนใต้ navbar
(function () {
    const form = shopApplicationForm;
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    if (!form || !fill || !text) return;

    // radio หลายตัวชื่อเดียวกันนับเป็น 1 ช่อง / ชื่อผู้ขาย readonly กรอกมาให้แล้วไม่นับ
    function requiredFieldsIn(root) {
        const seen = new Set();
        return Array.from(root.querySelectorAll('[required]')).filter(function (el) {
            if (el.readOnly || seen.has(el.name)) return false;
            seen.add(el.name);
            return true;
        });
    }

    function isFilled(el) {
        if (el.type === 'radio') return !!form.querySelector(`input[name="${el.name}"]:checked`);
        return el.value.trim() !== '' && el.checkValidity();
    }

    function syncProgress() {
        const fields = requiredFieldsIn(form);
        const done = fields.filter(isFilled).length;
        const complete = done === fields.length;
        fill.style.width = fields.length ? `${(done / fields.length) * 100}%` : '0%';
        text.textContent = complete ? 'กรอกช่องบังคับครบแล้ว' : `กรอกช่องบังคับแล้ว ${done}/${fields.length}`;
        text.classList.toggle('is-complete', complete);

        form.querySelectorAll('.form-section[data-step]').forEach(function (section) {
            const sectionFields = requiredFieldsIn(section);
            const sectionDone = sectionFields.length > 0 && sectionFields.every(isFilled);
            section.classList.toggle('is-complete', sectionDone);
            const badge = section.querySelector('.form-section-done');
            if (badge) badge.hidden = !sectionDone;
        });
    }

    form.addEventListener('input', syncProgress);
    form.addEventListener('change', syncProgress);
    form.addEventListener('draft:restored', syncProgress);
    syncProgress();

    // กรอบแดงขึ้นหลังแตะช่องแล้วออก หรือกดส่ง — ไม่แดงทั้งฟอร์มตั้งแต่เปิดหน้า
    form.addEventListener('focusout', function (e) {
        if (e.target.matches('input, select, textarea')) e.target.classList.add('was-touched');
    });

    let scrolledToInvalid = false;
    form.addEventListener('invalid', function (e) {
        e.target.classList.add('was-touched');
        if (scrolledToInvalid) return;
        scrolledToInvalid = true;
        const group = e.target.closest('.form-group') || e.target;
        group.scrollIntoView({ behavior: 'smooth', block: 'center' });
        group.classList.add('form-group--shake');
        setTimeout(function () {
            group.classList.remove('form-group--shake');
            scrolledToInvalid = false;
        }, 600);
    }, true);
})();

// --- บันทึกร่างอัตโนมัติในเครื่อง: หน้ารีเฟรช/ปิดแท็บระหว่างไปเปิดแอปธนาคาร ข้อมูลไม่หาย ---
// เก็บเฉพาะข้อความ/ตัวเลือก ไม่เก็บรูป (เก็บใน localStorage ไม่ได้) และไม่เก็บ token/การยอมรับกฎ
// ส่งใบสมัครแล้วลบร่างทิ้ง / ส่งไม่ผ่าน server เติมค่าที่ส่งมาให้อยู่แล้ว ไม่ต้องถามกู้ร่าง
const shopApplicationDraft = (function () {
    const form = shopApplicationForm;
    if (!form || !form.dataset.draftKey) return null;
    const key = form.dataset.draftKey;
    const banner = document.getElementById('draftBanner');
    const bannerTime = document.getElementById('draftBannerTime');
    const SKIP_NAMES = new Set(['tabToken', 'termsAccepted', 'sellerName']);
    let timer = null;

    function storage() {
        try {
            return window.localStorage;
        } catch (error) {
            return null;
        }
    }

    function collect() {
        const data = { productSubtype: [] };
        Array.from(form.elements).forEach(function (el) {
            if (!el.name || SKIP_NAMES.has(el.name) || el.type === 'file') return;
            if (el.type === 'hidden' && el.name !== 'shopTags') return;
            if (el.name === 'productSubtype') {
                if (el.checked) data.productSubtype.push(el.value);
            } else if (el.type === 'radio') {
                if (el.checked) data[el.name] = el.value;
            } else if (el.type === 'checkbox') {
                data[el.name] = el.checked;
            } else {
                data[el.name] = el.value;
            }
        });
        data.subtypeOtherToggle = !!(subtypeOtherToggle && subtypeOtherToggle.checked);
        return data;
    }

    // มีอะไรที่ผู้ใช้กรอกเองจริงไหม (เบอร์โทรเติมจากบัญชีให้อยู่แล้ว ไม่นับ)
    function hasContent(data) {
        return ['shopName', 'productDetail', 'shopSummary', 'shopTags', 'bankAccountNumber', 'bankAccountName', 'productSubtypeOther']
            .some((name) => String(data[name] || '').trim()) || data.productSubtype.length > 0;
    }

    // ส่งใบสมัครแล้วหยุดบันทึก — ไม่งั้น pagehide ตอนเปลี่ยนหน้าจะเขียนร่างกลับมาใหม่
    let stopped = false;

    function save() {
        const store = storage();
        if (!store || stopped) return;
        const data = collect();
        try {
            if (hasContent(data)) store.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
        } catch (error) {
            // เต็ม/ถูกบล็อก — ข้ามไป ฟอร์มยังใช้ได้ปกติ
        }
    }

    function scheduleSave() {
        clearTimeout(timer);
        timer = setTimeout(save, 600);
    }

    function clear({ stop = false } = {}) {
        if (stop) {
            stopped = true;
            clearTimeout(timer);
        }
        const store = storage();
        try {
            if (store) store.removeItem(key);
        } catch (error) {
            // ไม่เป็นไร
        }
    }

    function read() {
        const store = storage();
        try {
            const raw = store && store.getItem(key);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && parsed.data ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function restore(data) {
        // ประเภทสินค้าก่อน — เปลี่ยนแผงรายการ (และล้างติ๊กของแผงอื่น) แล้วค่อยติ๊กรายการ
        if (data.productType) {
            const radio = Array.from(productTypeRadios).find((el) => el.value === data.productType);
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        Array.from(form.elements).forEach(function (el) {
            if (!el.name || SKIP_NAMES.has(el.name) || el.type === 'file' || el.type === 'radio') return;
            if (el.name === 'productSubtype') {
                el.checked = (data.productSubtype || []).includes(el.value);
            } else if (el.type === 'checkbox') {
                if (el.name in data) el.checked = !!data[el.name];
            } else if (el.type === 'hidden') {
                if (el.name === 'shopTags') el.value = data.shopTags || '';
            } else if (el.name in data) {
                el.value = data[el.name];
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        if (subtypeOtherToggle) {
            subtypeOtherToggle.checked = !!data.subtypeOtherToggle || !!String(data.productSubtypeOther || '').trim();
            if (subtypeOtherInput) subtypeOtherInput.hidden = !subtypeOtherToggle.checked;
        }
        document.querySelectorAll('.subtype-group').forEach(function (group) {
            if (group.querySelector('input[name="productSubtype"]:checked')) group.open = true;
        });
        syncSubtypeCounts();
        if (shopTagsApi) shopTagsApi.reload();
        form.dispatchEvent(new Event('change'));
        form.dispatchEvent(new CustomEvent('draft:restored'));
    }

    function formatSavedAt(savedAt) {
        const minutes = Math.round((Date.now() - savedAt) / 60000);
        if (minutes < 1) return 'เมื่อสักครู่';
        if (minutes < 60) return `เมื่อ ${minutes} นาทีที่แล้ว`;
        return new Date(savedAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    const draft = form.dataset.skipDraft ? null : read();
    if (draft && banner && JSON.stringify(draft.data) !== JSON.stringify(collect())) {
        if (bannerTime) bannerTime.textContent = `(${formatSavedAt(draft.savedAt)})`;
        banner.hidden = false;
        document.getElementById('draftRestoreBtn').addEventListener('click', function () {
            restore(draft.data);
            banner.hidden = true;
        });
        document.getElementById('draftDiscardBtn').addEventListener('click', function () {
            clear();
            banner.hidden = true;
        });
    }

    ['input', 'change', 'tags:change', 'subtypes:change'].forEach((type) => form.addEventListener(type, scheduleSave));
    window.addEventListener('pagehide', save);

    return { clear };
})();

// --- ตรวจทานก่อนส่ง: กดส่ง (ฟอร์มผ่าน validation แล้ว) → สรุปข้อมูลทั้งหมดให้เช็ค → ยืนยันถึงส่งจริง ---
(function () {
    const form = shopApplicationForm;
    const overlay = document.getElementById('reviewOverlay');
    const body = document.getElementById('reviewBody');
    const editBtn = document.getElementById('reviewEditBtn');
    const confirmBtn = document.getElementById('reviewConfirmBtn');
    if (!form || !submitBtn) return;

    let confirmed = false;
    const valueOf = (name) => {
        const el = form.elements[name];
        return el ? String(el.value || '').trim() : '';
    };
    const formatPhone = (digits) => (digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : digits);
    const fileCount = (id) => {
        const input = document.getElementById(id);
        return input && input.files ? input.files.length : 0;
    };

    function buildSummary() {
        const reuseToggle = document.getElementById('reuseImagesToggle');
        const reuse = !!(reuseToggle && reuseToggle.checked);
        const checkedType = form.querySelector('input[name="productType"]:checked');
        const subtypes = checkedSubtypes();
        const other = valueOf('productSubtypeOther');
        if (other) subtypes.push(`อื่นๆ: ${other}`);
        const tags = shopTagsApi ? shopTagsApi.getTags() : [];
        const imageText = (count, label) => (count ? `${label} ${count} รูป` : null);
        const images = [
            imageText(fileCount('productImagesUpload'), 'รูปสินค้า'),
            imageText(fileCount('menuImagesUpload'), 'รูปเมนู'),
            fileCount('imageUpload') ? 'รูปปก 1 รูป' : null
        ].filter(Boolean);
        if (reuse) images.push('ช่องที่ไม่ได้เลือกใหม่ใช้รูปจากใบสมัครครั้งก่อน');

        const sellerName = valueOf('sellerName');
        const accountName = valueOf('bankAccountName');
        const normalizeName = (s) => s.replace(/^(นาย|นางสาว|นาง|น\.ส\.|mr\.?|mrs\.?|ms\.?)\s*/i, '').replace(/\s+/g, '');
        const nameMismatch = sellerName && accountName && normalizeName(sellerName) !== normalizeName(accountName);

        return [
            {
                step: 1, title: 'ข้อมูลร้าน', rows: [
                    ['ชื่อร้าน', valueOf('shopName')],
                    ['ประเภทสินค้า', checkedType ? checkedType.closest('.type-card').querySelector('.type-card__label').textContent : ''],
                    ['ขายอะไรบ้าง', subtypes.join(', ') || '-'],
                    ['รายละเอียดสินค้า', valueOf('productDetail')]
                ]
            },
            {
                step: 2, title: 'ผู้ขายและการติดต่อ', rows: [
                    ['ชื่อผู้ขาย', sellerName],
                    ['เบอร์โทรศัพท์', formatPhone(valueOf('phoneNumber'))]
                ]
            },
            {
                step: 3, title: 'บัญชีธนาคาร', rows: [
                    ['ธนาคาร', valueOf('bankName')],
                    ['เลขบัญชี', valueOf('bankAccountNumber'), 'mono'],
                    ['ชื่อบัญชี', accountName, nameMismatch ? 'warn' : '']
                ],
                warning: nameMismatch ? 'ชื่อบัญชีไม่ตรงกับชื่อผู้ขาย — ถ้าเป็นบัญชีของคนอื่น แอดมินอาจขอเอกสารเพิ่ม' : ''
            },
            {
                step: 4, title: 'ทำให้ร้านน่าสนใจ', rows: [
                    ['แนะนำร้าน', valueOf('shopSummary') || '-'],
                    ['เมนูเด่น', tags.join(', ') || '-'],
                    ['รูป', images.join(' · ') || 'ไม่มีรูป']
                ]
            }
        ];
    }

    function renderSummary() {
        body.innerHTML = '';
        buildSummary().forEach(function (section) {
            const head = document.createElement('div');
            head.className = 'review-section__head';
            const title = document.createElement('h3');
            title.textContent = section.title;
            const fix = document.createElement('button');
            fix.type = 'button';
            fix.className = 'review-section__edit';
            fix.textContent = 'แก้';
            fix.addEventListener('click', function () {
                close();
                const target = form.querySelectorAll('.form-section')[section.step - 1];
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            head.append(title, fix);
            body.appendChild(head);

            const list = document.createElement('dl');
            list.className = 'review-list';
            section.rows.forEach(function ([label, value, tone]) {
                const dt = document.createElement('dt');
                dt.textContent = label;
                const dd = document.createElement('dd');
                dd.textContent = value || '-';
                if (tone) dd.classList.add(`review-value--${tone}`);
                list.append(dt, dd);
            });
            body.appendChild(list);

            if (section.warning) {
                const warn = document.createElement('p');
                warn.className = 'field-hint field-hint--warn';
                warn.textContent = section.warning;
                body.appendChild(warn);
            }
        });
    }

    function open() {
        renderSummary();
        overlay.hidden = false;
        body.scrollTop = 0;
        confirmBtn.focus();
    }

    function close() {
        overlay.hidden = true;
    }

    form.addEventListener('submit', function (e) {
        if (overlay && body && !confirmed) {
            e.preventDefault();
            open();
            return;
        }
        if (shopApplicationDraft) shopApplicationDraft.clear({ stop: true });
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังส่งข้อมูล...';
    });

    if (overlay && editBtn && confirmBtn) {
        editBtn.addEventListener('click', close);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !overlay.hidden) close();
        });
        confirmBtn.addEventListener('click', function () {
            confirmed = true;
            confirmBtn.disabled = true;
            close();
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit(submitBtn);
            } else {
                // เบราว์เซอร์เก่าไม่มี requestSubmit — form.submit() ไม่ยิง submit event ต้องทำงานแทนเอง
                if (shopApplicationDraft) shopApplicationDraft.clear({ stop: true });
                submitBtn.disabled = true;
                submitBtn.textContent = 'กำลังส่งข้อมูล...';
                form.submit();
            }
        });
    }
})();
