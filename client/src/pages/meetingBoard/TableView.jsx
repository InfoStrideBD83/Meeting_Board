import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar.jsx';
import { ico } from './icons.jsx';
import {
  ZONES, formatDate, toUTC, fromUTC, getConflictingIds,
} from './dateUtils.js';
import styles from './TableView.module.css';

const STATUSES = ['Demo Scheduled', 'Demo Completed', 'Demo Canceled'];
const OUTCOMES = ['Positive', 'Neutral', 'Negative'];
const TAKEN_BY_OPTIONS = ['Vishal Mangla', 'Ritu Mangla', 'Deepak Sharma', 'Rohit Sood', 'Amit Kaushal'];

function statusClass(s) {
  return s === 'Demo Completed' ? styles.sCompleted : s === 'Demo Canceled' ? styles.sCanceled : styles.sScheduled;
}
function outcomeClass(o) {
  return o === 'Positive' ? styles.oPositive : o === 'Negative' ? styles.oNegative : o === 'Neutral' ? styles.oNeutral : styles.oEmpty;
}

function StatusSelect({ meeting, onChange }) {
  return (
    <select
      className={`${styles.pillSelect} ${statusClass(meeting.status)}`}
      aria-label="Status"
      value={meeting.status}
      onChange={(e) => onChange(meeting.id, e.target.value)}
    >
      {STATUSES.map((s) => <option key={s} value={s}>{s.replace('Demo ', '')}</option>)}
    </select>
  );
}

/* A checkbox-list dropdown rather than a plain <select> — meeting_taken_by
   has always been stored as a JSON array (multiple people can run a demo
   together), the old UI just only ever read/wrote its first entry. */
function TakenBySelect({ meeting, onChange }) {
  let selected = [];
  try { selected = meeting.meeting_taken_by ? JSON.parse(meeting.meeting_taken_by) : []; }
  catch { selected = meeting.meeting_taken_by ? [meeting.meeting_taken_by] : []; }
  if (!Array.isArray(selected)) selected = [];

  const [open, setOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocDown(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    function onKeyDown(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function commit(next) {
    onChange(meeting.id, 'meeting_taken_by', next.length ? JSON.stringify(next) : '');
  }
  function toggleName(name) {
    commit(selected.includes(name) ? selected.filter((n) => n !== name) : selected.concat([name]));
  }
  function addCustom() {
    const v = customText.trim();
    if (!v) return;
    if (!selected.includes(v)) commit(selected.concat([v]));
    setCustomText('');
  }

  const extraNames = selected.filter((n) => !TAKEN_BY_OPTIONS.includes(n));
  const label = selected.length ? selected.join(', ') : '— Select —';

  return (
    <span className={styles.takenByWrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.pillSelect} ${styles.sNeutral} ${styles.selName} ${styles.takenByBtn}`}
        aria-label="Meeting taken by"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={selected.join(', ')}
      >
        <span className={styles.takenByBtnLabel}>{label}</span>
      </button>
      {open && (
        <div className={styles.takenByMenu}>
          {TAKEN_BY_OPTIONS.map((name) => (
            <label key={name} className={styles.takenByOption}>
              <input type="checkbox" checked={selected.includes(name)} onChange={() => toggleName(name)} />
              <span>{name}</span>
            </label>
          ))}
          {extraNames.map((name) => (
            <label key={name} className={styles.takenByOption}>
              <input type="checkbox" checked onChange={() => toggleName(name)} />
              <span>{name}</span>
            </label>
          ))}
          <div className={styles.takenByAddRow}>
            <input
              type="text"
              className={styles.takenByOther}
              placeholder="Add a name…"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
            />
            <button type="button" className={styles.takenByAddBtn} onClick={addCustom}>Add</button>
          </div>
        </div>
      )}
    </span>
  );
}

function OutcomeSelect({ meeting, onChange }) {
  return (
    <select
      className={`${styles.pillSelect} ${styles.selNarrow} ${outcomeClass(meeting.meeting_outcome)}`}
      aria-label="Outcome"
      value={meeting.meeting_outcome || ''}
      onChange={(e) => onChange(meeting.id, 'meeting_outcome', e.target.value)}
    >
      <option value="">— Outcome —</option>
      {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function NoteBtn({ meeting, kind, onToggle }) {
  const field = kind === 'mom' ? 'mom' : 'post_demo_actions';
  const has = Boolean(meeting[field]);
  const popKey = kind === 'mom' ? 'momId' : 'actionsId';
  const label = kind === 'mom' ? 'Minutes of Meeting' : 'Post-Demo Actions';
  return (
    <button
      type="button"
      className={`${styles.noteBtn} ${has ? styles.filled : ''}`}
      onClick={() => onToggle(popKey, meeting.id)}
      title={has ? `View ${label}` : `Add ${label}`}
      aria-label={has ? `View ${label}` : `Add ${label}`}
    >
      {ico.note}
    </button>
  );
}

function NotePopover({ meeting, kind, isMobile, onSave, onClose }) {
  const isMom = kind === 'mom';
  const field = isMom ? 'mom' : 'post_demo_actions';
  const title = isMom ? 'Minutes of Meeting' : 'Post-Demo Actions';
  const taRef = useRef(null);
  const style = isMobile ? {} : { top: '100%', right: 0 };

  return (
    <>
      <div className={styles.popBackdrop} onClick={onClose} />
      <div className={styles.popover} style={style}>
        <div className={styles.popHead}>
          <strong>{title}</strong>
          <button type="button" className={styles.popClose} onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <textarea
          ref={taRef}
          className={styles.popTextarea}
          defaultValue={meeting[field] || ''}
          placeholder={isMom ? 'Key discussion points, decisions…' : 'Follow-ups, owners, deadlines…'}
        />
        <div className={styles.popFoot}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave(meeting.id, field, taRef.current ? taRef.current.value : '')}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}

function PocPopover({ meeting, isMobile, onClose }) {
  const style = isMobile ? {} : { top: '100%', left: 0 };
  const row = (k, v) => (
    <div className={styles.popRow} key={k}>
      <span className={styles.k}>{k}</span>
      <span className={styles.v}>{v || '—'}</span>
    </div>
  );
  return (
    <>
      <div className={styles.popBackdrop} onClick={onClose} />
      <div className={styles.popover} style={style}>
        <div className={styles.popHead}>
          <strong>Point of contact</strong>
          <button type="button" className={styles.popClose} onClick={onClose} aria-label="Close">&times;</button>
        </div>
        {row('Name', meeting.poc_name)}
        {row('Email', meeting.poc_email)}
        {row('Phone', meeting.poc_phone)}
        {row('Country', meeting.poc_country)}
        {row('State', meeting.poc_state_name || meeting.poc_state)}
        {row('Population', meeting.poc_population_count)}
        {row('County / Company', meeting.poc_county_name)}
      </div>
    </>
  );
}

function ActionBtns({ meeting, manageable, onEdit, onDuplicate, onDelete }) {
  if (!manageable) {
    return <span className={styles.dash} title="Only the scheduler or an admin can manage this meeting">—</span>;
  }
  return (
    <div className={styles.actionsWrap}>
      <button type="button" className={`${styles.iconBtn} ${styles.dup}`} title="Duplicate" aria-label="Duplicate" onClick={() => onDuplicate(meeting.id)}>{ico.copy}</button>
      <button type="button" className={`${styles.iconBtn} ${styles.edit}`} title="Edit" aria-label="Edit" onClick={() => onEdit(meeting.id)}>{ico.edit}</button>
      <button type="button" className={`${styles.iconBtn} ${styles.del}`} title="Delete" aria-label="Delete" onClick={() => onDelete(meeting.id)}>{ico.trash}</button>
    </div>
  );
}

/* Table / card view — ported from Meeting Board.html's renderTable(),
   renderCards(), and the POC / notes popovers + row action buttons that
   go with them. Desktop renders a wide sticky-header table (Person
   column pinned); mobile (isMobile) renders a stacked card list instead,
   matching the original's isMobile() branch in renderTableSection(). */
export function TableView({
  meetings, members, isMobile, popovers, onTogglePopover, onClosePopovers,
  canManageMeeting, onEdit, onDuplicate, onDelete, onUpdateStatus, onUpdateField,
  filtering, emptyMonthLabel, onNewMeeting, onResetFilters,
}) {
  const scrollRef = useRef(null);
  const cardRef = useRef(null);
  const [scrollState, setScrollState] = useState({ canScrollX: false, showHint: false, atEnd: true });

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return undefined;
    function update() {
      const overflow = scroller.scrollWidth - scroller.clientWidth;
      setScrollState({
        canScrollX: overflow > 2,
        showHint: overflow > 80,
        atEnd: overflow > 2 && scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 4,
      });
    }
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      scroller.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [meetings, isMobile]);

  useEffect(() => {
    function fit() {
      const scroller = scrollRef.current;
      if (!scroller) return;
      const top = scroller.getBoundingClientRect().top;
      const footerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--footer-h')) || 0;
      const avail = Math.max(160, window.innerHeight - top - footerH - 16);
      scroller.style.setProperty('--tbl-h', avail + 'px');
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [meetings, isMobile]);

  function memberOf(id) { return members.find((x) => x.id === id) || {}; }

  if (meetings.length === 0) {
    return (
      <div className="card">
        <div className={styles.empty}>
          <div className={styles.emptyArt}>{ico.inbox}</div>
          <h4>{filtering ? 'No matching meetings' : 'Nothing scheduled yet'}</h4>
          <p>
            {filtering
              ? 'Try a different search term, month, or clear the team filter.'
              : `No demos are booked for ${emptyMonthLabel}.`}
          </p>
          {filtering ? (
            <button type="button" className="btn" onClick={onResetFilters}>Clear filters</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onNewMeeting}>{ico.plus} Schedule a meeting</button>
          )}
        </div>
      </div>
    );
  }

  const conflictIds = getConflictingIds(meetings);

  if (isMobile) {
    return (
      <div className={styles.cardList} ref={cardRef}>
        {meetings.map((m) => {
          const member = memberOf(m.person_id);
          const zone = ZONES[m.zone_index] || ZONES[0];
          const startUTC = toUTC(m.date, m.time, zone.iana);
          const conflict = conflictIds.has(m.id);
          const done = m.status === 'Demo Completed';
          const canFollowUp = done && (m.meeting_outcome === 'Positive' || m.meeting_outcome === 'Neutral');
          let takenBy = '';
          try { takenBy = m.meeting_taken_by ? JSON.parse(m.meeting_taken_by).join(', ') : ''; }
          catch { takenBy = m.meeting_taken_by || ''; }
          const manageable = canManageMeeting(m);

          return (
            <article key={m.id} className={`${styles.mCard} ${conflict ? styles.isConflict : ''}`} style={{ '--mc': member.color || 'var(--accent)' }}>
              <div className={styles.mcTop}>
                <div className={styles.mcTopBody}>
                  <h3 className={styles.mcTopic}>
                    {conflict && <span className={styles.warnDot} title="Conflict">{ico.warnSm}</span>}
                    {m.demo_topic}
                  </h3>
                  <span className={styles.mcPerson}>
                    <span className={styles.mcDot} style={{ background: member.color || 'var(--accent)' }} />
                    {member.name || '—'}
                  </span>
                </div>
                <StatusSelect meeting={m} onChange={onUpdateStatus} />
              </div>

              <div className={styles.mcMeta}>
                <span className={styles.mcMetaItem}>{ico.cal2} {formatDate(m.date)}</span>
                <span className={styles.mcMetaItem}>{ico.clock} {m.duration} min</span>
                <span className={styles.mcMetaItem}>{ico.globe} {zone.label} {m.time}</span>
              </div>

              <div className={styles.mcZones}>
                {ZONES.map((z, i) => (
                  <div key={z.label} className={`${styles.mcZone} ${i === m.zone_index ? styles.isHome : ''}`}>
                    <div className={styles.mcZoneLabel}>{z.label}</div>
                    <div className={styles.mcZoneTime}>{fromUTC(startUTC, z.iana)}</div>
                  </div>
                ))}
              </div>

              {m.poc_name && (
                <div className={`${styles.mcField} ${styles.popAnchor}`}>
                  <span className={styles.mcFieldLabel}>POC</span>
                  <span className={styles.mcFieldVal}>
                    <button type="button" className={styles.pocBtn} onClick={() => onTogglePopover('pocId', m.id)}>
                      {m.poc_name}
                    </button>
                  </span>
                  {popovers.pocId === m.id && <PocPopover meeting={m} isMobile={isMobile} onClose={onClosePopovers} />}
                </div>
              )}
              {m.poc_country && (
                <div className={styles.mcField}>
                  <span className={styles.mcFieldLabel}>Country</span>
                  <span className={styles.mcFieldVal}>{m.poc_country}</span>
                </div>
              )}
              {(m.poc_state_name || m.poc_state) && (
                <div className={styles.mcField}>
                  <span className={styles.mcFieldLabel}>State</span>
                  <span className={styles.mcFieldVal}>{m.poc_state_name || m.poc_state}</span>
                </div>
              )}

              {done && (
                <>
                  <div className={`${styles.mcField} ${styles.popAnchor}`}>
                    <span className={styles.mcFieldLabel}>Minutes</span>
                    <span className={styles.mcFieldVal}><NoteBtn meeting={m} kind="mom" onToggle={onTogglePopover} /></span>
                    {popovers.momId === m.id && (
                      <NotePopover meeting={m} kind="mom" isMobile={isMobile} onSave={(...a) => { onUpdateField(...a); onClosePopovers(); }} onClose={onClosePopovers} />
                    )}
                  </div>
                  <div className={styles.mcField}>
                    <span className={styles.mcFieldLabel}>Taken by</span>
                    <span className={styles.mcFieldVal}><TakenBySelect meeting={m} onChange={onUpdateField} /></span>
                  </div>
                  <div className={styles.mcField}>
                    <span className={styles.mcFieldLabel}>Outcome</span>
                    <span className={styles.mcFieldVal}><OutcomeSelect meeting={m} onChange={onUpdateField} /></span>
                  </div>
                </>
              )}

              {canFollowUp && (
                <div className={`${styles.mcField} ${styles.popAnchor}`}>
                  <span className={styles.mcFieldLabel}>Next steps</span>
                  <span className={styles.mcFieldVal}><NoteBtn meeting={m} kind="actions" onToggle={onTogglePopover} /></span>
                  {popovers.actionsId === m.id && (
                    <NotePopover meeting={m} kind="actions" isMobile={isMobile} onSave={(...a) => { onUpdateField(...a); onClosePopovers(); }} onClose={onClosePopovers} />
                  )}
                </div>
              )}

              <div className={styles.mcFoot}>
                <span className={styles.mcFootNote}>{takenBy || (done ? 'Completed' : 'Awaiting demo')}</span>
                <ActionBtns meeting={m} manageable={manageable} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  const cardClass = [
    styles.tableCard,
    scrollState.canScrollX ? styles.canScrollX : '',
    scrollState.showHint ? styles.showHint : '',
    scrollState.atEnd ? styles.atEnd : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClass}>
      <div className={styles.tableScroll} ref={scrollRef}>
        <table className={styles.tbl}>
          <thead>
            <tr>
              <th className={`${styles.c} ${styles.colPerson}`}>Person</th>
              <th className={`${styles.c} ${styles.thNowrap}`}>Demo Topic</th>
              <th className={`${styles.c} ${styles.thWrap}`}>POC Details</th>
              <th className={`${styles.c} ${styles.thNowrap} ${styles.geoCell}`}>Country</th>
              <th className={`${styles.c} ${styles.thNowrap} ${styles.geoCell}`}>State</th>
              <th className={`${styles.c} ${styles.thWrap}`}>Date</th>
              {ZONES.map((z) => <th key={z.label} className={`${styles.c} ${styles.thGroup} ${styles.mono}`}>{z.label}</th>)}
              <th className={`${styles.c} ${styles.thWrap}`}>Duration</th>
              <th className={`${styles.c} ${styles.thWrap}`}>Status</th>
              <th className={`${styles.c} ${styles.thNowrap}`}>Minutes of Meeting</th>
              <th className={`${styles.c} ${styles.thWrap}`}>Meeting Taken By</th>
              <th className={`${styles.c} ${styles.thWrap}`}>Meeting Outcome</th>
              <th className={`${styles.c} ${styles.thNowrap}`}>Post-Demo Actions</th>
              <th className={styles.c}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m, idx) => {
              const member = memberOf(m.person_id);
              const zone = ZONES[m.zone_index] || ZONES[0];
              const startUTC = toUTC(m.date, m.time, zone.iana);
              const conflict = conflictIds.has(m.id);
              const done = m.status === 'Demo Completed';
              const canFollowUp = done && (m.meeting_outcome === 'Positive' || m.meeting_outcome === 'Neutral');
              const manageable = canManageMeeting(m);

              return (
                <tr
                  key={m.id}
                  className={conflict ? styles.isConflict : ''}
                  style={{ animationDelay: `${Math.min(idx, 20) * 25}ms` }}
                >
                  <td className={styles.colPerson}>
                    <div className={styles.personCell}>
                      <Avatar name={member.name || '—'} color={member.color} size={26} />
                      <span className={styles.personName}>{member.name || '—'}</span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.topicCell}>
                      {conflict && <span className={styles.warnDot} title="Scheduling conflict">{ico.warnSm}</span>}
                      <span className={styles.topicText} title={m.demo_topic}>{m.demo_topic}</span>
                    </div>
                  </td>
                  <td className={`${styles.c} ${styles.popAnchor}`}>
                    {m.poc_name ? (
                      <>
                        <button type="button" className={styles.pocBtn} onClick={() => onTogglePopover('pocId', m.id)}>
                          {m.poc_name}
                        </button>
                        {popovers.pocId === m.id && <PocPopover meeting={m} isMobile={isMobile} onClose={onClosePopovers} />}
                      </>
                    ) : <span className={styles.dash}>—</span>}
                  </td>
                  <td className={`${styles.c} ${styles.geoCell}`} title={m.poc_country || ''}>{m.poc_country || <span className={styles.dash}>—</span>}</td>
                  <td className={`${styles.c} ${styles.geoCell}`} title={m.poc_state_name || m.poc_state || ''}>{m.poc_state_name || m.poc_state || <span className={styles.dash}>—</span>}</td>
                  <td className={styles.dateCell}>{formatDate(m.date)}</td>
                  {ZONES.map((z, i) => (
                    <td key={z.label} className={`${styles.tzCell} ${styles.mono} ${i === m.zone_index ? styles.isHome : ''}`} title={i === m.zone_index ? 'Original timezone' : z.iana}>
                      {fromUTC(startUTC, z.iana)}
                    </td>
                  ))}
                  <td className={styles.c}><span className={styles.durBadge}>{m.duration}m</span></td>
                  <td className={styles.c}><StatusSelect meeting={m} onChange={onUpdateStatus} /></td>
                  <td className={`${styles.c} ${styles.popAnchor}`}>
                    {done ? (
                      <>
                        <NoteBtn meeting={m} kind="mom" onToggle={onTogglePopover} />
                        {popovers.momId === m.id && (
                          <NotePopover meeting={m} kind="mom" isMobile={isMobile} onSave={(...a) => { onUpdateField(...a); onClosePopovers(); }} onClose={onClosePopovers} />
                        )}
                      </>
                    ) : <span className={styles.dash}>—</span>}
                  </td>
                  <td className={styles.c}>{done ? <TakenBySelect meeting={m} onChange={onUpdateField} /> : <span className={styles.dash}>—</span>}</td>
                  <td className={styles.c}>{done ? <OutcomeSelect meeting={m} onChange={onUpdateField} /> : <span className={styles.dash}>—</span>}</td>
                  <td className={`${styles.c} ${styles.popAnchor}`}>
                    {canFollowUp ? (
                      <>
                        <NoteBtn meeting={m} kind="actions" onToggle={onTogglePopover} />
                        {popovers.actionsId === m.id && (
                          <NotePopover meeting={m} kind="actions" isMobile={isMobile} onSave={(...a) => { onUpdateField(...a); onClosePopovers(); }} onClose={onClosePopovers} />
                        )}
                      </>
                    ) : <span className={styles.dash}>—</span>}
                  </td>
                  <td className={styles.c}>
                    <ActionBtns meeting={m} manageable={manageable} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
