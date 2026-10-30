import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { SnakeBoard, COLS, ROWS, CELL } from './Snake.jsx';
import styles from './Snake.module.css';

const POLL_MS = 3000;
// A fixed, shared pace/duration for both racers — fairness matters here
// since this is a score comparison, not freeform play like solo Snake,
// so difficulty isn't left selectable the way it is there.
const TICK_MS = 100;
const TIME_LIMIT_MS = 45000;

/** Snake against another member — not turn-based (there's nothing to
 *  alternate), so this is an async score race: each person plays one timed
 *  run independently via the same SnakeBoard engine solo Snake uses, then
 *  submits their final score through POST /game-sessions/:id/submit. The
 *  server holds both scores and picks the winner once it has both (see
 *  ASYNC_GAME_TYPES/asyncWinner in gameSessions.js) — this component never
 *  computes or submits a winner itself. */
export function OnlineSnake({ sessionId, meId, onExit }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [liveScore, setLiveScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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
        <p className={styles.scoreRow}>{error}</p>
        <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
      </div>
    );
  }
  if (!session) return <p className={styles.scoreRow}>Loading…</p>;

  const isPlayer1 = session.player1_id === meId;
  const opponentId = isPlayer1 ? session.player2_id : session.player1_id;
  const results = session.state.results || {};
  const myResult = results[meId];
  const oppResult = results[opponentId];

  function handleOver(finalScore) {
    setPlaying(false);
    setSubmitting(true);
    apiFetch(`/game-sessions/${encodeURIComponent(sessionId)}/submit`, { method: 'POST', body: { result: { score: finalScore } } })
      .then(setSession)
      .catch((err) => alert(err.message || 'Could not submit your score.'))
      .finally(() => setSubmitting(false));
  }

  if (session.status === 'finished') {
    const myScore = myResult ? myResult.score : 0;
    const oppScore = oppResult ? oppResult.score : 0;
    const resultText = session.winner === 'draw'
      ? "It's a tie!"
      : (session.winner === (isPlayer1 ? 'player1' : 'player2') ? 'You win!' : 'You lose.');
    return (
      <div className={styles.wrap}>
        <p className={styles.scoreRow}><strong>{resultText}</strong></p>
        <div className={styles.scoreRow}>
          <span>You: <strong>{myScore}</strong></span>
          <span>Opponent: <strong>{oppScore}</strong></span>
        </div>
        <button type="button" className="btn btn-primary" onClick={onExit}>Back to lobby</button>
      </div>
    );
  }

  if (myResult) {
    return (
      <div className={styles.wrap}>
        <p className={styles.scoreRow}>Your score: <strong>{myResult.score}</strong></p>
        <p className={styles.scoreRow}>Waiting for your opponent to finish their run…</p>
        <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.scoreRow}>
        <span>Score: <strong>{liveScore}</strong></span>
        {timeLeft != null && <span>Time: <strong>{timeLeft}s</strong></span>}
      </div>
      <div className={styles.boardWrap}>
        {playing ? (
          <SnakeBoard tickMs={TICK_MS} timeLimitMs={TIME_LIMIT_MS} onScore={setLiveScore} onTime={setTimeLeft} onOver={handleOver} />
        ) : (
          <>
            <canvas width={COLS * CELL} height={ROWS * CELL} className={styles.canvas} />
            <div className={styles.overlay}>
              <p>{submitting ? 'Submitting your score…' : `${TIME_LIMIT_MS / 1000}s run — arrow keys / WASD to move. Highest score wins.`}</p>
              {!submitting && (
                <button type="button" className="btn btn-primary" onClick={() => { setLiveScore(0); setPlaying(true); }}>Start your run</button>
              )}
            </div>
          </>
        )}
      </div>
      <button type="button" className="btn" onClick={onExit}>Back to lobby</button>
    </div>
  );
}
