import { get, run, all } from '../database.js';
import { uid } from './shared.js';
import { requireProtectedConfigWrite } from '../auth.js';

export function registerEarlyAccessRoutes(app) {
  // POST /api/early-access — public signup
  app.post('/api/early-access', (req, res) => {
    try {
      const { email, name, message } = req.body || {};

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'email required' });
      }
      if (!email.includes('@')) {
        return res.status(400).json({ error: 'email must be a valid email address' });
      }
      if (email.length > 255) {
        return res.status(400).json({ error: 'email must be 255 characters or fewer' });
      }

      const id = uid();
      run(
        'INSERT INTO early_access_signups (id, email, name, message) VALUES (?, ?, ?, ?)',
        [id, email.trim(), name || null, message || null],
      );

      const row = get('SELECT * FROM early_access_signups WHERE id = ?', [id]);
      return res.status(201).json(row);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  // GET /api/early-access — list signups (protected)
  app.get('/api/early-access', requireProtectedConfigWrite, (_req, res) => {
    try {
      const rows = all('SELECT * FROM early_access_signups ORDER BY created_at DESC');
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
}
