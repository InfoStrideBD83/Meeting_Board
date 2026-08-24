import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, clearToken } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { AppHeader } from '../components/AppHeader.jsx';
import { AmbientBackdrop } from '../components/AmbientBackdrop.jsx';
import { ico } from './meetingBoard/icons.jsx';
import { MONTH_NAMES, getWeekStart, visibleDays, calWeekLabel, toDateStr } from './meetingBoard/dateUtils.js';
import { MeetingModal } from './meetingBoard/MeetingModal.jsx';
import { WeekGrid } from './calendar/WeekGrid.jsx';
import { MonthGrid } from './calendar/MonthGrid.jsx';
import { YearGrid } from './calendar/YearGrid.jsx';
import { CST_ZONE_IDX } from './calendar/slotUtils.js';
import styles from './CalendarPage.module.css';

const todayObj = new Date();

/* A dedicated booking calendar, separate from Meeting Board's own
   table/calendar tabs: a fixed 8:00 AM – 1:00 PM CST slot grid (week
   view), plus month/year navigation to jump between weeks. Reuses the
   same /meetings + /members data and the same MeetingModal as Meeting
   Board, so a slot booked here shows up there too and vice versa. */
export function CalendarPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState([]);
  const [meetingsData, setMeetingsData] = useState([]);
  const [currentMember, setCurrentMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [view, setView] = useState('week');
  const [weekStart, setWeekStart] = useState(() => getWeekStart(todayObj));
  const [monthCursor, setMonthCursor] = useState({ month: todayObj.getMonth(), year: todayObj.getFullYear() });
  const [yearCursor, setYearCursor] = useState(todayObj.getFullYear());

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMeeting, setModalMeeting] = useState(null);

  const days = useMemo(() => visibleDays(weekStart, 7), [weekStart]);

  const bootstrap = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([apiFetch('/auth/me'), apiFetch('/members'), apiFetch('/meetings')])
      .then(([meRes, membersRes, meetingsRes]) => {
        setMembers(membersRes);
        setCurrentMember(membersRes.find((m) => m.id === meRes.member.id) || null);
        setMeetingsData(meetingsRes);
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
  useEffect(() => { document.title = 'InfoStride · Calendar'; }, []);

  const canManageMeeting = useCallback(
    (m) => isAdmin || Boolean(currentMember && m.person_id === currentMember.id),
    [isAdmin, currentMember]
  );

  function saveMeeting(fm) {
    const isEdit = Boolean(fm.id);
    const payload = { ...fm };
    delete payload.id;
    const request = isEdit
      ? apiFetch('/meetings/' + encodeURIComponent(fm.id), { method: 'PATCH', body: payload })
      : apiFetch('/meetings', { method: 'POST', body: payload });
    request.then((saved) => {
      setMeetingsData((prev) => (isEdit ? prev.map((m) => (m.id === saved.id ? saved : m)) : prev.concat([saved])));
      setModalOpen(false);
    }).catch((err) => alert(err.message || 'Could not save this meeting.'));
  }

  function deleteMeeting(id) {
    const m = meetingsData.find((x) => x.id === id);
    if (!m) return;
    if (!canManageMeeting(m)) { alert('Only the person this meeting is scheduled by, or an admin, can delete it.'); return; }
    if (window.confirm(`Delete "${m.demo_topic}"?\n\nThis cannot be undone.`)) {
      apiFetch('/meetings/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(() => setMeetingsData((prev) => prev.filter((x) => x.id !== id)))
        .catch((err) => alert(err.message || 'Could not delete this meeting.'));
    }
  }

  function openExistingMeeting(id) {
    const existing = meetingsData.find((m) => m.id === id);
    if (!existing || !canManageMeeting(existing)) {
      alert('Only the person this meeting is scheduled by, or an admin, can edit it.');
      return;
    }
    setModalMeeting(existing);
    setModalOpen(true);
  }

  function openNewSlot(dateStr, timeStr) {
    setModalMeeting({ date: dateStr, time: timeStr, zone_index: CST_ZONE_IDX });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); }

  useEffect(() => {
    function onKeyDown(e) { if (e.key === 'Escape' && modalOpen) closeModal(); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modalOpen]);

  function goToday() {
    if (view === 'week') setWeekStart(getWeekStart(new Date()));
    else if (view === 'month') setMonthCursor({ month: todayObj.getMonth(), year: todayObj.getFullYear() });
    else setYearCursor(todayObj.getFullYear());
  }

  function navPrev() {
    if (view === 'week') setWeekStart((s) => { const d = new Date(s); d.setDate(d.getDate() - 7); return d; });
    else if (view === 'month') setMonthCursor((c) => (c.month === 0 ? { month: 11, year: c.year - 1 } : { month: c.month - 1, year: c.year }));
    else setYearCursor((y) => y - 1);
  }
  function navNext() {
    if (view === 'week') setWeekStart((s) => { const d = new Date(s); d.setDate(d.getDate() + 7); return d; });
    else if (view === 'month') setMonthCursor((c) => (c.month === 11 ? { month: 0, year: c.year + 1 } : { month: c.month + 1, year: c.year }));
    else setYearCursor((y) => y + 1);
  }

  function selectDay(date) {
    setWeekStart(getWeekStart(date));
    setView('week');
  }
  function selectMonth(monthIdx) {
    setMonthCursor({ month: monthIdx, year: yearCursor });
    setView('month');
  }

  const periodLabel = view === 'week'
    ? calWeekLabel(days)
    : view === 'month'
      ? `${MONTH_NAMES[monthCursor.month]} ${monthCursor.year}`
      : `${yearCursor}`;

  return (
    <>
      <AmbientBackdrop />
      <AppHeader showBrand>
        <div className={styles.segmented} role="tablist" aria-label="View">
          <button type="button" className={styles.seg} role="tab" aria-selected={view === 'week'} onClick={() => setView('week')}>Week</button>
          <button type="button" className={styles.seg} role="tab" aria-selected={view === 'month'} onClick={() => setView('month')}>Month</button>
          <button type="button" className={styles.seg} role="tab" aria-selected={view === 'year'} onClick={() => { setYearCursor(monthCursor.year); setView('year'); }}>Year</button>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openNewSlot(toDateStr(new Date()), '08:00')} title="Schedule a new meeting">
          {ico.plus}<span className="btn-label-sm">New</span>
        </button>
      </AppHeader>

      <main className={styles.main}>
        {loading ? (
          <div className={styles.card} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>Loading…</div>
        ) : loadError ? (
          <div className={styles.card} style={{ textAlign: 'center', padding: '60px 20px' }}>
            <h4>Could not load this page</h4>
            <p style={{ color: 'var(--muted)', marginTop: 6 }}>{loadError}</p>
          </div>
        ) : (
          <>
            <div className={styles.toolbar}>
              <div className={styles.navGroup}>
                <button type="button" className={styles.navBtn} onClick={navPrev} aria-label="Previous">{ico.chevL}</button>
                <button type="button" className="btn" onClick={goToday}>Today</button>
                <button type="button" className={styles.navBtn} onClick={navNext} aria-label="Next">{ico.chevR}</button>
              </div>
              <span className={styles.periodLabel}>{periodLabel}</span>
              {view === 'week' && <span className={styles.hint}>Slots shown 8:00 AM – 1:00 PM CST</span>}
            </div>

            {view === 'week' && (
              <WeekGrid days={days} meetings={meetingsData} members={members} onSlotClick={openNewSlot} onOpenMeeting={openExistingMeeting} />
            )}
            {view === 'month' && (
              <MonthGrid month={monthCursor.month} year={monthCursor.year} meetings={meetingsData} onSelectDay={selectDay} />
            )}
            {view === 'year' && (
              <YearGrid year={yearCursor} onSelectMonth={selectMonth} />
            )}
          </>
        )}
      </main>

      {modalOpen && (
        <MeetingModal
          meeting={modalMeeting}
          members={members}
          isAdmin={isAdmin}
          currentMemberId={currentMember && currentMember.id}
          onSave={saveMeeting}
          onClose={closeModal}
          onDelete={deleteMeeting}
        />
      )}
    </>
  );
}
