// ปฏิทินเลือกวันที่แบบกำหนดเองสำหรับฟิลด์ input[type=date] — ใช้แทนปฏิทินเนทีฟของเบราว์เซอร์
// เหตุผลที่ต้องทำเอง: input[type=date] เนทีฟ "ปิดได้" เฉพาะช่วงต่อเนื่อง (min/max) เท่านั้น
// ปิดทีละวันกลางช่วง (เช่น วันหยุดที่แทรกอยู่ในรอบจอง) ไม่ได้เลยด้วย HTML ล้วนๆ
(function () {
    function pad(n) { return String(n).padStart(2, '0'); }
    function toValue(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    function parseValue(v) {
        if (!v) return null;
        const parts = String(v).split('-').map(Number);
        if (!parts[0] || !parts[1] || !parts[2]) return null;
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    const MONTH_NAMES_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const WEEKDAY_NAMES_TH = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

    function createDatePicker(input, initialOptions) {
        let min = (initialOptions && initialOptions.min) || null;
        let max = (initialOptions && initialOptions.max) || null;
        let disabledDates = new Set((initialOptions && initialOptions.disabledDates) || []);
        let viewDate = parseValue(input.value) || parseValue(min) || new Date();
        let popup = null;

        input.setAttribute('readonly', 'readonly');
        input.classList.add('dp-input');

        const wrap = document.createElement('div');
        wrap.className = 'dp-field-wrap';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        function onDocClick(event) {
            if (popup && !popup.contains(event.target) && event.target !== input) closePopup();
        }

        function closePopup() {
            if (!popup) return;
            popup.remove();
            popup = null;
            document.removeEventListener('click', onDocClick, true);
        }

        function dayState(cellVal) {
            if (disabledDates.has(cellVal)) return 'holiday';
            if (min && cellVal < min) return 'out-of-range';
            if (max && cellVal > max) return 'out-of-range';
            return 'ok';
        }

        function render() {
            if (!popup) return;
            popup.innerHTML = '';

            const header = document.createElement('div');
            header.className = 'dp-header';
            const prevBtn = document.createElement('button');
            prevBtn.type = 'button';
            prevBtn.className = 'dp-nav';
            prevBtn.textContent = '‹';
            prevBtn.addEventListener('click', () => {
                viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
                render();
            });
            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'dp-nav';
            nextBtn.textContent = '›';
            nextBtn.addEventListener('click', () => {
                viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
                render();
            });
            const label = document.createElement('span');
            label.className = 'dp-month-label';
            label.textContent = `${MONTH_NAMES_TH[viewDate.getMonth()]} ${viewDate.getFullYear() + 543}`;
            header.appendChild(prevBtn);
            header.appendChild(label);
            header.appendChild(nextBtn);
            popup.appendChild(header);

            const weekdays = document.createElement('div');
            weekdays.className = 'dp-weekdays';
            WEEKDAY_NAMES_TH.forEach((w) => {
                const cell = document.createElement('span');
                cell.textContent = w;
                weekdays.appendChild(cell);
            });
            popup.appendChild(weekdays);

            const grid = document.createElement('div');
            grid.className = 'dp-days';

            const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
            let startOffset = firstOfMonth.getDay() - 1;
            if (startOffset < 0) startOffset = 6;
            const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
            const prevMonthDays = new Date(viewDate.getFullYear(), viewDate.getMonth(), 0).getDate();
            const todayVal = toValue(new Date());
            const selectedVal = input.value;

            for (let i = 0; i < 42; i += 1) {
                const dayNum = i - startOffset + 1;
                let cellDate;
                let outside = false;
                if (dayNum < 1) {
                    cellDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, prevMonthDays + dayNum);
                    outside = true;
                } else if (dayNum > daysInMonth) {
                    cellDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, dayNum - daysInMonth);
                    outside = true;
                } else {
                    cellDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayNum);
                }

                const cellVal = toValue(cellDate);
                const state = dayState(cellVal);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'dp-day';
                btn.textContent = cellDate.getDate();
                if (outside) btn.classList.add('dp-day--outside');
                if (cellVal === todayVal) btn.classList.add('dp-day--today');
                if (cellVal === selectedVal) btn.classList.add('dp-day--selected');

                if (state === 'holiday') {
                    btn.classList.add('dp-day--holiday');
                    btn.disabled = true;
                    btn.title = 'วันหยุด จองไม่ได้';
                } else if (state === 'out-of-range') {
                    btn.classList.add('dp-day--disabled');
                    btn.disabled = true;
                } else {
                    btn.addEventListener('click', () => {
                        input.value = cellVal;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        closePopup();
                    });
                }
                grid.appendChild(btn);
            }
            popup.appendChild(grid);

            if (disabledDates.size) {
                const legend = document.createElement('div');
                legend.className = 'dp-legend';
                legend.innerHTML = '<span class="dp-legend-dot"></span>วันหยุด จองไม่ได้';
                popup.appendChild(legend);
            }
        }

        function openPopup() {
            if (popup) return;
            viewDate = parseValue(input.value) || parseValue(min) || new Date();
            popup = document.createElement('div');
            popup.className = 'dp-popup';
            wrap.appendChild(popup);
            render();
            setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
        }

        input.addEventListener('click', openPopup);
        input.addEventListener('focus', openPopup);

        return {
            setOptions(next) {
                if (!next) return;
                if (next.min !== undefined) min = next.min;
                if (next.max !== undefined) max = next.max;
                if (next.disabledDates !== undefined) disabledDates = new Set(next.disabledDates);
                if (popup) render();
            },
            close: closePopup
        };
    }

    window.createDatePicker = createDatePicker;
})();
