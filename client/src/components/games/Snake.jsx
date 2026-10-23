import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './Snake.module.css';

const COLS = 18;
const ROWS = 16;
const CELL = 18;
const DIFFICULTIES = { easy: { label: 'Easy', ms: 160 }, medium: { label: 'Medium', ms: 100 }, hard: { label: 'Hard', ms: 45 } };

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

/** Classic Snake — no computer opponent (there isn't really a "vs PC" shape
 *  for solo arcade games), arrow keys or WASD, score tracked against the
 *  best score for this browser (localStorage). Easy/Medium/Hard just scale
 *  the tick rate; Hard is deliberately very fast. */
export function Snake() {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    try { return Number(window.localStorage.getItem('infostride-snake-best')) || 0; } catch { return 0; }
  });
  const [status, setStatus] = useState('ready'); // ready | playing | over
  const [difficulty, setDifficulty] = useState('medium');

  const reset = useCallback(() => {
    const snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
    stateRef.current = { snake, dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 }, food: randomCell(snake) };
    setScore(0);
    setStatus('playing');
  }, []);

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
    if (status !== 'playing') return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const tickId = setInterval(() => {
      const st = stateRef.current;
      st.dir = st.nextDir;
      const head = { x: st.snake[0].x + st.dir.x, y: st.snake[0].y + st.dir.y };

      const hitWall = head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS;
      const hitSelf = st.snake.some((c) => c.x === head.x && c.y === head.y);
      if (hitWall || hitSelf) {
        setStatus('over');
        setBest((prevBest) => {
          const newBest = Math.max(prevBest, st.snake.length - 3);
          try { window.localStorage.setItem('infostride-snake-best', String(newBest)); } catch { /* ignore */ }
          return newBest;
        });
        return;
      }

      st.snake.unshift(head);
      if (head.x === st.food.x && head.y === st.food.y) {
        st.food = randomCell(st.snake);
        setScore((s) => s + 1);
      } else {
        st.snake.pop();
      }

      const bg = themeToken('--panel-2', '#1a2130');
      const grid = themeToken('--border-soft', '#1e2532');
      const snakeColor = themeToken('--accent', '#818cf8');
      const headColor = themeToken('--accent-2', '#6366f1');
      const foodColor = themeToken('--danger', '#fb7185');

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, ROWS * CELL); ctx.stroke(); }
      for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(COLS * CELL, y * CELL); ctx.stroke(); }

      ctx.fillStyle = foodColor;
      ctx.beginPath();
      ctx.arc(st.food.x * CELL + CELL / 2, st.food.y * CELL + CELL / 2, CELL / 2.6, 0, Math.PI * 2);
      ctx.fill();

      st.snake.forEach((c, i) => {
        ctx.fillStyle = i === 0 ? headColor : snakeColor;
        ctx.fillRect(c.x * CELL + 1, c.y * CELL + 1, CELL - 2, CELL - 2);
      });
    }, DIFFICULTIES[difficulty].ms);

    return () => clearInterval(tickId);
  }, [status, difficulty]);

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
        <canvas ref={canvasRef} width={COLS * CELL} height={ROWS * CELL} className={styles.canvas} />
        {status !== 'playing' && (
          <div className={styles.overlay}>
            <p>{status === 'over' ? `Game over — score ${score}` : 'Arrow keys / WASD to move'}</p>
            <button type="button" className="btn btn-primary" onClick={reset}>{status === 'over' ? 'Play again' : 'Start'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
