/**
 * Telemetry Analytics Service
 * Queries IAlertTelemetry for all fleet intelligence features.
 */

const IAlertTelemetry = require('../models/IAlertTelemetry');
const Truck = require('../models/Truck');
const Alert = require('../models/Alert');

// ─── Thresholds ────────────────────────────────────────────────────────────────
const THRESHOLDS = {
    overspeedKmph: 80,
    idleMinutes: 5,
    batteryLowV: 11.5,
    airPressureLowKpa: 600,
    defLevelLowPct: 10,
    coolantHighC: 100,
    exhaustHighC: 600,
    oilPressureLowKpa: 100,
    fuelDropAnomalyL: 20,
};

// ─── 1. Fleet Summary KPIs ─────────────────────────────────────────────────────
async function getFleetSummary() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6);

    const [trucks, todayTelemetry] = await Promise.all([
        Truck.find({}, 'registrationNumber status').lean(),
        IAlertTelemetry.find({ timestamp: { $gte: todayStart } }).lean(),
    ]);

    // Active trucks = seen in telemetry today
    const activeTruckIds = new Set(todayTelemetry.map(t => t.registrationNumber));
    const distinctTrucks = [...new Set(todayTelemetry.map(t => t.registrationNumber))];

    // Distance today per truck (max odometer - min odometer)
    const odometerByTruck = {};
    for (const t of todayTelemetry) {
        if (t.odometerKm == null) continue;
        if (!odometerByTruck[t.registrationNumber]) {
            odometerByTruck[t.registrationNumber] = { min: t.odometerKm, max: t.odometerKm };
        } else {
            if (t.odometerKm < odometerByTruck[t.registrationNumber].min) odometerByTruck[t.registrationNumber].min = t.odometerKm;
            if (t.odometerKm > odometerByTruck[t.registrationNumber].max) odometerByTruck[t.registrationNumber].max = t.odometerKm;
        }
    }
    const totalDistanceToday = Object.values(odometerByTruck)
        .reduce((sum, { min, max }) => sum + Math.max(0, max - min), 0);

    // Fuel consumed today
    const totalFuelToday = todayTelemetry.reduce((sum, t) => sum + (t.fuelConsumption || 0), 0);

    // Unread alerts count
    const unreadAlerts = await Alert.countDocuments({ status: 'active' });

    return {
        totalTrucks: trucks.length,
        activeTrucksToday: activeTruckIds.size,
        idleTrucks: trucks.length - activeTruckIds.size,
        totalDistanceTodayKm: parseFloat(totalDistanceToday.toFixed(1)),
        totalFuelTodayL: parseFloat(totalFuelToday.toFixed(1)),
        unreadAlerts,
    };
}

// ─── 2. GPS Route History ──────────────────────────────────────────────────────
async function getGpsHistory({ registrationNumber, from, to, limit = 2000 }) {
    const filter = { registrationNumber };
    if (from || to) {
        filter.timestamp = {};
        if (from) filter.timestamp.$gte = new Date(from);
        if (to) filter.timestamp.$lte = new Date(to);
    }
    const rows = await IAlertTelemetry
        .find(filter, 'timestamp latitude longitude vehicleSpeedKmph ignitionStatus')
        .sort({ timestamp: 1 })
        .limit(limit)
        .lean();
    return rows.filter(r => r.latitude != null && r.longitude != null);
}

// ─── 3. All trucks latest position ────────────────────────────────────────────
async function getLatestPositions() {
    const rows = await IAlertTelemetry.aggregate([
        { $sort: { registrationNumber: 1, timestamp: -1 } },
        {
            $group: {
                _id: '$registrationNumber',
                timestamp: { $first: '$timestamp' },
                latitude: { $first: '$latitude' },
                longitude: { $first: '$longitude' },
                vehicleSpeedKmph: { $first: '$vehicleSpeedKmph' },
                ignitionStatus: { $first: '$ignitionStatus' },
                fuelLevel: { $first: '$fuelLevel' },
                odometerKm: { $first: '$odometerKm' },
                location: { $first: '$location' },
            },
        },
        // Expose registrationNumber as a proper named field alongside _id
        { $addFields: { registrationNumber: '$_id' } },
    ]);
    return rows.filter(r => r.latitude != null && r.longitude != null);
}

// ─── 4. Trips (from Route model via IAlertTelemetry ignition events) ──────────
async function getTripList({ registrationNumber, from, to, page = 1, limit = 50 }) {
    const Route = require('../models/Route');
    const regFilter = registrationNumber
        ? { externalTripKey: { $regex: `^${registrationNumber}_` } }
        : {};

    const dateFilter = {};
    if (from || to) {
        dateFilter.$or = [];
        const tripStartTimeCond = {};
        const startTimeCond = {};
        if (from) {
            tripStartTimeCond.$gte = new Date(from);
            startTimeCond.$gte = new Date(from);
        }
        if (to) {
            tripStartTimeCond.$lte = new Date(to);
            startTimeCond.$lte = new Date(to);
        }
        dateFilter.$or.push({ tripStartTime: tripStartTimeCond }, { startTime: startTimeCond });
    }

    const q = { sourceSystem: 'ialert_csv', ...regFilter, ...dateFilter };
    const [trips, total] = await Promise.all([
        Route.find(q).sort({ tripStartTime: -1, startTime: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Route.countDocuments(q),
    ]);

    return { trips, total, page, pages: Math.ceil(total / limit) };
}

// ─── 5. Overspeed violations ──────────────────────────────────────────────────
async function getOverspeedEvents({ registrationNumber, from, to, threshold = THRESHOLDS.overspeedKmph }) {
    const filter = { vehicleSpeedKmph: { $gt: threshold } };
    if (registrationNumber) filter.registrationNumber = registrationNumber;
    if (from || to) {
        filter.timestamp = {};
        if (from) filter.timestamp.$gte = new Date(from);
        if (to) filter.timestamp.$lte = new Date(to);
    }
    const rows = await IAlertTelemetry
        .find(filter, 'registrationNumber timestamp vehicleSpeedKmph latitude longitude location')
        .sort({ vehicleSpeedKmph: -1 })
        .limit(500)
        .lean();
    return rows;
}

// ─── 6. Driver overspeed ranking ──────────────────────────────────────────────
async function getOverspeedRanking({ from, to, threshold = THRESHOLDS.overspeedKmph }) {
    const match = { vehicleSpeedKmph: { $gt: threshold } };
    if (from || to) {
        match.timestamp = {};
        if (from) match.timestamp.$gte = new Date(from);
        if (to) match.timestamp.$lte = new Date(to);
    }
    const rows = await IAlertTelemetry.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$registrationNumber',
                violations: { $sum: 1 },
                maxSpeedKmph: { $max: '$vehicleSpeedKmph' },
                avgSpeedKmph: { $avg: '$vehicleSpeedKmph' },
            },
        },
        { $sort: { violations: -1 } },
        { $limit: 20 },
        { $project: { registrationNumber: '$_id', violations: 1, maxSpeedKmph: { $round: ['$maxSpeedKmph', 1] }, avgSpeedKmph: { $round: ['$avgSpeedKmph', 1] }, _id: 0 } },
    ]);
    return rows;
}

// ─── 7. Idle sessions ─────────────────────────────────────────────────────────
async function getIdleSessions({ registrationNumber, from, to }) {
    const match = { ignitionStatus: 'ON', vehicleSpeedKmph: 0 };
    if (registrationNumber) match.registrationNumber = registrationNumber;
    if (from || to) {
        match.timestamp = {};
        if (from) match.timestamp.$gte = new Date(from);
        if (to) match.timestamp.$lte = new Date(to);
    }

    const rows = await IAlertTelemetry
        .find(match, 'registrationNumber timestamp fuelConsumption')
        .sort({ registrationNumber: 1, timestamp: 1 })
        .lean();

    // Group consecutive idle points (< 10-min gap) into sessions
    const sessions = [];
    let current = null;
    for (const r of rows) {
        if (!current || current.registrationNumber !== r.registrationNumber) {
            if (current && current.durationMin >= THRESHOLDS.idleMinutes) sessions.push(current);
            current = { registrationNumber: r.registrationNumber, start: r.timestamp, end: r.timestamp, points: 1, fuelLost: r.fuelConsumption || 0 };
        } else {
            const gapMin = (r.timestamp - current.end) / 60000;
            if (gapMin <= 10) {
                current.end = r.timestamp;
                current.points++;
                current.fuelLost += (r.fuelConsumption || 0);
            } else {
                if (current.durationMin >= THRESHOLDS.idleMinutes) sessions.push(current);
                current = { registrationNumber: r.registrationNumber, start: r.timestamp, end: r.timestamp, points: 1, fuelLost: r.fuelConsumption || 0 };
            }
        }
        if (current) current.durationMin = (current.end - current.start) / 60000;
    }
    if (current && current.durationMin >= THRESHOLDS.idleMinutes) sessions.push(current);

    return sessions.map(s => ({
        registrationNumber: s.registrationNumber,
        start: s.start,
        end: s.end,
        durationMin: parseFloat(s.durationMin.toFixed(1)),
        fuelLostL: parseFloat(s.fuelLost.toFixed(2)),
    })).sort((a, b) => b.durationMin - a.durationMin).slice(0, 200);
}

// ─── 8. Fuel efficiency ranking ───────────────────────────────────────────────
async function getFuelEfficiencyRanking({ registrationNumber, from, to } = {}) {
    const match = { fuelConsumption: { $gt: 0 }, odometerKm: { $ne: null } };
    if (registrationNumber) match.registrationNumber = registrationNumber;
    if (from || to) {
        match.timestamp = {};
        if (from) match.timestamp.$gte = new Date(from);
        if (to) match.timestamp.$lte = new Date(to);
    }

    const rows = await IAlertTelemetry.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$registrationNumber',
                totalFuel: { $sum: '$fuelConsumption' },
                minOdo: { $min: '$odometerKm' },
                maxOdo: { $max: '$odometerKm' },
                avgFuelLevel: { $avg: '$fuelLevel' },
            },
        },
        {
            $project: {
                registrationNumber: '$_id',
                _id: 0,
                totalFuelL: { $round: ['$totalFuel', 2] },
                distanceKm: { $round: [{ $subtract: ['$maxOdo', '$minOdo'] }, 1] },
                avgFuelLevel: { $round: ['$avgFuelLevel', 1] },
                kmPerLitre: {
                    $cond: [
                        { $gt: ['$totalFuel', 0] },
                        { $round: [{ $divide: [{ $subtract: ['$maxOdo', '$minOdo'] }, '$totalFuel'] }, 2] },
                        0,
                    ],
                },
            },
        },
        { $sort: { kmPerLitre: -1 } },
    ]);
    return rows;
}

// ─── 9. Fuel anomaly detection (theft) ────────────────────────────────────────
async function getFuelAnomalies({ registrationNumber, from, to } = {}) {
    const match = { fuelLevel: { $ne: null }, ignitionStatus: 'OFF' };
    if (registrationNumber) match.registrationNumber = registrationNumber;
    if (from || to) {
        match.timestamp = {};
        if (from) match.timestamp.$gte = new Date(from);
        if (to) match.timestamp.$lte = new Date(to);
    }

    const rows = await IAlertTelemetry
        .find(match, 'registrationNumber timestamp fuelLevel vehicleSpeedKmph location')
        .sort({ registrationNumber: 1, timestamp: 1 })
        .lean();

    const anomalies = [];
    let prev = null;
    for (const r of rows) {
        if (prev && prev.registrationNumber === r.registrationNumber) {
            const drop = prev.fuelLevel - r.fuelLevel;
            const gapMin = (r.timestamp - prev.timestamp) / 60000;
            if (drop >= THRESHOLDS.fuelDropAnomalyL && r.vehicleSpeedKmph === 0 && gapMin <= 60) {
                anomalies.push({
                    registrationNumber: r.registrationNumber,
                    timestamp: r.timestamp,
                    dropLitres: parseFloat(drop.toFixed(2)),
                    location: r.location || '',
                });
            }
        }
        prev = r;
    }
    return anomalies.sort((a, b) => b.dropLitres - a.dropLitres).slice(0, 100);
}

// ─── 10. Engine health per truck ──────────────────────────────────────────────
async function getEngineHealth({ registrationNumber } = {}) {
    const match = {};
    if (registrationNumber) match.registrationNumber = registrationNumber;

    // Get latest reading per truck
    const latest = await IAlertTelemetry.aggregate([
        { $match: match },
        { $sort: { timestamp: -1 } },
        {
            $group: {
                _id: '$registrationNumber',
                timestamp: { $first: '$timestamp' },
                coolantTempC: { $first: '$coolantTempC' },
                oilPressureKpa: { $first: '$oilPressureKpa' },
                exhaustTempC: { $first: '$exhaustTempC' },
                engineSpeedRpm: { $first: '$engineSpeedRpm' },
                batteryVoltage: { $first: '$batteryVoltage' },
                airPressure1Kpa: { $first: '$airPressure1Kpa' },
                airPressure2Kpa: { $first: '$airPressure2Kpa' },
                defLevelLtr: { $first: '$defLevelLtr' },
                defTankTempC: { $first: '$defTankTempC' },
                fuelLevel: { $first: '$fuelLevel' },
            },
        },
    ]);

    return latest.map(t => {
        const warnings = [];
        if (t.coolantTempC != null && t.coolantTempC > THRESHOLDS.coolantHighC) warnings.push(`Coolant high (${t.coolantTempC}°C)`);
        if (t.exhaustTempC != null && t.exhaustTempC > THRESHOLDS.exhaustHighC) warnings.push(`Exhaust high (${t.exhaustTempC}°C)`);
        if (t.oilPressureKpa != null && t.oilPressureKpa < THRESHOLDS.oilPressureLowKpa) warnings.push(`Oil pressure low (${t.oilPressureKpa} kPa)`);
        if (t.batteryVoltage != null && t.batteryVoltage < THRESHOLDS.batteryLowV) warnings.push(`Battery low (${t.batteryVoltage}V)`);
        if (t.airPressure1Kpa != null && t.airPressure1Kpa < THRESHOLDS.airPressureLowKpa) warnings.push(`Air P1 low (${t.airPressure1Kpa} kPa)`);
        if (t.airPressure2Kpa != null && t.airPressure2Kpa < THRESHOLDS.airPressureLowKpa) warnings.push(`Air P2 low (${t.airPressure2Kpa} kPa)`);
        if (t.defLevelLtr != null && t.defLevelLtr < THRESHOLDS.defLevelLowPct) warnings.push(`DEF low (${t.defLevelLtr} L)`);

        return {
            registrationNumber: t._id,
            timestamp: t.timestamp,
            coolantTempC: t.coolantTempC,
            oilPressureKpa: t.oilPressureKpa,
            exhaustTempC: t.exhaustTempC,
            engineSpeedRpm: t.engineSpeedRpm,
            batteryVoltage: t.batteryVoltage,
            airPressure1Kpa: t.airPressure1Kpa,
            airPressure2Kpa: t.airPressure2Kpa,
            defLevelLtr: t.defLevelLtr,
            defTankTempC: t.defTankTempC,
            fuelLevel: t.fuelLevel,
            health: warnings.length === 0 ? 'good' : warnings.length <= 2 ? 'warning' : 'critical',
            warnings,
        };
    });
}

// ─── 11. Speed chart over time for a truck ────────────────────────────────────
async function getSpeedTrend({ registrationNumber, from, to, bucketMinutes = 15 }) {
    const match = { registrationNumber, vehicleSpeedKmph: { $exists: true } };
    if (from || to) {
        match.timestamp = {};
        if (from) match.timestamp.$gte = new Date(from);
        if (to) match.timestamp.$lte = new Date(to);
    }
    const rows = await IAlertTelemetry
        .find(match, 'timestamp vehicleSpeedKmph')
        .sort({ timestamp: 1 })
        .lean();

    // Bucket into intervals
    const bucketMs = bucketMinutes * 60 * 1000;
    const buckets = {};
    for (const r of rows) {
        const key = Math.floor(r.timestamp.getTime() / bucketMs) * bucketMs;
        if (!buckets[key]) buckets[key] = { sum: 0, count: 0, max: 0 };
        buckets[key].sum += r.vehicleSpeedKmph;
        buckets[key].count++;
        if (r.vehicleSpeedKmph > buckets[key].max) buckets[key].max = r.vehicleSpeedKmph;
    }
    return Object.entries(buckets)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([ts, b]) => ({
            time: new Date(Number(ts)).toISOString(),
            avgSpeed: parseFloat((b.sum / b.count).toFixed(1)),
            maxSpeed: b.max,
        }));
}

// ─── 12. Monthly distance trend ───────────────────────────────────────────────
async function getMonthlyDistanceTrend({ registrationNumber } = {}) {
    const match = { odometerKm: { $ne: null } };
    if (registrationNumber) match.registrationNumber = registrationNumber;

    const rows = await IAlertTelemetry.aggregate([
        { $match: match },
        {
            $group: {
                _id: {
                    truck: '$registrationNumber',
                    month: { $substr: ['$dateKey', 0, 7] },
                },
                minOdo: { $min: '$odometerKm' },
                maxOdo: { $max: '$odometerKm' },
            },
        },
        {
            $project: {
                _id: 0,
                registrationNumber: '$_id.truck',
                month: '$_id.month',
                distanceKm: { $round: [{ $subtract: ['$maxOdo', '$minOdo'] }, 1] },
            },
        },
        { $sort: { month: 1 } },
    ]);
    return rows;
}

// ─── 13. Air / Battery / DEF trend for a truck ────────────────────────────────
async function getSystemParamsTrend({ registrationNumber, from, to, bucketMinutes = 30 }) {
    const match = { registrationNumber };
    if (from || to) {
        match.timestamp = {};
        if (from) match.timestamp.$gte = new Date(from);
        if (to) match.timestamp.$lte = new Date(to);
    }
    const rows = await IAlertTelemetry
        .find(match, 'timestamp batteryVoltage airPressure1Kpa airPressure2Kpa defLevelLtr coolantTempC')
        .sort({ timestamp: 1 })
        .lean();

    const bucketMs = bucketMinutes * 60 * 1000;
    const buckets = {};
    for (const r of rows) {
        const key = Math.floor(r.timestamp.getTime() / bucketMs) * bucketMs;
        if (!buckets[key]) buckets[key] = { n: 0, battery: 0, ap1: 0, ap2: 0, def: 0, coolant: 0 };
        const b = buckets[key];
        b.n++;
        b.battery += r.batteryVoltage || 0;
        b.ap1 += r.airPressure1Kpa || 0;
        b.ap2 += r.airPressure2Kpa || 0;
        b.def += r.defLevelLtr || 0;
        b.coolant += r.coolantTempC || 0;
    }
    return Object.entries(buckets)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([ts, b]) => ({
            time: new Date(Number(ts)).toISOString(),
            batteryV: parseFloat((b.battery / b.n).toFixed(2)),
            airP1Kpa: parseFloat((b.ap1 / b.n).toFixed(0)),
            airP2Kpa: parseFloat((b.ap2 / b.n).toFixed(0)),
            defL: parseFloat((b.def / b.n).toFixed(1)),
            coolantC: parseFloat((b.coolant / b.n).toFixed(1)),
        }));
}

// ─── 14. Underused trucks ─────────────────────────────────────────────────────
async function getUnderusedTrucks({ thresholdKm = 50, days = 30 } = {}) {
    const from = new Date(); from.setDate(from.getDate() - days);
    const rows = await IAlertTelemetry.aggregate([
        { $match: { timestamp: { $gte: from }, odometerKm: { $ne: null } } },
        {
            $group: {
                _id: '$registrationNumber',
                minOdo: { $min: '$odometerKm' },
                maxOdo: { $max: '$odometerKm' },
                lastSeen: { $max: '$timestamp' },
            },
        },
        {
            $project: {
                registrationNumber: '$_id', _id: 0,
                distanceKm: { $round: [{ $subtract: ['$maxOdo', '$minOdo'] }, 1] },
                lastSeen: 1,
            },
        },
        { $match: { distanceKm: { $lt: thresholdKm } } },
        { $sort: { distanceKm: 1 } },
    ]);
    return rows;
}

// ─── 15. Alert generation sweep ───────────────────────────────────────────────
/**
 * Scans latest telemetry snapshot for threshold violations
 * and upserts Alerts (deduplicates by truck+category+active).
 */
async function runAlertSweep() {
    const healthData = await getEngineHealth();
    const now = new Date();
    const upserted = [];

    for (const truck of healthData) {
        const reg = truck.registrationNumber;

        const checks = [
            { condition: truck.batteryVoltage != null && truck.batteryVoltage < THRESHOLDS.batteryLowV, category: 'battery', severity: 'warning', message: `Battery voltage low: ${truck.batteryVoltage}V` },
            { condition: truck.coolantTempC != null && truck.coolantTempC > THRESHOLDS.coolantHighC, category: 'engineHeat', severity: 'critical', message: `Coolant temperature high: ${truck.coolantTempC}°C` },
            { condition: truck.oilPressureKpa != null && truck.oilPressureKpa < THRESHOLDS.oilPressureLowKpa, category: 'engineHeat', severity: 'critical', message: `Oil pressure low: ${truck.oilPressureKpa} kPa` },
            { condition: truck.exhaustTempC != null && truck.exhaustTempC > THRESHOLDS.exhaustHighC, category: 'engineHeat', severity: 'warning', message: `Exhaust temp high: ${truck.exhaustTempC}°C` },
            { condition: truck.airPressure1Kpa != null && truck.airPressure1Kpa < THRESHOLDS.airPressureLowKpa, category: 'airPressure', severity: 'warning', message: `Air pressure 1 low: ${truck.airPressure1Kpa} kPa` },
            { condition: truck.airPressure2Kpa != null && truck.airPressure2Kpa < THRESHOLDS.airPressureLowKpa, category: 'airPressure', severity: 'warning', message: `Air pressure 2 low: ${truck.airPressure2Kpa} kPa` },
            { condition: truck.defLevelLtr != null && truck.defLevelLtr < THRESHOLDS.defLevelLowPct, category: 'def', severity: 'warning', message: `DEF level low: ${truck.defLevelLtr}L` },
        ];

        for (const c of checks) {
            if (!c.condition) continue;
            // Upsert: avoid duplicates for same active alert
            await Alert.findOneAndUpdate(
                { registrationNumber: reg, category: c.category, status: 'active' },
                {
                    $setOnInsert: { registrationNumber: reg, category: c.category, severity: c.severity, message: c.message, timestamp: now, status: 'active' },
                },
                { upsert: true }
            );
            upserted.push({ reg, category: c.category });
        }
    }

    return upserted.length;
}

module.exports = {
    getFleetSummary,
    getGpsHistory,
    getLatestPositions,
    getTripList,
    getOverspeedEvents,
    getOverspeedRanking,
    getIdleSessions,
    getFuelEfficiencyRanking,
    getFuelAnomalies,
    getEngineHealth,
    getSpeedTrend,
    getMonthlyDistanceTrend,
    getSystemParamsTrend,
    getUnderusedTrucks,
    runAlertSweep,
    THRESHOLDS,
};
