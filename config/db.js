const mongoose = require('mongoose');

let cachedConnection = null;

const connectDB = async () => {
  // If already connected, return cached connection immediately
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not defined in Vercel settings.');
  }

  try {
    const conn = await mongoose.connect(uri, {
      bufferCommands: false, // Prevents queries from hanging/buffering when disconnected
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    cachedConnection = conn;
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    cachedConnection = null;
    console.error(`MongoDB Connection Error: ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;
