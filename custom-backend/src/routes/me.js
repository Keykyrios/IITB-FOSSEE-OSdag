import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /me — returns the current user's profile.
// Identity comes from the JWT only; there's no param to swap, so IDOR isn't possible.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, full_name, display_name, bio, role, created_at
       FROM users WHERE id = $1`,
      [req.userId]
    );

    if (rows.length === 0) {
      // This shouldn't happen unless the user was deleted after the JWT
      // was issued. Treat it the same as an invalid token.
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const u = rows[0];
    res.json({
      id: u.id,
      email: u.email,
      profile: {
        fullName: u.full_name,
        displayName: u.display_name,
        bio: u.bio,
        createdAt: u.created_at,
        role: u.role,
      },
    });
  } catch (err) {
    console.error('GET /me:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
