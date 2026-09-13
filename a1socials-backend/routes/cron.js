const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { getProviderAdapter } = require('../lib/providers');

const MAX_RETRIES = 3;
const STUCK_THRESHOLD_MINUTES = 10; // orders 'processing' longer than this get flagged

// Protect this endpoint so randoms can't trigger it.
// Vercel Cron automatically sends: Authorization: Bearer <CRON_SECRET>
// External schedulers (cron-job.org, etc.) should send the same header manually.
router.use((req, res, next) => {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Vercel Cron only ever sends GET requests, so this route accepts both
// GET (for Vercel/Netlify scheduled triggers) and POST (for manual/external calls).
router.all('/poll-orders', async (req, res) => {
  const summary = { placed: 0, updated: 0, failed: 0, refunded: 0 };

  try {
    // 1. Place orders that are still 'pending' (never sent to provider yet)
    const pendingResult = await db.query(
      `SELECT o.*, s.provider_id, s.provider_sku, s.category
       FROM orders o JOIN master_services s ON s.id = o.service_id
       WHERE o.status = 'pending' LIMIT 25`
    );

    for (const order of pendingResult.rows) {
      const providerResult = await db.query('SELECT * FROM providers WHERE id = $1', [order.provider_id]);
      const providerRow = providerResult.rows[0];
      if (!providerRow) continue;

      const adapter = getProviderAdapter(providerRow);
      const result = await adapter.placeOrder(order, order);

      if (result.success) {
        await db.query(
          `UPDATE orders SET status = 'processing', provider_order_id = $1, updated_at = now() WHERE id = $2`,
          [result.providerOrderId, order.id]
        );
        summary.placed++;
      } else {
        await handleFailure(order, result.raw);
        summary.failed++;
      }
    }

    // 2. Check status of orders already 'processing'
    const processingResult = await db.query(
      `SELECT o.*, s.provider_id
       FROM orders o JOIN master_services s ON s.id = o.service_id
       WHERE o.status = 'processing' AND o.provider_order_id IS NOT NULL LIMIT 50`
    );

    for (const order of processingResult.rows) {
      const providerResult = await db.query('SELECT * FROM providers WHERE id = $1', [order.provider_id]);
      const providerRow = providerResult.rows[0];
      if (!providerRow) continue;

      const adapter = getProviderAdapter(providerRow);
      const statusResult = await adapter.checkStatus(order.provider_order_id);

      if (statusResult.status === 'completed') {
        await db.query(`UPDATE orders SET status = 'completed', updated_at = now() WHERE id = $1`, [order.id]);
        summary.updated++;
      } else if (statusResult.status === 'failed') {
        await handleFailure(order, statusResult.raw);
        summary.failed++;
      }
      // 'processing' -> leave as is, will be checked again next run
    }

    // 3. Flag genuinely stuck orders (processing too long with no resolution)
    await db.query(
      `UPDATE orders SET failure_reason = 'stuck: exceeded processing threshold'
       WHERE status = 'processing' AND updated_at < now() - interval '${STUCK_THRESHOLD_MINUTES} minutes'
       AND (failure_reason IS NULL OR failure_reason != 'stuck: exceeded processing threshold')`
    );

    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shared failure handling: retry up to MAX_RETRIES, otherwise refund to wallet.
async function handleFailure(order, rawError) {
  if (order.retry_count < MAX_RETRIES) {
    await db.query(
      `UPDATE orders SET status = 'pending', retry_count = retry_count + 1,
       failure_reason = $1, updated_at = now() WHERE id = $2`,
      [JSON.stringify(rawError).slice(0, 500), order.id]
    );
    return;
  }

  // Exhausted retries - auto-refund to customer's wallet and mark failed.
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE customers SET wallet_balance = wallet_balance + $1 WHERE id = $2',
      [order.amount_charged, order.customer_id]
    );
    await client.query(
      `UPDATE orders SET status = 'refunded', failure_reason = $1, updated_at = now() WHERE id = $2`,
      [JSON.stringify(rawError).slice(0, 500), order.id]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
}

module.exports = router;
