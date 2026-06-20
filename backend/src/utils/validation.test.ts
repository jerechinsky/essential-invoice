import { describe, it, expect } from 'vitest';
import {
  validateIco,
  validateEmail,
  formatCurrency,
  generateSpayd,
  czechAccountToIban,
  generateInvoiceNumber
} from './validation';

describe('Validation Utilities', () => {
  describe('validateIco', () => {
    it('should validate correct IČO', () => {
      // Real Czech company IČOs that pass checksum
      expect(validateIco('25596641').valid).toBe(true); // Alza.cz
      expect(validateIco('27082440').valid).toBe(true); // O2 Czech Republic
      expect(validateIco('45274649').valid).toBe(true); // ČEZ
    });

    it('should reject IČO with wrong checksum', () => {
      const result = validateIco('12345678');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid IČO checksum');
    });

    it('should reject IČO with wrong length', () => {
      expect(validateIco('1234567').valid).toBe(false);
      expect(validateIco('1234567').error).toBe('IČO must be 8 digits');

      expect(validateIco('123456789').valid).toBe(false);
      expect(validateIco('').valid).toBe(false);
    });

    it('should reject IČO with non-numeric characters', () => {
      expect(validateIco('1234567a').valid).toBe(false);
      expect(validateIco('abcdefgh').valid).toBe(false);
      expect(validateIco('1234 567').valid).toBe(false);
    });

    it('should handle edge cases for checksum calculation', () => {
      // When remainder is 0, last digit should be 1
      // When remainder is 1, last digit should be 0
      expect(validateIco('00000000').valid).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('user.name@example.co.uk')).toBe(true);
      expect(validateEmail('user+tag@example.org')).toBe(true);
      expect(validateEmail('user123@test-domain.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user@.com')).toBe(false);
      expect(validateEmail('user @example.com')).toBe(false);
    });
  });

  describe('formatCurrency', () => {
    it('should format CZK correctly', () => {
      expect(formatCurrency(1000, 'CZK')).toMatch(/1[\s\u00a0]?000,00 Kč/);
      expect(formatCurrency(1234.56, 'CZK')).toMatch(/1[\s\u00a0]?234,56 Kč/);
      expect(formatCurrency(0, 'CZK')).toBe('0,00 Kč');
      expect(formatCurrency(999999.99, 'CZK')).toMatch(/999[\s\u00a0]?999,99 Kč/);
    });

    it('should format EUR correctly', () => {
      expect(formatCurrency(1000, 'EUR')).toMatch(/1[\s\u00a0]?000,00 €/);
      expect(formatCurrency(1234.56, 'EUR')).toMatch(/1[\s\u00a0]?234,56 €/);
      expect(formatCurrency(0, 'EUR')).toBe('0,00 €');
    });

    it('should handle decimal precision', () => {
      expect(formatCurrency(100.1, 'CZK')).toBe('100,10 Kč');
      expect(formatCurrency(100.999, 'CZK')).toBe('101,00 Kč');
    });
  });

  describe('czechAccountToIban', () => {
    it('should convert Czech bank account to valid IBAN', () => {
      // Test known conversions
      const iban = czechAccountToIban('2752089019', '3030');
      expect(iban).toMatch(/^CZ\d{2}3030/);
      expect(iban.length).toBe(24);
    });

    it('should pad account number and bank code correctly', () => {
      const iban = czechAccountToIban('123', '800');
      expect(iban).toMatch(/^CZ\d{2}0800/);
      expect(iban.length).toBe(24);
    });

    it('should produce consistent results', () => {
      const iban1 = czechAccountToIban('2752089019', '3030');
      const iban2 = czechAccountToIban('2752089019', '3030');
      expect(iban1).toBe(iban2);
    });
  });

  describe('generateSpayd', () => {
    it('should generate valid SPAYD string', () => {
      const spayd = generateSpayd('2752089019', '3030', 1000.50, 'CZK', '202601');

      expect(spayd).toContain('SPD*1.0');
      expect(spayd).toContain('ACC:CZ');
      expect(spayd).toContain('AM:1000.50');
      expect(spayd).toContain('CC:CZK');
      expect(spayd).toContain('X-VS:202601');
    });

    it('should include message when provided', () => {
      const spayd = generateSpayd('123456', '0800', 500, 'CZK', '123', 'Test payment');
      expect(spayd).toContain('MSG:Test payment');
    });

    it('should truncate long messages', () => {
      const longMessage = 'A'.repeat(100);
      const spayd = generateSpayd('123456', '0800', 500, 'CZK', '123', longMessage);

      // Message should be truncated to 60 characters
      expect(spayd).toContain('MSG:' + 'A'.repeat(60));
      expect(spayd).not.toContain('A'.repeat(61));
    });

    it('should remove asterisks from message', () => {
      const spayd = generateSpayd('123456', '0800', 500, 'CZK', '123', 'Test*message');
      expect(spayd).toContain('MSG:Testmessage');
    });

    it('should handle EUR currency', () => {
      const spayd = generateSpayd('123456', '0800', 100, 'EUR', '456');
      expect(spayd).toContain('CC:EUR');
    });

    it('should not include message when not provided', () => {
      const spayd = generateSpayd('123456', '0800', 100, 'CZK', '123');
      expect(spayd).not.toContain('MSG:');
    });
  });

  describe('generateInvoiceNumber', () => {
    it('should replace {YYYY} with full year', () => {
      expect(generateInvoiceNumber('INV-{YYYY}-001', 1, 2025)).toBe('INV-2025-001');
    });

    it('should replace {YY} with short year', () => {
      expect(generateInvoiceNumber('{YY}{SEQ3}', 1, 2025)).toBe('25001');
    });

    it('should replace sequence with different padding', () => {
      expect(generateInvoiceNumber('{YYYY}{SEQ}', 5, 2025)).toBe('20255');
      expect(generateInvoiceNumber('{YYYY}{SEQ2}', 5, 2025)).toBe('202505');
      expect(generateInvoiceNumber('{YYYY}{SEQ3}', 5, 2025)).toBe('2025005');
      expect(generateInvoiceNumber('{YYYY}{SEQ4}', 5, 2025)).toBe('20250005');
    });

    it('should handle large sequence numbers', () => {
      expect(generateInvoiceNumber('{YYYY}{SEQ3}', 123, 2025)).toBe('2025123');
      expect(generateInvoiceNumber('{YYYY}{SEQ3}', 1234, 2025)).toBe('20251234');
    });

    it('should support complex formats', () => {
      expect(generateInvoiceNumber('F{YY}-{SEQ4}', 42, 2026)).toBe('F26-0042');
      expect(generateInvoiceNumber('INV/{YYYY}/{SEQ3}', 7, 2025)).toBe('INV/2025/007');
    });

    it('should replace {MM} with zero-padded month', () => {
      expect(generateInvoiceNumber('{YYYY}{MM}{SEQ2}', 3, 2026, 4)).toBe('20260403');
      expect(generateInvoiceNumber('{YYYY}{MM}{SEQ2}', 12, 2026, 12)).toBe('20261212');
    });

    it('should default month to January when not provided', () => {
      expect(generateInvoiceNumber('{YYYY}{MM}{SEQ2}', 1, 2026)).toBe('20260101');
    });
  });
});
