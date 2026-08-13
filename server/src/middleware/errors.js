import { isProd } from '../config/env.js';

/** 404 handler for unmatched API routes. */
export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

/** Central error handler — normalises everything to a JSON envelope. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[error]', err);
  }
  // 4xx messages are ones we wrote ourselves (ApiError) and are safe to show
  // as-is. A 500 means something unexpected — a raw Supabase/Postgres error,
  // for instance — which can leak column/table/query details, so in
  // production it's replaced with a generic message. The real error is still
  // logged above either way.
  const message = status >= 500 && isProd
    ? 'Internal server error'
    : (err.message || 'Internal server error');
  res.status(status).json({
    error: message,
    ...(isProd ? {} : { stack: err.stack }),
  });
}
