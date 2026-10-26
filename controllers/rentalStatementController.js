const rentalStatement = require('../utils/rentalStatement');
const { COMPANY_INFO } = require('./quotationController');

// รายงานการเช่า/ชำระเงินฝั่งแอดมิน/staff — อ่านอย่างเดียว (ภาพรวมทุกร้าน / ต่อร้าน / ต่อล็อก)
// ตัวคำนวณอยู่ใน utils/rentalStatement.js ใช้ชุดเดียวกับหน้า /rental-statement ของร้านค้า ยอดจึงตรงกันเสมอ

function printedAtText() {
    return new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

function sendCsv(res, filename, csv) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
}

exports.getOverviewPage = async (req, res) => {
    try {
        const range = rentalStatement.parseStatementRange(req.query);
        const market = await rentalStatement.buildMarketStatement(range);
        const q = String(req.query.q || '').trim();
        const keyword = q.toLowerCase();
        const sellers = keyword
            ? market.sellers.filter((s) => `${s.name} ${s.shopName} ${s.stallCodes.join(' ')}`.toLowerCase().includes(keyword))
            : market.sellers;

        if (req.query.format === 'csv') {
            const csv = rentalStatement.toCsv(
                ['ผู้เช่า', 'ร้าน', 'ล็อก', 'จำนวนรอบ', 'ล็อก-วัน', 'ชำระแล้ว (รายการ)', 'ยอดชำระแล้ว', 'ค้างชำระ (รายการ)', 'ยอดค้างชำระ'],
                sellers.map((s) => [s.name, s.shopName, s.stallCodes.join(' '), s.rounds, s.stallDays, s.paidCount, s.paid.toFixed(2), s.outstandingCount, s.outstanding.toFixed(2)])
            );
            return sendCsv(res, rentalStatement.csvFilename('rental-overview', range), csv);
        }

        return res.render('admin/rentalStatements', {
            user: req.user,
            range,
            sellers,
            totals: market.totals,
            q,
            queryString: rentalStatement.rangeQueryString(range),
            company: COMPANY_INFO,
            printedAt: printedAtText()
        });
    } catch (error) {
        console.error('rental overview error', error);
        return res.redirect('/admin/dashboard?error=' + encodeURIComponent('โหลดรายงานการชำระเงินไม่สำเร็จ'));
    }
};

exports.getSellerPage = async (req, res) => {
    try {
        const userId = Number.parseInt(req.params.id, 10);
        const range = rentalStatement.parseStatementRange(req.query);
        const statement = Number.isInteger(userId) && userId > 0 ? await rentalStatement.buildSellerStatement(userId, range) : null;
        if (!statement) return res.redirect('/admin/rental-statements');

        if (req.query.format === 'csv') {
            return sendCsv(res, rentalStatement.csvFilename(`rental-statement-user${userId}`, range), rentalStatement.statementRowsToCsv(statement.rows));
        }

        return res.render('admin/rentalStatementSeller', {
            user: req.user,
            statement,
            queryString: rentalStatement.rangeQueryString(range),
            company: COMPANY_INFO,
            printedAt: printedAtText()
        });
    } catch (error) {
        console.error('rental seller statement error', error);
        return res.redirect('/admin/rental-statements');
    }
};

exports.getStallPage = async (req, res) => {
    try {
        const code = String(req.params.code || '').trim().toUpperCase();
        if (!/^[A-Z0-9-]{2,12}$/.test(code)) return res.redirect('/admin/rental-statements');
        const range = rentalStatement.parseStatementRange(req.query);
        const stall = await rentalStatement.buildStallStatement(code, range);

        if (req.query.format === 'csv') {
            return sendCsv(res, rentalStatement.csvFilename(`rental-stall-${code}`, range), rentalStatement.statementRowsToCsv(stall.rows, { withSeller: true }));
        }

        return res.render('admin/rentalStatementStall', {
            user: req.user,
            stall,
            queryString: rentalStatement.rangeQueryString(range),
            company: COMPANY_INFO,
            printedAt: printedAtText()
        });
    } catch (error) {
        console.error('rental stall statement error', error);
        return res.redirect('/admin/rental-statements');
    }
};
