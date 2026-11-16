// src/utils/phone.ts

/**
 * Converts Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits to ASCII 0-9.
 */
export function toAsciiDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06F0));
}

/**
 * Normalizes an Egyptian phone number into canonical national format (e.g. 01012345678).
 * Returns null if the input is malformed, contains non-phone characters, or is incomplete.
 */
export function normalizeEgyptianPhone(rawPhone: unknown): string | null {
  if (typeof rawPhone !== 'string') return null;
  const trimmed = rawPhone.trim();
  if (!trimmed || trimmed.length > 32) return null;

  const ascii = toAsciiDigits(trimmed);

  // Reject unexpected characters (letters, control chars, SQL/NoSQL syntax, etc.)
  if (!/^[0-9+\-\s().]+$/.test(ascii)) {
    return null;
  }

  const hasPlusPrefix = ascii.startsWith('+');
  const digits = ascii.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }

  let national = digits;

  if (national.startsWith('0020')) {
    national = national.slice(4);
  } else if (hasPlusPrefix && national.startsWith('20')) {
    national = national.slice(2);
  } else if (national.startsWith('20') && national.length >= 12) {
    national = national.slice(2);
  }

  // Handle +20010... or 20010... edge case where leading 0 remained after 20
  if (national.startsWith('01') && national.length === 11) {
    // Already canonical 01xxxxxxxxx
  } else if (national.startsWith('1') && national.length === 10) {
    national = `0${national}`;
  } else if (!national.startsWith('0') && /^[2-9]\d{7,8}$/.test(national)) {
    national = `0${national}`;
  }

  // Strict Egyptian mobile validation (11 digits: 010, 011, 012, 015)
  if (national.startsWith('01')) {
    return /^01[0125]\d{8}$/.test(national) ? national : null;
  }

  // Allow Egyptian landline format if stored on legacy orders (9-10 digits starting with 0[2-9])
  if (/^0[2-9]\d{7,8}$/.test(national)) {
    return national;
  }

  return null;
}

/**
 * Compares two phone numbers using strict canonical equality (no substring matching).
 */
export function phonesMatch(inputPhone: unknown, storedPhone: unknown): boolean {
  const normInput = normalizeEgyptianPhone(inputPhone);
  const normStored = normalizeEgyptianPhone(storedPhone);
  if (!normInput || !normStored) return false;
  return normInput === normStored;
}

/**
 * Extracts only the first name token from a customer's full name.
 */
export function extractFirstName(fullName: unknown): string {
  if (typeof fullName !== 'string') return '';
  const cleaned = fullName.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned.split(' ')[0] || '';
}
