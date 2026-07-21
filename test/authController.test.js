import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema } from '../controllers/authController.js';

describe('loginSchema', () => {
    it('accepts a valid username/password pair', () => {
        const result = loginSchema.safeParse({ username: 'som', password: 'secret1' });
        expect(result.success).toBe(true);
    });

    it('rejects an empty username', () => {
        const result = loginSchema.safeParse({ username: '', password: 'secret1' });
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toBe('กรุณากรอก username และ password ให้ครบ');
    });

    it('rejects a missing password', () => {
        const result = loginSchema.safeParse({ username: 'som' });
        expect(result.success).toBe(false);
    });
});

describe('registerSchema', () => {
    const validPayload = {
        username: 'newseller',
        password: 'password123',
        name: 'Som Chai',
        email: 'somchai@example.com'
    };

    it('accepts a minimal valid payload', () => {
        const result = registerSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
    });

    it('rejects a password shorter than 6 characters', () => {
        const result = registerSchema.safeParse({ ...validPayload, password: '123' });
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toBe('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
    });

    it('rejects an invalid email', () => {
        const result = registerSchema.safeParse({ ...validPayload, email: 'not-an-email' });
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toBe('รูปแบบอีเมลไม่ถูกต้อง');
    });

    it('rejects an invalid birth date', () => {
        const result = registerSchema.safeParse({ ...validPayload, birthDate: 'not-a-date' });
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toBe('วันเกิดไม่ถูกต้อง');
    });
});
