import { createClient } from '@supabase/supabase-js';

// The "publishable" key (Supabase's current name for what used to be called
// the anon/public key) is specifically designed to ship in browser code —
// unlike the secret/service-role key, which stays server-side only (see
// server/.env). This client is used ONLY for Realtime Broadcast channels
// (ephemeral pub/sub, e.g. live race-car positions) — it never touches a
// database table directly, so there's no RLS/auth surface to reason about
// here beyond what Supabase's own Realtime Broadcast already handles.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseRealtime = url && key ? createClient(url, key) : null;
