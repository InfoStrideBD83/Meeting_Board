import { useEffect, useRef, useState } from 'react';
import styles from './MemoryMatch.module.css';

const ICONS = ['🎯', '🚀', '🎲', '🧩', '🔔', '💡', '🎧', '⭐'];
const FLIP_BACK_MS = 850;
const COMPUTER_MOVE_MS = 700;

function shuffledDeck() {
  const deck = ICONS.flatMap((icon, i) => [{ id: i * 2, icon }, { id: i * 2 + 1, icon }]);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.map((card, index) => ({ ...card, index, matched: false }));
}

/** Memory Match, you vs the computer, turn-based: flip two cards, a match
 *  keeps your turn and scores a point, a miss passes the turn. The
 *  computer plays with real (if imperfect) memory — it recalls every card
 *  it has personally seen flipped during the game, same as a human
 *  opponent would, no at seeing the whole board. */
export function MemoryMatch() {
  const [cards, setCards] = useState(shuffledDeck);
  const [flipped, setFlipped] = useState([]);
  const [turn, setTurn] = useState('player');
  const [scores, setScores] = useState({ player: 0, computer: 0 });
  const [busy, setBusy] = useState(false);
  const memoryRef = useRef(new Map()); // index -> icon, only for cards the computer has actually seen

  const totalPairs = ICONS.length;
  const done = scores.player + scores.computer === totalPairs;

  function reset() {
    setCards(shuffledDeck());
    setFlipped([]);
    setTurn('player');
    setScores({ player: 0, computer: 0 });
    setBusy(false);
    memoryRef.current = new Map();
  }

  function resolvePair(a, b, sideScoring) {
    const match = cards[a].icon === cards[b].icon;
    setTimeout(() => {
      setCards((prev) => prev.map((c, i) => (i === a || i === b ? { ...c, matched: c.matched || match } : c)));
      setFlipped([]);
      if (match) {
        setScores((s) => ({ ...s, [sideScoring]: s[sideScoring] + 1 }));
        setTurn(sideScoring); // same side goes again
      } else {
        setTurn(sideScoring === 'player' ? 'computer' : 'player');
      }
      setBusy(false);
    }, match ? 350 : FLIP_BACK_MS);
  }

  function flip(index) {
    if (busy || turn !== 'player' || cards[index].matched || flipped.includes(index) || flipped.length === 2) return;
    memoryRef.current.set(index, cards[index].icon);
    const next = [...flipped, index];
    setFlipped(next);
    if (next.length === 2) {
      setBusy(true);
      resolvePair(next[0], next[1], 'player');
    }
  }

  // Computer's turn: pick two cards from memory if a known pair exists,
  // otherwise one known card + one blind guess, otherwise two blind guesses.
  useEffect(() => {
    if (turn !== 'computer' || busy || done) return undefined;
    setBusy(true);
    const t = setTimeout(() => {
      const available = cards.map((c, i) => i).filter((i) => !cards[i].matched);
      const known = available.filter((i) => memoryRef.current.has(i));

      let a; let b;
      const knownPair = known.find((i) => known.some((j) => j !== i && cards[i].icon === cards[j].icon));
      if (knownPair !== undefined) {
        a = knownPair;
        b = known.find((j) => j !== a && cards[j].icon === cards[a].icon);
      } else if (known.length > 0) {
        a = known[Math.floor(Math.random() * known.length)];
        const rest = available.filter((i) => i !== a);
        b = rest[Math.floor(Math.random() * rest.length)];
      } else {
        a = available[Math.floor(Math.random() * available.length)];
        const rest = available.filter((i) => i !== a);
        b = rest[Math.floor(Math.random() * rest.length)];
      }

      memoryRef.current.set(a, cards[a].icon);
      memoryRef.current.set(b, cards[b].icon);
      setFlipped([a, b]);
      resolvePair(a, b, 'computer');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, COMPUTER_MOVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, busy, done]);

  const winner = done ? (scores.player > scores.computer ? 'You win!' : scores.player < scores.computer ? 'Computer wins.' : "It's a tie.") : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.scoreRow}>
        <span className={turn === 'player' && !done ? styles.activeSide : ''}>You: <strong>{scores.player}</strong></span>
        <span className={styles.vs}>vs</span>
        <span className={turn === 'computer' && !done ? styles.activeSide : ''}>Computer: <strong>{scores.computer}</strong></span>
      </div>
      {winner ? (
        <p className={styles.status}>{winner}</p>
      ) : (
        <p className={styles.status}>{turn === 'player' ? 'Your turn — flip two cards.' : 'Computer is thinking…'}</p>
      )}
      <div className={styles.grid}>
        {cards.map((c, i) => {
          const shown = c.matched || flipped.includes(i);
          return (
            <button
              key={c.id}
              type="button"
              className={`${styles.card} ${shown ? styles.flipped : ''} ${c.matched ? styles.matched : ''}`}
              onClick={() => flip(i)}
              disabled={busy || turn !== 'player' || c.matched}
              aria-label={shown ? c.icon : 'Hidden card'}
            >
              <span className={styles.cardFace}>{shown ? c.icon : ''}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn btn-primary" onClick={reset}>New game</button>
    </div>
  );
}
