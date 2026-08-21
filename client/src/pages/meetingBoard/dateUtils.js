/* Timezone / date utilities — ported verbatim from Meeting Board.html.
   Every function here matches the original's logic 1:1 (same offset
   math, same rounding, same weekday handling) so meeting times convert
   across zones exactly as before. */

export const ZONES = [
  { label: 'EST', iana: 'America/New_York' },
  { label: 'CST', iana: 'America/Chicago' },
  { label: 'MST', iana: 'America/Denver' },
  { label: 'PST', iana: 'America/Los_Angeles' },
  { label: 'IST', iana: 'Asia/Kolkata' },
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const BP = { mobile: 767, tablet: 1023 };

/** Which responsive "bucket" a given width falls into. Defaults to the
 *  live window width, but accepts one explicitly so callers can gate a
 *  state update on "did the bucket actually change". */
export function currentBucket(width = (typeof window !== 'undefined' ? window.innerWidth : 1280)) {
  if (width <= BP.mobile) return 'mobile';
  if (width <= BP.tablet) return 'tablet';
  return 'desktop';
}

/** How many day columns the calendar shows at a given width. */
export function calDayCount(width = (typeof window !== 'undefined' ? window.innerWidth : 1280)) {
  if (width <= 520) return 2;
  if (width <= BP.mobile) return 3;
  if (width <= BP.tablet) return 5;
  return 7;
}

function getParts(date, ianaZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: parseInt(parts.year),
    month: parseInt(parts.month),
    day: parseInt(parts.day),
    hour: parseInt(parts.hour) % 24,
    minute: parseInt(parts.minute),
    second: parseInt(parts.second),
  };
}

export function toUTC(dateStr, timeStr, ianaZone) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const localDt = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const utcParts = getParts(localDt, 'UTC');
  const zoneParts = getParts(localDt, ianaZone);
  const offsetMs = ((utcParts.hour * 60 + utcParts.minute) - (zoneParts.hour * 60 + zoneParts.minute)) * 60000;
  return new Date(localDt.getTime() + offsetMs);
}

export function fromUTC(utcDate, ianaZone) {
  const p = getParts(utcDate, ianaZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function fromUTCFull(utcDate, ianaZone) {
  return getParts(utcDate, ianaZone);
}

export function getMeetingUTCRange(meeting) {
  const zone = ZONES[meeting.zone_index] || ZONES[0];
  const startUTC = toUTC(meeting.date, meeting.time, zone.iana);
  const endUTC = new Date(startUTC.getTime() + meeting.duration * 60000);
  return { startUTC, endUTC };
}

export function doMeetingsOverlap(a, b) {
  const ra = getMeetingUTCRange(a);
  const rb = getMeetingUTCRange(b);
  return ra.startUTC < rb.endUTC && rb.startUTC < ra.endUTC;
}

export function getConflictingIds(meetings) {
  const conflicting = new Set();
  for (let i = 0; i < meetings.length; i++) {
    for (let j = i + 1; j < meetings.length; j++) {
      if (doMeetingsOverlap(meetings[i], meetings[j])) {
        conflicting.add(meetings[i].id);
        conflicting.add(meetings[j].id);
      }
    }
  }
  return conflicting;
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** Which day column (in the chosen display zone) a meeting falls in. */
export function meetingLocalDay(m, targetZone) {
  const mz = ZONES[m.zone_index] || ZONES[0];
  const p = fromUTCFull(toUTC(m.date, m.time, mz.iana), targetZone.iana);
  return { dayStr: toDateStr(new Date(p.year, p.month - 1, p.day)), hour: p.hour, minute: p.minute };
}

const MIN_HOUR_SPAN = 9;

/** Only span the hours actually in use (padded by one), so calendar rows
 *  stay tall enough to read instead of always rendering a fixed range. */
export function calHourRange(meetings, targetZone, days) {
  const dayStrs = new Set(days.map(toDateStr));
  let lo = 24, hi = 0, found = false;

  meetings.forEach((m) => {
    const p = meetingLocalDay(m, targetZone);
    if (!dayStrs.has(p.dayStr)) return;
    found = true;
    const start = p.hour + p.minute / 60;
    lo = Math.min(lo, Math.floor(start));
    hi = Math.max(hi, Math.ceil(start + (Number(m.duration) || 30) / 60));
  });

  if (!found) { lo = 8; hi = 20; }
  lo = Math.max(0, lo - 1);
  hi = Math.min(24, hi + 1);

  if (hi - lo < MIN_HOUR_SPAN) {
    const need = MIN_HOUR_SPAN - (hi - lo);
    const up = Math.min(lo, Math.ceil(need / 2));
    lo -= up;
    hi = Math.min(24, hi + (need - up));
    if (hi - lo < MIN_HOUR_SPAN) lo = Math.max(0, hi - MIN_HOUR_SPAN);
  }
  return { lo, hi };
}

/** The `dayCount` consecutive days starting at `weekStart` — the set the
 *  calendar currently shows. */
export function visibleDays(weekStart, dayCount) {
  return Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function calWeekLabel(days) {
  const fmtD = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return days.length === 1
    ? days[0].toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : `${fmtD(days[0])} – ${fmtD(days[days.length - 1])}, ${days[days.length - 1].getFullYear()}`;
}
