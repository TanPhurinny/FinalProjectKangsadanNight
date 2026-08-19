const prisma = require('../config/prismaClient');
const { sendSellerApplicationApprovedEmail, sendSellerApplicationRejectedEmail } = require('../config/mailer');

function toThaiDate(value) {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: 'short',
            year: '2-digit'
        });
    } catch (_) {
        return '-';
    }
}

exports.getSellerApplicationsPage = async (req, res) => {
    try {
        const applications = await prisma.sellerApplication.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { name: true, phoneNumber: true, email: true }
                }
            }
        });

        const statusCounts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
        applications.forEach((application) => {
            const statusCode = String(application.status || 'PENDING').toUpperCase();
            if (statusCounts[statusCode] !== undefined) {
                statusCounts[statusCode] += 1;
            }
        });

        const applicationRows = applications.map((application) => {
            const statusCode = String(application.status || 'PENDING').toUpperCase();
            return {
                id: application.id,
                shopName: application.shopName,
                productType: application.productType || '-',
                productDetail: application.productDetail || '-',
                sellerName: application.sellerName || application.user?.name || '-',
                idCardNumber: application.idCardNumber || '-',
                bankAccountNumber: application.bankAccountNumber || '-',
                bankAccountName: application.bankAccountName || '-',
                phoneNumber: application.phoneNumber || application.user?.phoneNumber || '-',
                houseNumber: application.houseNumber || '-',
                subdistrict: application.subdistrict || '-',
                district: application.district || '-',
                province: application.province || '-',
                shopCoverImage: application.shopCoverImage || null,
                applicantName: application.user?.name || '-',
                phoneNumber: application.user?.phoneNumber || '-',
                email: application.user?.email || '-',
                status: statusCode.toLowerCase(),
                statusLabel:
                    statusCode === 'APPROVED'
                        ? 'อนุมัติแล้ว'
                        : statusCode === 'REJECTED'
                            ? 'ปฏิเสธ'
                            : 'รอตรวจสอบ',
                rejectReason: application.rejectReason || '',
                createdAtText: toThaiDate(application.createdAt)
            };
        });

        res.render('admin/sellerApplications', {
            user: req.user,
            applications: applicationRows,
            counts: {
                all: applicationRows.length,
                pending: statusCounts.PENDING,
                approved: statusCounts.APPROVED,
                rejected: statusCounts.REJECTED
            },
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        res.render('admin/dashboard', {
            user: req.user,
            error: 'ไม่สามารถดึงข้อมูลใบสมัครร้านค้าได้'
        });
    }
};

exports.approveSellerApplication = async (req, res) => {
    try {
        const applicationId = Number.parseInt(req.body.applicationId, 10);
        if (!applicationId) {
            return res.redirect('/admin/seller-applications?error=missing_application_id');
        }

        const application = await prisma.sellerApplication.findUnique({
            where: { id: applicationId },
            select: { id: true, userId: true, shopName: true, productType: true, productDetail: true, shopCoverImage: true, status: true }
        });

        if (!application) {
            return res.redirect('/admin/seller-applications?error=application_not_found');
        }

        if (String(application.status || '').toUpperCase() !== 'PENDING') {
            return res.redirect('/admin/seller-applications?error=application_already_reviewed');
        }

        await prisma.$transaction(async (tx) => {
            await tx.sellerApplication.update({
                where: { id: applicationId },
                data: { status: 'APPROVED', reviewedAt: new Date() }
            });

            await tx.shopDetail.upsert({
                where: { userId: application.userId },
                update: {
                    shopName: application.shopName,
                    productType: application.productType,
                    productDetail: application.productDetail,
                    shopCoverImage: application.shopCoverImage,
                    isVerified: true
                },
                create: {
                    userId: application.userId,
                    shopName: application.shopName,
                    productType: application.productType,
                    productDetail: application.productDetail,
                    shopCoverImage: application.shopCoverImage,
                    isVerified: true
                }
            });

            await tx.user.update({
                where: { id: application.userId },
                data: { role: 'SELLER' }
            });
        });

        try {
            const applicantUser = await prisma.user.findUnique({
                where: { id: application.userId },
                select: { email: true }
            });
            if (applicantUser?.email) {
                await sendSellerApplicationApprovedEmail(applicantUser.email);
            }
        } catch (mailErr) {
            console.warn('ส่งอีเมลแจ้งอนุมัติใบสมัครร้านค้าไม่สำเร็จ:', mailErr.message);
        }

        return res.redirect('/admin/seller-applications?success=application_approved');
    } catch (err) {
        return res.redirect('/admin/seller-applications?error=approve_failed');
    }
};

exports.rejectSellerApplication = async (req, res) => {
    try {
        const applicationId = Number.parseInt(req.body.applicationId, 10);
        const reason = String(req.body.reason || '').trim().slice(0, 2000);
        if (!applicationId) {
            return res.redirect('/admin/seller-applications?error=missing_application_id');
        }

        const application = await prisma.sellerApplication.findUnique({
            where: { id: applicationId },
            select: { id: true, userId: true, status: true }
        });

        if (!application) {
            return res.redirect('/admin/seller-applications?error=application_not_found');
        }

        if (String(application.status || '').toUpperCase() !== 'PENDING') {
            return res.redirect('/admin/seller-applications?error=application_already_reviewed');
        }

        await prisma.sellerApplication.update({
            where: { id: applicationId },
            data: { status: 'REJECTED', rejectReason: reason || null, reviewedAt: new Date() }
        });

        try {
            const applicantUser = await prisma.user.findUnique({
                where: { id: application.userId },
                select: { email: true }
            });
            if (applicantUser?.email) {
                await sendSellerApplicationRejectedEmail(applicantUser.email, reason);
            }
        } catch (mailErr) {
            console.warn('ส่งอีเมลแจ้งปฏิเสธใบสมัครร้านค้าไม่สำเร็จ:', mailErr.message);
        }

        return res.redirect('/admin/seller-applications?success=application_rejected');
    } catch (err) {
        return res.redirect('/admin/seller-applications?error=reject_failed');
    }
};
