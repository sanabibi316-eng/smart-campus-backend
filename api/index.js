require('dotenv').config();
const app = require('../app');
const connectDB = require('../config/db');

module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (error) {
    console.error('Database connection error in serverless function:', error);
    return res.status(500).json({
      success: false,
      message: 'Database connection failed. Please ensure MONGODB_URI is set correctly in Vercel Environment Variables and Network Access (0.0.0.0/0) is enabled in MongoDB Atlas.',
      error: error.message,
    });
  }

  return app(req, res);
};
