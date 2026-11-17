const Database = require('better-sqlite3');

const db = new Database(process.env.DB_PATH || 'data.db');
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS projects(
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  owner_id INTEGER NOT NULL REFERENCES users(id),
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS members(
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(project_id, user_id));

CREATE TABLE IF NOT EXISTS tasks(
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
  status TEXT DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done')),
  deadline TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS task_comments(
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS files(
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  size INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS invites(
  token TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'member',
  expires_at TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS activity(
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  subject TEXT DEFAULT '',
  target_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_comments_task ON task_comments(task_id);
`);

// Bring databases created by an earlier version up to the current schema.
const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const addColumn = (table, column, definition) => {
  if (!columns(table).includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

addColumn('users', 'created_at', "TEXT DEFAULT CURRENT_TIMESTAMP");
addColumn('projects', 'archived', 'INTEGER NOT NULL DEFAULT 0');
addColumn('members', 'joined_at', "TEXT DEFAULT CURRENT_TIMESTAMP");
addColumn('tasks', 'created_by', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');

/** Record something that happened in a project, for the activity feed. */
function logActivity(projectId, userId, kind, subject = '', targetId = null) {
  db.prepare('INSERT INTO activity(project_id,user_id,kind,subject,target_id) VALUES(?,?,?,?,?)')
    .run(projectId, userId, kind, String(subject).slice(0, 200), targetId);
}

module.exports = db;
module.exports.logActivity = logActivity;
