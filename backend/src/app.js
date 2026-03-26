const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const getRedisClient = require('./config/redis');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');

const app = express();

// ---------------------------------------------------------------------------
// Security & parsing middleware
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Rate limiter: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(limiter);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

/**
 * GET /health
 * Liveness probe -- checks MongoDB and Redis connectivity.
 */
app.get('/health', async (_req, res) => {
  const checks = { mongo: 'unknown', redis: 'unknown' };

  try {
    // MongoDB
    const mongoState = mongoose.connection.readyState;
    checks.mongo = mongoState === 1 ? 'ok' : 'disconnected';

    // Redis
    const redis = getRedisClient();
    const pong = await redis.ping();
    checks.redis = pong === 'PONG' ? 'ok' : 'degraded';
  } catch (err) {
    checks.redis = 'error';
  }

  const healthy = checks.mongo === 'ok' && checks.redis === 'ok';
  const statusCode = healthy ? 200 : 503;

  res.status(statusCode).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks,
    uptime: process.uptime(),
  });
});

/**
 * GET /health/ready
 * Kubernetes readiness probe -- only returns 200 when the service can
 * accept traffic (DB connected, Redis reachable).
 */
app.get('/health/ready', async (_req, res) => {
  try {
    const mongoReady = mongoose.connection.readyState === 1;
    if (!mongoReady) {
      return res.status(503).json({ ready: false, reason: 'MongoDB not connected' });
    }

    const redis = getRedisClient();
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      return res.status(503).json({ ready: false, reason: 'Redis not responding' });
    }

    res.json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false, reason: err.message });
  }
});

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error(`Unhandled error: ${err.stack || err.message}`);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

module.exports = app;
