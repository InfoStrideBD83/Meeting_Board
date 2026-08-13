import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Columns that exist on the meetings table (see supabase_schema.sql).
// Anything the frontend sends outside this set (e.g. client id "m_123",
// poc_country) is ignored so inserts/updates never fail on unknown columns.
const WRITABLE = [
  'demo_topic',
  'person_id',
  'date',
  'time',
  'zone_index',
  'duration',
  'source',
  'status',
  'poc_name',
  'poc_state',
  'poc_email',
  'poc_phone',
  'poc_state_name',
  'poc_population_count',
  'poc_county_name',
  'mom',
  'meeting_taken_by',
  'meeting_outcome',
  'post_demo_actions',
];

const VALID_STATUS = ['Demo Scheduled', 'Demo Completed', 'Demo Canceled'];

function pickWritable(body) {
  const out = {};
  for (const key of WRITABLE) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

function validate(row) {
  if (row.status !== undefined && !VALID_STATUS.includes(row.status)) {
    throw new ApiError(400, `status must be one of: ${VALID_STATUS.join(', ')}`);
  }
  if (row.zone_index !== undefined) row.zone_index = Number(row.zone_index);
  if (row.duration !== undefined) row.duration = Number(row.duration);
}

/**
 * GET /api/meetings — list meetings, newest first.
 * Optional filters: ?date=YYYY-MM-DD  ?person_id=<uuid>
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    let query = supabase.from('meetings').select('*');
    if (req.query.date) query = query.eq('date', req.query.date);
    if (req.query.person_id) query = query.eq('person_id', req.query.person_id);
    query = query.order('date', { ascending: false }).order('time', { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  })
);

/** GET /api/meetings/:id */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'Meeting not found');
    res.json(data);
  })
);

/** POST /api/meetings — create. Records the creator via created_by. */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const row = pickWritable(req.body);
    if (!row.demo_topic) throw new ApiError(400, 'demo_topic is required');
    if (!row.date) throw new ApiError(400, 'date is required');
    if (!row.time) throw new ApiError(400, 'time is required');
    validate(row);
    row.created_by = req.user.sub;

    const { data, error } = await supabase.from('meetings').insert(row).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  })
);

/**
 * PATCH /api/meetings/:id — update.
 * Only an admin or the member who owns the meeting (person_id) may edit it,
 * mirroring the frontend's canManageMeeting() rule.
 */
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data: existing, error: findErr } = await supabase
      .from('meetings')
      .select('person_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) throw new ApiError(404, 'Meeting not found');

    const owns = existing.person_id && existing.person_id === req.user.sub;
    if (!req.user.is_admin && !owns) throw new ApiError(403, 'Not allowed to edit this meeting');

    const patch = pickWritable(req.body);
    if (Object.keys(patch).length === 0) throw new ApiError(400, 'No editable fields provided');
    validate(patch);

    const { data, error } = await supabase
      .from('meetings')
      .update(patch)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  })
);

/** DELETE /api/meetings/:id — admin or owner. */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data: existing, error: findErr } = await supabase
      .from('meetings')
      .select('person_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) throw new ApiError(404, 'Meeting not found');

    const owns = existing.person_id && existing.person_id === req.user.sub;
    if (!req.user.is_admin && !owns) throw new ApiError(403, 'Not allowed to delete this meeting');

    const { error } = await supabase.from('meetings').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
