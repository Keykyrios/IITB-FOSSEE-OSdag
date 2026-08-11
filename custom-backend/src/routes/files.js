import { Router } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = resolve(join(__dirname, '..', '..', 'uploads'));

const router = Router();

// GET /files - list the authenticated user's files
router.get('/files', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, owner_id AS "ownerId", file_name AS "fileName",
              mime_type AS "mimeType", size_bytes AS "sizeBytes",
              uploaded_at AS "uploadedAt"
       FROM files
       WHERE owner_id = $1
       ORDER BY uploaded_at`,
      [req.userId]
    );

    res.json({ files: rows });
  } catch (err) {
    console.error('GET /files failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /files/:id - single file metadata.
// Returns 403 (not 404) for another user's file - the task spec explicitly
// asks for this distinction even though production apps often hide it.
router.get('/files/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, owner_id AS "ownerId", file_name AS "fileName",
              mime_type AS "mimeType", size_bytes AS "sizeBytes",
              uploaded_at AS "uploadedAt"
       FROM files WHERE id = $1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = rows[0];
    if (file.ownerId !== req.userId) {
      return res.status(403).json({ error: 'You do not have access to this file' });
    }

    res.json({ file });
  } catch (err) {
    console.error('GET /files/:id failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /files/:id/download - stream the actual file bytes
router.get('/files/:id/download', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT owner_id, file_name, mime_type, disk_path FROM files WHERE id = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).send('File not found');
    }

    const file = rows[0];
    if (file.owner_id !== req.userId) {
      return res.status(403).send('Forbidden');
    }

    const fullPath = resolve(join(uploadsDir, file.disk_path));

    // Guard against path traversal - the resolved path must stay inside
    // the uploads directory. disk_path comes from our seed script (not
    // user input), but defence in depth is cheap.
    if (!fullPath.startsWith(uploadsDir)) {
      return res.status(403).send('Forbidden');
    }

    if (!existsSync(fullPath)) {
      return res.status(404).send('File not found on disk');
    }

    res.setHeader('Content-Type', file.mime_type);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.file_name.replace(/"/g, '\\"')}"`
    );
    createReadStream(fullPath).pipe(res);
  } catch (err) {
    console.error('GET /files/:id/download failed:', err.message);
    res.status(500).send('Internal server error');
  }
});

export default router;
