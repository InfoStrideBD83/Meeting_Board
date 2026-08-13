import { createClient } from '@supabase/supabase-js';
import { config } from './env.js';

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 *
 * The service role bypasses Row Level Security, so this client must NEVER be
 * exposed to the browser. All access is mediated through this backend's routes,
 * which apply their own auth checks (see middleware/auth.js).
 */
export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
