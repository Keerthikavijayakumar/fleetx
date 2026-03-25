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
const adminSyncRoutes = require('./routes/adminSyncRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
const alertRoutes = require('./routes/alertRoutes');
const salaryRoutes = require('./routes/salaryRoutes');
const { initializeSchedulers, triggerStartupBootstrap } = require('./services/scheduler');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: ['http://localhost:5173', 'http://localhost:3000','https://fleetx-nu.vercel.app/'],
        methods: ['GET', 'POST'],
    },
});

// Pass io to location routes
setLocationIO(io);
setDriverIO(io);

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000','https://fleetx-nu.vercel.app/'],
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
app.use('/api/admin/sync', adminSyncRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/salary', salaryRoutes);

// Serve uploaded permit documents
const path = require('path');

// Backward compatibility for old permit paths stored as /api/uploads/<filename>
app.get('/api/uploads/:fileName', (req, res, next) => {
    const legacyPermitPath = path.join(__dirname, 'uploads', 'permits', req.params.fileName);
    if (require('fs').existsSync(legacyPermitPath)) {
        return res.sendFile(legacyPermitPath);
    }
    return next();
});

app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

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

        // initializeSimulation(io);
        initializeSchedulers();

        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📡 Socket.io ready for real-time connections`);

            // Run bootstrap asynchronously so server startup is not blocked.
            setTimeout(() => {
                triggerStartupBootstrap();
            }, 1000);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
