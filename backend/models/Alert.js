const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
    registrationNumber: { type: String, required: true, trim: true, index: true },
    category: {
        type: String,
        enum: ['overspeed', 'idle', 'battery', 'airPressure', 'def', 'engineHeat', 'fuelAnomaly', 'geofence', 'general'],
        required: true,
    },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
    message: { type: String, required: true, trim: true },
    timestamp: { type: Date, default: Date.now, index: true },
    status: { type: String, enum: ['active', 'acknowledged', 'resolved'], default: 'active', index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

alertSchema.index({ status: 1, timestamp: -1 });
alertSchema.index({ registrationNumber: 1, category: 1, status: 1 });
// TTL: auto-delete resolved/acknowledged alerts after 60 days
alertSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60, partialFilterExpression: { status: { $in: ['resolved', 'acknowledged'] } } });

module.exports = mongoose.model('Alert', alertSchema);
