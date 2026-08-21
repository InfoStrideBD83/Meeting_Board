import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client.js';
import styles from './AddMemberModal.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPID_RE = /^\d{5}$/;

/** Admin-only "add a team member directly" form — POSTs straight to
 *  /api/members (bypasses the sign-up/pending-approval flow, since an
 *  admin is vouching for the account themselves). */
export function AddMemberModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [isAdminRole, setIsAdminRole] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function onKeyDown(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedEmpId = employeeId.trim();

    if (!trimmedName) { setError('Name is required.'); return; }
    if (!EMAIL_RE.test(trimmedEmail)) { setError('Enter a valid email address.'); return; }
    if (trimmedEmpId && !EMPID_RE.test(trimmedEmpId)) { setError('Employee ID must be exactly 5 digits, e.g. 12345.'); return; }
    if (password && password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    setBusy(true);
    setError(null);
    apiFetch('/members', {
      method: 'POST',
      body: {
        name: trimmedName,
        email: trimmedEmail,
        employee_id: trimmedEmpId || undefined,
        password: password || undefined,
        is_admin: isAdminRole,
      },
    })
      .then((created) => {
        onCreated(created);
        onClose();
      })
      .catch((err) => {
        setBusy(false);
        setError(err.message || 'Could not add this member.');
      });
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <h3>Add team member</h3>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {error && <div className={styles.errMsg}>{error}</div>}

            <div className={styles.fgroup}>
              <label htmlFor="nm_name">Name<span className={styles.reqStar}>*</span></label>
              <input id="nm_name" className={styles.control} type="text" placeholder="Jordan Rivera" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className={styles.fgroup}>
              <label htmlFor="nm_email">Email<span className={styles.reqStar}>*</span></label>
              <input id="nm_email" className={styles.control} type="email" placeholder="jordan@infostride.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className={styles.gridTwo}>
              <div className={styles.fgroup}>
                <label htmlFor="nm_empid">Employee ID</label>
                <input id="nm_empid" className={styles.control} type="text" inputMode="numeric" maxLength={5} placeholder="e.g. 12345" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
              </div>
              <div className={styles.fgroup}>
                <label htmlFor="nm_pass">Initial password</label>
                <input id="nm_pass" className={styles.control} type="password" placeholder="Optional" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={isAdminRole} onChange={(e) => setIsAdminRole(e.target.checked)} />
              Make this member an admin
            </label>
            <p className={styles.hint}>
              If you leave the password blank, they can set one later from the sign-in page&rsquo;s
              &ldquo;Forgot password?&rdquo; flow — that needs their email and employee ID, so set an
              employee ID if you skip the password.
            </p>
          </div>
          <div className={styles.modalFoot}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
