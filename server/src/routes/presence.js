import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/http.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// A member counts as "currently active" if their last heartbeat landed
// within this window. The client beats roughly every 40s, so 90s survives
// one missed beat (slow network, briefly backgrounded tab) without the
// status flapping between online/offline.
const ACTIVE_WINDOW_MS = 90 * 1000;

/** POST /api/presence — heartbeat from the signed-in member. Called on a
 *  timer from every page while logged in (see usePresenceHeartbeat), not
 *  just the Home page, so "currently active" reflects real app usage. */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { error } = await supabase
      .from('members')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', req.user.sub);
    if (error) throw error;
    res.status(204).end();
  })
);

/** GET /api/presence — admin-only roster of every member's last-seen state. */
router.get(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('members')
      .select('id, name, color, is_admin, last_seen_at')
      .order('name', { ascending: true });
    if (error) throw error;

    const now = Date.now();
    res.json(
      data.map((m) => ({
        ...m,
        online: Boolean(m.last_seen_at) && now - new Date(m.last_seen_at).getTime() < ACTIVE_WINDOW_MS,
      }))
    );
  })
);

export default router;
