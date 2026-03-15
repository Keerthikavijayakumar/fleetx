require('dotenv').config();
const mongoose = require('mongoose');
const Truck = require('../models/Truck');

function normalizePermitPath(value) {
    if (!value) return value;
    const str = String(value).trim();
    if (!str) return str;

    // Already in new format.
    if (str.startsWith('/api/uploads/permits/')) return str;

    // Old format: /api/uploads/<filename>
    if (str.startsWith('/api/uploads/')) {
        const filename = str.replace('/api/uploads/', '');
        if (filename && !filename.includes('/')) {
            return `/api/uploads/permits/${filename}`;
        }
    }

    return str;
}

async function run() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not set in environment.');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const trucks = await Truck.find({
        $or: [
            { stateTaxPermitPath: { $regex: '^/api/uploads/' } },
            { centralTaxPermitPath: { $regex: '^/api/uploads/' } },
        ],
    }).select('_id truckId stateTaxPermitPath centralTaxPermitPath');

    let updatedCount = 0;

    for (const truck of trucks) {
        const nextState = normalizePermitPath(truck.stateTaxPermitPath);
        const nextCentral = normalizePermitPath(truck.centralTaxPermitPath);

        const changed =
            nextState !== truck.stateTaxPermitPath ||
            nextCentral !== truck.centralTaxPermitPath;

        if (!changed) continue;

        truck.stateTaxPermitPath = nextState;
        truck.centralTaxPermitPath = nextCentral;
        await truck.save();
        updatedCount += 1;
    }

    console.log(`Scanned records: ${trucks.length}`);
    console.log(`Updated records: ${updatedCount}`);

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error('Permit path migration failed:', err.message);
    process.exit(1);
});
