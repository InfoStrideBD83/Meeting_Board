import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './Snake.module.css';

export const COLS = 18;
export const ROWS = 16;
export const CELL = 18;
export const DIFFICULTIES = { easy: { label: 'Easy', ms: 160 }, medium: { label: 'Medium', ms: 100 }, hard: { label: 'Hard', ms: 45 } };

function randomCell(exclude) {
  let cell;
  do {
    cell = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (exclude.some((c) => c.x === cell.x && c.y === cell.y));
  return cell;
}

function themeToken(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** The actual game: board, keyboard controls, tick loop, rendering, score —
 *  shared by solo play (Snake, below) and the online race (OnlineSnake.jsx),
 *  the same way Chess.jsx's engine is shared with OnlineChess.jsx. Mounting
 *  this component starts a fresh round; unmount/remount (e.g. via a `key`)
 *  to restart. Renders only the canvas — callers own all surrounding layout
 *  (score display, overlays) and get live score/time via the `onScore`/
 *  `onTime` callbacks rather than this component rendering its own chrome,
 *  so solo play and the online race can each lay it out their own way.
 *  `onOver(score)` fires exactly once when the round ends, either by
 *  crashing (wall/self) or — if `timeLimitMs` is set — when time runs out,
 *  whichever comes first; the caller owns what happens after. */
export function SnakeBoard({ tickMs, timeLimitMs = null, onScore, onTime, onOver }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const scoreRef = useRef(0);
  const onScoreRef = useRef(onScore);
  const onTimeRef = useRef(onTime);
  const onOverRef = useRef(onOver);
  onScoreRef.current = onScore;
  onTimeRef.current = onTime;
  onOverRef.current = onOver;

  useEffect(() => {
    function onKey(e) {
      const st = stateRef.current;
      if (!st) return;
      const map = {
        ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
      };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      // Can't reverse directly into the snake's own neck.
      if (dir.x === -st.dir.x && dir.y === -st.dir.y) return;
      st.nextDir = dir;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
    stateRef.current = { snake, dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 }, food: randomCell(snake) };
    if (onTimeRef.current && timeLimitMs != null) onTimeRef.current(Math.ceil(timeLimitMs / 1000));

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const startedAt = Date.now();
    let ended = false;

    // --- Purely-cosmetic animation state --------------------------------
    // None of this is read by the game logic (movement/collision/scoring)
    // below; it only feeds the render loop's visual flourishes.
    let particles = []; // eat-effect burst dots: { x, y, vx, vy, born }
    let growAnim = null; // most-recently-grown tail cell: { x, y, at }
    let colors = readColors();

    function readColors() {
      return {
        bg: themeToken('--panel-2', '#1a2130'),
        bg2: themeToken('--panel', '#151b27'),
        grid: themeToken('--border-soft', '#1e2532'),
        snake: themeToken('--accent', '#818cf8'),
        snake2: themeToken('--accent-2', '#6366f1'),
        head: themeToken('--accent-2', '#6366f1'),
        food: themeToken('--danger', '#fb7185'),
      };
    }

    function spawnParticles(cx, cy) {
      const count = 6;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = 0.6 + Math.random() * 0.8;
        particles.push({
          x: cx * CELL + CELL / 2,
          y: cy * CELL + CELL / 2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          born: performance.now(),
        });
      }
    }

    function roundedRectPath(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function end() {
      if (ended) return;
      ended = true;
      clearInterval(tickId);
      if (timerId) clearInterval(timerId);
      cancelAnimationFrame(rafId);
      onOverRef.current(scoreRef.current);
    }

    const tickId = setInterval(() => {
      const st = stateRef.current;
      st.dir = st.nextDir;
      const head = { x: st.snake[0].x + st.dir.x, y: st.snake[0].y + st.dir.y };

      const hitWall = head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS;
      const hitSelf = st.snake.some((c) => c.x === head.x && c.y === head.y);
      if (hitWall || hitSelf) { end(); return; }

      st.snake.unshift(head);
      if (head.x === st.food.x && head.y === st.food.y) {
        spawnParticles(head.x, head.y);
        st.food = randomCell(st.snake);
        scoreRef.current += 1;
        if (onScoreRef.current) onScoreRef.current(scoreRef.current);
        const tailCell = st.snake[st.snake.length - 1];
        growAnim = { x: tailCell.x, y: tailCell.y, at: performance.now() };
      } else {
        st.snake.pop();
      }

      colors = readColors();
    }, tickMs);

    let timerId = null;
    if (timeLimitMs != null) {
      timerId = setInterval(() => {
        const remaining = timeLimitMs - (Date.now() - startedAt);
        if (onTimeRef.current) onTimeRef.current(Math.max(0, Math.ceil(remaining / 1000)));
        if (remaining <= 0) end();
      }, 250);
    }

    // Render loop, decoupled from the tick loop above: the tick interval
    // owns all game state (position/collision/food/score), this just
    // redraws the current state every frame so animations (pulse, pop-in,
    // particles) can be driven by elapsed time instead of tick count.
    let rafId;
    function draw() {
      const st = stateRef.current;
      const now = performance.now();

      // Background: flat fill + very low-contrast checkerboard for depth.
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
      ctx.fillStyle = colors.bg2;
      ctx.globalAlpha = 0.35;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, ROWS * CELL); ctx.stroke(); }
      for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(COLS * CELL, y * CELL + 0.5); ctx.stroke(); }

      // Food: gentle sine pulse + soft glow.
      const pulse = 1 + Math.sin(now / 220) * 0.12;
      const fx = st.food.x * CELL + CELL / 2;
      const fy = st.food.y * CELL + CELL / 2;
      ctx.save();
      ctx.shadowColor = colors.food;
      ctx.shadowBlur = 9;
      ctx.fillStyle = colors.food;
      ctx.beginPath();
      ctx.arc(fx, fy, (CELL / 2.6) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Snake body: gradient-shaded, rounded segments; head is distinct
      // (brighter gradient + direction-facing eye dots). A just-grown tail
      // cell gets a brief scale pop-in instead of appearing instantaneously.
      const n = st.snake.length;
      st.snake.forEach((c, i) => {
        const isHead = i === 0;
        let scale = 1;
        if (growAnim && c.x === growAnim.x && c.y === growAnim.y) {
          const t = (now - growAnim.at) / 220;
          if (t < 1) scale = 0.5 + 0.5 * Math.max(0, t);
        }
        const full = CELL - 2;
        const size = full * scale;
        const px = c.x * CELL + 1 + (full - size) / 2;
        const py = c.y * CELL + 1 + (full - size) / 2;
        const r = Math.max(2, size * 0.32);

        const grad = ctx.createLinearGradient(px, py, px + size, py + size);
        if (isHead) {
          grad.addColorStop(0, colors.head);
          grad.addColorStop(1, colors.snake2);
        } else {
          grad.addColorStop(0, colors.snake);
          grad.addColorStop(1, colors.snake2);
          ctx.globalAlpha = 1 - Math.min(0.35, (i / n) * 0.35);
        }
        ctx.fillStyle = grad;
        roundedRectPath(px, py, size, size, r);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (isHead) {
          const dx = st.dir.x, dy = st.dir.y;
          const cx = px + size / 2, cy = py + size / 2;
          const eyeOffset = size * 0.22;
          const eyeR = Math.max(1, size * 0.09);
          const forwardX = dx * eyeOffset, forwardY = dy * eyeOffset;
          const sideX = -dy * eyeOffset, sideY = dx * eyeOffset;
          ctx.fillStyle = '#0b1020';
          [-1, 1].forEach((s) => {
            ctx.beginPath();
            ctx.arc(cx + forwardX + sideX * s, cy + forwardY + sideY * s, eyeR, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      });

      // Eat-effect: small fading dots bursting from the eaten cell.
      particles = particles.filter((p) => now - p.born < 420);
      particles.forEach((p) => {
        const age = now - p.born;
        const t = age / 420;
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillStyle = colors.food;
        ctx.beginPath();
        ctx.arc(p.x + p.vx * age * 0.06, p.y + p.vy * age * 0.06, 2 + (1 - t) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);

    return () => { clearInterval(tickId); if (timerId) clearInterval(timerId); cancelAnimationFrame(rafId); };
    // tickMs/timeLimitMs are fixed for a round's lifetime by callers (both
    // remount this component via a `key` to start a new round) — re-running
    // this effect on their change isn't needed and would restart mid-round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} width={COLS * CELL} height={ROWS * CELL} className={styles.canvas} />;
}

/** Classic Snake — no computer opponent (there isn't really a "vs PC" shape
 *  for solo arcade games), arrow keys or WASD, score tracked against the
 *  best score for this browser (localStorage). Easy/Medium/Hard just scale
 *  the tick rate; Hard is deliberately very fast. */
export function Snake() {
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [lastScore, setLastScore] = useState(0);
  const [best, setBest] = useState(() => {
    try { return Number(window.localStorage.getItem('infostride-snake-best')) || 0; } catch { return 0; }
  });
  const [status, setStatus] = useState('ready'); // ready | playing | over
  const [difficulty, setDifficulty] = useState('medium');

  const start = useCallback(() => {
    setScore(0);
    setRound((r) => r + 1);
    setStatus('playing');
  }, []);

  function handleOver(finalScore) {
    setLastScore(finalScore);
    setStatus('over');
    setBest((prevBest) => {
      const newBest = Math.max(prevBest, finalScore);
      try { window.localStorage.setItem('infostride-snake-best', String(newBest)); } catch { /* ignore */ }
      return newBest;
    });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.difficultyRow} role="group" aria-label="Difficulty">
        {Object.entries(DIFFICULTIES).map(([key, d]) => (
          <button
            key={key}
            type="button"
            className={styles.diffBtn}
            aria-pressed={difficulty === key}
            disabled={status === 'playing'}
            onClick={() => setDifficulty(key)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className={styles.scoreRow}>
        <span>Score: <strong>{score}</strong></span>
        <span>Best: <strong>{best}</strong></span>
      </div>
      <div className={styles.boardWrap}>
        {status === 'playing' && (
          <SnakeBoard key={round} tickMs={DIFFICULTIES[difficulty].ms} onScore={setScore} onOver={handleOver} />
        )}
        {status !== 'playing' && (
          <>
            <canvas width={COLS * CELL} height={ROWS * CELL} className={styles.canvas} />
            <div className={styles.overlay}>
              <p>{status === 'over' ? `Game over — score ${lastScore}` : 'Arrow keys / WASD to move'}</p>
              <button type="button" className="btn btn-primary" onClick={start}>{status === 'over' ? 'Play again' : 'Start'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
