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

/** Same localStorage key and data-theme attribute the HTML pages use, so
 *  a theme choice made here carries over to any not-yet-ported page and
 *  back, via the same 'storage' cross-tab event. Exposes both the raw
 *  `mode` (what SettingsModal's 3-way picker shows as selected) and the
 *  resolved `theme` ('light'/'dark', what everything else actually renders
 *  with) — they differ only in 'system' mode, where `theme` tracks the OS
 *  live. */
export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readMode);
  const [theme, setTheme] = useState(() => (readMode() === 'system' ? systemTheme() : readMode()));

  const applyDom = useCallback((t) => {
    const light = t === 'light';
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#f1f4fa' : '#090d15');
  }, []);

  useEffect(() => { applyDom(theme); }, [theme, applyDom]);

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
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
