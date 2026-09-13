const express = require('express');
const cors = require('cors');
require('dotenv').config();

const servicesRouter = require('../routes/services');
const ordersRouter = require('../routes/orders');
const cronRouter = require('../routes/cron');
const walletRouter = require('../routes/wallet');
const customersRouter = require('../routes/customers');
const authRouter = require('../routes/auth');
const providersRouter = require('../routes/providers');
const adminOrdersRouter = require('../routes/adminOrders');

const app = express();
app.use(cors()); // open by default; restrict to your storefront's domain before going live
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/services', servicesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/cron', cronRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/customers', customersRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin/providers', providersRouter);
app.use('/api/admin/orders', adminOrdersRouter);

module.exports = app;
