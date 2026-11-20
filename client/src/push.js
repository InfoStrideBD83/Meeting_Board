import { apiFetch } from './api/client.js';

// Web Push's applicationServerKey wants raw bytes, but the VAPID public key
// is handed around (by web-push, and by convention everywhere else) as
// base64url text — this is the standard conversion between the two.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Registers the service worker that makes this app installable (so it can
 *  run in its own window and be pinned to the taskbar, like Teams) and that
 *  lets a push notification reach this device even with no tab open. Safe
 *  to call unconditionally — browsers without Service Worker support (or a
 *  non-HTTPS/non-localhost origin) just silently don't get either feature. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register('/sw.js').catch(() => null);
}

/** Subscribes this browser to push and saves the subscription server-side,
 *  if it isn't already subscribed. Requires Notification permission to
 *  already be granted — call this right after a permission prompt succeeds
 *  (see MessagingWidget's toggleOpen), never on its own, since browsers
 *  only honor a permission prompt triggered by a real user gesture. */
export async function ensurePushSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  try {
    const { enabled, publicKey } = await apiFetch('/push/key');
    if (!enabled || !publicKey) return;

    const registration = await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const json = sub.toJSON();
    await apiFetch('/push/subscribe', {
      method: 'POST',
      body: { endpoint: json.endpoint, keys: json.keys },
    });
  } catch {
    // Best-effort — the in-app (tab-open) notification path still works
    // regardless of whether background push subscribing succeeds.
  }
}
