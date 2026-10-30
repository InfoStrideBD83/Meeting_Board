import { useEffect, useMemo, useState } from 'react';
import styles from './SnakesAndLadders.module.css';

export const BOARD_SIZE = 100;
export const COLS = 10;

// A fixed, hand-picked set of ladders/snakes — none chain into each other
// (no ladder/snake endpoint is itself another's start), and ladders skew
// toward the early board while snakes skew toward the late board, for
// reasonable pacing rather than pure chaos.
export const LADDERS = { 2: 23, 8: 34, 20: 77, 32: 68, 41: 79, 58: 85, 74: 88, 50: 69 };
export const SNAKES = { 98: 78, 95: 56, 92: 73, 87: 24, 64: 60, 62: 19, 48: 9, 36: 6, 16: 3 };

export function squareToRowCol(sq) {
  const idx = sq - 1;
  const row = Math.floor(idx / COLS);
  const posInRow = idx % COLS;
  const col = row % 2 === 0 ? posInRow : COLS - 1 - posInRow;
  return { row, col };
}

// CSS grid placement — row 0 (squares 1-10) renders at the bottom, climbing
// toward 100 at the top, like a real board.
export function squareToGrid(sq) {
  const { row, col } = squareToRowCol(sq);
  return { gridRow: COLS - row, gridColumn: col + 1 };
}

// Percent-based center (0-100 viewBox matching the grid 1:1) for the SVG
// snake/ladder line overlay.
export function squareToPercent(sq) {
  const { row, col } = squareToRowCol(sq);
  return { x: (col + 0.5) / COLS * 100, y: (COLS - row - 0.5) / COLS * 100 };
}

export function resolveSquare(sq) {
  if (LADDERS[sq]) return LADDERS[sq];
  if (SNAKES[sq]) return SNAKES[sq];
  return sq;
}

export function rollDie() { return 1 + Math.floor(Math.random() * 6); }

/** Pure move resolution, shared between local and online play: overshooting
 *  100 forfeits the move (classic rule — must land exactly on 100), landing
 *  exactly on a ladder/snake mouth immediately resolves it. `positions` is a
 *  plain {seatKey: square} map with no fixed key set (0 = not yet moved),
 *  so both local (p1..p4) and online (player1/player2) callers can use
 *  whatever seat keys they like. */
export function applyRoll(positions, seat, roll) {
  const pos = positions[seat] || 0;
  const target = pos + roll;
  if (target > BOARD_SIZE) return { ...positions };
  return { ...positions, [seat]: resolveSquare(target) };
}

export function isWinningSquare(sq) { return sq === BOARD_SIZE; }

export const SEAT_COLORS = ['var(--accent)', 'var(--danger)', 'var(--success)', 'var(--warn)'];

function freshPositions(seats) {
  const p = {};
  seats.forEach((s) => { p[s.key] = 0; });
  return p;
}

/** Shared board rendering (grid + snake/ladder line overlay) — used by both
 *  this component and OnlineSnakesAndLadders.jsx so the two never drift
 *  apart visually. */
export function BoardSurface({ cellOccupants, colorFor }) {
  return (
    <div className={styles.boardOuter}>
      <svg className={styles.lines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {Object.entries(LADDERS).map(([from, to]) => {
          const a = squareToPercent(Number(from));
          const b = squareToPercent(Number(to));
          return <line key={`l${from}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.ladderLine} />;
        })}
        {Object.entries(SNAKES).map(([from, to]) => {
          const a = squareToPercent(Number(from));
          const b = squareToPercent(Number(to));
          return <line key={`s${from}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.snakeLine} />;
        })}
      </svg>
      <div className={styles.board}>
        {Array.from({ length: BOARD_SIZE }, (_, i) => i + 1).map((sq) => {
          const { gridRow, gridColumn } = squareToGrid(sq);
          const occupants = cellOccupants.get(sq) || [];
          const isLadder = Boolean(LADDERS[sq]);
          const isSnake = Boolean(SNAKES[sq]);
          return (
            <div key={sq} className={`${styles.cell} ${isLadder ? styles.ladderCell : ''} ${isSnake ? styles.snakeCell : ''}`} style={{ gridRow, gridColumn }}>
              <span className={styles.cellNum}>{sq}</span>
              {isLadder && <span className={styles.marker} title={`Ladder to ${LADDERS[sq]}`}>🪜</span>}
              {isSnake && <span className={styles.marker} title={`Snake to ${SNAKES[sq]}`}>🐍</span>}
              <span className={styles.tokens}>
                {occupants.map((key) => (
                  <span key={key} className={styles.token} style={{ background: colorFor(key) }} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeatPicker({ onStart }) {
  const [count, setCount] = useState(2);
  const [types, setTypes] = useState(['human', 'computer', 'computer', 'computer']);

  function toggleType(i) {
    setTypes((t) => t.map((v, idx) => (idx === i ? (v === 'human' ? 'computer' : 'human') : v)));
  }

  function start() {
    const seats = Array.from({ length: count }, (_, i) => ({
      key: `p${i + 1}`,
      label: types[i] === 'human' ? `Player ${i + 1}` : `Computer ${i + 1}`,
      type: types[i],
    }));
    onStart(seats);
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.status}>Snakes &amp; Ladders — choose your players</p>
      <div className={styles.setupRow} role="group" aria-label="Number of players">
        {[2, 3, 4].map((n) => (
          <button key={n} type="button" className={`btn ${count === n ? 'btn-primary' : ''}`} onClick={() => setCount(n)}>{n} players</button>
        ))}
      </div>
      <div className={styles.seatList}>
        {Array.from({ length: count }, (_, i) => (
          <button key={i} type="button" className={styles.seatToggle} onClick={() => toggleType(i)}>
            <span className={styles.sideDot} style={{ background: SEAT_COLORS[i % SEAT_COLORS.length] }} />
            Seat {i + 1}: {types[i] === 'human' ? 'Human' : 'Computer'} <span className={styles.seatHint}>(tap to change)</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary" onClick={start}>Start game</button>
    </div>
  );
}

/** Local Snakes &amp; Ladders — 2 to 4 seats at one device, each seat human
 *  or a simple computer (there's no strategy possible in this game, a
 *  computer seat just rolls on a timer). Shares its move-resolution engine
 *  (applyRoll/resolveSquare, exported above) with
 *  OnlineSnakesAndLadders.jsx's member-vs-member mode — same pattern Ludo
 *  uses to share its engine between local and online play. */
export function SnakesAndLadders() {
  const [seats, setSeats] = useState(null);
  const [positions, setPositions] = useState({});
  const [turnIdx, setTurnIdx] = useState(0);
  const [roll, setRoll] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState('');

  const winner = seats && seats.find((s) => isWinningSquare(positions[s.key]));

  function startGame(chosenSeats) {
    setSeats(chosenSeats);
    setPositions(freshPositions(chosenSeats));
    setTurnIdx(0);
    setRoll(null);
    setMessage(`${chosenSeats[0].label}'s turn — roll the dice.`);
  }

  function doRoll() {
    if (!seats || winner || roll !== null || rolling) return;
    setRolling(true);
    const seat = seats[turnIdx];
    let ticks = 0;
    const spin = setInterval(() => {
      setRoll(1 + Math.floor(Math.random() * 6));
      ticks += 1;
      if (ticks > 6) {
        clearInterval(spin);
        const r = rollDie();
        setRoll(r);
        setPositions((prev) => {
          const nextPositions = applyRoll(prev, seat.key, r);
          const moved = nextPositions[seat.key] !== prev[seat.key];
          if (isWinningSquare(nextPositions[seat.key])) {
            setMessage(`${seat.label} wins!`);
          } else {
            setMessage(moved ? `${seat.label} rolled ${r}.` : `${seat.label} rolled ${r} — overshoot, no move.`);
            setTimeout(() => {
              setTurnIdx((ti) => {
                const next = (ti + 1) % seats.length;
                setMessage(`${seats[next].label}'s turn — roll the dice.`);
                return next;
              });
              setRoll(null);
            }, 900);
          }
          return nextPositions;
        });
        setRolling(false);
      }
    }, 80);
  }

  useEffect(() => {
    if (!seats || winner) return undefined;
    const seat = seats[turnIdx];
    if (seat && seat.type === 'computer' && roll === null && !rolling) {
      const t = setTimeout(doRoll, 700);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnIdx, roll, seats, winner, rolling]);

  const cellOccupants = useMemo(() => {
    const map = new Map();
    if (seats) {
      seats.forEach((s) => {
        const pos = positions[s.key];
        if (pos > 0) {
          if (!map.has(pos)) map.set(pos, []);
          map.get(pos).push(s.key);
        }
      });
    }
    return map;
  }, [positions, seats]);

  if (!seats) return <SeatPicker onStart={startGame} />;

  const colorOf = (key) => SEAT_COLORS[seats.findIndex((s) => s.key === key) % SEAT_COLORS.length];
  const current = seats[turnIdx];
  const canRollNow = !winner && current && current.type === 'human' && roll === null && !rolling;

  return (
    <div className={styles.wrap}>
      <p className={styles.status}>{winner ? `${winner.label} wins!` : message}</p>

      <BoardSurface cellOccupants={cellOccupants} colorFor={colorOf} />

      <div className={styles.controls}>
        <button type="button" className="btn btn-primary" onClick={doRoll} disabled={!canRollNow}>
          {roll === null ? 'Roll dice' : `Rolled ${roll}`}
        </button>
      </div>

      <div className={styles.sides}>
        {seats.map((s, i) => (
          <div key={s.key} className={styles.sidePanel}>
            <span className={styles.sideDot} style={{ background: SEAT_COLORS[i % SEAT_COLORS.length] }} />
            <span className={styles.sideLabel} style={{ color: SEAT_COLORS[i % SEAT_COLORS.length] }}>
              {s.label}{turnIdx === i && !winner ? ' · turn' : ''}
            </span>
            <span className={styles.sidePos}>
              {positions[s.key] === 0 ? 'Start' : isWinningSquare(positions[s.key]) ? 'Finished!' : `Square ${positions[s.key]}`}
            </span>
          </div>
        ))}
      </div>

      <button type="button" className="btn" onClick={() => setSeats(null)}>New game</button>
    </div>
  );
}
