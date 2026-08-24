import { ZONES, toDateStr, meetingLocalDay } from '../meetingBoard/dateUtils.js';
import { CST_ZONE_IDX } from './slotUtils.js';
import styles from './MonthGrid.module.css';

const CST = ZONES[CST_ZONE_IDX];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A standard month grid, Monday–Saturday (no Sunday column). Each day
 *  shows how many meetings (CST-local) fall on it; clicking a day jumps
 *  into the week view for that week. */
export function MonthGrid({ month, year, meetings, onSelectDay }) {
  const todayStr = toDateStr(new Date());
  const firstWeekday = new Date(year, month, 1).getDay(); // 0=Sun..6=Sat
  const leadingBlanks = firstWeekday === 0 ? 0 : firstWeekday - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const counts = {};
  meetings.forEach((m) => {
    const p = meetingLocalDay(m, CST);
    counts[p.dayStr] = (counts[p.dayStr] || 0) + 1;
  });

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month, d).getDay() === 0) continue; // skip Sundays entirely
    cells.push(d);
  }
  while (cells.length % 6 !== 0) cells.push(null);

  return (
    <div className={styles.wrap}>
      <div className={styles.weekdays}>
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className={styles.grid}>
        {cells.map((d, i) => {
          if (d == null) return <div key={i} className={styles.blank} />;
          const date = new Date(year, month, d);
          const ds = toDateStr(date);
          const count = counts[ds] || 0;
          return (
            <button
              key={i}
              type="button"
              className={`${styles.dayCell} ${ds === todayStr ? styles.today : ''}`}
              onClick={() => onSelectDay(date)}
            >
              <span className={styles.dayNum}>{d}</span>
              {count > 0 && <span className={styles.dayCount}>{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
