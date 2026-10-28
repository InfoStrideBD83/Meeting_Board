import { useEffect, useState } from 'react';
import { getClockZone, CLOCK_ZONES, HOME_PREFS_CHANGE_EVENT } from '../utils/homePrefsStore.js';
import styles from './LiveClock.module.css';

/** A small ticking clock for the Home header, next to WeatherWidget — pure
 *  `Date`/`Intl`, no geolocation/permissions needed, so it always renders
 *  (unlike weather, which depends on location access). Defaults to the
 *  visitor's own device time, but SettingsModal can pin it to IST/EST/CST/
 *  MST/PST instead — useful for a team that schedules across US time
 *  zones from elsewhere. Locale is forced to 'en-US' regardless of either
 *  choice, so the format — and AM/PM — stays consistent for everyone;
 *  some locales default to 24h with no AM/PM at all. */
export function LiveClock() {
  const [zone, setZone] = useState(getClockZone);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onChange() { setZone(getClockZone()); }
    window.addEventListener(HOME_PREFS_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(HOME_PREFS_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const zoneMeta = CLOCK_ZONES[zone] || CLOCK_ZONES.local;
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    ...(zoneMeta.tz ? { timeZone: zoneMeta.tz } : {}),
  }).formatToParts(now);
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';

  return (
    <span className={styles.clock} title={zoneMeta.label}>
      {get('hour')}:{get('minute')}:{get('second')} <span className={styles.period}>{get('dayPeriod').toUpperCase()}</span>
      {zoneMeta.tz && <span className={styles.zoneTag}>{zone}</span>}
    </span>
  );
}
