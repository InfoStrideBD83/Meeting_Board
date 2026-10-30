import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Avatar } from '../Avatar.jsx';
import {
  CARS, TRACKS, PACES, RACE_LAPS, DRIFT_TIME_LIMIT,
  freshCar, freshAI, stepCar, stepAI, stepPenalties, netScore, drawScene, ordinal,
} from './carDriftEngine.js';
import carStyles from './CarDrift.module.css';
import styles from './RaceLobby.module.css';

const VIRTUAL_W = 380; const VIRTUAL_H = 260;
const POLL_MS = 3000;
const PLAYER_COUNTS = [2, 3, 4];

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

/** "Race Online" — a lobby of 2–4 real members racing the same track/mode.
 *  There's no shared real-time physics here (this app polls, it has no
 *  websocket), so each participant races independently at full speed on
 *  their own screen — identical to solo CarDrift, reusing the exact same
 *  engine — and everyone's results land on one ranked scorecard once
 *  everyone's finished. "Hitting another player's car" isn't literal
 *  (there's no shared car state to hit); the points system instead
 *  penalizes wall contact and clipping the Race Mode AI cars during your
 *  own run, via carDriftEngine's stepPenalties/netScore. */
export function RaceLobby({ onExit }) {
  const { member } = useAuth();
  const [lobbies, setLobbies] = useState([]);
  // Set directly from whatever API response produced/touched it (create,
  // join, start, submit), not derived from the polled `lobbies` browse list
  // — that list only refreshes every POLL_MS and may not contain a lobby
  // this tab itself only just created/joined, which would otherwise make
  // the view fall through to the browse screen for a tick after joining.
  const [myLobby, setMyLobby] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [createTrack, setCreateTrack] = useState(TRACKS[0].id);
  const [createMode, setCreateMode] = useState('race');
  const [createMax, setCreateMax] = useState(4);

  const [phase, setPhase] = useState('setup'); // setup | countdown | driving
  const [carId, setCarId] = useState(CARS[0].id);
  const [paceId, setPaceId] = useState('normal');
  const [countdownStage, setCountdownStage] = useState(0);
  const [penaltyFlash, setPenaltyFlash] = useState(null);
  const [hud, setHud] = useState({ speed: 0, lap: 0, timeLeft: DRIFT_TIME_LIMIT, driftScore: 0, netScore: 1000 });

  const canvasRef = useRef(null);
  const boardWrapRef = useRef(null);
  const carRef = useRef(null);
  const aiRef = useRef([]);
  const keysRef = useRef(new Set());
  const colorsRef = useRef(null);
  const runRef = useRef({ startTime: 0, submitted: false });

  const refreshLobbies = useCallback(() => {
    apiFetch('/race-lobbies').then(setLobbies).catch(() => { /* transient — next poll retries */ });
  }, []);

  useEffect(() => { apiFetch('/members').then(setMembers).catch(() => {}); }, []);

  // The browse list only matters while not already in a lobby.
  useEffect(() => {
    if (myLobby) return undefined;
    refreshLobbies();
    const id = setInterval(refreshLobbies, POLL_MS);
    return () => clearInterval(id);
  }, [myLobby, refreshLobbies]);

  // Once in a lobby, poll that lobby directly by id instead — covers the
  // waiting room filling up, the host starting the race, and teammates'
  // results landing on the scorecard.
  useEffect(() => {
    if (!myLobby || myLobby.status === 'finished') return undefined;
    const id = setInterval(() => {
      apiFetch(`/race-lobbies/${encodeURIComponent(myLobby.id)}`).then(setMyLobby).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLobby && myLobby.id, myLobby && myLobby.status]);

  function nameOf(id) { const m = members.find((x) => x.id === id); return m ? m.name : 'Unknown'; }
  function carNameOf(id) { return (CARS.find((c) => c.id === id) || {}).name || '—'; }

  function createLobby() {
    setBusy(true);
    apiFetch('/race-lobbies', { method: 'POST', body: { track: createTrack, mode: createMode, max_players: createMax } })
      .then(setMyLobby)
      .catch((err) => setError(err.message || 'Could not create a lobby.'))
      .finally(() => setBusy(false));
  }

  function joinLobby(id) {
    setBusy(true);
    apiFetch(`/race-lobbies/${encodeURIComponent(id)}/join`, { method: 'POST' })
      .then(setMyLobby)
      .catch((err) => setError(err.message || 'Could not join this lobby.'))
      .finally(() => setBusy(false));
  }

  function leaveLobby() {
    if (!myLobby) return;
    apiFetch(`/race-lobbies/${encodeURIComponent(myLobby.id)}/leave`, { method: 'POST' })
      .then(() => { setMyLobby(null); refreshLobbies(); })
      .catch((err) => setError(err.message || 'Could not leave this lobby.'));
  }

  function startRace() {
    if (!myLobby) return;
    apiFetch(`/race-lobbies/${encodeURIComponent(myLobby.id)}/start`, { method: 'POST' })
      .then(setMyLobby)
      .catch((err) => setError(err.message || 'Could not start the race.'));
  }

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

  const racing = myLobby && myLobby.status === 'active';
  const track = myLobby ? (TRACKS.find((t) => t.id === myLobby.track) || TRACKS[0]) : TRACKS[0];
  const mode = myLobby ? myLobby.mode : 'race';
  const myResult = myLobby ? (myLobby.results || {})[member.id] : null;

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
  }, [phase, racing]);

  function draw(context, car, now) {
    const c = colorsRef.current;
    const canvas = canvasRef.current;
    if (!c || !canvas) return;
    const carDef = CARS.find((cc) => cc.id === carId) || CARS[0];
    context.setTransform(canvas.width / VIRTUAL_W, 0, 0, canvas.height / VIRTUAL_H, 0, 0);
    drawScene(context, { car, aiList: aiRef.current, track, carDef, colors: c, mode, now, virtualW: VIRTUAL_W, virtualH: VIRTUAL_H });
  }

  function submitResult(result) {
    apiFetch(`/race-lobbies/${encodeURIComponent(myLobby.id)}/submit`, { method: 'POST', body: { result } })
      .then(setMyLobby)
      .catch((err) => setError(err.message || 'Could not submit your result.'));
  }

  function startDriving() {
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
    if (phase !== 'driving' || !racing) return undefined;
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

      const penaltyEvents = stepPenalties(car, aiRef.current, track, dt);
      if (penaltyEvents.length) setPenaltyFlash({ ...penaltyEvents[0], key: now });

      const elapsed = (now - runRef.current.startTime) / 1000;
      if (!runRef.current.submitted) {
        if (mode === 'race' && car.lap >= RACE_LAPS) {
          runRef.current.submitted = true;
          submitResult({ car: carId, time: elapsed, laps: car.lap, netScore: netScore(car) });
        } else if (mode === 'drift' && elapsed >= DRIFT_TIME_LIMIT) {
          runRef.current.submitted = true;
          submitResult({ car: carId, driftScore: Math.round(car.driftScore), netScore: netScore(car) });
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
          netScore: netScore(car),
        });
      }

      if (!runRef.current.submitted) raf = requestAnimationFrame(step);
    }

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, racing, carId, paceId, mode, track]);

  useEffect(() => {
    if (!penaltyFlash) return undefined;
    const t = setTimeout(() => setPenaltyFlash(null), 900);
    return () => clearTimeout(t);
  }, [penaltyFlash]);

  function backToBrowse() {
    setMyLobby(null);
    setPhase('setup');
    refreshLobbies();
  }

  if (error) {
    return (
      <div className={carStyles.wrap}>
        <p>{error}</p>
        <button type="button" className="btn" onClick={() => setError(null)}>Dismiss</button>
      </div>
    );
  }

  // ── Scorecard ──────────────────────────────────────────────────
  if (myLobby && myLobby.status === 'finished') {
    const results = myLobby.results || {};
    const ranked = myLobby.participants
      .map((p) => ({ id: p.member_id, result: results[p.member_id] }))
      .sort((a, b) => (
        myLobby.mode === 'drift'
          ? (b.result?.netScore || 0) - (a.result?.netScore || 0)
          : (a.result?.time ?? Infinity) - (b.result?.time ?? Infinity)
      ));
    return (
      <div className={carStyles.wrap}>
        <div className={styles.scoreCard}>
          <h3 className={carStyles.resultTitle}>Results — {track.name} · {mode === 'drift' ? 'Drift' : 'Race'} Mode</h3>
          <table className={styles.scoreTable}>
            <thead>
              <tr>
                <th>#</th><th>Player</th><th>Car</th>
                <th>{mode === 'drift' ? 'Drift score' : 'Time'}</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.id} className={r.id === member.id ? styles.meRow : ''}>
                  <td>{ordinal(i + 1)}</td>
                  <td>{nameOf(r.id)}{r.id === member.id ? ' (you)' : ''}</td>
                  <td>{carNameOf(r.result?.car)}</td>
                  <td>{mode === 'drift' ? (r.result?.driftScore ?? '—') : (r.result?.time != null ? `${r.result.time.toFixed(1)}s` : '—')}</td>
                  <td>{r.result?.netScore ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={carStyles.resultBtns}>
            <button type="button" className="btn btn-primary" onClick={backToBrowse}>Back to lobbies</button>
            <button type="button" className="btn" onClick={onExit}>Exit</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Waiting for other results ─────────────────────────────────
  if (myLobby && myLobby.status === 'active' && myResult) {
    return (
      <div className={carStyles.wrap}>
        <div className={carStyles.vsCard}>
          <h3 className={carStyles.resultTitle}>Result submitted</h3>
          <p>Waiting for the rest of the lobby to finish their run…</p>
          <p className={carStyles.menuHint}>{track.name} · {mode === 'drift' ? 'Drift' : 'Race'} Mode</p>
        </div>
      </div>
    );
  }

  // ── Setup / countdown / driving (lobby active, I haven't raced yet) ──
  if (racing && !myResult) {
    if (phase === 'setup') {
      return (
        <div className={carStyles.wrap}>
          <div className={carStyles.menuScroll} style={{ margin: 0 }}>
            <p className={carStyles.menuHint}>
              {track.name} · {mode === 'drift' ? `Drift Mode (${DRIFT_TIME_LIMIT}s)` : `Race Mode (${RACE_LAPS} laps)`}
            </p>
            <div className={carStyles.pickerSection}>
              <div className={carStyles.pickerLabel}>Car</div>
              <div className={carStyles.carGrid}>
                {CARS.map((c) => (
                  <button
                    key={c.id} type="button"
                    className={`${carStyles.carOption} ${carId === c.id ? carStyles.optionActive : ''}`}
                    onClick={() => setCarId(c.id)}
                    aria-pressed={carId === c.id}
                  >
                    <span className={carStyles.carSwatch} style={{ background: `linear-gradient(135deg, ${c.colors.car}, ${c.colors.carDark})` }} />
                    <span className={carStyles.optionTitle}>{c.name}</span>
                    <span className={carStyles.optionSub}>{c.sub}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={carStyles.pickerSection}>
              <div className={carStyles.pickerLabel}>Pace</div>
              <div className={carStyles.paceRow} role="group" aria-label="Pace">
                {PACES.map((p) => (
                  <button
                    key={p.id} type="button"
                    className={`${carStyles.paceBtn} ${paceId === p.id ? carStyles.optionActive : ''}`}
                    onClick={() => setPaceId(p.id)}
                    aria-pressed={paceId === p.id}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={startDriving}>Start</button>
          </div>
        </div>
      );
    }

    return (
      <div className={carStyles.wrap}>
        <div className={carStyles.hud}>
          <span>Speed <strong>{hud.speed}</strong></span>
          {mode === 'race' ? (
            <span>Lap <strong>{hud.lap}/{RACE_LAPS}</strong></span>
          ) : (
            <>
              <span>Time left <strong>{Math.ceil(hud.timeLeft)}s</strong></span>
              <span>Drift <strong>{hud.driftScore}</strong></span>
            </>
          )}
          <span>Points <strong>{hud.netScore}</strong></span>
        </div>
        <div className={carStyles.boardWrap} ref={boardWrapRef}>
          <canvas ref={canvasRef} className={carStyles.canvas} />
          {penaltyFlash && (
            <div key={penaltyFlash.key} className={carStyles.penaltyFlash}>
              −{penaltyFlash.points} {penaltyFlash.type === 'wall' ? 'Wall contact!' : 'Collision!'}
            </div>
          )}
          {phase === 'countdown' && (
            <div className={carStyles.lightsWrap}>
              <div className={carStyles.lights}>
                <span className={`${carStyles.light} ${countdownStage >= 1 ? carStyles.lightRed : ''}`} />
                <span className={`${carStyles.light} ${countdownStage >= 2 ? carStyles.lightRed : ''}`} />
                <span className={`${carStyles.light} ${countdownStage >= 3 ? carStyles.lightRed : ''}`} />
              </div>
              {countdownStage >= 4 && <div className={carStyles.goText}>GO!</div>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Waiting room (lobby open, I'm already in it) ────────────────
  if (myLobby && myLobby.status === 'open') {
    const isHost = myLobby.host_id === member.id;
    return (
      <div className={carStyles.wrap}>
        <div className={styles.waitRoom}>
          <h3 className={carStyles.resultTitle}>{track.name} · {mode === 'drift' ? 'Drift' : 'Race'} Mode</h3>
          <p className={carStyles.menuHint}>{myLobby.participants.length}/{myLobby.max_players} players</p>
          <div className={styles.playerList}>
            {myLobby.participants.map((p) => (
              <div key={p.member_id} className={styles.playerRow}>
                <Avatar name={nameOf(p.member_id)} size={28} />
                <span>{nameOf(p.member_id)}{p.member_id === myLobby.host_id ? ' · Host' : ''}</span>
              </div>
            ))}
          </div>
          <div className={carStyles.resultBtns}>
            {isHost ? (
              <button type="button" className="btn btn-primary" disabled={myLobby.participants.length < 2} onClick={startRace}>
                Start race
              </button>
            ) : (
              <p className={carStyles.menuHint}>Waiting for the host to start…</p>
            )}
            <button type="button" className="btn" onClick={leaveLobby}>Leave</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Browse / create ──────────────────────────────────────────────
  const open = lobbies.filter((l) => l.status === 'open');
  return (
    <div className={carStyles.wrap}>
      <div className={styles.browse}>
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Create a lobby</div>
          <div className={carStyles.pickerSection}>
            <div className={carStyles.pickerLabel}>Track</div>
            <div className={carStyles.trackGrid}>
              {TRACKS.map((t) => (
                <button
                  key={t.id} type="button"
                  className={`${carStyles.trackOption} ${createTrack === t.id ? carStyles.optionActive : ''}`}
                  onClick={() => setCreateTrack(t.id)}
                  aria-pressed={createTrack === t.id}
                >
                  <svg className={carStyles.trackThumb} viewBox="-190 -130 380 260" aria-hidden="true">
                    <path d={`${t.previewPath} ${t.previewInnerPath}`} fillRule="evenodd" fill="var(--panel-3)" stroke="var(--border-strong)" strokeWidth="2" />
                  </svg>
                  <span className={carStyles.optionTitle}>{t.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.rowGroup} role="group" aria-label="Mode">
              <button type="button" className={styles.pillBtn} aria-pressed={createMode === 'race'} onClick={() => setCreateMode('race')}>Race</button>
              <button type="button" className={styles.pillBtn} aria-pressed={createMode === 'drift'} onClick={() => setCreateMode('drift')}>Drift</button>
            </div>
            <div className={styles.rowGroup} role="group" aria-label="Players">
              {PLAYER_COUNTS.map((n) => (
                <button key={n} type="button" className={styles.pillBtn} aria-pressed={createMax === n} onClick={() => setCreateMax(n)}>{n}p</button>
              ))}
            </div>
          </div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={createLobby}>Create lobby</button>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>Open lobbies</div>
          {open.length === 0 ? (
            <p className={styles.empty}>No open lobbies — create one above.</p>
          ) : open.map((l) => (
            <div key={l.id} className={styles.lobbyRow}>
              <span>
                {(TRACKS.find((t) => t.id === l.track) || {}).name || l.track} · {l.mode === 'drift' ? 'Drift' : 'Race'} · {nameOf(l.host_id)}'s lobby
              </span>
              <span className={styles.lobbyMeta}>{l.participants.length}/{l.max_players}</span>
              <button type="button" className="btn" disabled={busy || l.participants.length >= l.max_players} onClick={() => joinLobby(l.id)}>Join</button>
            </div>
          ))}
        </div>

        <button type="button" className="btn" onClick={onExit}>Back</button>
      </div>
    </div>
  );
}
