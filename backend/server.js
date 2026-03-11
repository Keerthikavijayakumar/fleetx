require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { initializeSimulation } = require('./socket/simulation');

const authRoutes = require('./routes/authRoutes');
const truckRoutes = require('./routes/truckRoutes');
const routeRoutes = require('./routes/routeRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const directionsRoutes = require('./routes/directionsRoutes');
const { router: locationRoutes, setIO: setLocationIO } = require('./routes/locationRoutes');
const { router: driverRoutes, setIO: setDriverIO } = require('./routes/driverRoutes');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: ['http://localhost:5173', 'http://localhost:3000'],
        methods: ['GET', 'POST'],
    },
});

// Pass io to location routes
setLocationIO(io);
setDriverIO(io);

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/trucks', require('./routes/truckRoutes')(io));
app.use('/api/routes', routeRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/directions', directionsRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/emergency', require('./routes/emergencyRoutes')(io));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await connectDB();

        // Seed sample trucks if none exist
        const Truck = require('./models/Truck');
        const count = await Truck.countDocuments();
        if (count === 0) {
            const sampleTrucks = [
                { truckId: 'TRK-001', licensePlate: 'DL-01-AB-1234', driverName: 'Rajesh Kumar', fuelEfficiency: 8, tankCapacity: 200, costPerLitre: 95, emissionFactor: 2.68, status: 'active', latitude: 28.6139, longitude: 77.2090, speed: 65, fuelLevel: 85, engineStatus: 'running' },
                { truckId: 'TRK-002', licensePlate: 'MH-02-CD-5678', driverName: 'Amit Sharma', fuelEfficiency: 7.5, tankCapacity: 250, costPerLitre: 95, emissionFactor: 2.68, status: 'active', latitude: 19.0760, longitude: 72.8777, speed: 45, fuelLevel: 62, engineStatus: 'running' },
                { truckId: 'TRK-003', licensePlate: 'KA-03-EF-9012', driverName: 'Suresh Patel', fuelEfficiency: 9, tankCapacity: 180, costPerLitre: 95, emissionFactor: 2.68, status: 'active', latitude: 12.9716, longitude: 77.5946, speed: 0, fuelLevel: 40, engineStatus: 'idle' },
                { truckId: 'TRK-004', licensePlate: 'TN-04-GH-3456', driverName: 'Vijay Anand', fuelEfficiency: 8.5, tankCapacity: 220, costPerLitre: 95, emissionFactor: 2.68, status: 'active', latitude: 13.0827, longitude: 80.2707, speed: 80, fuelLevel: 90, engineStatus: 'running' },
                { truckId: 'TRK-005', licensePlate: 'WB-05-IJ-7890', driverName: 'Arjun Das', fuelEfficiency: 7, tankCapacity: 200, costPerLitre: 95, emissionFactor: 2.68, status: 'active', latitude: 22.5726, longitude: 88.3639, speed: 55, fuelLevel: 73, engineStatus: 'running' },
                { truckId: 'TRK-006', licensePlate: 'RJ-06-KL-2345', driverName: 'Mohammad Ali', fuelEfficiency: 8.2, tankCapacity: 210, costPerLitre: 95, emissionFactor: 2.68, status: 'maintenance', latitude: 26.9124, longitude: 75.7873, speed: 0, fuelLevel: 25, engineStatus: 'off' },
                { truckId: 'TRK-007', licensePlate: 'GJ-07-MN-6789', driverName: 'Prakash Joshi', fuelEfficiency: 9.5, tankCapacity: 190, costPerLitre: 95, emissionFactor: 2.68, status: 'active', latitude: 23.0225, longitude: 72.5714, speed: 70, fuelLevel: 55, engineStatus: 'running' },
                { truckId: 'TRK-008', licensePlate: 'AP-08-OP-0123', driverName: 'Ravi Teja', fuelEfficiency: 7.8, tankCapacity: 230, costPerLitre: 95, emissionFactor: 2.68, status: 'active', latitude: 17.3850, longitude: 78.4867, speed: 40, fuelLevel: 80, engineStatus: 'running' },
            ];
            await Truck.insertMany(sampleTrucks);
            console.log('✅ Seeded 8 sample trucks');
        }

        initializeSimulation(io);

        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📡 Socket.io ready for real-time connections`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
