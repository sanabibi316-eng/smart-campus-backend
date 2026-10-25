require('dotenv').config();
const app = require('../app');
const connectDB = require('../config/db');

module.exports = async (req, res) => {
  // Fix Vercel path forwarding if rewritten
  if (req.headers['x-now-route-matches'] || req.url.startsWith('/api/index.js')) {
    const originalUrl = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'] || req.url;
    req.url = originalUrl.replace(/^\/api\/index\.js/, '') || '/';
  }

  // Connect to database for routes requiring it
  try {
    if (process.env.MONGODB_URI) {
      await connectDB();
    }
  } catch (error) {
    console.error('Database connection error in serverless function:', error);
    // If it's a health check, allow it through with warning
    if (req.url.includes('/health')) {
      return res.status(200).json({
        success: true,
        message: 'Smart Campus API is running (Database connection pending)',
        database: 'disconnected',
        error: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Database connection failed. Please ensure MONGODB_URI is configured in Vercel project Environment Variables and MongoDB Atlas allows 0.0.0.0/0.',
      error: error.message,
    });
  }

  return app(req, res);
};
