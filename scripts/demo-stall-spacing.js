// สคริปต์จำลอง utils/stallSpacing.js ให้เห็นว่าเช็คระยะห่างล็อกยังไง (ไม่แตะ DB จริง)
// รัน: node scripts/demo-stall-spacing.js
const { findConflicts } = require('../utils/stallSpacing');

// จำลองแถว B6 มี 10 ล็อก B601-B610 เรียงติดกันในแถวเดียวกัน
const zoneColumns = [{
  rowCode: 'B6',
  stalls: Array.from({ length: 10 }, (_, i) => ({ code: 'B60' + (i + 1) }))
}];
console.log('ล็อกในแถวจำลอง:', zoneColumns[0].stalls.map((s) => s.code));

// สมมติ B603 มีร้าน "ไก่ทอด" (อาหาร) จองอยู่แล้ว
const occupantSubtypeByCode = { B603: 'ไก่ทอด' };

console.log('\n=== เคส 1: ขอไก่ทอด อยาก B605 (ห่างจาก B603 = 2 ล็อก, เกณฑ์อาหาร <5 ต้องเตือน) ===');
console.log(findConflicts({
  zoneColumns, candidateCode: 'B605',
  productSubtype: 'ไก่ทอด', productType: 'FOOD',
  occupantSubtypeByCode
}));

console.log('\n=== เคส 2: ขอไก่ทอด อยาก B609 (ห่างจาก B603 = 6 ล็อก, ไม่ควรเตือน) ===');
console.log(findConflicts({
  zoneColumns, candidateCode: 'B609',
  productSubtype: 'ไก่ทอด', productType: 'FOOD',
  occupantSubtypeByCode
}));

console.log('\n=== เคส 3: ขอส้มตำ (คนละ subtype) อยาก B604 (ห่างแค่ 1 ล็อก, ไม่ควรเตือนเพราะคนละของ) ===');
console.log(findConflicts({
  zoneColumns, candidateCode: 'B604',
  productSubtype: 'ส้มตำ', productType: 'FOOD',
  occupantSubtypeByCode
}));
