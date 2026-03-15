require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Route = require('../models/Route');

const shouldAssignAll = process.argv.includes('--all');

function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);

    const drivers = await User.find({ role: 'driver' }).select('_id username fullName');
    const assistants = await User.find({ role: { $in: ['assistant', 'driver'] } }).select('_id username fullName role');

    if (drivers.length === 0 || assistants.length === 0) {
        console.log('No eligible drivers/assistants found.');
        return;
    }

    const query = shouldAssignAll
        ? {}
        : {
            $or: [
                { driverId: { $exists: false } },
                { assistantId: { $exists: false } },
                { driverId: null },
                { assistantId: null },
            ],
        };

    const trips = await Route.find(query).select('_id source destination driverId assistantId');

    let updated = 0;
    for (const trip of trips) {
        const driver = pickRandom(drivers);
        let assistantPool = assistants.filter((person) => String(person._id) !== String(driver._id));
        if (assistantPool.length === 0) assistantPool = assistants;
        const assistant = pickRandom(assistantPool);

        trip.driverId = driver._id;
        trip.assistantId = assistant._id;
        await trip.save();
        updated += 1;
    }

    console.log(`Random crew assignment completed. Trips updated: ${updated}`);
}

run()
    .catch((error) => {
        console.error('Random crew assignment failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    });
