require('dotenv').config();
const mongoose = require('mongoose');
const Truck = require('../models/Truck');
const Route = require('../models/Route');
const Maintenance = require('../models/Maintenance');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);

    const [trucks, routes, maintenance] = await Promise.all([
        Truck.deleteMany({}),
        Route.deleteMany({}),
        Maintenance.deleteMany({}),
    ]);

    console.log('Deleted trucks:', trucks.deletedCount);
    console.log('Deleted routes:', routes.deletedCount);
    console.log('Deleted maintenance records:', maintenance.deletedCount);

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
