import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { supabase } from '../config/supabase.js';

const TOKEN_TTL = '7d';

/** Sign a JWT for an authenticated member. Only carries identity — never
 *  authorization claims like is_admin, since those can change server-side
 *  while a token is still valid (see requireAuth). */
export function signToken(member) {
  return jwt.sign(
    {
      sub: member.id,
      email: member.email,
      name: member.name,
    },
    config.jwtSecret,
    { expiresIn: TOKEN_TTL }
  );
}

/** Extract a bearer token from the Authorization header, if present. */
function bearer(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/**
 * Require a valid JWT, AND re-fetch the member from the database on every
 * request so req.user reflects their *current* state.
 *
 * The token only proves identity (it's signed and can't be forged), but a
 * member's admin status can change — or the member can be deleted entirely —
 * at any point during the token's 7-day lifetime. Trusting stale claims
 * baked into the token would mean a demoted admin keeps admin access, or a
 * deleted member keeps using the API, until their old token happens to
 * expire. Re-checking here closes that gap at the cost of one extra query
 * per request, which is a fine trade-off at this app's scale.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = bearer(req);
  if (!token) return next(new ApiError(401, 'Authentication required'));

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(new ApiError(401, 'Invalid or expired token'));
  }

  const { data: member, error } = await supabase
    .from('members')
    .select('id, email, name, is_admin')
    .eq('id', payload.sub)
    .maybeSingle();
  if (error) throw error;
  if (!member) return next(new ApiError(401, 'Account no longer exists'));

  req.user = { sub: member.id, email: member.email, name: member.name, is_admin: member.is_admin };
  next();
});

/**
 * Require an authenticated admin. Must run after requireAuth.
 */
export function requireAdmin(req, _res, next) {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  if (!req.user.is_admin) return next(new ApiError(403, 'Admin access required'));
  next();
}
