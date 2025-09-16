import { createHmac, randomBytes } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_DIGITS = 6;

function bufferToBase32(buffer: Buffer): string {
  let bits = '';
  buffer.forEach(byte => {
    bits += byte.toString(2).padStart(8, '0');
  });

  let base32 = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5);
    const value = parseInt(chunk.padEnd(5, '0'), 2);
    base32 += BASE32_ALPHABET.charAt(value);
  }

  const padding = base32.length % 8;
  return padding === 0 ? base32 : base32 + '='.repeat(8 - padding);
}

function base32ToBuffer(secret: string): Buffer {
  const normalized = secret.replace(/=+$/g, '').toUpperCase();
  let bits = '';

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base32 character');
    }
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    const byte = bits.slice(i, i + 8);
    bytes.push(parseInt(byte, 2));
  }

  return Buffer.from(bytes);
}

function generateCounterBuffer(counter: number): Buffer {
  const buffer = Buffer.alloc(8);
  const bigCounter = BigInt(counter);
  buffer.writeBigUInt64BE(bigCounter, 0);
  return buffer;
}

export function generateTotpSecret(length = 20): string {
  return bufferToBase32(randomBytes(length));
}

export function generateTotp(
  secret: string,
  timestamp: number = Date.now(),
  stepSeconds: number = DEFAULT_STEP_SECONDS,
  digits: number = DEFAULT_DIGITS
): string {
  const counter = Math.floor(Math.floor(timestamp / 1000) / stepSeconds);
  const key = base32ToBuffer(secret);
  const counterBuffer = generateCounterBuffer(counter);

  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const lastByte = hmac[hmac.length - 1];
  if (lastByte === undefined) {
    throw new Error('Invalid HMAC digest length');
  }

  const offset = lastByte & 0xf;
  const safeOffset = Math.min(Math.max(offset, 0), hmac.length - 4);

  const code = hmac.readUInt32BE(safeOffset) & 0x7fffffff;

  const token = (code % 10 ** digits).toString().padStart(digits, '0');
  return token;
}

export function verifyTotp(
  secret: string,
  token: string,
  options?: {
    window?: number;
    timestamp?: number;
    stepSeconds?: number;
    digits?: number;
  }
): boolean {
  if (!/^[0-9]{6}$/.test(token)) {
    return false;
  }

  const window = options?.window ?? 1;
  const timestamp = options?.timestamp ?? Date.now();
  const stepSeconds = options?.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const digits = options?.digits ?? DEFAULT_DIGITS;

  for (let offset = -window; offset <= window; offset++) {
    const comparisonTime = timestamp + offset * stepSeconds * 1000;
    const candidate = generateTotp(secret, comparisonTime, stepSeconds, digits);
    if (candidate === token) {
      return true;
    }
  }

  return false;
}
