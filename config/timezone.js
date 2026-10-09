// บังคับเขตเวลาเป็นเวลาไทยทั้งโปรเซส — ตรรกะวันขาย/รอบจอง/เส้นตายต่อล็อก 20:00/กำหนดชำระ 6 ชม.
// (utils/bookingRound.js, utils/stallRenewal.js, utils/shopOpenStatus.js ฯลฯ) ใช้เวลาของเครื่อง server ตรงๆ
// ถ้าโฮสต์เป็น UTC ทุกเส้นตายจะคลาดไป 7 ชม. ตลาดอยู่ไทยที่เดียว จึงตั้งในโค้ดเลย ไม่พึ่งค่าบนโฮสต์
// ต้อง require ก่อนโค้ดอื่นที่สร้าง Date (บรรทัดแรกของ app.js และ utils/bookingRound.js สำหรับสคริปต์ที่รันแยก)
process.env.TZ = 'Asia/Bangkok';
