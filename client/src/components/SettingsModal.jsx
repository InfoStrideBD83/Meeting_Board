import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { getCursorFxEnabled, setCursorFxEnabled } from './cursorFxStore.js';
import {
  getWeatherLocation, setWeatherLocation,
  getClockZone, setClockZone, CLOCK_ZONES,
} from '../utils/homePrefsStore.js';
import styles from './SettingsModal.module.css';

const SEARCH_DEBOUNCE_MS = 350;
const THEME_MODES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']];

/** Home-page preferences, reached from the profile menu above "Sign out" —
 *  consolidates controls that otherwise live scattered across the app
 *  (theme, cursor effects/glyph) plus two new ones specific to the Home
 *  header (which city WeatherWidget reports on, which time zone LiveClock
 *  shows). Everything here is a personal, client-side-only preference
 *  (localStorage via homePrefsStore.js / cursorFxStore.js / ThemeContext)
 *  — nothing is sent to the server, so there's no save/cancel step, each
 *  control applies immediately and stays in sync with its header
 *  counterpart (ThemeToggle, CursorEffectsToggle) either way. */
export function SettingsModal({ onClose }) {
  const { mode, setMode } = useTheme();
  const [cursorFx, setCursorFxState] = useState(getCursorFxEnabled);
  const [clockZone, setClockZoneState] = useState(getClockZone);
  const [location, setLocationState] = useState(getWeatherLocation);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    function onKeyDown(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearchErr(null); return undefined; }

    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`)
        .then((r) => r.json())
        .then((data) => { setResults(data.results || []); setSearchErr(null); })
        .catch(() => setSearchErr('Could not search right now.'))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function toggleCursorFx() {
    const next = !cursorFx;
    setCursorFxState(next);
    setCursorFxEnabled(next);
  }

  function pickPlace(r) {
    const label = [r.name, r.admin1 || r.country].filter(Boolean).join(', ');
    const loc = { lat: r.latitude, lon: r.longitude, label };
    setWeatherLocation(loc);
    setLocationState(loc);
    setQuery('');
    setResults([]);
  }

  function useCurrentLocation() {
    setWeatherLocation(null);
    setLocationState(null);
  }

  function changeClockZone(e) {
    const zone = e.target.value;
    setClockZone(zone);
    setClockZoneState(zone);
  }

  // Portaled straight to <body> — this is triggered from deep inside
  // AppHeader (ProfileMenu), and AppHeader is a sticky-positioned stacking
  // context (`isolation: isolate`, `z-index: 100`). A plain `position:
  // fixed` descendant of a stacking-context-creating ancestor gets its
  // paint order trapped inside that ancestor's context regardless of its
  // own z-index, so without the portal this could render behind anything
  // outside AppHeader with a higher z-index (the floating widget buttons,
  // the footer) — every other modal in this app avoids the problem simply
  // by living outside AppHeader already; this one can't, so it portals out.
  return createPortal((
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.drawer} role="dialog" aria-modal="true" aria-label="Settings">
        <div className={styles.modalHead}>
          <h3>Settings</h3>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Appearance</div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Theme</span>
              <select className={styles.select} value={mode} onChange={(e) => setMode(e.target.value)}>
                {THEME_MODES.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Cursor sparkle effects</span>
              <button type="button" className={styles.switch} role="switch" aria-checked={cursorFx} onClick={toggleCursorFx}>
                <span className={styles.switchKnob} />
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Home header clock</div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Time zone shown</span>
              <select className={styles.select} value={clockZone} onChange={changeClockZone}>
                {Object.entries(CLOCK_ZONES).map(([key, z]) => (
                  <option key={key} value={key}>{z.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Weather location</div>
            <div className={styles.currentLoc}>
              {location ? (
                <>Pinned to <strong>{location.label}</strong></>
              ) : (
                <>Using your current location (device/browser)</>
              )}
              {location && (
                <button type="button" className={styles.linkBtn} onClick={useCurrentLocation}>Use my current location instead</button>
              )}
            </div>
            <input
              type="text"
              className={styles.control}
              placeholder="Search for a city or state…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {searching && <p className={styles.hint}>Searching…</p>}
            {searchErr && <p className={styles.errMsg}>{searchErr}</p>}
            {results.length > 0 && (
              <div className={styles.results}>
                {results.map((r) => (
                  <button key={r.id} type="button" className={styles.resultRow} onClick={() => pickPlace(r)}>
                    <span className={styles.resultName}>{r.name}</span>
                    <span className={styles.resultMeta}>{[r.admin1, r.country].filter(Boolean).join(', ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.modalFoot}>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  ), document.body);
}
