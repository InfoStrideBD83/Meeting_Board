import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, isLoggedIn, setToken, clearToken } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Logo3D } from '../components/Logo3D.jsx';
import styles from './LoginPage.module.css';

const EMPID_RE = /^\d{5}$/;

export function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [view, setView] = useState('login'); // 'login' | 'reset'
  const [msg, setMsg] = useState(null); // { text, type: 'err' | 'ok' }

  // Login form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);

  // Reset form
  const [rEmail, setREmail] = useState('');
  const [rEmpId, setREmpId] = useState('');
  const [rPass, setRPass] = useState('');
  const [rPass2, setRPass2] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  // Already have a token? Verify it's still valid, then skip straight to
  // the workspace instead of trusting its mere presence.
  useEffect(() => {
    if (!isLoggedIn()) return;
    apiFetch('/auth/me')
      .then(() => navigate('/', { replace: true }))
      .catch(() => clearToken());
  }, [navigate]);

  function handleLogin(e) {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setMsg({ text: 'Enter your email and password.', type: 'err' });
      return;
    }

    setLoginBusy(true);
    apiFetch('/auth/login', { method: 'POST', body: { email: trimmedEmail, password } })
      .then(async (data) => {
        setToken(data.token, remember);
        // The shared AuthContext bootstrapped once at app start, before this
        // token existed — without this it still thinks no one is signed in,
        // and ProtectedRoute would bounce straight back to /login.
        await refresh();
        setMsg({ text: 'Signed in — redirecting…', type: 'ok' });
        setTimeout(() => navigate('/', { replace: true }), 400);
      })
      .catch((err) => {
        setLoginBusy(false);
        setMsg({ text: err.message || 'Sign in failed.', type: 'err' });
      });
  }

  function showResetView() {
    setView('reset');
    setMsg(null);
  }

  function showLoginView() {
    setView('login');
    setMsg(null);
  }

  function handleReset(e) {
    e.preventDefault();
    const trimmedEmail = rEmail.trim().toLowerCase();
    const trimmedEmpId = rEmpId.trim();

    if (!trimmedEmail || !trimmedEmpId || !rPass || !rPass2) {
      setMsg({ text: 'Fill in every field to continue.', type: 'err' });
      return;
    }
    if (!EMPID_RE.test(trimmedEmpId)) {
      setMsg({ text: 'Employee ID must be exactly 5 digits, e.g. 12345.', type: 'err' });
      return;
    }
    if (rPass.length < 8) {
      setMsg({ text: 'Password must be at least 8 characters.', type: 'err' });
      return;
    }
    if (rPass !== rPass2) {
      setMsg({ text: 'Passwords do not match.', type: 'err' });
      return;
    }

    setResetBusy(true);
    apiFetch('/auth/reset-password', {
      method: 'POST',
      body: { email: trimmedEmail, employee_id: trimmedEmpId, newPassword: rPass },
    })
      .then(() => {
        setResetBusy(false);
        setMsg({ text: 'Password updated — you can now sign in.', type: 'ok' });
        setREmail(''); setREmpId(''); setRPass(''); setRPass2('');
        setTimeout(showLoginView, 1400);
      })
      .catch((err) => {
        setResetBusy(false);
        setMsg({ text: err.message || 'Could not reset password.', type: 'err' });
      });
  }

  return (
    <div className={styles.page}>
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

      <Logo3D variant="login" />

      <div className={styles.authWrap}>
        <div className={styles.authCard}>
          <h1 className={styles.authTitle}>{view === 'login' ? 'Welcome back' : 'Reset your password'}</h1>
          {view === 'login' && <p className={styles.authSub}>Sign in to access the InfoStride workspace.</p>}

          {msg && (
            <div className={`${styles.authMsg} ${msg.type === 'err' ? styles.authMsgErr : styles.authMsgOk}`}>
              {msg.text}
            </div>
          )}

          {view === 'login' ? (
            <form onSubmit={handleLogin} noValidate>
              <div className={styles.field}>
                <label htmlFor="f_email">Email<span className={styles.reqStar}>*</span></label>
                <input type="email" id="f_email" autoComplete="username" placeholder="you@infostride.com" required
                       value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="f_pass">Password<span className={styles.reqStar}>*</span></label>
                <input type="password" id="f_pass" autoComplete="current-password" placeholder="••••••••" required
                       value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className={styles.authRow}>
                <label className={styles.rememberRow} htmlFor="f_remember">
                  <input type="checkbox" id="f_remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  Remember me on this device
                </label>
                <button type="button" className={styles.forgotLink} onClick={showResetView}>Forgot password?</button>
              </div>
              <button type="submit" className={styles.authBtn} disabled={loginBusy}>Log In</button>
              <p className={styles.authFoot}>Don&apos;t have an account? <a href="/signup">Create one</a></p>
            </form>
          ) : (
            <form onSubmit={handleReset} noValidate>
              <div className={styles.field}>
                <label htmlFor="r_email">Email<span className={styles.reqStar}>*</span></label>
                <input type="email" id="r_email" autoComplete="username" placeholder="you@infostride.com" required
                       value={rEmail} onChange={(e) => setREmail(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="r_empid">Employee ID<span className={styles.reqStar}>*</span></label>
                <input type="text" id="r_empid" autoComplete="off" inputMode="numeric" pattern="\d{5}" maxLength={5}
                       placeholder="e.g. 12345" required value={rEmpId} onChange={(e) => setREmpId(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="r_pass">New password<span className={styles.reqStar}>*</span></label>
                <input type="password" id="r_pass" autoComplete="new-password" placeholder="••••••••" required
                       value={rPass} onChange={(e) => setRPass(e.target.value)} />
                <span className={styles.fieldHint}>At least 8 characters.</span>
              </div>
              <div className={styles.field}>
                <label htmlFor="r_pass2">Confirm new password<span className={styles.reqStar}>*</span></label>
                <input type="password" id="r_pass2" autoComplete="new-password" placeholder="••••••••" required
                       value={rPass2} onChange={(e) => setRPass2(e.target.value)} />
              </div>
              <button type="submit" className={styles.authBtn} disabled={resetBusy}>Reset Password</button>
              <p className={styles.authFoot}>
                <button type="button" className={styles.forgotLink} onClick={showLoginView}>&larr; Back to sign in</button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
