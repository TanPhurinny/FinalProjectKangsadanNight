// หน้าแอดมินประกาศชดเชยฝนตก /admin/rain-compensation — กติกาทั้งหมดอยู่ใน utils/rainCompensation.js
const rain = require('../utils/rainCompensation');
const { toDateKey } = require('../utils/stallDayStatus');
const { businessDateOf } = require('../utils/shopOpenStatus');

const PAGE = '/admin/rain-compensation';

function redirectWith(res, key, message) {
    return res.redirect(`${PAGE}?${key}=${encodeURIComponent(message)}`);
}

function toTimeValue(date) {
    const d = new Date(date);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// "21:30" + วันฝนตก → Date — "now" = ประกาศทันที, ว่าง/รูปแบบผิด = 21:30 ของวันนั้น
function parseAnnounceAt(date, raw) {
    if (String(raw || '').trim() === 'now') return new Date();
    const match = /^(\d{2}):(\d{2})$/.exec(String(raw || '').trim());
    if (!match) return rain.defaultAnnounceAt(date);
    const at = new Date(date);
    at.setHours(Math.min(23, Number(match[1])), Math.min(59, Number(match[2])), 0, 0);
    return at;
}

exports.getPage = async (req, res) => {
    try {
        const now = new Date();
        const today = businessDateOf(now);
        const days = await rain.listRainDays();
        const selectableDays = (await rain.listSelectableDays(now)).map((day) => ({ ...day, dateKey: toDateKey(day.date) }));

        // ขั้นดูรายชื่อก่อนประกาศ (?date=YYYY-MM-DD&percent=..)
        let preview = null;
        const previewDate = rain.parseDateKey(req.query.date);
        if (previewDate) {
            const percent = rain.clampPercent(req.query.percent);
            const error = await rain.validateRainDate(previewDate, now);
            preview = {
                dateKey: toDateKey(previewDate),
                date: previewDate,
                percent,
                note: String(req.query.note || '').slice(0, 500),
                announceTime: String(req.query.announceTime || '') || toTimeValue(rain.defaultAnnounceAt(previewDate)),
                error,
                shops: error ? [] : await rain.previewRainDay(previewDate, percent, now)
            };
        }

        const activeTotal = days.reduce((sum, day) => sum + day.credits
            .filter((c) => c.status === 'ACTIVE' && c.expiresAt > now)
            .reduce((s, c) => s + c.amount, 0), 0);
        const usedTotal = days.reduce((sum, day) => sum + day.credits
            .filter((c) => c.status === 'USED')
            .reduce((s, c) => s + c.amount, 0), 0);

        return res.render('admin/rainCompensation', {
            user: req.user,
            days,
            selectableDays,
            preview,
            now,
            todayKey: toDateKey(today),
            limits: { min: rain.MIN_PERCENT, max: rain.MAX_PERCENT, expiryDays: rain.EXPIRY_DAYS, maxActive: rain.MAX_ACTIVE_CREDITS },
            counts: { days: days.length, activeTotal, usedTotal },
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('rainCompensation getPage error:', error);
        return res.status(500).send('ไม่สามารถโหลดหน้าชดเชยฝนตกได้');
    }
};

exports.announce = async (req, res) => {
    try {
        const date = rain.parseDateKey(req.body.date);
        if (!date) return redirectWith(res, 'error', 'กรุณาเลือกวันที่ฝนตก');
        if (req.body.confirmTime !== '1' || req.body.confirmContinuous !== '1') {
            return redirectWith(res, 'error', 'ต้องยืนยันเงื่อนไขทั้ง 2 ข้อก่อนประกาศชดเชย');
        }
        const percent = rain.clampPercent(req.body.percent);

        // ฟอร์มส่ง include_<userId>=1 ของร้านที่ติ๊กไว้ — ทุกร้านได้ % เดียวกันตามที่เลือกตอนแรก
        const selections = {};
        Object.keys(req.body).forEach((key) => {
            const match = /^include_(\d+)$/.exec(key);
            if (match && req.body[key] === '1') selections[Number(match[1])] = { include: true };
        });

        const result = await rain.announceRainDay({
            date,
            percent,
            note: String(req.body.note || '').trim().slice(0, 500),
            announceAt: parseAnnounceAt(date, req.body.announceTime),
            createdBy: req.user?.id || null,
            selections
        });
        if (result.error) return redirectWith(res, 'error', result.error);

        const capped = result.cappedCount ? ` (ไม่ได้รับเพราะสะสมครบ ${rain.MAX_ACTIVE_CREDITS} ครั้ง ${result.cappedCount} ร้าน)` : '';
        return redirectWith(res, 'success', `ประกาศชดเชยฝนตกแล้ว ${result.grantedCount} ร้าน${capped} ผู้ขายจะเห็นตั้งแต่ ${toTimeValue(result.day.announceAt)} น.`);
    } catch (error) {
        console.error('rainCompensation announce error:', error);
        return redirectWith(res, 'error', 'ประกาศชดเชยไม่สำเร็จ กรุณาลองใหม่');
    }
};

exports.revokeCredit = async (req, res) => {
    try {
        const result = await rain.revokeCredit(Number(req.params.id), req.body.reason);
        if (result.error) return redirectWith(res, 'error', result.error);
        return redirectWith(res, 'success', 'เพิกถอนส่วนลดชดเชยแล้ว');
    } catch (error) {
        console.error('rainCompensation revoke error:', error);
        return redirectWith(res, 'error', 'เพิกถอนไม่สำเร็จ');
    }
};

exports.deleteDay = async (req, res) => {
    try {
        const result = await rain.deleteRainDay(Number(req.params.id));
        if (result.error) return redirectWith(res, 'error', result.error);
        return redirectWith(res, 'success', 'ยกเลิกประกาศชดเชยของวันนั้นแล้ว');
    } catch (error) {
        console.error('rainCompensation delete error:', error);
        return redirectWith(res, 'error', 'ยกเลิกประกาศไม่สำเร็จ');
    }
};
