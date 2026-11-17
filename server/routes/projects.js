const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { logActivity } = require('../db');

const UPLOADS = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_req, _file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ROLES = ['owner', 'manager', 'member'];
const INVITE_DAYS = 7;

// ---------------------------------------------------------------- helpers
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const isMember = (pid, uid) => !uid || db.prepare('SELECT 1 FROM members WHERE project_id=? AND user_id=?').get(pid, uid);
const projectOf = (pid) => db.prepare('SELECT * FROM projects WHERE id=?').get(pid);

/** Every `:id` route runs this first: it proves membership and exposes the caller's role. */
router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).json({ error: 'Проект не найден' });
  const m = db.prepare('SELECT role FROM members WHERE project_id=? AND user_id=?').get(id, req.user.id);
  if (!m) return res.status(404).json({ error: 'Проект не найден' });
  req.pid = Number(id);
  req.role = m.role;
  next();
});

const ownerOnly = (req, res, next) =>
  req.role === 'owner' ? next() : res.status(403).json({ error: 'Доступно только владельцу проекта' });

const canManage = (req, res, next) =>
  req.role === 'owner' || req.role === 'manager'
    ? next()
    : res.status(403).json({ error: 'Доступно владельцу и менеджерам проекта' });

/** Owners and managers moderate anyone's content; everyone else only their own. */
const mayModerate = (req, authorId) => authorId === req.user.id || req.role === 'owner' || req.role === 'manager';

// ================================================================ личные разделы
router.get('/my/tasks', (req, res) => res.json(db.prepare(`
  SELECT t.*, p.title AS project_title FROM tasks t
  JOIN projects p ON p.id=t.project_id AND p.archived=0
  JOIN members m ON m.project_id=p.id AND m.user_id=?
  WHERE t.assignee_id=? AND t.status!='done'
  ORDER BY t.deadline IS NULL, t.deadline,
    CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
`).all(req.user.id, req.user.id)));

router.get('/my/notifications', (req, res) => {
  const due = db.prepare(`
    SELECT t.id, t.title, t.deadline, t.priority, t.project_id, p.title AS project_title
    FROM tasks t
    JOIN projects p ON p.id=t.project_id AND p.archived=0
    JOIN members m ON m.project_id=p.id AND m.user_id=?
    WHERE t.assignee_id=? AND t.status!='done'
      AND t.deadline IS NOT NULL AND date(t.deadline) <= date('now','+3 day')
    ORDER BY t.deadline
  `).all(req.user.id, req.user.id);

  const feed = db.prepare(`
    SELECT a.*, u.name AS author, p.title AS project_title
    FROM activity a
    JOIN projects p ON p.id=a.project_id AND p.archived=0
    JOIN members m ON m.project_id=p.id AND m.user_id=?
    LEFT JOIN users u ON u.id=a.user_id
    WHERE a.user_id IS NOT ?
    ORDER BY a.id DESC LIMIT 30
  `).all(req.user.id, req.user.id);

  res.json({ due, feed });
});

// ================================================================ приглашения
router.get('/invite/:token', (req, res) => {
  const invite = db.prepare('SELECT * FROM invites WHERE token=?').get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Ссылка-приглашение не найдена' });
  if (new Date(invite.expires_at) < new Date())
    return res.status(410).json({ error: 'Срок действия приглашения истёк' });

  const project = projectOf(invite.project_id);
  if (!project) return res.status(404).json({ error: 'Проект больше не существует' });
  const already = !!db.prepare('SELECT 1 FROM members WHERE project_id=? AND user_id=?')
    .get(invite.project_id, req.user.id);

  res.json({
    project: { id: project.id, title: project.title, description: project.description },
    role: invite.role,
    expires_at: invite.expires_at,
    already_member: already,
  });
});

router.post('/invite/:token/accept', (req, res) => {
  const invite = db.prepare('SELECT * FROM invites WHERE token=?').get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Ссылка-приглашение не найдена' });
  if (new Date(invite.expires_at) < new Date())
    return res.status(410).json({ error: 'Срок действия приглашения истёк' });
  if (!projectOf(invite.project_id)) return res.status(404).json({ error: 'Проект больше не существует' });

  const already = db.prepare('SELECT 1 FROM members WHERE project_id=? AND user_id=?')
    .get(invite.project_id, req.user.id);
  if (already) return res.json({ ok: true, project_id: invite.project_id, already_member: true });

  db.transaction(() => {
    db.prepare('INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)')
      .run(invite.project_id, req.user.id, invite.role);
    db.prepare('UPDATE invites SET uses=uses+1 WHERE token=?').run(invite.token);
    const me = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.id);
    logActivity(invite.project_id, req.user.id, 'member_joined', me ? me.name : '');
  })();

  res.status(201).json({ ok: true, project_id: invite.project_id });
});

router.get('/:id/invites', canManage, (req, res) => res.json(db.prepare(`
  SELECT i.token, i.role, i.expires_at, i.uses, i.created_at, u.name AS author
  FROM invites i LEFT JOIN users u ON u.id=i.created_by
  WHERE i.project_id=? ORDER BY i.rowid DESC`).all(req.pid)));

router.post('/:id/invites', canManage, (req, res) => {
  const role = ROLES.includes(req.body.role) && req.body.role !== 'owner' ? req.body.role : 'member';
  const token = crypto.randomBytes(18).toString('base64url');
  const expires = new Date(Date.now() + INVITE_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO invites(token,project_id,created_by,role,expires_at) VALUES(?,?,?,?,?)')
    .run(token, req.pid, req.user.id, role, expires);
  res.status(201).json({ token, role, expires_at: expires });
});

router.delete('/:id/invites/:token', canManage, (req, res) => {
  db.prepare('DELETE FROM invites WHERE token=? AND project_id=?').run(req.params.token, req.pid);
  res.json({ ok: true });
});

// ================================================================ проекты
router.get('/', (req, res) => res.json(db.prepare(`
  SELECT p.*, m.role,
    (SELECT COUNT(*) FROM tasks WHERE project_id=p.id) AS total,
    (SELECT COUNT(*) FROM tasks WHERE project_id=p.id AND status='done') AS done,
    (SELECT COUNT(*) FROM members WHERE project_id=p.id) AS people,
    (SELECT COUNT(*) FROM tasks WHERE project_id=p.id AND status!='done'
       AND deadline IS NOT NULL AND date(deadline) < date('now')) AS overdue
  FROM projects p JOIN members m ON m.project_id=p.id
  WHERE m.user_id=? ORDER BY p.archived, p.id DESC`).all(req.user.id)));

router.post('/', (req, res) => {
  const title = str(req.body.title, 120);
  if (!title) return res.status(400).json({ error: 'Укажите название проекта' });
  const id = db.transaction(() => {
    const pid = db.prepare('INSERT INTO projects(title,description,owner_id) VALUES(?,?,?)')
      .run(title, str(req.body.description, 600), req.user.id).lastInsertRowid;
    db.prepare("INSERT INTO members(project_id,user_id,role) VALUES(?,?,'owner')").run(pid, req.user.id);
    logActivity(pid, req.user.id, 'project_created', title);
    return pid;
  })();
  res.status(201).json({ id });
});

router.get('/:id', (req, res) => {
  const project = projectOf(req.pid);
  const members = db.prepare(`
    SELECT u.id, u.name, u.email, m.role, m.joined_at,
      (SELECT COUNT(*) FROM tasks WHERE project_id=? AND assignee_id=u.id AND status!='done') AS open_tasks
    FROM members m JOIN users u ON u.id=m.user_id
    WHERE m.project_id=?
    ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.name
  `).all(req.pid, req.pid);
  res.json({ ...project, members, role: req.role });
});

router.patch('/:id', canManage, (req, res) => {
  const title = str(req.body.title, 120);
  if (!title) return res.status(400).json({ error: 'Укажите название проекта' });
  db.prepare('UPDATE projects SET title=?, description=? WHERE id=?')
    .run(title, str(req.body.description, 600), req.pid);
  logActivity(req.pid, req.user.id, 'project_updated', title);
  res.json({ ok: true });
});

router.post('/:id/archive', canManage, (req, res) => {
  const archived = req.body.archived === false ? 0 : 1;
  db.prepare('UPDATE projects SET archived=? WHERE id=?').run(archived, req.pid);
  logActivity(req.pid, req.user.id, archived ? 'project_archived' : 'project_restored');
  res.json({ ok: true, archived: !!archived });
});

router.delete('/:id', ownerOnly, (req, res) => {
  const stored = db.prepare('SELECT stored_name FROM files WHERE project_id=?').all(req.pid);
  db.prepare('DELETE FROM projects WHERE id=?').run(req.pid);
  stored.forEach((f) => fs.unlink(path.join(UPLOADS, f.stored_name), () => {}));
  res.json({ ok: true });
});

router.post('/:id/leave', (req, res) => {
  if (req.role === 'owner')
    return res.status(400).json({ error: 'Сначала передайте права владельца другому участнику' });
  const me = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.id);
  db.transaction(() => {
    db.prepare('UPDATE tasks SET assignee_id=NULL WHERE project_id=? AND assignee_id=?').run(req.pid, req.user.id);
    db.prepare('DELETE FROM members WHERE project_id=? AND user_id=?').run(req.pid, req.user.id);
    logActivity(req.pid, null, 'member_left', me ? me.name : '');
  })();
  res.json({ ok: true });
});

// ================================================================ команда
router.post('/:id/members', canManage, (req, res) => {
  const email = str(req.body.email, 160).toLowerCase();
  const user = db.prepare('SELECT id,name FROM users WHERE email=?').get(email);
  if (!user) return res.status(404).json({ error: 'Пользователь с таким email не зарегистрирован' });
  if (isMember(req.pid, user.id)) return res.status(409).json({ error: 'Этот пользователь уже в команде' });

  const role = req.body.role === 'manager' ? 'manager' : 'member';
  db.prepare('INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)').run(req.pid, user.id, role);
  logActivity(req.pid, req.user.id, 'member_added', user.name, user.id);
  res.status(201).json({ ok: true });
});

router.patch('/:id/members/:uid', ownerOnly, (req, res) => {
  const uid = Number(req.params.uid);
  const role = req.body.role;
  if (!['manager', 'member'].includes(role)) return res.status(400).json({ error: 'Недопустимая роль' });
  if (uid === req.user.id) return res.status(400).json({ error: 'Нельзя изменить собственную роль' });
  if (!isMember(req.pid, uid)) return res.status(404).json({ error: 'Участник не найден' });

  db.prepare('UPDATE members SET role=? WHERE project_id=? AND user_id=?').run(role, req.pid, uid);
  const u = db.prepare('SELECT name FROM users WHERE id=?').get(uid);
  logActivity(req.pid, req.user.id, 'role_changed', `${u ? u.name : ''} → ${role}`, uid);
  res.json({ ok: true });
});

router.post('/:id/transfer/:uid', ownerOnly, (req, res) => {
  const uid = Number(req.params.uid);
  if (uid === req.user.id) return res.status(400).json({ error: 'Вы уже владелец проекта' });
  if (!isMember(req.pid, uid)) return res.status(404).json({ error: 'Участник не найден' });

  const u = db.prepare('SELECT name FROM users WHERE id=?').get(uid);
  db.transaction(() => {
    db.prepare("UPDATE members SET role='owner' WHERE project_id=? AND user_id=?").run(req.pid, uid);
    db.prepare("UPDATE members SET role='manager' WHERE project_id=? AND user_id=?").run(req.pid, req.user.id);
    db.prepare('UPDATE projects SET owner_id=? WHERE id=?').run(uid, req.pid);
    logActivity(req.pid, req.user.id, 'owner_changed', u ? u.name : '', uid);
  })();
  res.json({ ok: true });
});

router.delete('/:id/members/:uid', canManage, (req, res) => {
  const uid = Number(req.params.uid);
  const target = db.prepare('SELECT role FROM members WHERE project_id=? AND user_id=?').get(req.pid, uid);
  if (!target) return res.status(404).json({ error: 'Участник не найден' });
  if (target.role === 'owner') return res.status(400).json({ error: 'Владельца проекта удалить нельзя' });
  if (uid === req.user.id) return res.status(400).json({ error: 'Используйте «Покинуть проект»' });
  if (target.role === 'manager' && req.role !== 'owner')
    return res.status(403).json({ error: 'Менеджера может удалить только владелец' });

  const u = db.prepare('SELECT name FROM users WHERE id=?').get(uid);
  db.transaction(() => {
    db.prepare('UPDATE tasks SET assignee_id=NULL WHERE project_id=? AND assignee_id=?').run(req.pid, uid);
    db.prepare('DELETE FROM members WHERE project_id=? AND user_id=?').run(req.pid, uid);
    logActivity(req.pid, req.user.id, 'member_removed', u ? u.name : '', uid);
  })();
  res.json({ ok: true });
});

// ================================================================ задачи
router.get('/:id/tasks', (req, res) => res.json(db.prepare(`
  SELECT t.*, u.name AS assignee_name, c.name AS author_name,
    (SELECT COUNT(*) FROM task_comments WHERE task_id=t.id) AS comments
  FROM tasks t
  LEFT JOIN users u ON u.id=t.assignee_id
  LEFT JOIN users c ON c.id=t.created_by
  WHERE t.project_id=?
  ORDER BY t.status='done',
    CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
    t.deadline IS NULL, t.deadline, t.id DESC`).all(req.pid)));

router.post('/:id/tasks', (req, res) => {
  const title = str(req.body.title, 160);
  const assignee = req.body.assignee_id ? Number(req.body.assignee_id) : null;
  const priority = ['low', 'medium', 'high'].includes(req.body.priority) ? req.body.priority : 'medium';
  const status = ['todo', 'in_progress', 'done'].includes(req.body.status) ? req.body.status : 'todo';

  if (!title) return res.status(400).json({ error: 'Укажите название задачи' });
  if (!isMember(req.pid, assignee)) return res.status(400).json({ error: 'Исполнитель не состоит в команде' });

  const id = db.prepare(`INSERT INTO tasks(project_id,title,description,assignee_id,priority,status,deadline,created_by)
    VALUES(?,?,?,?,?,?,?,?)`)
    .run(req.pid, title, str(req.body.description, 2000), assignee, priority, status,
      str(req.body.deadline, 10) || null, req.user.id).lastInsertRowid;
  logActivity(req.pid, req.user.id, 'task_created', title, id);
  res.status(201).json({ id });
});

router.patch('/:id/tasks/:tid', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id=? AND project_id=?').get(req.params.tid, req.pid);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });

  const next = { ...task, ...req.body };
  const title = str(next.title, 160);
  const assignee = next.assignee_id ? Number(next.assignee_id) : null;
  if (!title) return res.status(400).json({ error: 'Укажите название задачи' });
  if (!['low', 'medium', 'high'].includes(next.priority)) return res.status(400).json({ error: 'Недопустимый приоритет' });
  if (!['todo', 'in_progress', 'done'].includes(next.status)) return res.status(400).json({ error: 'Недопустимый статус' });
  if (!isMember(req.pid, assignee)) return res.status(400).json({ error: 'Исполнитель не состоит в команде' });

  db.prepare(`UPDATE tasks SET title=?,description=?,assignee_id=?,priority=?,status=?,deadline=? WHERE id=?`)
    .run(title, str(next.description, 2000), assignee, next.priority, next.status,
      str(next.deadline, 10) || null, task.id);

  if (next.status !== task.status) {
    const label = { todo: 'К выполнению', in_progress: 'В работе', done: 'Готово' }[next.status];
    logActivity(req.pid, req.user.id, next.status === 'done' ? 'task_done' : 'task_status',
      `${title} → ${label}`, task.id);
  }
  if (assignee !== task.assignee_id && assignee) {
    const u = db.prepare('SELECT name FROM users WHERE id=?').get(assignee);
    logActivity(req.pid, req.user.id, 'task_assigned', `${title} → ${u ? u.name : ''}`, task.id);
  }
  res.json({ ok: true });
});

router.delete('/:id/tasks/:tid', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id=? AND project_id=?').get(req.params.tid, req.pid);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  db.prepare('DELETE FROM tasks WHERE id=?').run(task.id);
  logActivity(req.pid, req.user.id, 'task_deleted', task.title, task.id);
  res.json({ ok: true });
});

// ================================================================ комментарии
const taskExists = (req) =>
  db.prepare('SELECT id,title FROM tasks WHERE id=? AND project_id=?').get(req.params.tid, req.pid);

router.get('/:id/tasks/:tid/comments', (req, res) => {
  if (!taskExists(req)) return res.status(404).json({ error: 'Задача не найдена' });
  res.json(db.prepare(`SELECT c.*, u.name AS author FROM task_comments c
    JOIN users u ON u.id=c.user_id WHERE c.task_id=? ORDER BY c.id`).all(req.params.tid));
});

router.post('/:id/tasks/:tid/comments', (req, res) => {
  const task = taskExists(req);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  const body = str(req.body.body, 2000);
  if (!body) return res.status(400).json({ error: 'Комментарий не может быть пустым' });
  const id = db.prepare('INSERT INTO task_comments(task_id,user_id,body) VALUES(?,?,?)')
    .run(task.id, req.user.id, body).lastInsertRowid;
  logActivity(req.pid, req.user.id, 'comment_added', task.title, task.id);
  res.status(201).json({ id });
});

router.delete('/:id/tasks/:tid/comments/:cid', (req, res) => {
  const c = db.prepare(`SELECT c.* FROM task_comments c JOIN tasks t ON t.id=c.task_id
    WHERE c.id=? AND t.project_id=?`).get(req.params.cid, req.pid);
  if (!c) return res.status(404).json({ error: 'Комментарий не найден' });
  if (!mayModerate(req, c.user_id)) return res.status(403).json({ error: 'Нельзя удалить чужой комментарий' });
  db.prepare('DELETE FROM task_comments WHERE id=?').run(c.id);
  res.json({ ok: true });
});

// ================================================================ обсуждение
router.get('/:id/messages', (req, res) => res.json(db.prepare(`
  SELECT m.*, u.name AS author FROM messages m JOIN users u ON u.id=m.user_id
  WHERE m.project_id=? ORDER BY m.id DESC LIMIT 100`).all(req.pid).reverse()));

router.post('/:id/messages', (req, res) => {
  const body = str(req.body.body, 2000);
  if (!body) return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  const id = db.prepare('INSERT INTO messages(project_id,user_id,body) VALUES(?,?,?)')
    .run(req.pid, req.user.id, body).lastInsertRowid;
  res.status(201).json({ id });
});

router.delete('/:id/messages/:mid', (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=? AND project_id=?').get(req.params.mid, req.pid);
  if (!m) return res.status(404).json({ error: 'Сообщение не найдено' });
  if (!mayModerate(req, m.user_id)) return res.status(403).json({ error: 'Нельзя удалить чужое сообщение' });
  db.prepare('DELETE FROM messages WHERE id=?').run(m.id);
  res.json({ ok: true });
});

// ================================================================ файлы
router.get('/:id/files', (req, res) => res.json(db.prepare(`
  SELECT f.id, f.user_id, f.original_name, f.size, f.created_at, u.name AS author
  FROM files f JOIN users u ON u.id=f.user_id
  WHERE f.project_id=? ORDER BY f.id DESC`).all(req.pid)));

router.post('/:id/files', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });
  // Multer reports the raw latin1 bytes of the header; decode them as UTF-8 for non-Latin names.
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  db.prepare('INSERT INTO files(project_id,user_id,original_name,stored_name,size) VALUES(?,?,?,?,?)')
    .run(req.pid, req.user.id, name, req.file.filename, req.file.size);
  logActivity(req.pid, req.user.id, 'file_uploaded', name);
  res.status(201).json({ ok: true });
});

router.get('/:id/files/:fid', (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=? AND project_id=?').get(req.params.fid, req.pid);
  if (!f) return res.status(404).json({ error: 'Файл не найден' });
  res.download(path.join(UPLOADS, f.stored_name), f.original_name);
});

router.delete('/:id/files/:fid', (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=? AND project_id=?').get(req.params.fid, req.pid);
  if (!f) return res.status(404).json({ error: 'Файл не найден' });
  if (!mayModerate(req, f.user_id)) return res.status(403).json({ error: 'Нельзя удалить чужой файл' });
  db.prepare('DELETE FROM files WHERE id=?').run(f.id);
  fs.unlink(path.join(UPLOADS, f.stored_name), () => {});
  res.json({ ok: true });
});

// ================================================================ активность
router.get('/:id/activity', (req, res) => res.json(db.prepare(`
  SELECT a.*, u.name AS author FROM activity a LEFT JOIN users u ON u.id=a.user_id
  WHERE a.project_id=? ORDER BY a.id DESC LIMIT 60`).all(req.pid)));

module.exports = router;
