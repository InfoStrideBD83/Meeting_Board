import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, clearToken } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { AppHeader } from '../components/AppHeader.jsx';
import { AmbientBackdrop } from '../components/AmbientBackdrop.jsx';
import { ico } from './meetingBoard/icons.jsx';
import {
  ZONES, MONTH_NAMES, MONTH_SHORT, currentBucket, calDayCount, visibleDays,
  getWeekStart, toDateStr, doMeetingsOverlap, meetingLocalDay,
} from './meetingBoard/dateUtils.js';
import { exportMeetingsToCSV } from './meetingBoard/csv.js';
import { ConflictBanner } from './meetingBoard/ConflictBanner.jsx';
import { TableView } from './meetingBoard/TableView.jsx';
import { CalendarNav, CalendarView } from './meetingBoard/CalendarView.jsx';
import { MeetingModal } from './meetingBoard/MeetingModal.jsx';
import styles from './MeetingBoardPage.module.css';

const todayObj = new Date();

/* ══════════════════════════════════════════════════════════════════
   MeetingBoardPage — ported from Meeting Board.html, the largest and
   last of the 7 pages. The original was one big template-literal
   `render()` pipeline over a single `state` object; this keeps the same
   state shape (see below) but as React state, and splits the render
   into TableView / CalendarView / MeetingModal / ConflictBanner, with
   this component owning bootstrap, the header, and the toolbar.
   ══════════════════════════════════════════════════════════════════ */
export function MeetingBoardPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState([]);
  const [meetingsData, setMeetingsData] = useState([]);
  const [currentMember, setCurrentMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ── state — same shape as the original's `let state = {...}` ────────
  const [view, setView] = useState('table');
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState({ month: todayObj.getMonth(), year: todayObj.getFullYear() });
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => getWeekStart(todayObj));
  const [calendarZoneIdx, setCalendarZoneIdx] = useState(4);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMeetingId, setModalMeetingId] = useState(null);
  const [popovers, setPopovers] = useState({ pocId: null, momId: null, actionsId: null, monthSelectorOpen: false });
  const [dismissedConflictKey, setDismissedConflictKey] = useState('');

  const bucket = currentBucket(width);
  const isMobile = bucket === 'mobile';
  const dayCount = calDayCount(width);
  const days = useMemo(() => visibleDays(calendarWeekStart, dayCount), [calendarWeekStart, dayCount]);

  /* ── Bootstrap ─────────────────────────────────────────────────── */
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
  useEffect(() => { document.title = 'InfoStride · Meeting Board'; }, []);

  const canManageMeeting = useCallback(
    (m) => isAdmin || Boolean(currentMember && m.person_id === currentMember.id),
    [isAdmin, currentMember]
  );
  const memberById = useCallback((id) => members.find((m) => m.id === id), [members]);

  /* ── Responsive: re-render on any resize while in calendar view (the
     day count / hour range depend on the live width), otherwise only
     when crossing the mobile/tablet/desktop bucket boundary — same
     gating as the original's `resize` listener. ─────────────────── */
  useEffect(() => {
    let timer = null;
    function onResize() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const newBucket = currentBucket(window.innerWidth);
        if (newBucket !== bucket || view === 'calendar') {
          setWidth(window.innerWidth);
        }
      }, 140);
    }
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(timer); window.removeEventListener('resize', onResize); };
  }, [bucket, view]);

  /* ── Filtering — ported from getFilteredMeetings() ────────────────── */
  const filteredMeetings = useMemo(() => {
    const eff = activeFilters.size > 0 ? activeFilters : new Set(members.map((m) => m.id));
    const q = search.trim().toLowerCase();

    let inScope;
    if (view === 'calendar') {
      const zone = ZONES[calendarZoneIdx];
      const shown = new Set(days.map(toDateStr));
      inScope = (m) => shown.has(meetingLocalDay(m, zone).dayStr);
    } else {
      inScope = (m) => {
        const [year, month] = m.date.split('-').map(Number);
        return year === selectedMonth.year && (month - 1) === selectedMonth.month;
      };
    }

    return meetingsData.filter((m) => {
      if (!eff.has(m.person_id)) return false;
      if (!m.date) return false;
      if (!inScope(m)) return false;
      if (q) {
        const member = memberById(m.person_id) || {};
        const hay = [m.demo_topic, m.poc_name, m.poc_state, m.poc_state_name, m.poc_email, m.status, m.meeting_outcome, member.name].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [meetingsData, members, activeFilters, search, view, calendarZoneIdx, days, selectedMonth, memberById]);

  const conflictPairs = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < filteredMeetings.length; i++) {
      for (let j = i + 1; j < filteredMeetings.length; j++) {
        if (doMeetingsOverlap(filteredMeetings[i], filteredMeetings[j])) pairs.push([filteredMeetings[i], filteredMeetings[j]]);
      }
    }
    return pairs;
  }, [filteredMeetings]);
  const conflictKey = useMemo(
    () => conflictPairs.map(([a, b]) => `${a.id}:${b.id}`).sort().join(','),
    [conflictPairs]
  );
  const showBanner = conflictPairs.length > 0 && dismissedConflictKey !== conflictKey;

  /* ── Actions — 1:1 with the original's ACTIONS section ───────────── */
  function toggleFilter(memberId) {
    setActiveFilters((prev) => {
      const all = new Set(members.map((m) => m.id));
      const cur = prev.size === 0 ? all : new Set(prev);
      if (cur.has(memberId)) cur.delete(memberId); else cur.add(memberId);
      return cur.size === all.size ? new Set() : cur;
    });
  }
  function selectOnly(memberId) { setActiveFilters(new Set([memberId])); }
  function resetFilters() { setActiveFilters(new Set()); setSearch(''); }

  function changeMonth(month, year) {
    setSelectedMonth({ month, year });
    setPopovers((p) => ({ ...p, monthSelectorOpen: false }));
    setCalendarWeekStart(getWeekStart(new Date(year, month, 1)));
  }
  function navMonth(delta) {
    let m = selectedMonth.month + delta;
    let y = selectedMonth.year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    changeMonth(m, y);
  }

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

  function duplicateMeeting(id) {
    const meeting = meetingsData.find((x) => x.id === id);
    if (!meeting) return;
    if (!canManageMeeting(meeting)) { alert('Only the person this meeting is scheduled by, or an admin, can duplicate it.'); return; }
    const payload = { ...meeting, demo_topic: meeting.demo_topic + ' (Copy)' };
    delete payload.id;
    apiFetch('/meetings', { method: 'POST', body: payload })
      .then((saved) => setMeetingsData((prev) => prev.concat([saved])))
      .catch((err) => alert(err.message || 'Could not duplicate this meeting.'));
  }

  function updateMeetingStatus(id, newStatus) {
    apiFetch('/meetings/' + encodeURIComponent(id), { method: 'PATCH', body: { status: newStatus } })
      .then((saved) => setMeetingsData((prev) => prev.map((m) => (m.id === id ? saved : m))))
      .catch((err) => alert(err.message || 'Could not update the status.'));
  }

  function updateMeetingField(id, field, value) {
    apiFetch('/meetings/' + encodeURIComponent(id), { method: 'PATCH', body: { [field]: value } })
      .then((saved) => setMeetingsData((prev) => prev.map((m) => (m.id === id ? saved : m))))
      .catch((err) => alert(err.message || 'Could not update this meeting.'));
  }

  function toggleDetailPop(type, id) {
    setPopovers((p) => {
      const same = p[type] === id;
      const next = { ...p, pocId: null, momId: null, actionsId: null };
      if (!same) next[type] = id;
      return next;
    });
  }
  function closeAllPopovers() {
    setPopovers({ pocId: null, momId: null, actionsId: null, monthSelectorOpen: false });
  }

  function shiftWeek(deltaDays) {
    setCalendarWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + deltaDays);
      return d;
    });
  }
  function jumpToday() {
    const n = new Date();
    setCalendarWeekStart(getWeekStart(n));
    setSelectedMonth({ month: n.getMonth(), year: n.getFullYear() });
  }

  function openMeetingModal(meetingId = null) {
    if (meetingId) {
      const existing = meetingsData.find((m) => m.id === meetingId);
      if (!existing || !canManageMeeting(existing)) {
        alert('Only the person this meeting is scheduled by, or an admin, can edit it.');
        return;
      }
    }
    setModalMeetingId(meetingId);
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); }

  // Escape closes the modal first, then any open popover — same priority
  // as the original's single document-level keydown listener.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (modalOpen) { closeModal(); return; }
      if (popovers.pocId || popovers.momId || popovers.actionsId || popovers.monthSelectorOpen) closeAllPopovers();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modalOpen, popovers]);

  // Click outside closes the month dropdown only — mirrors the original,
  // which does *not* close the POC/notes popovers on an outside click.
  useEffect(() => {
    if (!popovers.monthSelectorOpen) return undefined;
    function onDocClick(e) {
      if (!e.target.closest(`.${styles.monthWrap}`)) {
        setPopovers((p) => ({ ...p, monthSelectorOpen: false }));
      }
    }
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [popovers.monthSelectorOpen]);

  const memberCounts = useMemo(() => {
    const counts = {};
    meetingsData.forEach((m) => {
      if (!m.date) return;
      const [y, mo] = m.date.split('-').map(Number);
      if (y === selectedMonth.year && mo - 1 === selectedMonth.month) counts[m.person_id] = (counts[m.person_id] || 0) + 1;
    });
    return counts;
  }, [meetingsData, selectedMonth]);
  const allOn = activeFilters.size === 0;

  const editingMeeting = modalMeetingId ? meetingsData.find((m) => m.id === modalMeetingId) : null;
  const filtering = Boolean(search) || activeFilters.size > 0;
  const emptyMonthLabel = `${MONTH_NAMES[selectedMonth.month]} ${selectedMonth.year}`;

  return (
    <>
      <AmbientBackdrop />
      <AppHeader showBrand>
        <div className={styles.segmented} role="tablist" aria-label="View">
          <button type="button" className={styles.seg} role="tab" aria-selected={view === 'table'} onClick={() => setView('table')}>
            {ico.table} Table
          </button>
          <button type="button" className={styles.seg} role="tab" aria-selected={view === 'calendar'} onClick={() => setView('calendar')}>
            {ico.calendar} Calendar
          </button>
        </div>
        <button type="button" className="btn" onClick={() => exportMeetingsToCSV(filteredMeetings, members, selectedMonth)} title="Export current view to CSV">
          {ico.download}<span className="btn-label-sm">Export</span>
        </button>
        <button type="button" className="btn btn-primary" onClick={() => openMeetingModal()} title="Schedule a new meeting">
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
            {view === 'table' && (
              <div className={styles.pageHead}>
                <div><h1 className={styles.pageTitle}>{MONTH_NAMES[selectedMonth.month]} {selectedMonth.year}</h1></div>
              </div>
            )}

            {showBanner && (
              <ConflictBanner pairs={conflictPairs} memberById={memberById} onDismiss={() => setDismissedConflictKey(conflictKey)} />
            )}

            <div className={styles.toolbar}>
              <div className={styles.toolbarRow}>
                <div className={`${styles.searchWrap} ${view === 'calendar' ? styles.calHidden : ''}`}>
                  {ico.search}
                  <input
                    className={styles.searchInput}
                    type="search"
                    placeholder="Search topic, POC, person…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoComplete="off"
                  />
                  {search && <button type="button" className={styles.searchClear} onClick={() => setSearch('')} aria-label="Clear search">&times;</button>}
                </div>

                {view === 'calendar' ? (
                  <CalendarNav
                    days={days}
                    calendarZoneIdx={calendarZoneIdx}
                    onShiftWeek={shiftWeek}
                    onJumpToday={jumpToday}
                    onZoneChange={setCalendarZoneIdx}
                  />
                ) : (
                  <div className={styles.monthWrap}>
                    <div className={styles.monthBar}>
                      <button type="button" className={styles.monthNav} onClick={() => navMonth(-1)} aria-label="Previous month">{ico.chevL}</button>
                      <button
                        type="button"
                        className={styles.monthTrigger}
                        aria-expanded={popovers.monthSelectorOpen}
                        onClick={() => setPopovers((p) => ({ ...p, monthSelectorOpen: !p.monthSelectorOpen }))}
                      >
                        {ico.cal2}<span>{MONTH_SHORT[selectedMonth.month]} {selectedMonth.year}</span>
                      </button>
                      <button type="button" className={styles.monthNav} onClick={() => navMonth(1)} aria-label="Next month">{ico.chevR}</button>
                    </div>
                    {popovers.monthSelectorOpen && (
                      <div className={styles.monthDropdown}>
                        <div className={styles.yearHead}>
                          <button type="button" className={styles.monthNav} onClick={() => setSelectedMonth((s) => ({ ...s, year: s.year - 1 }))} aria-label="Previous year">{ico.chevL}</button>
                          <span className="mono">{selectedMonth.year}</span>
                          <button type="button" className={styles.monthNav} onClick={() => setSelectedMonth((s) => ({ ...s, year: s.year + 1 }))} aria-label="Next year">{ico.chevR}</button>
                        </div>
                        <div className={styles.monthGrid}>
                          {MONTH_SHORT.map((mn, i) => (
                            <button key={mn} type="button" className={styles.monthGridBtn} aria-current={selectedMonth.month === i} onClick={() => changeMonth(i, selectedMonth.year)}>{mn}</button>
                          ))}
                        </div>
                        <button type="button" className="btn" style={{ width: '100%' }} onClick={jumpToday}>Jump to today</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.toolbarDivider} />

              <div className={styles.toolbarRow}>
                <span className={styles.filterLabel}>Team</span>
                <div className={styles.chipScroller}>
                  {members.map((m) => {
                    const on = allOn || activeFilters.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={styles.chip}
                        aria-pressed={on}
                        onClick={() => toggleFilter(m.id)}
                        onDoubleClick={() => selectOnly(m.id)}
                        title={`${m.email} — double-click to isolate`}
                      >
                        <span className={styles.chipAvatar} style={{ background: m.color }}>{m.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
                        <span>{m.name}</span>
                        <span className={styles.chipCount}>{memberCounts[m.id] || 0}</span>
                      </button>
                    );
                  })}
                </div>
                {(!allOn || search) && <button type="button" className={styles.linkBtn} onClick={resetFilters}>Reset</button>}
              </div>
            </div>

            {view === 'table' ? (
              <TableView
                meetings={filteredMeetings}
                members={members}
                isMobile={isMobile}
                popovers={popovers}
                onTogglePopover={toggleDetailPop}
                onClosePopovers={closeAllPopovers}
                canManageMeeting={canManageMeeting}
                onEdit={openMeetingModal}
                onDuplicate={duplicateMeeting}
                onDelete={deleteMeeting}
                onUpdateStatus={updateMeetingStatus}
                onUpdateField={updateMeetingField}
                filtering={filtering}
                emptyMonthLabel={emptyMonthLabel}
                onNewMeeting={() => openMeetingModal()}
                onResetFilters={resetFilters}
              />
            ) : (
              <CalendarView
                meetings={filteredMeetings}
                members={members}
                days={days}
                calendarZoneIdx={calendarZoneIdx}
                onOpenMeeting={openMeetingModal}
              />
            )}
          </>
        )}
      </main>

      {modalOpen && (
        <MeetingModal
          meeting={editingMeeting}
          members={members}
          isAdmin={isAdmin}
          onSave={saveMeeting}
          onClose={closeModal}
          onDelete={deleteMeeting}
        />
      )}
    </>
  );
}
