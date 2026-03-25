import axios from 'axios';

const getBaseURL = () => {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    if (!envUrl) return '/api';
    // Remove trailing slash if present, then add /api
    return `${envUrl.replace(/\/$/, '')}/api`;
};

const api = axios.create({
    baseURL: getBaseURL(),
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('fleetx_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('fleetx_token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// Auth
export const authAPI = {
    login: (data) => api.post('/auth/login', data),
    register: (data) => api.post('/auth/register', data),
    profile: () => api.get('/auth/profile'),
    adminCreateUser: (data) => api.post('/auth/admin/users', data),
    // multipart/form-data for photo upload
    adminCreateUserWithPhoto: (formData) => api.post('/auth/admin/users', formData, { headers: { 'Content-Type': undefined } }),
    adminListUsers: (role) => api.get('/auth/admin/users', { params: role ? { role } : {} }),
    adminGetUser: (id) => api.get(`/auth/admin/users/${id}`),
    adminUpdateUser: (id, data) => api.put(`/auth/admin/users/${id}`, data),
    adminUpdateUserWithPhoto: (id, formData) => api.put(`/auth/admin/users/${id}`, formData, { headers: { 'Content-Type': undefined } }),
    adminDeleteUser: (id) => api.delete(`/auth/admin/users/${id}`),
};

// Trucks
export const trucksAPI = {
    getAll: () => api.get('/trucks'),
    getRawData: () => api.get('/trucks/rawdata'),
    getById: (id) => api.get(`/trucks/${id}`),
    create: (data) => api.post('/trucks', data),
    // For multipart/form-data (file uploads) – set Content-Type to undefined so
    // axios/browser sets the correct boundary automatically.
    createWithFiles: (formData) => api.post('/trucks', formData, { headers: { 'Content-Type': undefined } }),
    update: (id, data) => api.put(`/trucks/${id}`, data),
    updateWithFiles: (id, formData) => api.put(`/trucks/${id}`, formData, { headers: { 'Content-Type': undefined } }),
    delete: (id) => api.delete(`/trucks/${id}`),
    clearAll: () => api.delete('/trucks'),
    assignDriver: (id, driverName) => api.patch(`/trucks/${id}/driver`, { driverName }),
};

// Routes
export const routesAPI = {
    getAll: () => api.get('/routes'),
    getById: (id) => api.get(`/routes/${id}`),
    plan: (data) => api.post('/routes', data),
    update: (id, data) => api.put(`/routes/${id}`, data),
    delete: (id) => api.delete(`/routes/${id}`),
};

// Maintenance
export const maintenanceAPI = {
    getAll: () => api.get('/maintenance'),
    getById: (id) => api.get(`/maintenance/${id}`),
    create: (data) => api.post('/maintenance', data),
    update: (id, data) => api.put(`/maintenance/${id}`, data),
    delete: (id) => api.delete(`/maintenance/${id}`),
    getOverdue: () => api.get('/maintenance/overdue'),
    getUpcoming: (days) => api.get(`/maintenance/upcoming?days=${days}`),
};

// Analytics
export const analyticsAPI = {
    getDashboardStats: () => api.get('/analytics/dashboard'),
    getAdminFullAccess: (params = {}) => api.get('/analytics/admin/full-access', { params }),
    getAdminCsvOverview: () => api.get('/analytics/admin/csv-overview'),
    getAdminReport: (params = {}) => api.get('/analytics/admin/report', { params, responseType: 'blob' }),
    createAdminEntry: (data) => api.post('/analytics/admin/entries', data),
    uploadAdminCsv: (formData) => api.post('/analytics/admin/upload-csv', formData, { headers: { 'Content-Type': undefined } }),
    updateAdminEntry: (id, data) => api.put(`/analytics/admin/entries/${id}`, data),
    getFuelConsumption: () => api.get('/analytics/fuel'),
    getMaintenanceCost: () => api.get('/analytics/maintenance-cost'),
    getCO2Emissions: () => api.get('/analytics/co2'),
    getDeliveryTime: () => api.get('/analytics/delivery-time'),
    getTrafficImpact: () => api.get('/analytics/traffic'),
};

// Telemetry Analytics
export const telemetryAPI = {
    fleetSummary: () => api.get('/telemetry/fleet-summary'),
    latestPositions: () => api.get('/telemetry/latest-positions'),
    gpsHistory: (params) => api.get('/telemetry/gps-history', { params }),
    trips: (params) => api.get('/telemetry/trips', { params }),
    overspeed: (params) => api.get('/telemetry/overspeed', { params }),
    overspeedRanking: (params) => api.get('/telemetry/overspeed-ranking', { params }),
    idleSessions: (params) => api.get('/telemetry/idle-sessions', { params }),
    fuelEfficiency: (params) => api.get('/telemetry/fuel-efficiency', { params }),
    fuelAnomalies: (params) => api.get('/telemetry/fuel-anomalies', { params }),
    engineHealth: (params) => api.get('/telemetry/engine-health', { params }),
    speedTrend: (params) => api.get('/telemetry/speed-trend', { params }),
    monthlyDistance: (params) => api.get('/telemetry/monthly-distance', { params }),
    systemParams: (params) => api.get('/telemetry/system-params', { params }),
    stitchedTrips: (params) => api.get('/telemetry/stitched-trips', { params }),
    underusedTrucks: (params) => api.get('/telemetry/underused-trucks', { params }),
    runAlertSweep: () => api.post('/telemetry/run-alert-sweep'),
};

export const adminSyncAPI = {
    uploadRootCsv: (formData) => api.post('/admin/sync/ialert-csv/upload-root', formData, { headers: { 'Content-Type': undefined } }),
    getIAlertSyncStatus: () => api.get('/admin/sync/ialert-csv/status'),
    getIAlertSyncHistory: (limit = 20) => api.get('/admin/sync/ialert-csv/history', { params: { limit } }),
};

// Alerts
export const alertsAPI = {
    list: (params) => api.get('/alerts', { params }),
    unreadCount: () => api.get('/alerts/unread-count'),
    acknowledge: (id) => api.put(`/alerts/${id}/acknowledge`),
    resolve: (id) => api.put(`/alerts/${id}/resolve`),
};

// Directions (Google Maps Routes v2 proxy)
export const directionsAPI = {
    get: (data) => api.post('/directions', data),
};

// Location (Driver GPS)
export const locationAPI = {
    update: (data) => api.post('/location/update', data),
};

// Driver API (Geolocation)
export const driverAPI = {
    locationUpdate: (data) => api.post('/driver/location', data),
};

// Emergency API
export const emergencyAPI = {
    triggerAlert: (data) => api.post('/emergency', data),
    getAlerts: () => api.get('/emergency'),
    resolveAlert: (id) => api.patch(`/emergency/${id}`),
};

// Salary API (Trip-based salary assignments)
export const salaryAPI = {
    assignSalary: (data) => api.post('/salary', data),
    getSalaries: (params = {}) => api.get('/salary', { params }),
    getSalaryById: (id) => api.get(`/salary/${id}`),
    updateSalary: (id, data) => api.put(`/salary/${id}`, data),
    deleteSalary: (id) => api.delete(`/salary/${id}`),
};

export default api;
