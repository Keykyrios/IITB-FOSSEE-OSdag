import { verifyToken } from '../utils/jwt.js';
import { pool } from '../db.js';

// Pulls the user identity from a Bearer JWT and checks it hasn't been
// revoked. On success, populates req.userId and req.tokenClaims.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(\S+)$/);
  if (!match) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  let claims;
  try {
    claims = verifyToken(match[1]);
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Token expired'
      : 'Not authenticated';
    return res.status(401).json({ error: message });
  }

  // Has this token been logged-out?
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM token_blacklist WHERE jti = $1',
      [claims.jti]
    );
    if (rows.length > 0) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }
  } catch (err) {
    // If the DB is unreachable we can't confirm the token is still valid,
    // so fail closed (deny access) rather than fail open.
    console.error('Blacklist check failed:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }

  req.userId = claims.sub;
  req.tokenClaims = claims;
  next();
}

