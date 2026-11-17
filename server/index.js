require('dotenv').config();
const express = require('express');
const path = require('path');
const { requireAuth } = require('./auth');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.use(express.static(PUBLIC_DIR));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/projects', requireAuth, require('./routes/projects'));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Неизвестный запрос' }));

  // The front end is a single page, so any other path returns the app shell.
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  app.use((err, _req, res, _next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE')
      return res.status(413).json({ error: 'Файл больше 10 МБ' });
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Ошибка сервера' });
  });

  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`TeamWork: http://localhost:${port}`));
}

module.exports = { createApp };
