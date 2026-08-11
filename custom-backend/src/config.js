import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keysDir = join(__dirname, '..', 'keys');

function loadKey(name) {
  try {
    return readFileSync(join(keysDir, name), 'utf8');
  } catch {
    console.error(`Missing ${name} - run "npm run generate-keys" first.`);
    process.exit(1);
  }
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://auth_user:auth_pass@localhost:5432/auth_db',
  jwtExpiry: process.env.JWT_EXPIRY || '30m',
  jwtPrivateKey: loadKey('private.pem'),
  jwtPublicKey: loadKey('public.pem'),

  // Account lockout settings
  loginMaxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10) || 5,
  loginWindowMinutes: parseInt(process.env.LOGIN_WINDOW_MINUTES, 10) || 15,
};

export default config;
