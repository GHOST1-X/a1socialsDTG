const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const requireAdmin = require('../lib/requireAdmin');

// List all services, optionally filtered by category (smm / game_topup)
// Public route - the storefront calls this to display products.
router.get('/', async (req, res) => {
  const { category } = req.query;
  try {
    const result = category
      ? await db.query(
          'SELECT * FROM master_services WHERE category = $1 AND status = $2 ORDER BY id',
          [category, 'active']
        )
      : await db.query(
          'SELECT * FROM master_services WHERE status = $1 ORDER BY id',
          ['active']
        );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Everything below requires admin auth ---
router.use(requireAdmin);

router.post('/', async (req, res) => {
  const {
    category, name, description, provider_id, provider_sku,
    cost_price, sell_price, currency, requires_zone_id
  } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO master_services
       (category, name, description, provider_id, provider_sku, cost_price, sell_price, currency, requires_zone_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [category, name, description, provider_id, provider_sku, cost_price, sell_price, currency || 'NGN', requires_zone_id || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  const keys = Object.keys(fields);
  if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => fields[k]);

  try {
    const result = await db.query(
      `UPDATE master_services SET ${setClause}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE master_services SET status = $1 WHERE id = $2', ['disabled', req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
