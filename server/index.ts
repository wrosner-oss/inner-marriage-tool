import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { api } from './routes/api.js';
import {
  authEnabled,
  checkPassword,
  issueToken,
  verifyToken,
  sessionCookie,
  clearCookie,
  readCookie,
  COOKIE_NAME,
} from './lib/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));

// --- shared-password auth (defense-in-depth; Pangolin fronts real auth) ---
app.get('/api/auth/status', (req, res) => {
  res.json({ authEnabled: authEnabled(), authed: !authEnabled() || verifyToken(readCookie(req.headers.cookie, COOKIE_NAME)) });
});

// Small in-memory throttle to slow brute-forcing the shared password.
let recentFailures = 0;
app.post('/api/auth/login', async (req, res) => {
  if (!authEnabled()) return res.json({ ok: true });
  // back off once failures pile up
  if (recentFailures > 5) await new Promise((r) => setTimeout(r, Math.min(recentFailures * 200, 3000)));
  if (checkPassword(req.body?.password ?? '')) {
    recentFailures = 0;
    res.setHeader('Set-Cookie', sessionCookie(issueToken()));
    return res.json({ ok: true });
  }
  recentFailures++;
  res.status(401).json({ error: 'Incorrect password.' });
});

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearCookie());
  res.json({ ok: true });
});

// Gate everything else under /api.
app.use('/api', (req, res, next) => {
  if (!authEnabled()) return next();
  if (req.path === '/health' || req.path.startsWith('/auth/')) return next();
  if (verifyToken(readCookie(req.headers.cookie, COOKIE_NAME))) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

app.use('/api', api);

// Central error handler.
app.use('/api', (err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: err?.message ?? 'Internal error' });
});

// In production, serve the built Vite frontend.
const distDir = join(__dirname, '..', 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(join(distDir, 'index.html')));
}

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Inner Marriage API listening on :${port}`));
