import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { supabase } from '../config/supabase.js';
import { asyncHandler, ApiError } from '../utils/http.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
const BUCKET = 'documents';
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
});

// multer reports its own errors (e.g. file-too-large) by calling next(err)
// directly, bypassing asyncHandler — translate the common case into the
// same ApiError shape everything else here uses.
function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(400, `File too large — max ${MAX_FILE_BYTES / (1024 * 1024)}MB`));
    }
    next(err);
  });
}

// Every document route requires a signed-in member; admin-only actions
// (upload, delete) additionally apply requireAdmin below.
router.use(requireAuth);

/** GET /api/documents — list every document, newest first. Any member. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, file_name, file_size, mime_type, uploaded_by, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  })
);

/**
 * POST /api/documents — upload a new document. Admin only.
 * multipart/form-data: `file` (required), `title` (optional, defaults to
 * the file's own name).
 */
router.post(
  '/',
  requireAdmin,
  handleUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'A file is required');
    const title = (req.body.title || '').trim() || req.file.originalname;

    const storagePath = `${crypto.randomUUID()}-${req.file.originalname}`.replace(/\s+/g, '_');
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream',
      });
    if (uploadErr) throw uploadErr;

    const { data, error: insertErr } = await supabase
      .from('documents')
      .insert({
        title,
        file_name: req.file.originalname,
        storage_path: storagePath,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        uploaded_by: req.user.sub,
      })
      .select('id, title, file_name, file_size, mime_type, uploaded_by, created_at')
      .single();
    if (insertErr) {
      // Don't leave an orphaned object in storage if the DB row failed.
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw insertErr;
    }

    res.status(201).json(data);
  })
);

async function findDocOrThrow(id) {
  const { data: doc, error } = await supabase
    .from('documents')
    .select('storage_path, file_name')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!doc) throw new ApiError(404, 'Document not found');
  return doc;
}

/**
 * GET /api/documents/:id/download — a short-lived signed URL that forces a
 * save-to-disk (Content-Disposition: attachment). Any member.
 */
router.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const doc = await findDocOrThrow(req.params.id);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
    if (error) throw error;
    res.json({ url: data.signedUrl, file_name: doc.file_name });
  })
);

/**
 * GET /api/documents/:id/view — a short-lived signed URL with no download
 * disposition, so the browser renders it inline (PDF/image) when it can
 * instead of always saving to disk. Any member.
 */
router.get(
  '/:id/view',
  asyncHandler(async (req, res) => {
    const doc = await findDocOrThrow(req.params.id);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60);
    if (error) throw error;
    res.json({ url: data.signedUrl, file_name: doc.file_name });
  })
);

/** DELETE /api/documents/:id — admin only. */
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { data: doc, error: findErr } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!doc) throw new ApiError(404, 'Document not found');

    const { error: removeErr } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    if (removeErr) throw removeErr;

    const { error } = await supabase.from('documents').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  })
);

export default router;
