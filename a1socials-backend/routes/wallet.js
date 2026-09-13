const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../lib/db');
const requireCustomerAuth = require('../lib/requireCustomerAuth');

const FLW_BASE = 'https://api.flutterwave.com/v3';
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;

// Step 1: customer taps "Add funds" -> frontend calls this to get a payment
// reference + your public key, then opens Flutterwave's inline checkout.
router.post('/initiate', requireCustomerAuth, async (req, res) => {
  const customer_id = req.customer.id;
  const { amount } = req.body;
  const email = req.customer.email;
  if (!amount) {
    return res.status(400).json({ error: 'amount is required' });
  }

  const tx_ref = `wallet-${customer_id}-${Date.now()}`;

  try {
    // Record a pending funding attempt so we can verify/reconcile later
    await db.query(
      `INSERT INTO wallet_transactions (customer_id, tx_ref, amount, status)
       VALUES ($1, $2, $3, 'pending')`,
      [customer_id, tx_ref, amount]
    );

    res.json({
      tx_ref,
      amount,
      public_key: process.env.FLW_PUBLIC_KEY,
      customer_email: email
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Step 2: after Flutterwave's checkout completes, the frontend redirects here
// (or you call this manually) to verify the transaction actually succeeded
// before crediting the wallet. NEVER trust the frontend callback alone.
router.post('/verify', requireCustomerAuth, async (req, res) => {
  const { transaction_id, tx_ref } = req.body;
  if (!transaction_id || !tx_ref) {
    return res.status(400).json({ error: 'transaction_id and tx_ref are required' });
  }

  const client = await db.pool.connect();
  try {
    const verifyResponse = await axios.get(
      `${FLW_BASE}/transactions/${transaction_id}/verify`,
      { headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` } }
    );

    const data = verifyResponse.data.data;
    const txResult = await client.query(
      'SELECT * FROM wallet_transactions WHERE tx_ref = $1 AND customer_id = $2',
      [tx_ref, req.customer.id]
    );
    const walletTx = txResult.rows[0];
    if (!walletTx) return res.status(404).json({ error: 'Transaction not found' });
    if (walletTx.status === 'completed') {
      return res.json({ success: true, message: 'Already credited' });
    }

    const amountMatches = Number(data.amount) >= Number(walletTx.amount);
    const isSuccessful = data.status === 'successful' && data.tx_ref === tx_ref && amountMatches;

    if (!isSuccessful) {
      await client.query(
        `UPDATE wallet_transactions SET status = 'failed' WHERE tx_ref = $1`, [tx_ref]
      );
      return res.status(400).json({ success: false, error: 'Verification failed' });
    }

    await client.query('BEGIN');
    await client.query(
      'UPDATE customers SET wallet_balance = wallet_balance + $1 WHERE id = $2',
      [walletTx.amount, walletTx.customer_id]
    );
    await client.query(
      `UPDATE wallet_transactions SET status = 'completed', flw_transaction_id = $1 WHERE tx_ref = $2`,
      [transaction_id, tx_ref]
    );
    await client.query('COMMIT');

    res.json({ success: true, message: 'Wallet credited' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Optional but recommended: Flutterwave webhook as a backup path, in case the
// customer closes the browser tab before the /verify call fires.
router.post('/webhook', express.json(), async (req, res) => {
  const signature = req.headers['verif-hash'];
  if (!signature || signature !== process.env.FLW_WEBHOOK_SECRET) {
    return res.status(401).end();
  }

  const event = req.body;
  if (event.data && event.data.status === 'successful') {
    const tx_ref = event.data.tx_ref;
    const client = await db.pool.connect();
    try {
      const txResult = await client.query(
        'SELECT * FROM wallet_transactions WHERE tx_ref = $1 AND status != $2',
        [tx_ref, 'completed']
      );
      const walletTx = txResult.rows[0];
      if (walletTx) {
        await client.query('BEGIN');
        await client.query(
          'UPDATE customers SET wallet_balance = wallet_balance + $1 WHERE id = $2',
          [walletTx.amount, walletTx.customer_id]
        );
        await client.query(
          `UPDATE wallet_transactions SET status = 'completed', flw_transaction_id = $1 WHERE tx_ref = $2`,
          [event.data.id, tx_ref]
        );
        await client.query('COMMIT');
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
    }
  }

  res.status(200).end();
});

module.exports = router;
