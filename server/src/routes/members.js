import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { hashPassword } from '../utils/passwords.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { publicMember } from './auth.js';

const router = Router();

// A palette used to auto-assign a colour when the client doesn't supply one.
const PALETTE = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#a78bfa', '#f87171', '#2dd4bf'];

/** GET /api/members — list all members (auth required). */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    res.json(data.map(publicMember));
  })
);

/** GET /api/members/:id */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'Member not found');
    res.json(publicMember(data));
  })
);

/** POST /api/members — admin creates a member directly (optionally with a password). */
router.post(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    if (!name) throw new ApiError(400, 'Name is required');
    if (!email) throw new ApiError(400, 'Email is required');

    const row = {
      name,
      email,
      color: req.body.color || PALETTE[Math.floor(Math.random() * PALETTE.length)],
      is_admin: Boolean(req.body.is_admin),
    };
    if (req.body.password) row.password_hash = await hashPassword(req.body.password);

    const { data, error } = await supabase.from('members').insert(row).select('*').single();
    if (error) {
      if (error.code === '23505') throw new ApiError(409, 'A member with this email already exists');
      throw error;
    }
    res.status(201).json(publicMember(data));
  })
);

/** PATCH /api/members/:id — admins may edit anyone; members may edit themselves. */
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const targetId = req.params.id;
    const isSelf = req.user.sub === targetId;
    if (!req.user.is_admin && !isSelf) throw new ApiError(403, 'Not allowed to edit this member');

    const patch = {};
    if (req.body.name !== undefined) patch.name = String(req.body.name).trim();
    if (req.body.color !== undefined) patch.color = req.body.color;
    if (req.body.email !== undefined) patch.email = String(req.body.email).trim().toLowerCase();
    // Only admins can toggle admin status.
    if (req.body.is_admin !== undefined && req.user.is_admin) patch.is_admin = Boolean(req.body.is_admin);
    if (req.body.password) patch.password_hash = await hashPassword(req.body.password);

    if (Object.keys(patch).length === 0) throw new ApiError(400, 'No editable fields provided');

    const { data, error } = await supabase
      .from('members')
      .update(patch)
      .eq('id', targetId)
      .select('*')
      .maybeSingle();
    if (error) {
      if (error.code === '23505') throw new ApiError(409, 'A member with this email already exists');
      throw error;
    }
    if (!data) throw new ApiError(404, 'Member not found');
    res.json(publicMember(data));
  })
);

/** DELETE /api/members/:id — admin only. */
router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (req.user.sub === req.params.id) throw new ApiError(400, 'You cannot delete your own account');
    const { error } = await supabase.from('members').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
