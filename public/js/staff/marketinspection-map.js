document.addEventListener('DOMContentLoaded', () => {
    function readJsonScript(id) {
        const el = document.getElementById(id);
        if (!el) return {};
        try {
            return JSON.parse(el.textContent || '{}');
        } catch (_) {
            return {};
        }
    }

    const ZONES_DATA = readJsonScript('inspectionZonesDataJson');
    const STATUS_BY_CODE = readJsonScript('inspectionStatusByCodeJson');

    const toggleTableBtn = document.getElementById('viewToggleTable');
    const toggleZoneBtn = document.getElementById('viewToggleZone');
    const tableWrap = document.getElementById('inspectionTableWrap');
    const mapWrap = document.getElementById('inspectionMapWrap');
    const overviewEl = document.getElementById('inspectionZoneOverview');
    const detailEl = document.getElementById('inspectionZoneDetail');
    const detailTitleEl = document.getElementById('zoneDetailTitle');
    const canvasEl = document.getElementById('inspectionZoneCanvas');
    const tooltip = document.getElementById('inspectionMapTooltip');

    if (!toggleTableBtn || !toggleZoneBtn || !tableWrap || !mapWrap || !overviewEl || !detailEl || !canvasEl) return;

    // โซน D ในผังจริงเป็นรูปตัว L — ตำแหน่งเดียวกับที่ใช้ในหน้า admin/booking_stall.ejs (ยึดผังจริง)
    const ZONE_D_LAYOUT = [
        { code: 'D201', col: 3, row: 1 }, { code: 'D202', col: 4, row: 1 },
        { code: 'D203', col: 5, row: 1 }, { code: 'D204', col: 6, row: 1 },
        { code: 'D205', col: 7, row: 1 }, { code: 'D206', col: 8, row: 1 },
        { code: 'D207', col: 9, row: 1 }, { code: 'D208', col: 10, row: 1 },
        { code: 'D211', col: 2, row: 2 }, { code: 'D212', col: 3, row: 2 },
        { code: 'D209', col: 10, row: 2 }
    ];
    const HORIZONTAL_ZONES = ['E', 'X', 'C'];

    let activeZone = null;
    let mapRendered = false;

    function isPairedStall(stall) {
        return !!(stall && stall.small && stall.groupSize === 2);
    }

    // ลำดับความสำคัญของสี: มีปัญหา > ตรวจแล้ว > ยังไม่ตรวจ > ว่าง
    // (ล็อคที่ตรวจแล้วแต่ยังมีปัญหาค้างอยู่ ให้ขึ้นแดงเสมอ เพื่อให้พนักงานเห็นว่าต้องติดตามต่อ)
    function resolveStatus(code) {
        const info = STATUS_BY_CODE[code];
        if (!info || info.isVacant || !info.inspectionEnabled) return 'vacant';
        if (info.hasIssue) return 'issue';
        if (info.isInspected) return 'inspected';
        return 'pending';
    }

    function statusLabel(status) {
        if (status === 'issue') return 'มีปัญหา';
        if (status === 'inspected') return 'ตรวจแล้ว';
        if (status === 'pending') return 'ยังไม่ตรวจ';
        return 'ว่าง';
    }

    function scrollToTableRow(code) {
        const row = document.querySelector(`.inspection-row[data-stall-code="${window.CSS && CSS.escape ? CSS.escape(code) : code}"]`);
        if (!row) return;

        setViewMode('table'); // คลิกล็อคในผัง (ไม่ว่าจะอยู่ใน zone ไหน) กลับไปตารางเสมอ ไม่ใช่กลับไป overview
        window.requestAnimationFrame(() => {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.remove('stall-cell-flash');
            // force reflow เพื่อให้ animation เล่นซ้ำได้ทุกครั้งที่คลิก
            void row.offsetWidth;
            row.classList.add('stall-cell-flash');
            setTimeout(() => row.classList.remove('stall-cell-flash'), 1500);
        });
    }

    function showTooltip(e, code, status) {
        tooltip.innerHTML = `
            <div class="imt-code">${code}</div>
            <div class="imt-status">${statusLabel(status)}</div>
            <div class="imt-meta">${status === 'vacant' ? 'ล็อคว่าง' : 'คลิกเพื่อเลื่อนไปแถวในตาราง'}</div>
        `;
        tooltip.style.display = 'block';
        moveTooltip(e);
    }

    function hideTooltip() {
        tooltip.style.display = 'none';
    }

    function moveTooltip(e) {
        let x = e.clientX + 16;
        let y = e.clientY - (tooltip.offsetHeight / 2);

        if (x + tooltip.offsetWidth > window.innerWidth) {
            x = e.clientX - tooltip.offsetWidth - 16;
        }
        if (x < 0) x = 4;
        if (y < 0) y = 4;
        if (y + tooltip.offsetHeight > window.innerHeight) {
            y = window.innerHeight - tooltip.offsetHeight - 4;
        }

        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
    }

    function makeStallCell(code, stall) {
        const cell = document.createElement('div');
        cell.className = isPairedStall(stall) ? 'insp-stall-cell insp-stall-cell-small' : 'insp-stall-cell';
        cell.textContent = code;

        const status = resolveStatus(code);
        cell.classList.add(`status-${status}`);

        cell.addEventListener('mouseenter', (e) => showTooltip(e, code, status));
        cell.addEventListener('mousemove', moveTooltip);
        cell.addEventListener('mouseleave', hideTooltip);

        if (status !== 'vacant') {
            cell.addEventListener('click', () => scrollToTableRow(code));
        }

        return cell;
    }

    function renderDZoneGrid(gridContainer, stallByCode) {
        const layout = document.createElement('div');
        layout.className = 'insp-zone-d-layout';

        const label = document.createElement('div');
        label.className = 'insp-zone-d-tag';
        label.style.gridColumn = '1 / 2';
        label.style.gridRow = '2 / 3';
        label.textContent = 'D2';
        layout.appendChild(label);

        ZONE_D_LAYOUT.forEach((pos) => {
            const stall = stallByCode[pos.code];
            if (!stall) return;
            const cell = makeStallCell(pos.code, stall);
            cell.style.gridColumn = `${pos.col} / ${pos.col + 1}`;
            cell.style.gridRow = `${pos.row} / ${pos.row + 1}`;
            layout.appendChild(cell);
        });

        gridContainer.appendChild(layout);
    }

    function renderGrid(zoneKey) {
        canvasEl.innerHTML = '';

        const zoneData = ZONES_DATA[zoneKey];
        if (!zoneData || !zoneData.columns || !zoneData.columns.length) {
            canvasEl.innerHTML = '<div class="insp-empty-msg">ไม่มีข้อมูลแผงสำหรับโซนนี้</div>';
            return;
        }

        if (zoneKey === 'D') {
            const stallByCode = {};
            zoneData.columns.forEach((column) => {
                column.stalls.forEach((stall) => { stallByCode[stall.code] = stall; });
            });
            renderDZoneGrid(canvasEl, stallByCode);
            return;
        }

        const isHorizontalZone = HORIZONTAL_ZONES.includes(zoneKey);

        zoneData.columns.forEach((column) => {
            const blockClasses = ['insp-col-block'];
            if (column.groupEnd) blockClasses.push('insp-col-group-end');

            const blockDiv = document.createElement('div');
            blockDiv.className = blockClasses.join(' ');

            const lbl = document.createElement('div');
            lbl.className = 'insp-col-lbl';
            lbl.textContent = column.rowCode;

            const wrap = document.createElement('div');
            wrap.className = isHorizontalZone ? 'insp-col-wrap insp-col-wrap-horizontal' : 'insp-col-wrap';
            wrap.appendChild(lbl);

            const colDiv = document.createElement('div');
            colDiv.className = isHorizontalZone ? 'insp-stall-column insp-stall-column-horizontal' : 'insp-stall-column';

            let smallWrap = null;
            let currentGroupId = null;
            const getSmallWrap = (groupId) => {
                if (!smallWrap || groupId !== currentGroupId) {
                    currentGroupId = groupId;
                    smallWrap = document.createElement('div');
                    smallWrap.className = 'insp-small-lot-pair';
                    colDiv.appendChild(smallWrap);
                }
                return smallWrap;
            };

            column.stalls.forEach((stall) => {
                if (stall.status === 'PLACEHOLDER') {
                    const placeholderCell = document.createElement('div');
                    placeholderCell.className = isPairedStall(stall) ? 'insp-stall-cell insp-stall-cell-small placeholder' : 'insp-stall-cell placeholder';
                    placeholderCell.textContent = 'x';
                    (isPairedStall(stall) ? getSmallWrap(stall.groupId) : colDiv).appendChild(placeholderCell);
                    return;
                }

                const cell = makeStallCell(stall.code, stall);
                (isPairedStall(stall) ? getSmallWrap(stall.groupId) : colDiv).appendChild(cell);
            });

            wrap.appendChild(colDiv);
            blockDiv.appendChild(wrap);
            canvasEl.appendChild(blockDiv);
        });
    }

    // เลือกโซนแล้วเรนเดอร์กริดล็อคของโซนนั้นทันที โดยไม่ต้องกดกลับไปหน้าเลือกโซนก่อน
    // (มินิแผนผังโซนด้านบนกับกริดล็อคด้านล่างแสดงพร้อมกันตลอด)
    function selectZone(code) {
        activeZone = code;
        overviewEl.querySelectorAll('.insp-ov-zone-block').forEach((block) => {
            block.classList.toggle('is-active', block.dataset.zone === code);
        });
        if (detailTitleEl) detailTitleEl.textContent = `โซน ${code}`;
        renderGrid(code);
    }

    // มินิแผนผังโซนเป็น DOM คงที่ที่ EJS render ไว้แล้ว (ตำแหน่ง % คัดลอกจาก admin/bookingStall.css)
    // ผูก click listener, ซ่อนบล็อกที่ไม่มีข้อมูลจริงใน ZONES_DATA และเลือกโซนแรกที่มีข้อมูลไว้เป็นค่าเริ่มต้น
    function renderOverview() {
        let firstAvailable = null;

        overviewEl.querySelectorAll('.insp-ov-zone-block').forEach((block) => {
            const code = block.dataset.zone;
            if (!ZONES_DATA[code] || !ZONES_DATA[code].columns || !ZONES_DATA[code].columns.length) {
                block.classList.add('is-empty');
                return;
            }
            if (!firstAvailable) firstAvailable = code;
            block.addEventListener('click', () => selectZone(code));
        });

        if (firstAvailable) {
            selectZone(firstAvailable);
        } else if (detailTitleEl) {
            detailTitleEl.textContent = 'ไม่มีข้อมูลผังตลาด';
        }
    }

    function setViewMode(mode) {
        const showZone = mode === 'zone';
        tableWrap.classList.toggle('d-none', showZone);
        mapWrap.classList.toggle('d-none', !showZone);
        toggleTableBtn.classList.toggle('active', !showZone);
        toggleZoneBtn.classList.toggle('active', showZone);

        if (showZone && !mapRendered) {
            mapRendered = true;
            renderOverview();
        }
    }

    toggleTableBtn.addEventListener('click', () => setViewMode('table'));
    toggleZoneBtn.addEventListener('click', () => setViewMode('zone'));
});
