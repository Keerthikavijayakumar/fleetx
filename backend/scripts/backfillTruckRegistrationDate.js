require('dotenv').config();
const mongoose = require('mongoose');
const Truck = require('../models/Truck');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);

    const result = await Truck.updateMany(
        { $or: [{ registrationDate: { $exists: false } }, { registrationDate: null }] },
        { $set: { registrationDate: new Date() } }
    );

    const modified = result.modifiedCount ?? result.nModified ?? 0;
    console.log('Backfilled registrationDate on trucks:', modified);

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
