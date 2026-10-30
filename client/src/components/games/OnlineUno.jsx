import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { createUnoState, playCard, drawCards, isPlayable, cardLabel, CardFace, COLORS, COLOR_HEX } from './Uno.jsx';
import styles from './Uno.module.css';

const POLL_MS = 2500;

/** UNO against another member — same engine (createUnoState/playCard/
 *  drawCards/isPlayable) and the same CardFace rendering as the vs-computer
 *  game, just keyed by 'player1'/'player2' instead of 'player'/'computer'
 *  and synced via the game session instead of local state. The "choose a
 *  color" step for a Wild/Wild+4 stays purely local UI state here (never
 *  written to the session) — only the fully-resolved move (card played +
 *  chosen color together) gets submitted in one PATCH. */
export function OnlineUno({ sessionId, meId, onExit }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [pendingWild, setPendingWild] = useState(null);

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
  const opponentId = isPlayer1 ? session.player2_id : session.player1_id;
  const state = session.state;
  const myHand = state[`${mySide}Hand`] || [];
  const oppHandCount = (state[`${oppSide}Hand`] || []).length;
  const topCard = state.discard[state.discard.length - 1];
  const myTurn = session.status === 'active' && session.turn === meId;

  function submit(nextState) {
    setPendingWild(null);
    if (nextState.winner) {
      apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        body: { state: nextState, status: 'finished', winner: nextState.winner },
      }).then(setSession).catch((err) => alert(err.message || 'Could not submit that move.'));
      return;
    }
    const nextTurnMember = nextState.turn === mySide ? meId : opponentId;
    apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      body: { state: nextState, turn: nextTurnMember },
    }).then(setSession).catch((err) => alert(err.message || 'Could not submit that move.'));
  }

  function playIndex(index) {
    if (!myTurn || pendingWild !== null) return;
    const card = myHand[index];
    if (!isPlayable(card, topCard, state.currentColor)) return;
    if (card.value === 'wild' || card.value === 'wild4') {
      setPendingWild(index);
    } else {
      submit(playCard(state, mySide, index));
    }
  }

  function chooseColor(color) {
    if (pendingWild === null) return;
    submit(playCard(state, mySide, pendingWild, color));
  }

  function draw() {
    if (!myTurn || pendingWild !== null) return;
    submit({ ...drawCards(state, mySide, 1), turn: oppSide });
  }

  const statusText = session.status === 'finished'
    ? (session.winner === mySide ? 'You win!' : 'You lose.')
    : myTurn
      ? (pendingWild !== null ? 'Choose a color.' : 'Your turn — play a card or draw.')
      : "Waiting for your opponent…";

  const mid = (myHand.length - 1) / 2;

  return (
    <div className={styles.wrap}>
      <p className={styles.status}>{statusText}</p>

      <div className={styles.oppRow}>
        <span className={styles.handCount}>Opponent: {oppHandCount} cards</span>
      </div>

      <div className={styles.table}>
        <button
          type="button"
          className={styles.drawPile}
          onClick={draw}
          disabled={!myTurn || pendingWild !== null || session.status === 'finished'}
          title="Draw a card"
        >
          <span className={styles.deckStack} aria-hidden="true">
            <span className={styles.deckBack} />
            <span className={styles.deckBack} />
            <span className={styles.deckBack} />
          </span>
          <span className={styles.deckCount}>{state.deck.length}</span>
        </button>
        <div className={styles.discardSlot} title={cardLabel(topCard)}>
          <CardFace card={{ ...topCard, color: topCard.color || state.currentColor }} size="pile" />
        </div>
      </div>

      {pendingWild !== null && (
        <div className={styles.colorPicker}>
          <span>Choose a color:</span>
          <div className={styles.colorRow}>
            {COLORS.map((c) => (
              <button key={c} type="button" className={styles.colorSwatch} style={{ background: COLOR_HEX[c] }} onClick={() => chooseColor(c)} aria-label={c} />
            ))}
          </div>
        </div>
      )}

      <div className={styles.hand}>
        {myHand.map((card, i) => {
          const playable = myTurn && session.status !== 'finished' && pendingWild === null && isPlayable(card, topCard, state.currentColor);
          const offset = i - mid;
          const rotate = offset * 3.5;
          const lift = -Math.abs(offset) * 2;
          return (
            <button
              key={i}
              type="button"
              className={`${styles.cardBtn} ${playable ? styles.playable : ''}`}
              style={{ zIndex: i, marginLeft: i === 0 ? 0 : -26, '--rot': `${rotate}deg`, '--lift': `${lift}px` }}
              onClick={() => playIndex(i)}
              disabled={!playable}
              title={cardLabel(card)}
            >
              <CardFace card={card} />
            </button>
          );
        })}
      </div>

      <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
    </div>
  );
}
