import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/allotments — list state→member assignments.
 * Optional filter: ?topic_id=<uuid>
 * Composite primary key is (state, topic_id).
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    let query = supabase.from('allotments').select('*');
    if (req.query.topic_id) query = query.eq('topic_id', req.query.topic_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  })
);

/**
 * PUT /api/allotments — assign (or reassign) a member to a state for a topic.
 * Upserts on the (state, topic_id) composite key. Admin only.
 * Body: { state, topic_id, member_id | null }
 */
router.put(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { state, topic_id } = req.body;
    const member_id = req.body.member_id ?? null;
    if (!state) throw new ApiError(400, 'state is required');
    if (!topic_id) throw new ApiError(400, 'topic_id is required');

    const { data, error } = await supabase
      .from('allotments')
      .upsert({ state, topic_id, member_id }, { onConflict: 'state,topic_id' })
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  })
);

/**
 * DELETE /api/allotments — clear an assignment. Admin only.
 * Body or query: { state, topic_id }
 */
router.delete(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const state = req.body.state ?? req.query.state;
    const topic_id = req.body.topic_id ?? req.query.topic_id;
    if (!state || !topic_id) throw new ApiError(400, 'state and topic_id are required');

    const { error } = await supabase
      .from('allotments')
      .delete()
      .eq('state', state)
      .eq('topic_id', topic_id);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
