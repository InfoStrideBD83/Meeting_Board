import { useTheme } from '../context/ThemeContext.jsx';
import styles from './GtaThemeFX.module.css';

// Two plain geometric pictograms (circle head, rounded-rect torso and
// legs) — deliberately abstract, like a restroom-sign icon, not a drawing
// of any specific person. This is intentional: GTA 6's actual characters,
// artwork and logos are Rockstar/Take-Two's copyrighted IP, so this only
// evokes "a crime-drama duo" as a generic silhouette, never an imitation
// of a particular likeness.
function Figure({ flip }) {
  return (
    <svg viewBox="0 0 24 48" className={styles.figure} style={flip ? { transform: 'scaleX(-1)' } : undefined} aria-hidden="true">
      <circle cx="12" cy="7" r="6" fill="currentColor" />
      <rect x="5" y="15" width="14" height="20" rx="4" fill="currentColor" />
      <rect x="3" y="33" width="7" height="15" rx="2" fill="currentColor" />
      <rect x="14" y="33" width="7" height="15" rx="2" fill="currentColor" />
    </svg>
  );
}

function PalmTree({ className }) {
  return (
    <svg viewBox="0 0 100 140" className={className} aria-hidden="true">
      <path d="M50 140 L50 70" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M50 75 C 30 60, 10 55, 5 40" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M50 75 C 70 60, 90 55, 95 40" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M50 75 C 45 55, 40 40, 30 25" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M50 75 C 55 55, 60 40, 70 25" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M50 75 C 50 55, 50 40, 50 20" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Purely decorative, time-boxed sunset/silhouette dressing for the
 *  temporary GTA-inspired theme (see ThemeContext.jsx) — mounted once at
 *  the app root (App.jsx) so it shows on every page while the window is
 *  open, and renders nothing at all once effectiveTheme stops being 'gta'
 *  (no cleanup needed; it just stops rendering). Fixed, aria-hidden and
 *  pointer-events:none throughout, same convention as the existing
 *  .header-fx/.ambientGlyph decorative layers elsewhere in this app. */
export function GtaThemeFX() {
  const { effectiveTheme } = useTheme();
  if (effectiveTheme !== 'gta') return null;

  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.sun} />
      <PalmTree className={styles.palmLeft} />
      <PalmTree className={styles.palmRight} />
      <div className={styles.duo}>
        <Figure />
        <Figure flip />
      </div>
    </div>
  );
}
