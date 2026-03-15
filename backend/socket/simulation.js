const Truck = require('../models/Truck');

const INDIAN_CITIES = [
    { lat: 28.6139, lng: 77.2090, name: 'Delhi' },
    { lat: 19.0760, lng: 72.8777, name: 'Mumbai' },
    { lat: 13.0827, lng: 80.2707, name: 'Chennai' },
    { lat: 22.5726, lng: 88.3639, name: 'Kolkata' },
    { lat: 12.9716, lng: 77.5946, name: 'Bangalore' },
    { lat: 17.3850, lng: 78.4867, name: 'Hyderabad' },
    { lat: 23.0225, lng: 72.5714, name: 'Ahmedabad' },
    { lat: 26.9124, lng: 75.7873, name: 'Jaipur' },
    { lat: 21.1702, lng: 72.8311, name: 'Surat' },
    { lat: 18.5204, lng: 73.8567, name: 'Pune' },
];

function initializeSimulation(io) {
    console.log('🚛 Real-time truck simulation initialized');

    io.on('connection', (socket) => {
        console.log(`📡 Client connected: ${socket.id}`);

        socket.on('disconnect', () => {
            console.log(`📡 Client disconnected: ${socket.id}`);
        });
    });

    setInterval(async () => {
        try {
            const trucks = await Truck.find({ status: 'active' });

            if (trucks.length === 0) return;

            const updates = [];

            for (const truck of trucks) {
                // Backfill legacy records created before registrationDate became mandatory.
                if (!truck.registrationDate) {
                    truck.registrationDate = truck.createdAt || new Date();
                }

                const latChange = (Math.random() - 0.5) * 0.02;
                const lngChange = (Math.random() - 0.5) * 0.02;

                truck.latitude = Math.max(8, Math.min(35, truck.latitude + latChange));
                truck.longitude = Math.max(68, Math.min(97, truck.longitude + lngChange));

                const speedOptions = [0, 20, 40, 55, 65, 75, 80, 90];
                truck.speed = speedOptions[Math.floor(Math.random() * speedOptions.length)];

                if (truck.fuelLevel > 5) {
                    truck.fuelLevel = Math.max(0, truck.fuelLevel - (Math.random() * 2));
                }

                const engineOptions = ['running', 'idle', 'running', 'running'];
                truck.engineStatus = truck.speed > 0 ? 'running' : engineOptions[Math.floor(Math.random() * engineOptions.length)];

                await truck.save();

                updates.push({
                    _id: truck._id,
                    truckId: truck.truckId,
                    driverName: truck.driverName,
                    latitude: parseFloat(truck.latitude.toFixed(6)),
                    longitude: parseFloat(truck.longitude.toFixed(6)),
                    speed: truck.speed,
                    fuelLevel: parseFloat(truck.fuelLevel.toFixed(1)),
                    engineStatus: truck.engineStatus,
                    licensePlate: truck.licensePlate,
                });
            }

            io.emit('truckUpdate', updates);
        } catch (error) {
            console.error('Simulation error:', error.message);
        }
    }, 5000);
}

module.exports = { initializeSimulation };
