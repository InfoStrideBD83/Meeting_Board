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
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(isProd ? {} : { stack: err.stack }),
  });
}
