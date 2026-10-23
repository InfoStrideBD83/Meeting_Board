import { useEffect, useState } from 'react';
import styles from './TicTacToe.module.css';

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function winnerOf(cells) {
  for (const [a, b, c] of LINES) {
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return { mark: cells[a], line: [a, b, c] };
  }
  return null;
}

function minimax(cells, isMax, depth) {
  const win = winnerOf(cells);
  if (win) return win.mark === 'O' ? 10 - depth : depth - 10;
  if (cells.every(Boolean)) return 0;

  const scores = [];
  for (let i = 0; i < 9; i++) {
    if (cells[i]) continue;
    const next = cells.slice();
    next[i] = isMax ? 'O' : 'X';
    scores.push(minimax(next, !isMax, depth + 1));
  }
  return isMax ? Math.max(...scores) : Math.min(...scores);
}

function bestMove(cells) {
  let best = -Infinity;
  let move = -1;
  for (let i = 0; i < 9; i++) {
    if (cells[i]) continue;
    const next = cells.slice();
    next[i] = 'O';
    const score = minimax(next, false, 1);
    if (score > best) { best = score; move = i; }
  }
  return move;
}

/** Unbeatable Tic-Tac-Toe — you're X and move first, the computer (O)
 *  always plays the minimax-optimal reply, so the best you can do is draw. */
export function TicTacToe() {
  const [cells, setCells] = useState(Array(9).fill(null));
  const [turn, setTurn] = useState('player');
  const [thinking, setThinking] = useState(false);

  const win = winnerOf(cells);
  const draw = !win && cells.every(Boolean);
  const over = Boolean(win) || draw;

  useEffect(() => {
    if (turn !== 'computer' || over) return undefined;
    setThinking(true);
    const t = setTimeout(() => {
      setCells((prev) => {
        const move = bestMove(prev);
        if (move === -1) return prev;
        const next = prev.slice();
        next[move] = 'O';
        return next;
      });
      setThinking(false);
      setTurn('player');
    }, 450);
    return () => clearTimeout(t);
  }, [turn, over]);

  function playerMove(i) {
    if (cells[i] || over || turn !== 'player') return;
    const next = cells.slice();
    next[i] = 'X';
    setCells(next);
    setTurn('computer');
  }

  function reset() {
    setCells(Array(9).fill(null));
    setTurn('player');
    setThinking(false);
  }

  const status = win
    ? (win.mark === 'X' ? 'You win! (the computer should never let this happen — nice find)' : 'Computer wins.')
    : draw
      ? "It's a draw."
      : thinking ? 'Computer is thinking…' : 'Your move (X).';

  return (
    <div className={styles.wrap}>
      <p className={styles.status}>{status}</p>
      <div className={styles.board}>
        {cells.map((c, i) => (
          <button
            key={i}
            type="button"
            className={`${styles.cell} ${win && win.line.includes(i) ? styles.winCell : ''}`}
            onClick={() => playerMove(i)}
            disabled={Boolean(c) || over || turn !== 'player'}
            aria-label={`Cell ${i + 1}${c ? `, ${c}` : ', empty'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary" onClick={reset}>New game</button>
    </div>
  );
}
