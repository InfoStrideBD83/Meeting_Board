import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CARS, TRACKS, PACES, RACE_LAPS,
  freshCar, freshAI, stepCar, stepAI, stepPenalties, netScore, drawScene, ordinal,
} from './carDriftEngine.js';
import { RaceLobby } from './RaceLobby.jsx';
import styles from './CarDrift.module.css';

const VIRTUAL_W = 380; const VIRTUAL_H = 260;

const KEYS = {
  throttle: ['ArrowUp', 'w', 'W'],
  brake: ['ArrowDown', 's', 'S'],
  left: ['ArrowLeft', 'a', 'A'],
  right: ['ArrowRight', 'd', 'D'],
  handbrake: [' '],
};

function themeToken(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function readBestLap(track) {
  try {
    const v = Number(window.localStorage.getItem(`infostride-drift-best-${track.id}`));
    return v > 0 ? v : null;
  } catch { return null; }
}

function Confetti() {
  return (
    <div className={styles.confetti} aria-hidden="true">
      {Array.from({ length: 26 }, (_, i) => (
        <span
          key={i}
          className={styles.confettiPiece}
          style={{
            left: `${(i * 37) % 100}%`,
            animationDelay: `${(i % 7) * 0.09}s`,
            background: i % 3 === 0 ? 'var(--accent)' : i % 3 === 1 ? 'var(--warn)' : 'var(--success)',
          }}
        />
      ))}
    </div>
  );
}

/** A top-down drift/race arcade. Drift Mode is solo (free drive, chase your
 *  best lap and drift score, like Snake); Race Mode is 3 laps against two
 *  computer racers. 4 cars (different top speed/accel/grip), 3 tracks (Oval,
 *  Figure-8, Serpentine) and 3 paces are all picked on the menu screen before
 *  a run; see carDriftEngine.js for the shared physics/track/rendering code
 *  (also used by RaceLobby.jsx for "Race Online" against teammates).
 *  The canvas is drawn in a fixed virtual coordinate space and scaled to
 *  whatever size its container actually is (see the resize effect), so full
 *  screen (via GamesWidget's toggle) genuinely gives it more room instead of
 *  just more empty panel around a small, fixed canvas. */
export function CarDrift() {
  const canvasRef = useRef(null);
  const boardWrapRef = useRef(null);
  const carRef = useRef(freshCar(TRACKS[0]));
  const aiRef = useRef([]);
  const keysRef = useRef(new Set());
  const colorsRef = useRef(null);
  const raceRef = useRef({ finished: false, startTime: 0 });
  const raceConfigRef = useRef({ car: CARS[0], track: TRACKS[0], pace: PACES[1] });

  const [view, setView] = useState('solo'); // 'solo' | 'online'
  const [status, setStatus] = useState('menu'); // menu | countdown | driving | finished
  const [mode, setMode] = useState(null); // 'drift' | 'race'
  const [carId, setCarId] = useState(CARS[0].id);
  const [trackId, setTrackId] = useState(TRACKS[0].id);
  const [paceId, setPaceId] = useState('normal');
  const [countdownStage, setCountdownStage] = useState(0); // 0 = none, 1-3 = red lights, 4 = GO
  const [lapFlash, setLapFlash] = useState(null);
  const [penaltyFlash, setPenaltyFlash] = useState(null);
  const [raceResult, setRaceResult] = useState(null);
  const [hud, setHud] = useState({ speed: 0, lap: 0, lapTime: 0, bestLap: null, driftScore: 0, driftCombo: 0, place: null, netScore: 1000 });
  const [bestLapStored, setBestLapStored] = useState(() => readBestLap(TRACKS[0]));

  function readColors() {
    colorsRef.current = {
      grass: themeToken('--panel-2', '#1a2130'),
      grassDark: themeToken('--panel', '#131924'),
      track: themeToken('--panel-3', '#222b3c'),
      edge: themeToken('--border-strong', '#33405a'),
      line: themeToken('--border-soft', '#1e2532'),
      ai1: themeToken('--danger', '#fb7185'),
      ai2: themeToken('--warn', '#fbbf24'),
      mark: themeToken('--text', '#e9edf6'),
      finish: themeToken('--warn', '#fbbf24'),
      brake: themeToken('--danger', '#fb7185'),
      tree: themeToken('--success', '#34d399'),
      treeDark: themeToken('--border-strong', '#33405a'),
    };
  }

  useEffect(() => {
    readColors();
    const obs = new MutationObserver(readColors);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    function down(e) {
      if ([...KEYS.throttle, ...KEYS.brake, ...KEYS.left, ...KEYS.right, ...KEYS.handbrake].includes(e.key)) e.preventDefault();
      keysRef.current.add(e.key);
    }
    function up(e) { keysRef.current.delete(e.key); }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Responsive canvas: the game logic always works in the fixed VIRTUAL_W x
  // VIRTUAL_H space above; only the drawing transform (set just before
  // drawScene below) changes with the container's real size, so going full
  // screen (or just a wider browser window) actually uses the extra room
  // instead of leaving a small, fixed-size canvas floating in empty space.
  useLayoutEffect(() => {
    const wrap = boardWrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;
    function resize() {
      const rect = wrap.getBoundingClientRect();
      const aspect = VIRTUAL_W / VIRTUAL_H;
      let dispW = rect.width || VIRTUAL_W;
      let dispH = dispW / aspect;
      if (rect.height > 0 && dispH > rect.height) { dispH = rect.height; dispW = dispH * aspect; }
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${dispW}px`;
      canvas.style.height = `${dispH}px`;
      canvas.width = Math.max(1, Math.round(dispW * dpr));
      canvas.height = Math.max(1, Math.round(dispH * dpr));
      if (status !== 'driving' && colorsRef.current) draw(canvasRef.current.getContext('2d'), carRef.current, performance.now());
    }
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(wrap);
    window.addEventListener('resize', resize);
    return () => { obs.disconnect(); window.removeEventListener('resize', resize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function chooseMode(m) {
    const car = CARS.find((c) => c.id === carId) || CARS[0];
    const track = TRACKS.find((t) => t.id === trackId) || TRACKS[0];
    const pace = PACES.find((p) => p.id === paceId) || PACES[1];
    raceConfigRef.current = { car, track, pace };
    setBestLapStored(readBestLap(track));

    setMode(m);
    carRef.current = freshCar(track);
    aiRef.current = m === 'race' ? [freshAI(track, 0), freshAI(track, 1)] : [];
    raceRef.current = { finished: false, startTime: 0 };
    setRaceResult(null);
    if (canvasRef.current && colorsRef.current) draw(canvasRef.current.getContext('2d'), carRef.current, performance.now());

    setStatus('countdown');
    let stage = 1;
    setCountdownStage(1);
    const tick = () => {
      stage += 1;
      if (stage <= 3) { setCountdownStage(stage); setTimeout(tick, 600); } else {
        setCountdownStage(4);
        setTimeout(() => {
          setCountdownStage(0);
          carRef.current.lapStart = performance.now();
          raceRef.current.startTime = performance.now();
          setStatus('driving');
        }, 500);
      }
    };
    setTimeout(tick, 600);
  }

  function backToMenu() {
    setStatus('menu');
    setMode(null);
    setRaceResult(null);
  }

  useEffect(() => {
    if (!lapFlash) return undefined;
    const t = setTimeout(() => setLapFlash(null), 1100);
    return () => clearTimeout(t);
  }, [lapFlash]);

  useEffect(() => {
    if (!penaltyFlash) return undefined;
    const t = setTimeout(() => setPenaltyFlash(null), 900);
    return () => clearTimeout(t);
  }, [penaltyFlash]);

  useEffect(() => {
    if (status !== 'driving') return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const keys = keysRef.current;
    let raf;
    let last = performance.now();
    let hudTimer = 0;

    function held(list) { return list.some((k) => keys.has(k)); }

    function step(now) {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      const car = carRef.current;
      const { car: carDef, track, pace } = raceConfigRef.current;

      const input = {
        steer: (held(KEYS.left) ? -1 : 0) + (held(KEYS.right) ? 1 : 0),
        throttle: held(KEYS.throttle),
        brake: held(KEYS.brake),
        handbrake: held(KEYS.handbrake),
      };
      const { justLapped } = stepCar(car, input, dt, now, carDef, track);

      if (mode === 'race') {
        aiRef.current.forEach((ai) => stepAI(ai, track, dt, pace.aiSpeed));
      }

      const penaltyEvents = stepPenalties(car, aiRef.current, track, dt);
      if (penaltyEvents.length) {
        const ev = penaltyEvents[0];
        setPenaltyFlash({ type: ev.type, points: ev.points, key: now });
      }

      if (justLapped) {
        const lapTime = (now - car.lapStart) / 1000;
        car.lapStart = now;
        let isBest = false;
        if (car.bestLap == null || lapTime < car.bestLap) {
          car.bestLap = lapTime;
          isBest = true;
          setBestLapStored((prev) => {
            if (prev == null || lapTime < prev) {
              try { window.localStorage.setItem(`infostride-drift-best-${track.id}`, String(lapTime)); } catch { /* ignore */ }
              return lapTime;
            }
            return prev;
          });
        }
        setLapFlash({ lap: car.lap, best: isBest, key: now });
      }

      if (mode === 'race' && !raceRef.current.finished && car.lap >= RACE_LAPS) {
        raceRef.current.finished = true;
        const results = [
          { name: 'You', progress: car.totalProgress, mine: true },
          ...aiRef.current.map((ai, i) => ({ name: `CPU ${i + 1}`, progress: ai.totalProgress, mine: false })),
        ].sort((a, b) => b.progress - a.progress);
        const place = results.findIndex((r) => r.mine) + 1;
        setRaceResult({ place, total: results.length, time: (now - raceRef.current.startTime) / 1000, netScore: netScore(car) });
        setStatus('finished');
      }

      draw(ctx, car, now);

      hudTimer += dt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        let place = null;
        if (mode === 'race') {
          const order = [car.totalProgress, ...aiRef.current.map((a) => a.totalProgress)].sort((a, b) => b - a);
          place = order.indexOf(car.totalProgress) + 1;
        }
        setHud({
          speed: Math.round(Math.abs(car.vf) * 0.5),
          lap: car.lap,
          lapTime: (now - car.lapStart) / 1000,
          bestLap: car.bestLap,
          driftScore: Math.round(car.driftScore),
          driftCombo: Math.min(1, car.driftCombo / 220),
          place,
          netScore: netScore(car),
        });
      }

      raf = requestAnimationFrame(step);
    }

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [status, mode]);

  function draw(context, car, now) {
    const c = colorsRef.current;
    const canvas = canvasRef.current;
    const cfg = raceConfigRef.current;
    if (!c || !canvas || !cfg) return;
    context.setTransform(canvas.width / VIRTUAL_W, 0, 0, canvas.height / VIRTUAL_H, 0, 0);
    drawScene(context, {
      car, aiList: aiRef.current, track: cfg.track, carDef: cfg.car, colors: c,
      mode, now, virtualW: VIRTUAL_W, virtualH: VIRTUAL_H,
    });
  }

  if (view === 'online') return <RaceLobby onExit={() => setView('solo')} />;

  return (
    <div className={styles.wrap}>
      {status !== 'menu' && (
        <>
          <div className={styles.hud}>
            <span>Speed <strong>{hud.speed}</strong></span>
            <span>Lap <strong>{mode === 'race' ? `${hud.lap}/${RACE_LAPS}` : hud.lap}</strong></span>
            <span>Time <strong>{hud.lapTime.toFixed(1)}s</strong></span>
            <span>Best <strong>{bestLapStored ? `${bestLapStored.toFixed(1)}s` : '—'}</strong></span>
            {mode === 'race' ? (
              <span>Position <strong>{hud.place ? `${hud.place}/3` : '—'}</strong></span>
            ) : (
              <span>Drift <strong>{hud.driftScore}</strong></span>
            )}
            <span>Points <strong>{hud.netScore}</strong></span>
          </div>
          {mode === 'drift' && (
            <div className={styles.driftMeterTrack}>
              <div className={styles.driftMeterFill} style={{ width: `${hud.driftCombo * 100}%` }} />
            </div>
          )}
        </>
      )}

      <div className={styles.boardWrap} ref={boardWrapRef}>
        <canvas ref={canvasRef} className={styles.canvas} />

        {lapFlash && (
          <div key={lapFlash.key} className={`${styles.lapFlash} ${lapFlash.best ? styles.lapFlashBest : ''}`}>
            Lap {lapFlash.lap}{lapFlash.best ? ' — Best!' : ''}
          </div>
        )}

        {penaltyFlash && (
          <div key={penaltyFlash.key} className={styles.penaltyFlash}>
            −{penaltyFlash.points} {penaltyFlash.type === 'wall' ? 'Wall contact!' : 'Collision!'}
          </div>
        )}

        {status === 'countdown' && (
          <div className={styles.lightsWrap}>
            <div className={styles.lights}>
              <span className={`${styles.light} ${countdownStage >= 1 ? styles.lightRed : ''}`} />
              <span className={`${styles.light} ${countdownStage >= 2 ? styles.lightRed : ''}`} />
              <span className={`${styles.light} ${countdownStage >= 3 ? styles.lightRed : ''}`} />
            </div>
            {countdownStage >= 4 && <div className={styles.goText}>GO!</div>}
          </div>
        )}

        {status === 'finished' && raceResult && (
          <div className={styles.overlay}>
            <h3 className={styles.resultTitle}>
              {raceResult.place === 1 ? 'You won!' : `You finished ${ordinal(raceResult.place)}`}
            </h3>
            <p>Race time: {raceResult.time.toFixed(1)}s</p>
            <p>Points (clean driving): <strong>{raceResult.netScore}</strong></p>
            <div className={styles.resultBtns}>
              <button type="button" className="btn btn-primary" onClick={() => chooseMode('race')}>Race again</button>
              <button type="button" className="btn" onClick={backToMenu}>Menu</button>
            </div>
            {raceResult.place === 1 && <Confetti />}
          </div>
        )}

        {status === 'menu' && (
          <div className={styles.overlay}>
            <div className={styles.menuScroll}>
              <p className={styles.menuHint}>Arrows/WASD to drive · Space to handbrake-drift</p>

              <div className={styles.pickerSection}>
                <div className={styles.pickerLabel}>Car</div>
                <div className={styles.carGrid}>
                  {CARS.map((c) => (
                    <button
                      key={c.id} type="button"
                      className={`${styles.carOption} ${carId === c.id ? styles.optionActive : ''}`}
                      onClick={() => setCarId(c.id)}
                      aria-pressed={carId === c.id}
                    >
                      <span className={styles.carSwatch} style={{ background: `linear-gradient(135deg, ${c.colors.car}, ${c.colors.carDark})` }} />
                      <span className={styles.optionTitle}>{c.name}</span>
                      <span className={styles.optionSub}>{c.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.pickerSection}>
                <div className={styles.pickerLabel}>Track</div>
                <div className={styles.trackGrid}>
                  {TRACKS.map((t) => (
                    <button
                      key={t.id} type="button"
                      className={`${styles.trackOption} ${trackId === t.id ? styles.optionActive : ''}`}
                      onClick={() => setTrackId(t.id)}
                      aria-pressed={trackId === t.id}
                    >
                      <svg className={styles.trackThumb} viewBox="-190 -130 380 260" aria-hidden="true">
                        <path d={`${t.previewPath} ${t.previewInnerPath}`} fillRule="evenodd" fill="var(--panel-3)" stroke="var(--border-strong)" strokeWidth="2" />
                      </svg>
                      <span className={styles.optionTitle}>{t.name}</span>
                      <span className={styles.optionSub}>{t.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.pickerSection}>
                <div className={styles.pickerLabel}>Pace</div>
                <div className={styles.paceRow} role="group" aria-label="Pace">
                  {PACES.map((p) => (
                    <button
                      key={p.id} type="button"
                      className={`${styles.paceBtn} ${paceId === p.id ? styles.optionActive : ''}`}
                      onClick={() => setPaceId(p.id)}
                      aria-pressed={paceId === p.id}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.modeRow}>
                <button type="button" className={`btn btn-primary ${styles.modeBtn}`} onClick={() => chooseMode('drift')}>
                  <span className={styles.modeBtnTitle}>Drift Mode</span>
                  <span className={styles.modeBtnSub}>Freestyle — chase your best lap &amp; drift score</span>
                </button>
                <button type="button" className={`btn btn-primary ${styles.modeBtn}`} onClick={() => chooseMode('race')}>
                  <span className={styles.modeBtnTitle}>Race Mode</span>
                  <span className={styles.modeBtnSub}>3 laps vs 2 computer racers</span>
                </button>
                <button type="button" className={`btn ${styles.modeBtn}`} onClick={() => setView('online')}>
                  <span className={styles.modeBtnTitle}>Race Online</span>
                  <span className={styles.modeBtnSub}>2–4 members, each races the same track, ranked scorecard at the end</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
