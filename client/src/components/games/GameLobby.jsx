import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Avatar } from '../Avatar.jsx';
import { OnlineTicTacToe } from './OnlineTicTacToe.jsx';
import { OnlineMemoryMatch } from './OnlineMemoryMatch.jsx';
import { OnlineChess } from './OnlineChess.jsx';
import { OnlineLudo } from './OnlineLudo.jsx';
import styles from './GameLobby.module.css';

const POLL_MS = 4000;

const ONLINE_GAMES = {
  tictactoe: { label: 'Tic-Tac-Toe', Component: OnlineTicTacToe },
  memory: { label: 'Memory Match', Component: OnlineMemoryMatch },
  chess: { label: 'Chess', Component: OnlineChess },
  ludo: { label: 'Ludo', Component: OnlineLudo },
};

/** The entry point for playing a teammate instead of the computer —
 *  incoming challenges to accept/decline, games already in progress, and
 *  a list of teammates to challenge with whichever game is selected. */
export function GameLobby() {
  const { member } = useAuth();
  const [members, setMembers] = useState([]);
  const [sessions, setSessions] = useState([]);
  // The full session object, not just its id — set directly from whatever
  // API response opened it (create/accept/resume), so rendering the right
  // Online* component never depends on the next poll having caught up.
  const [openSession, setOpenSession] = useState(null);
  const [busyWith, setBusyWith] = useState(null);
  const [gameType, setGameType] = useState('tictactoe');

  const refresh = useCallback(() => {
    apiFetch('/game-sessions').then(setSessions).catch(() => { /* transient — next poll retries */ });
  }, []);

  useEffect(() => { apiFetch('/members').then(setMembers).catch(() => {}); }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  function challenge(opponentId) {
    setBusyWith(opponentId);
    apiFetch('/game-sessions', { method: 'POST', body: { opponent_id: opponentId, game_type: gameType } })
      .then((s) => { refresh(); setOpenSession(s); })
      .catch((err) => alert(err.message || 'Could not send that challenge.'))
      .finally(() => setBusyWith(null));
  }

  function respond(session, accept) {
    apiFetch(`/game-sessions/${encodeURIComponent(session.id)}/${accept ? 'accept' : 'decline'}`, { method: 'POST' })
      .then((s) => { refresh(); if (accept) setOpenSession(s); })
      .catch((err) => alert(err.message || 'Could not respond to this challenge.'));
  }

  if (openSession) {
    const Online = ONLINE_GAMES[openSession.game_type].Component;
    return <Online sessionId={openSession.id} meId={member.id} onExit={() => { setOpenSession(null); refresh(); }} />;
  }

  function nameOf(id) { const m = members.find((x) => x.id === id); return m ? m.name : 'Unknown'; }

  const incoming = sessions.filter((s) => s.status === 'pending' && s.player2_id === member.id);
  const outgoing = sessions.filter((s) => s.status === 'pending' && s.player1_id === member.id);
  const active = sessions.filter((s) => s.status === 'active');
  const others = members.filter((m) => m.id !== member.id);

  return (
    <div className={styles.wrap}>
      {incoming.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Challenges for you</div>
          {incoming.map((s) => (
            <div key={s.id} className={styles.row}>
              <span>{nameOf(s.player1_id)} — {ONLINE_GAMES[s.game_type].label}</span>
              <div className={styles.rowActions}>
                <button type="button" className="btn btn-primary" onClick={() => respond(s, true)}>Accept</button>
                <button type="button" className="btn" onClick={() => respond(s, false)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {active.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>In progress</div>
          {active.map((s) => {
            const oppId = s.player1_id === member.id ? s.player2_id : s.player1_id;
            const myTurn = s.turn === member.id;
            return (
              <button key={s.id} type="button" className={styles.activeRow} onClick={() => setOpenSession(s)}>
                <span>{ONLINE_GAMES[s.game_type].label} vs {nameOf(oppId)}</span>
                <span className={myTurn ? styles.yourTurn : styles.theirTurn}>{myTurn ? 'Your turn' : 'Their turn'}</span>
              </button>
            );
          })}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Waiting on them</div>
          {outgoing.map((s) => (
            <div key={s.id} className={styles.row}>
              <span>{ONLINE_GAMES[s.game_type].label} vs {nameOf(s.player2_id)}</span>
              <span className={styles.theirTurn}>Waiting…</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Challenge a teammate</div>
        <div className={styles.gameTypeRow} role="group" aria-label="Game">
          {Object.entries(ONLINE_GAMES).map(([key, g]) => (
            <button key={key} type="button" className={styles.gameTypeBtn} aria-pressed={gameType === key} onClick={() => setGameType(key)}>{g.label}</button>
          ))}
        </div>
        {others.length === 0 ? (
          <p className={styles.empty}>No other team members yet.</p>
        ) : others.map((m) => (
          <button key={m.id} type="button" className={styles.memberRow} disabled={busyWith === m.id} onClick={() => challenge(m.id)}>
            <Avatar name={m.name} color={m.color} size={28} />
            <span>{m.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
