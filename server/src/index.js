import express from 'express';
import cors from 'cors';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The client is now a Vite-built React SPA; CLIENT_DIR points at its build
// output, not the source tree.
const CLIENT_DIR = path.resolve(__dirname, '../../client/dist');

const app = express();

// ── Core middleware ─────────────────────────────────────────
const allowedOrigins = config.frontendUrl
  ? config.frontendUrl.split(',').map((s) => s.trim())
  : true; // dev: reflect any origin
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));

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
