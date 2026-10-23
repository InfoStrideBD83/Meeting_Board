import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { TRACK_LEN, FINISHED, RING, SAFE_CELLS, legalMoves, applyMove, absoluteCell, tokenLabel } from './Ludo.jsx';
import styles from './Ludo.module.css';

const POLL_MS = 2000;
const GRID = 9;

/** Ludo against another member — the exact same engine as the
 *  vs-computer version (see Ludo.jsx: real rules, ring board, 3-six
 *  forfeit), just with both sides driven by real people instead of an
 *  AI. The dice roll happens on whichever browser's turn it is and is
 *  written into the shared session state so the opponent sees the same
 *  roll on their next poll — there's no hidden randomness to keep secret
 *  in Ludo, so this is safe unlike a card game's hand. */
export function OnlineLudo({ sessionId, meId, onExit }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [rolling, setRolling] = useState(false);

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
  const { tokens, roll, sixStreak = 0 } = session.state;
  const myTurn = session.status === 'active' && session.turn === meId;
  const moves = (myTurn && roll != null) ? legalMoves(tokens[mySide], roll) : [];

  function patch(body) {
    return apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}`, { method: 'PATCH', body }).then(setSession);
  }

  function passOrReroll(rolledSix, baseTokens) {
    if (rolledSix && sixStreak + 1 < 3) {
      patch({ state: { tokens: baseTokens, roll: null, sixStreak: sixStreak + 1 }, turn: meId });
    } else {
      patch({ state: { tokens: baseTokens, roll: null, sixStreak: 0 }, turn: oppId });
    }
  }

  function doRoll() {
    if (!myTurn || roll != null || rolling) return;
    setRolling(true);
    const r = 1 + Math.floor(Math.random() * 6);
    const legal = legalMoves(tokens[mySide], r);
    if (legal.length === 0) {
      patch({ state: { tokens, roll: r, sixStreak }, turn: meId })
        .then(() => { setTimeout(() => passOrReroll(r === 6, tokens), 700); })
        .finally(() => setRolling(false));
    } else {
      patch({ state: { tokens, roll: r, sixStreak }, turn: meId }).finally(() => setRolling(false));
    }
  }

  function moveToken(i) {
    if (!myTurn || roll == null || !moves.includes(i)) return;
    const nextTokens = applyMove(tokens, mySide, i, roll);
    if (nextTokens[mySide].every((p) => p >= FINISHED)) {
      patch({ state: { tokens: nextTokens, roll: null, sixStreak: 0 }, status: 'finished', winner: mySide });
      return;
    }
    passOrReroll(roll === 6, nextTokens);
  }

  const cellOccupants = new Map();
  for (const side of ['player1', 'player2']) {
    tokens[side].forEach((pos, i) => {
      if (pos >= 0 && pos < TRACK_LEN) {
        const cell = absoluteCell(side, pos);
        if (!cellOccupants.has(cell)) cellOccupants.set(cell, []);
        cellOccupants.get(cell).push({ side, i });
      }
    });
  }

  const COLORS = { [mySide]: 'var(--accent)', [oppSide]: 'var(--danger)' };
  const LABELS = { [mySide]: 'You', [oppSide]: 'Opponent' };

  const statusText = session.status === 'finished'
    ? (session.winner === mySide ? 'You win!' : 'You lose.')
    : myTurn ? (roll == null ? 'Your turn — roll the dice.' : 'Move a highlighted token.') : "Waiting for your opponent…";

  return (
    <div className={styles.wrap}>
      <p className={styles.status}>{statusText}</p>

      <div className={styles.board} style={{ '--n': GRID }}>
        {RING.map((cell, i) => {
          const occupants = cellOccupants.get(i) || [];
          return (
            <div key={i} className={`${styles.ringCell} ${SAFE_CELLS.has(i) ? styles.safeCell : ''}`} style={{ gridRow: cell.row + 1, gridColumn: cell.col + 1 }}>
              {occupants.map((o) => (
                <span key={`${o.side}-${o.i}`} className={styles.token} style={{ background: COLORS[o.side] }} title={`${LABELS[o.side]} token ${o.i + 1}`} />
              ))}
            </div>
          );
        })}
      </div>

      <div className={styles.controls}>
        <button type="button" className="btn btn-primary" onClick={doRoll} disabled={!myTurn || roll != null || session.status !== 'active' || rolling}>
          {roll == null ? 'Roll dice' : `Rolled ${roll}`}
        </button>
      </div>

      <div className={styles.sides}>
        {[mySide, oppSide].map((side) => (
          <div key={side} className={styles.sidePanel}>
            <div className={styles.sideHead} style={{ color: COLORS[side] }}>
              {LABELS[side]}{session.status === 'active' && session.turn === turnIdBySide[side] ? ' · turn' : ''}
            </div>
            <div className={styles.tokenList}>
              {tokens[side].map((pos, i) => {
                const canMove = side === mySide && moves.includes(i);
                return (
                  <button key={i} type="button" className={`${styles.tokenRow} ${canMove ? styles.movable : ''}`} onClick={() => moveToken(i)} disabled={!canMove}>
                    <span className={styles.tokenDot} style={{ background: COLORS[side] }} />
                    {tokenLabel(pos)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
    </div>
  );
}
