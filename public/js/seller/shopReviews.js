// รีวิวร้านคุณ (หน้าร้านค้าของฉัน) — ตอบรีวิว / รายงานรีวิวไม่เหมาะสมให้แอดมินตรวจ
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
