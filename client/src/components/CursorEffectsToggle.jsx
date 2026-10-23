import { useState } from 'react';
import { getCursorFxEnabled, setCursorFxEnabled } from './cursorFxStore.js';

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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M4.6 2.9c-.9-.4-1.9.5-1.5 1.5l6.6 16.9c.4 1 1.8 1 2.2 0l2.4-6.3 6.3-2.4c1-.4 1-1.8 0-2.2L4.6 2.9Z" />
      </svg>
    </button>
  );
}
