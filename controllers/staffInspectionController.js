const prisma = require('../config/prismaClient');

function buildRange(prefix, start, end, direction = 'asc') {
    const codes = [];
    if (direction === 'asc') {
        for (let n = start; n <= end; n += 1) {
            codes.push(`${prefix}${n}`);
        }
        return codes;
    }

    for (let n = start; n >= end; n -= 1) {
        codes.push(`${prefix}${n}`);
    }

    return codes;
}

function buildPreferredWalkOrder() {
    const preferred = [
        ...buildRange('B', 604, 601, 'desc'),
        ...buildRange('B', 623, 601, 'desc'),
        ...buildRange('B', 501, 523, 'asc'),
        ...buildRange('B', 423, 401, 'desc'),
        ...buildRange('B', 299, 323, 'asc'),

        ...buildRange('F', 636, 601, 'desc'),
        ...buildRange('F', 501, 536, 'asc'),
        ...buildRange('F', 434, 401, 'desc'),
        ...buildRange('F', 301, 334, 'asc'),
        ...buildRange('F', 217, 201, 'desc'),
        ...buildRange('F', 117, 101, 'desc'),

        ...buildRange('C', 112, 101, 'desc'),

        ...buildRange('A', 923, 901, 'desc'),
        ...buildRange('A', 801, 823, 'asc'),
        ...buildRange('A', 722, 701, 'desc'),
        ...buildRange('A', 601, 622, 'asc'),
        ...buildRange('A', 521, 501, 'desc'),
        ...buildRange('A', 401, 421, 'asc'),
        ...buildRange('A', 319, 301, 'desc'),
        ...buildRange('A', 201, 219, 'asc'),
        ...buildRange('A', 119, 101, 'desc'),

        ...buildRange('E', 101, 104, 'asc'),
        ...buildRange('D', 201, 212, 'asc'),
        ...buildRange('X', 101, 106, 'asc')
    ];

    const seen = new Set();
    return preferred.filter((code) => {
        if (seen.has(code)) return false;
        seen.add(code);
        return true;
    });
}

function parseStallNumber(stallCode) {
    const numeric = Number.parseInt(String(stallCode || '').replace(/^[A-Z]/i, ''), 10);
    return Number.isFinite(numeric) ? numeric : 0;
}

function fallbackSort(a, b) {
    const zoneCompare = String(a.zoneCode || '').localeCompare(String(b.zoneCode || ''));
    if (zoneCompare !== 0) return zoneCompare;
    return parseStallNumber(a.stallCode) - parseStallNumber(b.stallCode);
}

exports.getMarketInspectionPage = async (req, res) => {
    try {
        const stallRows = await prisma.stall.findMany({
            include: {
                row: {
                    include: {
                        zone: {
                            select: {
                                code: true,
                                name: true
                            }
                        }
                    }
                }
            }
        });

        const activeRequests = await prisma.bookingRequest.findMany({
            where: {
                status: { in: ['APPROVED', 'IN_PROGRESS', 'SUCCESS'] },
                assignedStallCode: { not: null }
            },
            select: {
                assignedStallCode: true,
                sellerName: true,
                phone: true,
                productName: true,
                description: true,
                zone: true,
                createdAt: true,
                status: true,
                seller: {
                    select: {
                        shopName: true,
                        productDetail: true,
                        productType: { select: { name: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const missingShopInfoNames = [...new Set(
            activeRequests.filter((request) => !request.seller?.productType?.name).map((request) => request.sellerName).filter(Boolean)
        )];
        const shopInfoByName = {};
        if (missingShopInfoNames.length) {
            const sellerUsers = await prisma.user.findMany({
                where: { role: 'SELLER', name: { in: missingShopInfoNames } },
                select: {
                    name: true,
                    shop: {
                        select: {
                            productType: true,
                            productDetail: true
                        }
                    }
                }
            });
            sellerUsers.forEach((user) => {
                if (user.shop) {
                    shopInfoByName[user.name] = user.shop;
                }
            });
        }

        const bookingByStallCode = {};
        activeRequests.forEach((request) => {
            const stallCode = String(request.assignedStallCode || '').trim().toUpperCase();
            if (!stallCode || bookingByStallCode[stallCode]) return;

            const fallbackShop = shopInfoByName[request.sellerName] || {};
            const productDetail = request.seller?.productDetail || fallbackShop.productDetail || request.description || '-';

            bookingByStallCode[stallCode] = {
                sellerName: request.sellerName || '-',
                sellerPhone: request.phone || '-',
                shopName: request.seller?.shopName || request.productName || '-',
                productDetail,
                bookingStatus: request.status || '-',
                bookingCreatedAt: request.createdAt || null
            };
        });

        const preferredOrder = buildPreferredWalkOrder();
        const preferredIndex = new Map(preferredOrder.map((code, idx) => [code, idx]));

        const stalls = stallRows.map((stall) => {
            const booking = bookingByStallCode[String(stall.stallCode || '').trim().toUpperCase()] || null;
            const zoneCode = stall.row?.zone?.code || '';
            const isBookedByStatus = String(stall.status || '').toUpperCase() === 'BOOKED';
            const isVacant = !booking && !isBookedByStatus;

            return {
                stallCode: stall.stallCode,
                zoneCode,
                zoneName: stall.row?.zone?.name || `Zone ${zoneCode}`,
                rowCode: stall.row?.rowCode || '-',
                stallStatus: stall.status,
                isAvailable: Boolean(stall.isAvailable),
                sellerName: booking?.sellerName || (isVacant ? 'ว่าง' : 'จองอยู่'),
                sellerPhone: booking?.sellerPhone || '-',
                shopName: booking?.shopName || (isVacant ? 'ว่าง' : 'กำลังใช้งาน'),
                productDetail: booking?.productDetail || '-',
                bookingStatus: booking?.bookingStatus || (isVacant ? 'VACANT' : 'BOOKED'),
                bookingStartDate: null,
                bookingEndDate: null,
                isVacant,
                inspectionEnabled: !isVacant,
                preferredIndex: preferredIndex.has(stall.stallCode) ? preferredIndex.get(stall.stallCode) : Number.POSITIVE_INFINITY
            };
        });

        stalls.sort((a, b) => {
            if (a.preferredIndex !== b.preferredIndex) {
                return a.preferredIndex - b.preferredIndex;
            }
            return fallbackSort(a, b);
        });

        const zones = Array.from(new Set(stalls.map((stall) => stall.zoneCode).filter(Boolean)));

        return res.render('staff/marketinspection', {
            user: req.user,
            inspectionRoundLabel: req.query.round || 'งานตรวจตลาดรอบที่ 45',
            inspectionDateLabel: new Date().toLocaleDateString('th-TH', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            }),
            stalls,
            zones,
            selectedZone: String(req.query.zone || 'ALL').toUpperCase(),
            query: String(req.query.q || '').trim()
        });
    } catch (error) {
        console.error('Staff market inspection page error:', error);
        return res.status(500).render('staff/marketinspection', {
            user: req.user,
            inspectionRoundLabel: 'งานตรวจตลาด',
            inspectionDateLabel: '-',
            stalls: [],
            zones: [],
            selectedZone: 'ALL',
            query: '',
            error: 'ไม่สามารถโหลดข้อมูลงานตรวจตลาดได้'
        });
    }
};
