import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { hashPassword, verifyPassword, isLegacyHash } from '../utils/passwords.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPLOYEE_ID_RE = /^\d{5}$/;

/**
 * Escape ILIKE wildcards so an email is matched literally.
 *
 * Rows created before this backend normalized emails to lowercase are stored
 * with their original casing (e.g. "Rehaan.goel@infostride.com"). Looking them
 * up with `.eq('email', <lowercased>)` would miss those members and lock them
 * out, so authentication lookups match case-insensitively via ILIKE instead.
 */
function emailFilter(email) {
  return email.replace(/([\\%_])/g, '\\$1');
}

// Login/signup are the only unauthenticated, guessable-credential endpoints
// here, so they're the ones worth throttling against brute force / spam.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

/** Public shape of a member — never leaks password_hash. */
function publicMember(m) {
  if (!m) return null;
  const { password_hash, ...rest } = m;
  return rest;
}

/**
 * Serializes signup requests within this process so the "am I the first
 * member ever?" check and the resulting insert happen atomically from the
 * app's point of view. Without this, two signups submitted at the same
 * instant could both read count===0 and both get bootstrapped as admin.
 * (Only holds across a single process — fine at this app's scale, but
 * wouldn't fully close the race if the server were ever run with multiple
 * instances behind a load balancer without a DB-level lock too.)
 */
let signupLock = Promise.resolve();
function withSignupLock(fn) {
  const run = signupLock.then(fn, fn);
  signupLock = run.then(() => {}, () => {});
  return run;
}

/**
 * POST /api/auth/signup
 * First-ever member becomes an approved admin. Everyone else lands in
 * pending_requests and must be approved by an admin before they can log in.
 */
router.post(
  '/signup',
  authLimiter,
  asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const employee_id = (req.body.employee_id || '').trim();

    if (!name) throw new ApiError(400, 'Name is required');
    if (!EMPLOYEE_ID_RE.test(employee_id)) throw new ApiError(400, 'Employee ID must be exactly 5 digits');
    if (!EMAIL_RE.test(email)) throw new ApiError(400, 'A valid email is required');
    if (password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters');

    const password_hash = await hashPassword(password);

    const result = await withSignupLock(async () => {
      // Is this the very first member? If so, bootstrap them as admin.
      // Locked together with the insert below so two concurrent signups
      // can't both read count===0 and both become admin.
      const { count, error: countErr } = await supabase
        .from('members')
        .select('id', { count: 'exact', head: true });
      if (countErr) throw countErr;
      const isFirstEver = (count || 0) === 0;

      // Reject duplicates against members, and against any *pending*
      // request — a previously declined request shouldn't block a retry.
      const { data: existingMember } = await supabase
        .from('members')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (existingMember) throw new ApiError(409, 'An account with this email already exists');

      const { data: existingEmpId } = await supabase
        .from('members')
        .select('id')
        .eq('employee_id', employee_id)
        .maybeSingle();
      if (existingEmpId) throw new ApiError(409, 'An account with this Employee ID already exists');

      if (isFirstEver) {
        const { data, error } = await supabase
          .from('members')
          .insert({ name, email, employee_id, is_admin: true, password_hash })
          .select('*')
          .single();
        if (error) throw error;
        return { status: 'approved', member: data };
      }

      const { data: existingPending } = await supabase
        .from('pending_requests')
        .select('id')
        .eq('email', email)
        .eq('status', 'pending')
        .maybeSingle();
      if (existingPending) throw new ApiError(409, 'A request with this email is already pending');

      const { data: pending, error } = await supabase
        .from('pending_requests')
        .insert({ name, email, employee_id, password_hash, status: 'pending' })
        .select('id')
        .single();
      if (error) throw error;
      return { status: 'pending', pendingId: pending.id };
    });

    if (result.status === 'approved') {
      return res.status(201).json({
        status: 'approved',
        member: publicMember(result.member),
        token: signToken(result.member),
      });
    }

    res.status(202).json({
      status: 'pending',
      pendingId: result.pendingId,
      message: 'Your request has been submitted and is awaiting admin approval.',
    });
  })
);

/**
 * GET /api/auth/signup-status/:pendingId
 * Public (no auth — a pending signup has no token yet) status check, used by
 * the signup page to poll while it waits for an admin decision. Only ever
 * returns a status string, never the request's name/email/password_hash.
 */
router.get(
  '/signup-status/:pendingId',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('pending_requests')
      .select('status')
      .eq('id', req.params.pendingId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'Request not found');
    res.json({ status: data.status });
  })
);

/**
 * POST /api/auth/reset-password
 * Self-service reset gated by email + Employee ID instead of an emailed
 * link (this app has no mail sending). Deliberately generic on mismatch so
 * it doesn't confirm which part (email vs Employee ID) was wrong.
 */
router.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const employee_id = (req.body.employee_id || '').trim();
    const newPassword = req.body.newPassword || '';

    if (!email || !employee_id) throw new ApiError(400, 'Email and Employee ID are required');
    if (!EMPLOYEE_ID_RE.test(employee_id)) throw new ApiError(400, 'Employee ID must be exactly 5 digits');
    if (newPassword.length < 8) throw new ApiError(400, 'Password must be at least 8 characters');

    const { data: member, error } = await supabase
      .from('members')
      .select('id')
      .eq('email', email)
      .eq('employee_id', employee_id)
      .maybeSingle();
    if (error) throw error;
    if (!member) throw new ApiError(404, 'No account matches that email and Employee ID');

    const password_hash = await hashPassword(newPassword);
    const { error: updateErr } = await supabase
      .from('members')
      .update({ password_hash })
      .eq('id', member.id);
    if (updateErr) throw updateErr;

    res.json({ message: 'Password updated — you can now sign in.' });
  })
);

/**
 * POST /api/auth/login
 * Returns a JWT plus the public member record. Transparently upgrades legacy
 * SHA-256 password hashes to bcrypt on successful login.
 */
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    if (!email || !password) throw new ApiError(400, 'Email and password are required');

    const { data: member, error } = await supabase
      .from('members')
      .select('*')
      .ilike('email', emailFilter(email))
      .maybeSingle();
    if (error) throw error;

    // Distinguish "awaiting approval" from "no such account" for a helpful message.
    if (!member) {
      const { data: pending } = await supabase
        .from('pending_requests')
        .select('id')
        .ilike('email', emailFilter(email))
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
