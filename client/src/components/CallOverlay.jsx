import { useEffect, useState } from 'react';
import { useCall } from '../context/CallContext.jsx';
import { Avatar } from './Avatar.jsx';
import styles from './CallOverlay.module.css';

const ico = {
  phone: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
  ),
  hangup: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92V19a2 2 0 0 1-2 2A16 16 0 0 1 3 8a2 2 0 0 1 2-2h2.08a2 2 0 0 1 1.72 1.95c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11z" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
  ),
  mic: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
  ),
  micOff: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
  ),
};

function Timer({ startedAt }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return <span className={styles.timer}>{m}:{String(s).padStart(2, '0')}</span>;
}

/** Mounted once at the app root (see MasterPage.jsx), next to
 *  MessagingWidget — renders the two pieces of UI CallContext needs that
 *  aren't scoped to any one page: an incoming-call prompt, and a persistent
 *  bar for whatever call is currently active, visible no matter what page
 *  you navigate to while on it. */
export function CallOverlay() {
  const { incomingCall, activeCall, declineNotice, acceptCall, declineCall, leaveCall, toggleMute } = useCall();

  if (!incomingCall && !activeCall) return null;

  return (
    <>
      {incomingCall && (
        <div className={styles.incomingWrap} role="dialog" aria-label="Incoming call">
          <div className={styles.incomingCard}>
            <Avatar name={incomingCall.fromName} size={56} />
            <div className={styles.incomingName}>{incomingCall.fromName}</div>
            <div className={styles.incomingSub}>
              Voice call{incomingCall.isGroup ? ` · ${incomingCall.conversationName}` : ''}
            </div>
            <div className={styles.incomingActions}>
              <button type="button" className={`${styles.roundBtn} ${styles.decline}`} onClick={declineCall} aria-label="Decline call" title="Decline">
                {ico.hangup}
              </button>
              <button type="button" className={`${styles.roundBtn} ${styles.accept}`} onClick={acceptCall} aria-label="Accept call" title="Accept">
                {ico.phone}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCall && (
        <div className={styles.activeBar}>
          <div className={styles.activeInfo}>
            <div className={styles.activeStack}>
              {activeCall.participants.map((p) => (
                <Avatar key={p.memberId} name={p.name} color={p.color} size={28} className={styles.stackAvatar} />
              ))}
            </div>
            <div className={styles.activeText}>
              <span className={styles.activeName}>{activeCall.conversationName}</span>
              <Timer startedAt={activeCall.startedAt} />
            </div>
          </div>
          {declineNotice && <div className={styles.declineNotice}>{declineNotice}</div>}
          <div className={styles.activeActions}>
            <button
              type="button"
              className={`${styles.pillBtn} ${activeCall.mutedSelf ? styles.muted : ''}`}
              onClick={toggleMute}
              aria-label={activeCall.mutedSelf ? 'Unmute microphone' : 'Mute microphone'}
              title={activeCall.mutedSelf ? 'Unmute' : 'Mute'}
            >
              {activeCall.mutedSelf ? ico.micOff : ico.mic}
            </button>
            <button type="button" className={`${styles.pillBtn} ${styles.leave}`} onClick={leaveCall} aria-label="Leave call" title="Leave call">
              {ico.hangup}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
