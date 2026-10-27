import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from './Avatar.jsx';
import styles from './PresenceWidget.module.css';

const POLL_MS = 10000;

function timeAgo(iso) {
  if (!iso) return 'Never signed in';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ico = {
  radar: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none" /><path d="M12 12 L19 7" /><path d="M8.5 5.3a9 9 0 1 0 10.2 10.2" /><path d="M11.5 1.6a11 11 0 0 0-8 17.8" opacity=".55" /></svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
  ),
};

/** Admin-only "who's using the app" panel: live online/offline status plus
 *  last-seen time for every member, driven by the heartbeat every signed-in
 *  tab sends (see usePresenceHeartbeat, mounted app-wide in App.jsx) rather
 *  than by presence tracking of its own. */
export function PresenceWidget() {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState([]);
  const [, setTick] = useState(0);

  const refresh = useCallback(() => {
    apiFetch('/presence').then(setRoster).catch(() => { /* transient — next poll retries */ });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    // Re-render every 30s purely to keep "Xm ago" text fresh between polls.
    const tickId = setInterval(() => setTick((t) => t + 1), 30000);
    return () => { clearInterval(id); clearInterval(tickId); };
  }, [open, refresh]);

  if (!isAdmin) return null;

  const online = roster.filter((m) => m.online);
  const offline = roster.filter((m) => !m.online);

  return (
    <>
      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close member activity' : 'Open member activity'}
        title="Member activity"
      >
        {ico.radar}
        {online.length > 0 && <span className={styles.launcherBadge}>{online.length}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Member activity">
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>Member activity</span>
            <button type="button" className={styles.iconBtn} onClick={() => setOpen(false)} aria-label="Close">{ico.close}</button>
          </div>

          <div className={styles.body}>
            {roster.length === 0 ? (
              <p className={styles.empty}>No members yet.</p>
            ) : (
              <>
                {online.length > 0 && (
                  <div className={styles.section}>
                    <div className={styles.sectionLabel}>Active now · {online.length}</div>
                    {online.map((m) => (
                      <div key={m.id} className={styles.row}>
                        <span className={styles.avatarWrap}>
                          <Avatar name={m.name} color={m.color} size={32} />
                          <span className={styles.dotOnline} aria-hidden="true" />
                        </span>
                        <span className={styles.info}>
                          <span className={styles.name}>{m.name}{m.is_admin ? ' · Admin' : ''}</span>
                          <span className={styles.statusOnline}>Online now</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {offline.length > 0 && (
                  <div className={styles.section}>
                    <div className={styles.sectionLabel}>Offline</div>
                    {offline.map((m) => (
                      <div key={m.id} className={styles.row}>
                        <span className={styles.avatarWrap}>
                          <Avatar name={m.name} color={m.color} size={32} />
                          <span className={styles.dotOffline} aria-hidden="true" />
                        </span>
                        <span className={styles.info}>
                          <span className={styles.name}>{m.name}{m.is_admin ? ' · Admin' : ''}</span>
                          <span className={styles.statusOffline}>{timeAgo(m.last_seen_at)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
