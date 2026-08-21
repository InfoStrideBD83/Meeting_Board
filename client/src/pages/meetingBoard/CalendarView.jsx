import { useEffect, useRef } from 'react';
import { ico } from './icons.jsx';
import {
  ZONES, toDateStr, meetingLocalDay, calHourRange, calWeekLabel, getConflictingIds, fromUTCFull,
} from './dateUtils.js';
import styles from './CalendarView.module.css';

/* The prev/today/next + zone-select strip — ported from Meeting Board.html's
   renderCalNav(). Rendered inside the shared toolbar in place of the month
   picker whenever state.view === 'calendar', exactly like the original. */
export function CalendarNav({ days, calendarZoneIdx, onShiftWeek, onJumpToday, onZoneChange }) {
  const n = days.length;
  return (
    <>
      <div className={styles.calNav}>
        <button type="button" className="btn btn-icon" onClick={() => onShiftWeek(-n)} aria-label={`Previous ${n} days`}>{ico.chevL}</button>
        <button type="button" className="btn" onClick={onJumpToday}>Today</button>
        <button type="button" className="btn btn-icon" onClick={() => onShiftWeek(n)} aria-label={`Next ${n} days`}>{ico.chevR}</button>
      </div>
      <span className={styles.weekLabel}>{calWeekLabel(days)}</span>
      <select
        className={styles.fieldSelect}
        aria-label="Display timezone"
        value={calendarZoneIdx}
        onChange={(e) => onZoneChange(Number(e.target.value))}
      >
        {ZONES.map((z, i) => (
          <option key={z.label} value={i}>Show in {z.label} — {z.iana.split('/')[1].replace('_', ' ')}</option>
        ))}
      </select>
    </>
  );
}

/* The timezone-aware calendar grid — ported from Meeting Board.html's
   renderCalendar(). `meetings` should already be scoped to the visible
   days (the parent's getFilteredMeetings does this for calendar view).
   Height is fit to the remaining viewport space via --cal-h, same as the
   original's fitCalendar(), and short event blocks drop their subtitle
   line ("compact") once they measure under 34px tall. */
export function CalendarView({ meetings, members, days, calendarZoneIdx, onOpenMeeting }) {
  const targetZone = ZONES[calendarZoneIdx];
  const scrollRef = useRef(null);

  useEffect(() => {
    function fit() {
      const scroll = scrollRef.current;
      if (!scroll) return;
      const top = scroll.getBoundingClientRect().top;
      const avail = Math.max(200, window.innerHeight - top - 16);
      scroll.style.setProperty('--cal-h', avail + 'px');
      scroll.querySelectorAll(`.${styles.calEvent}`).forEach((ev) => {
        ev.classList.toggle(styles.compact, ev.offsetHeight < 34);
      });
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });

  const { lo, hi } = calHourRange(meetings, targetZone, days);
  const hours = hi - lo;
  const totalMin = hours * 60;
  const pct = (min) => (min / totalMin) * 100;

  const conflictIds = getConflictingIds(meetings);
  const now = new Date();
  const nowParts = fromUTCFull(now, targetZone.iana);
  const nowMin = nowParts.hour * 60 + nowParts.minute;
  const todayStr = toDateStr(now);

  return (
    <div className={styles.calCard}>
      <div className={styles.calScroll} ref={scrollRef} id="calScroll">
        <div className={styles.calGrid} style={{ '--days': days.length }}>
          <div className={styles.calCorner} />
          {days.map((d) => {
            const isToday = toDateStr(d) === todayStr;
            return (
              <div key={d.toISOString()} className={`${styles.calDayhead} ${isToday ? styles.today : ''}`}>
                <span className={styles.dow}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span className={styles.dom}>{d.getDate()}</span>
              </div>
            );
          })}

          <div className={styles.calGutter}>
            {Array.from({ length: hours }, (_, h) => (
              <div key={h} className={`${styles.gutterHour} ${styles.mono}`}>{String(lo + h).padStart(2, '0')}</div>
            ))}
          </div>

          {days.map((d) => {
            const dayStr = toDateStr(d);
            const isToday = dayStr === todayStr;
            const dayMtgs = meetings
              .filter((m) => meetingLocalDay(m, targetZone).dayStr === dayStr)
              .map((m) => {
                const p = meetingLocalDay(m, targetZone);
                const s = p.hour * 60 + p.minute;
                return { m, p, s, e: s + (Number(m.duration) || 30) };
              })
              .sort((a, b) => a.s - b.s || a.e - b.e);

            const laneEnds = [];
            dayMtgs.forEach((item) => {
              let lane = laneEnds.findIndex((end) => end <= item.s);
              if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.e); }
              else laneEnds[lane] = item.e;
              item.lane = lane;
            });
            const laneCount = Math.max(1, laneEnds.length);

            return (
              <div key={dayStr} className={`${styles.calCol} ${isToday ? styles.isToday : ''}`}>
                {Array.from({ length: hours }, (_, h) => (
                  <div key={h} className={styles.hrLine} style={{ top: `${pct(h * 60)}%` }} />
                ))}

                {isToday && nowMin >= lo * 60 && nowMin <= hi * 60 && (
                  <div className={styles.nowLine} style={{ top: `${pct(nowMin - lo * 60)}%` }} />
                )}

                {dayMtgs.map(({ m, p, s: startMin, e: endMin, lane }) => {
                  const member = members.find((x) => x.id === m.person_id) || {};
                  const dur = endMin - startMin;
                  const clock = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
                  const endClock = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
                  const topPct = pct(startMin - lo * 60);
                  const hPct = Math.min(Math.max(pct(dur), pct(10)), 100 - topPct);
                  const wPct = 100 / laneCount;
                  const conflict = conflictIds.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`${styles.calEvent} ${conflict ? styles.conflict : ''}`}
                      style={{
                        top: `${topPct}%`, height: `${hPct}%`,
                        left: `calc(${lane * wPct}% + 2px)`, right: 'auto', width: `calc(${wPct}% - 4px)`,
                        background: member.color || 'var(--accent)',
                      }}
                      onClick={() => onOpenMeeting(m.id)}
                      title={`${member.name} · ${m.demo_topic} · ${clock}–${endClock} ${targetZone.label}${conflict ? ' · CLASHES' : ''}`}
                    >
                      <span className={styles.evTitle}>{m.demo_topic}</span>
                      <span className={styles.evSub}>{clock} · {member.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
