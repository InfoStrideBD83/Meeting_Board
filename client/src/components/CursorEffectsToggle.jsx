import { useState } from 'react';
import { getCursorFxEnabled, setCursorFxEnabled } from './BrandCursor.jsx';

/** Opt-out switch for BrandCursor.jsx's sparkle-trail cursor — it already
 *  auto-disables for touch/reduced-motion/forced-colors, but motion that
 *  follows your every move can still be unwanted for reasons an OS setting
 *  doesn't capture, so it stays a one-click, persisted choice either way. */
export function CursorEffectsToggle() {
  const [on, setOn] = useState(getCursorFxEnabled);

  function toggle() {
    const next = !on;
    setOn(next);
    setCursorFxEnabled(next);
  }

  return (
    <button
      className="cursor-fx-toggle"
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? 'Turn off cursor sparkle effects' : 'Turn on cursor sparkle effects'}
      title="Toggle cursor sparkle effects"
      onClick={toggle}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}
