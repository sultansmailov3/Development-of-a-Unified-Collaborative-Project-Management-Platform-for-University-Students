require('dotenv').config();
const express = require('express');
const path = require('path');
const { requireAuth } = require('./auth');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', requireAuth, require('./routes/projects'));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Ошибка сервера' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`TeamWork: http://localhost:${port}`));
