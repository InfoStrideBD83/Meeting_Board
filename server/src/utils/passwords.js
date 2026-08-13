import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const BCRYPT_ROUNDS = 10;

/** Hash a plaintext password with bcrypt for storage. */
export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** SHA-256 hex — matches the legacy client-side hashing the old frontend used. */
function sha256Hex(plain) {
  return crypto.createHash('sha256').update(plain, 'utf8').digest('hex');
}

/**
 * Verify a plaintext password against a stored hash.
 *
 * Supports two formats so existing Supabase rows keep working:
 *   - bcrypt hashes (start with "$2") — the format we write going forward.
 *   - legacy SHA-256 hex hashes produced by the old localStorage frontend.
 */
export async function verifyPassword(plain, storedHash) {
  if (!storedHash) return false;

  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(plain, storedHash);
  }

  // Legacy SHA-256 hex comparison, constant-time regardless of input length —
  // hashing both sides first to a fixed-size digest avoids the length check
  // that would otherwise short-circuit before timingSafeEqual runs.
  const candidate = sha256Hex(plain);
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(storedHash).digest();
  return crypto.timingSafeEqual(a, b);
}

/** True if a stored hash is in the legacy SHA-256 format (candidate for rehash). */
export function isLegacyHash(storedHash) {
  return Boolean(storedHash) && !storedHash.startsWith('$2');
}
