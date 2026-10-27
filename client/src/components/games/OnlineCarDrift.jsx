import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import {
  CARS, TRACKS, PACES, RACE_LAPS, DRIFT_TIME_LIMIT,
  freshCar, freshAI, stepCar, stepAI, drawScene,
} from './carDriftEngine.js';
import styles from './CarDrift.module.css';

const VIRTUAL_W = 380; const VIRTUAL_H = 260;
const POLL_MS = 3000;

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

/** Drift Racer's "Race a Teammate" time trial — the track and mode (Race or
 *  Drift) are fixed by whoever sent the challenge (see GameLobby.jsx); each
 *  player then picks their own car and pace and runs the course once, on
 *  their own screen at full speed. There's no live sync (this app polls,
 *  it doesn't have a websocket), so this plays exactly like solo CarDrift —
 *  same engine, same drawScene — until a result is submitted, at which
 *  point polling just waits for the opponent's result to land. */
export function OnlineCarDrift({ sessionId, meId, onExit }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState('setup'); // setup | countdown | driving
  const [carId, setCarId] = useState(CARS[0].id);
  const [paceId, setPaceId] = useState('normal');
  const [countdownStage, setCountdownStage] = useState(0);
  const [hud, setHud] = useState({ speed: 0, lap: 0, timeLeft: DRIFT_TIME_LIMIT, driftScore: 0 });

  const canvasRef = useRef(null);
  const boardWrapRef = useRef(null);
  const carRef = useRef(null);
  const aiRef = useRef([]);
  const keysRef = useRef(new Set());
  const colorsRef = useRef(null);
  const runRef = useRef({ startTime: 0, submitted: false });

  const refresh = useCallback(() => {
    apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}`).then(setSession).catch((err) => setError(err.message || 'Could not load this race.'));
  }, [sessionId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

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

  const track = session ? (TRACKS.find((t) => t.id === session.state.track) || TRACKS[0]) : TRACKS[0];
  const mode = session ? (session.state.mode || 'race') : 'race';

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
      if (phase !== 'driving' && colorsRef.current && carRef.current) draw(canvasRef.current.getContext('2d'), carRef.current, performance.now());
    }
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(wrap);
    window.addEventListener('resize', resize);
    return () => { obs.disconnect(); window.removeEventListener('resize', resize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function draw(context, car, now) {
    const c = colorsRef.current;
    const canvas = canvasRef.current;
    if (!c || !canvas) return;
    const carDef = CARS.find((cc) => cc.id === carId) || CARS[0];
    context.setTransform(canvas.width / VIRTUAL_W, 0, 0, canvas.height / VIRTUAL_H, 0, 0);
    drawScene(context, { car, aiList: aiRef.current, track, carDef, colors: c, mode, now, virtualW: VIRTUAL_W, virtualH: VIRTUAL_H });
  }

  function submitResult(result) {
    apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}/submit`, { method: 'POST', body: { result } })
      .then(setSession)
      .catch((err) => setError(err.message || 'Could not submit your result.'));
  }

  function startRace() {
    carRef.current = freshCar(track);
    aiRef.current = mode === 'race' ? [freshAI(track, 0), freshAI(track, 1)] : [];
    runRef.current = { startTime: 0, submitted: false };
    if (canvasRef.current && colorsRef.current) draw(canvasRef.current.getContext('2d'), carRef.current, performance.now());

    setPhase('countdown');
    let stage = 1;
    setCountdownStage(1);
    const tick = () => {
      stage += 1;
      if (stage <= 3) { setCountdownStage(stage); setTimeout(tick, 600); } else {
        setCountdownStage(4);
        setTimeout(() => {
          setCountdownStage(0);
          runRef.current.startTime = performance.now();
          setPhase('driving');
        }, 500);
      }
    };
    setTimeout(tick, 600);
  }

  useEffect(() => {
    if (phase !== 'driving') return undefined;
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
      const carDef = CARS.find((c) => c.id === carId) || CARS[0];
      const pace = PACES.find((p) => p.id === paceId) || PACES[1];

      const input = {
        steer: (held(KEYS.left) ? -1 : 0) + (held(KEYS.right) ? 1 : 0),
        throttle: held(KEYS.throttle),
        brake: held(KEYS.brake),
        handbrake: held(KEYS.handbrake),
      };
      stepCar(car, input, dt, now, carDef, track);
      if (mode === 'race') aiRef.current.forEach((ai) => stepAI(ai, track, dt, pace.aiSpeed));

      const elapsed = (now - runRef.current.startTime) / 1000;
      if (!runRef.current.submitted) {
        if (mode === 'race' && car.lap >= RACE_LAPS) {
          runRef.current.submitted = true;
          submitResult({ car: carId, time: elapsed, laps: car.lap });
        } else if (mode === 'drift' && elapsed >= DRIFT_TIME_LIMIT) {
          runRef.current.submitted = true;
          submitResult({ car: carId, driftScore: Math.round(car.driftScore) });
        }
      }

      draw(ctx, car, now);

      hudTimer += dt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        setHud({
          speed: Math.round(Math.abs(car.vf) * 0.5),
          lap: car.lap,
          timeLeft: Math.max(0, DRIFT_TIME_LIMIT - elapsed),
          driftScore: Math.round(car.driftScore),
        });
      }

      if (!runRef.current.submitted) raf = requestAnimationFrame(step);
    }

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, carId, paceId, mode, track]);

  if (error) {
    return (
      <div className={styles.wrap}>
        <p>{error}</p>
        <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
      </div>
    );
  }
  if (!session) return <p>Loading…</p>;

  const isPlayer1 = session.player1_id === meId;
  const myResultKey = isPlayer1 ? 'player1' : 'player2';
  const opponentId = isPlayer1 ? session.player2_id : session.player1_id;
  const results = session.state.results || {};
  const myResult = results[meId];

  if (session.status === 'finished') {
    const mine = results[meId] || {};
    const theirs = results[opponentId] || {};
    const isDraw = session.winner === 'draw';
    const iWon = session.winner === myResultKey;
    const statLabel = mode === 'drift' ? 'Drift score' : 'Time';
    const fmt = (r) => (mode === 'drift' ? (r.driftScore ?? '—') : (r.time != null ? `${r.time.toFixed(1)}s` : '—'));
    const carName = (id) => (CARS.find((c) => c.id === id) || {}).name || '—';
    return (
      <div className={styles.wrap}>
        <div className={styles.vsCard}>
          <h3 className={styles.resultTitle}>{isDraw ? "It's a tie!" : iWon ? 'You won!' : 'You lost.'}</h3>
          <p className={styles.menuHint}>{track.name} · {mode === 'drift' ? 'Drift' : 'Race'} mode · {statLabel}</p>
          <div className={styles.vsRow}>
            <span className={styles.vsName}>You · {carName(mine.car)}</span>
            <strong>{fmt(mine)}</strong>
          </div>
          <div className={styles.vsRow}>
            <span className={styles.vsName}>Opponent · {carName(theirs.car)}</span>
            <strong>{fmt(theirs)}</strong>
          </div>
          <button type="button" className="btn btn-primary" onClick={onExit}>Back to lobby</button>
        </div>
      </div>
    );
  }

  if (myResult) {
    return (
      <div className={styles.wrap}>
        <div className={styles.vsCard}>
          <h3 className={styles.resultTitle}>Result submitted</h3>
          <p>Waiting for your opponent to finish their run…</p>
          <p className={styles.menuHint}>{track.name} · {mode === 'drift' ? 'Drift' : 'Race'} mode</p>
          <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div className={styles.wrap}>
        <div className={styles.menuScroll} style={{ margin: 0 }}>
          <p className={styles.menuHint}>
            {track.name} · {mode === 'drift' ? `Drift Mode (${DRIFT_TIME_LIMIT}s)` : `Race Mode (${RACE_LAPS} laps)`}
          </p>
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
          <button type="button" className="btn btn-primary" onClick={startRace}>Start</button>
          <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.hud}>
        <span>Speed <strong>{hud.speed}</strong></span>
        {mode === 'race' ? (
          <span>Lap <strong>{hud.lap}/{RACE_LAPS}</strong></span>
        ) : (
          <>
            <span>Time left <strong>{Math.ceil(hud.timeLeft)}s</strong></span>
            <span>Drift <strong>{hud.driftScore}</strong></span>
          </>
        )}
      </div>
      <div className={styles.boardWrap} ref={boardWrapRef}>
        <canvas ref={canvasRef} className={styles.canvas} />
        {phase === 'countdown' && (
          <div className={styles.lightsWrap}>
            <div className={styles.lights}>
              <span className={`${styles.light} ${countdownStage >= 1 ? styles.lightRed : ''}`} />
              <span className={`${styles.light} ${countdownStage >= 2 ? styles.lightRed : ''}`} />
              <span className={`${styles.light} ${countdownStage >= 3 ? styles.lightRed : ''}`} />
            </div>
            {countdownStage >= 4 && <div className={styles.goText}>GO!</div>}
          </div>
        )}
      </div>
    </div>
  );
}
