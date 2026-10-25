require('dotenv').config();
const app = require('../app');
const connectDB = require('../config/db');

module.exports = async (req, res) => {
  // Fix Vercel path forwarding if rewritten
  if (req.headers['x-now-route-matches'] || req.url.startsWith('/api/index.js')) {
    const originalUrl = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'] || req.url;
    req.url = originalUrl.replace(/^\/api\/index\.js/, '') || '/';
  }

  // Ensure DB is connected BEFORE passing to express routes (except public health)
  const isHealthCheck = req.url === '/' || req.url === '/api/v1/health';

  try {
    await connectDB();
  } catch (error) {
    console.error('Database connection error in serverless function:', error);
    if (isHealthCheck) {
      return res.status(200).json({
        success: true,
        message: 'Smart Campus API is running, but database connection is pending.',
        databaseStatus: 'disconnected',
        error: error.message,
      });
    }
    return res.status(503).json({
      success: false,
      message: 'Database connection failed. Please ensure MONGODB_URI is added in Vercel Environment Variables and MongoDB Atlas Network Access has 0.0.0.0/0 enabled.',
      error: error.message,
    });
  }

  return app(req, res);
};
