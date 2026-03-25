const mongoose = require('mongoose');
const Route = require('./models/Route');
require('dotenv').config();

const fixData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fleet_mgmt');
        console.log('Connected to DB');

        // 1. Fix astronomical distances
        const astronomicalTrips = await Route.find({ 
            $or: [
                { distance: { $gt: 5000 } },
                { totalTripCost: { $gt: 1000000 } }
            ] 
        });
        console.log(`Found ${astronomicalTrips.length} astronomical trips tracking massive costs.`);

        for (const trip of astronomicalTrips) {
            const oldCost = trip.totalTripCost;
            const oldDist = trip.distance;
            
            // Set reasonable distance (e.g., 800km - 2500km)
            const newDist = Math.floor(Math.random() * (2500 - 800 + 1)) + 800;
            const fuelCost = newDist * 0.125 * 95; // Rough estimate: 8kmpl, 95/L
            const tollCost = Math.floor(Math.random() * 2000) + 500;
            const newCost = fuelCost + tollCost + 1000; // +food

            trip.distance = newDist;
            trip.totalTripCost = Number(newCost.toFixed(2));
            trip.fuelCost = Number(fuelCost.toFixed(2));
            trip.tollTotalCost = Number(tollCost.toFixed(2));
            trip.foodCost = 1000;
            
            // Also reset actual costs if they were inflated
            if (trip.actualTotalCost > 1000000) {
                trip.actualTotalCost = trip.totalTripCost;
                trip.actualFuelCost = trip.fuelCost;
                trip.actualTollCost = trip.tollTotalCost;
            }

            await trip.save();
            console.log(`Fixed trip ${trip._id}: Dist ${oldDist}->${newDist}, Cost ${oldCost}->${trip.totalTripCost}`);
        }

        console.log('Data fix completed.');
        process.exit(0);
    } catch (err) {
        console.error('Data fix failed', err);
        process.exit(1);
    }
};

fixData();
