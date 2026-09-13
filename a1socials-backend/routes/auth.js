const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const { signToken } = require('../lib/auth');

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Valid email and a password (6+ chars) are required' });
  }

  try {
    const existing = await db.query('SELECT id FROM customers WHERE email = $1', [email]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO customers (email, password_hash) VALUES ($1, $2)
       RETURNING id, email, wallet_balance`,
      [email, password_hash]
    );
    const customer = result.rows[0];
    const token = signToken(customer);
    res.status(201).json({ token, customer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await db.query('SELECT * FROM customers WHERE email = $1', [email]);
    const customer = result.rows[0];
    if (!customer) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, customer.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken(customer);
    res.json({
      token,
      customer: { id: customer.id, email: customer.email, wallet_balance: customer.wallet_balance }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
