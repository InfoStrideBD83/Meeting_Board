import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { applyRoll, isWinningSquare, rollDie, BoardSurface } from './SnakesAndLadders.jsx';
import styles from './SnakesAndLadders.module.css';

const POLL_MS = 2000;

/** Snakes &amp; Ladders against another member — the exact same
 *  move-resolution engine as the local game (see SnakesAndLadders.jsx:
 *  applyRoll/resolveSquare, the ladder/snake table, the board layout), just
 *  with both sides driven by real people instead of a local seat. The dice
 *  roll happens on whichever browser's turn it is and is written into the
 *  shared session state so the opponent sees the same result on their next
 *  poll — there's nothing hidden to keep secret in this game, unlike a card
 *  game's hand. */
export function OnlineSnakesAndLadders({ sessionId, meId, onExit }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [displayRoll, setDisplayRoll] = useState(null);

  const refresh = useCallback(() => {
    apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}`).then(setSession).catch((err) => setError(err.message || 'Could not load this game.'));
  }, [sessionId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (error) {
    return (
      <div className={styles.wrap}>
        <p className={styles.status}>{error}</p>
        <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
      </div>
    );
  }
  if (!session) return <p className={styles.status}>Loading…</p>;

  const isPlayer1 = session.player1_id === meId;
  const mySide = isPlayer1 ? 'player1' : 'player2';
  const oppSide = isPlayer1 ? 'player2' : 'player1';
  const oppId = isPlayer1 ? session.player2_id : session.player1_id;
  const turnIdBySide = { [mySide]: meId, [oppSide]: oppId };
  const { positions } = session.state;
  const myTurn = session.status === 'active' && session.turn === meId;

  function patch(body) {
    return apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}`, { method: 'PATCH', body }).then(setSession);
  }

  function doRoll() {
    if (!myTurn || rolling) return;
    setRolling(true);
    let ticks = 0;
    const spin = setInterval(() => {
      setDisplayRoll(1 + Math.floor(Math.random() * 6));
      ticks += 1;
      if (ticks > 6) {
        clearInterval(spin);
        const r = rollDie();
        setDisplayRoll(r);
        const nextPositions = applyRoll(positions, mySide, r);
        const request = isWinningSquare(nextPositions[mySide])
          ? patch({ state: { positions: nextPositions }, status: 'finished', winner: mySide })
          : patch({ state: { positions: nextPositions }, turn: oppId });
        request.finally(() => { setRolling(false); setDisplayRoll(null); });
      }
    }, 80);
  }

  const cellOccupants = new Map();
  for (const side of ['player1', 'player2']) {
    const pos = positions[side];
    if (pos > 0) {
      if (!cellOccupants.has(pos)) cellOccupants.set(pos, []);
      cellOccupants.get(pos).push(side);
    }
  }

  const COLORS = { [mySide]: 'var(--accent)', [oppSide]: 'var(--danger)' };
  const LABELS = { [mySide]: 'You', [oppSide]: 'Opponent' };

  const statusText = session.status === 'finished'
    ? (session.winner === mySide ? 'You win!' : 'You lose.')
    : myTurn ? 'Your turn — roll the dice.' : 'Waiting for your opponent…';

  return (
    <div className={styles.wrap}>
      <p className={styles.status}>{statusText}</p>

      <BoardSurface cellOccupants={cellOccupants} colorFor={(side) => COLORS[side]} />

      <div className={styles.controls}>
        <button type="button" className="btn btn-primary" onClick={doRoll} disabled={!myTurn || rolling || session.status !== 'active'}>
          {rolling ? `Rolling ${displayRoll ?? ''}` : 'Roll dice'}
        </button>
      </div>

      <div className={styles.sides}>
        {[mySide, oppSide].map((side) => (
          <div key={side} className={styles.sidePanel}>
            <span className={styles.sideDot} style={{ background: COLORS[side] }} />
            <span className={styles.sideLabel} style={{ color: COLORS[side] }}>
              {LABELS[side]}{session.status === 'active' && session.turn === turnIdBySide[side] ? ' · turn' : ''}
            </span>
            <span className={styles.sidePos}>
              {positions[side] === 0 ? 'Start' : isWinningSquare(positions[side]) ? 'Finished!' : `Square ${positions[side]}`}
            </span>
          </div>
        ))}
      </div>

      <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
    </div>
  );
}
