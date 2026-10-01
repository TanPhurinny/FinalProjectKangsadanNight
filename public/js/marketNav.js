/* "ฉันอยู่ตรงนี้" — นำทางไปร้านบนผังตลาดเป็นข้อความทีละขั้น + เส้นทางบนผังย่อ
   ใช้ข้อมูล/ฟังก์ชันจาก marketMap.js (ZONES_DATA, BOOKING_BY_STALL, findZoneForStall, openStallDeepLink ...)
   ต้องโหลดหลัง marketMap.js

   โมเดลทางเดิน (อิงผังภาพรวม ตำแหน่งเป็น % ของพื้นที่ผัง ต้องตรงกับ #zone-* ใน marketMap.css):
   - ทางเดินหลักแนวตั้งคั่นโซน A กับ F (x 37.5–49.5%)
   - ทางเดินขวาง "หัวโซน" ระหว่างแถวบน (E/D/X) กับโซนกลาง (y ≈ 19%) และ "ท้ายโซน" ระหว่าง A/F/B กับ C (y ≈ 87%)
   - แถวล็อกในโซน A/F/B เรียงแนวตั้ง เดินเข้าแถวได้จากหัวหรือท้ายแถว (เลือกฝั่งที่ใกล้ล็อกปลายทางกว่า)
   - โซนแถวเดียว (E/D/X/C) อยู่ติดทางเดินขวาง เดินเลียบไปได้เลย */

(function () {
    const AISLE_X = 43.5;
    const TOP_Y = 19;
    const BOTTOM_Y = 87;

    const ZONE_GEO = {
        A: { x: 13.5, y: 20, w: 23, h: 66, vertical: true },
        F: { x: 50.5, y: 20, w: 17, h: 66, vertical: true },
        B: { x: 71.5, y: 20, w: 15, h: 66, vertical: true },
        E: { x: 19.5, y: 8, w: 17, h: 10, edge: 'top' },
        D: { x: 50.5, y: 8, w: 17, h: 10, edge: 'top' },
        X: { x: 71.5, y: 8, w: 15, h: 10, edge: 'top' },
        C: { x: 13.5, y: 88, w: 23, h: 9, edge: 'bottom' }
    };

    // จุดเริ่มที่ผู้ใช้เลือกได้: โซน (กลางโซน) + จุดสังเกต
    const LANDMARKS = {
        road: { label: 'ฝั่งถนน (U Seoul Grill)', x: AISLE_X, y: 4, end: 'top' },
        exit: { label: 'ทางเข้า-ออก', x: AISLE_X, y: 98, end: 'bottom' },
        facility: { label: 'ห้องน้ำ / จุดทิ้งขยะ', x: 58, y: 96, end: 'bottom' }
    };

    const SIDE_NAME = { left: 'ฝั่งทางเข้าตลาด 62 บล็อค', right: 'ฝั่งลานจอดรถ' };
    const END_NAME = { top: 'ฝั่งถนน', bottom: 'ฝั่งทางเข้า-ออก' };
    const START_KEY = 'kangsadan.navStart';

    // ---------- ตำแหน่งล็อกบนผัง ----------
    function locateStall(code) {
        const zone = findZoneForStall(code);
        const geo = ZONE_GEO[zone];
        if (!zone || !geo) return null;
        const columns = ZONES_DATA[zone].columns || [];

        if (geo.vertical) {
            for (let ci = 0; ci < columns.length; ci += 1) {
                const slots = columns[ci].stalls || [];
                const slot = slots.findIndex((st) => st.code === code);
                if (slot === -1) continue;
                const real = slots.filter((st) => st.status !== 'PLACEHOLDER');
                const ri = real.findIndex((st) => st.code === code);
                const fromTop = slot < slots.length / 2;
                return {
                    zone,
                    geo,
                    column: columns[ci].rowCode,
                    colIndex: ci,
                    colCount: columns.length,
                    end: fromTop ? 'top' : 'bottom',
                    countFromEnd: fromTop ? ri + 1 : real.length - ri,
                    x: geo.x + ((ci + 0.5) * geo.w) / columns.length,
                    y: geo.y + ((slot + 0.5) * geo.h) / slots.length
                };
            }
            return null;
        }

        // โซนแถวเดียว: เรียงซ้าย→ขวาตามลำดับในข้อมูล
        const real = columns.flatMap((c) => (c.stalls || []).filter((st) => st.status !== 'PLACEHOLDER'));
        const idx = real.findIndex((st) => st.code === code);
        if (idx === -1) return null;
        return {
            zone,
            geo,
            end: geo.edge,
            index: idx,
            count: real.length,
            x: geo.x + ((idx + 0.5) * geo.w) / real.length,
            y: geo.y + geo.h / 2
        };
    }

    function startPoint(key) {
        if (LANDMARKS[key]) return { key, label: LANDMARKS[key].label, x: LANDMARKS[key].x, y: LANDMARKS[key].y, end: LANDMARKS[key].end };
        const geo = ZONE_GEO[key];
        if (!geo) return null;
        return {
            key,
            zone: key,
            label: `โซน ${key}`,
            x: geo.x + geo.w / 2,
            y: geo.y + geo.h / 2,
            end: geo.vertical ? null : geo.edge
        };
    }

    // เลี้ยวซ้าย/ขวา ตามทิศที่กำลังเดิน (ทิศบนผัง: up = ไปฝั่งถนน, down = ไปฝั่งทางเข้า-ออก, left/right = ฝั่งทางเข้าตลาด/ลานจอดรถ)
    function turnWord(heading, next) {
        const order = ['up', 'right', 'down', 'left'];
        const diff = (order.indexOf(next) - order.indexOf(heading) + 4) % 4;
        if (diff === 1) return 'เลี้ยวขวา';
        if (diff === 3) return 'เลี้ยวซ้าย';
        if (diff === 2) return 'กลับหลังหัน';
        return 'เดินตรงไป';
    }

    // โซนที่เดินผ่านระหว่างทาง เรียงตามลำดับที่เจอ — ไม่นับโซนที่ยืนอยู่ตอนเริ่ม (แนวโซนครอบจุดเริ่ม)
    function zonesBetween(x1, x2, y) {
        const lo = Math.min(x1, x2);
        const hi = Math.max(x1, x2);
        return Object.keys(ZONE_GEO).filter((z) => {
            const g = ZONE_GEO[z];
            const cx = g.x + g.w / 2;
            const sameBand = y === TOP_Y ? g.vertical || g.edge === 'top' : g.vertical || g.edge === 'bottom';
            const containsStart = x1 >= g.x && x1 <= g.x + g.w;
            return sameBand && !containsStart && cx > lo && cx < hi;
        }).sort((a, b) => Math.abs(ZONE_GEO[a].x - x1) - Math.abs(ZONE_GEO[b].x - x1));
    }

    // ---------- สร้างเส้นทาง ----------
    function buildRoute(startKey, code) {
        const target = locateStall(code);
        const start = startPoint(startKey);
        if (!target || !start) return null;
        const d = BOOKING_BY_STALL[code] || {};
        const endY = target.end === 'top' ? TOP_Y : BOTTOM_Y;
        const steps = [];
        const points = [[start.x, start.y]];
        let heading = null;
        let curX = start.x;

        steps.push({ icon: 'fa-location-dot', text: `เริ่มที่ <b>${start.label}</b>` });

        // 1) ไปให้ถึงทางเดินขวางฝั่งที่ใกล้ล็อกปลายทาง
        if (!start.end) {
            // อยู่ในโซนกลาง (A/F/B): เดินตามแนวแถวไปหัว/ท้ายโซน
            heading = target.end === 'top' ? 'up' : 'down';
            steps.push({
                icon: heading === 'up' ? 'fa-arrow-up' : 'fa-arrow-down',
                text: `เดินตามแนวแถวในโซน ${start.zone} ไปทาง<b>${END_NAME[target.end]}</b> จนสุดแถว ออกมาที่ทางเดินขวาง${target.end === 'top' ? 'หัว' : 'ท้าย'}โซน`
            });
            points.push([start.x, endY]);
        } else if (start.end !== target.end) {
            // อยู่คนละฝั่ง (บน/ล่าง): ใช้ทางเดินหลักเดินข้าม
            const toAisle = start.x < AISLE_X ? 'right' : start.x > AISLE_X ? 'left' : null;
            if (toAisle && Math.abs(start.x - AISLE_X) > 2) {
                steps.push({ icon: toAisle === 'right' ? 'fa-arrow-right' : 'fa-arrow-left', text: `เดินไปทาง<b>${SIDE_NAME[toAisle]}</b> จนถึงทางเดินหลัก (ทางเดินลายทางระหว่างโซน A กับโซน F)` });
                points.push([AISLE_X, start.y < 50 ? TOP_Y : BOTTOM_Y]);
                heading = toAisle;
            } else {
                points.push([AISLE_X, start.y < 50 ? TOP_Y : BOTTOM_Y]);
            }
            const dir = target.end === 'top' ? 'up' : 'down';
            const turn = heading ? `${turnWord(heading, dir)} ` : '';
            steps.push({
                icon: dir === 'up' ? 'fa-arrow-up' : 'fa-arrow-down',
                text: `${turn}เดินตามทางเดินหลักไปทาง<b>${END_NAME[target.end]}</b> (โซน A กับโซน F อยู่สองข้างทาง) จนสุดทาง`
            });
            heading = dir;
            curX = AISLE_X;
            points.push([AISLE_X, endY]);
        } else {
            points.push([start.x, endY]);
        }

        // 2) เดินเลียบทางเดินขวางไปหาแถว/ล็อกปลายทาง
        const dx = target.x - curX;
        const sideways = dx > 0 ? 'right' : 'left';
        // สิ่งที่เจอระหว่างทางเรียงตามลำดับเดินจริง: โซนที่เดินผ่าน + จุดข้ามทางเดินหลัก
        const crossAisle = (curX < 37.5 && target.x > 49.5) || (curX > 49.5 && target.x < 37.5);
        const events = zonesBetween(curX, target.x, endY)
            .filter((z) => z !== target.zone)
            .map((z) => ({ at: ZONE_GEO[z].x + ZONE_GEO[z].w / 2, text: `โซน ${z}` }));
        if (crossAisle) events.push({ at: AISLE_X, text: 'ทางเดินหลัก', aisle: true });
        events.sort((a, b) => Math.abs(a.at - curX) - Math.abs(b.at - curX));
        // โซนที่อยู่แนวเดียวกัน (เช่น F อยู่ใต้ D) เดินผ่านพร้อมกัน รวมเป็นข้อเดียว
        for (let i = events.length - 1; i > 0; i -= 1) {
            if (!events[i].aisle && !events[i - 1].aisle && Math.abs(events[i].at - events[i - 1].at) < 1) {
                events[i - 1].text += ` กับ${events[i].text}`;
                events.splice(i, 1);
            }
        }
        const passText = events.map((e) => (e.aisle ? 'ข้ามทางเดินหลัก' : `ผ่าน${e.text}`)).join(' → ');
        const walkway = target.end === 'top' ? 'ทางเดินขวางหัวโซน (ระหว่างแถวบนกับโซนกลาง)' : 'ทางเดินขวางท้ายโซน (ระหว่างโซนกลางกับโซน C)';
        const turnSide = heading ? `${turnWord(heading, sideways)} ` : '';

        if (target.geo.vertical) {
            // นับแถวที่จะเลี้ยวเข้า นับจากฝั่งที่เดินเข้ามา
            const nth = sideways === 'right' ? target.colIndex + 1 : target.colCount - target.colIndex;
            const enteringSameZone = start.zone === target.zone;
            if (Math.abs(dx) > 1) {
                steps.push({
                    icon: sideways === 'right' ? 'fa-arrow-right' : 'fa-arrow-left',
                    text: `${turnSide}เดินเลียบ${walkway} ไปทาง<b>${SIDE_NAME[sideways]}</b>${passText ? ` ${passText}` : ''} จนถึง<b>แถว ${target.column}</b> ของโซน ${target.zone}${enteringSameZone ? '' : ` (เป็นแถวที่ ${nth} ของโซนนี้ที่เดินผ่าน)`}`
                });
                heading = sideways;
            }
            points.push([target.x, endY]);
            const into = target.end === 'top' ? 'down' : 'up';
            steps.push({
                icon: into === 'down' ? 'fa-arrow-down' : 'fa-arrow-up',
                text: `${heading ? `${turnWord(heading, into)} ` : ''}เข้าแถว ${target.column} เดินไปทาง${END_NAME[target.end === 'top' ? 'bottom' : 'top']} ร้านอยู่<b>ล็อกที่ ${target.countFromEnd}</b> นับจาก${target.end === 'top' ? 'หัว' : 'ท้าย'}แถว`
            });
        } else {
            const nth = sideways === 'right' ? target.index + 1 : target.count - target.index;
            steps.push({
                icon: sideways === 'right' ? 'fa-arrow-right' : 'fa-arrow-left',
                text: `${turnSide}เดินเลียบ${walkway} ไปทาง<b>${SIDE_NAME[sideways]}</b>${passText ? ` ${passText}` : ''} ถึงโซน ${target.zone} (อยู่ฝั่ง${target.end === 'top' ? 'ถนน' : 'ทางเข้า-ออก'}ของทางเดิน) ร้านอยู่<b>ล็อกที่ ${nth}</b> ของโซนที่เดินผ่าน`
            });
            points.push([target.x, endY]);
        }
        points.push([target.x, target.y]);

        steps.push({ icon: 'fa-flag-checkered', text: `ถึงแล้ว: <b>แผง ${escapeHtml(code)}</b> ${escapeHtml(d.shop || '')}`, final: true });
        return { steps, points, target, start };
    }

    // ---------- ผังย่อ (แตะเลือกจุดเริ่ม + วาดเส้นทาง) ----------
    function miniMapHtml() {
        const zones = Object.keys(ZONE_GEO).filter((z) => ZONES_DATA[z]).map((z) => {
            const g = ZONE_GEO[z];
            return `<button type="button" class="nm-zone" data-start="${z}" style="left:${g.x}%;top:${g.y}%;width:${g.w}%;height:${g.h}%;--zc:var(--zone-${z}-bg,#eee);--zt:var(--zone-${z}-cl,#333)">${z}</button>`;
        }).join('');
        const marks = Object.keys(LANDMARKS).map((k) => {
            const l = LANDMARKS[k];
            return `<button type="button" class="nm-mark nm-mark-${k}" data-start="${k}" style="left:${l.x}%;top:${l.y}%">${l.label}</button>`;
        }).join('');
        return `
            <div class="nm-map" id="navMiniMap">
                <div class="nm-aisle" style="left:37.5%;top:8%;width:12%;height:89%"></div>
                <span class="nm-side nm-side-left">${SIDE_NAME.left.replace('ฝั่ง', '')}</span>
                <span class="nm-side nm-side-right">${SIDE_NAME.right.replace('ฝั่ง', '')}</span>
                ${zones}${marks}
                <svg class="nm-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline id="navRouteLine" points=""/></svg>
                <span class="nm-pin nm-pin-start" id="navPinStart" hidden></span>
                <span class="nm-pin nm-pin-target" id="navPinTarget" hidden></span>
            </div>`;
    }

    let navCode = null;

    function renderRoute(startKey) {
        const route = buildRoute(startKey, navCode);
        const stepsEl = document.getElementById('navSteps');
        const hint = document.getElementById('navHint');
        document.querySelectorAll('#navMiniMap [data-start]').forEach((b) => b.classList.toggle('active', b.dataset.start === startKey));
        if (!route) {
            stepsEl.innerHTML = '<li class="nav-step">ยังนำทางไปล็อกนี้ไม่ได้</li>';
            return;
        }
        try { sessionStorage.setItem(START_KEY, startKey); } catch (e) { /* ข้าม */ }
        hint.innerHTML = `จุดเริ่ม: <b>${route.start.label}</b> · แตะผังย่อเพื่อเปลี่ยน`;
        stepsEl.innerHTML = route.steps.map((st, i) => `
            <li class="nav-step${st.final ? ' nav-step-final' : ''}">
                <span class="ns-num">${st.final ? '<i class="fa-solid fa-flag-checkered"></i>' : i + 1}</span>
                <i class="fa-solid ${st.icon} ns-icon" aria-hidden="true"></i>
                <span class="ns-text">${st.text}</span>
            </li>`).join('');
        document.getElementById('navRouteLine').setAttribute('points', route.points.map((p) => p.join(',')).join(' '));
        const place = (el, [x, y]) => { el.style.left = `${x}%`; el.style.top = `${y}%`; el.hidden = false; };
        place(document.getElementById('navPinStart'), route.points[0]);
        place(document.getElementById('navPinTarget'), route.points[route.points.length - 1]);
        document.getElementById('navGo').hidden = false;
    }

    function openNavigator(code) {
        if (!locateStall(code)) return;
        navCode = code;
        const d = BOOKING_BY_STALL[code] || {};
        const viewer = document.getElementById('navViewer');
        document.getElementById('navStall').textContent = code;
        document.getElementById('navTitle').textContent = d.shop || `แผง ${code}`;
        document.getElementById('navMapWrap').innerHTML = miniMapHtml();
        document.getElementById('navSteps').innerHTML = '';
        document.getElementById('navGo').hidden = true;
        document.getElementById('navHint').innerHTML = '<b>คุณอยู่ตรงไหน?</b> แตะโซนที่ยืนอยู่ หรือจุดสังเกตใกล้ตัว';
        document.querySelectorAll('#navMiniMap [data-start]').forEach((b) => b.addEventListener('click', () => renderRoute(b.dataset.start)));

        viewer.hidden = false;
        document.body.classList.add('mv-open');
        viewer.querySelector('.mv-close').focus();

        let saved = null;
        try { saved = sessionStorage.getItem(START_KEY); } catch (e) { saved = null; }
        if (saved && startPoint(saved)) renderRoute(saved);
    }

    function closeNavigator() {
        document.getElementById('navViewer').hidden = true;
        document.body.classList.remove('mv-open');
    }

    (function setup() {
        const viewer = document.getElementById('navViewer');
        if (!viewer) return;
        viewer.querySelectorAll('[data-nav-close]').forEach((el) => el.addEventListener('click', closeNavigator));
        document.addEventListener('keydown', (e) => { if (!viewer.hidden && e.key === 'Escape') closeNavigator(); });
        document.getElementById('navGo').addEventListener('click', () => {
            const code = navCode;
            closeNavigator();
            hideInfo();
            openStallDeepLink(code, false);
        });
    })();

    window.openNavigator = openNavigator;
    window.canNavigateTo = (code) => !!locateStall(code);
    window.buildNavRoute = buildRoute;
}());
