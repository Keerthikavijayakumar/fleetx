const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const csv = require('csv-parser');
const XLSX = require('xlsx');

const Truck = require('../models/Truck');
const Route = require('../models/Route');
const TruckAnalytics = require('../models/TruckAnalytics');
const IAlertTelemetry = require('../models/IAlertTelemetry');
const SyncLog = require('../models/SyncLog');
const SyncState = require('../models/SyncState');

const SYNC_KEY = 'ialert_csv';
const TZ = process.env.IALERT_SYNC_TIMEZONE || 'Asia/Kolkata';
const DEFAULT_FUEL_COST = Number(process.env.DEFAULT_DIESEL_COST_PER_LITRE || 95);
const DEFAULT_EMISSION_FACTOR = Number(process.env.DEFAULT_EMISSION_FACTOR || 2.68);
const DEFAULT_TANK_CAPACITY = Number(process.env.DEFAULT_TANK_CAPACITY || 300);

let isRunning = false;

function getSourceRoot() {
    if (process.env.IALERT_SYNC_SOURCE_DIR) {
        return path.resolve(process.env.IALERT_SYNC_SOURCE_DIR);
    }
    return path.resolve(__dirname, '..', '..');
}

function istDateParts(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const map = {};
    parts.forEach((p) => {
        if (p.type !== 'literal') map[p.type] = p.value;
    });
    return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

function dateKeyInIST(date) {
    const p = istDateParts(date);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function startOfDayIST(date) {
    const key = dateKeyInIST(date);
    return new Date(`${key}T00:00:00+05:30`);
}

function addDays(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

function yesterdayIST() {
    return addDays(startOfDayIST(new Date()), -1);
}

function jan1ISTCurrentYear() {
    const p = istDateParts(new Date());
    return new Date(`${p.year}-01-01T00:00:00+05:30`);
}

function normalizeHeaderKey(key) {
    return String(key || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function rowAccessor(row) {
    const normalized = {};
    Object.entries(row || {}).forEach(([k, v]) => {
        normalized[normalizeHeaderKey(k)] = v;
    });
    return (candidate) => normalized[normalizeHeaderKey(candidate)];
}

function parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
}

function parseTimestamp(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    if (typeof value === 'number') {
        // Excel serial date fallback
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        return new Date(excelEpoch.getTime() + value * 86400000);
    }

    const raw = String(value).trim();
    if (!raw) return null;

    let parsed = null;
    if (/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(raw)) {
        parsed = new Date(raw.replace(' ', 'T') + '+05:30');
    } else {
        parsed = new Date(raw);
    }

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIgnition(value) {
    const txt = String(value || '').trim().toUpperCase();
    if (txt === 'ON' || txt === '1' || txt === 'TRUE') return 'ON';
    if (txt === 'OFF' || txt === '0' || txt === 'FALSE') return 'OFF';
    return 'UNKNOWN';
}

function deriveEngineStatus(ignition, speed) {
    if (ignition !== 'ON') return 'off';
    if ((speed || 0) > 1) return 'running';
    return 'idle';
}

function toFuelPercent(rawFuelLevel) {
    if (rawFuelLevel === null || rawFuelLevel === undefined) return null;
    if (rawFuelLevel <= 100) return Math.max(0, Math.min(100, rawFuelLevel));
    const pct = (rawFuelLevel / DEFAULT_TANK_CAPACITY) * 100;
    return Math.max(0, Math.min(100, pct));
}

function parseCsvFile(filePath) {
    return new Promise((resolve, reject) => {
        const rows = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject);
    });
}

function parseXlsxFile(filePath) {
    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const first = workbook.SheetNames[0];
    if (!first) return [];
    return XLSX.utils.sheet_to_json(workbook.Sheets[first], { defval: '' });
}

async function parseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.csv') return parseCsvFile(filePath);
    if (ext === '.xlsx' || ext === '.xls') return parseXlsxFile(filePath);
    return [];
}

function hashFile(filePath) {
    const stat = fs.statSync(filePath);
    const str = `${path.basename(filePath)}|${stat.size}|${stat.mtimeMs}`;
    return crypto.createHash('sha1').update(str).digest('hex');
}

function normalizeTelemetryRow(rawRow, sourceFile) {
    const get = rowAccessor(rawRow);
    const registrationNumber = String(get('REGISTRATION NUMBER') || '').trim().toUpperCase();
    const timestamp = parseTimestamp(get('TIME STAMP'));

    if (!registrationNumber || !timestamp) return null;

    return {
        registrationNumber,
        obuId: String(get('OBU ID') || '').trim(),
        vinNumber: String(get('VIN NUMBER') || '').trim(),
        vehicleType: String(get('VEHICLE TYPE') || '').trim(),

        timestamp,
        dateKey: dateKeyInIST(timestamp),

        latitude: parseNumber(get('LATITUDE')),
        longitude: parseNumber(get('LONGITUDE')),
        location: String(get('LOCATION') || '').trim(),
        altitudeM: parseNumber(get('ALTITUDE (m)')),

        ignitionStatus: toIgnition(get('IGNITION STATUS')),
        vehicleSpeedKmph: parseNumber(get('VEHICLE SPEED (kmph)')) || 0,
        odometerKm: parseNumber(get('ODOMETER (km)')),
        engineHours: parseNumber(get('ENGINE HOURS (hrs)')),
        currentGear: parseNumber(get('CURRENT GEAR')),

        fuelConsumption: parseNumber(get('FUEL (ltr) / GAS CONSUMPTION (kg)')),
        fuelLevel: parseNumber(get('FUEL (ltr) / GAS LEVEL (bar / kg)')),

        engineSpeedRpm: parseNumber(get('ENGINE SPEED (rpm)')),
        coolantTempC: parseNumber(get('COOLANT TEMPERATURE (deg C)')),
        oilPressureKpa: parseNumber(get('OIL PRESSURE (kpa)')),
        exhaustTempC: parseNumber(get('EXHAUST TEMPERATURE (deg C)')),

        batteryVoltage: parseNumber(get('BATTERY VOLTAGE (volts)')),
        airPressure1Kpa: parseNumber(get('AIR PRESSURE 1 (kpa)')),
        airPressure2Kpa: parseNumber(get('AIR PRESSURE 2 (kpa)')),

        defLevelLtr: parseNumber(get('DEF LEVEL(ltr)')),
        defConsumptionLtr: parseNumber(get('DEF CONSUMPTION (ltr)')),
        defTankTempC: parseNumber(get('DEF TANK TEMPERATURE (deg C)')),

        sourceFile,
    };
}

function discoverInputFiles(rootDir) {
    return fs.readdirSync(rootDir)
        .filter((name) => {
            if (name.startsWith('~$')) return false;
            const ext = path.extname(name).toLowerCase();
            return ext === '.csv' || ext === '.xlsx' || ext === '.xls';
        })
        .map((name) => path.join(rootDir, name));
}

function computeRange(lastSuccessfulDate) {
    const end = yesterdayIST();
    if (!lastSuccessfulDate) {
        return { start: jan1ISTCurrentYear(), end };
    }
    const next = addDays(startOfDayIST(lastSuccessfulDate), 1);
    return { start: next, end };
}

function dateObjFromKey(dateKey) {
    return new Date(`${dateKey}T00:00:00+05:30`);
}

function withinRangeKey(key, start, end) {
    const startKey = dateKeyInIST(start);
    const endKey = dateKeyInIST(end);
    return key >= startKey && key <= endKey;
}

function toDurationText(minutes) {
    const mins = Math.max(0, Math.round(minutes || 0));
    return `${mins} min`;
}

function deriveTrips(rows) {
    const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
    const trips = [];
    let active = null;

    for (const row of sorted) {
        const speed = row.vehicleSpeedKmph || 0;
        const moving = row.ignitionStatus === 'ON' && speed > 1;

        if (!active && moving) {
            active = {
                start: row,
                lastMoving: row,
                rows: [row],
            };
            continue;
        }

        if (!active) continue;

        active.rows.push(row);
        if (moving) active.lastMoving = row;

        const shouldEnd = row.ignitionStatus !== 'ON' || (!moving && (row.timestamp - active.lastMoving.timestamp) >= 5 * 60 * 1000);
        if (!shouldEnd) continue;

        const end = active.lastMoving || row;
        if (end.timestamp > active.start.timestamp) {
            trips.push({ start: active.start, end, rows: active.rows.filter((r) => r.timestamp <= end.timestamp) });
        }
        active = null;
    }

    if (active && active.lastMoving && active.lastMoving.timestamp > active.start.timestamp) {
        trips.push({ start: active.start, end: active.lastMoving, rows: active.rows });
    }

    return trips;
}

async function updateSyncState(update) {
    await SyncState.findOneAndUpdate(
        { key: SYNC_KEY },
        { $set: { ...update, updatedAt: new Date() }, $setOnInsert: { key: SYNC_KEY } },
        { upsert: true }
    );
}

async function runIAlertCsvSync({ reason = 'manual', forceFullSync = false, explicitFiles = null, originalFileName = '' } = {}) {
    if (isRunning) {
        return { status: 'skipped', message: 'Sync is already running.' };
    }

    isRunning = true;
    const startedAt = new Date();
    const log = await SyncLog.create({
        jobName: SYNC_KEY,
        status: 'running',
        message: `Started (${reason})`,
        meta: { originalFileName: originalFileName || '' },
        startedAt,
    });

    try {
        await updateSyncState({ status: 'running', lastRunAt: startedAt, message: `Running (${reason})` });

        const state = await SyncState.findOne({ key: SYNC_KEY }).lean();
        const selectedFiles = Array.isArray(explicitFiles) ? explicitFiles.filter(Boolean) : null;
        const { start, end } = forceFullSync
            ? { start: jan1ISTCurrentYear(), end: new Date('2099-12-31T23:59:59+05:30') }
            : computeRange(state?.lastSuccessfulDate || null);

        if (start > end) {
            const message = 'No pending date window to process.';
            await SyncLog.findByIdAndUpdate(log._id, {
                status: 'no-op',
                message,
                rangeStart: start,
                rangeEnd: end,
                finishedAt: new Date(),
            });
            await updateSyncState({ status: 'no-op', message, lastRunAt: new Date() });
            return { status: 'no-op', message };
        }

        const sourceRoot = getSourceRoot();
        const files = selectedFiles?.length ? selectedFiles : discoverInputFiles(sourceRoot);

        if (!files.length) {
            const message = 'No CSV/XLSX files found in source directory.';
            await SyncLog.findByIdAndUpdate(log._id, {
                status: 'no-op',
                message,
                rangeStart: start,
                rangeEnd: end,
                finishedAt: new Date(),
            });
            await updateSyncState({ status: 'no-op', message, lastRunAt: new Date() });
            return { status: 'no-op', message };
        }

        const allRows = [];
        const fileSummaries = [];

        for (const filePath of files) {
            const rawRows = await parseFile(filePath);
            let accepted = 0;

            rawRows.forEach((raw) => {
                const row = normalizeTelemetryRow(raw, path.basename(filePath));
                if (!row) return;
                if (!forceFullSync && !withinRangeKey(row.dateKey, start, end)) return;
                allRows.push(row);
                accepted += 1;
            });

            fileSummaries.push({
                file: path.basename(filePath),
                hash: hashFile(filePath),
                totalRows: rawRows.length,
                acceptedRows: accepted,
            });
        }

        if (!allRows.length) {
            const message = 'Files found, but no rows matched the target date range.';
            await SyncLog.findByIdAndUpdate(log._id, {
                status: 'no-op',
                message,
                rangeStart: start,
                rangeEnd: end,
                meta: { files: fileSummaries },
                finishedAt: new Date(),
            });
            await updateSyncState({ status: 'no-op', message, lastRunAt: new Date() });
            return { status: 'no-op', message };
        }

        if (forceFullSync) {
            await Promise.all([
                IAlertTelemetry.deleteMany({}),
                Route.deleteMany({ sourceSystem: 'ialert_csv' }),
                TruckAnalytics.deleteMany({}),
            ]);
        }

        const rowsByTruck = new Map();
        const latestByTruck = new Map();
        allRows.forEach((row) => {
            if (!rowsByTruck.has(row.registrationNumber)) rowsByTruck.set(row.registrationNumber, []);
            rowsByTruck.get(row.registrationNumber).push(row);

            const prev = latestByTruck.get(row.registrationNumber);
            if (!prev || row.timestamp > prev.timestamp) latestByTruck.set(row.registrationNumber, row);
        });

        const truckOps = [];
        latestByTruck.forEach((row, reg) => {
            const fuelPct = toFuelPercent(row.fuelLevel);
            truckOps.push({
                updateOne: {
                    filter: { licensePlate: reg },
                    update: {
                        $set: {
                            truckId: reg,
                            licensePlate: reg,
                            status: row.ignitionStatus === 'ON' ? 'active' : 'inactive',
                            latitude: row.latitude,
                            longitude: row.longitude,
                            speed: row.vehicleSpeedKmph || 0,
                            engineStatus: deriveEngineStatus(row.ignitionStatus, row.vehicleSpeedKmph || 0),
                            totalDistance: row.odometerKm || 0,
                            updatedAt: new Date(),
                            ...(fuelPct !== null ? { fuelLevel: fuelPct } : {}),
                        },
                        $setOnInsert: {
                            registrationDate: row.timestamp,
                            fuelEfficiency: 4,
                            tankCapacity: DEFAULT_TANK_CAPACITY,
                            costPerLitre: DEFAULT_FUEL_COST,
                            emissionFactor: DEFAULT_EMISSION_FACTOR,
                        },
                    },
                    upsert: true,
                },
            });
        });
        if (truckOps.length) await Truck.bulkWrite(truckOps, { ordered: false });

        const registrations = Array.from(rowsByTruck.keys());
        const truckDocs = await Truck.find({ licensePlate: { $in: registrations } }).select('_id licensePlate costPerLitre').lean();
        const truckMap = new Map(truckDocs.map((t) => [t.licensePlate, t]));

        const telemetryOps = allRows.map((row) => ({
            updateOne: {
                filter: { registrationNumber: row.registrationNumber, timestamp: row.timestamp },
                update: { $set: row, $setOnInsert: { createdAt: new Date() } },
                upsert: true,
            },
        }));
        if (telemetryOps.length) await IAlertTelemetry.bulkWrite(telemetryOps, { ordered: false });

        const dailyAgg = new Map();
        allRows.forEach((row) => {
            const key = `${row.registrationNumber}|${row.dateKey}`;
            const curr = dailyAgg.get(key) || {
                registrationNumber: row.registrationNumber,
                dateKey: row.dateKey,
                minOdo: null,
                maxOdo: null,
                minFuelCons: null,
                maxFuelCons: null,
                firstTs: row.timestamp,
                lastTs: row.timestamp,
            };

            if (row.odometerKm !== null) {
                curr.minOdo = curr.minOdo === null ? row.odometerKm : Math.min(curr.minOdo, row.odometerKm);
                curr.maxOdo = curr.maxOdo === null ? row.odometerKm : Math.max(curr.maxOdo, row.odometerKm);
            }
            if (row.fuelConsumption !== null) {
                curr.minFuelCons = curr.minFuelCons === null ? row.fuelConsumption : Math.min(curr.minFuelCons, row.fuelConsumption);
                curr.maxFuelCons = curr.maxFuelCons === null ? row.fuelConsumption : Math.max(curr.maxFuelCons, row.fuelConsumption);
            }
            if (row.timestamp < curr.firstTs) curr.firstTs = row.timestamp;
            if (row.timestamp > curr.lastTs) curr.lastTs = row.timestamp;

            dailyAgg.set(key, curr);
        });

        const analyticsOps = [];
        dailyAgg.forEach((agg) => {
            const distanceKm = Math.max(0, (agg.maxOdo || 0) - (agg.minOdo || 0));
            const fuelUsedLiters = Math.max(0, (agg.maxFuelCons || 0) - (agg.minFuelCons || 0));
            const truck = truckMap.get(agg.registrationNumber);
            const costRate = truck?.costPerLitre || DEFAULT_FUEL_COST;
            const costRs = Number((fuelUsedLiters * costRate).toFixed(2));
            const co2Kg = Number((fuelUsedLiters * DEFAULT_EMISSION_FACTOR).toFixed(2));
            const deliveryTimeMin = Math.max(0, Math.round((agg.lastTs - agg.firstTs) / 60000));
            analyticsOps.push({
                updateOne: {
                    filter: {
                        date: dateObjFromKey(agg.dateKey),
                        truckId: agg.registrationNumber,
                    },
                    update: {
                        $set: {
                            date: dateObjFromKey(agg.dateKey),
                            truckId: agg.registrationNumber,
                            distanceKm,
                            fuelUsedLiters,
                            costRs,
                            co2Kg,
                            deliveryTimeMin,
                        },
                    },
                    upsert: true,
                },
            });
        });
        if (analyticsOps.length) await TruckAnalytics.bulkWrite(analyticsOps, { ordered: false });

        const routeOps = [];
        let tripCount = 0;
        rowsByTruck.forEach((truckRows, reg) => {
            const trips = deriveTrips(truckRows);
            const truck = truckMap.get(reg);

            // Stitching Logic: Group trips that happen within 4 hours of each other
            let currentMasterId = null;
            let lastEndTime = null;

            trips.forEach((trip, index) => {
                if (!lastEndTime || (trip.start.timestamp - lastEndTime) / 3600000 >= 4) {
                    currentMasterId = `MT-${reg}-${trip.start.timestamp.getTime()}`;
                }
                trip.masterTripId = currentMasterId;
                lastEndTime = trip.end.timestamp;

                const distance = Math.max(0, (trip.end.odometerKm || 0) - (trip.start.odometerKm || 0));
                const fuelConsumed = Math.max(0, (trip.end.fuelConsumption || 0) - (trip.start.fuelConsumption || 0));
                const durationMin = Math.max(1, Math.round((trip.end.timestamp - trip.start.timestamp) / 60000));
                const fuelCost = Number((fuelConsumed * (truck?.costPerLitre || DEFAULT_FUEL_COST)).toFixed(2));
                const avgSpeed = distance > 0 ? (distance / (durationMin / 60)) : 0;
                const trafficLevel = avgSpeed < 20 ? 'High' : avgSpeed < 40 ? 'Medium' : 'Low';
                const externalTripKey = `${reg}_${trip.start.timestamp.toISOString()}_${trip.end.timestamp.toISOString()}`;

                routeOps.push({
                    updateOne: {
                        filter: { sourceSystem: 'ialert_csv', externalTripKey },
                        update: {
                            $set: {
                                truckId: truck?._id,
                                source: trip.start.location || `${trip.start.latitude || 0},${trip.start.longitude || 0}`,
                                destination: trip.end.location || `${trip.end.latitude || 0},${trip.end.longitude || 0}`,
                                distance,
                                duration: toDurationText(durationMin),
                                fuelConsumed,
                                fuelCost,
                                estimatedDurationMinutes: durationMin,
                                estimatedFuelConsumed: fuelConsumed,
                                estimatedFuelCost: fuelCost,
                                carbonEmission: Number((fuelConsumed * DEFAULT_EMISSION_FACTOR).toFixed(2)),
                                trafficLevel,
                                status: 'completed',
                                tripStartTime: trip.start.timestamp,
                                tripEndTime: trip.end.timestamp,
                                sourceSystem: 'ialert_csv',
                                externalTripKey,
                                masterTripId: trip.masterTripId,
                                startLatitude: trip.start.latitude,
                                startLongitude: trip.start.longitude,
                                endLatitude: trip.end.latitude,
                                endLongitude: trip.end.longitude,
                            },
                        },
                        upsert: true,
                    },
                });
                tripCount += 1;
            });
        });
        if (routeOps.length) await Route.bulkWrite(routeOps, { ordered: false });

        const summary = {
            filesDiscovered: files.length,
            files: fileSummaries,
            rowsAccepted: allRows.length,
            trucksUpserted: truckOps.length,
            telemetryRowsUpserted: telemetryOps.length,
            analyticsRowsUpserted: analyticsOps.length,
            tripsUpserted: tripCount,            originalFileName: originalFileName || '',        };

        await SyncLog.findByIdAndUpdate(log._id, {
            status: 'success',
            message: 'iAlert file ingestion sync completed.',
            rangeStart: start,
            rangeEnd: end,
            meta: summary,
            finishedAt: new Date(),
        });

        await updateSyncState({
            status: 'success',
            message: 'Sync completed successfully.',
            lastRunAt: new Date(),
            lastSuccessfulDate: end,
            sourceFile: fileSummaries[0]?.file || '',
            sourceHash: fileSummaries[0]?.hash || '',
            sourceRows: allRows.length,
            lastSummary: summary,
        });

        return { status: 'success', summary };
    } catch (error) {
        await SyncLog.findByIdAndUpdate(log._id, {
            status: 'failed',
            message: error.message || 'Sync failed.',
            meta: { stack: error.stack || '' },
            finishedAt: new Date(),
        });
        await updateSyncState({ status: 'failed', message: error.message || 'Sync failed.', lastRunAt: new Date() });
        throw error;
    } finally {
        isRunning = false;
    }
}

async function getSyncStatus() {
    const [state, latestLog] = await Promise.all([
        SyncState.findOne({ key: SYNC_KEY }).lean(),
        SyncLog.findOne({ jobName: SYNC_KEY }).sort({ startedAt: -1 }).lean(),
    ]);
    return {
        running: isRunning,
        state: state || null,
        latestLog: latestLog || null,
    };
}

async function getSyncHistory(limit = 20) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    return SyncLog.find({ jobName: SYNC_KEY }).sort({ startedAt: -1 }).limit(safeLimit).lean();
}

module.exports = {
    getSourceRoot,
    runIAlertCsvSync,
    getSyncStatus,
    getSyncHistory,
};
