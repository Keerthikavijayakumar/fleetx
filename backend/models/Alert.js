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

module.exports = mongoose.model('Alert', alertSchema);
