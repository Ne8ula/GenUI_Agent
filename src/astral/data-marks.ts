// Pure formatting for the 'data' look: a value becomes digits or bits exactly, or nothing at all. Never an approximation dressed as data.

/**
 * Tabular numerals with leading zeros: fixed(3.2749, 3, 2, true) is "+003.27". More integer digits than asked for are kept, never
 * cut. Not a finite number: null, so the mark is absent.
 */
export function fixed(value: number, integerDigits: number, decimals: number, signed = false): string | null {
  if (!Number.isFinite(value)) return null;
  const text = Math.abs(value).toFixed(decimals);
  const [whole = '', fraction] = text.split('.');
  const digits = whole.padStart(integerDigits, '0') + (fraction === undefined ? '' : '.' + fraction);
  // "-0.00" would claim a sign the rounded value does not have
  const negative = value < 0 && Number(text) !== 0;
  return signed ? (negative ? '-' : '+') + digits : (negative ? '-' : '') + digits;
}

/** The bits of a non-negative integer, most significant first. Null if it is not one or does not fit: a wrong barcode is worse than none. */
export function bitsOf(value: number, width: number): boolean[] | null {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** width) return null;
  return Array.from({ length: width }, (_, i) => Math.floor(value / 2 ** (width - 1 - i)) % 2 === 1);
}

/** Compass heading of a view direction in degrees, 0..360: 0 looks toward -z (down the tunnel to the room), 90 toward +x. */
export function headingDegrees(x: number, z: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(z) || (x === 0 && z === 0)) return null;
  const degrees = (Math.atan2(x, -z) * 180) / Math.PI;
  return degrees < 0 ? degrees + 360 : degrees;
}
