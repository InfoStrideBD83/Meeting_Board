import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from './Avatar.jsx';
import { firstName } from '../utils/avatarColor.js';

/** The signed-in-user avatar + dropdown (name/email + Sign out), wired
 *  today only on Master.html. */
export function ProfileMenu() {
  const { member, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const role = member && member.is_admin ? 'Admin' : 'Member';

  function handleSignOut() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="profile" ref={wrapRef}>
      <button
        className="profile-btn"
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >
        <Avatar name={member && member.name} />
        <span className="profile-name">{firstName(member && member.name) === 'there' ? 'Signed in' : firstName(member.name)}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="profile-menu">
          <div className="profile-head">
            <Avatar name={member && member.name} size={38} />
            <div className="ph-body">
              <div className="ph-name">{(member && member.name) || 'Not signed in'}</div>
              <div className="ph-sub">{(member && member.email) || role || 'InfoStride'}</div>
            </div>
          </div>
          <div className="menu-sep" />
          <button className="menu-item" type="button" onClick={handleSignOut}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
