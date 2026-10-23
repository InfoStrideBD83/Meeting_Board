import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import styles from './MemoryMatch.module.css';

const POLL_MS = 2000;
const FLIP_BACK_MS = 900;

/** Memory Match against another member instead of the computer — same
 *  flip-two-cards rules (a match keeps your turn, a miss passes it),
 *  synced by polling. Whoever just flipped a non-matching pair is the one
 *  whose browser runs the "flip it back after a second" timer and patches
 *  that result — if they close the tab in that exact window the two
 *  cards would stay revealed until someone reloads, a known edge case of
 *  there being no server-side timer, not worth a websocket for a casual
 *  2-player card game. */
export function OnlineMemoryMatch({ sessionId, meId, onExit }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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
  const myKey = isPlayer1 ? 'player1' : 'player2';
  const oppId = isPlayer1 ? session.player2_id : session.player1_id;
  const { cards, flipped, scores } = session.state;
  const myTurn = session.status === 'active' && session.turn === meId;

  function patch(body) {
    return apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}`, { method: 'PATCH', body }).then(setSession);
  }

  function flip(index) {
    if (!myTurn || busy || cards[index].matched || flipped.includes(index) || flipped.length >= 2) return;
    const nextFlipped = [...flipped, index];

    if (nextFlipped.length < 2) {
      patch({ state: { ...session.state, flipped: nextFlipped }, turn: meId }).catch(() => {});
      return;
    }

    const [a, b] = nextFlipped;
    const match = cards[a].icon === cards[b].icon;
    setBusy(true);

    if (match) {
      const nextCards = cards.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c));
      const nextScores = { ...scores, [myKey]: scores[myKey] + 1 };
      const allMatched = nextCards.every((c) => c.matched);
      const body = allMatched
        ? { state: { cards: nextCards, flipped: [], scores: nextScores }, status: 'finished', winner: nextScores.player1 === nextScores.player2 ? 'draw' : (nextScores.player1 > nextScores.player2 ? 'player1' : 'player2') }
        : { state: { cards: nextCards, flipped: [], scores: nextScores }, turn: meId };
      patch(body).finally(() => setBusy(false));
    } else {
      patch({ state: { ...session.state, flipped: nextFlipped }, turn: meId })
        .then(() => {
          setTimeout(() => {
            patch({ state: { cards, flipped: [], scores }, turn: oppId }).finally(() => setBusy(false));
          }, FLIP_BACK_MS);
        })
        .catch(() => setBusy(false));
    }
  }

  const myResultKey = isPlayer1 ? 'player1' : 'player2';
  const statusText = session.status === 'finished'
    ? (session.winner === 'draw' ? "It's a tie." : session.winner === myResultKey ? 'You win!' : 'You lose.')
    : myTurn ? 'Your turn — flip two cards.' : "Waiting for your opponent…";

  return (
    <div className={styles.wrap}>
      <div className={styles.scoreRow}>
        <span className={myTurn && session.status !== 'finished' ? styles.activeSide : ''}>You: <strong>{scores[myKey]}</strong></span>
        <span className={styles.vs}>vs</span>
        <span className={!myTurn && session.status !== 'finished' ? styles.activeSide : ''}>Opponent: <strong>{scores[isPlayer1 ? 'player2' : 'player1']}</strong></span>
      </div>
      <p className={styles.status}>{statusText}</p>
      <div className={styles.grid}>
        {cards.map((c, i) => {
          const shown = c.matched || flipped.includes(i);
          return (
            <button
              key={c.id}
              type="button"
              className={`${styles.card} ${shown ? styles.flipped : ''} ${c.matched ? styles.matched : ''}`}
              onClick={() => flip(i)}
              disabled={!myTurn || busy || c.matched}
              aria-label={shown ? c.icon : 'Hidden card'}
            >
              <span className={styles.cardFace}>{shown ? c.icon : ''}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
    </div>
  );
}
