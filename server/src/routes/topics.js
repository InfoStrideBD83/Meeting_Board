import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

/** GET /api/topics — list State-Allotment column topics. */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('topics')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data);
  })
);

/** POST /api/topics — admin creates a topic. */
router.post(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) throw new ApiError(400, 'Topic name is required');
    const { data, error } = await supabase.from('topics').insert({ name }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  })
);

/** PATCH /api/topics/:id — admin renames a topic. */
router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) throw new ApiError(400, 'Topic name is required');
    const { data, error } = await supabase
      .from('topics')
      .update({ name })
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'Topic not found');
    res.json(data);
  })
);

/** DELETE /api/topics/:id — admin deletes a topic (cascades to its allotments). */
router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { error } = await supabase.from('topics').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
