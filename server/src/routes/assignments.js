import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const TOPIC_OPTIONS = ['EMStride', 'HRIS', 'CMS', 'AI', 'Others'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(row) {
  if (row.topic !== undefined && !TOPIC_OPTIONS.includes(row.topic)) {
    throw new ApiError(400, `topic must be one of: ${TOPIC_OPTIONS.join(', ')}`);
  }
  if (row.country !== undefined && !row.country) {
    throw new ApiError(400, 'country cannot be empty');
  }
  if (row.assigned_to !== undefined && !UUID_RE.test(row.assigned_to)) {
    throw new ApiError(400, 'assigned_to must be a valid member id');
  }
}

/** Confirms assigned_to refers to a real member, so a bad id fails with a
 *  clean 400 instead of the DB's raw foreign-key-violation error. */
async function assertMemberExists(id) {
  const { data, error } = await supabase.from('members').select('id').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(400, 'assigned_to must be an existing member');
}

/**
 * GET /api/assignments — list assigned work, newest first.
 * Optional filter: ?assigned_to=<uuid>
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    let query = supabase.from('assignments').select('*');
    if (req.query.assigned_to) query = query.eq('assigned_to', req.query.assigned_to);
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  })
);

/** POST /api/assignments — create. Records the creator via created_by. */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const assigned_to = req.body.assigned_to;
    const topic = req.body.topic;
    const country = req.body.country;
    if (!assigned_to) throw new ApiError(400, 'assigned_to is required');
    if (!topic) throw new ApiError(400, 'topic is required');
    if (!country) throw new ApiError(400, 'country is required');

    const row = {
      assigned_to,
      topic,
      sub_topic: req.body.sub_topic || null,
      country,
      state: req.body.state || null,
      created_by: req.user.sub,
    };
    validate(row);
    await assertMemberExists(row.assigned_to);

    const { data, error } = await supabase.from('assignments').insert(row).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  })
);

/**
 * PATCH /api/assignments/:id — update.
 * Only an admin or the member it's assigned to may edit it, mirroring the
 * frontend's canManageAssignment() rule.
 */
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data: existing, error: findErr } = await supabase
      .from('assignments')
      .select('assigned_to')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) throw new ApiError(404, 'Assignment not found');

    const owns = existing.assigned_to === req.user.sub;
    if (!req.user.is_admin && !owns) throw new ApiError(403, 'Not allowed to edit this assignment');

    const patch = {};
    if (req.body.assigned_to !== undefined) patch.assigned_to = req.body.assigned_to;
    if (req.body.topic !== undefined) patch.topic = req.body.topic;
    if (req.body.sub_topic !== undefined) patch.sub_topic = req.body.sub_topic || null;
    if (req.body.country !== undefined) patch.country = req.body.country;
    if (req.body.state !== undefined) patch.state = req.body.state || null;
    if (Object.keys(patch).length === 0) throw new ApiError(400, 'No editable fields provided');
    validate(patch);
    if (patch.assigned_to !== undefined) await assertMemberExists(patch.assigned_to);

    const { data, error } = await supabase
      .from('assignments')
      .update(patch)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  })
);

/** DELETE /api/assignments/:id — admin or the member it's assigned to. */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data: existing, error: findErr } = await supabase
      .from('assignments')
      .select('assigned_to')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) throw new ApiError(404, 'Assignment not found');

    const owns = existing.assigned_to === req.user.sub;
    if (!req.user.is_admin && !owns) throw new ApiError(403, 'Not allowed to delete this assignment');

    const { error } = await supabase.from('assignments').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
