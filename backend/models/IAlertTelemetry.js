const mongoose = require('mongoose');

const ialertTelemetrySchema = new mongoose.Schema({
    registrationNumber: { type: String, required: true, trim: true },
    obuId: { type: String, default: '', trim: true },
    vinNumber: { type: String, default: '', trim: true },
    vehicleType: { type: String, default: '', trim: true },

    timestamp: { type: Date, required: true },
    dateKey: { type: String, required: true, trim: true },

    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    location: { type: String, default: '', trim: true },
    altitudeM: { type: Number, default: null },

    ignitionStatus: { type: String, enum: ['ON', 'OFF', 'UNKNOWN'], default: 'UNKNOWN' },
    vehicleSpeedKmph: { type: Number, default: 0 },
    odometerKm: { type: Number, default: null },
    engineHours: { type: Number, default: null },
    currentGear: { type: Number, default: null },

    fuelConsumption: { type: Number, default: null },
    fuelLevel: { type: Number, default: null },

    engineSpeedRpm: { type: Number, default: null },
    coolantTempC: { type: Number, default: null },
    oilPressureKpa: { type: Number, default: null },
    exhaustTempC: { type: Number, default: null },

    batteryVoltage: { type: Number, default: null },
    airPressure1Kpa: { type: Number, default: null },
    airPressure2Kpa: { type: Number, default: null },

    defLevelLtr: { type: Number, default: null },
    defConsumptionLtr: { type: Number, default: null },
    defTankTempC: { type: Number, default: null },

    sourceFile: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now },
});

ialertTelemetrySchema.index({ registrationNumber: 1, timestamp: 1 }, { unique: true });
ialertTelemetrySchema.index({ dateKey: 1, registrationNumber: 1 });

// TTL: auto-delete telemetry older than TELEMETRY_RETENTION_DAYS (default 90 days)
const telemetryRetentionSecs = Number(process.env.TELEMETRY_RETENTION_DAYS || 90) * 24 * 60 * 60;
ialertTelemetrySchema.index({ timestamp: 1 }, { expireAfterSeconds: telemetryRetentionSecs });

// ── Indexes for aggregation sort/match performance ─────────────────────────────
// getLatestPositions: $sort { registrationNumber:1, timestamp:-1 } (mixed dir — needs own index)
ialertTelemetrySchema.index({ registrationNumber: 1, timestamp: -1 });
// getEngineHealth: $sort { timestamp:-1 } across entire collection
ialertTelemetrySchema.index({ timestamp: -1 });
// getOverspeedEvents / getOverspeedRanking: $match on vehicleSpeedKmph + timestamp range
ialertTelemetrySchema.index({ vehicleSpeedKmph: 1, registrationNumber: 1, timestamp: 1 });
// getIdleSessions: $match ignitionStatus + vehicleSpeedKmph + optional reg + timestamp
ialertTelemetrySchema.index({ ignitionStatus: 1, vehicleSpeedKmph: 1, registrationNumber: 1, timestamp: 1 });
// getUnderusedTrucks / getMonthlyDistanceTrend: $match timestamp range + odometerKm not null
ialertTelemetrySchema.index({ timestamp: 1, odometerKm: 1, registrationNumber: 1 });
// getFuelEfficiencyRanking: $match fuelConsumption > 0, odometerKm not null
ialertTelemetrySchema.index({ fuelConsumption: 1, odometerKm: 1, registrationNumber: 1 });

module.exports = mongoose.model('IAlertTelemetry', ialertTelemetrySchema);
