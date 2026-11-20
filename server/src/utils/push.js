import * as webpush from 'web-push';
import { config } from '../config/env.js';
import { supabase } from '../config/supabase.js';

const enabled = Boolean(config.vapidPublicKey && config.vapidPrivateKey);
if (enabled) {
  webpush.setVapidDetails(config.vapidContactEmail, config.vapidPublicKey, config.vapidPrivateKey);
}

/** Sends a Web Push notification to every subscription on file for the
 *  given members — this is what actually reaches someone whose browser is
 *  closed or backgrounded, unlike the in-app Realtime banner (CallContext)
 *  or the Notification popup that only fires while a tab is open
 *  (MessagingWidget). Best-effort: a subscription the push service reports
 *  as gone (410/404 — the browser unsubscribed, cleared site data, etc.) is
 *  deleted so it stops being retried; any other failure is swallowed so one
 *  bad subscription never blocks the rest or the caller's own response. */
export async function pushToMembers(memberIds, payload) {
  if (!enabled || !memberIds || memberIds.length === 0) return;

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('member_id', memberIds);
  if (error || !subs || subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body
      );
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await supabase.from('push_subscriptions').delete().eq('id', s.id);
      }
      // Any other failure (offline push service, malformed payload, etc.)
      // isn't actionable here — just don't let it affect the rest.
    }
  }));
}

export const pushEnabled = enabled;
