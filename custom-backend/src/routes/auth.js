import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../utils/hash.js';
import { signToken } from '../utils/jwt.js';
import { pool } from '../db.js';
import { loginLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/auth.js';
import config from '../config.js';

const router = Router();

// POST /register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const hash = await hashPassword(password);
    const id = 'usr_' + randomUUID().slice(0, 8);

    const { rows } = await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email`,
      [id, email, hash, email.split('@')[0]]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    // 23505 = unique_violation (duplicate email)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    console.error('register:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /login

async function recentFailures(email) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM login_attempts
     WHERE email = $1
       AND attempted_at > NOW() - make_interval(mins => $2)`,
    [email, config.loginWindowMinutes]
  );
  return rows[0].n;
}

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  // Same generic message whether the email exists or not.
  const GENERIC = { error: 'Invalid email or password' };

  if (!email || !password) {
    return res.status(400).json(GENERIC);
  }

  try {
    // Per-email lockout (layer 2, on top of the IP-based limiter)
    const failures = await recentFailures(email);
    if (failures >= config.loginMaxAttempts) {
      return res.status(429).json({
        error: 'Too many failed attempts. Try again in a few minutes.',
      });
    }

    const { rows } = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );

    const user = rows[0];

    // Always run argon2.verify, even when the email doesn't exist.
    // Without this, a missing-email response is measurably faster than
    // a wrong-password response, which leaks whether the account exists.
    const hashToCheck = user ? user.password_hash : DUMMY_HASH;
    const valid = await verifyPassword(hashToCheck, password) && user;

    if (!valid) {
      await pool.query(
        'INSERT INTO login_attempts (email, ip_address) VALUES ($1, $2)',
        [email, req.ip]
      );
      return res.status(401).json(GENERIC);
    }

    // Success - clear old failures for this email
    await pool.query(
      `DELETE FROM login_attempts
       WHERE email = $1
         AND attempted_at > NOW() - make_interval(mins => $2)`,
      [email, config.loginWindowMinutes]
    );

    const token = signToken({ sub: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /logout
router.post('/logout', requireAuth, async (req, res) => {
  try {
    // Blacklist this specific token (by its jti) until it would have
    // expired on its own. The auth middleware checks the blacklist
    // on every request, so the token is effectively dead from this point.
    await pool.query(
      `INSERT INTO token_blacklist (jti, expires_at)
       VALUES ($1, to_timestamp($2))
       ON CONFLICT (jti) DO NOTHING`,
      [req.tokenClaims.jti, req.tokenClaims.exp]
    );
    res.json({ message: 'Logged out' });
  } catch (err) {
    console.error('logout:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
