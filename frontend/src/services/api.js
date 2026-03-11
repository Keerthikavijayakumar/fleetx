import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
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
};

// Trucks
export const trucksAPI = {
    getAll: () => api.get('/trucks'),
    getById: (id) => api.get(`/trucks/${id}`),
    create: (data) => api.post('/trucks', data),
    update: (id, data) => api.put(`/trucks/${id}`, data),
    delete: (id) => api.delete(`/trucks/${id}`),
    assignDriver: (id, driverName) => api.patch(`/trucks/${id}/driver`, { driverName }),
};

// Routes
export const routesAPI = {
    getAll: () => api.get('/routes'),
    getById: (id) => api.get(`/routes/${id}`),
    plan: (data) => api.post('/routes', data),
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
    getFuelConsumption: () => api.get('/analytics/fuel'),
    getMaintenanceCost: () => api.get('/analytics/maintenance-cost'),
    getCO2Emissions: () => api.get('/analytics/co2'),
    getDeliveryTime: () => api.get('/analytics/delivery-time'),
    getTrafficImpact: () => api.get('/analytics/traffic'),
    uploadCSV: (formData) => api.post('/analytics/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
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

export default api;
