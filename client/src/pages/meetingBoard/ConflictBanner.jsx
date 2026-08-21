import { ico } from './icons.jsx';
import { formatDate } from './dateUtils.js';
import styles from './ConflictBanner.module.css';

/* Overlap-warning banner — ported from Meeting Board.html's renderBanner().
   `pairs` is an array of [meetingA, meetingB] tuples whose time ranges
   overlap (computed by the parent via doMeetingsOverlap). Dismissing it
   records `key` (a stable signature of the current conflict set) so the
   banner reappears automatically if the set of conflicts ever changes,
   exactly like the original's dismissedConflictKey. */
export function ConflictBanner({ pairs, memberById, onDismiss }) {
  return (
    <div className={styles.banner} role="alert">
      {ico.warn}
      <div className={styles.bannerBody}>
        <div className={styles.bannerTitle}>
          {pairs.length} scheduling conflict{pairs.length !== 1 ? 's' : ''} detected
        </div>
        <ul className={styles.bannerList}>
          {pairs.map(([a, b]) => {
            const ma = memberById(a.person_id) || {};
            const mb = memberById(b.person_id) || {};
            return (
              <li key={`${a.id}:${b.id}`}>
                <b style={{ color: ma.color || 'inherit' }}>{ma.name || 'Unknown'}</b> · {a.demo_topic}
                &nbsp;⇄&nbsp;
                <b style={{ color: mb.color || 'inherit' }}>{mb.name || 'Unknown'}</b> · {b.demo_topic}
                <span className={styles.date}> — {formatDate(a.date)}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <button className={styles.iconBtn} type="button" onClick={onDismiss} aria-label="Dismiss conflict warning">
        &times;
      </button>
    </div>
  );
}
