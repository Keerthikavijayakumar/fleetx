const mongoose = require('mongoose');
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./models/User');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const admin = await User.findOne({ role: 'admin' });
        if (!admin) {
            console.log("No admin found in DB");
            process.exit(1);
        }

        const token = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET);
        const headers = { Authorization: `Bearer ${token}` };

        // Get an active truck
        const trucksListRes = await axios.get('http://localhost:5000/api/trucks', { headers });
        const activeTrucks = trucksListRes.data.filter(t => t.status === 'active');
        if(activeTrucks.length === 0) {
            console.log("No active trucks to test.");
            process.exit(1);
        }
        const myTruck = activeTrucks[0];
        console.log(`Starting test on Truck: ${myTruck.truckId}`);
        console.log(`Initial totalDistance: ${myTruck.totalDistance || 0}`);

        // Ping location 1 (New York approximation)
        let res = await axios.post('http://localhost:5000/api/driver/location', {
            truckId: myTruck.truckId,
            latitude: 40.7128,
            longitude: -74.0060,
            speed: 55
        }, { headers });
        console.log(`First ping totalDistance: ${res.data.truck.totalDistance}`);

        // Ping location 2 (Newark, approx 15km away)
        res = await axios.post('http://localhost:5000/api/driver/location', {
            truckId: myTruck.truckId,
            latitude: 40.7357,
            longitude: -74.1724,
            speed: 60
        }, { headers });
        console.log(`Second ping totalDistance (should be +~14.5km): ${res.data.truck.totalDistance}`);

        console.log("Verification successful!");
        process.exit(0);
    } catch (e) {
        console.error("Test failed", e.response?.data || e.message);
        process.exit(1);
    }
}
run();
