const mongoose = require('mongoose');
require('dotenv').config();
const Route = require('./models/Route');

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const countAll = await Route.countDocuments();
    const countIAlert = await Route.countDocuments({ sourceSystem: 'ialert_csv' });
    const countStitched = await Route.countDocuments({ masterTripId: { $ne: '' } });
    console.log(`Total Routes: ${countAll}`);
    console.log(`IAlert Routes: ${countIAlert}`);
    console.log(`Stitched Routes: ${countStitched}`);
    
    if (countIAlert > 0) {
        const sample = await Route.findOne({ sourceSystem: 'ialert_csv' }).lean();
        console.log('Sample IAlert Route:', JSON.stringify(sample, null, 2));
    }
    
    process.exit(0);
}

check();
