const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const requireAdmin = require('../lib/requireAdmin');

router.use(requireAdmin);

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, base_url, status, balance, created_at FROM providers ORDER BY id'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, base_url, api_key, api_secret } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO providers (name, base_url, api_key, api_secret)
       VALUES ($1,$2,$3,$4) RETURNING id, name, base_url, status, balance, created_at`,
      [name, base_url, api_key, api_secret]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  const fields = req.body;
  const keys = Object.keys(fields);
  if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => fields[k]);

  try {
    const result = await db.query(
      `UPDATE providers SET ${setClause} WHERE id = $${keys.length + 1}
       RETURNING id, name, base_url, status, balance, created_at`,
      [...values, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
