const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const requireAdmin = require('../lib/requireAdmin');

router.use(requireAdmin);

// List all orders across all customers, with optional status/category filters -
// powers the admin order queue view.
router.get('/', async (req, res) => {
  const { status, category, limit } = req.query;
  const conditions = [];
  const values = [];

  if (status) { values.push(status); conditions.push(`o.status = $${values.length}`); }
  if (category) { values.push(category); conditions.push(`s.category = $${values.length}`); }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await db.query(
      `SELECT o.*, s.name as service_name, s.category, c.email as customer_email
       FROM orders o
       JOIN master_services s ON s.id = o.service_id
       JOIN customers c ON c.id = o.customer_id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT ${Number(limit) || 100}`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual override: admin marks an order complete/failed by hand
// (useful for edge cases the automated poller can't resolve).
router.patch('/:id/status', async (req, res) => {
  const { status, failure_reason } = req.body;
  const validStatuses = ['pending', 'processing', 'completed', 'failed', 'refunded'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    // If manually refunding an order that wasn't already refunded, credit the wallet.
    if (status === 'refunded' && order.status !== 'refunded') {
      await client.query(
        'UPDATE customers SET wallet_balance = wallet_balance + $1 WHERE id = $2',
        [order.amount_charged, order.customer_id]
      );
    }

    const result = await client.query(
      `UPDATE orders SET status = $1, failure_reason = $2, updated_at = now() WHERE id = $3 RETURNING *`,
      [status, failure_reason || order.failure_reason, req.params.id]
    );
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Quick dashboard stats: totals by status, revenue snapshot.
router.get('/stats/summary', async (req, res) => {
  try {
    const statusCounts = await db.query(
      `SELECT status, COUNT(*) as count FROM orders GROUP BY status`
    );
    const revenue = await db.query(
      `SELECT COALESCE(SUM(amount_charged),0) as total_revenue FROM orders WHERE status = 'completed'`
    );
    res.json({
      statusCounts: statusCounts.rows,
      totalRevenue: revenue.rows[0].total_revenue
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
