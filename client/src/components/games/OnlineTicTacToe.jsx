import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { winnerOf } from './TicTacToe.jsx';
import styles from './TicTacToe.module.css';

const POLL_MS = 2000;

/** Tic-Tac-Toe against another member instead of the computer — polls
 *  `/game-sessions/:id` so each side sees the other's move within a few
 *  seconds. Reuses winnerOf from the vs-computer version so both share
 *  the exact same rules; the server never re-checks the move itself (see
 *  gameSessions.js), it only enforces whose turn it is. */
export function OnlineTicTacToe({ sessionId, meId, onExit }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);

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
  const mySymbol = isPlayer1 ? 'X' : 'O';
  const oppSymbol = isPlayer1 ? 'O' : 'X';
  const board = session.state.board;
  const win = winnerOf(board);
  const myTurn = session.status === 'active' && session.turn === meId;

  function play(i) {
    if (!myTurn || board[i]) return;
    const nextBoard = board.slice();
    nextBoard[i] = mySymbol;
    const nextWin = winnerOf(nextBoard);
    const isDraw = !nextWin && nextBoard.every(Boolean);
    const opponentId = isPlayer1 ? session.player2_id : session.player1_id;
    const body = (nextWin || isDraw)
      ? { state: { board: nextBoard }, status: 'finished', winner: nextWin ? (isPlayer1 ? 'player1' : 'player2') : 'draw' }
      : { state: { board: nextBoard }, turn: opponentId };
    apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}`, { method: 'PATCH', body })
      .then(setSession)
      .catch((err) => alert(err.message || 'Could not submit that move.'));
  }

  const myResultKey = isPlayer1 ? 'player1' : 'player2';
  const statusText = session.status === 'finished'
    ? (session.winner === 'draw' ? "It's a draw." : session.winner === myResultKey ? 'You win!' : 'You lose.')
    : myTurn ? `Your turn (${mySymbol})` : `Waiting for your opponent (${oppSymbol})…`;

  return (
    <div className={styles.wrap}>
      <p className={styles.status}>{statusText}</p>
      <div className={styles.board}>
        {board.map((c, i) => (
          <button
            key={i}
            type="button"
            className={`${styles.cell} ${win && win.line.includes(i) ? styles.winCell : ''}`}
            onClick={() => play(i)}
            disabled={Boolean(c) || !myTurn}
            aria-label={`Cell ${i + 1}${c ? `, ${c}` : ', empty'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
    </div>
  );
}
