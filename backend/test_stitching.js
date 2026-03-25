const { deriveTrips } = require('./deriveTripsShim');

// Mock data: 3 trips, two close together, one far away
const now = new Date();
const t1 = new Date(now.getTime() - 10 * 3600 * 1000); // 10h ago
const t2 = new Date(now.getTime() - 9.5 * 3600 * 1000); // 9.5h ago (0.5h gap from t1)
const t3 = new Date(now.getTime() - 4 * 3600 * 1000); // 4h ago (5h gap from t2)

const rows = [
    { registrationNumber: 'TEST1', timestamp: t1, ignitionStatus: 'ON', vehicleSpeedKmph: 20 },
    { registrationNumber: 'TEST1', timestamp: new Date(t1.getTime() + 1000), ignitionStatus: 'OFF', vehicleSpeedKmph: 0 },
    
    { registrationNumber: 'TEST1', timestamp: t2, ignitionStatus: 'ON', vehicleSpeedKmph: 20 },
    { registrationNumber: 'TEST1', timestamp: new Date(t2.getTime() + 1000), ignitionStatus: 'OFF', vehicleSpeedKmph: 0 },
    
    { registrationNumber: 'TEST1', timestamp: t3, ignitionStatus: 'ON', vehicleSpeedKmph: 20 },
    { registrationNumber: 'TEST1', timestamp: new Date(t3.getTime() + 1000), ignitionStatus: 'OFF', vehicleSpeedKmph: 0 },
];

const trips = deriveTrips(rows);

// Stitching Logic
let currentMasterId = null;
let lastEndTime = null;
const reg = 'TEST1';

trips.forEach((trip, index) => {
    if (!lastEndTime || (trip.start.timestamp - lastEndTime) / 3600000 >= 4) {
        currentMasterId = `MT-${reg}-${trip.start.timestamp.getTime()}`;
    }
    trip.masterTripId = currentMasterId;
    lastEndTime = trip.end.timestamp;
    console.log(`Trip ${index + 1}: Start ${trip.start.timestamp.toISOString()}, End ${trip.end.timestamp.toISOString()}, MasterID: ${trip.masterTripId}`);
});

if (trips[0].masterTripId === trips[1].masterTripId && trips[0].masterTripId !== trips[2].masterTripId) {
    console.log('SUCCESS: Stitching logic works as expected!');
} else {
    console.log('FAILURE: Stitching logic did not group correctly.');
}
process.exit(0);
