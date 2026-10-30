import { useEffect, useState } from 'react';
import styles from './PermissionGate.module.css';

function readNotificationState() {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission; // 'granted' | 'denied' | 'default'
}

/** Required by every protected page, per explicit instruction: a member
 *  who hasn't granted location + notification access can't use the tool
 *  until they do. Two things make that safe rather than a trap:
 *   1. A browser that has no Notification API at all (some older/locked-
 *      down mobile browsers) can never satisfy that requirement no matter
 *      what the user does — gating on it anyway would brick the app for
 *      them with literally no way out, so that one requirement is skipped
 *      when the API doesn't exist. Geolocation is near-universal, so no
 *      such carve-out exists for it.
 *   2. Once a permission is actually denied (not just "never asked"),
 *      browsers never show that prompt again — only the browser's own
 *      site-settings UI can undo it. This screen gives exact per-browser
 *      steps for that, plus a Recheck button, so a blocked member always
 *      has a visible path back in rather than being stuck. */
export function PermissionGate({ children }) {
  const [geo, setGeo] = useState('prompt'); // 'granted' | 'denied' | 'prompt'
  const [notif, setNotif] = useState(readNotificationState);
  const [checking, setChecking] = useState(true);
  const [geoBusy, setGeoBusy] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let permStatus = null;

    async function detectGeo() {
      if (!navigator.geolocation) { setGeo('unsupported'); return; }
      if (navigator.permissions && navigator.permissions.query) {
        try {
          permStatus = await navigator.permissions.query({ name: 'geolocation' });
          if (cancelled) return;
          setGeo(permStatus.state);
          permStatus.onchange = () => setGeo(permStatus.state);
          return;
        } catch { /* some browsers don't support querying 'geolocation' — fall through */ }
      }
      // No Permissions API support for this name — leave it as 'prompt'
      // (unknown) until the member actually clicks "Allow location".
    }

    detectGeo().finally(() => { if (!cancelled) setChecking(false); });
    return () => {
      cancelled = true;
      if (permStatus) permStatus.onchange = null;
    };
  }, []);

  function requestLocation() {
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      () => { setGeo('granted'); setGeoBusy(false); },
      (err) => {
        // Only an explicit PERMISSION_DENIED means "blocked" — a timeout or
        // a momentarily unavailable position isn't a denial and shouldn't
        // be treated as one.
        if (err.code === err.PERMISSION_DENIED) setGeo('denied');
        setGeoBusy(false);
      },
      { timeout: 10000 }
    );
  }

  function requestNotifications() {
    if (typeof Notification === 'undefined') return;
    setNotifBusy(true);
    Notification.requestPermission()
      .then((result) => setNotif(result))
      .finally(() => setNotifBusy(false));
  }

  function recheck() {
    setNotif(readNotificationState());
    if (navigator.permissions && navigator.permissions.query && navigator.geolocation) {
      navigator.permissions.query({ name: 'geolocation' }).then((p) => setGeo(p.state)).catch(() => {});
    }
  }

  const geoOk = geo === 'granted' || geo === 'unsupported';
  const notifOk = notif === 'granted' || notif === 'unsupported';

  if (checking) return null;
  if (geoOk && notifOk) return children;

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Location and notifications are required</h1>
        <p className={styles.lede}>
          This workspace needs both to work fully — location powers the weather shown on Home, and
          notifications let you get alerted when a meeting is about to start. Allow both to continue.
        </p>

        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <span className={styles.rowTitle}>Location</span>
            <span className={`${styles.badge} ${geoOk ? styles.badgeOk : geo === 'denied' ? styles.badgeDenied : styles.badgePending}`}>
              {geo === 'granted' ? 'Allowed' : geo === 'denied' ? 'Blocked' : geo === 'unsupported' ? 'Not needed here' : 'Not yet allowed'}
            </span>
          </div>
          {!geoOk && geo !== 'denied' && (
            <button type="button" className="btn btn-primary" onClick={requestLocation} disabled={geoBusy}>
              {geoBusy ? 'Requesting…' : 'Allow location'}
            </button>
          )}
        </div>
        {geo === 'denied' && (
          <div className={styles.fixit}>
            <strong>Location is blocked in your browser.</strong> You'll need to unblock it from your
            browser's own settings — this can't be re-requested from the page once blocked.
            <ul>
              <li><strong>Chrome / Edge:</strong> click the lock or info icon left of the address bar → Site settings → set Location to Allow → reload this page.</li>
              <li><strong>Firefox:</strong> click the lock icon in the address bar → Permissions → clear the Location block → reload.</li>
              <li><strong>Safari:</strong> Safari menu → Settings for This Website → set Location to Allow → reload.</li>
            </ul>
          </div>
        )}

        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <span className={styles.rowTitle}>Notifications</span>
            <span className={`${styles.badge} ${notifOk ? styles.badgeOk : notif === 'denied' ? styles.badgeDenied : styles.badgePending}`}>
              {notif === 'granted' ? 'Allowed' : notif === 'denied' ? 'Blocked' : notif === 'unsupported' ? 'Not supported here' : 'Not yet allowed'}
            </span>
          </div>
          {!notifOk && notif !== 'denied' && (
            <button type="button" className="btn btn-primary" onClick={requestNotifications} disabled={notifBusy}>
              {notifBusy ? 'Requesting…' : 'Allow notifications'}
            </button>
          )}
        </div>
        {notif === 'denied' && (
          <div className={styles.fixit}>
            <strong>Notifications are blocked in your browser.</strong> Same as location, this needs
            undoing from your browser's own settings.
            <ul>
              <li><strong>Chrome / Edge:</strong> click the lock or info icon left of the address bar → Site settings → set Notifications to Allow → reload this page.</li>
              <li><strong>Firefox:</strong> click the lock icon in the address bar → Permissions → clear the Notifications block → reload.</li>
              <li><strong>Safari:</strong> Safari menu → Settings for This Website → set Notifications to Allow → reload.</li>
            </ul>
          </div>
        )}

        <button type="button" className="btn" onClick={recheck}>I've allowed it — recheck</button>
      </div>
    </div>
  );
}
