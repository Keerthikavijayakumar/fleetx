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

module.exports = mongoose.model('IAlertTelemetry', ialertTelemetrySchema);
