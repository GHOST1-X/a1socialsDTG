const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const requireCustomerAuth = require('../lib/requireCustomerAuth');

// Returns the logged-in customer's own profile/wallet balance - derived from
// their JWT, not a URL param, so no one can look up another customer's data.
router.get('/me', requireCustomerAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, wallet_balance, created_at FROM customers WHERE id = $1',
      [req.customer.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
