import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Every messaging route requires a signed-in member.
router.use(requireAuth);

async function myConversationRows(memberId) {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at')
    .eq('member_id', memberId);
  if (error) throw error;
  return data;
}

async function assertMember(conversationId, memberId) {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('member_id')
    .eq('conversation_id', conversationId)
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(403, 'Not a member of this conversation');
}

/**
 * GET /api/conversations — every conversation the current member belongs
 * to, newest activity first, with participant summaries, a preview of the
 * latest message, and an unread count (messages after this member's own
 * last_read_at that they didn't send themselves).
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const meId = req.user.sub;
    const mine = await myConversationRows(meId);
    if (mine.length === 0) return res.json([]);

    const ids = mine.map((m) => m.conversation_id);
    const lastReadById = Object.fromEntries(mine.map((m) => [m.conversation_id, m.last_read_at]));

    const { data: convos, error: convErr } = await supabase
      .from('conversations')
      .select('id, is_group, name, created_by, updated_at')
      .in('id', ids)
      .order('updated_at', { ascending: false });
    if (convErr) throw convErr;

    const { data: memberRows, error: memErr } = await supabase
      .from('conversation_members')
      .select('conversation_id, member_id')
      .in('conversation_id', ids);
    if (memErr) throw memErr;

    // Cross-reference member ids against the full member list in JS,
    // rather than a PostgREST embedded-select join — matches how every
    // other route in this app resolves member info.
    const { data: allMembers, error: allMemErr } = await supabase
      .from('members')
      .select('id, name, color');
    if (allMemErr) throw allMemErr;
    const memberById = Object.fromEntries(allMembers.map((m) => [m.id, m]));

    const { data: recentMessages, error: msgErr } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, created_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (msgErr) throw msgErr;

    const membersByConvo = {};
    for (const row of memberRows) {
      const m = memberById[row.member_id];
      if (!m) continue; // member account since deleted
      (membersByConvo[row.conversation_id] ||= []).push(m);
    }

    const lastMessageByConvo = {};
    const unreadByConvo = {};
    for (const m of recentMessages) {
      if (!lastMessageByConvo[m.conversation_id]) lastMessageByConvo[m.conversation_id] = m;
      const lastRead = lastReadById[m.conversation_id];
      const isUnread = m.sender_id !== meId && (!lastRead || new Date(m.created_at) > new Date(lastRead));
      if (isUnread) unreadByConvo[m.conversation_id] = (unreadByConvo[m.conversation_id] || 0) + 1;
    }

    const result = convos.map((c) => {
      const members = membersByConvo[c.id] || [];
      const others = members.filter((m) => m.id !== meId);
      return {
        id: c.id,
        is_group: c.is_group,
        name: c.is_group ? c.name : (others[0] ? others[0].name : 'Unknown member'),
        members: c.is_group ? members : undefined,
        other_member: c.is_group ? undefined : (others[0] || null),
        last_message: lastMessageByConvo[c.id] || null,
        unread_count: unreadByConvo[c.id] || 0,
        updated_at: c.updated_at,
      };
    });
    res.json(result);
  })
);

/**
 * POST /api/conversations — start a conversation.
 * DM: { member_id }. Reuses an existing 1:1 conversation if one already
 * exists between these two members instead of creating a duplicate.
 * Group: { name, member_ids: [...] } — creates a group with the current
 * member plus everyone listed.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const meId = req.user.sub;
    const { member_id, member_ids, name } = req.body;

    if (Array.isArray(member_ids) && member_ids.length > 0) {
      const uniqueIds = Array.from(new Set([meId, ...member_ids]));
      if (uniqueIds.length < 2) throw new ApiError(400, 'A group needs at least one other member');

      const { data: convo, error: cErr } = await supabase
        .from('conversations')
        .insert({ is_group: true, name: (name || '').trim() || 'New group', created_by: meId })
        .select('id, is_group, name, created_by, updated_at')
        .single();
      if (cErr) throw cErr;

      const { error: mErr } = await supabase
        .from('conversation_members')
        .insert(uniqueIds.map((id) => ({ conversation_id: convo.id, member_id: id })));
      if (mErr) throw mErr;

      return res.status(201).json(convo);
    }

    if (!member_id) throw new ApiError(400, 'member_id or member_ids is required');
    if (member_id === meId) throw new ApiError(400, 'Cannot start a conversation with yourself');

    const mine = await myConversationRows(meId);
    const mineIds = mine.map((r) => r.conversation_id);
    if (mineIds.length) {
      const { data: theirRows, error: theirErr } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('member_id', member_id)
        .in('conversation_id', mineIds);
      if (theirErr) throw theirErr;
      const sharedIds = theirRows.map((r) => r.conversation_id);
      if (sharedIds.length) {
        const { data: existing, error: exErr } = await supabase
          .from('conversations')
          .select('id, is_group, name, created_by, updated_at')
          .in('id', sharedIds)
          .eq('is_group', false)
          .maybeSingle();
        if (exErr) throw exErr;
        if (existing) return res.status(200).json(existing);
      }
    }

    const { data: convo, error: cErr } = await supabase
      .from('conversations')
      .insert({ is_group: false, created_by: meId })
      .select('id, is_group, name, created_by, updated_at')
      .single();
    if (cErr) throw cErr;

    const { error: mErr } = await supabase.from('conversation_members').insert([
      { conversation_id: convo.id, member_id: meId },
      { conversation_id: convo.id, member_id: member_id },
    ]);
    if (mErr) throw mErr;

    res.status(201).json(convo);
  })
);

/** GET /api/conversations/:id/messages — the last 500 messages, oldest first. */
router.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    await assertMember(req.params.id, req.user.sub);
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, body, created_at')
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    res.json(data);
  })
);

/** POST /api/conversations/:id/messages — send a message. */
router.post(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    await assertMember(req.params.id, req.user.sub);
    const body = (req.body.body || '').trim();
    if (!body) throw new ApiError(400, 'Message body is required');

    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: req.params.id, sender_id: req.user.sub, body })
      .select('id, sender_id, body, created_at')
      .single();
    if (error) throw error;

    const now = new Date().toISOString();
    await supabase.from('conversations').update({ updated_at: now }).eq('id', req.params.id);
    // Sending a message also counts as having read up to now.
    await supabase
      .from('conversation_members')
      .update({ last_read_at: now })
      .eq('conversation_id', req.params.id)
      .eq('member_id', req.user.sub);

    res.status(201).json(data);
  })
);

/** POST /api/conversations/:id/read — mark everything in this conversation as read. */
router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await assertMember(req.params.id, req.user.sub);
    const { error } = await supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', req.params.id)
      .eq('member_id', req.user.sub);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
