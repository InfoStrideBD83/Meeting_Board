import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/mis-entries — daily emails/calls log.
 * Optional filters: ?member_id=<uuid>  ?date=YYYY-MM-DD
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD  (inclusive date range)
 * Composite primary key is (member_id, date).
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    let query = supabase.from('mis_entries').select('*');
    if (req.query.member_id) query = query.eq('member_id', req.query.member_id);
    if (req.query.date) query = query.eq('date', req.query.date);
    if (req.query.from) query = query.gte('date', req.query.from);
    if (req.query.to) query = query.lte('date', req.query.to);
    query = query.order('date', { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  })
);

/**
 * PUT /api/mis-entries — record a member's daily counts.
 * Upserts on the (member_id, date) composite key.
 * Members may only write their own entries; admins may write anyone's.
 * Body: { member_id, date, emails?, calls?, is_absent? }
 */
router.put(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const member_id = req.body.member_id;
    const date = req.body.date;
    if (!member_id) throw new ApiError(400, 'member_id is required');
    if (!date) throw new ApiError(400, 'date is required');
    if (!req.user.is_admin && req.user.sub !== member_id) {
      throw new ApiError(403, 'You can only record your own MIS entries');
    }

    const row = {
      member_id,
      date,
      emails: Number(req.body.emails) || 0,
      calls: Number(req.body.calls) || 0,
      is_absent: Boolean(req.body.is_absent),
    };

    const { data, error } = await supabase
      .from('mis_entries')
      .upsert(row, { onConflict: 'member_id,date' })
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  })
);

/**
 * DELETE /api/mis-entries — remove an entry. Admin or the owning member.
 * Body or query: { member_id, date }
 */
router.delete(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const member_id = req.body.member_id ?? req.query.member_id;
    const date = req.body.date ?? req.query.date;
    if (!member_id || !date) throw new ApiError(400, 'member_id and date are required');
    if (!req.user.is_admin && req.user.sub !== member_id) {
      throw new ApiError(403, 'You can only delete your own MIS entries');
    }

    const { error } = await supabase
      .from('mis_entries')
      .delete()
      .eq('member_id', member_id)
      .eq('date', date);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
