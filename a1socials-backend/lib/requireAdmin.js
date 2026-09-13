// Minimal admin-auth guard. Replace with proper JWT/session auth before going live.
// For now: expects header  x-admin-key: <ADMIN_API_KEY>  matching your env var.

module.exports = function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
