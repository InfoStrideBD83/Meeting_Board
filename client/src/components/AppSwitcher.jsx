import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const APPS = [
  {
    to: '/meetings',
    label: 'Meeting Board',
    tint: 'switcher-board',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 4.5v-2M16 4.5v-2M7.5 13.5h4M7.5 17h7"/></svg>,
  },
  {
    to: '/assignee',
    label: 'Assignee',
    tint: 'switcher-assignee',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="17" rx="2.2"/><path d="M9 2.6h6a1 1 0 0 1 1 1V6H8V3.6a1 1 0 0 1 1-1Z"/><path d="M8.5 12.4l2 2 4-4"/><path d="M8.5 17h5"/></svg>,
  },
  {
    to: '/timer',
    label: 'US Timer',
    tint: 'switcher-timer',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 6.8V12l3.4 2.2"/></svg>,
  },
  {
    to: '/map',
    label: 'US Map',
    tint: 'switcher-map',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 7.2 9 4.6l6 2.6 6.5-2.6v12.2L15 19.4l-6-2.6-6.5 2.6z"/><path d="M9 4.6v12.2M15 7.2v12.2"/></svg>,
  },
];

/** Quick jump between the 4 workspace pages from any of their headers,
 *  without detouring back through Master first. Global classes (not a
 *  CSS module) so it drops cleanly into US Timer/US Map's own headers
 *  too — theme.css's tokens are root-level and available everywhere. */
export function AppSwitcher() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
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

  const others = APPS.filter((a) => a.to !== location.pathname);

  return (
    <div className="switcher-wrap" ref={wrapRef}>
      <button
        type="button"
        className="notif-btn"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Switch workspace"
        title="Switch workspace"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="6" r="2.1"/><circle cx="12" cy="6" r="2.1"/><circle cx="18" cy="6" r="2.1"/><circle cx="6" cy="12" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="18" cy="12" r="2.1"/><circle cx="6" cy="18" r="2.1"/><circle cx="12" cy="18" r="2.1"/><circle cx="18" cy="18" r="2.1"/></svg>
      </button>
      {open && (
        <div className="switcher-panel">
          <div className="notif-panel-head">Switch to</div>
          <div className="switcher-grid">
            {others.map((a) => (
              <Link key={a.to} to={a.to} className={`switcher-item ${a.tint}`} onClick={() => setOpen(false)}>
                <span className="switcher-icon">{a.icon}</span>
                <span>{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
