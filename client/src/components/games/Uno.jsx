import { useEffect, useState } from 'react';
import styles from './Uno.module.css';

export const COLORS = ['red', 'yellow', 'green', 'blue'];
export const COLOR_HEX = { red: '#e8192c', yellow: '#f8c400', green: '#17a24a', blue: '#1070dd' };

export function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ color, value: '0' });
    for (let n = 1; n <= 9; n++) { deck.push({ color, value: String(n) }); deck.push({ color, value: String(n) }); }
    for (const v of ['skip', 'reverse', 'draw2']) { deck.push({ color, value: v }); deck.push({ color, value: v }); }
  }
  for (let i = 0; i < 4; i++) { deck.push({ color: null, value: 'wild' }); deck.push({ color: null, value: 'wild4' }); }
  return deck;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardLabel(card) {
  const names = { skip: 'Skip', reverse: 'Reverse', draw2: 'Draw Two', wild: 'Wild', wild4: 'Wild Draw Four' };
  return names[card.value] || card.value;
}

// The glyph shown large in the center and small (mirrored) in the corners —
// numbers render as-is, action cards get a symbol instead of a text label
// so they read at a glance the way a real UNO card does.
export function cardSymbol(card) {
  const symbols = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '✦', wild4: '+4' };
  return symbols[card.value] || card.value;
}

export function isPlayable(card, topCard, currentColor) {
  if (card.value === 'wild' || card.value === 'wild4') return true;
  return card.color === currentColor || card.value === topCard.value;
}

/** Generic 2-side starting state — `sideA`/`sideB` are the state keys for
 *  each player (solo play uses 'player'/'computer'; the online game uses
 *  'player1'/'player2'), so this one function backs both. Hands live at
 *  `${side}Hand` and `sides` records both keys so playCard()/drawCards()
 *  below never need to hardcode which two sides exist. */
export function createUnoState(sideA, sideB) {
  let deck = shuffle(buildDeck());
  const handA = deck.splice(0, 7);
  const handB = deck.splice(0, 7);
  let starter;
  do { starter = deck.shift(); if (!starter) { deck = shuffle(buildDeck()); starter = deck.shift(); } }
  while (starter.color === null);
  return {
    deck, discard: [starter],
    [`${sideA}Hand`]: handA, [`${sideB}Hand`]: handB,
    sides: [sideA, sideB],
    currentColor: starter.color, turn: sideA,
    pendingWild: null, winner: null,
  };
}

function freshGame() { return createUnoState('player', 'computer'); }

export function drawCards(state, side, count) {
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
  const handKey = `${side}Hand`;
  return { ...state, deck, discard, [handKey]: state[handKey].concat(drawn) };
}

export function playCard(state, side, cardIndex, chosenColor) {
  const handKey = `${side}Hand`;
  const hand = [...state[handKey]];
  const [card] = hand.splice(cardIndex, 1);
  const otherSide = state.sides.find((s) => s !== side);
  // pendingWild must always clear here — it's the only place a color choice
  // (real or computer-decided) actually resolves. Leaving it set after a
  // Wild/Wild+4 play previously soft-locked the player permanently: every
  // guard in playerPlay/playerDraw refuses to act while pendingWild isn't
  // null, and the color-picker overlay never went away either.
  let next = { ...state, [handKey]: hand, discard: [...state.discard, card], pendingWild: null };

  const resolvedColor = card.color || chosenColor;
  next.currentColor = resolvedColor;

  if (hand.length === 0) {
    return { ...next, winner: side, turn: side };
  }

  let sameSideAgain = false;
  if (card.value === 'skip' || card.value === 'reverse') sameSideAgain = true;
  if (card.value === 'draw2') { next = drawCards(next, otherSide, 2); sameSideAgain = true; }
  if (card.value === 'wild4') { next = drawCards(next, otherSide, 4); sameSideAgain = true; }

  next.turn = sameSideAgain ? side : otherSide;
  return next;
}

function computerChooseColor(hand) {
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
  hand.forEach((c) => { if (c.color) counts[c.color]++; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/** A single UNO card face — shared between the player's hand and the
 *  discard pile's top card, so both read identically. Wild/Wild+4 get the
 *  traditional black body with a small four-color corner swatch instead of
 *  one of the four play colors. */
export function CardFace({ card, size = 'hand' }) {
  const isWild = card.value === 'wild' || card.value === 'wild4';
  const bg = isWild ? '#1a1a1a' : COLOR_HEX[card.color];
  const symbol = cardSymbol(card);
  return (
    <span className={`${styles.cardFace} ${styles['size_' + size]}`} style={{ background: bg }}>
      {isWild && (
        <span className={styles.wildSwatch} aria-hidden="true">
          {COLORS.map((c) => <span key={c} style={{ background: COLOR_HEX[c] }} />)}
        </span>
      )}
      <span className={styles.cornerTL}>{symbol}</span>
      <span className={styles.center}>{symbol}</span>
      <span className={styles.cornerBR}>{symbol}</span>
    </span>
  );
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
    setState((s) => ({ ...drawCards(s, 'player', 1), turn: 'computer' }));
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
          return { ...drawn, turn: 'player' };
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
    // state.discard.length is included deliberately: when the computer
    // plays Skip/Reverse/Draw Two/Wild Draw Four it keeps its own turn, so
    // `state.turn` stays 'computer' across two consecutive computer moves
    // and never changes value — without also depending on something that
    // *does* change on every play (the discard pile growing), this effect
    // wouldn't re-run and the computer's bonus turn would never happen,
    // freezing the game with both sides unable to act.
  }, [state.turn, state.winner, state.discard.length]);

  const handSize = state.playerHand.length;
  const mid = (handSize - 1) / 2;
  const statusText = state.winner
    ? (state.winner === 'player' ? 'You win!' : 'Computer wins.')
    : (state.turn === 'player'
      ? (state.pendingWild !== null ? 'Choose a color.' : 'Your turn — play a card or draw.')
      : 'Computer is thinking…');

  return (
    <div className={styles.wrap}>
      <p className={styles.status}>{statusText}</p>

      <div className={styles.oppRow}>
        <span className={styles.handCount}>Computer: {state.computerHand.length} cards</span>
      </div>

      <div className={styles.table}>
        <button type="button" className={styles.drawPile} onClick={playerDraw} disabled={state.turn !== 'player' || Boolean(state.winner) || state.pendingWild !== null} title="Draw a card">
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
          const offset = i - mid;
          const rotate = offset * 3.5;
          const lift = -Math.abs(offset) * 2;
          return (
            <button
              key={i}
              type="button"
              className={`${styles.cardBtn} ${playable ? styles.playable : ''}`}
              style={{ zIndex: i, marginLeft: i === 0 ? 0 : -26, '--rot': `${rotate}deg`, '--lift': `${lift}px` }}
              onClick={() => playerPlay(i)}
              disabled={!playable}
              title={cardLabel(card)}
            >
              <CardFace card={card} />
            </button>
          );
        })}
      </div>

      <button type="button" className="btn btn-primary" onClick={reset}>New game</button>
    </div>
  );
}
