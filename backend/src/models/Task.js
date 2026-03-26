const mongoose = require('mongoose');

const OPERATIONS = ['uppercase', 'lowercase', 'reverse', 'wordcount'];
const STATUSES = ['pending', 'running', 'success', 'failed'];

const taskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [256, 'Title must be at most 256 characters'],
    },
    inputText: {
      type: String,
      required: [true, 'Input text is required'],
      maxlength: [50000, 'Input text must be at most 50000 characters'],
    },
    operation: {
      type: String,
      required: [true, 'Operation is required'],
      enum: {
        values: OPERATIONS,
        message: `Operation must be one of: ${OPERATIONS.join(', ')}`,
      },
    },
    status: {
      type: String,
      enum: {
        values: STATUSES,
        message: `Status must be one of: ${STATUSES.join(', ')}`,
      },
      default: 'pending',
      index: true,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    logs: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ createdAt: -1 });
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ userId: 1, createdAt: -1 });

taskSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Task', taskSchema);
module.exports.OPERATIONS = OPERATIONS;
module.exports.STATUSES = STATUSES;
