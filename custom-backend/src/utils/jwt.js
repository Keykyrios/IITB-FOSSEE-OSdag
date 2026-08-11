import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import config from '../config.js';

// RS256: the private key signs, the public key verifies. Means we can
// hand out the public key to other services without exposing the signer.
// Each token gets a unique jti — that's what gets blacklisted on logout.
export function signToken(payload) {
  return jwt.sign(payload, config.jwtPrivateKey, {
    algorithm: 'RS256',
    expiresIn: config.jwtExpiry,
    jwtid: randomUUID(),
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtPublicKey, {
    algorithms: ['RS256'],
  });
}
