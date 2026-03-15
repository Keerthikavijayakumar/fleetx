require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const { runIAlertCsvSync } = require('../services/ialertCsvIngestionService');

async function main() {
    const reason = process.argv[2] || 'runner';
    try {
        await connectDB();
        const result = await runIAlertCsvSync({ reason });
        console.log(`[iAlertSyncRunner] Completed with status=${result.status}`);
        process.exit(0);
    } catch (error) {
        console.error('[iAlertSyncRunner] Failed:', error.message);
        process.exit(1);
    } finally {
        try {
            await mongoose.connection.close();
        } catch {
            // ignore disconnect errors
        }
    }
}

main();
