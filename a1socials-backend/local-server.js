// Use this to run + test the backend on your own machine before deploying.
// Not used in production on Vercel/Netlify (they use api/index.js instead).

const app = require('./lib/app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`A1SOCIALS backend running locally on http://localhost:${PORT}`);
});
