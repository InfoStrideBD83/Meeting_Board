import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Mirrors carDriftEngine.js's TRACKS ids — this server module is plain
// Node, not a browser bundle, so it can't import that client-only file
// (it builds canvas-drawing closures etc.), hence the small duplicated list.
const TRACK_IDS = ['oval', 'figure8', 'serpentine'];
const MODES = ['race', 'drift'];

async function loadLobby(id, userId) {
  const { data, error } = await supabase.from('race_lobbies').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Lobby not found');
  const inIt = data.participants.some((p) => p.member_id === userId);
  if (!inIt && data.status !== 'open') throw new ApiError(403, 'Not a participant in this lobby');
  return data;
}

/** GET /api/race-lobbies — open lobbies to browse, plus any lobby (any
 *  status) the current member is already in. Fetched in full and filtered
 *  here rather than with a jsonb-containment query, matching how this app
 *  already treats small collections elsewhere (e.g. /members, /meetings). */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = req.user.sub;
    const { data, error } = await supabase.from('race_lobbies').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    const visible = data.filter((l) => l.status === 'open' || l.participants.some((p) => p.member_id === me));
    res.json(visible);
  })
);

/** GET /api/race-lobbies/:id — polled by the waiting room and the
 *  scorecard view. */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await loadLobby(req.params.id, req.user.sub));
  })
);

/** POST /api/race-lobbies — create a lobby: { track, mode, max_players }.
 *  The creator auto-joins as the first (and host) participant. */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const me = req.user.sub;
    const track = req.body.track;
    const mode = req.body.mode || 'race';
    const maxPlayers = Math.max(2, Math.min(4, Number(req.body.max_players) || 4));
    if (!TRACK_IDS.includes(track)) throw new ApiError(400, `track must be one of: ${TRACK_IDS.join(', ')}`);
    if (!MODES.includes(mode)) throw new ApiError(400, `mode must be one of: ${MODES.join(', ')}`);

    const { data, error } = await supabase
      .from('race_lobbies')
      .insert({
        host_id: me,
        track,
        mode,
        max_players: maxPlayers,
        status: 'open',
        participants: [{ member_id: me, joined_at: new Date().toISOString() }],
        results: {},
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  })
);

/** POST /api/race-lobbies/:id/join */
router.post(
  '/:id/join',
  asyncHandler(async (req, res) => {
    const me = req.user.sub;
    const lobby = await loadLobby(req.params.id, me);
    if (lobby.status !== 'open') throw new ApiError(400, 'This lobby is no longer open');
    if (lobby.participants.some((p) => p.member_id === me)) throw new ApiError(400, "You're already in this lobby");
    if (lobby.participants.length >= lobby.max_players) throw new ApiError(400, 'This lobby is full');

    const participants = [...lobby.participants, { member_id: me, joined_at: new Date().toISOString() }];
    const { data, error } = await supabase
      .from('race_lobbies')
      .update({ participants, updated_at: new Date().toISOString() })
      .eq('id', lobby.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  })
);

/** POST /api/race-lobbies/:id/leave — if the host leaves, the next-earliest
 *  joiner is promoted; if no one's left, the lobby is deleted outright
 *  rather than left as an orphaned, unjoinable row. */
router.post(
  '/:id/leave',
  asyncHandler(async (req, res) => {
    const me = req.user.sub;
    const lobby = await loadLobby(req.params.id, me);
    if (lobby.status !== 'open') throw new ApiError(400, 'This lobby is no longer open');

    const participants = lobby.participants.filter((p) => p.member_id !== me);
    if (participants.length === 0) {
      const { error } = await supabase.from('race_lobbies').delete().eq('id', lobby.id);
      if (error) throw error;
      return res.status(204).end();
    }

    const hostId = lobby.host_id === me ? participants[0].member_id : lobby.host_id;
    const { data, error } = await supabase
      .from('race_lobbies')
      .update({ participants, host_id: hostId, updated_at: new Date().toISOString() })
      .eq('id', lobby.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  })
);

/** POST /api/race-lobbies/:id/start — host-only, needs at least 2 joined. */
router.post(
  '/:id/start',
  asyncHandler(async (req, res) => {
    const me = req.user.sub;
    const lobby = await loadLobby(req.params.id, me);
    if (lobby.host_id !== me) throw new ApiError(403, 'Only the host can start the race');
    if (lobby.status !== 'open') throw new ApiError(400, 'This lobby already started');
    if (lobby.participants.length < 2) throw new ApiError(400, 'Need at least 2 players to start');

    const { data, error } = await supabase
      .from('race_lobbies')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', lobby.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  })
);

/**
 * POST /api/race-lobbies/:id/submit — a participant submits their own run's
 * result once the lobby is active: { car, time, laps, driftScore, netScore }.
 * Once every current participant has a result, the lobby finishes and
 * rankings are computed here (not trusted from any client): Race Mode by
 * time ascending, Drift Mode by netScore descending (there's no time to
 * compare in freestyle Drift, so the clean-driving/drift-adjusted points
 * score is what decides it).
 */
router.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    const me = req.user.sub;
    const lobby = await loadLobby(req.params.id, me);
    if (lobby.status !== 'active') throw new ApiError(400, 'This lobby is not active');
    if (!lobby.participants.some((p) => p.member_id === me)) throw new ApiError(403, 'Not a participant in this lobby');

    const results = { ...lobby.results, [me]: req.body.result };
    const update = { results, updated_at: new Date().toISOString() };

    const allIn = lobby.participants.every((p) => results[p.member_id]);
    if (allIn) {
      update.status = 'finished';
      const ranked = lobby.participants
        .map((p) => ({ member_id: p.member_id, result: results[p.member_id] }))
        .sort((a, b) => (
          lobby.mode === 'drift'
            ? (b.result.netScore || 0) - (a.result.netScore || 0)
            : (a.result.time ?? Infinity) - (b.result.time ?? Infinity)
        ));
      update.winner = ranked[0].member_id;
    }

    const { data, error } = await supabase.from('race_lobbies').update(update).eq('id', lobby.id).select().single();
    if (error) throw error;
    res.json(data);
  })
);

export default router;
