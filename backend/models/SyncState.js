const mongoose = require('mongoose');

const syncStateSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, trim: true },
    lastSuccessfulDate: { type: Date, default: null },
    lastRunAt: { type: Date, default: null },
    status: { type: String, enum: ['idle', 'running', 'success', 'failed', 'no-op'], default: 'idle' },
    message: { type: String, default: '' },
    sourceFile: { type: String, default: '' },
    sourceHash: { type: String, default: '' },
    sourceRows: { type: Number, default: 0 },
    lastSummary: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: Date.now },
});

syncStateSchema.pre('save', function preSave(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('SyncState', syncStateSchema);
