// ไฟล์ปฏิทิน (.ics) สำหรับผู้ขาย — เพิ่มลงปฏิทินมือถือ (iPhone/Android/Google Calendar) ได้ด้วยการแตะครั้งเดียว
// มีเส้นตายต่อล็อก 20:00 ของวันขายสุดท้าย (เตือนก่อน 3 ชม. และก่อน 1 วัน) + วันสำคัญของรอบจองถัดไป
// สร้างจากข้อมูลชุดเดียวกับหน้าหลักผู้ขาย (utils/sellerHome.js) ไม่มีการเรียกบริการภายนอก

function pad(n) { return String(n).padStart(2, '0'); }

// เวลาแบบ UTC สำหรับ DTSTART/DTEND/DTSTAMP
function utcStamp(date) {
    const d = new Date(date);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

// วันที่แบบทั้งวัน (ตามเวลาเครื่อง server = Asia/Bangkok)
function localDate(date) {
    const d = new Date(date);
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function addDaysDate(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

// ข้อความใน .ics ต้อง escape , ; \ และขึ้นบรรทัดใหม่
function esc(text) {
    return String(text || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// บรรทัดยาวเกิน 75 octets ต้องพับ (RFC 5545) — พับตามจำนวนไบต์ UTF-8 ไม่ตัดกลางตัวอักษร
function fold(line) {
    const out = [];
    let current = '';
    let bytes = 0;
    for (const ch of line) {
        const size = Buffer.byteLength(ch);
        if (bytes + size > (out.length ? 74 : 75)) {
            out.push(current);
            current = '';
            bytes = 0;
        }
        current += ch;
        bytes += size;
    }
    out.push(current);
    return out.join('\r\n ');
}

function buildSellerCalendar(home, baseUrl, now = new Date()) {
    const events = [];
    const stamp = utcStamp(now);

    home.stalls
        .filter((s) => s.isCurrent && s.requestStatus === 'SUCCESS' && s.cutoffAt)
        .forEach((s) => {
            const cutoff = new Date(s.cutoffAt);
            events.push([
                'BEGIN:VEVENT',
                `UID:renew-${s.code}-${localDate(cutoff)}@kangsadan-night`,
                `DTSTAMP:${stamp}`,
                `DTSTART:${utcStamp(new Date(cutoff.getTime() - 60 * 60 * 1000))}`,
                `DTEND:${utcStamp(cutoff)}`,
                `SUMMARY:${esc(`ต่อล็อก ${s.code} ก่อน 20:00 (ตลาดกังสดาลไนท์)`)}`,
                `DESCRIPTION:${esc(`วันขายสุดท้ายของล็อก ${s.code} เลย 20:00 น. ล็อกจะถูกเปิดให้คนอื่นจอง\nต่อล็อก: ${baseUrl}/booking-stall/extend`)}`,
                `URL:${baseUrl}/booking-stall/extend`,
                'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`ต่อล็อก ${s.code} ก่อน 20:00 วันนี้`)}`, 'TRIGGER:-PT2H', 'END:VALARM',
                'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`พรุ่งนี้วันขายสุดท้ายของล็อก ${s.code}`)}`, 'TRIGGER:-P1D', 'END:VALARM',
                'END:VEVENT'
            ]);
        });

    const rt = home.roundTimeline;
    const allDay = (key, date, summary, description, url) => events.push([
        'BEGIN:VEVENT',
        `UID:round${rt.next.roundNumber}-${key}@kangsadan-night`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${localDate(date)}`,
        `DTEND;VALUE=DATE:${localDate(addDaysDate(date, 1))}`,
        `SUMMARY:${esc(summary)}`,
        `DESCRIPTION:${esc(description)}`,
        `URL:${url}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, 'TRIGGER:PT9H', 'END:VALARM',
        'END:VEVENT'
    ]);
    if (new Date(rt.next.longOpen) >= addDaysDate(now, -1)) {
        allDay('long', rt.next.longOpen, `เปิดจองยาว 14 วัน รอบที่ ${rt.next.roundNumber}`, 'จองเต็มรอบ 14 วันได้ 2 วัน (จันทร์-อังคาร) ชำระก่อนวันพุธ', `${baseUrl}/select-zone`);
    }
    allDay('daily', rt.next.dailyOpen, `เริ่มจองรายวันได้ รอบที่ ${rt.next.roundNumber}`, 'จองทีละวัน หรือขั้นต่ำ 3 วันติด', `${baseUrl}/select-zone`);
    allDay('sell', rt.next.cycleStart, `เริ่มขายรอบที่ ${rt.next.roundNumber}`, 'วันแรกของรอบขายถัดไป', `${baseUrl}/seller`);

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Kangsadan Night Market//Seller//TH',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${esc(`ตลาดกังสดาลไนท์ · ${home.shop.name}`)}`,
        'X-WR-TIMEZONE:Asia/Bangkok',
        ...events.flat(),
        'END:VCALENDAR'
    ];
    return { text: `${lines.map(fold).join('\r\n')}\r\n`, eventCount: events.length };
}

module.exports = { buildSellerCalendar };
