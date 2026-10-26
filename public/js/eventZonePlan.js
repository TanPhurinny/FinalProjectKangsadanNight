// ผังย่อยโซน G (บูธกิจกรรม) แบบมีพื้นที่โดยรอบ ใช้ร่วมกันทุกหน้าที่มีผังย่อย
// แต่ละหน้าวาดช่อง G101/G201 ด้วยตัวเองตามปกติ (สถานะ สี การคลิก tooltip ของหน้านั้น) แล้วเรียก mountEventZonePlan(container)
// ฟังก์ชันนี้ย้ายช่องจริงทั้งสองไปวางบนผังจำลองหัวท้ายโซน F/B ห้องน้ำ และออฟฟิศ ตามผังกระดาษของตลาด
// ล็อกโดยรอบเป็นแค่ภาพประกอบบอกตำแหน่ง (กดไม่ได้ และไม่นับรวมในตัวนับโซน)
(function () {
    // คอลัมน์ในกริด: F1 F2 | ทางเดิน | F3 F4 | ทางเดิน | F5 F6 | ทางเดิน | B1 B2
    const COLS = { F1: 1, F2: 2, F3: 4, F4: 5, F5: 7, F6: 8, B1: 10, B2: 11 };
    const AISLES = [3, 6, 9];
    const FIRST_ROW = 3; // แถว 1 = ป้ายแถว, แถว 2 = ต่อขึ้นไปด้านบน
    const LAST_ROW = 11; // ห้องน้ำ/ออฟฟิศ อยู่แถว 10–11

    // ล็อกท้ายแถวตามผังจริง (แถวในกริด, คอลัมน์, ข้อความ)
    const CONTEXT_LOTS = [
        [3, 'F1', 'x'], [3, 'F2', 'x'],
        [3, 'F3', 'F330'], [3, 'F4', 'F430'], [3, 'F5', 'F530'], [3, 'F6', 'F630'], [3, 'B1', 'B120'], [3, 'B2', 'T130'],
        [4, 'F3', 'F331'], [4, 'F4', 'F431'], [4, 'F5', 'F531'], [4, 'F6', 'F631'], [4, 'B1', 'B121'], [4, 'B2', 'T131'],
        [5, 'F3', 'F332'], [5, 'F4', 'F432'], [5, 'F5', 'F532'], [5, 'F6', 'F632'], [5, 'B1', 'B122'], [5, 'B2', 'B222'],
        [6, 'F3', 'F333'], [6, 'F4', 'F433'], [6, 'F5', 'F533'], [6, 'F6', 'F633'], [6, 'B1', 'B123'], [6, 'B2', 'B223'],
        [7, 'F3', 'F334'], [7, 'F4', 'F434'], [7, 'F5', 'F534'], [7, 'F6', 'F634'],
        [8, 'F5', 'F535'], [8, 'F6', 'F635'],
        [9, 'F5', 'F536'], [9, 'F6', 'F636']
    ];

    const HEADERS = [['F1', 'F1 · F2'], ['F3', 'F3 · F4'], ['F5', 'F5 · F6'], ['B1', 'B1 · B2']];

    const BOOTHS = [
        { code: 'G101', col: 'F1', rowStart: 4, rowEnd: 7, note: 'จุดที่ 1', where: 'ใต้แถว F1 · F2', noteRow: 7 },
        { code: 'G201', col: 'B1', rowStart: 8, rowEnd: 11, note: 'จุดที่ 2', where: 'ใต้ B123 · B223', noteRow: 7 }
    ];

    const FACILITIES = [
        { col: 'F3', label: 'ห้องน้ำ', icon: 'fa-restroom' },
        { col: 'F5', label: 'ออฟฟิศ', icon: 'fa-building' }
    ];

    function place(el, col, row, colSpan = 1, rowSpan = 1) {
        el.style.gridColumn = `${col} / span ${colSpan}`;
        el.style.gridRow = `${row} / span ${rowSpan}`;
        return el;
    }

    function make(tag, className, text) {
        const el = document.createElement(tag);
        el.className = className;
        if (text != null) el.textContent = text;
        return el;
    }

    function findBoothCell(container, code) {
        return Array.from(container.querySelectorAll('.stall-cell, .insp-stall-cell')).find((el) =>
            el.dataset.stall === code || (el.firstChild && el.firstChild.textContent.trim() === code));
    }

    function mountEventZonePlan(container) {
        const cells = {};
        BOOTHS.forEach((b) => { cells[b.code] = findBoothCell(container, b.code); });
        container.innerHTML = '';

        const root = make('div', 'ezp');
        root.setAttribute('role', 'group');
        root.setAttribute('aria-label', 'ผังบูธกิจกรรมโซน G และพื้นที่โดยรอบ');

        const caption = make('div', 'ezp-caption');
        caption.innerHTML = '<b>พื้นที่บูธกิจกรรม</b><span>ท้ายโซน F ใกล้ห้องน้ำและออฟฟิศ · บูธละ 490 บาท/วัน</span>';
        root.appendChild(caption);

        const plan = make('div', 'ezp-plan');

        AISLES.forEach((col) => {
            const aisle = place(make('div', 'ezp-aisle'), col, 1, 1, LAST_ROW);
            aisle.setAttribute('aria-hidden', 'true');
            plan.appendChild(aisle);
        });

        HEADERS.forEach(([col, text]) => {
            const head = place(make('div', 'ezp-head', text), COLS[col], 1, 2);
            head.setAttribute('aria-hidden', 'true');
            plan.appendChild(head);
            const more = place(make('div', 'ezp-more', '⋮'), COLS[col], 2, 2);
            more.setAttribute('aria-hidden', 'true');
            plan.appendChild(more);
        });

        CONTEXT_LOTS.forEach(([row, col, text]) => {
            const lot = place(make('div', text === 'x' ? 'ezp-lot ezp-lot--x' : 'ezp-lot', text), COLS[col], row);
            lot.setAttribute('aria-hidden', 'true');
            plan.appendChild(lot);
        });

        FACILITIES.forEach((f) => {
            const box = place(make('div', 'ezp-facility'), COLS[f.col], LAST_ROW - 1, 2, 2);
            box.innerHTML = `<i class="fa-solid ${f.icon}" aria-hidden="true"></i><span>${f.label}</span>`;
            plan.appendChild(box);
        });

        BOOTHS.forEach((b) => {
            const note = place(make('div', 'ezp-note'), COLS[b.col], b.noteRow, 2);
            note.innerHTML = `<b>${b.note}</b><span>${b.where}</span>`;
            plan.appendChild(note);

            const cell = cells[b.code];
            if (!cell) return;
            cell.classList.add('ezp-booth');
            cell.classList.remove('tt-below');
            place(cell, COLS[b.col], b.rowStart, 2, b.rowEnd - b.rowStart);
            plan.appendChild(cell);
        });

        root.appendChild(plan);

        const legend = make('div', 'ezp-legend');
        legend.innerHTML = '<span><i class="ezp-key ezp-key--booth"></i>บูธกิจกรรม (กดดูรายละเอียด)</span>'
            + '<span><i class="ezp-key ezp-key--lot"></i>ล็อกโดยรอบ แสดงเพื่อบอกตำแหน่ง</span>'
            + '<span><i class="ezp-key ezp-key--aisle"></i>ทางเดิน</span>';
        root.appendChild(legend);

        container.appendChild(root);
    }

    window.mountEventZonePlan = mountEventZonePlan;
})();
