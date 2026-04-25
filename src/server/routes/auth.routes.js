import crypto from 'crypto';
import { get, run } from '../database.js';
import { generateToken, createSession, deleteSession, validateSession } from '../auth.js';

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function getStoredPasswordHash() {
  try {
    const row = get("SELECT value FROM settings WHERE key = 'seller_password'");
    return row?.value || null;
  } catch {
    return null;
  }
}

export function registerAuthRoutes(app) {
  // GET /api/auth/me
  app.get('/api/auth/me', (req, res) => {
    const storedHash = getStoredPasswordHash();

    if (!storedHash) {
      return res.json({ authenticated: true, setupRequired: false, mode: 'open' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token && validateSession(token)) {
      return res.json({ authenticated: true, setupRequired: false });
    }

    return res.json({ authenticated: false, setupRequired: false });
  });

  // POST /api/auth/setup
  app.post('/api/auth/setup', (req, res) => {
    const existing = getStoredPasswordHash();
    if (existing) {
      return res.status(409).json({ error: 'Password already configured' });
    }

    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'password required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const hash = hashPassword(password);
    run("INSERT INTO settings (key, value) VALUES ('seller_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [hash]);

    const token = generateToken();
    const ttlMs = 7 * 24 * 60 * 60 * 1000;
    createSession(token, ttlMs);
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    return res.status(201).json({ token, expiresAt });
  });

  // POST /api/auth/login
  app.post('/api/auth/login', (req, res) => {
    const storedHash = getStoredPasswordHash();
    if (!storedHash) {
      return res.status(400).json({ error: 'No password configured. Use /api/auth/setup first.' });
    }

    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'password required' });
    }

    if (hashPassword(password) !== storedHash) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = generateToken();
    const ttlMs = 7 * 24 * 60 * 60 * 1000;
    createSession(token, ttlMs);
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    return res.json({ token, expiresAt });
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      deleteSession(token);
    }
    return res.json({ success: true });
  });
}
