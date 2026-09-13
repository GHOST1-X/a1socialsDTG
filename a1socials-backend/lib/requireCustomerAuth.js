const { verifyToken } = require('./auth');

// Attaches req.customer = { id, email } if the Bearer token is valid.
// Use this on any route that should only act on the logged-in customer's own data.
module.exports = function requireCustomerAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const payload = verifyToken(header.split(' ')[1]);
    req.customer = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
