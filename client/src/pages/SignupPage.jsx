import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client.js';
import { Logo3D } from '../components/Logo3D.jsx';
import styles from './SignupPage.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPID_RE = /^\d{5}$/;
const PENDING_KEY = 'infostride-pending-signup';

export function SignupPage() {
  const navigate = useNavigate();

  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [empId, setEmpId] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { text, type: 'err' | 'ok' }

  // Awaiting-approval state
  const [waiting, setWaiting] = useState(false);
  const [outcome, setOutcome] = useState(null); // null | 'approved' | 'declined'
  const [progress, setProgress] = useState(0);

  const progressRef = useRef(0);
  const progressTimerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const settledRef = useRef(false);

  function clearTimers() {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    progressTimerRef.current = null;
    pollTimerRef.current = null;
  }

  useEffect(() => () => clearTimers(), []);

  function finishWait(approved) {
    clearTimers();
    try { window.sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }

    if (approved) {
      progressRef.current = 100;
      setProgress(100);
      setOutcome('approved');
      setTimeout(() => navigate('/login', { replace: true }), 1800);
    } else {
      setOutcome('declined');
    }
  }

  function checkStatus(pendingId) {
    if (settledRef.current) return;
    apiFetch('/auth/signup-status/' + encodeURIComponent(pendingId))
      .then((data) => {
        if (data.status === 'approved') { settledRef.current = true; finishWait(true); }
        else if (data.status === 'declined') { settledRef.current = true; finishWait(false); }
      })
      .catch(() => { /* transient network hiccup — next poll tick retries */ });
  }

  function enterWaitState(pendingId) {
    try { window.sessionStorage.setItem(PENDING_KEY, pendingId); } catch { /* ignore */ }

    setMsg(null);
    setWaiting(true);
    setOutcome(null);
    settledRef.current = false;
    progressRef.current = 0;
    setProgress(0);

    progressTimerRef.current = setInterval(() => {
      progressRef.current = Math.min(88, progressRef.current + (88 - progressRef.current) * 0.07 + 0.4);
      setProgress(progressRef.current);
    }, 260);

    pollTimerRef.current = setInterval(() => checkStatus(pendingId), 1500);
    checkStatus(pendingId); // in case it was already resolved an instant ago
  }

  // Resume the wait screen after a refresh, instead of losing it.
  useEffect(() => {
    let pendingId;
    try { pendingId = window.sessionStorage.getItem(PENDING_KEY); } catch { pendingId = null; }
    if (pendingId) enterWaitState(pendingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmedFirst = first.trim();
    const trimmedLast = last.trim();
    const trimmedEmpId = empId.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedFirst || !trimmedLast || !trimmedEmpId || !trimmedEmail || !pass || !pass2) {
      setMsg({ text: 'Fill in every field to continue.', type: 'err' });
      return;
    }
    if (!EMPID_RE.test(trimmedEmpId)) {
      setMsg({ text: 'Employee ID must be exactly 5 digits, e.g. 12345.', type: 'err' });
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setMsg({ text: 'Enter a valid email address.', type: 'err' });
      return;
    }
    if (pass.length < 8) {
      setMsg({ text: 'Password must be at least 8 characters.', type: 'err' });
      return;
    }
    if (pass !== pass2) {
      setMsg({ text: 'Passwords do not match.', type: 'err' });
      return;
    }

    setBusy(true);
    apiFetch('/auth/signup', {
      method: 'POST',
      body: { name: `${trimmedFirst} ${trimmedLast}`.trim(), email: trimmedEmail, password: pass, employee_id: trimmedEmpId },
    })
      .then((data) => {
        setFirst(''); setLast(''); setEmpId(''); setEmail(''); setPass(''); setPass2('');
        if (data.status === 'approved') {
          setBusy(false);
          setMsg({ text: "Account created — you’re the first user, so you’ve been made an admin. Redirecting to sign in…", type: 'ok' });
          setTimeout(() => navigate('/login', { replace: true }), 1600);
        } else {
          enterWaitState(data.pendingId);
        }
      })
      .catch((err) => {
        setBusy(false);
        setMsg({ text: err.message || 'Could not create your account.', type: 'err' });
      });
  }

  const waitTitle = outcome === 'approved' ? 'You’re approved!' : outcome === 'declined' ? 'Request declined' : 'Request sent!';
  const waitSub = outcome === 'approved'
    ? 'Your account has been created and approved successfully.'
    : outcome === 'declined'
      ? 'An admin declined this request. Contact your admin, or try creating the account again.'
      : 'Hang tight — an admin needs to approve your account before you can sign in.';
  const progressStatus = outcome === 'approved' ? 'Approved — redirecting to sign in…' : outcome === 'declined' ? 'Declined' : 'Waiting for admin approval…';

  return (
    <div className={styles.page}>
      <div className={styles.ambient} aria-hidden="true">
        <div className={`${styles.ambientDots} ${waiting ? styles.ambientDotsWaiting : ''}`} />
        <div className={`${styles.ambientRings} ${waiting ? styles.ambientRingsWaiting : ''}`}>
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
        <span className={styles.ambientGlyph + ' ' + styles.g1}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 2 L13 12 L3 22 L9 22 L19 12 L9 2 Z"/></svg></span>
        <span className={styles.ambientGlyph + ' ' + styles.g2}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 2 L13 12 L3 22 L9 22 L19 12 L9 2 Z"/></svg></span>
        <span className={styles.ambientGlyph + ' ' + styles.g3}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 2 L13 12 L3 22 L9 22 L19 12 L9 2 Z"/></svg></span>
      </div>

      <Logo3D variant="signup" />

      <div className={styles.authWrap}>
        <div className={`${styles.authCard} ${waiting && !outcome ? styles.waitingGlow : ''} ${outcome === 'approved' ? styles.waitingGlowDone : ''}`}>
          {!waiting ? (
            <>
              <h1 className={styles.authTitle}>Create your account</h1>
              <p className={styles.authSub} />

              {msg && (
                <div className={`${styles.authMsg} ${msg.type === 'err' ? styles.authMsgErr : styles.authMsgOk}`}>
                  {msg.text}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label htmlFor="f_first">First name<span className={styles.reqStar}>*</span></label>
                    <input type="text" id="f_first" autoComplete="given-name" placeholder="Jordan" required
                           value={first} onChange={(e) => setFirst(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="f_last">Last name<span className={styles.reqStar}>*</span></label>
                    <input type="text" id="f_last" autoComplete="family-name" placeholder="Rivera" required
                           value={last} onChange={(e) => setLast(e.target.value)} />
                  </div>
                </div>
                <div className={styles.field}>
                  <label htmlFor="f_empid">Employee ID<span className={styles.reqStar}>*</span></label>
                  <input type="text" id="f_empid" autoComplete="off" inputMode="numeric" pattern="\d{5}" maxLength={5}
                         placeholder="e.g. 12345" required value={empId} onChange={(e) => setEmpId(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="f_email">Email<span className={styles.reqStar}>*</span></label>
                  <input type="email" id="f_email" autoComplete="username" placeholder="you@infostride.com" required
                         value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="f_pass">Password<span className={styles.reqStar}>*</span></label>
                  <input type="password" id="f_pass" autoComplete="new-password" placeholder="••••••••" required
                         value={pass} onChange={(e) => setPass(e.target.value)} />
                  <span className={styles.fieldHint}>At least 8 characters.</span>
                </div>
                <div className={styles.field}>
                  <label htmlFor="f_pass2">Confirm password<span className={styles.reqStar}>*</span></label>
                  <input type="password" id="f_pass2" autoComplete="new-password" placeholder="••••••••" required
                         value={pass2} onChange={(e) => setPass2(e.target.value)} />
                </div>
                <button type="submit" className={styles.authBtn} disabled={busy}>Create Account</button>
              </form>

              <p className={styles.authFoot}>Already have an account? <a href="/login">Sign in</a></p>
            </>
          ) : (
            <div className={styles.waitPanel}>
              {!outcome && <div className={styles.waitSpinner} aria-hidden="true" />}
              {outcome === 'approved' && (
                <div className={styles.waitCheck} aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
              )}
              <h1 className={styles.authTitle}>{waitTitle}</h1>
              <p className={styles.authSub}>{waitSub}</p>

              <div className={styles.progressWrap}>
                <div
                  className={`${styles.progressBar} ${!outcome ? styles.progressBarIndeterminate : ''} ${outcome === 'approved' ? styles.progressBarDone : ''}`}
                  style={{ width: `${progress}%`, background: outcome === 'declined' ? 'var(--err)' : undefined }}
                />
              </div>
              <div className={styles.progressMeta}>
                <span>{progressStatus}</span>
                <span className={styles.mono}>{Math.round(progress)}%</span>
              </div>

              {outcome === 'declined' && (
                <p className={styles.authFoot}>Already have an account? <a href="/login">Sign in</a></p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
