// รีวิวร้านคุณ (หน้าร้านค้าของฉัน) — แท็บยังไม่ตอบ/ตอบแล้ว/ทั้งหมด แสดงทีละ 10, ตอบรีวิว / รายงานรีวิวไม่เหมาะสมให้แอดมินตรวจ
// API: POST /my-shop/reviews/:id/reply, POST /my-shop/reviews/:id/report (routes/reviewRoutes.js)
(function () {
    const section = document.getElementById('shop-reviews');
    if (!section) return;

    async function post(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
        return payload;
    }

    function fail(error) {
        window.showAlertDialog({ title: 'บันทึกไม่สำเร็จ', message: error.message, tone: 'danger' });
    }

    // ---------- แท็บกรอง + ดูเพิ่ม ----------
    const PAGE_SIZE = 10;
    const list = section.querySelector('.sr-list');
    const tabs = [...section.querySelectorAll('[data-review-tab]')];
    const moreBtn = section.querySelector('[data-review-more]');
    const emptyEl = section.querySelector('[data-review-empty]');
    const EMPTY_TEXT = {
        pending: 'ตอบรีวิวครบหมดแล้ว — รีวิวใหม่ที่มีความเห็นจะขึ้นที่นี่',
        replied: 'ยังไม่ได้ตอบรีวิวไหนเลย',
        all: 'ยังไม่มีรีวิว'
    };
    const matchTab = {
        pending: (state) => state === 'pending',
        replied: (state) => state === 'replied',
        all: () => true
    };
    let currentTab = list ? list.dataset.defaultTab : 'all';
    let shown = PAGE_SIZE;

    function renderList() {
        if (!list) return;
        const items = [...list.querySelectorAll('[data-review-id]')];
        const matched = items.filter((item) => matchTab[currentTab](item.dataset.reviewState));
        items.forEach((item) => item.classList.add('d-none'));
        matched.slice(0, shown).forEach((item) => item.classList.remove('d-none'));
        tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.reviewTab === currentTab)));
        const rest = matched.length - shown;
        moreBtn.classList.toggle('d-none', rest <= 0);
        moreBtn.textContent = `ดูเพิ่มอีก ${Math.min(rest, PAGE_SIZE)} รีวิว (เหลือ ${rest})`;
        emptyEl.classList.toggle('d-none', matched.length > 0);
        emptyEl.textContent = EMPTY_TEXT[currentTab];
    }

    // นับใหม่หลังตอบรีวิว — รายการที่เพิ่งตอบยังอยู่ที่เดิมจนกว่าจะสลับแท็บ (ไม่ให้หายไปต่อหน้า)
    function refreshCounts() {
        const items = [...list.querySelectorAll('[data-review-id]')];
        const count = (state) => items.filter((item) => item.dataset.reviewState === state).length;
        section.querySelector('[data-tab-count="pending"]').textContent = count('pending');
        section.querySelector('[data-tab-count="replied"]').textContent = count('replied');
        const tile = section.querySelector('[data-unanswered-count]');
        if (tile) tile.textContent = count('pending');
    }

    tabs.forEach((tab) => tab.addEventListener('click', () => {
        currentTab = tab.dataset.reviewTab;
        shown = PAGE_SIZE;
        renderList();
    }));
    if (moreBtn) moreBtn.addEventListener('click', () => {
        shown += PAGE_SIZE;
        renderList();
    });
    renderList();

    section.querySelectorAll('[data-review-id]').forEach((item) => {
        const id = item.dataset.reviewId;
        const form = item.querySelector('[data-reply-form]');
        const actions = item.querySelector('[data-review-actions]');
        if (!form || !actions) return;
        const textarea = form.querySelector('textarea');
        const openBtn = item.querySelector('[data-reply-open]');
        const view = item.querySelector('[data-reply-view]');

        const toggleForm = (open) => {
            form.classList.toggle('d-none', !open);
            actions.classList.toggle('d-none', open);
            if (open) textarea.focus();
        };
        openBtn.addEventListener('click', () => toggleForm(true));
        item.querySelector('[data-reply-cancel]').addEventListener('click', () => {
            textarea.value = view.querySelector('[data-reply-text]').textContent;
            toggleForm(false);
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submit = form.querySelector('[type="submit"]');
            submit.disabled = true;
            try {
                const payload = await post(`/my-shop/reviews/${id}/reply`, { text: textarea.value });
                view.querySelector('[data-reply-text]').textContent = payload.reply ? payload.reply.text : '';
                view.classList.toggle('d-none', !payload.reply);
                openBtn.innerHTML = `<i class="fa-solid fa-reply"></i> ${payload.reply ? 'แก้คำตอบ' : 'ตอบรีวิว'}`;
                item.dataset.reviewState = payload.reply ? 'replied' : (item.dataset.hasComment ? 'pending' : 'rating');
                refreshCounts();
                toggleForm(false);
            } catch (error) {
                fail(error);
            } finally {
                submit.disabled = false;
            }
        });

        const reportBtn = item.querySelector('[data-report]');
        if (reportBtn) {
            reportBtn.addEventListener('click', () => window.showConfirmDialog({
                title: 'รายงานรีวิวไม่เหมาะสม',
                message: 'แอดมินจะตรวจและซ่อนรีวิวถ้าผิดกติกา (เช่น คำหยาบ สแปม ข้อมูลเท็จ ไม่เกี่ยวกับร้าน) — คะแนนต่ำอย่างเดียวไม่ใช่เหตุผลในการซ่อน',
                tone: 'warning',
                confirmText: 'ส่งรายงาน',
                inputPlaceholder: 'เหตุผลที่รายงาน',
                onConfirm: async (reason) => {
                    try {
                        const payload = await post(`/my-shop/reviews/${id}/report`, { reason });
                        reportBtn.remove();
                        const head = item.querySelector('.sr-head');
                        if (!head.querySelector('.sr-badge')) {
                            head.querySelector('small').insertAdjacentHTML('beforebegin', '<span class="sr-badge">รายงานแล้ว รอแอดมินตรวจ</span>');
                        }
                        window.showAlertDialog({ title: 'ส่งรายงานแล้ว', message: payload.message, tone: 'success' });
                    } catch (error) {
                        fail(error);
                    }
                }
            }));
        }
    });
})();
