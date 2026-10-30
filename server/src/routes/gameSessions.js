import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// initialState() is the one place a new game_type gets wired in.
const GAME_TYPES = ['tictactoe', 'memory', 'chess', 'ludo', 'carrom', 'snakesladders', 'snake', 'uno'];

// Most games here alternate moves via the generic PATCH below. A few have
// no turn order — each participant plays independently and submits their
// own result whenever they finish — so they go through /submit instead.
// Generic (not tied to one game) so any future independent-score game can
// reuse it by adding a comparator below.
const ASYNC_GAME_TYPES = ['snake'];
function asyncWinner(gameType, results) {
  const p1 = results.player1, p2 = results.player2;
  if (gameType === 'snake') {
    if (p1.score === p2.score) return 'draw';
    return p1.score > p2.score ? 'player1' : 'player2';
  }
  throw new ApiError(400, `No async winner comparator for ${gameType}`);
}

const MEMORY_ICONS = ['🎯', '🚀', '🎲', '🧩', '🔔', '💡', '🎧', '⭐'];

function shuffledMemoryDeck() {
  const deck = MEMORY_ICONS.flatMap((icon, i) => [{ id: i * 2, icon }, { id: i * 2 + 1, icon }]);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.map((card, index) => ({ ...card, index, matched: false }));
}

function initialChessBoard() {
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

// Mirrors client/src/components/games/Carrom.jsx's createEntities()/
// createCarromState('solo') exactly (coin ring layout, seat/owner/color
// assignment) — duplicated here rather than imported because that file
// also imports its own CSS module, which only resolves in the Vite build,
// not plain Node.
const CARROM_BOARD = 440, CARROM_MARGIN = 26, CARROM_COIN_R = 11, CARROM_STRIKER_R = 14, CARROM_RING_R = 46;
function initialCarromState() {
  const cx = CARROM_BOARD / 2, cy = CARROM_BOARD / 2;
  const entities = [{ id: 'striker', x: cx, y: CARROM_BOARD - CARROM_MARGIN - 20, vx: 0, vy: 0, r: CARROM_STRIKER_R, color: 'striker', pocketed: false }];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    entities.push({
      id: `c${i}`, x: cx + CARROM_RING_R * Math.cos(angle), y: cy + CARROM_RING_R * Math.sin(angle),
      vx: 0, vy: 0, r: CARROM_COIN_R, color: i % 2 === 0 ? 'light' : 'dark', pocketed: false,
    });
  }
  entities.push({ id: 'queen', x: cx, y: cy, vx: 0, vy: 0, r: CARROM_COIN_R, color: 'queen', pocketed: false });
  return {
    mode: 'solo', seats: ['bottom', 'top'], owners: ['player1', 'player2'],
    seatOwner: { bottom: 'player1', top: 'player2' },
    colors: { player1: 'light', player2: 'dark' },
    turnIdx: 0,
    scores: { player1: 0, player2: 0 },
    entities,
    phase: 'aim', winner: null, shotsTaken: 0, shotSnapshotPocketed: [], message: null,
  };
}

// Mirrors client/src/components/games/Uno.jsx's createUnoState('player1',
// 'player2') exactly (deck build/shuffle, 7-card deal each, a non-wild
// starter card) — duplicated for the same reason as Carrom's state above:
// that file also imports its own CSS module.
const UNO_COLORS = ['red', 'yellow', 'green', 'blue'];
function unoBuildDeck() {
  const deck = [];
  for (const color of UNO_COLORS) {
    deck.push({ color, value: '0' });
    for (let n = 1; n <= 9; n++) { deck.push({ color, value: String(n) }); deck.push({ color, value: String(n) }); }
    for (const v of ['skip', 'reverse', 'draw2']) { deck.push({ color, value: v }); deck.push({ color, value: v }); }
  }
  for (let i = 0; i < 4; i++) { deck.push({ color: null, value: 'wild' }); deck.push({ color: null, value: 'wild4' }); }
  return deck;
}
function unoShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function initialUnoState() {
  let deck = unoShuffle(unoBuildDeck());
  const player1Hand = deck.splice(0, 7);
  const player2Hand = deck.splice(0, 7);
  let starter;
  do { starter = deck.shift(); if (!starter) { deck = unoShuffle(unoBuildDeck()); starter = deck.shift(); } }
  while (starter.color === null);
  return {
    deck, discard: [starter], player1Hand, player2Hand,
    sides: ['player1', 'player2'],
    currentColor: starter.color, turn: 'player1',
    pendingWild: null, winner: null,
  };
}

function initialState(gameType) {
  if (gameType === 'tictactoe') return { board: Array(9).fill(null) };
  if (gameType === 'memory') return { cards: shuffledMemoryDeck(), flipped: [], scores: { player1: 0, player2: 0 } };
  if (gameType === 'chess') return { board: initialChessBoard() };
  if (gameType === 'ludo') return { tokens: { player1: [-1, -1, -1, -1], player2: [-1, -1, -1, -1] }, roll: null, sixStreak: 0 };
  if (gameType === 'carrom') return initialCarromState();
  if (gameType === 'snakesladders') return { positions: { player1: 0, player2: 0 } };
  if (gameType === 'snake') return { results: {} };
  if (gameType === 'uno') return initialUnoState();
  throw new ApiError(400, `Unsupported game_type: ${gameType}`);
}

async function loadSession(id, userId) {
  const { data, error } = await supabase.from('game_sessions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Game session not found');
  if (data.player1_id !== userId && data.player2_id !== userId) throw new ApiError(403, 'Not a participant in this game');
  return data;
}

/**
 * GET /api/game-sessions — every session the current member is part of
 * (as challenger or challenged), newest activity first. ?status= filters.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = req.user.sub;
    let query = supabase
      .from('game_sessions')
      .select('*')
      .or(`player1_id.eq.${me},player2_id.eq.${me}`)
      .order('updated_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  })
);

/** POST /api/game-sessions — challenge a teammate: { opponent_id, game_type } */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const me = req.user.sub;
    const opponentId = req.body.opponent_id;
    const gameType = req.body.game_type;
    if (!opponentId) throw new ApiError(400, 'opponent_id is required');
    if (opponentId === me) throw new ApiError(400, "You can't challenge yourself");
    if (!GAME_TYPES.includes(gameType)) throw new ApiError(400, `game_type must be one of: ${GAME_TYPES.join(', ')}`);

    const { data, error } = await supabase
      .from('game_sessions')
      .insert({ game_type: gameType, player1_id: me, player2_id: opponentId, status: 'pending', state: initialState(gameType) })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  })
);

/** POST /api/game-sessions/:id/accept — only the challenged player; starts the game, challenger moves first. */
router.post(
  '/:id/accept',
  asyncHandler(async (req, res) => {
    const me = req.user.sub;
    const session = await loadSession(req.params.id, me);
    if (session.player2_id !== me) throw new ApiError(403, 'Only the challenged player can accept');
    if (session.status !== 'pending') throw new ApiError(400, 'This challenge is no longer pending');

    const { data, error } = await supabase
      .from('game_sessions')
      .update({ status: 'active', turn: session.player1_id, updated_at: new Date().toISOString() })
      .eq('id', session.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  })
);

/** POST /api/game-sessions/:id/decline — only the challenged player. */
router.post(
  '/:id/decline',
  asyncHandler(async (req, res) => {
    const me = req.user.sub;
    const session = await loadSession(req.params.id, me);
    if (session.player2_id !== me) throw new ApiError(403, 'Only the challenged player can decline');

    const { data, error } = await supabase
      .from('game_sessions')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', session.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  })
);

/** GET /api/game-sessions/:id — polled by the client while a game is open. */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await loadSession(req.params.id, req.user.sub));
  })
);

/**
 * PATCH /api/game-sessions/:id — submit a move: { state, turn } to keep
 * playing, or { state, status: 'finished', winner } ('player1' | 'player2'
 * | 'draw') to end it. Trusts the client's own game-engine code for move
 * legality (the same code already used for the vs-computer mode) — this
 * only enforces who's allowed to write: a participant, and only on their
 * own turn. Not hardened against a modified client cheating; reasonable
 * for a casual internal team tool, not a scope this needed re-litigating
 * server-side per game.
 */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const me = req.user.sub;
    const session = await loadSession(req.params.id, me);
    if (ASYNC_GAME_TYPES.includes(session.game_type)) throw new ApiError(400, 'This game type uses /submit, not a turn-based move');
    if (session.status !== 'active') throw new ApiError(400, 'This game is not active');
    if (session.turn !== me) throw new ApiError(403, "It's not your turn");

    const update = { state: req.body.state, updated_at: new Date().toISOString() };
    if (req.body.status === 'finished') {
      update.status = 'finished';
      update.turn = null;
      update.winner = req.body.winner || null;
    } else {
      update.turn = req.body.turn;
    }

    const { data, error } = await supabase.from('game_sessions').update(update).eq('id', session.id).select().single();
    if (error) throw error;
    res.json(data);
  })
);

/**
 * POST /api/game-sessions/:id/submit — the async-game equivalent of PATCH,
 * for game types with no turn order (currently just 'snake'): each
 * participant submits their own result independently whenever they finish,
 * instead of alternating moves. The session finishes once both results are
 * in, with the winner computed here (not trusted from the client) via
 * asyncWinner(), since there's no per-move check anywhere else to anchor
 * that trust against for this kind of game.
 */
router.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    const me = req.user.sub;
    const session = await loadSession(req.params.id, me);
    if (!ASYNC_GAME_TYPES.includes(session.game_type)) throw new ApiError(400, 'This game type uses PATCH, not /submit');
    if (session.status !== 'active') throw new ApiError(400, 'This game is not active');

    const state = { ...session.state, results: { ...session.state.results, [me]: req.body.result } };
    const update = { state, updated_at: new Date().toISOString() };

    const opponentId = session.player1_id === me ? session.player2_id : session.player1_id;
    if (state.results[opponentId]) {
      update.status = 'finished';
      const byPlayer = {
        player1: state.results[session.player1_id],
        player2: state.results[session.player2_id],
      };
      update.winner = asyncWinner(session.game_type, byPlayer);
    }

    const { data, error } = await supabase.from('game_sessions').update(update).eq('id', session.id).select().single();
    if (error) throw error;
    res.json(data);
  })
);

export default router;
