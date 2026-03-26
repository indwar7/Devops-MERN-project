require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');
const getRedisClient = require('./config/redis');

const PORT = parseInt(process.env.PORT, 10) || 3000;

const start = async () => {
  try {
    // Validate required environment variables
    const required = ['MONGO_URI', 'JWT_SECRET'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Connect to MongoDB
    await connectDB();

    // Initialize Redis connection (eager so health checks work immediately)
    getRedisClient();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        try {
          const { connection } = require('mongoose');
          await connection.close();
          console.log('MongoDB connection closed');

          const redis = getRedisClient();
          await redis.quit();
          console.log('Redis connection closed');
        } catch (err) {
          console.error(`Error during shutdown: ${err.message}`);
        }
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

start();
