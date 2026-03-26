const Redis = require('ioredis');

let client = null;

const getRedisClient = () => {
  if (client) {
    return client;
  }

  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  client = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) {
        console.error('Redis: max retry attempts reached, giving up');
        return null;
      }
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
    reconnectOnError(err) {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e));
    },
  });

  client.on('connect', () => {
    console.log('Redis connected');
  });

  client.on('error', (err) => {
    console.error(`Redis error: ${err.message}`);
  });

  return client;
};

module.exports = getRedisClient;
