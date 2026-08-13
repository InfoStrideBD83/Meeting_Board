import 'dotenv/config';

/**
 * Centralised, validated environment configuration.
 * Fails fast at startup if a required secret is missing.
 */
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Check server/.env`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProdEnv = nodeEnv === 'production';

// Comma-separated list of allowed origins; empty = allow all (dev convenience
// only). In production an open CORS policy combined with credentials:true
// would let any site make authenticated-looking requests, so it's required.
if (isProdEnv && !process.env.FRONTEND_URL) {
  throw new Error(
    'Missing required environment variable: FRONTEND_URL. It must be set in ' +
    'production (comma-separated allowed origins, e.g. your Vercel domain) — ' +
    'refusing to start with an open CORS policy.'
  );
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv,
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  jwtSecret: required('JWT_SECRET'),
  frontendUrl: process.env.FRONTEND_URL || '',
};

export const isProd = isProdEnv;
