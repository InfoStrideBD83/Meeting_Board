import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { publicMember } from './auth.js';

const router = Router();

// All pending-request routes are admin-only.
router.use(requireAuth, requireAdmin);

/** GET /api/pending-requests — list join requests awaiting approval. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('pending_requests')
      .select('id, name, email, employee_id, requested_at')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });
    if (error) throw error;
    res.json(data);
  })
);

/**
 * POST /api/pending-requests/:id/approve
 * Moves a pending request into members (carrying its password_hash) and
 * marks the request approved — kept around (not deleted) so the signup
 * page's status-polling endpoint can still find it. Optionally set
 * { is_admin: true } in the body.
 */
router.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const { data: pending, error: findErr } = await supabase
      .from('pending_requests')
      .select('*')
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (findErr) throw findErr;
    if (!pending) throw new ApiError(404, 'Pending request not found');

    const { data: member, error: insErr } = await supabase
      .from('members')
      .insert({
        name: pending.name,
        email: pending.email,
        employee_id: pending.employee_id,
        password_hash: pending.password_hash,
        is_admin: Boolean(req.body.is_admin),
      })
      .select('*')
      .single();
    if (insErr) {
      if (insErr.code === '23505') throw new ApiError(409, 'A member with this email already exists');
      throw insErr;
    }

    const { error: updateErr } = await supabase
      .from('pending_requests')
      .update({ status: 'approved' })
      .eq('id', req.params.id);
    if (updateErr) throw updateErr;

    res.status(201).json(publicMember(member));
  })
);

/** POST /api/pending-requests/:id/decline — mark the request declined. */
router.post(
  '/:id/decline',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('pending_requests')
      .update({ status: 'declined' })
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'Pending request not found');
    res.status(204).end();
  })
);

export default router;
