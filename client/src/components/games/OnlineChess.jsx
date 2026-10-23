import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { initialBoard, legalMovesFrom, applyMove, allLegalMoves, isInCheck, CHESS_GLYPH } from './Chess.jsx';
import styles from './Chess.module.css';

const POLL_MS = 2500;

/** Chess against another member — same legal-move engine as the
 *  vs-computer version (no castling/en passant, pawns auto-promote to
 *  queen), synced by polling the game session every few seconds. Because
 *  the game's state lives in the database rather than a browser tab, a
 *  long game survives either player closing the app and coming back
 *  later — there's no session to lose. */
export function OnlineChess({ sessionId, meId, onExit }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);

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
  const myColor = isPlayer1 ? 'w' : 'b';
  const board = session.state.board || initialBoard();
  const myTurn = session.status === 'active' && session.turn === meId;
  const myResultKey = isPlayer1 ? 'player1' : 'player2';

  function submitMove(from, to) {
    const nextBoard = applyMove(board, from, to);
    const nextColor = myColor === 'w' ? 'b' : 'w';
    const opponentId = isPlayer1 ? session.player2_id : session.player1_id;
    const nextMoves = allLegalMoves(nextBoard, nextColor);
    const body = nextMoves.length === 0
      ? { state: { board: nextBoard }, status: 'finished', winner: isInCheck(nextBoard, nextColor) ? myResultKey : 'draw' }
      : { state: { board: nextBoard }, turn: opponentId };
    apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}`, { method: 'PATCH', body })
      .then(setSession)
      .catch((err) => alert(err.message || 'Could not submit that move.'));
    setSelected(null);
    setLegalTargets([]);
  }

  function clickSquare(r, c) {
    if (!myTurn) return;
    if (selected) {
      if (legalTargets.some(([tr, tc]) => tr === r && tc === c)) { submitMove(selected, [r, c]); return; }
    }
    const piece = board[r][c];
    if (piece && piece.color === myColor) {
      setSelected([r, c]);
      setLegalTargets(legalMovesFrom(board, r, c));
    } else {
      setSelected(null);
      setLegalTargets([]);
    }
  }

  const statusText = session.status === 'finished'
    ? (session.winner === 'draw' ? 'Draw.' : session.winner === myResultKey ? 'Checkmate — you win!' : 'Checkmate — you lose.')
    : myTurn ? (isInCheck(board, myColor) ? 'Check! Your move.' : 'Your move.')
      : "Waiting for your opponent's move…";

  return (
    <div className={styles.wrap}>
      <p className={styles.status}>{statusText}</p>
      <div className={styles.board}>
        {board.map((rowArr, r) => rowArr.map((piece, c) => {
          const isSelected = selected && selected[0] === r && selected[1] === c;
          const isTarget = legalTargets.some(([tr, tc]) => tr === r && tc === c);
          const light = (r + c) % 2 === 0;
          return (
            <button
              key={`${r}-${c}`}
              type="button"
              className={`${styles.square} ${light ? styles.light : styles.dark} ${isSelected ? styles.selected : ''}`}
              onClick={() => clickSquare(r, c)}
            >
              {piece && <span className={styles.piece} style={{ color: piece.color === 'w' ? '#f4f6fb' : '#13161f' }}>{CHESS_GLYPH[piece.color][piece.type]}</span>}
              {isTarget && <span className={piece ? styles.captureDot : styles.moveDot} />}
            </button>
          );
        }))}
      </div>
      <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
    </div>
  );
}
