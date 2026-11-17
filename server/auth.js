const jwt = require('jsonwebtoken');

const secret = () => process.env.JWT_SECRET || 'dev-secret';

const sign = (user) => jwt.sign({ id: user.id }, secret(), { expiresIn: '7d' });

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    req.user = jwt.verify(token, secret());
    next();
  } catch {
    res.status(401).json({ error: 'Требуется вход' });
  }
}

/**
 * Simple in-memory throttle, used to slow down password guessing.
 * Keyed by e-mail plus client address so one attacker cannot lock out everyone.
 */
function createRateLimiter({ max = 8, windowMs = 10 * 60 * 1000 } = {}) {
  const hits = new Map();

  const sweep = () => {
    const now = Date.now();
    for (const [key, entry] of hits) if (now > entry.resetAt) hits.delete(key);
  };

  return {
    /** @returns {number} seconds the caller must wait, or 0 when allowed. */
    check(key) {
      sweep();
      const entry = hits.get(key);
      if (entry && entry.count >= max) return Math.ceil((entry.resetAt - Date.now()) / 1000);
      return 0;
    },
    fail(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || now > entry.resetAt) hits.set(key, { count: 1, resetAt: now + windowMs });
      else entry.count += 1;
    },
    succeed(key) {
      hits.delete(key);
    },
    reset() {
      hits.clear();
    },
  };
}

module.exports = { sign, requireAuth, createRateLimiter };
