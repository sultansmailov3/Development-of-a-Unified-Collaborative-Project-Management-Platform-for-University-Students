const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, requireAuth, createRateLimiter } = require('../auth');

const MIN_PASSWORD = 6;
const loginLimiter = createRateLimiter({ max: 8, windowMs: 10 * 60 * 1000 });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, created_at: u.created_at });
const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

router.post('/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!name) return res.status(400).json({ error: 'Укажите имя' });
  if (!looksLikeEmail(email)) return res.status(400).json({ error: 'Укажите корректный email' });
  if (password.length < MIN_PASSWORD)
    return res.status(400).json({ error: `Пароль должен быть не короче ${MIN_PASSWORD} символов` });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email))
    return res.status(409).json({ error: 'Этот email уже зарегистрирован' });

  const id = db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)')
    .run(name, email, bcrypt.hashSync(password, 10)).lastInsertRowid;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const key = `${email}|${req.ip}`;

  const wait = loginLimiter.check(key);
  if (wait) {
    return res.status(429).json({
      error: `Слишком много попыток входа. Повторите через ${Math.ceil(wait / 60)} мин.`,
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    loginLimiter.fail(key);
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  loginLimiter.succeed(key);
  res.json({ token: sign(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM members WHERE user_id=?) AS projects,
      (SELECT COUNT(*) FROM tasks WHERE assignee_id=? AND status!='done') AS open_tasks,
      (SELECT COUNT(*) FROM tasks WHERE assignee_id=? AND status='done') AS done_tasks
  `).get(req.user.id, req.user.id, req.user.id);

  res.json({ ...publicUser(user), stats });
});

router.patch('/me', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Имя не может быть пустым' });
  db.prepare('UPDATE users SET name=? WHERE id=?').run(name, req.user.id);
  res.json({ ok: true, name });
});

router.post('/password', requireAuth, (req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.next || '');
  if (next.length < MIN_PASSWORD)
    return res.status(400).json({ error: `Новый пароль должен быть не короче ${MIN_PASSWORD} символов` });

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user || !bcrypt.compareSync(current, user.password_hash))
    return res.status(403).json({ error: 'Текущий пароль указан неверно' });
  if (bcrypt.compareSync(next, user.password_hash))
    return res.status(400).json({ error: 'Новый пароль совпадает со старым' });

  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(next, 10), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
module.exports.loginLimiter = loginLimiter;
