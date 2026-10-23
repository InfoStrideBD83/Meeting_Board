import { useEffect, useState } from 'react';
import styles from './Uno.module.css';

const COLORS = ['red', 'yellow', 'green', 'blue'];
const COLOR_HEX = { red: '#e11d48', yellow: '#d97706', green: '#059669', blue: '#2563eb' };

function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ color, value: '0' });
    for (let n = 1; n <= 9; n++) { deck.push({ color, value: String(n) }); deck.push({ color, value: String(n) }); }
    for (const v of ['skip', 'reverse', 'draw2']) { deck.push({ color, value: v }); deck.push({ color, value: v }); }
  }
  for (let i = 0; i < 4; i++) { deck.push({ color: null, value: 'wild' }); deck.push({ color: null, value: 'wild4' }); }
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardLabel(card) {
  const names = { skip: 'Skip', reverse: 'Reverse', draw2: '+2', wild: 'Wild', wild4: 'Wild +4' };
  return names[card.value] || card.value;
}

function isPlayable(card, topCard, currentColor) {
  if (card.value === 'wild' || card.value === 'wild4') return true;
  return card.color === currentColor || card.value === topCard.value;
}

function freshGame() {
  let deck = shuffle(buildDeck());
  const playerHand = deck.splice(0, 7);
  const computerHand = deck.splice(0, 7);
  let starter;
  do { starter = deck.shift(); if (!starter) { deck = shuffle(buildDeck()); starter = deck.shift(); } }
  while (starter.color === null);
  return {
    deck, discard: [starter], playerHand, computerHand,
    currentColor: starter.color, turn: 'player',
    pendingWild: null, message: 'Your turn — play a card or draw.', winner: null,
  };
}

function drawCards(state, side, count) {
  let { deck, discard } = state;
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      const top = discard[discard.length - 1];
      deck = shuffle(discard.slice(0, -1));
      discard = [top];
    }
    if (deck.length === 0) break;
    drawn.push(deck.shift());
  }
  return { ...state, deck, discard, [side === 'player' ? 'playerHand' : 'computerHand']: state[side === 'player' ? 'playerHand' : 'computerHand'].concat(drawn) };
}

function playCard(state, side, cardIndex, chosenColor) {
  const handKey = side === 'player' ? 'playerHand' : 'computerHand';
  const oppHandKey = side === 'player' ? 'computerHand' : 'playerHand';
  const hand = [...state[handKey]];
  const [card] = hand.splice(cardIndex, 1);
  let next = { ...state, [handKey]: hand, discard: [...state.discard, card] };

  const resolvedColor = card.color || chosenColor;
  next.currentColor = resolvedColor;

  if (hand.length === 0) {
    return { ...next, winner: side, turn: side, message: `${side === 'player' ? 'You win!' : 'Computer wins.'}` };
  }

  let sameSideAgain = false;
  if (card.value === 'skip' || card.value === 'reverse') sameSideAgain = true;
  if (card.value === 'draw2') { next = drawCards(next, side === 'player' ? 'computer' : 'player', 2); sameSideAgain = true; }
  if (card.value === 'wild4') { next = drawCards(next, side === 'player' ? 'computer' : 'player', 4); sameSideAgain = true; }

  next.turn = sameSideAgain ? side : (side === 'player' ? 'computer' : 'player');
  next.message = next.turn === 'player' ? 'Your turn.' : 'Computer is thinking…';
  return next;
}

function computerChooseColor(hand) {
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
  hand.forEach((c) => { if (c.color) counts[c.color]++; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/** Two-player UNO, you vs the computer — full color/number/action-card
 *  rules (Skip, Reverse, Draw Two, Wild, Wild Draw Four), with the
 *  Reverse-acts-like-Skip and draw-one-and-pass-if-no-valid-move
 *  simplifications that are standard for a 2-player game. The "can only
 *  play Wild Draw Four if you have no matching color" challenge rule is
 *  skipped for simplicity — it's always legal here, like a plain Wild. */
export function Uno() {
  const [state, setState] = useState(freshGame);
  const topCard = state.discard[state.discard.length - 1];

  function reset() { setState(freshGame()); }

  function playerPlay(index) {
    if (state.turn !== 'player' || state.winner || state.pendingWild !== null) return;
    const card = state.playerHand[index];
    if (!isPlayable(card, topCard, state.currentColor)) return;
    if (card.value === 'wild' || card.value === 'wild4') {
      setState((s) => ({ ...s, pendingWild: index }));
    } else {
      setState((s) => playCard(s, 'player', index));
    }
  }

  function chooseColor(color) {
    setState((s) => playCard(s, 'player', s.pendingWild, color));
  }

  function playerDraw() {
    if (state.turn !== 'player' || state.winner || state.pendingWild !== null) return;
    setState((s) => ({ ...drawCards(s, 'player', 1), turn: 'computer', message: 'Computer is thinking…' }));
  }

  useEffect(() => {
    if (state.turn !== 'computer' || state.winner) return undefined;
    const t = setTimeout(() => {
      setState((s) => {
        const options = s.computerHand
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => isPlayable(c, s.discard[s.discard.length - 1], s.currentColor));
        if (options.length === 0) {
          const drawn = drawCards(s, 'computer', 1);
          return { ...drawn, turn: 'player', message: 'Your turn.' };
        }
        const priority = { wild4: 0, draw2: 1, skip: 2, reverse: 2, wild: 3 };
        options.sort((a, b) => (priority[a.c.value] ?? 4) - (priority[b.c.value] ?? 4));
        const choice = options[0];
        const chosenColor = (choice.c.value === 'wild' || choice.c.value === 'wild4')
          ? computerChooseColor(s.computerHand.filter((_, i) => i !== choice.i))
          : undefined;
        return playCard(s, 'computer', choice.i, chosenColor);
      });
    }, 650);
    return () => clearTimeout(t);
  }, [state.turn, state.winner]);

  return (
    <div className={styles.wrap}>
      <p className={styles.status}>{state.winner ? (state.winner === 'player' ? 'You win!' : 'Computer wins.') : state.message}</p>

      <div className={styles.oppRow}>
        <span className={styles.handCount}>Computer: {state.computerHand.length} cards</span>
      </div>

      <div className={styles.table}>
        <button type="button" className={styles.drawPile} onClick={playerDraw} disabled={state.turn !== 'player' || Boolean(state.winner) || state.pendingWild !== null} title="Draw a card">
          Draw ({state.deck.length})
        </button>
        <div className={styles.discardTop} style={{ background: COLOR_HEX[state.currentColor] }}>
          {cardLabel(topCard)}
        </div>
      </div>

      {state.pendingWild !== null && (
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
        {state.playerHand.map((card, i) => {
          const playable = state.turn === 'player' && !state.winner && state.pendingWild === null && isPlayable(card, topCard, state.currentColor);
          return (
            <button
              key={i}
              type="button"
              className={`${styles.card} ${playable ? styles.playable : ''}`}
              style={{ background: card.color ? COLOR_HEX[card.color] : 'var(--panel-3)' }}
              onClick={() => playerPlay(i)}
              disabled={!playable}
            >
              {cardLabel(card)}
            </button>
          );
        })}
      </div>

      <button type="button" className="btn btn-primary" onClick={reset}>New game</button>
    </div>
  );
}
