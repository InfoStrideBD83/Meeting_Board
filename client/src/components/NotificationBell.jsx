import { useEffect, useRef, useState } from 'react';

/** Generic bell+badge+panel, driving both Master's "today's meetings" and
 *  "pending sign-ups" (admin-only) bells with the same markup/behavior
 *  the original page wired up independently for each. */
export function NotificationBell({ icon, title, ariaLabel, count, panelTitle, onOpen, children }) {
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

  function handleToggle(e) {
    e.stopPropagation();
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && onOpen) onOpen();
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        className="notif-btn"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={count ? `${count} ${ariaLabel}` : ariaLabel}
        title={title}
        onClick={handleToggle}
      >
        {icon}
        {count > 0 && <span className="notif-badge">{count}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">{panelTitle}</div>
          <div>{children}</div>
        </div>
      )}
    </div>
  );
}
