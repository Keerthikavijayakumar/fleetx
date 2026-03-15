/**
 * seedMockData.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wipes and re-seeds all collections with realistic Tamil-Nadu mock data:
 *   • 10 trucks  (4 online, 4 offline, 2 maintenance)
 *   • 10 drivers + 5 assistants
 *   • Active trips for the 4 online trucks
 *   • 30 days of IAlertTelemetry for all trucks
 *   • 8–10 completed Route-trips per truck (sourceSystem: ialert_csv)
 *   • TruckAnalytics (daily, 30 days)
 *   • Maintenance records
 *   • Alerts
 *   • SyncState (marks DB as seeded)
 *
 * Usage:  node scripts/seedMockData.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const connectDB  = require('../config/database');
const Truck      = require('../models/Truck');
const User       = require('../models/User');
const Route      = require('../models/Route');
const IAlertTelemetry = require('../models/IAlertTelemetry');
const TruckAnalytics  = require('../models/TruckAnalytics');
const Maintenance     = require('../models/Maintenance');
const Alert           = require('../models/Alert');
const SyncState       = require('../models/SyncState');
const SyncLog         = require('../models/SyncLog');

// ─── helpers ──────────────────────────────────────────────────────────────────

const rand  = (min, max)  => Math.random() * (max - min) + min;
const randI = (min, max)  => Math.floor(rand(min, max + 1));
const pick  = (arr)       => arr[Math.floor(Math.random() * arr.length)];
const daysAgo = (n, h = 0, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(h, m, 0, 0);
    return d;
};
const addMinutes = (date, mins) => new Date(date.getTime() + mins * 60000);
const lerp = (a, b, t) => a + (b - a) * t;

// Interpolate GPS coords along a route (fraction 0→1)
function interpolate(srcLat, srcLng, dstLat, dstLng, frac) {
    return {
        lat: lerp(srcLat, dstLat, frac) + rand(-0.02, 0.02),
        lng: lerp(srcLng, dstLng, frac) + rand(-0.02, 0.02),
    };
}

// ─── static data ──────────────────────────────────────────────────────────────

const LOCATIONS = {
    chennai:     { lat: 13.0827, lng: 80.2707, name: 'Chennai' },
    madurai:     { lat: 9.9252,  lng: 78.1198, name: 'Madurai' },
    coimbatore:  { lat: 11.0168, lng: 76.9558, name: 'Coimbatore' },
    trichy:      { lat: 10.7905, lng: 78.7047, name: 'Trichy' },
    salem:       { lat: 11.6643, lng: 78.1460, name: 'Salem' },
    tirunelveli: { lat: 8.7139,  lng: 77.7567, name: 'Tirunelveli' },
    vellore:     { lat: 12.9165, lng: 79.1325, name: 'Vellore' },
    erode:       { lat: 11.3410, lng: 77.7172, name: 'Erode' },
    hosur:       { lat: 12.7409, lng: 77.8253, name: 'Hosur' },
    dindigul:    { lat: 10.3624, lng: 77.9695, name: 'Dindigul' },
};

// 10 trucks definition
const TRUCKS_DEF = [
    // ── 4 ONLINE ────────────────────────────────────────────────────────────
    {
        id: 'TN01AB1234', plate: 'TN 01 AB 1234', status: 'active',
        route: { src: LOCATIONS.chennai, dst: LOCATIONS.madurai, dist: 462, nh: 'NH 44' },
        fuelEff: 8.2, tank: 400, cpl: 95, model: 'Tata Prima 4028.S',
    },
    {
        id: 'TN04CD5678', plate: 'TN 04 CD 5678', status: 'active',
        route: { src: LOCATIONS.coimbatore, dst: LOCATIONS.trichy, dist: 179, nh: 'NH 544' },
        fuelEff: 7.8, tank: 380, cpl: 95, model: 'Ashok Leyland 2518',
    },
    {
        id: 'TN07EF9012', plate: 'TN 07 EF 9012', status: 'active',
        route: { src: LOCATIONS.salem, dst: LOCATIONS.tirunelveli, dist: 310, nh: 'NH 83' },
        fuelEff: 9.1, tank: 420, cpl: 95, model: 'Eicher Pro 6055',
    },
    {
        id: 'TN10GH3456', plate: 'TN 10 GH 3456', status: 'active',
        route: { src: LOCATIONS.vellore, dst: LOCATIONS.erode, dist: 268, nh: 'NH 48' },
        fuelEff: 7.5, tank: 350, cpl: 95, model: 'BharatBenz 3543C',
    },
    // ── 2 MAINTENANCE ───────────────────────────────────────────────────────
    {
        id: 'TN11IJ7890', plate: 'TN 11 IJ 7890', status: 'maintenance',
        route: null, depot: LOCATIONS.chennai,
        fuelEff: 8.0, tank: 400, cpl: 95, model: 'Tata Prima 2523.K',
    },
    {
        id: 'TN14KL1357', plate: 'TN 14 KL 1357', status: 'maintenance',
        route: null, depot: LOCATIONS.coimbatore,
        fuelEff: 6.8, tank: 360, cpl: 95, model: 'Ashok Leyland Boss 1615',
    },
    // ── 4 OFFLINE ───────────────────────────────────────────────────────────
    {
        id: 'TN02MN2468', plate: 'TN 02 MN 2468', status: 'active',
        route: null, depot: LOCATIONS.chennai,
        fuelEff: 8.5, tank: 400, cpl: 95, model: 'Tata Prima 4028.S',
    },
    {
        id: 'TN05OP3579', plate: 'TN 05 OP 3579', status: 'active',
        route: null, depot: LOCATIONS.coimbatore,
        fuelEff: 7.9, tank: 380, cpl: 95, model: 'Eicher Pro 3015',
    },
    {
        id: 'TN08QR4680', plate: 'TN 08 QR 4680', status: 'active',
        route: null, depot: LOCATIONS.salem,
        fuelEff: 8.8, tank: 420, cpl: 95, model: 'BharatBenz 2523R',
    },
    {
        id: 'TN03ST5791', plate: 'TN 03 ST 5791', status: 'active',
        route: null, depot: LOCATIONS.madurai,
        fuelEff: 7.6, tank: 360, cpl: 95, model: 'Tata LPS 4018',
    },
];

// ─── main ─────────────────────────────────────────────────────────────────────

async function seed() {
    await connectDB();
    console.log('✅ Connected to MongoDB');

    // ── 1. Wipe all relevant collections ──────────────────────────────────────
    console.log('🗑  Clearing collections …');
    await Promise.all([
        Truck.deleteMany({}),
        User.deleteMany({ role: { $in: ['driver', 'assistant'] } }),
        Route.deleteMany({}),
        IAlertTelemetry.deleteMany({}),
        TruckAnalytics.deleteMany({}),
        Maintenance.deleteMany({}),
        Alert.deleteMany({}),
        SyncState.deleteMany({}),
        SyncLog.deleteMany({}),
    ]);
    console.log('✅ Collections cleared');

    // ── 2. Create Drivers (10) ─────────────────────────────────────────────────
    console.log('👤 Seeding users …');
    const DRIVER_NAMES = [
        { fn: 'Murugan Selvam',   lic: 'TN0120180012345', exp: 12, phone: '9841001122' },
        { fn: 'Rajan Krishnan',   lic: 'TN0420170023456', exp: 8,  phone: '9842003344' },
        { fn: 'Suresh Babu',      lic: 'TN0720160034567', exp: 14, phone: '9843005566' },
        { fn: 'Arjun Pillai',     lic: 'TN1020190045678', exp: 6,  phone: '9844007788' },
        { fn: 'Karthi Vel',       lic: 'TN1120150056789', exp: 18, phone: '9845009900' },
        { fn: 'Dinesh Kumar',     lic: 'TN1420140067890', exp: 20, phone: '9846011122' },
        { fn: 'Senthil Nathan',   lic: 'TN0220130078901', exp: 16, phone: '9847013344' },
        { fn: 'Prabhu Deva',      lic: 'TN0520190089012', exp: 5,  phone: '9848015566' },
        { fn: 'Venkat Subbu',     lic: 'TN0820160090123', exp: 9,  phone: '9849017788' },
        { fn: 'Mani Shankar',     lic: 'TN0320180001234', exp: 11, phone: '9850019900' },
    ];
    const ASST_NAMES = [
        { fn: 'Ganesh P',   phone: '9876001122' },
        { fn: 'Vijay T',    phone: '9876003344' },
        { fn: 'Bala K',     phone: '9876005566' },
        { fn: 'Surya M',    phone: '9876007788' },
        { fn: 'Anand R',    phone: '9876009900' },
    ];

    const driverDocs = await Promise.all(DRIVER_NAMES.map((d, i) =>
        new User({
            username: `driver_${d.fn.split(' ')[0].toLowerCase()}${i + 1}`,
            email: `driver${i + 1}@fleetx.in`,
            password: 'password123',
            role: 'driver',
            fullName: d.fn,
            phone: d.phone,
            driverLicenceNumber: d.lic,
            experienceYears: d.exp,
            address: 'Tamil Nadu, India',
            dateOfBirth: new Date(1975 + i, i % 12, (i % 28) + 1),
        }).save()
    ));

    const asstDocs = await Promise.all(ASST_NAMES.map((a, i) =>
        new User({
            username: `asst_${a.fn.split(' ')[0].toLowerCase()}${i + 1}`,
            email: `asst${i + 1}@fleetx.in`,
            password: 'password123',
            role: 'assistant',
            fullName: a.fn,
            phone: a.phone,
            experienceYears: randI(1, 5),
            address: 'Tamil Nadu, India',
            dateOfBirth: new Date(1990 + i, i % 12, (i % 28) + 1),
        }).save()
    ));
    console.log(`✅ Created ${driverDocs.length} drivers, ${asstDocs.length} assistants`);

    // ── 3. Create Trucks ───────────────────────────────────────────────────────
    console.log('🚛 Seeding trucks …');
    const now = new Date();
    const truckDocs = await Promise.all(TRUCKS_DEF.map((def, i) =>
        new Truck({
            truckId: def.id,
            licensePlate: def.plate,
            registrationDate: new Date(2019 + (i % 4), i % 12, (i % 28) + 1),
            status: def.status,
            fuelEfficiency: def.fuelEff,
            tankCapacity: def.tank,
            costPerLitre: def.cpl,
            emissionFactor: 2.65,
            vehicleModel: def.model,
            insuranceNumber: `INS-TN-${def.id}-2024`,
            insuranceExpiry: new Date(now.getFullYear() + 1, (i + 3) % 12, 15),
            taxDocumentNumber: `TAX-TN-${def.id}`,
            stateTaxAmount: 12500,
            stateTaxPaidDate: daysAgo(30 + i * 5),
            centralTaxAmount: 8500,
            centralTaxPaidDate: daysAgo(20 + i * 3),
        }).save()
    ));
    console.log(`✅ Created ${truckDocs.length} trucks`);

    // Map registration numbers → truck docs
    const truckByReg = {};
    truckDocs.forEach((t) => { truckByReg[t.truckId] = t; });

    // ── 4. Maintenance records ─────────────────────────────────────────────────
    console.log('🔧 Seeding maintenance …');
    const maintenanceTrucks = truckDocs.filter((t) => t.status === 'maintenance');
    const allTrucksForMaint = truckDocs;

    const maintenanceDocs = [];
    // In-progress maintenance for 2 maintenance trucks
    maintenanceDocs.push({
        truckId: maintenanceTrucks[0]._id,
        serviceType: 'Engine Overhaul',
        lastServiceDate: daysAgo(5),
        nextServiceDue: new Date(now.getTime() + 10 * 86400000),
        odometer: 185420,
        notes: 'Complete engine overhaul due to excessive oil consumption. Engine block replaced.',
        status: 'pending',
        cost: 85000,
    });
    maintenanceDocs.push({
        truckId: maintenanceTrucks[1]._id,
        serviceType: 'Brake System Repair',
        lastServiceDate: daysAgo(3),
        nextServiceDue: new Date(now.getTime() + 7 * 86400000),
        odometer: 142860,
        notes: 'Brake pads, rotors and brake fluid flush. ABS sensor replacement.',
        status: 'pending',
        cost: 32000,
    });

    // Historical maintenance for all trucks
    for (const truck of allTrucksForMaint) {
        maintenanceDocs.push({
            truckId: truck._id,
            serviceType: pick(['Oil Change & Filter', 'Tyre Rotation', 'Air Filter Replacement', 'Coolant Flush', 'Battery Check']),
            lastServiceDate: daysAgo(randI(45, 90)),
            nextServiceDue: new Date(now.getTime() + randI(30, 90) * 86400000),
            odometer: randI(120000, 200000),
            notes: 'Routine scheduled maintenance completed.',
            status: 'completed',
            cost: randI(5000, 25000),
        });
        maintenanceDocs.push({
            truckId: truck._id,
            serviceType: pick(['Gearbox Service', 'Clutch Replacement', 'Suspension Check', 'Wheel Alignment']),
            lastServiceDate: daysAgo(randI(10, 40)),
            nextServiceDue: new Date(now.getTime() + randI(60, 120) * 86400000),
            odometer: randI(120000, 200000),
            notes: 'Maintenance completed as per schedule.',
            status: 'completed',
            cost: randI(8000, 45000),
        });
    }
    await Maintenance.insertMany(maintenanceDocs);
    console.log(`✅ Created ${maintenanceDocs.length} maintenance records`);

    // ── 5. IAlertTelemetry & Routes/Trips ─────────────────────────────────────
    console.log('📡 Seeding telemetry (this may take a moment) …');
    const telemetryBatch = [];
    const tripBatch = [];
    const analyticsBatch = [];

    for (const def of TRUCKS_DEF) {
        const reg = def.id;
        const isOnline = def.status === 'active' && def.route !== null;
        const isMaintenance = def.status === 'maintenance';
        const isOffline = def.status === 'active' && def.route === null;

        const baseLat = def.route ? def.route.src.lat : (def.depot?.lat ?? 13.08);
        const baseLng = def.route ? def.route.src.lng : (def.depot?.lng ?? 80.27);

        // ── Telemetry records ────────────────────────────────────────────
        // Online: 30 days, every 30 min during 06:00–20:00
        // Offline: 30 days, parked (1 record per day, ignition OFF)
        // Maintenance: sparse (5 days only, ignition OFF)
        const intervalMin = isOnline ? 30 : (isOffline ? 120 : 240);
        const daysOfData   = isMaintenance ? 7 : 30;
        let odometerBase   = randI(100000, 200000);

        for (let day = daysOfData; day >= 0; day--) {
            const dayDate = new Date();
            dayDate.setDate(dayDate.getDate() - day);
            const dateKey  = dayDate.toISOString().slice(0, 10);

            // Hours active on this day
            const startHour = isOnline ? 6 : 0;
            const endHour   = isOnline ? 20 : (isOffline ? 1 : 1); // offline: 1 record at midnight

            for (let hour = startHour; hour <= endHour; hour += Math.ceil(intervalMin / 60)) {
                const tMin = (hour === startHour) ? 0 : randI(0, 59);
                const ts = new Date(dayDate);
                ts.setHours(hour, tMin, 0, 0);
                if (ts > now) continue;

                // Progress along route for online trucks
                const frac = isOnline
                    ? Math.min(((hour - 6) / 14) + rand(-0.05, 0.05), 1)
                    : 0;
                const pos = def.route
                    ? interpolate(def.route.src.lat, def.route.src.lng, def.route.dst.lat, def.route.dst.lng, frac)
                    : { lat: baseLat + rand(-0.01, 0.01), lng: baseLng + rand(-0.01, 0.01) };

                const speed   = isOnline ? rand(35, 75) : 0;
                const ignition = isOnline ? 'ON' : 'OFF';
                const fuelInc  = isOnline ? rand(0.3, 0.9) : 0.01;
                odometerBase  += isOnline ? speed * (intervalMin / 60) : 0;

                const coolant = isOnline ? rand(75, 95) : rand(30, 40);
                const oilPsi  = isOnline ? rand(350, 500) : rand(200, 300);
                const rpm     = isOnline ? rand(1200, 2200) : rand(0, 100);
                const battery = rand(12.4, 14.2);
                const fuel    = rand(25, 90);
                const exhaust = isOnline ? rand(350, 520) : rand(100, 200);
                const airP    = rand(650, 850);

                telemetryBatch.push({
                    registrationNumber: reg,
                    obuId:  `OBU-${reg}`,
                    vinNumber: `IN${reg.replace(/\s/g, '')}VIN`,
                    vehicleType: 'Heavy Commercial Vehicle',
                    timestamp: ts,
                    dateKey,
                    latitude: pos.lat,
                    longitude: pos.lng,
                    location: def.route ? (frac < 0.5 ? def.route.src.name : def.route.dst.name) : (def.depot?.name ?? 'Depot'),
                    altitudeM: rand(20, 350),
                    ignitionStatus: ignition,
                    vehicleSpeedKmph: parseFloat(speed.toFixed(1)),
                    odometerKm: parseFloat(odometerBase.toFixed(1)),
                    engineHours: parseFloat((odometerBase / 40).toFixed(1)),
                    currentGear: isOnline ? randI(4, 8) : 0,
                    fuelConsumption: parseFloat(fuelInc.toFixed(3)),
                    fuelLevel: parseFloat(fuel.toFixed(1)),
                    engineSpeedRpm: parseFloat(rpm.toFixed(0)),
                    coolantTempC: parseFloat(coolant.toFixed(1)),
                    oilPressureKpa: parseFloat(oilPsi.toFixed(1)),
                    exhaustTempC: parseFloat(exhaust.toFixed(1)),
                    batteryVoltage: parseFloat(battery.toFixed(2)),
                    airPressure1Kpa: parseFloat(airP.toFixed(1)),
                    airPressure2Kpa: parseFloat((airP - rand(5, 20)).toFixed(1)),
                    defLevelLtr: parseFloat(rand(10, 40).toFixed(1)),
                    defConsumptionLtr: isOnline ? parseFloat(rand(0.01, 0.05).toFixed(3)) : 0,
                    defTankTempC: parseFloat(rand(20, 35).toFixed(1)),
                    sourceFile: 'mock_seed',
                });
            }
        }

        // ── Trip / Route records (sourceSystem: ialert_csv) ─────────────
        if (!isMaintenance) {
            // Historical completed trips (8–10 per truck over past 30 days)
            const tripCount = randI(8, 10);
            const routePairs = def.route
                ? [
                    { src: def.route.src, dst: def.route.dst, dist: def.route.dist },
                    { src: def.route.dst, dst: def.route.src, dist: def.route.dist },
                ]
                : [
                    { src: LOCATIONS.chennai, dst: LOCATIONS.madurai, dist: 462 },
                    { src: LOCATIONS.madurai, dst: LOCATIONS.coimbatore, dist: 460 },
                ];

            for (let t = 0; t < tripCount; t++) {
                const startDay = randI(1, 30);
                const startHr  = randI(5, 8);
                const tripStart = daysAgo(startDay, startHr, 0);
                const durationMin = (routePairs[t % 2].dist / rand(45, 60)) * 60;
                const tripEnd   = addMinutes(tripStart, durationMin);
                const avgSpeed  = parseFloat((routePairs[t % 2].dist / (durationMin / 60)).toFixed(1));
                const maxSpeed  = parseFloat((avgSpeed + rand(5, 20)).toFixed(1));
                const fuelUsed  = parseFloat((routePairs[t % 2].dist / (def.fuelEff - rand(0, 1))).toFixed(1));
                const fuelCost  = parseFloat((fuelUsed * def.cpl).toFixed(0));

                tripBatch.push({
                    source: routePairs[t % 2].src.name,
                    destination: routePairs[t % 2].dst.name,
                    distance: routePairs[t % 2].dist,
                    status: 'completed',
                    tripStartTime: tripStart,
                    tripEndTime: tripEnd,
                    fuelConsumed: fuelUsed,
                    fuelCost,
                    tollCount: randI(2, 8),
                    tollPrice: 65,
                    tollTotalCost: randI(2, 8) * 65,
                    totalTripCost: fuelCost + randI(2, 8) * 65 + randI(200, 800),
                    carbonEmission: parseFloat((fuelUsed * 2.65).toFixed(1)),
                    trafficLevel: pick(['Low', 'Medium', 'High']),
                    sourceSystem: 'ialert_csv',
                    externalTripKey: `${reg}_${tripStart.getTime()}`,
                    registrationNumber: reg,
                    startLatitude: routePairs[t % 2].src.lat,
                    startLongitude: routePairs[t % 2].src.lng,
                    endLatitude: routePairs[t % 2].dst.lat,
                    endLongitude: routePairs[t % 2].dst.lng,
                    // telemetry-style fields
                    distanceKm: routePairs[t % 2].dist,
                    avgSpeedKmph: avgSpeed,
                    maxSpeedKmph: maxSpeed,
                    durationMinutes: parseFloat(durationMin.toFixed(1)),
                });
            }
        }

        // Active in_transit trip for online trucks
        if (isOnline && def.route) {
            const activeStart = daysAgo(0, 6, 0);
            const fracNow = Math.min((now.getHours() - 6) / 14, 0.9);
            const distSoFar = parseFloat((def.route.dist * fracNow).toFixed(1));
            const avgSp = parseFloat((def.route.dist / 8).toFixed(1));

            tripBatch.push({
                source: def.route.src.name,
                destination: def.route.dst.name,
                distance: def.route.dist,
                status: 'in_transit',
                tripStartTime: activeStart,
                tripEndTime: null,
                fuelConsumed: parseFloat((distSoFar / def.fuelEff).toFixed(1)),
                fuelCost: 0,
                tollCount: randI(2, 5),
                tollPrice: 65,
                carbonEmission: 0,
                trafficLevel: pick(['Low', 'Medium', 'High']),
                sourceSystem: 'manual',
                registrationNumber: reg,
                startLatitude: def.route.src.lat,
                startLongitude: def.route.src.lng,
                distanceKm: distSoFar,
                avgSpeedKmph: avgSp,
                durationMinutes: (now - activeStart) / 60000,
            });
        }

        // ── Daily TruckAnalytics ─────────────────────────────────────────
        for (let day = 30; day >= 0; day--) {
            const date = daysAgo(day, 0, 0);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const active = isOnline || (!isMaintenance && !isWeekend && Math.random() > 0.3);
            if (!active) continue;

            const distDay = isOnline ? rand(280, 480) : rand(0, 200);
            const fuelDay = parseFloat((distDay / (def.fuelEff - rand(0, 0.5))).toFixed(1));
            const costDay = parseFloat((fuelDay * def.cpl).toFixed(0));

            analyticsBatch.push({
                date,
                truckId: reg,
                distanceKm: parseFloat(distDay.toFixed(1)),
                fuelUsedLiters: fuelDay,
                costRs: costDay,
                co2Kg: parseFloat((fuelDay * 2.65).toFixed(1)),
                deliveryTimeMin: parseFloat((distDay / 50 * 60).toFixed(0)),
            });
        }
    }

    // Bulk-insert telemetry in chunks
    const CHUNK = 500;
    for (let i = 0; i < telemetryBatch.length; i += CHUNK) {
        await IAlertTelemetry.insertMany(telemetryBatch.slice(i, i + CHUNK), { ordered: false }).catch(() => {});
        process.stdout.write(`\r  📡 Telemetry: ${Math.min(i + CHUNK, telemetryBatch.length)}/${telemetryBatch.length}`);
    }
    console.log();

    await Route.insertMany(tripBatch, { ordered: false }).catch(() => {});
    console.log(`✅ Created ${tripBatch.length} trip/route records`);

    await TruckAnalytics.insertMany(analyticsBatch, { ordered: false }).catch(() => {});
    console.log(`✅ Created ${analyticsBatch.length} daily analytics records`);

    // ── 6. Alerts ─────────────────────────────────────────────────────────────
    console.log('🔔 Seeding alerts …');
    const alertBatch = [];
    const allRegs = TRUCKS_DEF.map((d) => d.id);

    const ALERT_TEMPLATES = [
        { category: 'overspeed',  severity: 'warning',  message: (r) => `${r}: Speed exceeded 80 km/h — recorded at 93 km/h` },
        { category: 'overspeed',  severity: 'critical', message: (r) => `${r}: Critical overspeed — 107 km/h on NH 44` },
        { category: 'idle',       severity: 'info',     message: (r) => `${r}: Engine idle for 22 minutes at Namakkal` },
        { category: 'battery',    severity: 'warning',  message: (r) => `${r}: Battery voltage low — 11.3 V` },
        { category: 'engineHeat', severity: 'critical', message: (r) => `${r}: Coolant temperature high — 108°C` },
        { category: 'airPressure',severity: 'warning',  message: (r) => `${r}: Air pressure below threshold — 540 kPa` },
        { category: 'def',        severity: 'info',     message: (r) => `${r}: DEF tank level low — 8%` },
        { category: 'fuelAnomaly',severity: 'critical', message: (r) => `${r}: Fuel drop anomaly detected — 35 L in 12 min` },
        { category: 'general',    severity: 'info',     message: (r) => `${r}: Scheduled maintenance due in 5 days` },
    ];

    for (const reg of allRegs) {
        // 2–4 alerts per truck
        const count = randI(2, 4);
        const templates = [...ALERT_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, count);
        for (const tpl of templates) {
            alertBatch.push({
                registrationNumber: reg,
                category: tpl.category,
                severity: tpl.severity,
                message: tpl.message(reg),
                timestamp: daysAgo(randI(0, 7), randI(6, 20)),
                status: Math.random() > 0.4 ? 'active' : 'resolved',
                metadata: { seeded: true },
            });
        }
    }
    await Alert.insertMany(alertBatch);
    console.log(`✅ Created ${alertBatch.length} alerts`);

    // ── 7. SyncState – mark as seeded ─────────────────────────────────────────
    await SyncState.findOneAndUpdate(
        { key: 'ialert_csv_sync' },
        {
            $set: {
                key: 'ialert_csv_sync',
                status: 'success',
                message: 'Mock data seeded — 10 trucks, 30-day telemetry.',
                lastRunAt: new Date(),
                lastSuccessfulDate: new Date(),
                sourceFile: 'mock_seed',
                sourceRows: telemetryBatch.length,
                lastSummary: {
                    rowsAccepted: telemetryBatch.length,
                    tripsUpserted: tripBatch.length,
                    telemetryRowsUpserted: telemetryBatch.length,
                    trucksUpserted: truckDocs.length,
                    originalFileName: 'Mock Data Seed (no file upload needed)',
                },
                updatedAt: new Date(),
            },
        },
        { upsert: true }
    );

    await SyncLog.create({
        jobName: 'ialert_csv_sync',
        status: 'success',
        message: 'Mock data seeded successfully.',
        startedAt: new Date(),
        finishedAt: new Date(),
        meta: {
            originalFileName: 'Mock Data Seed',
            rowsAccepted: telemetryBatch.length,
            tripsUpserted: tripBatch.length,
            telemetryRowsUpserted: telemetryBatch.length,
            trucksUpserted: truckDocs.length,
        },
    });

    console.log('\n🎉 Seed complete!');
    console.log(`   Telemetry records : ${telemetryBatch.length}`);
    console.log(`   Trips             : ${tripBatch.length}`);
    console.log(`   Analytics rows    : ${analyticsBatch.length}`);
    console.log(`   Alerts            : ${alertBatch.length}`);
    console.log(`   Trucks            : 4 online · 2 maintenance · 4 offline`);

    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((err) => {
    console.error('Seed failed:', err);
    mongoose.disconnect();
    process.exit(1);
});
