import { useEffect } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const HEARTBEAT_MS = 40000;

/** Pings the server roughly every 40s while signed in, so admins can see who's
 *  currently using the app and when everyone else was last seen (PresenceWidget).
 *  Mounted once at the app root — not gated to the Home page — so presence
 *  reflects real activity on every page, not just whoever's on Home. */
export function usePresenceHeartbeat() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    function beat() {
      apiFetch('/presence', { method: 'POST' }).catch(() => { /* transient — next beat retries */ });
    }
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);

    // A tab coming back from the background shouldn't wait up to 40s to
    // register as active again.
    function onVisible() {
      if (document.visibilityState === 'visible') beat();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated]);
}
