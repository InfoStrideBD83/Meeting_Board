import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config/env.js';
import { notFound, errorHandler } from './middleware/errors.js';

import authRoutes from './routes/auth.js';
import memberRoutes from './routes/members.js';
import meetingRoutes from './routes/meetings.js';
import pendingRequestRoutes from './routes/pendingRequests.js';
import topicRoutes from './routes/topics.js';
import allotmentRoutes from './routes/allotments.js';
import misEntryRoutes from './routes/misEntries.js';
import assignmentRoutes from './routes/assignments.js';
import documentRoutes from './routes/documents.js';
import conversationRoutes from './routes/conversations.js';
import gameSessionRoutes from './routes/gameSessions.js';
import presenceRoutes from './routes/presence.js';
import raceLobbyRoutes from './routes/raceLobbies.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The client is now a Vite-built React SPA; CLIENT_DIR points at its build
// output, not the source tree.
const CLIENT_DIR = path.resolve(__dirname, '../../client/dist');

const app = express();

// This app runs on Render behind Render's own reverse proxy (Cloudflare sits
// in front of that, but as a CDN/edge layer, not an additional proxy hop
// Express needs to account for) — exactly one hop, so `req.ip` resolves to
// the real client instead of the proxy's own address. Trusting an unbounded
// number of hops (`true`) would let a client forge its own X-Forwarded-For
// and spoof any IP, defeating the IP-keyed rate limits below and in auth.js.
app.set('trust proxy', 1);

// ── Core middleware ─────────────────────────────────────────
// The Supabase project's own domain — used both for the client's normal
// HTTPS calls and, as of the live-race-positions feature, a direct
// Realtime WebSocket from the browser (connect-src gates both schemes).
const SUPABASE_HOST = 'ydoztszhszzgzmnpvyye.supabase.co';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // No inline/external scripts anywhere in this app beyond Vite's own
      // built, src-based module entry — no 'unsafe-inline', no eval.
      scriptSrc: ["'self'"],
      // Every component in this app sets inline `style={{...}}` (React's
      // normal way of doing dynamic styling) — there's no reasonable way
      // to avoid 'unsafe-inline' here without an unrelated rewrite of the
      // whole UI layer, so it's accepted rather than fought. Google Fonts'
      // stylesheet (client/index.html) is the one external style host.
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: [
        "'self'",
        'https://api.open-meteo.com', // WeatherWidget.jsx — current conditions
        'https://geocoding-api.open-meteo.com', // SettingsModal.jsx — city search
        'https://api.bigdatacloud.net', // WeatherWidget.jsx — reverse geocode for place name
        `https://${SUPABASE_HOST}`,
        `wss://${SUPABASE_HOST}`, // supabaseRealtime.js — live race-car position broadcasts
      ],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"], // matches helmet's own X-Frame-Options: SAMEORIGIN default
    },
  },
}));

const allowedOrigins = config.frontendUrl
  ? config.frontendUrl.split(',').map((s) => s.trim())
  : true; // dev: reflect any origin
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// A generous baseline abuse/DoS backstop across the whole API, separate
// from (and in addition to) auth.js's much stricter login/signup/reset
// limiter. Sized well above this app's own normal traffic — several
// features poll every ~2-4s (game sessions, race lobbies, presence,
// conversations), which on its own is ~15-30 req/min per active tab.
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
}));

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: config.nodeEnv, time: new Date().toISOString() });
});

// ── API routes ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/pending-requests', pendingRequestRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/allotments', allotmentRoutes);
app.use('/api/mis-entries', misEntryRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/game-sessions', gameSessionRoutes);
app.use('/api/presence', presenceRoutes);
app.use('/api/race-lobbies', raceLobbyRoutes);

// ── Static frontend (serves the built React SPA) ────────────
app.use(express.static(CLIENT_DIR));

// ── 404 + error handling ────────────────────────────────────
// JSON 404 for unmatched /api/* paths.
app.use('/api', notFound);

// SPA fallback — any other GET (e.g. a hard refresh on /meetings) gets
// index.html so React Router can render the right route client-side.
app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIR, 'index.html')));

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`\n  Meeting Board API → http://localhost:${config.port}`);
  console.log(`  Health check      → http://localhost:${config.port}/api/health`);
  console.log(`  Serving frontend  ← ${CLIENT_DIR}\n`);
});
