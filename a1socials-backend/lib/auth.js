const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;

function signToken(customer) {
  return jwt.sign({ id: customer.id, email: customer.email }, SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET); // throws if invalid/expired
}

module.exports = { signToken, verifyToken };
