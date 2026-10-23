import { useEffect, useState } from 'react';
import styles from './Chess.module.css';

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const CHESS_GLYPH = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

export function initialBoard() {
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: back[c], color: 'b' };
    board[1][c] = { type: 'p', color: 'b' };
    board[6][c] = { type: 'p', color: 'w' };
    board[7][c] = { type: back[c], color: 'w' };
  }
  return board;
}

const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

/** Pseudo-legal moves for the piece at (r,c) — doesn't yet check whether
 *  the move would leave its own king in check. No castling, no en
 *  passant; pawns reaching the last rank are handled as auto-promotion
 *  by the caller, not here. */
function pseudoMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const { type, color } = piece;
  const empty = (rr, cc) => !board[rr][cc];
  const enemy = (rr, cc) => board[rr][cc] && board[rr][cc].color !== color;
  const moves = [];

  if (type === 'p') {
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    if (inBounds(r + dir, c) && empty(r + dir, c)) {
      moves.push([r + dir, c]);
      if (r === startRow && empty(r + 2 * dir, c)) moves.push([r + 2 * dir, c]);
    }
    for (const dc of [-1, 1]) {
      const rr = r + dir; const cc = c + dc;
      if (inBounds(rr, cc) && enemy(rr, cc)) moves.push([rr, cc]);
    }
  } else if (type === 'n') {
    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
      const rr = r + dr; const cc = c + dc;
      if (inBounds(rr, cc) && (empty(rr, cc) || enemy(rr, cc))) moves.push([rr, cc]);
    }
  } else if (type === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr; const cc = c + dc;
        if (inBounds(rr, cc) && (empty(rr, cc) || enemy(rr, cc))) moves.push([rr, cc]);
      }
    }
  } else {
    const dirs = [];
    if (type === 'b' || type === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (type === 'r' || type === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    for (const [dr, dc] of dirs) {
      let rr = r + dr; let cc = c + dc;
      while (inBounds(rr, cc)) {
        if (empty(rr, cc)) { moves.push([rr, cc]); } else { if (enemy(rr, cc)) moves.push([rr, cc]); break; }
        rr += dr; cc += dc;
      }
    }
  }
  return moves;
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] && board[r][c].type === 'k' && board[r][c].color === color) return [r, c];
    }
  }
  return null;
}

function isSquareAttacked(board, row, col, byColor) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === byColor && pseudoMoves(board, r, c).some(([mr, mc]) => mr === row && mc === col)) return true;
    }
  }
  return false;
}

export function isInCheck(board, color) {
  const king = findKing(board, color);
  return king ? isSquareAttacked(board, king[0], king[1], color === 'w' ? 'b' : 'w') : false;
}

export function applyMove(board, from, to) {
  const next = board.map((row) => row.slice());
  const piece = next[from[0]][from[1]];
  next[to[0]][to[1]] = (piece.type === 'p' && (to[0] === 0 || to[0] === 7)) ? { type: 'q', color: piece.color } : piece;
  next[from[0]][from[1]] = null;
  return next;
}

export function legalMovesFrom(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  return pseudoMoves(board, r, c).filter(([tr, tc]) => !isInCheck(applyMove(board, [r, c], [tr, tc]), piece.color));
}

export function allLegalMoves(board, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] && board[r][c].color === color) {
        for (const to of legalMovesFrom(board, r, c)) moves.push({ from: [r, c], to });
      }
    }
  }
  return moves;
}

function materialScore(board) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) score += (p.color === 'w' ? 1 : -1) * PIECE_VALUE[p.type];
    }
  }
  return score; // positive favors white (the player)
}

/** The computer (black) picks the move that's best two ply deep: its own
 *  move, then the player's best material-grabbing reply — real but
 *  intentionally shallow, a sound "spot the free piece, don't blunder
 *  into checkmate" opponent rather than a strong engine. */
function pickComputerMove(board) {
  const moves = allLegalMoves(board, 'b');
  if (moves.length === 0) return null;
  let best = moves[0];
  let bestScore = Infinity;
  for (const move of moves) {
    const next = applyMove(board, move.from, move.to);
    const replies = allLegalMoves(next, 'w');
    let score;
    if (replies.length === 0) {
      score = isInCheck(next, 'w') ? -9999 : 0; // checkmating the player is great; stalemating is neutral
    } else {
      score = Math.max(...replies.map((r) => materialScore(applyMove(next, r.from, r.to))));
    }
    if (score < bestScore) { bestScore = score; best = move; }
  }
  return best;
}

/** Simplified chess, you (white) vs the computer (black) — real legal-move
 *  generation including check/checkmate/stalemate, no castling or en
 *  passant, pawns auto-promote to queen. Click a piece, then a highlighted
 *  square to move it. */
export function Chess() {
  const [board, setBoard] = useState(initialBoard);
  const [turn, setTurn] = useState('w');
  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  // null while the game is ongoing; otherwise 'w' (checkmate, player wins),
  // 'b' (checkmate, computer wins), or 'draw' (stalemate).
  const [winner, setWinner] = useState(null);

  function reset() {
    setBoard(initialBoard());
    setTurn('w');
    setSelected(null);
    setLegalTargets([]);
    setWinner(null);
  }

  function afterMove(nextBoard, movedColor) {
    const nextTurn = movedColor === 'w' ? 'b' : 'w';
    setBoard(nextBoard);
    setTurn(nextTurn);
    setSelected(null);
    setLegalTargets([]);
    const nextMoves = allLegalMoves(nextBoard, nextTurn);
    if (nextMoves.length === 0) {
      setWinner(isInCheck(nextBoard, nextTurn) ? movedColor : 'draw');
    }
  }

  function clickSquare(r, c) {
    if (turn !== 'w' || winner) return;
    if (selected) {
      const isTarget = legalTargets.some(([tr, tc]) => tr === r && tc === c);
      if (isTarget) {
        afterMove(applyMove(board, selected, [r, c]), 'w');
        return;
      }
    }
    const piece = board[r][c];
    if (piece && piece.color === 'w') {
      setSelected([r, c]);
      setLegalTargets(legalMovesFrom(board, r, c));
    } else {
      setSelected(null);
      setLegalTargets([]);
    }
  }

  useEffect(() => {
    if (turn !== 'b' || winner) return undefined;
    const t = setTimeout(() => {
      const move = pickComputerMove(board);
      if (move) afterMove(applyMove(board, move.from, move.to), 'b');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, winner]);

  const statusText = winner === 'w' ? 'Checkmate — you win!'
    : winner === 'b' ? 'Checkmate — computer wins.'
      : winner === 'draw' ? 'Stalemate — draw.'
        : turn === 'w' ? (isInCheck(board, 'w') ? 'Check! Your move.' : 'Your move.')
          : (isInCheck(board, 'b') ? 'Check! Computer is thinking…' : 'Computer is thinking…');

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
      <button type="button" className="btn btn-primary" onClick={reset}>New game</button>
    </div>
  );
}
