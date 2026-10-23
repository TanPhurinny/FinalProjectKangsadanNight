import { describe, it, expect } from 'vitest';
import {
    parseApplianceItems,
    summarizeApplianceItems,
    dailyApplianceFee,
    readBookingApplianceItems,
    describeBookingAppliances
} from '../utils/bookingAppliances';

describe('parseApplianceItems', () => {
    it('treats empty input as no appliances', () => {
        expect(parseApplianceItems('')).toEqual({ items: [] });
        expect(parseApplianceItems('[]')).toEqual({ items: [] });
    });

    it('requires a name on every row', () => {
        const result = parseApplianceItems(JSON.stringify([{ name: '  ', kind: 'SMALL', qty: 1 }]));
        expect(result.error).toBeTruthy();
    });

    it('rejects unknown kinds and out-of-range quantities', () => {
        expect(parseApplianceItems(JSON.stringify([{ name: 'หม้อ', kind: 'HUGE', qty: 1 }])).error).toBeTruthy();
        expect(parseApplianceItems(JSON.stringify([{ name: 'หม้อ', kind: 'SMALL', qty: 0 }])).error).toBeTruthy();
        expect(parseApplianceItems(JSON.stringify([{ name: 'หม้อ', kind: 'SMALL', qty: 99 }])).error).toBeTruthy();
    });

    it('rejects malformed JSON', () => {
        expect(parseApplianceItems('{not json').error).toBeTruthy();
        expect(parseApplianceItems('{"name":"x"}').error).toBeTruthy();
    });

    it('reclassifies a "small" appliance above 1200 W as large', () => {
        const { items } = parseApplianceItems(JSON.stringify([{ name: 'กาต้มน้ำ', kind: 'SMALL', qty: 1, watt: 1800 }]));
        expect(items[0].kind).toBe('LARGE');
    });
});

describe('appliance pricing', () => {
    const { items } = parseApplianceItems(JSON.stringify([
        { name: 'หม้อหุงข้าว', kind: 'SMALL', qty: 2 },
        { name: 'หม้อทอด', kind: 'LARGE', qty: 1 },
        { name: 'พัดลม 16 นิ้ว', kind: 'FAN_SMALL', qty: 2 },
        { name: 'พัดลม 24 นิ้ว', kind: 'FAN_LARGE', qty: 1 }
    ]));

    it('counts each kind', () => {
        expect(summarizeApplianceItems(items)).toEqual({
            smallApplianceCount: 2, largeApplianceCount: 1, smallFanCount: 2, largeFanCount: 1
        });
    });

    it('charges fans 20/40 baht and appliances 20/40 baht per day', () => {
        // 2×20 + 1×40 + 2×20 + 1×40 = 160
        expect(dailyApplianceFee(summarizeApplianceItems(items))).toBe(160);
    });

    it('uses the prices stored on an existing booking', () => {
        expect(dailyApplianceFee({ smallFanCount: 1 }, { smallFanPrice: 25 })).toBe(25);
    });
});

describe('reading saved bookings', () => {
    it('falls back to unnamed rows for bookings made before names were collected', () => {
        const items = readBookingApplianceItems({ smallApplianceCount: 1, largeApplianceCount: 0, applianceItems: null });
        expect(items).toEqual([{ name: '', kind: 'SMALL', qty: 1, watt: null }]);
        expect(describeBookingAppliances({ smallApplianceCount: 0, largeApplianceCount: 0 })).toBe('ไม่มี');
    });
});
