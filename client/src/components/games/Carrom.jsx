import { useEffect, useRef, useState } from 'react';
import styles from './Carrom.module.css';

/* ============================== Engine ==================================
 * Pure-function physics/rules engine, independent of React — Carrom (this
 * file, vs-computer + local pass-and-play 2v2) and OnlineCarrom.jsx (member
 * vs member) both drive the same engine, the same way Chess.jsx's exported
 * functions are shared by OnlineChess.jsx. A "shot" is the unit of turn-
 * sync for the online game: the shooter's striker drag + release plays out
 * as a real-time physics simulation locally, and only the settled result
 * (coin positions, scores, whose turn is next) is what gets synced — the
 * opponent never watches the live flick, only the before/after, same as
 * they'd only see a chess move land rather than the hand that made it. */

export const BOARD = 440;
const MARGIN = 26;
const POCKET_R = 22;
const COIN_R = 11;
const STRIKER_R = 14;
const RING_R = 46;
const CX = BOARD / 2;
const CY = BOARD / 2;
const FRICTION_K = 0.0026; // velocity *= (1 - FRICTION_K * dtMs) per step
const STOP_EPS = 0.012;
const REST_WALL = 0.72;
const REST_ENT = 0.86;
const MAX_SPEED = 0.95;
export const MAX_DRAG = 95; // virtual units; a full pull-back = max power
const SHOT_CAP = 80;

const POCKETS = [
  [MARGIN, MARGIN], [BOARD - MARGIN, MARGIN],
  [MARGIN, BOARD - MARGIN], [BOARD - MARGIN, BOARD - MARGIN],
];

const SEAT_BASELINE = {
  bottom: { x: CX, y: BOARD - MARGIN - 20 },
  top: { x: CX, y: MARGIN + 20 },
  right: { x: BOARD - MARGIN - 20, y: CY },
  left: { x: MARGIN + 20, y: CY },
};
const SEAT_AIM_TOWARD = { bottom: { x: CX, y: CY }, top: { x: CX, y: CY }, right: { x: CX, y: CY }, left: { x: CX, y: CY } };

function createEntities() {
  const entities = [{ id: 'striker', x: SEAT_BASELINE.bottom.x, y: SEAT_BASELINE.bottom.y, vx: 0, vy: 0, r: STRIKER_R, color: 'striker', pocketed: false }];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    entities.push({
      id: `c${i}`,
      x: CX + RING_R * Math.cos(angle),
      y: CY + RING_R * Math.sin(angle),
      vx: 0, vy: 0, r: COIN_R,
      color: i % 2 === 0 ? 'light' : 'dark',
      pocketed: false,
    });
  }
  entities.push({ id: 'queen', x: CX, y: CY, vx: 0, vy: 0, r: COIN_R, color: 'queen', pocketed: false });
  return entities;
}

/** `mode`: 'solo' (you vs computer, or online member vs member — always
 *  seats bottom/top, owners player1/player2) or 'teams' (local-only 2v2,
 *  four seats around the board, owners A/B, partners sit opposite). */
export function createCarromState(mode) {
  const seats = mode === 'teams' ? ['bottom', 'right', 'top', 'left'] : ['bottom', 'top'];
  const owners = mode === 'teams' ? ['A', 'B'] : ['player1', 'player2'];
  const seatOwner = mode === 'teams'
    ? { bottom: 'A', right: 'B', top: 'A', left: 'B' }
    : { bottom: 'player1', top: 'player2' };
  return {
    mode, seats, owners, seatOwner,
    colors: { [owners[0]]: 'light', [owners[1]]: 'dark' },
    turnIdx: 0,
    scores: { [owners[0]]: 0, [owners[1]]: 0 },
    entities: createEntities(),
    phase: 'aim', // 'aim' | 'moving' | 'over'
    winner: null,
    shotsTaken: 0,
    shotSnapshotPocketed: [],
    message: null,
  };
}

export function currentSeat(state) { return state.seats[state.turnIdx]; }
export function currentOwner(state) { return state.seatOwner[currentSeat(state)]; }
function striker(state) { return state.entities.find((e) => e.id === 'striker'); }
export function coinsOf(state) { return state.entities.filter((e) => e.color !== 'striker'); }

/** Pulls the striker back to the current shooter's baseline — called at
 *  the start of each new aim phase (including after a foul reset). */
function repositionStriker(entities, seat) {
  const pos = SEAT_BASELINE[seat];
  return entities.map((e) => (e.id === 'striker' ? { ...e, x: pos.x, y: pos.y, vx: 0, vy: 0, pocketed: false } : e));
}

export function launchStriker(state, vx, vy) {
  return {
    ...state,
    entities: state.entities.map((e) => (e.id === 'striker' ? { ...e, vx, vy } : e)),
    phase: 'moving',
    shotSnapshotPocketed: coinsOf(state).filter((c) => c.pocketed).map((c) => c.id),
    message: null,
  };
}

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

export function stepCarromPhysics(state, dtMs) {
  let entities = state.entities.map((e) => ({ ...e }));

  // 1) Pocket capture (checked before wall bounce, so a corner pocket wins
  //    over a wall collision at the same spot).
  for (const e of entities) {
    if (e.pocketed) continue;
    for (const [px, py] of POCKETS) {
      if (dist(e.x, e.y, px, py) < POCKET_R) { e.pocketed = true; e.vx = 0; e.vy = 0; e.x = -100; e.y = -100; break; }
    }
  }

  // 2) Integrate motion + wall bounce for anything still on the board.
  for (const e of entities) {
    if (e.pocketed) continue;
    e.x += e.vx * dtMs;
    e.y += e.vy * dtMs;
    if (e.x < MARGIN + e.r) { e.x = MARGIN + e.r; e.vx = -e.vx * REST_WALL; }
    if (e.x > BOARD - MARGIN - e.r) { e.x = BOARD - MARGIN - e.r; e.vx = -e.vx * REST_WALL; }
    if (e.y < MARGIN + e.r) { e.y = MARGIN + e.r; e.vy = -e.vy * REST_WALL; }
    if (e.y > BOARD - MARGIN - e.r) { e.y = BOARD - MARGIN - e.r; e.vy = -e.vy * REST_WALL; }
  }

  // 3) Pairwise elastic collisions (equal mass, simple restitution) among
  //    everything still active — O(n^2) over ~10 entities, trivial cost.
  const active = entities.filter((e) => !e.pocketed);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]; const b = active[j];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const minD = a.r + b.r;
      if (d > 0 && d < minD) {
        const nx = dx / d; const ny = dy / d;
        const overlap = (minD - d) / 2;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
        const rvx = b.vx - a.vx; const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal < 0) {
          const impulse = -(1 + REST_ENT) * velAlongNormal / 2;
          a.vx -= impulse * nx; a.vy -= impulse * ny;
          b.vx += impulse * nx; b.vy += impulse * ny;
        }
      }
    }
  }

  // 4) Friction + settle.
  const frictionFactor = Math.max(0, 1 - FRICTION_K * dtMs);
  for (const e of entities) {
    if (e.pocketed) continue;
    e.vx *= frictionFactor; e.vy *= frictionFactor;
    if (Math.hypot(e.vx, e.vy) < STOP_EPS) { e.vx = 0; e.vy = 0; }
  }

  return { ...state, entities };
}

export function isCarromSettled(state) {
  return state.entities.every((e) => e.pocketed || (e.vx === 0 && e.vy === 0));
}

/** Call once per shot, exactly when isCarromSettled() first becomes true.
 *  Tallies what got pocketed since launchStriker(), applies scoring/foul/
 *  extra-turn rules, advances (or keeps) the turn, and checks for a win. */
export function resolveCarromShot(state) {
  const shooterSeat = currentSeat(state);
  const shooterOwner = state.seatOwner[shooterSeat];
  const shooterColor = state.colors[shooterOwner];

  const coins = coinsOf(state);
  const newlyPocketed = coins.filter((c) => c.pocketed && !state.shotSnapshotPocketed.includes(c.id));
  const strikerFoul = striker(state).pocketed;

  const ownPotted = newlyPocketed.filter((c) => c.color === shooterColor);
  const oppPotted = newlyPocketed.filter((c) => c.color !== shooterColor && c.color !== 'queen');
  const queenPotted = newlyPocketed.some((c) => c.color === 'queen');

  let delta = ownPotted.length + (queenPotted ? 3 : 0);
  if (strikerFoul) delta -= 1;
  const scores = { ...state.scores, [shooterOwner]: Math.max(0, state.scores[shooterOwner] + delta) };

  const remainingOwn = coins.filter((c) => c.color === shooterColor && !c.pocketed).length;

  const messages = [];
  if (strikerFoul) messages.push('Foul — striker pocketed (-1).');
  if (ownPotted.length) messages.push(`Potted ${ownPotted.length} of your own coin${ownPotted.length === 1 ? '' : 's'}.`);
  if (queenPotted) messages.push('Queen pocketed! (+3)');
  if (oppPotted.length) messages.push("Potted the opponent's coin — no bonus.");
  if (!newlyPocketed.length && !strikerFoul) messages.push('No coin pocketed.');

  let winner = null;
  if (remainingOwn === 0) winner = shooterOwner;

  const extraTurn = !strikerFoul && (ownPotted.length > 0 || queenPotted);
  let turnIdx = state.turnIdx;
  let shotsTaken = state.shotsTaken + 1;
  if (!winner && !extraTurn) turnIdx = (state.turnIdx + 1) % state.seats.length;

  if (!winner && shotsTaken >= SHOT_CAP) {
    if (scores[state.owners[0]] === scores[state.owners[1]]) winner = 'draw';
    else winner = scores[state.owners[0]] > scores[state.owners[1]] ? state.owners[0] : state.owners[1];
    messages.push('Shot limit reached.');
  }

  const nextSeat = state.seats[turnIdx];
  const entities = repositionStriker(state.entities, nextSeat);

  return {
    ...state,
    entities,
    scores,
    turnIdx,
    shotsTaken,
    phase: winner ? 'over' : 'aim',
    winner,
    message: messages.join(' '),
  };
}

/** A workmanlike, not expert, computer shot: aims roughly at its nearest
 *  own-color coin (or the queen if none remain) with real inaccuracy. */
export function pickComputerShot(state, seat) {
  const owner = state.seatOwner[seat];
  const color = state.colors[owner];
  const from = striker(state);
  const coins = coinsOf(state).filter((c) => !c.pocketed);
  let targets = coins.filter((c) => c.color === color);
  if (!targets.length) targets = coins.filter((c) => c.color === 'queen');
  if (!targets.length) targets = coins;
  if (!targets.length) return { vx: 0, vy: 0 };

  targets.sort((a, b) => dist(from.x, from.y, a.x, a.y) - dist(from.x, from.y, b.x, b.y));
  const target = targets[Math.random() < 0.75 ? 0 : Math.min(1, targets.length - 1)];

  let angle = Math.atan2(target.y - from.y, target.x - from.x);
  angle += (Math.random() - 0.5) * 0.3; // inaccuracy
  const power = 0.55 + Math.random() * 0.4;
  return { vx: Math.cos(angle) * MAX_SPEED * power, vy: Math.sin(angle) * MAX_SPEED * power };
}

/* ============================== View ===================================== */

const COIN_FILL = { light: '#f4ead8', dark: '#2b2420', queen: '#d64550', striker: '#3b82f6' };
const OWNER_LABEL = { player1: 'You', player2: 'Computer', A: 'Team A', B: 'Team B' };
const SEAT_LABEL = { bottom: 'Bottom', top: 'Top', right: 'Right', left: 'Left' };

function drawBoard(ctx, state, aim) {
  ctx.clearRect(0, 0, BOARD, BOARD);

  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(0, 0, BOARD, BOARD);
  ctx.fillStyle = '#c9985f';
  ctx.fillRect(MARGIN - 6, MARGIN - 6, BOARD - (MARGIN - 6) * 2, BOARD - (MARGIN - 6) * 2);

  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(MARGIN, MARGIN, BOARD - MARGIN * 2, BOARD - MARGIN * 2);
  ctx.beginPath();
  ctx.arc(CX, CY, RING_R + COIN_R + 6, 0, Math.PI * 2);
  ctx.stroke();

  for (const [px, py] of POCKETS) {
    ctx.beginPath();
    ctx.arc(px, py, POCKET_R, 0, Math.PI * 2);
    ctx.fillStyle = '#15110d';
    ctx.fill();
  }

  for (const seat of Object.keys(SEAT_BASELINE)) {
    const b = SEAT_BASELINE[seat];
    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (seat === 'bottom' || seat === 'top') { ctx.moveTo(CX - 50, b.y); ctx.lineTo(CX + 50, b.y); }
    else { ctx.moveTo(b.x, CY - 50); ctx.lineTo(b.x, CY + 50); }
    ctx.stroke();
  }

  for (const e of state.entities) {
    if (e.pocketed) continue;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fillStyle = COIN_FILL[e.color];
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = e.color === 'light' ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.3)';
    ctx.stroke();
  }

  if (aim && aim.dragging) {
    const s = striker(state);
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + (s.x - aim.x) * 1.4, s.y + (s.y - aim.y) * 1.4);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Carrom — solo vs the computer, or local pass-and-play 2 vs 2. Drag back
 *  from the striker and release to flick it (power from how far you pull,
 *  direction from the angle), aiming to pot your own color into a corner
 *  pocket while avoiding sinking the striker itself. */
export function Carrom() {
  const [screen, setScreen] = useState('menu'); // 'menu' | 'playing'
  const [mode, setMode] = useState('solo');
  const [ui, setUi] = useState(null);
  const gameRef = useRef(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);

  function start(nextMode) {
    const state = createCarromState(nextMode);
    gameRef.current = state;
    setMode(nextMode);
    setUi(state);
    setScreen('playing');
  }

  function toVirtual(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = rect.width / BOARD;
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  }

  function isHumanTurn() {
    const g = gameRef.current;
    if (!g || g.phase !== 'aim') return false;
    if (g.mode === 'teams') return true; // local pass-and-play — always a human
    return currentSeat(g) === 'bottom'; // vs-computer: only "you" (bottom) drag
  }

  function onPointerDown(e) {
    if (!isHumanTurn()) return;
    canvasRef.current.setPointerCapture(e.pointerId);
    dragRef.current = { dragging: true, ...toVirtual(e) };
  }
  function onPointerMove(e) {
    if (!dragRef.current || !dragRef.current.dragging) return;
    dragRef.current = { ...dragRef.current, ...toVirtual(e) };
  }
  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !drag.dragging) return;
    const g = gameRef.current;
    const s = g.entities.find((ent) => ent.id === 'striker');
    const dx = s.x - drag.x; const dy = s.y - drag.y;
    const d = Math.min(MAX_DRAG, Math.hypot(dx, dy));
    if (d < 6) return; // too small to count as a shot
    const power = d / MAX_DRAG;
    const angle = Math.atan2(dy, dx);
    gameRef.current = launchStriker(g, Math.cos(angle) * MAX_SPEED * power, Math.sin(angle) * MAX_SPEED * power);
  }

  // Canvas pixel size follows its container; drawing always happens in the
  // fixed BOARD x BOARD virtual space via a scale transform, same pattern
  // this app's other canvas games use for crisp, responsive rendering.
  useEffect(() => {
    if (screen !== 'playing') return undefined;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext('2d');

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const size = wrap.clientWidth;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctx.setTransform((dpr * size) / BOARD, 0, 0, (dpr * size) / BOARD, 0, 0);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    function frame(ts) {
      const dt = Math.min(32, ts - (lastTsRef.current || ts));
      lastTsRef.current = ts;
      let g = gameRef.current;

      if (g.phase === 'moving') {
        g = stepCarromPhysics(g, dt);
        if (isCarromSettled(g)) {
          g = resolveCarromShot(g);
          setUi(g);
        }
        gameRef.current = g;
      } else if (g.phase === 'aim' && g.mode === 'solo' && currentSeat(g) === 'top') {
        const shot = pickComputerShot(g, 'top');
        gameRef.current = launchStriker(g, shot.vx, shot.vy);
      }

      drawBoard(ctx, gameRef.current, dragRef.current);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      lastTsRef.current = 0;
    };
  }, [screen]);

  if (screen === 'menu') {
    return (
      <div className={styles.wrap}>
        <p className={styles.status}>Pull back from the striker and release to flick it.</p>
        <div className={styles.menuGrid}>
          <button type="button" className="btn btn-primary" onClick={() => start('solo')}>vs Computer</button>
          <button type="button" className="btn" onClick={() => start('teams')}>2 vs 2 (pass &amp; play)</button>
        </div>
      </div>
    );
  }

  const g = ui || gameRef.current;
  const owners = g.owners;
  const seat = currentSeat(g);
  const turnLabel = g.mode === 'teams' ? `${OWNER_LABEL[g.seatOwner[seat]]} — ${SEAT_LABEL[seat]}` : OWNER_LABEL[g.seatOwner[seat]];

  return (
    <div className={styles.wrap}>
      <div className={styles.scoreboard}>
        {owners.map((o) => (
          <div key={o} className={`${styles.scoreCard} ${g.colors[o] === 'light' ? styles.scoreLight : styles.scoreDark}`}>
            <span className={styles.scoreOwner}>{OWNER_LABEL[o] || o}</span>
            <span className={styles.scoreNum}>{g.scores[o]}</span>
          </div>
        ))}
      </div>

      <p className={styles.status}>
        {g.phase === 'over' ? (g.winner === 'draw' ? "It's a draw." : `${OWNER_LABEL[g.winner] || g.winner} wins!`) : `${turnLabel}'s turn to shoot`}
      </p>
      {g.message && <p className={styles.message}>{g.message}</p>}

      <div className={styles.boardWrap} ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {g.phase === 'over' && (
          <div className={styles.overlay}>
            <h4>{g.winner === 'draw' ? "It's a draw" : `${OWNER_LABEL[g.winner] || g.winner} wins!`}</h4>
            <button type="button" className="btn btn-primary" onClick={() => start(mode)}>Play again</button>
            <button type="button" className="btn" onClick={() => setScreen('menu')}>Change mode</button>
          </div>
        )}
      </div>

      <button type="button" className="btn" onClick={() => setScreen('menu')}>Change mode</button>
    </div>
  );
}
