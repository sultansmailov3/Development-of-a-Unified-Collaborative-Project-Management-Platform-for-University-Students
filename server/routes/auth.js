const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, requireAuth } = require('../auth');

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Укажите имя, email и пароль (от 6 символов)' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase()))
    return res.status(409).json({ error: 'Email уже зарегистрирован' });
  const info = db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)')
    .run(name.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10));
  const user = { id: info.lastInsertRowid, name, email: email.toLowerCase() };
  res.status(201).json({ token: sign(user), user });
});

router.post('/login', (req, res) => {
  const { email = '', password = '' } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase());
  if (!u || !bcrypt.compareSync(password, u.password_hash))
    return res.status(401).json({ error: 'Неверный email или пароль' });
  res.json({ token: sign(u), user: { id: u.id, name: u.name, email: u.email } });
});

router.get('/me', requireAuth, (req, res) =>
  res.json(db.prepare('SELECT id,name,email FROM users WHERE id=?').get(req.user.id)));

module.exports = router;
