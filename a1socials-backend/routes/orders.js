const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const requireCustomerAuth = require('../lib/requireCustomerAuth');

router.use(requireCustomerAuth);

// Create a new order. Wallet is debited immediately; fulfillment happens async
// via the cron poller (see routes/cron.js), so the customer gets an instant
// response instead of waiting on the upstream provider API.
router.post('/', async (req, res) => {
  const customer_id = req.customer.id; // from JWT, not the request body
  const { service_id, quantity, player_id, zone_id, target_link } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const serviceResult = await client.query(
      'SELECT * FROM master_services WHERE id = $1 AND status = $2',
      [service_id, 'active']
    );
    const service = serviceResult.rows[0];
    if (!service) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Service not found or inactive' });
    }

    if (service.requires_zone_id && !zone_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'zone_id is required for this service' });
    }

    const amount = Number(service.sell_price) * (quantity || 1);

    const customerResult = await client.query(
      'SELECT * FROM customers WHERE id = $1 FOR UPDATE',
      [customer_id]
    );
    const customer = customerResult.rows[0];
    if (!customer) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
    }
    if (Number(customer.wallet_balance) < amount) {
      await client.query('ROLLBACK');
      return res.status(402).json({ error: 'Insufficient wallet balance' });
    }

    await client.query(
      'UPDATE customers SET wallet_balance = wallet_balance - $1 WHERE id = $2',
      [amount, customer_id]
    );

    const orderResult = await client.query(
      `INSERT INTO orders
       (customer_id, service_id, quantity, player_id, zone_id, target_link, amount_charged, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
      [customer_id, service_id, quantity || 1, player_id, zone_id, target_link, amount]
    );

    await client.query('COMMIT');
    res.status(201).json(orderResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Get a single order's status (for the customer dashboard to poll/refresh)
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM orders WHERE id = $1 AND customer_id = $2',
      [req.params.id, req.customer.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List orders for the logged-in customer, optionally filtered by category -
// powers the two separate dashboard sections (SMM vs game top-ups) from one endpoint.
router.get('/', async (req, res) => {
  const { category } = req.query;
  const customer_id = req.customer.id;
  try {
    const result = await db.query(
      `SELECT o.*, s.name as service_name, s.category
       FROM orders o
       JOIN master_services s ON s.id = o.service_id
       WHERE o.customer_id = $1 ${category ? 'AND s.category = $2' : ''}
       ORDER BY o.created_at DESC`,
      category ? [customer_id, category] : [customer_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
