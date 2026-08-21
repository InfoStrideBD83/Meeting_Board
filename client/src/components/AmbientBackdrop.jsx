import styles from './AmbientBackdrop.module.css';

/** The faint dot-field + slow meridian rings + drifting glyphs backdrop
 *  used on Login/Signup/Master, extracted here so Meeting Board and
 *  Assignee (which had no ambient decoration at all) can reuse it instead
 *  of a 4th/5th copy-paste. Purely decorative — respects
 *  prefers-reduced-motion via the CSS module. */
export function AmbientBackdrop() {
  return (
    <div className={styles.ambient} aria-hidden="true">
      <div className={styles.ambientDots} />
      <div className={styles.ambientRings}>
        <svg viewBox="0 0 400 400">
          <g fill="none" stroke="var(--accent)" strokeOpacity=".16">
            <circle className={styles.ringSpin} cx="200" cy="200" r="196" strokeDasharray="2 12" />
            <circle className={styles.ringSpinR} cx="200" cy="200" r="152" strokeDasharray="1 9" strokeOpacity=".13" />
            <circle cx="200" cy="200" r="112" strokeOpacity=".09" />
          </g>
          <g className={styles.ringSpinR} fill="none" stroke="var(--accent)" strokeOpacity=".10">
            <ellipse cx="200" cy="200" rx="52" ry="152" />
            <ellipse cx="200" cy="200" rx="106" ry="152" />
            <line x1="48" y1="200" x2="352" y2="200" />
          </g>
        </svg>
      </div>
      <span className={`${styles.ambientGlyph} ${styles.g1}`}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 2 L13 12 L3 22 L9 22 L19 12 L9 2 Z"/></svg></span>
      <span className={`${styles.ambientGlyph} ${styles.g2}`}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 2 L13 12 L3 22 L9 22 L19 12 L9 2 Z"/></svg></span>
      <span className={`${styles.ambientGlyph} ${styles.g3}`}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 2 L13 12 L3 22 L9 22 L19 12 L9 2 Z"/></svg></span>
    </div>
  );
}
