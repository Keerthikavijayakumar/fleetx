require('dotenv').config();
const mongoose = require('mongoose');
const Truck = require('../models/Truck');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);

    const trucks = await Truck.find({}).select('_id licensePlate truckId');
    let updated = 0;

    for (const truck of trucks) {
        const plate = (truck.licensePlate || '').trim();
        if (!plate) continue;

        if (truck.truckId !== plate) {
            truck.truckId = plate;
            await truck.save();
            updated += 1;
        }
    }

    console.log('Synced truckId with number plate for records:', updated);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
