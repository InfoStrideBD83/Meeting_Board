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

export const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  jwtSecret: required('JWT_SECRET'),
  // Comma-separated list of allowed origins; empty = allow all (dev convenience).
  frontendUrl: process.env.FRONTEND_URL || '',
};

export const isProd = config.nodeEnv === 'production';
