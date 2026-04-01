import { SignalGrid } from './types';

function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

function findSemiprimeFactors(n: number): [number, number] | null {
  for (let p = 2; p * p <= n; p++) {
    if (n % p === 0) {
      const q = n / p;
      if (isPrime(p) && isPrime(q)) return [p, q];
      return null;
    }
  }
  return null;
}

function nextSemiprime(min: number): { value: number; p: number; q: number } {
  for (let n = min; n < min + 5000; n++) {
    const factors = findSemiprimeFactors(n);
    if (factors) return { value: n, p: factors[0], q: factors[1] };
  }
  // Fallback: construct one directly
  const p = 7;
  const q = Math.ceil(min / p);
  return { value: p * q, p, q };
}

export function encodeMessage(message: string): SignalGrid {
  // Strip non-ASCII printable characters
  const sanitized = message.replace(/[^\x20-\x7E]/g, '');

  // Build bit string: 5-bit magic marker + 16-bit length + 7-bit ASCII chars
  const MAGIC = '10101';
  const charBits = sanitized
    .split('')
    .map(c => c.charCodeAt(0).toString(2).padStart(7, '0'))
    .join('');
  const lenBits = sanitized.length.toString(2).padStart(16, '0');
  const payload = MAGIC + lenBits + charBits;

  // Find smallest semiprime >= payload length
  const { value: totalBits, p, q } = nextSemiprime(payload.length);

  // Pad with trailing zeros
  const padded = payload.padEnd(totalBits, '0');

  // Assign portrait-friendly dimensions (larger prime = rows)
  let cols = p;
  let rows = q;
  // Swap if ratio is too extreme (>6:1 height to width)
  if (rows / cols > 6) {
    cols = q;
    rows = p;
  }

  // Pack into Uint8Array
  const bits = new Uint8Array(totalBits);
  for (let i = 0; i < totalBits; i++) {
    bits[i] = padded[i] === '1' ? 1 : 0;
  }

  return { cols, rows, bits };
}
