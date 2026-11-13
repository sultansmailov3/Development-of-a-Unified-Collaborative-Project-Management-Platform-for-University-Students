const router = require('express').Router();
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');

const UPLOADS = path.join(__dirname, '..', '..', 'uploads');
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_r, _f, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Проверка членства в проекте для всех маршрутов с :id
router.param('id', (req, res, next, id) => {
  const m = db.prepare('SELECT role FROM members WHERE project_id=? AND user_id=?').get(id, req.user.id);
  if (!m) return res.status(404).json({ error: 'Проект не найден' });
  req.pid = Number(id); req.role = m.role; next();
});
const ownerOnly = (req, res, next) =>
  req.role === 'owner' ? next() : res.status(403).json({ error: 'Только владелец проекта' });

// --- Проекты и команда ---
router.get('/', (req, res) => res.json(db.prepare(`
  SELECT p.*, m.role,
    (SELECT COUNT(*) FROM tasks WHERE project_id=p.id) AS total,
    (SELECT COUNT(*) FROM tasks WHERE project_id=p.id AND status='done') AS done
  FROM projects p JOIN members m ON m.project_id=p.id
  WHERE m.user_id=? ORDER BY p.id DESC`).all(req.user.id)));

router.post('/', (req, res) => {
  const { title, description = '' } = req.body;
  if (!title) return res.status(400).json({ error: 'Укажите название' });
  const id = db.transaction(() => {
    const pid = db.prepare('INSERT INTO projects(title,description,owner_id) VALUES(?,?,?)')
      .run(title, description, req.user.id).lastInsertRowid;
    db.prepare("INSERT INTO members VALUES(?,?, 'owner')").run(pid, req.user.id);
    return pid;
  })();
  res.status(201).json({ id });
});

router.get('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(req.pid);
  const members = db.prepare(`SELECT u.id,u.name,u.email,m.role FROM members m
    JOIN users u ON u.id=m.user_id WHERE m.project_id=?`).all(req.pid);
  res.json({ ...project, members, role: req.role });
});

router.delete('/:id', ownerOnly, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id=?').run(req.pid); res.json({ ok: true });
});

router.post('/:id/members', ownerOnly, (req, res) => {
  const u = db.prepare('SELECT id FROM users WHERE email=?').get((req.body.email || '').toLowerCase());
  if (!u) return res.status(404).json({ error: 'Пользователь с таким email не найден' });
  db.prepare("INSERT OR IGNORE INTO members VALUES(?,?, 'member')").run(req.pid, u.id);
  res.status(201).json({ ok: true });
});

router.delete('/:id/members/:uid', ownerOnly, (req, res) => {
  if (Number(req.params.uid) === req.user.id)
    return res.status(400).json({ error: 'Владельца удалить нельзя' });
  db.prepare('DELETE FROM members WHERE project_id=? AND user_id=?').run(req.pid, req.params.uid);
  res.json({ ok: true });
});

// --- Задачи ---
const isMember = (pid, uid) => !uid || db.prepare('SELECT 1 FROM members WHERE project_id=? AND user_id=?').get(pid, uid);

router.get('/:id/tasks', (req, res) => res.json(db.prepare(`
  SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id
  WHERE t.project_id=? ORDER BY t.status='done',
  CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
  t.deadline IS NULL, t.deadline`).all(req.pid)));

router.post('/:id/tasks', (req, res) => {
  const { title, description = '', assignee_id = null, priority = 'medium', deadline = null } = req.body;
  if (!title) return res.status(400).json({ error: 'Укажите название задачи' });
  if (!isMember(req.pid, assignee_id)) return res.status(400).json({ error: 'Исполнитель не в команде' });
  try {
    const id = db.prepare(`INSERT INTO tasks(project_id,title,description,assignee_id,priority,deadline)
      VALUES(?,?,?,?,?,?)`).run(req.pid, title, description, assignee_id || null, priority, deadline || null).lastInsertRowid;
    res.status(201).json({ id });
  } catch { res.status(400).json({ error: 'Некорректные данные' }); }
});

router.patch('/:id/tasks/:tid', (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=? AND project_id=?').get(req.params.tid, req.pid);
  if (!t) return res.status(404).json({ error: 'Задача не найдена' });
  const n = { ...t, ...req.body };
  if (!isMember(req.pid, n.assignee_id)) return res.status(400).json({ error: 'Исполнитель не в команде' });
  try {
    db.prepare(`UPDATE tasks SET title=?,description=?,assignee_id=?,priority=?,status=?,deadline=? WHERE id=?`)
      .run(n.title, n.description, n.assignee_id || null, n.priority, n.status, n.deadline || null, t.id);
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'Некорректные данные' }); }
});

router.delete('/:id/tasks/:tid', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id=? AND project_id=?').run(req.params.tid, req.pid);
  res.json({ ok: true });
});

// --- Обсуждения ---
router.get('/:id/messages', (req, res) => res.json(db.prepare(`
  SELECT m.*, u.name AS author FROM messages m JOIN users u ON u.id=m.user_id
  WHERE m.project_id=? ORDER BY m.id DESC LIMIT 100`).all(req.pid).reverse()));

router.post('/:id/messages', (req, res) => {
  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Пустое сообщение' });
  db.prepare('INSERT INTO messages(project_id,user_id,body) VALUES(?,?,?)').run(req.pid, req.user.id, body);
  res.status(201).json({ ok: true });
});

// --- Файлы ---
router.get('/:id/files', (req, res) => res.json(db.prepare(`
  SELECT f.id,f.original_name,f.size,f.created_at,u.name AS author FROM files f
  JOIN users u ON u.id=f.user_id WHERE f.project_id=? ORDER BY f.id DESC`).all(req.pid)));

router.post('/:id/files', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });
  db.prepare('INSERT INTO files(project_id,user_id,original_name,stored_name,size) VALUES(?,?,?,?,?)')
    .run(req.pid, req.user.id, Buffer.from(req.file.originalname, 'latin1').toString('utf8'), req.file.filename, req.file.size);
  res.status(201).json({ ok: true });
});

router.get('/:id/files/:fid', (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=? AND project_id=?').get(req.params.fid, req.pid);
  if (!f) return res.status(404).json({ error: 'Файл не найден' });
  res.download(path.join(UPLOADS, f.stored_name), f.original_name);
});

module.exports = router;
