require('dotenv').config();
const app = require('../app');
const connectDB = require('../config/db');

module.exports = async (req, res) => {
  // Fix Vercel path forwarding if rewritten
  if (req.headers['x-now-route-matches'] || req.url.startsWith('/api/index.js')) {
    const originalUrl = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'] || req.url;
    req.url = originalUrl.replace(/^\/api\/index\.js/, '') || '/';
  }

  // Pre-connect database for serverless handler
  if (process.env.MONGODB_URI) {
    try {
      await connectDB();
    } catch (e) {
      console.error('Failed to pre-connect DB in serverless handler:', e.message);
    }
  }

  return app(req, res);
};
