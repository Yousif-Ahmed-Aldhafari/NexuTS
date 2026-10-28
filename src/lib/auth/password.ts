import bcrypt from "bcryptjs";

import crypto from "node:crypto";

export const BCRYPT_SALT_ROUNDS = 12;

/**
 * Regular expression validating standard modular crypt format bcrypt hash:
 * $2a$, $2b$, or $2y$, 2-digit cost parameter, followed by 53 characters from [./0-9A-Za-z]
 */
const BCRYPT_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Checks if a string conforms to the standard bcrypt hash format.
 */
export function isBcryptHash(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string" || value.length !== 60) {
    return false;
  }
  return BCRYPT_REGEX.test(value);
}

/**
 * Hashes a plaintext password using bcrypt with standard work factor (12 rounds).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Constant-time string equality check to mitigate timing attacks on legacy password comparisons.
 */
function safeTimingEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export type PasswordVerificationResult = {
  valid: boolean;
  needsUpgrade: boolean;
};

/**
 * Verifies a candidate password against a stored credential (either bcrypt hash or legacy plaintext).
 *
 * - If the stored credential is a bcrypt hash, verifies using bcrypt.compare.
 * - If the stored credential is a legacy plaintext value, verifies using constant-time comparison
 *   and indicates that an upgrade is required (`needsUpgrade: true`).
 * - Never returns true if the candidate password equals the bcrypt hash string directly.
 */
export async function verifyPassword(
  candidatePassword: string,
  storedCredential: string | null | undefined,
): Promise<PasswordVerificationResult> {
  if (!candidatePassword || !storedCredential) {
    return { valid: false, needsUpgrade: false };
  }

  // 1. If stored credential is a valid bcrypt hash, verify exclusively with bcrypt.compare
  if (isBcryptHash(storedCredential)) {
    try {
      const valid = await bcrypt.compare(candidatePassword, storedCredential);
      return { valid, needsUpgrade: false };
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  // 2. Legacy plaintext password compatibility
  // Use constant-time comparison to prevent timing leakages during legacy checks
  const legacyMatch = safeTimingEqual(candidatePassword, storedCredential);
  if (legacyMatch) {
    return { valid: true, needsUpgrade: true };
  }

  return { valid: false, needsUpgrade: false };
}
