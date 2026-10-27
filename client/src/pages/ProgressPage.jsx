import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, clearToken } from '../api/client.js';
import { AppHeader } from '../components/AppHeader.jsx';
import { AmbientBackdrop } from '../components/AmbientBackdrop.jsx';
import styles from './ProgressPage.module.css';

// The 5 real statuses (see server VALID_STATUS) collapse into exactly 3
// buckets for this page's Status filter — they partition the enum with no
// overlap, so Scheduled + Canceled + Completed always sums to the Total.
const STATUS_GROUPS = {
  all: { label: 'All (Total)', test: () => true },
  scheduled: { label: 'Scheduled', test: (s) => s === 'Demo Scheduled' || s === 'Demo Re-scheduled' || s === 'Demo In Progress' },
  canceled: { label: 'Canceled', test: (s) => s === 'Demo Canceled' },
  completed: { label: 'Completed', test: (s) => s === 'Demo Completed' },
};

const PERIODS = {
  month: { label: 'Month', unit: 'day', count: 30 },
  quarter: { label: 'Quarter', unit: 'week', count: 13 },
  year: { label: 'Year', unit: 'month', count: 12 },
};

/** Animates a number counting up/down to `target` over ~600ms whenever it
 *  changes, instead of just snapping — the one thing in the toolbar that
 *  visibly "lives" in sync with the chart redrawing. */
function useCountUp(target) {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return undefined;
    const start = performance.now();
    const duration = 600;
    let raf;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return shown;
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateStr(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Builds the x-axis buckets for a period, each a date range plus a
 *  `match(dateStr)` test against a meeting's plain "YYYY-MM-DD" date. */
function buildBuckets(periodKey) {
  const period = PERIODS[periodKey];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];

  if (period.unit === 'day') {
    for (let i = period.count - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = toDateStr(d);
      buckets.push({
        key,
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        start: d,
        end: d,
        match: (dateStr) => dateStr === key,
      });
    }
  } else if (period.unit === 'week') {
    for (let i = period.count - 1; i >= 0; i--) {
      const end = new Date(today);
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      buckets.push({
        key: toDateStr(start),
        label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        start,
        end,
        match: (dateStr) => {
          const d = parseDateStr(dateStr);
          return d >= start && d <= end;
        },
      });
    }
  } else {
    for (let i = period.count - 1; i >= 0; i--) {
      const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
      const ym = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      buckets.push({
        key: ym,
        label: start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        start,
        end,
        match: (dateStr) => String(dateStr).slice(0, 7) === ym,
      });
    }
  }
  return buckets;
}

/** Rounds a max value up to a "nice" gridline ceiling (1/2/5/10 × 10^n). */
function niceMax(n) {
  if (n <= 5) return Math.max(1, Math.ceil(n));
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)));
  const residual = n / magnitude;
  let niceResidual;
  if (residual > 5) niceResidual = 10;
  else if (residual > 2) niceResidual = 5;
  else if (residual > 1) niceResidual = 2;
  else niceResidual = 1;
  return niceResidual * magnitude;
}

/** Custom inline SVG line chart — this app has no charting library and
 *  this is the only place that needs one, so a small bespoke component
 *  beats a new dependency. Responsive via viewBox; a crosshair + per-series
 *  hover tooltip follows the pointer (dataviz skill: line/area charts ship
 *  hover by default). Series identity rides on each member's existing
 *  `.color` (the same hex already used by Avatar everywhere else in the
 *  app), named in a legend/tooltip rather than left as color-only. */
function ProgressChart({ buckets, series, animKey }) {
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  const W = 960, H = 190;
  const padL = 36, padR = 16, padT = 14, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = buckets.length;

  const allValues = series.length ? series.flatMap((s) => s.values) : [0];
  const maxVal = niceMax(Math.max(1, ...allValues));

  function xAt(i) { return padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW); }
  function yAt(v) { return padT + innerH - (v / maxVal) * innerH; }

  function handleMove(e) {
    if (!svgRef.current || n === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let idx = Math.round(((relX - padL) / innerW) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));
    setHoverIdx(idx);
  }

  const ySteps = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxVal * f));
  const xLabelEvery = n <= 13 ? 1 : n <= 31 ? 5 : Math.max(1, Math.ceil(n / 12));

  return (
    <div className={styles.chartWrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={styles.chartSvg}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Meeting counts over time by team member"
      >
        <defs>
          {series.map((s) => {
            const color = s.member.color || 'var(--accent)';
            const gid = `pp-grad-${s.member.id}`;
            return (
              <linearGradient key={gid} id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.32" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            );
          })}
        </defs>

        {ySteps.map((v, vi) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={yAt(v)} y2={yAt(v)} className={styles.gridLine} style={{ animationDelay: `${vi * 45}ms` }} />
            <text x={padL - 8} y={yAt(v)} className={styles.axisLabel} style={{ animationDelay: `${vi * 45 + 80}ms` }} textAnchor="end" dominantBaseline="middle">{v}</text>
          </g>
        ))}
        {buckets.map((b, i) => (
          i % xLabelEvery === 0 ? (
            <text
              key={b.key}
              x={xAt(i)}
              y={H - 8}
              className={`${styles.axisLabel} ${styles.axisLabelX}`}
              style={{ animationDelay: `${120 + (i / xLabelEvery) * 25}ms` }}
              textAnchor="middle"
            >
              {b.label}
            </text>
          ) : null
        ))}
        {hoverIdx !== null && (
          <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={padT} y2={H - padB} className={styles.hoverLine} />
        )}
        {series.map((s, si) => {
          const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`).join(' ');
          const areaD = `${d} L ${xAt(n - 1).toFixed(2)} ${H - padB} L ${xAt(0).toFixed(2)} ${H - padB} Z`;
          const color = s.member.color || 'var(--accent)';
          const lastIdx = s.values.length - 1;
          const delay = si * 70;
          return (
            // Keyed on the active filters so every animation below replays
            // whenever Period/Status/Member changes, not just on first mount.
            <g key={`${animKey}-${s.member.id}`}>
              <path
                d={areaD}
                className={styles.seriesArea}
                style={{ animationDelay: `${delay}ms` }}
                fill={`url(#pp-grad-${s.member.id})`}
                stroke="none"
              />
              <path
                d={d}
                pathLength="1"
                className={styles.seriesLine}
                style={{ animationDelay: `${delay}ms` }}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.values.map((v, i) => (
                <circle
                  key={i}
                  cx={xAt(i)}
                  cy={yAt(v)}
                  r="2.2"
                  className={styles.pointDot}
                  style={{ animationDelay: `${delay + i * (n > 20 ? 10 : 22)}ms` }}
                  fill={color}
                />
              ))}
              {lastIdx >= 0 && (
                <g className={styles.livePoint} style={{ animationDelay: `${delay + 500}ms` }}>
                  <circle cx={xAt(lastIdx)} cy={yAt(s.values[lastIdx])} r="4" className={styles.liveRing} stroke={color} fill="none" />
                  <circle cx={xAt(lastIdx)} cy={yAt(s.values[lastIdx])} r="2.6" fill={color} />
                </g>
              )}
              {hoverIdx !== null && (
                <circle cx={xAt(hoverIdx)} cy={yAt(s.values[hoverIdx])} r="4" fill={color} stroke="var(--panel)" strokeWidth="1.5" />
              )}
            </g>
          );
        })}
      </svg>

      {hoverIdx !== null && buckets[hoverIdx] && (
        <div className={styles.tooltip} style={{ left: `${(xAt(hoverIdx) / W) * 100}%` }}>
          <div className={styles.tooltipDate}>{buckets[hoverIdx].label}</div>
          {series.slice().sort((a, b) => b.values[hoverIdx] - a.values[hoverIdx]).map((s) => (
            <div key={s.member.id} className={styles.tooltipRow}>
              <span className={styles.tooltipSwatch} style={{ background: s.member.color || 'var(--accent)' }} />
              <span className={styles.tooltipName}>{s.member.name}</span>
              <span className={styles.tooltipVal}>{s.values[hoverIdx]}</span>
            </div>
          ))}
        </div>
      )}

      {series.length > 1 && (
        <div className={styles.legend}>
          {series.map((s) => (
            <span key={s.member.id} className={styles.legendItem}>
              <span className={styles.legendSwatch} style={{ background: s.member.color || 'var(--accent)' }} />
              {s.member.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Meeting Progress — a team-wide dashboard, open to every signed-in member
 *  (not admin-gated; contrast the separate admin-only PresenceWidget).
 *  Everything is aggregated client-side from the existing /meetings and
 *  /members endpoints — no backend changes needed for this page. */
export function ProgressPage() {
  const navigate = useNavigate();

  const [meetings, setMeetings] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [period, setPeriod] = useState('year');
  const [statusKey, setStatusKey] = useState('all');
  const [memberId, setMemberId] = useState('all');

  const bootstrap = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([apiFetch('/meetings'), apiFetch('/members')])
      .then(([meetingsRes, membersRes]) => {
        setMeetings(meetingsRes);
        setMembers(membersRes);
        setLoading(false);
      })
      .catch((err) => {
        if (err.status === 401) {
          clearToken();
          navigate('/login', { replace: true });
          return;
        }
        setLoadError(err.message || 'Unknown error');
        setLoading(false);
      });
  }, [navigate]);

  useEffect(() => { bootstrap(); }, [bootstrap]);
  useEffect(() => { document.title = 'InfoStride · Meeting Progress'; }, []);

  const buckets = useMemo(() => buildBuckets(period), [period]);
  const statusTest = STATUS_GROUPS[statusKey].test;
  const selectedMembers = memberId === 'all' ? members : members.filter((m) => m.id === memberId);

  const series = useMemo(
    () => selectedMembers.map((m) => ({
      member: m,
      values: buckets.map((b) => meetings.filter((mt) => mt.person_id === m.id && statusTest(mt.status) && b.match(mt.date)).length),
    })),
    [selectedMembers, meetings, buckets, statusTest]
  );

  const tableRows = useMemo(() => {
    if (!buckets.length) return [];
    const rangeStart = buckets[0].start;
    const rangeEnd = buckets[buckets.length - 1].end;
    const inRange = (dateStr) => {
      const d = parseDateStr(dateStr);
      return d >= rangeStart && d <= rangeEnd;
    };
    return selectedMembers
      .map((m) => {
        const mine = meetings.filter((mt) => mt.person_id === m.id && inRange(mt.date));
        const scheduled = mine.filter((mt) => STATUS_GROUPS.scheduled.test(mt.status)).length;
        const canceled = mine.filter((mt) => STATUS_GROUPS.canceled.test(mt.status)).length;
        const completed = mine.filter((mt) => STATUS_GROUPS.completed.test(mt.status)).length;
        return { member: m, scheduled, canceled, completed, total: scheduled + canceled + completed };
      })
      .sort((a, b) => b.total - a.total);
  }, [selectedMembers, meetings, buckets]);

  const totalForPeriod = tableRows.reduce((sum, r) => sum + r.total, 0);
  const shownTotal = useCountUp(totalForPeriod);

  return (
    <>
      <AmbientBackdrop />
      <AppHeader showBrand />

      <main className={styles.main}>
        <div className={styles.mainContent}>
          {loading ? (
            <div className={`${styles.card} ${styles.empty}`}><h4>Loading…</h4></div>
          ) : loadError ? (
            <div className={`${styles.card} ${styles.empty}`}>
              <h4>Could not load this page</h4>
              <p>{loadError}</p>
            </div>
          ) : (
            <>
              <div className={`${styles.card} ${styles.toolbar} reveal`}>
                <div className={styles.toolbarRow}>
                  <div className={styles.fgroup}>
                    <label htmlFor="pp_period">Period</label>
                    <select id="pp_period" className={styles.control} value={period} onChange={(e) => setPeriod(e.target.value)}>
                      {Object.entries(PERIODS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className={styles.fgroup}>
                    <label htmlFor="pp_status">Status</label>
                    <select id="pp_status" className={styles.control} value={statusKey} onChange={(e) => setStatusKey(e.target.value)}>
                      {Object.entries(STATUS_GROUPS).map(([key, g]) => <option key={key} value={key}>{g.label}</option>)}
                    </select>
                  </div>
                  <div className={styles.fgroup}>
                    <label htmlFor="pp_member">Member</label>
                    <select id="pp_member" className={styles.control} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                      <option value="all">All members</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className={styles.toolbarStat}>
                    <span className={styles.toolbarStatNum}>{shownTotal}</span>
                    <span className={styles.toolbarStatLabel}>meetings this {PERIODS[period].label.toLowerCase()}</span>
                  </div>
                </div>
              </div>

              <div className={`${styles.card} ${styles.chartCard} reveal d1`}>
                {series.length === 0 || meetings.length === 0 ? (
                  <div className={styles.empty}>
                    <h4>No meeting data yet</h4>
                    <p>Once meetings are scheduled, this chart will show trends over time.</p>
                  </div>
                ) : (
                  <ProgressChart buckets={buckets} series={series} animKey={`${period}:${statusKey}:${memberId}`} />
                )}
              </div>

              {tableRows.length > 0 && (
                <div className={`${styles.tableCard} reveal d2`}>
                  <div className={styles.tableScroll}>
                    <table className={styles.tbl}>
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th className={styles.c}>Scheduled</th>
                          <th className={styles.c}>Canceled</th>
                          <th className={styles.c}>Completed</th>
                          <th className={styles.c}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((r, idx) => (
                          <tr key={r.member.id} style={{ animationDelay: `${Math.min(idx, 20) * 25}ms` }}>
                            <td>
                              <span className={styles.personCell}>
                                <span className={styles.personDot} style={{ background: r.member.color || 'var(--accent)' }} />
                                <span className={styles.personName}>{r.member.name}</span>
                              </span>
                            </td>
                            <td className={styles.c}>{r.scheduled}</td>
                            <td className={styles.c}>{r.canceled}</td>
                            <td className={styles.c}>{r.completed}</td>
                            <td className={`${styles.c} ${styles.totalCell}`}>{r.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
