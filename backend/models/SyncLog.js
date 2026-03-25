const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema({
    jobName: { type: String, required: true, trim: true },
    status: { type: String, enum: ['running', 'success', 'failed', 'no-op'], default: 'running' },
    message: { type: String, default: '' },
    rangeStart: { type: Date, default: null },
    rangeEnd: { type: Date, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
});

syncLogSchema.index({ jobName: 1, startedAt: -1 });
// TTL: auto-delete sync logs older than 30 days
syncLogSchema.index({ startedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('SyncLog', syncLogSchema);
