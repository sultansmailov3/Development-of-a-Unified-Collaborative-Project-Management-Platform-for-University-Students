const jwt = require('jsonwebtoken');
const secret = () => process.env.JWT_SECRET || 'dev-secret';
const sign = (user) => jwt.sign({ id: user.id }, secret(), { expiresIn: '7d' });
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.user = jwt.verify(h.replace('Bearer ', ''), secret());
    next();
  } catch { res.status(401).json({ error: 'Требуется вход' }); }
}
module.exports = { sign, requireAuth };
