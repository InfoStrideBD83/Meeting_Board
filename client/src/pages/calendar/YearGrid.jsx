import { MONTH_SHORT } from '../meetingBoard/dateUtils.js';
import styles from './YearGrid.module.css';

// Monday–Saturday only, matching the week/month views — Sundays are
// skipped entirely rather than shown as a column.
function miniMonthCells(month, year) {
  const firstWeekday = new Date(year, month, 1).getDay(); // 0=Sun..6=Sat
  const leadingBlanks = firstWeekday === 0 ? 0 : firstWeekday - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month, d).getDay() === 0) continue;
    cells.push(d);
  }
  return cells;
}

/** A 12-month, year-at-a-glance grid. Clicking a month jumps into the
 *  month view for that month. */
export function YearGrid({ year, onSelectMonth }) {
  const today = new Date();

  return (
    <div className={styles.grid}>
      {MONTH_SHORT.map((mn, mi) => (
        <button key={mn} type="button" className={styles.miniMonth} onClick={() => onSelectMonth(mi)}>
          <div className={styles.miniTitle}>{mn}</div>
          <div className={styles.miniGrid}>
            {miniMonthCells(mi, year).map((d, i) => {
              const isToday = d != null && year === today.getFullYear() && mi === today.getMonth() && d === today.getDate();
              return (
                <span key={i} className={`${styles.miniDay} ${isToday ? styles.miniToday : ''}`}>{d || ''}</span>
              );
            })}
          </div>
        </button>
      ))}
    </div>
  );
}
