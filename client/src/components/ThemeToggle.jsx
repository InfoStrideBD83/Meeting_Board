import { useTheme } from '../context/ThemeContext.jsx';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const light = theme === 'light';

  return (
    <button
      className="theme-toggle"
      type="button"
      role="switch"
      aria-checked={light}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      title="Toggle light / dark mode"
      onClick={toggleTheme}
    >
      <span className="theme-toggle-icons">
        <span className="tt-sun">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2M12 20.5v2M3.5 12h-2M22.5 12h-2M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4L17 17M7 7L5.6 5.6"/></svg>
        </span>
        <span className="tt-moon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        </span>
      </span>
    </button>
  );
}
