// Entry point for Vercel serverless functions.
// Vercel's Node.js runtime accepts a standard (req, res) handler, and an
// Express app IS one - so we export it directly. (Earlier versions of this
// file used `serverless-http`, which wraps for AWS Lambda's event/context
// signature, not Vercel's - that caused requests to hang until timeout.)

const app = require('../lib/app');

module.exports = app;
