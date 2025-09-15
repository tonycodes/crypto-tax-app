import {
  validateEmail,
  formatCurrency,
  formatTokenAmount,
  isValidWalletAddress,
  calculateTaxYear,
  formatDate,
  sanitizeString,
} from './utils';

describe('Utility Functions', () => {
  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name+tag@domain.co.uk')).toBe(true);
      expect(validateEmail('test123@test-domain.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('formatCurrency', () => {
    it('should format USD amounts correctly', () => {
      expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
      expect(formatCurrency(0, 'USD')).toBe('$0.00');
      expect(formatCurrency(1000000.99, 'USD')).toBe('$1,000,000.99');
    });

    it('should handle negative amounts', () => {
      expect(formatCurrency(-1234.56, 'USD')).toBe('-$1,234.56');
    });

    it('should format with specified decimal places', () => {
      expect(formatCurrency(1234.56789, 'USD', 4)).toBe('$1,234.5679');
      expect(formatCurrency(1234.56, 'USD', 0)).toBe('$1,235');
    });
  });

  describe('formatTokenAmount', () => {
    it('should format token amounts with appropriate precision', () => {
      expect(formatTokenAmount('1000000000', 9, 'SOL')).toBe('1.000000000 SOL');
      expect(formatTokenAmount('1000000000000000000', 18, 'ETH')).toBe('1.000000000000000000 ETH');
      expect(formatTokenAmount('100000000', 8, 'BTC')).toBe('1.00000000 BTC');
    });

    it('should handle zero amounts', () => {
      expect(formatTokenAmount('0', 18, 'ETH')).toBe('0.000000000000000000 ETH');
    });

    it('should truncate excessive precision for display', () => {
      expect(formatTokenAmount('1234567890123456789', 18, 'ETH', 6)).toBe('1.234568 ETH');
    });
  });

  describe('isValidWalletAddress', () => {
    it('should validate Solana addresses', () => {
      expect(isValidWalletAddress('So11111111111111111111111111111111111111112', 'solana')).toBe(true);
      expect(isValidWalletAddress('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', 'solana')).toBe(true);
    });

    it('should validate Ethereum addresses', () => {
      expect(isValidWalletAddress('0x742d35Cc6634C0532925a3b8D82C5b6f47741c52', 'ethereum')).toBe(true);
      expect(isValidWalletAddress('0x0000000000000000000000000000000000000000', 'ethereum')).toBe(true);
    });

    it('should validate Bitcoin addresses', () => {
      expect(isValidWalletAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'bitcoin')).toBe(true);
      expect(isValidWalletAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'bitcoin')).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(isValidWalletAddress('invalid-address', 'solana')).toBe(false);
      expect(isValidWalletAddress('0xinvalid', 'ethereum')).toBe(false);
      expect(isValidWalletAddress('invalid-btc', 'bitcoin')).toBe(false);
    });

    it('should reject mismatched chain and address format', () => {
      expect(isValidWalletAddress('0x742d35Cc6634C0532925a3b8D82C5b6f47741c52', 'solana')).toBe(false);
      expect(isValidWalletAddress('So11111111111111111111111111111111111111112', 'ethereum')).toBe(false);
    });
  });

  describe('calculateTaxYear', () => {
    it('should return correct tax year for US (same as calendar year)', () => {
      expect(calculateTaxYear(new Date('2024-06-15'), 'US')).toBe(2024);
      expect(calculateTaxYear(new Date('2024-01-01'), 'US')).toBe(2024);
      expect(calculateTaxYear(new Date('2024-12-31'), 'US')).toBe(2024);
    });

    it('should return correct tax year for UK (April 6 - April 5)', () => {
      expect(calculateTaxYear(new Date('2024-04-05'), 'UK')).toBe(2023); // Before tax year start
      expect(calculateTaxYear(new Date('2024-04-06'), 'UK')).toBe(2024); // Tax year start
      expect(calculateTaxYear(new Date('2024-12-31'), 'UK')).toBe(2024);
      expect(calculateTaxYear(new Date('2025-04-05'), 'UK')).toBe(2024); // Still 2024 tax year
    });

    it('should default to US tax year calculation', () => {
      expect(calculateTaxYear(new Date('2024-06-15'))).toBe(2024);
    });
  });

  describe('formatDate', () => {
    it('should format dates in ISO format', () => {
      const date = new Date('2024-06-15T10:30:00Z');
      expect(formatDate(date, 'iso')).toBe('2024-06-15');
    });

    it('should format dates in US format', () => {
      const date = new Date('2024-06-15T10:30:00Z');
      expect(formatDate(date, 'us')).toBe('6/15/2024');
    });

    it('should format dates with custom format', () => {
      const date = new Date('2024-06-15T10:30:00Z');
      expect(formatDate(date, 'readable')).toBe('June 15, 2024');
    });
  });

  describe('sanitizeString', () => {
    it('should remove dangerous characters', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('alert(xss)');
      expect(sanitizeString('SELECT * FROM users;')).toBe('SELECT * FROM users;');
    });

    it('should preserve safe characters', () => {
      expect(sanitizeString('Hello World 123!')).toBe('Hello World 123!');
      expect(sanitizeString('user@example.com')).toBe('user@example.com');
    });

    it('should handle empty strings', () => {
      expect(sanitizeString('')).toBe('');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  hello world  ')).toBe('hello world');
    });
  });
});