import { useEffect, useMemo, useState } from 'react';
import styles from './Sudoku.module.css';

const DIFFICULTIES = { easy: { label: 'Easy', blanks: 36 }, medium: { label: 'Medium', blanks: 46 }, hard: { label: 'Hard', blanks: 54 } };

function emptyGrid() { return Array.from({ length: 9 }, () => Array(9).fill(0)); }

function isSafe(grid, row, col, num) {
  for (let i = 0; i < 9; i++) { if (grid[row][i] === num || grid[i][col] === num) return false; }
  const br = row - (row % 3); const bc = col - (col % 3);
  for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) { if (grid[br + r][bc + c] === num) return false; } }
  return true;
}

function shuffledDigits() {
  const d = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

/** Fills `grid` in place via randomized backtracking — always produces a
 *  complete, valid solved board, fast (9x9 backtracking with randomized
 *  candidate order finishes in milliseconds). */
function fillGrid(grid) {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] === 0) {
        for (const num of shuffledDigits()) {
          if (isSafe(grid, row, col, num)) {
            grid[row][col] = num;
            if (fillGrid(grid)) return true;
            grid[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

/** Generates a puzzle by solving a fresh grid, then blanking random cells.
 *  Doesn't guarantee the remaining puzzle has only one solution — a
 *  known, common simplification for a casual puzzle generator — so the
 *  win check verifies "fully filled with no rule conflicts" rather than
 *  matching one specific stored solution, which is correct either way. */
function makePuzzle(blanks) {
  const solved = emptyGrid();
  fillGrid(solved);
  const puzzle = solved.map((row) => row.slice());
  const cells = [];
  for (let r = 0; r < 9; r++) { for (let c = 0; c < 9; c++) cells.push([r, c]); }
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  for (let i = 0; i < blanks; i++) { const [r, c] = cells[i]; puzzle[r][c] = 0; }
  return puzzle;
}

function findConflicts(grid) {
  const bad = new Set();
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = grid[r][c];
      if (!v) continue;
      for (let i = 0; i < 9; i++) {
        if (i !== c && grid[r][i] === v) bad.add(`${r}-${c}`);
        if (i !== r && grid[i][c] === v) bad.add(`${r}-${c}`);
      }
      const br = r - (r % 3); const bc = c - (c % 3);
      for (let rr = 0; rr < 3; rr++) {
        for (let cc = 0; cc < 3; cc++) {
          const nr = br + rr; const nc = bc + cc;
          if ((nr !== r || nc !== c) && grid[nr][nc] === v) bad.add(`${r}-${c}`);
        }
      }
    }
  }
  return bad;
}

/** Classic Sudoku, solo — fill the grid with the on-screen pad or the
 *  keyboard. Conflicting entries highlight immediately; solved means
 *  fully filled with zero conflicts, not a match against one fixed
 *  answer key (see makePuzzle). */
export function Sudoku() {
  const [difficulty, setDifficulty] = useState('easy');
  const [given, setGiven] = useState(() => makePuzzle(DIFFICULTIES.easy.blanks));
  const [grid, setGrid] = useState(given);
  const [selected, setSelected] = useState(null);

  function newPuzzle(level) {
    const g = makePuzzle(DIFFICULTIES[level].blanks);
    setDifficulty(level);
    setGiven(g);
    setGrid(g);
    setSelected(null);
  }

  const conflicts = useMemo(() => findConflicts(grid), [grid]);
  const filled = grid.every((row) => row.every((v) => v !== 0));
  const solved = filled && conflicts.size === 0;

  function setCell(r, c, value) {
    if (given[r][c] !== 0 || solved) return;
    setGrid((g) => { const next = g.map((row) => row.slice()); next[r][c] = value; return next; });
  }

  useEffect(() => {
    function onKey(e) {
      if (!selected) return;
      const [r, c] = selected;
      if (e.key >= '1' && e.key <= '9') setCell(r, c, Number(e.key));
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') setCell(r, c, 0);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, given, solved]);

  return (
    <div className={styles.wrap}>
      <div className={styles.difficultyRow} role="group" aria-label="Difficulty">
        {Object.entries(DIFFICULTIES).map(([key, d]) => (
          <button key={key} type="button" className={styles.diffBtn} aria-pressed={difficulty === key} onClick={() => newPuzzle(key)}>{d.label}</button>
        ))}
      </div>

      <p className={styles.status}>{solved ? 'Solved! 🎉' : 'Fill every row, column, and 3×3 box with 1–9.'}</p>

      <div className={styles.board}>
        {grid.map((rowArr, r) => rowArr.map((v, c) => {
          const isGiven = given[r][c] !== 0;
          const isSelected = selected && selected[0] === r && selected[1] === c;
          const isConflict = conflicts.has(`${r}-${c}`);
          return (
            <button
              key={`${r}-${c}`}
              type="button"
              className={[
                styles.cell,
                isGiven ? styles.given : styles.editable,
                isSelected ? styles.selected : '',
                isConflict ? styles.conflict : '',
                c % 3 === 2 && c !== 8 ? styles.borderRight : '',
                r % 3 === 2 && r !== 8 ? styles.borderBottom : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelected([r, c])}
            >
              {v !== 0 ? v : ''}
            </button>
          );
        }))}
      </div>

      <div className={styles.pad}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} type="button" className={styles.padBtn} onClick={() => selected && setCell(selected[0], selected[1], n)} disabled={!selected}>{n}</button>
        ))}
        <button type="button" className={styles.padBtn} onClick={() => selected && setCell(selected[0], selected[1], 0)} disabled={!selected}>Clear</button>
      </div>
    </div>
  );
}
