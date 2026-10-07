// index.js — http server: static files, session auth, API dispatch. Zero npm deps.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db, now, checkPw, seed, resetDemoData } from './db.js';
import { handleApi } from './api.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3011;
const DEMO_MODE = process.env.DEMO_MODE === '1';
const DEMO_RESET_MIN = Number(process.env.DEMO_RESET_MIN) || 20;

seed();

if (DEMO_MODE) {
  resetDemoData(); // start every boot from a clean slate
  setInterval(() => {
    resetDemoData();
    console.log(`[demo] data reset (every ${DEMO_RESET_MIN}m)`);
  }, DEMO_RESET_MIN * 60 * 1000);
  console.log(`[demo] mode on — resets every ${DEMO_RESET_MIN}m`);
}

// Without SESSION_SECRET a random secret is used, so sessions end on restart. Set it to keep them.
const SESSION_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) console.warn('[auth] SESSION_SECRET not set: using a random one, sessions end on restart');
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
function currentUser(req) {
  const token = readCookie(req, 'chef_sess');
  const payload = verify(token);
  if (!payload) return null;
  return db.prepare('SELECT id, email, name, role FROM users WHERE id=?').get(payload.uid) || null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

async function serveStatic(res, filePath) {
  try {
    const stat = statSync(filePath);
    if (stat.isDirectory()) filePath = join(filePath, 'index.html');
    const buf = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': buf.length });
    res.end(buf);
    return true;
  } catch { return false; }
}

function readBody(req) {
  return new Promise((resolve) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 5_000_000) { req.destroy(); return resolve({}); }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (DEMO_MODE) res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  // ── auth endpoints ──────────────────────────────────────────────────────
  if (pathname === '/api/login' && req.method === 'POST') {
    const b = await readBody(req);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(b.email || '').toLowerCase().trim());
    if (!user || !checkPw(b.pass || '', user.pw)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid email or password' }));
    }
    const token = sign({ uid: user.id, exp: Date.now() + SESSION_TTL_MS });
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `chef_sess=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role }));
  }
  if (pathname === '/api/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', 'chef_sess=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (pathname === '/api/session' && req.method === 'GET') {
    const user = currentUser(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ user, demo: DEMO_MODE, demoResetMin: DEMO_RESET_MIN }));
  }

  // ── static assets (unauthenticated: login page + its assets) ───────────
  if (pathname === '/login.html' || pathname === '/' && !currentUser(req)) {
    const ok = await serveStatic(res, join(PUBLIC, 'login.html'));
    if (!ok) { res.writeHead(404); res.end('login.html missing'); }
    return;
  }
  if (/^\/(css|js|vendor)\//.test(pathname) || pathname === '/icon.svg' || pathname === '/manifest.webmanifest') {
    const ok = await serveStatic(res, join(PUBLIC, pathname));
    if (ok) return;
  }

  // ── everything else requires a session ──────────────────────────────────
  const user = currentUser(req);
  if (!user) {
    if (pathname.startsWith('/api/')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'unauthorized' }));
    }
    res.writeHead(302, { Location: '/login.html' });
    return res.end();
  }

  if (pathname.startsWith('/api/')) {
    const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};
    const handled = handleApi(req, res, pathname, url.searchParams, body);
    if (handled) return;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'not found' }));
  }

  if (pathname === '/') return void (await serveStatic(res, join(PUBLIC, 'index.html')));
  const staticPath = join(PUBLIC, pathname);
  if (staticPath.startsWith(PUBLIC) && existsSync(staticPath)) {
    const ok = await serveStatic(res, staticPath);
    if (ok) return;
  }
  return void (await serveStatic(res, join(PUBLIC, 'index.html')));
});

server.listen(PORT, () => {
  console.log(`chef-crm listening on http://localhost:${PORT}`);
});
