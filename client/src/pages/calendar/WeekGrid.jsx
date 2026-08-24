import { ZONES, toDateStr, meetingLocalDay } from '../meetingBoard/dateUtils.js';
import { SLOTS, SLOT_START_MIN, CST_ZONE_IDX, slotTimeStr, slotZoneTimes } from './slotUtils.js';
import styles from './WeekGrid.module.css';

const CST = ZONES[CST_ZONE_IDX];

/** The fixed 8:00 AM – 1:00 PM CST / 30-minute slot grid for one week.
 *  Each row shows the slot's CST time plus the same instant converted
 *  into every other configured zone. Existing meetings that fall inside
 *  the window occupy their slot (spanning rows for longer meetings);
 *  every other slot is an empty, clickable "book this slot" cell. */
export function WeekGrid({ days, meetings, members, onSlotClick, onOpenMeeting }) {
  const todayStr = toDateStr(new Date());
  const dayStrs = days.map(toDateStr);

  const placement = {};
  const covered = {};
  dayStrs.forEach((ds) => { placement[ds] = {}; covered[ds] = new Set(); });

  meetings.forEach((m) => {
    const p = meetingLocalDay(m, CST);
    if (!placement[p.dayStr]) return;
    const startMin = p.hour * 60 + p.minute;
    if (startMin < SLOT_START_MIN || startMin >= SLOT_START_MIN + SLOTS.length * 30) return;
    const startIdx = Math.floor((startMin - SLOT_START_MIN) / 30);
    const span = Math.max(1, Math.min(Math.ceil((Number(m.duration) || 30) / 30), SLOTS.length - startIdx));
    placement[p.dayStr][startIdx] = { meeting: m, span };
    for (let i = startIdx + 1; i < startIdx + span; i++) covered[p.dayStr].add(i);
  });

  return (
    <div className={styles.wrap}>
      <table className={styles.grid}>
        <thead>
          <tr>
            <th className={styles.corner} />
            {days.map((d) => {
              const ds = toDateStr(d);
              return (
                <th key={ds} className={`${styles.dayHead} ${ds === todayStr ? styles.today : ''}`}>
                  <span className={styles.dow}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                  <span className={styles.dom}>{d.getDate()}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {SLOTS.map((slot) => {
            const zoneTimes = slotZoneTimes(dayStrs[0], slot);
            const cst = zoneTimes[CST_ZONE_IDX];
            const others = zoneTimes.filter((_, i) => i !== CST_ZONE_IDX);
            return (
              <tr key={slot.index}>
                <th className={styles.gutter} scope="row">
                  <span className={styles.gutterCst}>{cst.text} <b>CST</b></span>
                  <span className={styles.gutterOthers}>{others.map((z) => `${z.text} ${z.label}`).join(' · ')}</span>
                </th>
                {dayStrs.map((ds) => {
                  if (covered[ds].has(slot.index)) return null;
                  const cell = placement[ds][slot.index];
                  if (cell) {
                    const member = members.find((mm) => mm.id === cell.meeting.person_id) || {};
                    return (
                      <td key={ds} className={styles.eventCell} rowSpan={cell.span}>
                        <button
                          type="button"
                          className={styles.event}
                          style={{ background: member.color || 'var(--accent)' }}
                          onClick={() => onOpenMeeting(cell.meeting.id)}
                          title={`${member.name || ''} · ${cell.meeting.demo_topic || ''}`}
                        >
                          <span className={styles.evTitle}>{cell.meeting.demo_topic || 'Meeting'}</span>
                          <span className={styles.evSub}>{member.name}</span>
                        </button>
                      </td>
                    );
                  }
                  return (
                    <td key={ds} className={styles.emptyCell}>
                      <button
                        type="button"
                        className={styles.addBtn}
                        onClick={() => onSlotClick(ds, slotTimeStr(slot))}
                        aria-label={`Schedule a meeting on ${ds} at ${slotTimeStr(slot)} CST`}
                      >
                        +
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
