const getRedisClient = require('../config/redis');

const QUEUE_NAME = 'task_queue';

/**
 * Push a task job onto the Redis queue.
 * Uses LPUSH so workers can BRPOP for FIFO ordering.
 */
const pushToQueue = async (taskId, operation, inputText) => {
  const redis = getRedisClient();

  const payload = JSON.stringify({
    taskId,
    operation,
    inputText,
    enqueuedAt: new Date().toISOString(),
  });

  await redis.lpush(QUEUE_NAME, payload);
  return payload;
};

module.exports = { pushToQueue, QUEUE_NAME };
