import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { TicTacToe } from './games/TicTacToe.jsx';
import { Snake } from './games/Snake.jsx';
import { MemoryMatch } from './games/MemoryMatch.jsx';
import { Ludo } from './games/Ludo.jsx';
import { Uno } from './games/Uno.jsx';
import { Chess } from './games/Chess.jsx';
import { Sudoku } from './games/Sudoku.jsx';
import { GameLobby } from './games/GameLobby.jsx';
import styles from './GamesWidget.module.css';

const GAMES = [
  { key: 'tictactoe', name: 'Tic-Tac-Toe', sub: 'vs Computer', Component: TicTacToe, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /></svg>
  ) },
  { key: 'snake', name: 'Snake', sub: 'Classic arcade', Component: Snake, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v10a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3v-3" /><circle cx="19" cy="7" r="1.5" fill="currentColor" stroke="none" /></svg>
  ) },
  { key: 'memory', name: 'Memory Match', sub: 'vs Computer', Component: MemoryMatch, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="8" height="8" rx="1.5" /><rect x="13" y="4" width="8" height="8" rx="1.5" /><rect x="3" y="14" width="8" height="8" rx="1.5" /><rect x="13" y="14" width="8" height="8" rx="1.5" /></svg>
  ) },
  { key: 'ludo', name: 'Ludo', sub: 'vs Computer', Component: Ludo, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.4" /><circle cx="18" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="18" r="2.4" /></svg>
  ) },
  { key: 'uno', name: 'UNO', sub: 'vs Computer', Component: Uno, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="3" transform="rotate(-8 12 12)" /><circle cx="12" cy="12" r="3.2" /></svg>
  ) },
  { key: 'chess', name: 'Chess', sub: 'vs Computer', Component: Chess, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21h6M8 21l1-5h6l1 5M9.5 16c-1-2 1-3 1-5 0-1-.8-1.5-.8-2.7A2.3 2.3 0 0 1 12 6a2.3 2.3 0 0 1 2.3 2.3c0 1.2-.8 1.7-.8 2.7 0 2 2 3 1 5Z" /><path d="M10 6V3.5M14 6V3.5M9 4.5h2M13 4.5h2" /></svg>
  ) },
  { key: 'sudoku', name: 'Sudoku', sub: 'Solo puzzle', Component: Sudoku, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><circle cx="6" cy="6" r=".9" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none" /><circle cx="18" cy="18" r=".9" fill="currentColor" stroke="none" /></svg>
  ) },
  { key: 'online', name: 'Play a Teammate', sub: '4 games', Component: GameLobby, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3.2" /><circle cx="17" cy="9" r="2.6" /><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="M13.8 14.3A4 4 0 0 1 20.5 17.2V20" /></svg>
  ) },
];

const ico = {
  dice: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9h12a4 4 0 0 1 4 4v3a3 3 0 0 1-3 3c-1 0-1.6-.5-2.3-1.3L15.5 16h-7l-1.2 1.7C6.6 18.5 6 19 5 19a3 3 0 0 1-3-3v-3a4 4 0 0 1 4-4Z" /><line x1="9" y1="11.3" x2="9" y2="14.3" /><line x1="7.5" y1="12.8" x2="10.5" y2="12.8" /><circle cx="16" cy="12" r=".9" fill="currentColor" stroke="none" /><circle cx="18.2" cy="14" r=".9" fill="currentColor" stroke="none" /></svg>,
  back: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  close: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
};

/** A floating arcade — pick a game from the grid, play it inline, go back
 *  to pick another. Each game is a standalone component; this widget is
 *  just the launcher chrome around them. Every game except Snake is
 *  played against a computer opponent; Snake stays solo since there's no
 *  natural "vs PC" shape for a single-player arcade game. */
export function GamesWidget() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState(null);

  if (!isAuthenticated) return null;

  const active = GAMES.find((g) => g.key === activeKey);

  function closePanel() {
    setOpen(false);
    setActiveKey(null);
  }

  return (
    <>
      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close games' : 'Open games'}
        title="Games"
      >
        {ico.dice}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Games">
          <div className={styles.panelHead}>
            {active ? (
              <button type="button" className={styles.iconBtn} onClick={() => setActiveKey(null)} aria-label="Back to game list">{ico.back}</button>
            ) : <span />}
            <div className={styles.panelTitle}>{active ? active.name : 'Games'}</div>
            <button type="button" className={styles.iconBtn} onClick={closePanel} aria-label="Close games">{ico.close}</button>
          </div>

          <div className={styles.body}>
            {active ? (
              <active.Component />
            ) : (
              <div className={styles.grid}>
                {GAMES.map((g) => (
                  <button key={g.key} type="button" className={styles.tile} onClick={() => setActiveKey(g.key)}>
                    <span className={styles.tileIcon}>{g.icon}</span>
                    <span className={styles.tileName}>{g.name}</span>
                    <span className={styles.tileSub}>{g.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
