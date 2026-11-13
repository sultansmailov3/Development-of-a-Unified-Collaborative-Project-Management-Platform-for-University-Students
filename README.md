# TeamWork — Unified Collaborative Project Management Platform for University Students

A platform that helps university students coordinate group projects and manage teamwork in one place.

## Features

- Registration and login (JWT, bcrypt password hashing)
- Project creation and team management (owner / member roles)
- Tasks with assignee, priority, status and deadline
- Project progress tracking (progress bar, overdue highlighting)
- Team discussion chat (auto-refreshes every 5 seconds)
- File sharing (up to 10 MB per file)

## Tech stack

Node.js, Express, SQLite (better-sqlite3), vanilla JavaScript frontend.

## Project structure

```
server/
  index.js            # Express entry point
  auth.js             # JWT helpers and auth middleware
  db.js               # SQLite schema
  routes/auth.js      # /api/auth  (register, login, me)
  routes/projects.js  # /api/projects (projects, members, tasks, messages, files)
public/               # frontend (index.html, app.js, style.css)
uploads/              # uploaded files (git-ignored)
```

## Run locally

```bash
npm install
cp .env.example .env     # then set JWT_SECRET to a long random string
npm start                # http://localhost:3000
```

For development with auto-reload: `npm run dev`.

## Environment variables

| Variable     | Description                    | Default   |
|--------------|--------------------------------|-----------|
| `PORT`       | HTTP port                      | `3000`    |
| `JWT_SECRET` | Secret used to sign JWT tokens | dev value |
| `DB_PATH`    | SQLite database file           | `data.db` |
