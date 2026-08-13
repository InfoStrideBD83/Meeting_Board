import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { ApiError } from '../utils/http.js';

const TOKEN_TTL = '7d';

/** Sign a JWT for an authenticated member. */
export function signToken(member) {
  return jwt.sign(
    {
      sub: member.id,
      email: member.email,
      name: member.name,
      is_admin: member.is_admin,
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
 * Require a valid JWT. Populates req.user with the decoded payload.
 */
export function requireAuth(req, _res, next) {
  const token = bearer(req);
  if (!token) return next(new ApiError(401, 'Authentication required'));
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired token'));
  }
}

/**
 * Require an authenticated admin. Must run after requireAuth.
 */
export function requireAdmin(req, _res, next) {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  if (!req.user.is_admin) return next(new ApiError(403, 'Admin access required'));
  next();
}
