/* คำแนะนำตอนพิมพ์ค้นหา (แบบ Google) ใช้ร่วมกันในผังตลาดทุก role (/market-map และ /admin/slots)
   createSearchSuggest({ input, list, kinds, buildEntries, onSearch, onPick })
   - kinds: { [kind]: { label, order, icon, popular } } — popular=true คือใช้เป็น "คำค้นยอดนิยม" ตอนช่องค้นหาว่าง
   - buildEntries(): คืน [{ label, kind, stall, alias? }] จากร้านในผัง (เรียกครั้งแรกตอนเปิดรายการ แล้วเก็บไว้)
   - onSearch(text): ค้นหาด้วยข้อความ
   - onPick(item): ถ้าคืน true แปลว่าจัดการเองแล้ว (เช่น เลือกหมวด) ไม่ต้องค้นด้วยข้อความต่อ
   จัดอันดับ: ตรงทั้งคำ > ขึ้นต้นตรงกัน > คำย่อยขึ้นต้นตรงกัน > มีคำนั้นอยู่ข้างใน แล้วตามประเภทและจำนวนร้าน */
(function () {
    const LIMIT = 8;

    function normalize(text) {
        return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ทำตัวหนาเฉพาะส่วนที่ผู้ใช้ "ยังไม่ได้พิมพ์" แบบ Google ให้เห็นว่าระบบเติมอะไรให้
    function highlight(label, raw) {
        const q = normalize(raw);
        const i = q ? label.toLowerCase().indexOf(q) : -1;
        if (i < 0) return `<b>${escapeHtml(label)}</b>`;
        return `<b>${escapeHtml(label.slice(0, i))}</b>${escapeHtml(label.slice(i, i + q.length))}<b>${escapeHtml(label.slice(i + q.length))}</b>`;
    }

    function rank(item, q) {
        if (item.norm === q) return 0;
        if (item.norm.startsWith(q)) return 1;
        if (item.norm.split(' ').some((w) => w.startsWith(q))) return 2;
        if (item.alias && item.alias.startsWith(q)) return 2;
        if (item.norm.includes(q)) return 3;
        return -1;
    }

    // คำเดียวกันอาจมาได้หลายแหล่ง (เช่น "แฟชั่น" เป็นทั้งหมวดและคำค้นของร้าน) — เก็บไว้อันเดียวตามลำดับที่จัดแล้ว
    function uniqueByText(items) {
        const seen = new Set();
        return items.filter((it) => !seen.has(it.norm) && seen.add(it.norm));
    }

    function createSearchSuggest({ input, list, kinds, buildEntries, onSearch, onPick }) {
        if (!input || !list) return null;
        let index = null;
        let items = [];
        let active = -1;
        const order = (kind) => (kinds[kind] ? kinds[kind].order : 99);

        function buildIndex() {
            const map = new Map();
            buildEntries().forEach(({ label, kind, stall, alias }) => {
                const text = String(label || '').trim();
                if (!text || text === '-' || text.length < 2 || !kinds[kind]) return;
                const key = `${kind}:${normalize(text)}`;
                if (!map.has(key)) map.set(key, { label: text, kind, norm: normalize(text), alias: normalize(alias), stalls: new Set() });
                map.get(key).stalls.add(stall);
            });
            return [...map.values()];
        }

        function find(raw) {
            if (!index) index = buildIndex();
            const q = normalize(raw);
            // ช่องว่างตอนโฟกัส: เสนอคำค้นยอดนิยม (มีร้านใช้มากสุด) ก่อน
            if (!q) {
                return uniqueByText(index
                    .filter((it) => kinds[it.kind].popular)
                    .sort((a, b) => b.stalls.size - a.stalls.size || order(a.kind) - order(b.kind)))
                    .slice(0, LIMIT);
            }
            return uniqueByText(index
                .map((it) => ({ it, r: rank(it, q) }))
                .filter((x) => x.r >= 0 && x.it.norm !== q)
                .sort((a, b) => a.r - b.r
                    || order(a.it.kind) - order(b.it.kind)
                    || b.it.stalls.size - a.it.stalls.size
                    || a.it.label.length - b.it.label.length)
                .map((x) => x.it))
                .slice(0, LIMIT);
        }

        function hide() {
            list.hidden = true;
            active = -1;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
        }

        function setActive(i) {
            active = i;
            list.querySelectorAll('.ss-item').forEach((el, idx) => el.classList.toggle('active', idx === i));
            if (i >= 0) input.setAttribute('aria-activedescendant', `${list.id}-opt-${i}`);
            else input.removeAttribute('aria-activedescendant');
        }

        function pick(i) {
            const it = items[i];
            if (!it) return;
            hide();
            if (onPick && onPick(it) === true) {
                input.blur();
                return;
            }
            input.value = it.label;
            onSearch(it.label);
        }

        function render(raw) {
            items = find(raw);
            active = -1;
            list.innerHTML = '';
            if (!items.length) {
                hide();
                return;
            }
            if (!normalize(raw)) {
                const head = document.createElement('li');
                head.className = 'ss-head';
                head.setAttribute('role', 'presentation');
                head.textContent = 'คำค้นยอดนิยม';
                list.appendChild(head);
            }
            items.forEach((it, i) => {
                const li = document.createElement('li');
                li.className = 'ss-item';
                li.id = `${list.id}-opt-${i}`;
                li.setAttribute('role', 'option');
                const meta = it.kind === 'shop'
                    ? [...it.stalls].slice(0, 2).join(', ') + (it.stalls.size > 2 ? '…' : '')
                    : `${it.stalls.size} ร้าน`;
                li.innerHTML = `<i class="fa-solid ${kinds[it.kind].icon || 'fa-magnifying-glass'} ss-icon"></i>`
                    + `<span class="ss-text">${highlight(it.label, raw)}</span>`
                    + `<span class="ss-kind">${escapeHtml(kinds[it.kind].label)}</span>`
                    + `<span class="ss-meta">${escapeHtml(meta)}</span>`;
                // mousedown แทน click เพื่อให้เลือกได้ก่อนช่องค้นหาเสีย focus แล้วรายการถูกซ่อน
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    pick(i);
                });
                li.addEventListener('mousemove', () => setActive(i));
                list.appendChild(li);
            });
            list.hidden = false;
            input.setAttribute('aria-expanded', 'true');
        }

        input.setAttribute('autocomplete', 'off');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', list.id);
        list.setAttribute('role', 'listbox');

        input.addEventListener('input', () => render(input.value));
        input.addEventListener('focus', () => render(input.value));
        input.addEventListener('blur', hide);
        input.addEventListener('keydown', (e) => {
            const open = !list.hidden;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (!open) {
                    render(input.value);
                    return;
                }
                e.preventDefault();
                const n = items.length;
                const next = e.key === 'ArrowDown' ? active + 1 : active - 1;
                setActive(next >= n ? -1 : next < -1 ? n - 1 : next);
            } else if (e.key === 'Enter') {
                if (open && active >= 0) {
                    e.preventDefault();
                    pick(active);
                } else {
                    hide();
                }
            } else if (e.key === 'Escape') {
                hide();
            } else if (e.key === 'Tab' && open && items.length) {
                // Tab เติมคำแนะนำอันแรก (หรืออันที่เลือกอยู่) ลงช่องค้นหา
                e.preventDefault();
                pick(active >= 0 ? active : 0);
            }
        });

        return { hide, reset: () => { index = null; } };
    }

    window.createSearchSuggest = createSearchSuggest;
})();
