const { listHolidays, createHolidayRange, deleteHoliday } = require('../utils/bookingHolidays');

exports.getAdminHolidays = async (req, res) => {
    try {
        const holidays = await listHolidays();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const upcomingCount = holidays.filter((h) => new Date(h.date).getTime() >= today.getTime()).length;

        return res.render('admin/bookingHolidays', {
            user: req.user,
            holidays,
            todayTime: today.getTime(),
            counts: {
                total: holidays.length,
                upcoming: upcomingCount,
                past: holidays.length - upcomingCount
            },
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('getAdminHolidays error:', error);
        return res.status(500).send('ไม่สามารถโหลดข้อมูลวันหยุดได้');
    }
};

exports.createHoliday = async (req, res) => {
    try {
        const { dateFrom, dateTo, label } = req.body;
        if (!dateFrom || !String(label || '').trim()) {
            return res.redirect('/admin/booking-holidays?error=' + encodeURIComponent('กรุณากรอกวันที่และชื่อวันหยุดให้ครบถ้วน'));
        }

        const result = await createHolidayRange({
            from: dateFrom,
            to: dateTo || dateFrom,
            label,
            createdBy: req.user?.id || null
        });

        const message = result.skippedCount > 0
            ? `เพิ่มวันหยุดสำเร็จ ${result.createdCount} วัน (ข้ามวันที่มีอยู่แล้ว ${result.skippedCount} วัน)`
            : `เพิ่มวันหยุดสำเร็จ ${result.createdCount} วัน`;
        return res.redirect('/admin/booking-holidays?success=' + encodeURIComponent(message));
    } catch (error) {
        console.error('createHoliday error:', error);
        return res.redirect('/admin/booking-holidays?error=' + encodeURIComponent('เพิ่มวันหยุดไม่สำเร็จ ตรวจสอบวันที่ที่กรอกอีกครั้ง'));
    }
};

exports.deleteHoliday = async (req, res) => {
    try {
        await deleteHoliday(req.params.id);
        return res.redirect('/admin/booking-holidays?success=' + encodeURIComponent('ลบวันหยุดสำเร็จ'));
    } catch (error) {
        console.error('deleteHoliday error:', error);
        return res.redirect('/admin/booking-holidays?error=' + encodeURIComponent('ลบวันหยุดไม่สำเร็จ'));
    }
};
