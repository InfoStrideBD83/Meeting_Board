import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config/env.js';
import { pushToMembers, pushEnabled, isAllowedPushEndpoint } from '../utils/push.js';

const router = Router();
router.use(requireAuth);

/** GET /api/push/key — the VAPID public key, so the client doesn't need its
 *  own copy of it baked in separately from the server's (it's public by
 *  design, safe to hand out to any signed-in member). */
router.get('/key', (req, res) => {
  res.json({ enabled: pushEnabled, publicKey: config.vapidPublicKey || null });
});

/** POST /api/push/subscribe — save (or refresh) this browser's push
 *  subscription for the current member. `endpoint` is unique per
 *  browser+device, so re-subscribing just updates the keys in place. */
router.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      throw new ApiError(400, 'A valid push subscription (endpoint + keys) is required');
    }
    if (!isAllowedPushEndpoint(endpoint)) {
      throw new ApiError(400, 'Unrecognized push service endpoint');
    }
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { member_id: req.user.sub, endpoint, p256dh: keys.p256dh, auth: keys.auth },
        { onConflict: 'endpoint' }
      );
    if (error) throw error;
    res.status(204).end();
  })
);

/** POST /api/push/unsubscribe — drop this browser's subscription (e.g. the
 *  person turned notifications off). */
router.post(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body || {};
    if (!endpoint) throw new ApiError(400, 'endpoint is required');
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('member_id', req.user.sub);
    if (error) throw error;
    res.status(204).end();
  })
);

/** POST /api/push/ring — a voice call's initiator calls this (alongside the
 *  low-latency Supabase Realtime ring in CallContext.jsx) so everyone else
 *  in the conversation also gets a real push notification, reaching them
 *  even if their browser is closed or backgrounded, not just a tab that's
 *  currently open. */
router.post(
  '/ring',
  asyncHandler(async (req, res) => {
    const { conversationId, callId } = req.body || {};
    if (!conversationId || !callId) throw new ApiError(400, 'conversationId and callId are required');

    // conversationName/isGroup come from the DB, never the request body —
    // otherwise any conversation member could put arbitrary attacker-chosen
    // text into a push notification that looks like it came from this
    // legitimate call-ring feature (same reasoning as conversations.js's own
    // message-push code, which also never trusts the client for this).
    const [{ data: memberRows, error }, { data: convo }] = await Promise.all([
      supabase.from('conversation_members').select('member_id').eq('conversation_id', conversationId),
      supabase.from('conversations').select('is_group, name').eq('id', conversationId).maybeSingle(),
    ]);
    if (error) throw error;
    if (!memberRows.some((m) => m.member_id === req.user.sub)) {
      throw new ApiError(403, 'Not a member of this conversation');
    }

    const { data: me } = await supabase.from('members').select('name').eq('id', req.user.sub).maybeSingle();
    const others = memberRows.map((m) => m.member_id).filter((id) => id !== req.user.sub);

    await pushToMembers(others, {
      kind: 'call',
      title: `Incoming call — ${me ? me.name : 'Someone'}`,
      body: convo && convo.is_group ? `Voice call · ${convo.name}` : 'Voice call',
      tag: `call-${callId}`,
      data: { conversationId, callId },
    });

    res.status(204).end();
  })
);

export default router;
