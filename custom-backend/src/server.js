import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import config from './config.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import fileRoutes from './routes/files.js';
import { globalLimiter } from './middleware/rateLimiter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');

const app = express();

// CSP off because index.html loads the Appwrite SDK from a CDN
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));

// The test client (index.html) might be opened from file:// or served on a
// different port, so we reflect the request's Origin.  In production you'd
// lock this to specific domains.
app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
}));

app.use(globalLimiter);

app.use(authRoutes);
app.use(meRoutes);
app.use(fileRoutes);

// Serve index.html and other static files from the project root
app.use(express.static(projectRoot));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(config.port, () => {
  console.log(`Auth server running on http://localhost:${config.port}`);
});
