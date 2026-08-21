import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const THEME_KEY = 'infostride-theme';

function safeGet(k) { try { return window.localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } }

function readTheme() {
  const t = safeGet(THEME_KEY);
  if (t === 'light' || t === 'dark') return t;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
}

const ThemeContext = createContext(null);

/** Same localStorage key and data-theme attribute the HTML pages use, so
 *  a theme choice made here carries over to any not-yet-ported page and
 *  back, via the same 'storage' cross-tab event. */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readTheme);

  const applyDom = useCallback((t) => {
    const light = t === 'light';
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#f1f4fa' : '#090d15');
  }, []);

  useEffect(() => { applyDom(theme); }, [theme, applyDom]);

  useEffect(() => {
    function onStorage(e) {
      if (e.key === THEME_KEY && e.newValue) setThemeState(e.newValue);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      safeSet(THEME_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
