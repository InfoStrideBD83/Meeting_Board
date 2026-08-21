import { useEffect, useMemo, useRef, useState, createRef } from 'react';
import { Link } from 'react-router-dom';
import { AppSwitcher } from '../components/AppSwitcher.jsx';
import styles from './UsTimerPage.module.css';
import logoLight from '../../assets/logo-light.png';
import logoDark from '../../assets/logo-dark-cropped.png';

const FEATURE = { label: 'IST', city: 'New Delhi', tz: 'Asia/Kolkata' };
const ROW = [
  { label: 'EST', city: 'New York', tz: 'America/New_York' },
  { label: 'CST', city: 'Chicago', tz: 'America/Chicago' },
  { label: 'PST', city: 'Los Angeles', tz: 'America/Los_Angeles' },
  { label: 'MST', city: 'Denver', tz: 'America/Denver' },
];

const MINUS = '−';

function offsetMinutes(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  const hour = +p.hour === 24 ? 0 : +p.hour;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

function partsFor(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  const h = +p.hour === 24 ? 0 : +p.hour;
  return { h, m: +p.minute, s: +p.second, weekday: p.weekday, day: p.day, month: p.month };
}

function utcText(min) {
  const sign = min < 0 ? MINUS : '+';
  const a = Math.abs(min), hh = Math.floor(a / 60), mm = a % 60;
  return 'UTC' + sign + hh + (mm ? ':' + String(mm).padStart(2, '0') : '');
}

const pad = (n) => String(n).padStart(2, '0');
const to12 = (h) => (h % 12) === 0 ? 12 : (h % 12);
const ampm = (h) => h < 12 ? 'AM' : 'PM';
const isDay = (h) => h >= 6 && h < 18;

function DigitalTime({ h, m, s, className }) {
  return (
    <div className={`${styles.tTime} ${className}`}>
      {pad(to12(h))}:{pad(m)}<span className="sec">:{pad(s)}</span><span className="ap">{ampm(h)}</span>
    </div>
  );
}

// Trapezoidal-tooth cog outline centred at 50,50.
function gearPath(teeth, rOut, rIn) {
  const step = (Math.PI * 2) / teeth;
  const tw = step * 0.28;
  const gw = step * 0.30;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const pt = (ang, r) => `${(50 + r * Math.cos(ang)).toFixed(2)} ${(50 + r * Math.sin(ang)).toFixed(2)}`;
    d += (i === 0 ? 'M' : 'L') + pt(a - tw, rOut)
      + ' L' + pt(a + tw, rOut)
      + ' L' + pt(a + step / 2 - gw, rIn)
      + ' L' + pt(a + step / 2 + gw, rIn);
  }
  return d + ' Z';
}
const GEAR_D = gearPath(10, 6.3, 4.4);

const TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * 30 * Math.PI) / 180;
  const outer = 45, inner = (i % 3 === 0) ? 37 : 41;
  return {
    x1: (50 + outer * Math.sin(a)).toFixed(1), y1: (50 - outer * Math.cos(a)).toFixed(1),
    x2: (50 + inner * Math.sin(a)).toFixed(1), y2: (50 - inner * Math.cos(a)).toFixed(1),
    w: (i % 3 === 0) ? 2 : 1,
  };
});

function AnalogClock({ hourRef, minRef, secGroupRef }) {
  return (
    <svg viewBox="0 0 100 100" className={styles.clockSvg} aria-hidden="true">
      <circle cx="50" cy="50" r="46" className={styles.clFace} />
      <g>
        {TICKS.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={t.w} className={styles.tick} />
        ))}
      </g>
      <line ref={hourRef} x1="50" y1="50" x2="50" y2="30" className={styles.clH} strokeLinecap="round" />
      <line ref={minRef} x1="50" y1="50" x2="50" y2="21" className={styles.clM} strokeLinecap="round" />
      <g ref={secGroupRef}>
        <path d={GEAR_D} className={styles.clGear} />
        <circle cx="50" cy="50" r="2.5" className={styles.clGearHole} />
        <line x1="50" y1="61" x2="50" y2="14" className={styles.clS} strokeLinecap="round" />
        <circle cx="50" cy="61" r="1.9" className={styles.clSTail} />
      </g>
      <circle cx="50" cy="50" r="1.7" className={styles.clCap} />
    </svg>
  );
}

function setHourMin(refs, h, m, s) {
  const hA = (((h % 12) + m / 60 + s / 3600) / 12) * 360;
  const mA = ((m + s / 60) / 60) * 360;
  if (refs.hourRef.current) refs.hourRef.current.setAttribute('transform', `rotate(${hA.toFixed(2)} 50 50)`);
  if (refs.minRef.current) refs.minRef.current.setAttribute('transform', `rotate(${mA.toFixed(2)} 50 50)`);
}
function setSeconds(refs, angle) {
  if (refs.secGroupRef.current) refs.secGroupRef.current.setAttribute('transform', `rotate(${angle.toFixed(2)} 50 50)`);
}

export function UsTimerPage() {
  const featRefs = useRef({ hourRef: createRef(), minRef: createRef(), secGroupRef: createRef() }).current;
  const cardRefsList = useMemo(
    () => ROW.map(() => ({ hourRef: createRef(), minRef: createRef(), secGroupRef: createRef() })),
    []
  );

  const [now, setNow] = useState(() => new Date());
  const stageRef = useRef(null);
  const headerRef = useRef(null);

  // Smooth per-frame seconds sweep (direct DOM writes — a 60fps rotation
  // isn't a React state concern) + once-per-second state update for the
  // digital readouts, mirroring the original's two update cadences.
  useEffect(() => {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = null;
    let intervalId = null;

    function setAllSeconds(angle) {
      setSeconds(featRefs, angle);
      cardRefsList.forEach((r) => setSeconds(r, angle));
    }

    if (reduceMotion) {
      function step() {
        const d = new Date();
        setAllSeconds((d.getSeconds() / 60) * 360);
        setNow(d);
      }
      step();
      intervalId = setInterval(step, 1000);
    } else {
      let lastSec = -1;
      function loop() {
        const d = new Date();
        const sFloat = d.getSeconds() + d.getMilliseconds() / 1000;
        setAllSeconds((sFloat / 60) * 360);
        if (d.getSeconds() !== lastSec) {
          lastSec = d.getSeconds();
          setNow(d);
        }
        rafId = requestAnimationFrame(loop);
      }
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const F = partsFor(now, FEATURE.tz);
  useEffect(() => { setHourMin(featRefs, F.h, F.m, F.s); });
  const featIsNight = !isDay(F.h);

  const cardsData = ROW.map((z, i) => {
    const P = partsFor(now, z.tz);
    return { z, P, refs: cardRefsList[i] };
  });
  useEffect(() => {
    cardsData.forEach(({ P, refs }) => setHourMin(refs, P.h, P.m, P.s));
  });

  // Fit the whole board to the screen, no scrolling.
  useEffect(() => {
    const MIN_SCALE = 0.5;
    function fitStage() {
      const stageEl = stageRef.current;
      const headerEl = headerRef.current;
      if (!stageEl) return;
      stageEl.style.transform = 'none';
      const headerH = headerEl ? headerEl.offsetHeight : 0;
      const footerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--footer-h')) || 0;
      const available = window.innerHeight - headerH - footerH;
      const natural = stageEl.offsetHeight;
      if (natural <= 0) return;
      const scale = Math.max(MIN_SCALE, Math.min(1, available / natural));
      stageEl.style.transform = scale < 1 ? `scale(${scale})` : 'none';
    }
    window.addEventListener('resize', fitStage);
    window.addEventListener('orientationchange', fitStage);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStage);
    fitStage();
    return () => {
      window.removeEventListener('resize', fitStage);
      window.removeEventListener('orientationchange', fitStage);
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.bg3d} aria-hidden="true">
        {[
          { x: '-30px', y: '80px', fdur: '13s', delay: '0s', size: '90px', dur: '50s', op: '.09', teal: false },
          { x: 'calc(100% - 110px)', y: '40px', fdur: '16s', delay: '-4s', size: '130px', dur: '65s', op: '.07', teal: true },
          { x: '20px', y: 'calc(100% - 140px)', fdur: '10s', delay: '-2s', size: '70px', dur: '40s', op: '.1', teal: false },
          { x: 'calc(100% - 90px)', y: 'calc(100% - 160px)', fdur: '14s', delay: '-6s', size: '100px', dur: '55s', op: '.08', teal: true },
          { x: 'calc(50% - 110px)', y: 'calc(50% - 110px)', fdur: '20s', delay: '-8s', size: '220px', dur: '90s', op: '.04', teal: false, hideSm: true },
        ].map((c, i) => (
          <div
            key={i}
            className={`${styles.bg3dFloat} ${c.hideSm ? styles.hideSm : ''}`}
            style={{ '--x': c.x, '--y': c.y, '--fdur': c.fdur, '--delay': c.delay }}
          >
            <div className={`${styles.bg3dCube} ${c.teal ? styles.hueTeal : ''}`} style={{ '--size': c.size, '--dur': c.dur, '--op': c.op }}>
              <div className={`${styles.bg3dFace} ${styles.fFront}`} />
              <div className={`${styles.bg3dFace} ${styles.fBack}`} />
              <div className={`${styles.bg3dFace} ${styles.fRight}`} />
              <div className={`${styles.bg3dFace} ${styles.fLeft}`} />
              <div className={`${styles.bg3dFace} ${styles.fTop}`} />
              <div className={`${styles.bg3dFace} ${styles.fBottom}`} />
            </div>
          </div>
        ))}
      </div>

      <header className={styles.appHeader} ref={headerRef}>
        <div className={styles.headerFx} aria-hidden="true">
          <span className={styles.fxAurora} />
          <span className={styles.fxGrid} />
          <span className={styles.fxBeam} />
          <span className={styles.fxLine} />
        </div>
        <div className={styles.headerInner}>
          <Link className="home-btn" to="/" title="Home" aria-label="Go to Home">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/></svg>
          </Link>
          <div className={styles.brand}>
            <img className={`${styles.brandLogo} onLight`} src={logoLight} alt="InfoStride" width="2560" height="349" />
            <img className={`${styles.brandLogo} onDark`} src={logoDark} alt="InfoStride" width="853" height="120" />
          </div>
          <div className={styles.headerSpacer} />
          <AppSwitcher />
        </div>
      </header>

      <div className={styles.stage} ref={stageRef}>
        <section className={`${styles.feature} ${featIsNight ? styles.isNight : ''}`}>
          <div className={styles.eyebrow}>India Standard Time</div>
          <div className={styles.featureClock}>
            <AnalogClock hourRef={featRefs.hourRef} minRef={featRefs.minRef} secGroupRef={featRefs.secGroupRef} />
          </div>
          <DigitalTime h={F.h} m={F.m} s={F.s} className={styles.featureTime} />
          <div className={styles.featureCity}>New Delhi</div>
          <div className={styles.featureMeta}>
            <span className={styles.badge}>IST</span>
            <span className={styles.dotsep}>&middot;</span>
            <span>{utcText(offsetMinutes(now, FEATURE.tz))}</span>
            <span className={styles.dotsep}>&middot;</span>
            <span>{F.weekday} {F.day} {F.month}</span>
          </div>
        </section>

        <section className={styles.grid}>
          {cardsData.map(({ z, P }, i) => {
            const sameDay = P.day === F.day && P.month === F.month;
            return (
              <div className={`${styles.card} ${!isDay(P.h) ? styles.isNight : ''}`} key={z.label}>
                <div className={styles.cardClock}>
                  <AnalogClock hourRef={cardRefsList[i].hourRef} minRef={cardRefsList[i].minRef} secGroupRef={cardRefsList[i].secGroupRef} />
                </div>
                <DigitalTime h={P.h} m={P.m} s={P.s} className={styles.cardTime} />
                <div><span className={styles.badge}>{z.label}</span></div>
                <div className={styles.cardCity}>{z.city}</div>
                <div className={styles.cardSub}>
                  {P.weekday} {P.day} {P.month} &middot; {utcText(offsetMinutes(now, z.tz))}
                  {!sameDay && <span className="next"> &middot; {MINUS}1d</span>}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
