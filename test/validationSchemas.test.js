import { describe, it, expect } from 'vitest';
import {
    updateRoleSchema,
    repairReportSchema,
    repairStatusUpdateSchema,
    announcementSchema,
    bookingStallInputSchema,
    sellerApplicationSchema
} from '../utils/validationSchemas.js';

describe('updateRoleSchema', () => {
    it('accepts a valid userId/role pair', () => {
        const result = updateRoleSchema.safeParse({ userId: '3', newRole: 'staff' });
        expect(result.success).toBe(true);
        expect(result.data).toEqual({ userId: 3, newRole: 'STAFF' });
    });

    it('rejects a role outside the enum', () => {
        const result = updateRoleSchema.safeParse({ userId: '3', newRole: 'SUPERADMIN' });
        expect(result.success).toBe(false);
    });

    it('rejects a non-numeric userId', () => {
        const result = updateRoleSchema.safeParse({ userId: 'abc', newRole: 'ADMIN' });
        expect(result.success).toBe(false);
    });
});

describe('repairReportSchema', () => {
    it('accepts a complete report', () => {
        const result = repairReportSchema.safeParse({
            location: 'โซน A1',
            category: 'ไฟฟ้า',
            description: 'ไฟดับบ่อย'
        });
        expect(result.success).toBe(true);
    });

    it('rejects a missing description', () => {
        const result = repairReportSchema.safeParse({ location: 'โซน A1', category: 'ไฟฟ้า', description: '' });
        expect(result.success).toBe(false);
    });

    it('rejects an oversized description', () => {
        const result = repairReportSchema.safeParse({
            location: 'โซน A1',
            category: 'ไฟฟ้า',
            description: 'x'.repeat(2001)
        });
        expect(result.success).toBe(false);
    });
});

describe('repairStatusUpdateSchema', () => {
    it('accepts a valid id/status pair regardless of case', () => {
        const result = repairStatusUpdateSchema.safeParse({ id: '10', status: 'success' });
        expect(result.success).toBe(true);
        expect(result.data).toEqual({ id: 10, status: 'SUCCESS' });
    });

    it('rejects an unknown status', () => {
        const result = repairStatusUpdateSchema.safeParse({ id: '10', status: 'DONE' });
        expect(result.success).toBe(false);
    });
});

describe('bookingStallInputSchema', () => {
    const baseValidBody = {
        dateStart: '2026-08-01',
        dateEnd: '2026-08-03'
    };

    it('accepts a minimal valid body with optional fields omitted', () => {
        const result = bookingStallInputSchema.safeParse(baseValidBody);
        expect(result.success).toBe(true);
    });

    it('accepts a fully populated valid body', () => {
        const result = bookingStallInputSchema.safeParse({
            ...baseValidBody,
            stallCount: '3',
            smallApplianceCount: '2',
            largeApplianceCount: '1',
            light: 'yes',
            cornerZone: '29',
            storeDetail: 'ขายของกิน'
        });
        expect(result.success).toBe(true);
    });

    it('rejects a stallCount above the sane maximum (prevents mass-row creation)', () => {
        const result = bookingStallInputSchema.safeParse({ ...baseValidBody, stallCount: '100000' });
        expect(result.success).toBe(false);
    });

    it('rejects a stallCount of 0', () => {
        const result = bookingStallInputSchema.safeParse({ ...baseValidBody, stallCount: '0' });
        expect(result.success).toBe(false);
    });

    it('rejects a negative appliance count', () => {
        const result = bookingStallInputSchema.safeParse({ ...baseValidBody, smallApplianceCount: '-1' });
        expect(result.success).toBe(false);
    });

    it('rejects an appliance count above the sane maximum', () => {
        const result = bookingStallInputSchema.safeParse({ ...baseValidBody, largeApplianceCount: '9999' });
        expect(result.success).toBe(false);
    });

    it('rejects a non-scalar (array/object) field from qs nested parsing', () => {
        const result = bookingStallInputSchema.safeParse({ ...baseValidBody, light: ['yes', 'no'] });
        expect(result.success).toBe(false);
    });

    it('rejects a missing dateStart', () => {
        const result = bookingStallInputSchema.safeParse({ dateEnd: '2026-08-03' });
        expect(result.success).toBe(false);
    });
});

describe('announcementSchema', () => {
    it('accepts a valid announcement', () => {
        const result = announcementSchema.safeParse({ title: 'ประกาศ', content: 'เนื้อหา', category: 'ทั่วไป' });
        expect(result.success).toBe(true);
    });

    it('rejects an empty title', () => {
        const result = announcementSchema.safeParse({ title: '', content: 'เนื้อหา' });
        expect(result.success).toBe(false);
    });
});

describe('sellerApplicationSchema', () => {
    it('accepts the required seller application details', () => {
        const result = sellerApplicationSchema.safeParse({
            shopName: 'ร้านส้มตำป้าแดง',
            sellerName: 'สมชาย ใจดี',
            idCardNumber: '1234567890123',
            phoneNumber: '0812345678',
            bankName: 'ธนาคารกสิกรไทย',
            bankAccountNumber: '1234567890',
            bankAccountName: 'สมชาย ใจดี',
            houseNumber: '123/45',
            subdistrict: 'เมืองเก่า',
            district: 'บางเขน',
            province: 'กรุงเทพมหานคร',
            productType: 'FOOD',
            productDetail: 'ขายส้มตำและอาหารจานเดียว',
            termsAccepted: 'true'
        });

        expect(result.success).toBe(true);
    });

    it('rejects when terms are not accepted', () => {
        const result = sellerApplicationSchema.safeParse({
            shopName: 'ร้านส้มตำป้าแดง',
            sellerName: 'สมชาย ใจดี',
            idCardNumber: '1234567890123',
            phoneNumber: '0812345678',
            bankName: 'ธนาคารกสิกรไทย',
            bankAccountNumber: '1234567890',
            bankAccountName: 'สมชาย ใจดี',
            houseNumber: '123/45',
            subdistrict: 'เมืองเก่า',
            district: 'บางเขน',
            province: 'กรุงเทพมหานคร',
            productType: 'FOOD',
            productDetail: 'ขายส้มตำและอาหารจานเดียว'
        });

        expect(result.success).toBe(false);
    });

    it('rejects invalid Thai ID or phone number', () => {
        const result = sellerApplicationSchema.safeParse({
            shopName: 'ร้านส้มตำป้าแดง',
            sellerName: 'สมชาย ใจดี',
            idCardNumber: '123',
            phoneNumber: 'abc',
            bankAccountNumber: '1234567890',
            bankAccountName: 'สมชาย ใจดี',
            houseNumber: '123/45',
            subdistrict: 'เมืองเก่า',
            district: 'บางเขน',
            province: 'กรุงเทพมหานคร'
        });

        expect(result.success).toBe(false);
    });
});
