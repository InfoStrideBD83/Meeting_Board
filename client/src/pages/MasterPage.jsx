import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { AppHeader } from '../components/AppHeader.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { ProfileMenu } from '../components/ProfileMenu.jsx';
import { NotificationBell } from '../components/NotificationBell.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { AddMemberModal } from '../components/AddMemberModal.jsx';
import { Logo3D } from '../components/Logo3D.jsx';
import { firstName } from '../utils/avatarColor.js';
import styles from './MasterPage.module.css';

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function MasterPage() {
  const { member, isAdmin } = useAuth();

  const [todaysMeetings, setTodaysMeetings] = useState([]);
  const [members, setMembers] = useState([]);
  const [pending, setPending] = useState([]);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  const refreshNotifications = useCallback(() => {
    Promise.all([
      apiFetch('/meetings?date=' + encodeURIComponent(todayStr())),
      apiFetch('/members'),
    ])
      .then(([meetings, membersList]) => {
        setTodaysMeetings(meetings.sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))));
        setMembers(membersList);
      })
      .catch(() => { /* transient — next refresh (click or 60s poll) retries */ });
  }, []);

  const refreshApprovals = useCallback(() => {
    if (!isAdmin) return;
    apiFetch('/pending-requests')
      .then(setPending)
      .catch(() => { /* transient — next refresh (click or 60s poll) retries */ });
  }, [isAdmin]);

  useEffect(() => {
    refreshNotifications();
    const id = setInterval(refreshNotifications, 60000);
    return () => clearInterval(id);
  }, [refreshNotifications]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    refreshApprovals();
    const id = setInterval(refreshApprovals, 60000);
    return () => clearInterval(id);
  }, [isAdmin, refreshApprovals]);

  useEffect(() => {
    document.title = 'InfoStride · Workspace · ' + firstName(member && member.name);
  }, [member]);

  function approveUser(id) {
    apiFetch('/pending-requests/' + encodeURIComponent(id) + '/approve', { method: 'POST' })
      .then(refreshApprovals)
      .catch((err) => alert(err.message || 'Could not approve this request.'));
  }

  function declineUser(id) {
    apiFetch('/pending-requests/' + encodeURIComponent(id) + '/decline', { method: 'POST' })
      .then(refreshApprovals)
      .catch((err) => alert(err.message || 'Could not decline this request.'));
  }

  function refreshMembers() {
    apiFetch('/members').then(setMembers).catch(() => { /* transient — next open retries */ });
  }

  function removeMember(m) {
    if (!window.confirm(`Remove ${m.name} from the team?\n\nThis cannot be undone.`)) return;
    apiFetch('/members/' + encodeURIComponent(m.id), { method: 'DELETE' })
      .then(() => setMembers((prev) => prev.filter((x) => x.id !== m.id)))
      .catch((err) => alert(err.message || 'Could not remove this member.'));
  }

  const role = member && member.is_admin ? 'Admin' : 'Member';

  return (
    <>
      <div className={styles.ambient} aria-hidden="true">
        <div className={styles.ambientDots} />
        <div className={styles.ambientRings}>
          <svg viewBox="0 0 400 400">
            <g fill="none" stroke="var(--accent)" strokeOpacity=".16">
              <circle className={styles.ringSpin} cx="200" cy="200" r="196" strokeDasharray="2 12" />
              <circle className={styles.ringSpinR} cx="200" cy="200" r="152" strokeDasharray="1 9" strokeOpacity=".13" />
              <circle cx="200" cy="200" r="112" strokeOpacity=".09" />
            </g>
            <g className={styles.ringSpinR} fill="none" stroke="var(--accent)" strokeOpacity=".10">
              <ellipse cx="200" cy="200" rx="52" ry="152" />
              <ellipse cx="200" cy="200" rx="106" ry="152" />
              <line x1="48" y1="200" x2="352" y2="200" />
            </g>
          </svg>
        </div>
        <span className={`${styles.ambientGlyph} ${styles.g1}`}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 2 L13 12 L3 22 L9 22 L19 12 L9 2 Z"/></svg></span>
        <span className={`${styles.ambientGlyph} ${styles.g2}`}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 2 L13 12 L3 22 L9 22 L19 12 L9 2 Z"/></svg></span>
        <span className={`${styles.ambientGlyph} ${styles.g3}`}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 2 L13 12 L3 22 L9 22 L19 12 L9 2 Z"/></svg></span>
      </div>

      <AppHeader showBrand={false}>
        {isAdmin && (
          <NotificationBell
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>}
            title="Pending sign-ups"
            ariaLabel="pending sign-ups"
            count={pending.length}
            panelTitle="Pending sign-ups"
            onOpen={refreshApprovals}
          >
            {pending.length === 0 ? (
              <div className="notif-empty">No pending sign-ups.</div>
            ) : (
              pending.map((u) => (
                <div className="notif-item" key={u.id}>
                  <div className="notif-item-body" style={{ flex: 1 }}>
                    <div className="notif-item-name">{u.name}</div>
                    <div className="notif-item-meta">{u.email}{u.employee_id ? ` · ID ${u.employee_id}` : ''}</div>
                    <div className="approval-actions">
                      <button className="approve" onClick={() => approveUser(u.id)}>Approve</button>
                      <button className="decline" onClick={() => declineUser(u.id)}>Decline</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </NotificationBell>
        )}

        <NotificationBell
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
          title="Team"
          ariaLabel="team members"
          count={0}
          panelTitle={`Team (${members.length})`}
          onOpen={refreshMembers}
        >
          {isAdmin && (
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-soft)' }}>
              <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => setAddMemberOpen(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                Add member
              </button>
            </div>
          )}
          {members.length === 0 ? (
            <div className="notif-empty">No team members yet.</div>
          ) : (
            members.map((m) => (
              <div className="notif-item" key={m.id}>
                <Avatar name={m.name} color={m.color} size={30} />
                <div className="notif-item-body" style={{ flex: 1 }}>
                  <div className="notif-item-name">{m.name}{m.is_admin ? ' · Admin' : ''}</div>
                  <div className="notif-item-meta">{m.email}{m.employee_id ? ` · ID ${m.employee_id}` : ''}</div>
                </div>
                {isAdmin && m.id !== (member && member.id) && (
                  <button
                    type="button"
                    className="btn btn-icon"
                    title={`Remove ${m.name}`}
                    aria-label={`Remove ${m.name}`}
                    onClick={() => removeMember(m)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0-1 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 6"/></svg>
                  </button>
                )}
              </div>
            ))
          )}
        </NotificationBell>

        <NotificationBell
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
          title="Today's meetings"
          ariaLabel={`meeting${todaysMeetings.length === 1 ? '' : 's'} today`}
          count={todaysMeetings.length}
          panelTitle="Today's meetings"
          onOpen={refreshNotifications}
        >
          {todaysMeetings.length === 0 ? (
            <div className="notif-empty">No meetings scheduled for today.</div>
          ) : (
            todaysMeetings.map((m) => {
              const meetingMember = members.find((x) => x && x.id === m.person_id) || {};
              return (
                <div className="notif-item" key={m.id}>
                  <span className="notif-dot" style={{ background: meetingMember.color || 'var(--accent)' }} />
                  <div className="notif-item-body">
                    <div className="notif-item-name">{meetingMember.name || 'Unknown'}</div>
                    <div className="notif-item-meta">{m.time || '—'} &middot; {m.demo_topic || 'Meeting'}</div>
                  </div>
                </div>
              );
            })
          )}
        </NotificationBell>

        <ThemeToggle />
        <ProfileMenu />
      </AppHeader>

      <main className={styles.main}>
        <section className={`${styles.hero} reveal`}>
          <span className={styles.eyebrow}><span className="live" />{role} · InfoStride Workspace</span>
          <h1 className={styles.greeting}>
            Hi <span className={styles.who}>{firstName(member && member.name)}</span>, <span className={styles.welcome}>Welcome back</span>
          </h1>
        </section>

        <Logo3D />

        <div className={`${styles.appsLabel} reveal d2`}>Open a workspace</div>

        <nav className={`${styles.apps} reveal d2`} aria-label="Applications">
          <Link className={`${styles.appCard} ${styles.cBoard}`} to="/meetings">
            <span className={styles.cardPreview}>
              <svg viewBox="0 0 200 108" aria-hidden="true">
                <rect x="0" y="0" width="200" height="108" fill="none"/>
                <rect x="7" y="9" width="186" height="14" rx="4" className={styles.artPanel}/>
                <rect x="14" y="14" width="30" height="4" rx="2" className={styles.artFaint}/>
                <rect x="52" y="14" width="24" height="4" rx="2" className={styles.artFaint}/>
                <rect x="88" y="14" width="17" height="4" rx="2" fill="var(--accent)" opacity=".75"/>
                <rect x="114" y="14" width="17" height="4" rx="2" fill="var(--accent)" opacity=".75"/>
                <rect x="140" y="14" width="17" height="4" rx="2" fill="var(--accent)" opacity=".75"/>
                <rect x="166" y="14" width="17" height="4" rx="2" fill="var(--accent)" opacity=".75"/>

                <g className={styles.artConflict}>
                  <rect x="7" y="25" width="186" height="19" rx="4" fill="var(--danger-soft, rgba(251,113,133,.13))"/>
                  <circle cx="17" cy="34" r="5" fill="var(--accent)"/>
                  <rect x="28" y="31" width="46" height="5" rx="2.5" className={styles.artText} opacity=".62"/>
                  <rect x="28" y="39" width="26" height="3.5" rx="1.75" className={styles.artMuted} opacity=".5"/>
                  <rect x="88" y="30" width="21" height="11" rx="5.5" fill="var(--accent-soft)"/>
                  <rect x="92" y="34" width="13" height="3" rx="1.5" fill="var(--accent)" opacity=".85"/>
                  <rect x="114" y="30" width="21" height="11" rx="5.5" fill="var(--accent-soft)"/>
                  <rect x="118" y="34" width="13" height="3" rx="1.5" fill="var(--accent)" opacity=".85"/>
                  <rect x="140" y="30" width="21" height="11" rx="5.5" fill="var(--accent-soft)"/>
                  <rect x="144" y="34" width="13" height="3" rx="1.5" fill="var(--accent)" opacity=".85"/>
                  <rect x="166" y="30" width="21" height="11" rx="5.5" fill="var(--accent-soft)"/>
                  <rect x="170" y="34" width="13" height="3" rx="1.5" fill="var(--accent)" opacity=".85"/>
                </g>
                <g className={styles.artConflict}>
                  <rect x="7" y="48" width="186" height="19" rx="4" fill="var(--danger-soft, rgba(251,113,133,.13))"/>
                  <circle cx="17" cy="57" r="5" fill="var(--success)"/>
                  <rect x="28" y="54" width="40" height="5" rx="2.5" className={styles.artText} opacity=".62"/>
                  <rect x="28" y="62" width="26" height="3.5" rx="1.75" className={styles.artMuted} opacity=".5"/>
                  <rect x="88" y="53" width="21" height="11" rx="5.5" fill="var(--accent-soft)"/>
                  <rect x="92" y="57" width="13" height="3" rx="1.5" fill="var(--accent)" opacity=".85"/>
                  <rect x="114" y="53" width="21" height="11" rx="5.5" fill="var(--accent-soft)"/>
                  <rect x="118" y="57" width="13" height="3" rx="1.5" fill="var(--accent)" opacity=".85"/>
                  <rect x="140" y="53" width="21" height="11" rx="5.5" fill="var(--accent-soft)"/>
                  <rect x="144" y="57" width="13" height="3" rx="1.5" fill="var(--accent)" opacity=".85"/>
                  <rect x="166" y="53" width="21" height="11" rx="5.5" fill="var(--accent-soft)"/>
                  <rect x="170" y="57" width="13" height="3" rx="1.5" fill="var(--accent)" opacity=".85"/>
                </g>
                <g>
                  <circle cx="17" cy="80" r="5" fill="var(--warn)"/>
                  <rect x="28" y="77" width="34" height="5" rx="2.5" className={styles.artText} opacity=".62"/>
                  <rect x="28" y="85" width="26" height="3.5" rx="1.75" className={styles.artMuted} opacity=".5"/>
                  <rect x="88" y="76" width="21" height="11" rx="5.5" fill="var(--accent-soft)"/>
                  <rect x="92" y="80" width="13" height="3" rx="1.5" fill="var(--accent)" opacity=".85"/>
                  <rect x="114" y="76" width="21" height="11" rx="5.5" fill="var(--accent-soft)"/>
                  <rect x="118" y="80" width="13" height="3" rx="1.5" fill="var(--accent)" opacity=".85"/>
                  <rect x="140" y="76" width="21" height="11" rx="5.5" fill="var(--accent-soft)"/>
                  <rect x="144" y="80" width="13" height="3" rx="1.5" fill="var(--accent)" opacity=".85"/>
                  <rect x="166" y="76" width="21" height="11" rx="5.5" fill="var(--accent-soft)"/>
                  <rect x="170" y="80" width="13" height="3" rx="1.5" fill="var(--accent)" opacity=".85"/>
                </g>
                <rect className={styles.artScan} x="7" y="26" width="186" height="19" rx="4" fill="none" stroke="var(--accent)" strokeWidth="1.2"/>
              </svg>
            </span>
            <span className={styles.cardFoot}>
              <span className={styles.appIcon}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 4.5v-2M16 4.5v-2M7.5 13.5h4M7.5 17h7"/></svg></span>
              <span className={styles.appTitle}>Meeting Board</span>
              <span className={styles.appArrow}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="18" y2="12"/><polyline points="12 6 18 12 12 18"/></svg></span>
            </span>
          </Link>

          <Link className={`${styles.appCard} ${styles.cAssignee}`} to="/assignee">
            <span className={styles.cardPreview}>
              <svg viewBox="0 0 200 108" aria-hidden="true">
                <rect x="24" y="88" width="152" height="5" rx="2.5" className={styles.artSoft}/>
                <path d="M76 46c0-14 11-22 24-22s24 8 24 22" fill="var(--accent)" opacity=".55"/>
                <circle cx="100" cy="23" r="11" fill="var(--map-pst)" opacity=".9"/>
                <rect x="70" y="40" width="60" height="40" rx="4" className={styles.artPanel} stroke="var(--border)" strokeWidth="1"/>
                <circle cx="76" cy="46" r="1.8" fill="var(--danger)"/>
                <circle cx="82" cy="46" r="1.8" fill="var(--warn)"/>
                <circle cx="88" cy="46" r="1.8" fill="var(--success)"/>
                <line x1="70" y1="50.5" x2="130" y2="50.5" stroke="var(--border-soft)" strokeWidth="1"/>
                <circle cx="77" cy="58" r="2.2" fill="var(--accent)"/>
                <rect x="82" y="56.3" width="30" height="3.4" rx="1.7" className={styles.artMuted} opacity=".6"/>
                <circle cx="77" cy="66" r="2.2" fill="var(--warn)"/>
                <rect x="82" y="64.3" width="24" height="3.4" rx="1.7" className={styles.artMuted} opacity=".5"/>
                <circle cx="77" cy="74" r="2.2" fill="var(--success)"/>
                <rect x="82" y="72.3" width="27" height="3.4" rx="1.7" className={styles.artMuted} opacity=".5"/>
                <path d="M62 80 L138 80 L146 88 L54 88 Z" className={styles.artFaint} opacity=".8"/>
                <circle className={`${styles.artHand} h1`} cx="82" cy="82" r="3" fill="var(--accent)"/>
                <circle className={`${styles.artHand} h2`} cx="118" cy="82" r="3" fill="var(--map-pst)"/>
                <circle cx="152" cy="28" r="9" fill="var(--success)" opacity=".16"/>
                <circle className={styles.artPing} cx="152" cy="28" r="4" fill="var(--success)" opacity="0"/>
                <path d="M148.4 28l2.3 2.6 4.9-5.6" stroke="var(--success)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className={styles.cardFoot}>
              <span className={styles.appIcon}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="17" rx="2.2"/><path d="M9 2.6h6a1 1 0 0 1 1 1V6H8V3.6a1 1 0 0 1 1-1Z"/><path d="M8.5 12.4l2 2 4-4"/><path d="M8.5 17h5"/></svg></span>
              <span className={styles.appTitle}>Assignee</span>
              <span className={styles.appArrow}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="18" y2="12"/><polyline points="12 6 18 12 12 18"/></svg></span>
            </span>
          </Link>

          <Link className={`${styles.appCard} ${styles.cTimer}`} to="/timer">
            <span className={styles.cardPreview}>
              <svg viewBox="0 0 200 108" aria-hidden="true">
                <g>
                  <circle cx="46" cy="44" r="23" className={styles.artPanel} stroke="var(--warn)" strokeWidth="1.4" strokeOpacity=".55"/>
                  <line x1="46.0" y1="22.5" x2="46.0" y2="25.5" stroke="var(--muted)" strokeWidth="1.3" opacity=".65"/><line x1="56.8" y1="25.4" x2="56.0" y2="26.7" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="64.6" y1="33.2" x2="63.3" y2="34.0" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="67.5" y1="44.0" x2="64.5" y2="44.0" stroke="var(--muted)" strokeWidth="1.3" opacity=".65"/><line x1="64.6" y1="54.7" x2="63.3" y2="54.0" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="56.8" y1="62.6" x2="56.0" y2="61.3" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="46.0" y1="65.5" x2="46.0" y2="62.5" stroke="var(--muted)" strokeWidth="1.3" opacity=".65"/><line x1="35.2" y1="62.6" x2="36.0" y2="61.3" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="27.4" y1="54.8" x2="28.7" y2="54.0" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="24.5" y1="44.0" x2="27.5" y2="44.0" stroke="var(--muted)" strokeWidth="1.3" opacity=".65"/><line x1="27.4" y1="33.2" x2="28.7" y2="34.0" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="35.2" y1="25.4" x2="36.0" y2="26.7" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/>
                  <line x1="46" y1="44" x2="46" y2="32.5" className={styles.artText} stroke="var(--text)" strokeWidth="2.4" strokeLinecap="round" transform="rotate(128 46 44)"/>
                  <line x1="46" y1="44" x2="46" y2="27.0" stroke="var(--text)" strokeWidth="1.6" strokeLinecap="round" transform="rotate(42 46 44)"/>
                  <line className={`${styles.artSec} s1`} x1="46" y1="48.6" x2="46" y2="25.1" stroke="var(--warn)" strokeWidth="1" strokeLinecap="round" style={{ transformBox: 'view-box', transformOrigin: '46px 44px' }}/>
                  <circle cx="46" cy="44" r="1.7" fill="var(--warn)"/>
                </g>
                <g>
                  <circle cx="100" cy="44" r="23" className={styles.artPanel} stroke="var(--accent)" strokeWidth="1.4" strokeOpacity=".55"/>
                  <line x1="100.0" y1="22.5" x2="100.0" y2="25.5" stroke="var(--muted)" strokeWidth="1.3" opacity=".65"/><line x1="110.8" y1="25.4" x2="110.0" y2="26.7" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="118.6" y1="33.2" x2="117.3" y2="34.0" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="121.5" y1="44.0" x2="118.5" y2="44.0" stroke="var(--muted)" strokeWidth="1.3" opacity=".65"/><line x1="118.6" y1="54.7" x2="117.3" y2="54.0" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="110.8" y1="62.6" x2="110.0" y2="61.3" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="100.0" y1="65.5" x2="100.0" y2="62.5" stroke="var(--muted)" strokeWidth="1.3" opacity=".65"/><line x1="89.2" y1="62.6" x2="90.0" y2="61.3" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="81.4" y1="54.8" x2="82.7" y2="54.0" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="78.5" y1="44.0" x2="81.5" y2="44.0" stroke="var(--muted)" strokeWidth="1.3" opacity=".65"/><line x1="81.4" y1="33.2" x2="82.7" y2="34.0" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="89.2" y1="25.4" x2="90.0" y2="26.7" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/>
                  <line x1="100" y1="44" x2="100" y2="32.5" className={styles.artText} stroke="var(--text)" strokeWidth="2.4" strokeLinecap="round" transform="rotate(214 100 44)"/>
                  <line x1="100" y1="44" x2="100" y2="27.0" stroke="var(--text)" strokeWidth="1.6" strokeLinecap="round" transform="rotate(300 100 44)"/>
                  <line className={`${styles.artSec} s2`} x1="100" y1="48.6" x2="100" y2="25.1" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" style={{ transformBox: 'view-box', transformOrigin: '100px 44px' }}/>
                  <circle cx="100" cy="44" r="1.7" fill="var(--accent)"/>
                </g>
                <g>
                  <circle cx="154" cy="44" r="23" className={styles.artPanel} stroke="var(--warn)" strokeWidth="1.4" strokeOpacity=".55"/>
                  <line x1="154.0" y1="22.5" x2="154.0" y2="25.5" stroke="var(--muted)" strokeWidth="1.3" opacity=".65"/><line x1="164.8" y1="25.4" x2="164.0" y2="26.7" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="172.6" y1="33.2" x2="171.3" y2="34.0" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="175.5" y1="44.0" x2="172.5" y2="44.0" stroke="var(--muted)" strokeWidth="1.3" opacity=".65"/><line x1="172.6" y1="54.7" x2="171.3" y2="54.0" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="164.8" y1="62.6" x2="164.0" y2="61.3" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="154.0" y1="65.5" x2="154.0" y2="62.5" stroke="var(--muted)" strokeWidth="1.3" opacity=".65"/><line x1="143.2" y1="62.6" x2="144.0" y2="61.3" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="135.4" y1="54.8" x2="136.7" y2="54.0" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="132.5" y1="44.0" x2="135.5" y2="44.0" stroke="var(--muted)" strokeWidth="1.3" opacity=".65"/><line x1="135.4" y1="33.2" x2="136.7" y2="34.0" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/><line x1="143.2" y1="25.4" x2="144.0" y2="26.7" stroke="var(--muted)" strokeWidth="0.7" opacity=".65"/>
                  <line x1="154" y1="44" x2="154" y2="32.5" className={styles.artText} stroke="var(--text)" strokeWidth="2.4" strokeLinecap="round" transform="rotate(44 154 44)"/>
                  <line x1="154" y1="44" x2="154" y2="27.0" stroke="var(--text)" strokeWidth="1.6" strokeLinecap="round" transform="rotate(168 154 44)"/>
                  <line className={`${styles.artSec} s3`} x1="154" y1="48.6" x2="154" y2="25.1" stroke="var(--warn)" strokeWidth="1" strokeLinecap="round" style={{ transformBox: 'view-box', transformOrigin: '154px 44px' }}/>
                  <circle cx="154" cy="44" r="1.7" fill="var(--warn)"/>
                </g>
                <g>
                  <rect x="30" y="80" width="32" height="13" rx="6.5" fill="var(--warn-soft)"/>
                  <rect x="37" y="85" width="18" height="3.5" rx="1.75" fill="var(--warn)" opacity=".9"/>
                  <rect x="84" y="80" width="32" height="13" rx="6.5" fill="var(--accent-soft)"/>
                  <rect x="91" y="85" width="18" height="3.5" rx="1.75" fill="var(--accent)" opacity=".9"/>
                  <rect x="138" y="80" width="32" height="13" rx="6.5" fill="var(--warn-soft)"/>
                  <rect x="145" y="85" width="18" height="3.5" rx="1.75" fill="var(--warn)" opacity=".9"/>
                </g>
              </svg>
            </span>
            <span className={styles.cardFoot}>
              <span className={styles.appIcon}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 6.8V12l3.4 2.2"/></svg></span>
              <span className={styles.appTitle}>US Timer</span>
              <span className={styles.appArrow}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="18" y2="12"/><polyline points="12 6 18 12 12 18"/></svg></span>
            </span>
          </Link>

          <Link className={`${styles.appCard} ${styles.cMap}`} to="/map">
            <span className={styles.cardPreview}>
              <svg viewBox="0 0 200 108" aria-hidden="true">
                <defs>
                  <clipPath id="usClip"><path d="M22,36 L60,29 L104,25 L140,23 L150,19 L157,27 L165,41 L159,54 L152,61 L157,73 L155,88 L147,85 L145,69 L128,72 L112,70 L104,77 L96,88 L88,74 L74,71 L58,66 L42,57 L28,47 Z"/></clipPath>
                </defs>
                <g clipPath="url(#usClip)">
                  <rect className={`${styles.artZone} z1`} x="14" y="0" width="30" height="108" fill="var(--map-pst, #b07ce8)"/><rect className={`${styles.artZone} z2`} x="44" y="0" width="34" height="108" fill="var(--map-mst, #e0a355)"/><rect className={`${styles.artZone} z3`} x="78" y="0" width="38" height="108" fill="var(--map-cst, #34b39a)"/><rect className={`${styles.artZone} z4`} x="116" y="0" width="74" height="108" fill="var(--map-est, #7c8cf8)"/>
                  <g stroke="var(--panel)" strokeWidth="1.1" opacity=".55">
                    <line x1="44" y1="0" x2="44" y2="108"/><line x1="78" y1="0" x2="78" y2="108"/>
                    <line x1="116" y1="0" x2="116" y2="108"/>
                    <line x1="0" y1="46" x2="200" y2="46"/><line x1="0" y1="60" x2="200" y2="60"/>
                    <line x1="62" y1="0" x2="62" y2="46"/><line x1="97" y1="46" x2="97" y2="108"/>
                    <line x1="134" y1="0" x2="134" y2="60"/>
                  </g>
                </g>
                <path d="M22,36 L60,29 L104,25 L140,23 L150,19 L157,27 L165,41 L159,54 L152,61 L157,73 L155,88 L147,85 L145,69 L128,72 L112,70 L104,77 L96,88 L88,74 L74,71 L58,66 L42,57 L28,47 Z" fill="none" stroke="var(--text)" strokeWidth="1.3" strokeOpacity=".35" strokeLinejoin="round"/>
                <g fill="none">
                  <circle className={styles.artPin} cx="148" cy="45" r="2.2" stroke="var(--text)" strokeWidth="1.1"/>
                  <circle className={`${styles.artPin} p2`} cx="98" cy="58" r="2.2" stroke="var(--text)" strokeWidth="1.1"/>
                  <circle className={`${styles.artPin} p3`} cx="33" cy="45" r="2.2" stroke="var(--text)" strokeWidth="1.1"/>
                </g>
                <g fill="var(--text)">
                  <circle cx="148" cy="45" r="1.9"/><circle cx="98" cy="58" r="1.9"/><circle cx="33" cy="45" r="1.9"/>
                </g>
              </svg>
            </span>
            <span className={styles.cardFoot}>
              <span className={styles.appIcon}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 7.2 9 4.6l6 2.6 6.5-2.6v12.2L15 19.4l-6-2.6-6.5 2.6z"/><path d="M9 4.6v12.2M15 7.2v12.2"/></svg></span>
              <span className={styles.appTitle}>US Map</span>
              <span className={styles.appArrow}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="18" y2="12"/><polyline points="12 6 18 12 12 18"/></svg></span>
            </span>
          </Link>
        </nav>
      </main>

      {addMemberOpen && (
        <AddMemberModal
          onClose={() => setAddMemberOpen(false)}
          onCreated={(created) => setMembers((prev) => prev.concat([created]))}
        />
      )}
    </>
  );
}
