import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import {
  BOARD, MAX_DRAG,
  currentSeat, stepCarromPhysics, isCarromSettled,
  resolveCarromShot, launchStriker,
} from './Carrom.jsx';
import styles from './Carrom.module.css';

const POLL_MS = 2500;
const OWNER_LABEL = { player1: 'You', player2: 'Opponent' };

// Mirrors Carrom.jsx's own board-drawing code — kept here rather than
// exported from Carrom.jsx since the online view also needs to grey out
// interaction while waiting on the opponent, which the solo view never
// does. (Physical board rendering, not game rules, so duplicating this
// small canvas routine is simpler than threading extra flags through the
// shared engine file.)
const COIN_FILL = { light: '#f4ead8', dark: '#2b2420', queen: '#d64550', striker: '#3b82f6' };
const MARGIN = 26;
function drawBoard(ctx, state, aim, dim) {
  ctx.clearRect(0, 0, BOARD, BOARD);
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(0, 0, BOARD, BOARD);
  ctx.fillStyle = '#c9985f';
  ctx.fillRect(MARGIN - 6, MARGIN - 6, BOARD - (MARGIN - 6) * 2, BOARD - (MARGIN - 6) * 2);
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(MARGIN, MARGIN, BOARD - MARGIN * 2, BOARD - MARGIN * 2);
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
    const s = state.entities.find((e) => e.id === 'striker');
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + (s.x - aim.x) * 1.4, s.y + (s.y - aim.y) * 1.4);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (dim) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, 0, BOARD, BOARD);
  }
}

/** Carrom against another member — same engine as the vs-computer version
 *  (Carrom.jsx), one 1-on-1 shot at a time. Your own shot's physics plays
 *  out locally in real time; your opponent only ever sees the settled
 *  result once you submit it, the same as any other turn-based online game
 *  here only syncing the "after" state rather than the live motion. */
export function OnlineCarrom({ sessionId, meId, onExit }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const gameRef = useRef(null);
  const dragRef = useRef(null);
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);

  useEffect(() => {
    function refresh() {
      apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}`)
        .then((s) => {
          setSession(s);
          // Never clobber a shot that's still animating locally — the next
          // poll after it settles will just reconfirm what we already have.
          if (!gameRef.current || gameRef.current.phase !== 'moving') gameRef.current = s.state;
        })
        .catch((err) => setError(err.message || 'Could not load this game.'));
    }
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [sessionId]);

  const isPlayer1 = session && session.player1_id === meId;
  const myOwner = isPlayer1 ? 'player1' : 'player2';
  const mySeat = isPlayer1 ? 'bottom' : 'top';
  const myTurn = Boolean(session) && session.status === 'active' && session.turn === meId;

  function toVirtual(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = rect.width / BOARD;
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  }

  function onPointerDown(e) {
    if (!myTurn || !gameRef.current || gameRef.current.phase !== 'aim' || currentSeat(gameRef.current) !== mySeat) return;
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
    if (d < 6) return;
    const power = d / MAX_DRAG;
    const angle = Math.atan2(dy, dx);
    const MAX_SPEED = 0.95;
    gameRef.current = launchStriker(g, Math.cos(angle) * MAX_SPEED * power, Math.sin(angle) * MAX_SPEED * power);
  }

  function submitResult(finished) {
    const opponentId = isPlayer1 ? session.player2_id : session.player1_id;
    const body = finished.winner
      ? { state: finished, status: 'finished', winner: finished.winner }
      : { state: finished, turn: opponentId };
    apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}`, { method: 'PATCH', body })
      .then(setSession)
      .catch((err) => alert(err.message || 'Could not submit that shot.'));
  }

  useEffect(() => {
    if (!session) return undefined;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
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

      if (g && g.phase === 'moving') {
        g = stepCarromPhysics(g, dt);
        if (isCarromSettled(g)) {
          g = resolveCarromShot(g);
          submitResult(g);
        }
        gameRef.current = g;
      }

      if (g) drawBoard(ctx, g, dragRef.current, !myTurn);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => { ro.disconnect(); cancelAnimationFrame(rafRef.current); lastTsRef.current = 0; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session && session.id, myTurn]);

  if (error) {
    return (
      <div className={styles.wrap}>
        <p className={styles.status}>{error}</p>
        <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
      </div>
    );
  }
  if (!session || !gameRef.current) return <p className={styles.status}>Loading…</p>;

  const g = gameRef.current;
  const statusText = session.status === 'finished'
    ? (session.winner === 'draw' ? 'Draw.' : session.winner === myOwner ? 'You win!' : 'You lose.')
    : myTurn ? 'Your turn — pull back from the striker and release.' : "Waiting for your opponent's shot…";

  return (
    <div className={styles.wrap}>
      <div className={styles.scoreboard}>
        {g.owners.map((o) => (
          <div key={o} className={`${styles.scoreCard} ${g.colors[o] === 'light' ? styles.scoreLight : styles.scoreDark}`}>
            <span className={styles.scoreOwner}>{o === myOwner ? 'You' : OWNER_LABEL[o] || o}</span>
            <span className={styles.scoreNum}>{g.scores[o]}</span>
          </div>
        ))}
      </div>
      <p className={styles.status}>{statusText}</p>
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
      </div>
      <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
    </div>
  );
}
