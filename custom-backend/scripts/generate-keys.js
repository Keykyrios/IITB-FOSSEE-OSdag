// Generates an RSA-2048 keypair for JWT signing. Run once: npm run generate-keys
// Keys are written to ./keys/ (gitignored).

import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keysDir = join(__dirname, '..', 'keys');

if (existsSync(join(keysDir, 'private.pem'))) {
  console.log('Keys already exist in ./keys/ - skipping generation.');
  console.log('Delete the folder and re-run if you want fresh keys.');
  process.exit(0);
}

mkdirSync(keysDir, { recursive: true });

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

writeFileSync(join(keysDir, 'private.pem'), privateKey);
writeFileSync(join(keysDir, 'public.pem'), publicKey);

console.log('RSA keypair written to ./keys/');
