// กรอบบริบทรอบผังย่อยของแต่ละโซน: บอกว่าทิศไหนติดอะไร (โซนข้างเคียง ทางเดินหลัก ทางเข้า ลานจอดรถ ห้องน้ำ/ออฟฟิศ)
// และใส่แถบทางเดินระหว่างกลุ่มแถว (คอลัมน์ที่มี class *group-end) ให้รู้ตำแหน่งจริงในตลาด — ข้อมูลตามผังกระดาษของตลาด
// แต่ละหน้าวาดล็อกของโซนตามปกติก่อน แล้วเรียก wrapZoneContext(container, zoneCode, { onZone }) ทีหลัง
// ส่วนที่เพิ่มเป็นภาพประกอบเท่านั้น ไม่แตะช่องล็อก (สถานะ การคลิก tooltip ตัวนับ ยังเป็นของหน้าเดิม)
(function () {
    const ENTRANCE_LEFT = { type: 'entrance', label: 'ทางเข้าตลาด 62 บล็อก' };
    const ENTRANCE_BOTTOM = { type: 'entrance', label: 'ทางเข้า-ออก' };
    const MAIN_WALK = { type: 'walk', label: 'ทางเดินหลัก' };
    const PARKING = { type: 'parking', label: 'ลานจอดรถ กังสดาลไนท์' };
    const TOP_EDGE = { type: 'edge', label: 'ขอบตลาด · ฝั่ง U Seoul Grill', icon: 'fa-location-dot' };
    const zone = (code, label) => ({ type: 'zone', code, label: label || `โซน ${code}` });

    // แต่ละทิศเป็นชั้น เรียงจากชั้นที่ติดโซนออกไปด้านนอก แต่ละชั้นมีได้หลายอย่างวางเรียงกัน
    const CONTEXT = {
        A: { n: [[zone('E')]], s: [[zone('C')]], w: [[ENTRANCE_LEFT]], e: [[MAIN_WALK], [zone('F')]] },
        B: { n: [[zone('X')]], s: [[ENTRANCE_BOTTOM]], w: [[zone('F')]], e: [[PARKING]] },
        C: { n: [[zone('A')]], s: [[ENTRANCE_BOTTOM]], w: [[ENTRANCE_LEFT]], e: [[MAIN_WALK]] },
        D: { n: [[TOP_EDGE]], s: [[zone('F')]], w: [[MAIN_WALK], [zone('E')]], e: [[zone('X')]] },
        E: { n: [[TOP_EDGE]], s: [[zone('A')]], w: [[ENTRANCE_LEFT]], e: [[MAIN_WALK], [zone('D')]] },
        F: {
            n: [[zone('D')]],
            s: [[{ type: 'zone', code: 'G', label: 'บูธกิจกรรม G101' }, { type: 'facility', label: 'ห้องน้ำ', icon: 'fa-restroom' }, { type: 'facility', label: 'ออฟฟิศ', icon: 'fa-building' }, { type: 'zone', code: 'G', label: 'บูธกิจกรรม G201' }]],
            w: [[MAIN_WALK], [zone('A')]],
            e: [[zone('B')]]
        },
        X: { n: [[TOP_EDGE]], s: [[zone('B')]], w: [[zone('D')]], e: [[PARKING]] }
    };
    CONTEXT.T = CONTEXT.B;

    const ARROWS = { n: '↑', s: '↓', w: '←', e: '→' };
    const SIDE_NAME = { n: 'ด้านบน', s: 'ด้านล่าง', w: 'ด้านซ้าย', e: 'ด้านขวา' };

    function bandItem(item, side, onZone) {
        const isZone = item.type === 'zone' && typeof onZone === 'function';
        const el = document.createElement(isZone ? 'button' : 'div');
        el.className = `zc-item zc-item--${item.type}`;
        if (isZone) {
            el.type = 'button';
            el.title = `ไปที่${item.label}`;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                onZone(item.code);
            });
        }
        const icon = item.icon ? `<i class="fa-solid ${item.icon}" aria-hidden="true"></i>` : '';
        const arrow = item.type === 'zone' ? `<span class="zc-arrow" aria-hidden="true">${ARROWS[side]}</span>` : '';
        el.innerHTML = `${arrow}${icon}<span class="zc-text">${item.label}</span>`;
        return el;
    }

    function buildSide(side, layers, onZone) {
        const strip = document.createElement('div');
        strip.className = `zc-side zc-side--${side}`;
        strip.setAttribute('aria-label', `${SIDE_NAME[side]}ของโซน`);
        // ชั้นที่ติดโซนต้องอยู่ชิดผัง: ด้านบน/ซ้าย วางชั้นนอกสุดก่อน
        const ordered = side === 'n' || side === 'w' ? layers.slice().reverse() : layers;
        ordered.forEach((items) => {
            const band = document.createElement('div');
            band.className = 'zc-band';
            items.forEach((item) => band.appendChild(bandItem(item, side, onZone)));
            strip.appendChild(band);
        });
        return strip;
    }

    function wrapZoneContext(container, zoneCode, options = {}) {
        const ctx = CONTEXT[zoneCode];
        if (!ctx || !container.children.length) return;

        const gap = getComputedStyle(container).gap;
        const body = document.createElement('div');
        body.className = 'zc-body';
        if (gap && gap !== 'normal') body.style.gap = gap;

        const children = Array.from(container.children);
        children.forEach((child, i) => {
            body.appendChild(child);
            // แถบทางเดินระหว่างกลุ่มแถว (ตำแหน่งเดียวกับที่ผังเดิมเว้นช่องไว้) ไม่ใส่หลังแถวสุดท้าย
            if (/group-end/.test(child.className) && i < children.length - 1) {
                const aisle = document.createElement('div');
                aisle.className = 'zc-aisle';
                aisle.setAttribute('aria-hidden', 'true');
                aisle.innerHTML = '<span>ทางเดิน</span>';
                body.appendChild(aisle);
            }
        });

        const frame = document.createElement('div');
        frame.className = 'zc';
        frame.setAttribute('role', 'group');
        frame.setAttribute('aria-label', `ผังโซน ${zoneCode} และพื้นที่โดยรอบ`);
        frame.appendChild(buildSide('n', ctx.n, options.onZone));
        frame.appendChild(buildSide('w', ctx.w, options.onZone));
        frame.appendChild(body);
        frame.appendChild(buildSide('e', ctx.e, options.onZone));
        frame.appendChild(buildSide('s', ctx.s, options.onZone));
        container.appendChild(frame);
    }

    window.wrapZoneContext = wrapZoneContext;
})();
