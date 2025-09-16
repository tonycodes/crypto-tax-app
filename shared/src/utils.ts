import { ChainType } from './types';

/**
 * Validates email format using a simple regex
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Formats currency amounts with proper locale formatting
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  decimals: number = 2
): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return formatter.format(amount);
}

/**
 * Formats token amounts from string representation with decimals
 */
export function formatTokenAmount(
  amount: string,
  decimals: number,
  symbol: string,
  displayDecimals?: number
): string {
  const raw = BigInt(amount || '0');
  const precision = displayDecimals ?? decimals;
  const divisor = 10n ** BigInt(decimals);
  const scaleFactor = 10n ** BigInt(precision);

  if (precision === 0) {
    const rounded = (raw + divisor / 2n) / divisor;
    return `${rounded.toString()} ${symbol}`;
  }

  const rounded = (raw * scaleFactor + divisor / 2n) / divisor;
  const whole = rounded / scaleFactor;
  const fraction = rounded % scaleFactor;
  const fractionStr = fraction.toString().padStart(precision, '0');

  return `${whole.toString()}.${fractionStr} ${symbol}`;
}

/**
 * Validates wallet address format for different chains
 */
export function isValidWalletAddress(address: string, chain: ChainType): boolean {
  switch (chain) {
    case 'ethereum':
      // Ethereum addresses: 0x followed by 40 hex characters
      return /^0x[a-fA-F0-9]{40}$/.test(address);

    case 'solana':
      // Solana addresses: Base58 encoded, 32-44 characters
      // Simple validation - in production would use proper Base58 validation
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);

    case 'bitcoin': {
      const legacyRegex = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
      const bech32Regex = /^bc1[a-z0-9]{39,59}$/;
      return legacyRegex.test(address) || bech32Regex.test(address);
    }

    case 'sui':
      // Sui addresses: 0x followed by 64 hex characters
      return /^0x[a-fA-F0-9]{64}$/.test(address);

    default:
      return false;
  }
}

/**
 * Calculates tax year based on jurisdiction
 */
export function calculateTaxYear(date: Date, jurisdiction: string = 'US'): number {
  const year = date.getFullYear();

  switch (jurisdiction.toUpperCase()) {
    case 'UK': {
      const ukTaxYearStart = new Date(year, 3, 6);
      return date >= ukTaxYearStart ? year : year - 1;
    }

    case 'AU': {
      const auTaxYearStart = new Date(year, 6, 1);
      return date >= auTaxYearStart ? year : year - 1;
    }

    case 'US':
    default:
      // US tax year is same as calendar year
      return year;
  }
}

/**
 * Formats dates in various formats
 */
export function formatDate(date: Date, format: 'iso' | 'us' | 'readable' = 'iso'): string {
  switch (format) {
    case 'iso': {
      const [isoDate] = date.toISOString().split('T');
      return isoDate ?? '';
    }

    case 'us':
      return date.toLocaleDateString('en-US');

    case 'readable':
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

    default: {
      const [defaultDate] = date.toISOString().split('T');
      return defaultDate ?? '';
    }
  }
}

/**
 * Sanitizes strings to prevent XSS and other attacks
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, ''); // Remove dangerous characters
}

/**
 * Converts blockchain native units to decimal representation
 */
export function fromWei(amount: string, decimals: number): string {
  const factor = Math.pow(10, decimals);
  const num = BigInt(amount);
  const wholePart = num / BigInt(factor);
  const fractionalPart = num % BigInt(factor);

  if (fractionalPart === 0n) {
    return wholePart.toString();
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  return `${wholePart}.${fractionalStr}`.replace(/\.?0+$/, '');
}

/**
 * Converts decimal representation to blockchain native units
 */
export function toWei(amount: string, decimals: number): string {
  const [wholePart, fractionalPart = ''] = amount.split('.');
  const factor = Math.pow(10, decimals);

  const whole = BigInt(wholePart || '0');
  const fractional = BigInt(fractionalPart.padEnd(decimals, '0').slice(0, decimals));

  return (whole * BigInt(factor) + fractional).toString();
}

/**
 * Generates a unique ID using timestamp and random string
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * Delays execution for specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delayMs = baseDelay * Math.pow(2, attempt);
      await delay(delayMs);
    }
  }

  throw lastError ?? new Error('Unknown error');
}
