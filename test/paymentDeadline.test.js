import { describe, it, expect } from 'vitest';
import { getPaymentDeadlineFromLockAssignedAt } from '../utils/bookingRound';

const at = (text) => new Date(text);

describe('getPaymentDeadlineFromLockAssignedAt', () => {
    it('gives 6 hours after the lock is assigned when the start date is unknown', () => {
        const deadline = getPaymentDeadlineFromLockAssignedAt(at('2026-10-23T11:00:00'));
        expect(deadline.getTime()).toBe(at('2026-10-23T17:00:00').getTime());
    });

    it('caps a same-day booking at 15:00 of the selling day', () => {
        const deadline = getPaymentDeadlineFromLockAssignedAt(at('2026-10-23T11:00:00'), at('2026-10-23T00:00:00'));
        expect(deadline.getTime()).toBe(at('2026-10-23T15:00:00').getTime());
    });

    it('keeps 6 hours when that already ends before 15:00', () => {
        const deadline = getPaymentDeadlineFromLockAssignedAt(at('2026-10-23T07:00:00'), at('2026-10-23T00:00:00'));
        expect(deadline.getTime()).toBe(at('2026-10-23T13:00:00').getTime());
    });

    it('does not cap bookings that start tomorrow', () => {
        const deadline = getPaymentDeadlineFromLockAssignedAt(at('2026-10-23T20:00:00'), at('2026-10-24T00:00:00'));
        expect(deadline.getTime()).toBe(at('2026-10-24T02:00:00').getTime());
    });

    it('falls back to 6 hours if the lock is assigned after 15:00 on the selling day', () => {
        const deadline = getPaymentDeadlineFromLockAssignedAt(at('2026-10-23T16:00:00'), at('2026-10-23T00:00:00'));
        expect(deadline.getTime()).toBe(at('2026-10-23T22:00:00').getTime());
    });
});
