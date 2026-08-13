import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { hashPassword, verifyPassword, isLegacyHash } from '../utils/passwords.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Public shape of a member — never leaks password_hash. */
function publicMember(m) {
  if (!m) return null;
  const { password_hash, ...rest } = m;
  return rest;
}

/**
 * POST /api/auth/signup
 * First-ever member becomes an approved admin. Everyone else lands in
 * pending_requests and must be approved by an admin before they can log in.
 */
router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    if (!name) throw new ApiError(400, 'Name is required');
    if (!EMAIL_RE.test(email)) throw new ApiError(400, 'A valid email is required');
    if (password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters');

    // Is this the very first member? If so, bootstrap them as admin.
    const { count, error: countErr } = await supabase
      .from('members')
      .select('id', { count: 'exact', head: true });
    if (countErr) throw countErr;
    const isFirstEver = (count || 0) === 0;

    // Reject duplicates against both existing members and pending requests.
    const { data: existingMember } = await supabase
      .from('members')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingMember) throw new ApiError(409, 'An account with this email already exists');

    const password_hash = await hashPassword(password);

    if (isFirstEver) {
      const { data, error } = await supabase
        .from('members')
        .insert({ name, email, is_admin: true, password_hash })
        .select('*')
        .single();
      if (error) throw error;
      return res.status(201).json({
        status: 'approved',
        member: publicMember(data),
        token: signToken(data),
      });
    }

    const { data: existingPending } = await supabase
      .from('pending_requests')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingPending) throw new ApiError(409, 'A request with this email is already pending');

    const { error } = await supabase
      .from('pending_requests')
      .insert({ name, email, password_hash });
    if (error) throw error;

    res.status(202).json({
      status: 'pending',
      message: 'Your request has been submitted and is awaiting admin approval.',
    });
  })
);

/**
 * POST /api/auth/login
 * Returns a JWT plus the public member record. Transparently upgrades legacy
 * SHA-256 password hashes to bcrypt on successful login.
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    if (!email || !password) throw new ApiError(400, 'Email and password are required');

    const { data: member, error } = await supabase
      .from('members')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;

    // Distinguish "awaiting approval" from "no such account" for a helpful message.
    if (!member) {
      const { data: pending } = await supabase
        .from('pending_requests')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (pending) throw new ApiError(403, 'Your account is awaiting admin approval');
      throw new ApiError(401, 'Invalid email or password');
    }

    const ok = await verifyPassword(password, member.password_hash);
    if (!ok) throw new ApiError(401, 'Invalid email or password');

    // Opportunistically migrate legacy hashes to bcrypt.
    if (isLegacyHash(member.password_hash)) {
      const upgraded = await hashPassword(password);
      await supabase.from('members').update({ password_hash: upgraded }).eq('id', member.id);
    }

    res.json({ member: publicMember(member), token: signToken(member) });
  })
);

/**
 * GET /api/auth/me — returns the current member from a valid token.
 */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('id', req.user.sub)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'Member not found');
    res.json({ member: publicMember(data) });
  })
);

export default router;
export { publicMember };
