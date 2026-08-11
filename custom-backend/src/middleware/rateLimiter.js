import rateLimit from 'express-rate-limit';

// 100 requests per 15 minutes per IP — enough for normal use, blocks scanners.
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

// Login gets a stricter limit (10/15min per IP). The per-email lockout
// in the login route handler is a separate, second layer.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});
