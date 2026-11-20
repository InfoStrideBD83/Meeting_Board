import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const THEME_KEY = 'infostride-theme';

function safeGet(k) { try { return window.localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } }

function systemTheme() {
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
}

// The user's choice: 'light' | 'dark' | 'system' (default, follows the OS).
function readMode() {
  const t = safeGet(THEME_KEY);
  return (t === 'light' || t === 'dark' || t === 'system') ? t : 'system';
}

const ThemeContext = createContext(null);

// A temporary "GTA 6"-inspired visual theme — self-expiring, no cron job or
// scheduled task needed. The user's own light/dark/system preference below
// is completely untouched the whole time; this only overrides what actually
// gets WRITTEN to the DOM while the window is open, so once it closes the
// app silently reverts to whatever they'd already set, automatically, with
// nothing further for anyone to do or remember.
const GTA_THEME_START = new Date('2026-11-20T00:00:00');
const GTA_THEME_END = new Date(GTA_THEME_START.getTime() + 10 * 24 * 60 * 60 * 1000);
function gtaThemeActive(now = Date.now()) {
  return now >= GTA_THEME_START.getTime() && now < GTA_THEME_END.getTime();
}

/** Same localStorage key and data-theme attribute the HTML pages use, so
 *  a theme choice made here carries over to any not-yet-ported page and
 *  back, via the same 'storage' cross-tab event. Exposes both the raw
 *  `mode` (what SettingsModal's 3-way picker shows as selected) and the
 *  resolved `theme` ('light'/'dark', what everything else actually renders
 *  with) — they differ only in 'system' mode, where `theme` tracks the OS
 *  live. `effectiveTheme` is what's actually applied to the DOM, which
 *  during the GTA window is 'gta' regardless of `theme` — components that
 *  need to know whether the special theme is showing (e.g. its decorative
 *  overlay) should read that, not `theme`. */
export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readMode);
  const [theme, setTheme] = useState(() => (readMode() === 'system' ? systemTheme() : readMode()));
  const [effectiveTheme, setEffectiveTheme] = useState(() => (gtaThemeActive() ? 'gta' : theme));

  const applyDom = useCallback((t) => {
    // data-theme stays the REAL light/dark resolution no matter what — a
    // good two dozen other stylesheets across this app (games, modals, the
    // US Timer/Map pages' own light/dark-locked themes) key off that exact
    // attribute value and only know about "light" or "dark". A third value
    // here would silently break all of them (duplicated logos, wrong
    // overlay tints, a broken-looking theme toggle icon, etc.). The GTA
    // palette instead layers on as its own independent override — see the
    // html[data-gta="true"] block in theme.css, which simply overrides the
    // same CSS variables on top, after both theme blocks in source order.
    const light = t === 'light';
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
    const gta = gtaThemeActive();
    document.documentElement.toggleAttribute('data-gta', gta);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', gta ? '#1b0f3a' : light ? '#f1f4fa' : '#090d15');
    setEffectiveTheme(gta ? 'gta' : t);
  }, []);

  useEffect(() => { applyDom(theme); }, [theme, applyDom]);

  // Flips the DOM over automatically the moment the window opens or closes,
  // for anyone who already has the app open across that boundary — without
  // this, it would only re-check on the next theme change or page reload.
  useEffect(() => {
    if (!gtaThemeActive()) return undefined;
    const msLeft = GTA_THEME_END.getTime() - Date.now();
    const timer = setTimeout(() => applyDom(theme), Math.min(msLeft, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [theme, applyDom]);

  useEffect(() => { setTheme(mode === 'system' ? systemTheme() : mode); }, [mode]);

  // In 'system' mode, follow the OS's own setting live.
  useEffect(() => {
    if (mode !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    function onChange() { setTheme(systemTheme()); }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  useEffect(() => {
    function onStorage(e) { if (e.key === THEME_KEY) setModeState(readMode()); }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setMode = useCallback((next) => {
    safeSet(THEME_KEY, next);
    setModeState(next);
  }, []);

  // Kept for ThemeToggle.jsx's existing header icon — a binary flip of the
  // *resolved* theme, which pins an explicit mode (leaving 'system' behind,
  // same as picking Light/Dark directly in SettingsModal would).
  const toggleTheme = useCallback(() => {
    setMode(theme === 'light' ? 'dark' : 'light');
  }, [theme, setMode]);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme, effectiveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
