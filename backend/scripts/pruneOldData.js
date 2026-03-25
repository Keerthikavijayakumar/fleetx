/**
 * pruneOldData.js
 * Run once to immediately free Atlas storage space.
 *
 * Usage:
 *   node scripts/pruneOldData.js
 *   node scripts/pruneOldData.js --days 60   (keep most recent N days of telemetry)
 */

require('dotenv').config();
const mongoose = require('mongoose');

const IAlertTelemetry = require('../models/IAlertTelemetry');
const SyncLog = require('../models/SyncLog');
const Alert = require('../models/Alert');

const args = process.argv.slice(2);
const daysArg = args.find(a => a.startsWith('--days=') || a === '--days');
let retentionDays = Number(process.env.TELEMETRY_RETENTION_DAYS || 90);
if (daysArg) {
    const idx = args.indexOf('--days');
    retentionDays = idx !== -1 ? Number(args[idx + 1]) : Number(daysArg.split('=')[1]);
}

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const telemetryCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const syncLogCutoff  = new Date(Date.now() - 30  * 24 * 60 * 60 * 1000);
    const alertCutoff    = new Date(Date.now() - 60  * 24 * 60 * 60 * 1000);

    console.log(`\nPruning telemetry older than ${retentionDays} days (before ${telemetryCutoff.toISOString()})`);
    const t = await IAlertTelemetry.deleteMany({ timestamp: { $lt: telemetryCutoff } });
    console.log(`  ✔ Deleted ${t.deletedCount} IAlertTelemetry documents`);

    console.log(`\nPruning sync logs older than 30 days (before ${syncLogCutoff.toISOString()})`);
    const s = await SyncLog.deleteMany({ startedAt: { $lt: syncLogCutoff } });
    console.log(`  ✔ Deleted ${s.deletedCount} SyncLog documents`);

    console.log(`\nPruning resolved/acknowledged alerts older than 60 days (before ${alertCutoff.toISOString()})`);
    const a = await Alert.deleteMany({
        status: { $in: ['resolved', 'acknowledged'] },
        updatedAt: { $lt: alertCutoff },
    });
    console.log(`  ✔ Deleted ${a.deletedCount} Alert documents`);

    console.log('\nDone. Run compact/repairDatabase from Atlas UI to reclaim physical space.');
    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
