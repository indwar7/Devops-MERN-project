const express = require('express');
const mongoose = require('mongoose');
const { body, param, query } = require('express-validator');
const Task = require('../models/Task');
const { OPERATIONS } = require('../models/Task');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { pushToQueue } = require('../utils/queue');

const router = express.Router();

// All task routes require authentication
router.use(auth);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const createTaskValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 256 })
    .withMessage('Title must be at most 256 characters'),
  body('inputText')
    .notEmpty()
    .withMessage('Input text is required')
    .isLength({ max: 50000 })
    .withMessage('Input text must be at most 50000 characters'),
  body('operation')
    .notEmpty()
    .withMessage('Operation is required')
    .isIn(OPERATIONS)
    .withMessage(`Operation must be one of: ${OPERATIONS.join(', ')}`),
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: MAX_LIMIT })
    .withMessage(`Limit must be between 1 and ${MAX_LIMIT}`)
    .toInt(),
  query('status')
    .optional()
    .isIn(['pending', 'running', 'success', 'failed'])
    .withMessage('Invalid status filter'),
];

const objectIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid task ID'),
];

/**
 * GET /api/tasks/stats
 * Get task counts grouped by status for the authenticated user.
 */
router.get('/stats', async (req, res) => {
  try {
    const pipeline = [
      { $match: { userId: new mongoose.Types.ObjectId(req.userId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ];
    const results = await Task.aggregate(pipeline);

    const stats = { total: 0, pending: 0, running: 0, success: 0, failed: 0 };
    results.forEach(({ _id, count }) => {
      if (stats[_id] !== undefined) stats[_id] = count;
      stats.total += count;
    });

    res.json(stats);
  } catch (err) {
    console.error(`Stats error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/tasks
 * Create a new task and push to Redis queue.
 */
router.post('/', validate(createTaskValidation), async (req, res) => {
  try {
    const { title, inputText, operation } = req.body;

    const task = new Task({
      userId: req.userId,
      title,
      inputText,
      operation,
      status: 'pending',
      logs: [`Task created at ${new Date().toISOString()}`],
    });

    await task.save();

    await pushToQueue(task._id.toString(), operation, inputText);
    task.logs.push(`Enqueued at ${new Date().toISOString()}`);
    await task.save();

    res.status(201).json({
      message: 'Task created and queued',
      task: task.toJSON(),
    });
  } catch (err) {
    console.error(`Create task error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/tasks
 * List tasks for the authenticated user with pagination.
 */
router.get('/', validate(paginationValidation), async (req, res) => {
  try {
    const page = req.query.page || DEFAULT_PAGE;
    const limit = req.query.limit || DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const filter = { userId: req.userId };
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Task.countDocuments(filter),
    ]);

    res.json({
      tasks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(`List tasks error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/tasks/:id
 * Get a single task detail, scoped to the authenticated user.
 */
router.get('/:id', validate(objectIdValidation), async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.userId,
    }).lean();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ task });
  } catch (err) {
    console.error(`Get task error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/tasks/:id/run
 * Re-run a task: push to Redis queue and reset status to pending.
 */
router.post('/:id/run', validate(objectIdValidation), async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    task.status = 'pending';
    task.result = null;
    task.logs.push(`Re-run requested at ${new Date().toISOString()}`);
    await task.save();

    await pushToQueue(task._id.toString(), task.operation, task.inputText);
    task.logs.push(`Enqueued at ${new Date().toISOString()}`);
    await task.save();

    res.json({
      message: 'Task queued for execution',
      task: task.toJSON(),
    });
  } catch (err) {
    console.error(`Run task error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
