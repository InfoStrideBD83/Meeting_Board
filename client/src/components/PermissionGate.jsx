import { useState } from 'react';
import styles from './PermissionGate.module.css';

function readNotificationState() {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission; // 'granted' | 'denied' | 'default'
}

/** Required by every protected page: a member who hasn't granted browser
 *  notification access can't use the tool until they do (so meeting-start
 *  alerts can actually reach them). Location is deliberately NOT gated here
 *  — it only powers the optional weather display, which already asks for
 *  and gracefully handles missing location entirely on its own (see
 *  WeatherWidget.jsx), so there's no reason to block the whole app over it.
 *
 *  Two things keep the notification requirement itself safe rather than a
 *  trap: a browser with no Notification API at all (some locked-down mobile
 *  browsers) can never satisfy it no matter what the user does, so that's
 *  treated as satisfied rather than an impossible requirement; and once
 *  notifications are actually denied (not just "never asked"), no page can
 *  ever re-trigger that browser prompt — only the browser's own site-
 *  settings UI can undo it — so this screen gives exact per-browser steps
 *  for that, plus a Recheck button, instead of leaving someone stuck. */
export function PermissionGate({ children }) {
  const [notif, setNotif] = useState(readNotificationState);
  const [busy, setBusy] = useState(false);

  function requestNotifications() {
    if (typeof Notification === 'undefined') return;
    setBusy(true);
    Notification.requestPermission()
      .then((result) => setNotif(result))
      .finally(() => setBusy(false));
  }

  const notifOk = notif === 'granted' || notif === 'unsupported';
  if (notifOk) return children;

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Notifications are required</h1>
        <p className={styles.lede}>
          This workspace needs browser notifications allowed so you can get alerted when a meeting is
          about to start. Allow notifications to continue.
        </p>

        <div className={styles.row}>
          <div className={styles.rowInfo}>
            <span className={styles.rowTitle}>Notifications</span>
            <span className={`${styles.badge} ${notif === 'denied' ? styles.badgeDenied : styles.badgePending}`}>
              {notif === 'denied' ? 'Blocked' : 'Not yet allowed'}
            </span>
          </div>
          {notif !== 'denied' && (
            <button type="button" className="btn btn-primary" onClick={requestNotifications} disabled={busy}>
              {busy ? 'Requesting…' : 'Allow notifications'}
            </button>
          )}
        </div>
        {notif === 'denied' && (
          <div className={styles.fixit}>
            <strong>Notifications are blocked in your browser.</strong> This can't be re-requested from
            the page once blocked — you'll need to undo it from your browser's own settings.
            <ul>
              <li><strong>Chrome / Edge:</strong> click the lock or info icon left of the address bar → Site settings → set Notifications to Allow → reload this page.</li>
              <li><strong>Firefox:</strong> click the lock icon in the address bar → Permissions → clear the Notifications block → reload.</li>
              <li><strong>Safari:</strong> Safari menu → Settings for This Website → set Notifications to Allow → reload.</li>
            </ul>
            <button type="button" className="btn" onClick={() => setNotif(readNotificationState())}>I've allowed it — recheck</button>
          </div>
        )}
      </div>
    </div>
  );
}
