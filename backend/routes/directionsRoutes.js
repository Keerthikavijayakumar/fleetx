const express = require('express');
const router = express.Router();
const axios = require('axios');
const { auth } = require('../middleware/auth');

router.use(auth);

// Helper to convert address string to [lon, lat] using free Nominatim API
const geocodeAddress = async (address) => {
    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: address,
                format: 'json',
                limit: 1
            },
            headers: {
                // Nominatim asks for a User-Agent identifying the app
                'User-Agent': 'Fleetx-Logistics-Platform'
            }
        });
        
        if (response.data && response.data.length > 0) {
            return {
                lon: response.data[0].lon,
                lat: response.data[0].lat,
                display_name: response.data[0].display_name
            };
        }
        return null;
    } catch (error) {
        console.error('Geocoding error for', address, error.message);
        return null;
    }
};

// POST /api/directions
router.post('/', async (req, res) => {
    try {
        const { origin, destination, waypoints = [] } = req.body;

        if (!origin || !destination) {
            return res.status(400).json({ message: 'Origin and destination are required' });
        }

        // 1. Geocode all locations
        const locationsToGeocode = [origin, ...waypoints, destination];
        const geocodedLocations = await Promise.all(locationsToGeocode.map(geocodeAddress));

        // Check if any location failed
        const failedIndex = geocodedLocations.findIndex(loc => loc === null);
        if (failedIndex !== -1) {
            return res.status(400).json({ 
                message: `Could not find coordinates for location: ${locationsToGeocode[failedIndex]}` 
            });
        }

        // 2. Build OSRM coordinates string (lon,lat;lon,lat;...)
        const coordsString = geocodedLocations.map(loc => `${loc.lon},${loc.lat}`).join(';');

        // 3. Request route from public Open Source Routing Machine
        const osrmResponse = await axios.get(`http://router.project-osrm.org/route/v1/driving/${coordsString}`, {
            params: {
                overview: 'full',
                geometries: 'polyline'
            }
        });

        const data = osrmResponse.data;

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            return res.status(400).json({
                message: 'No route found by OSRM',
                status: 'ZERO_RESULTS'
            });
        }

        const route = data.routes[0];
        
        // Very basic formatter for frontend consistency
        const formatDuration = (seconds) => {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            if (h > 0) return `${h} hours ${m} mins`;
            return `${m} mins`;
        };

        // Mimic the expected response structure from Google Routes v2 so Frontend doesn't break
        res.json({
            status: 'OK',
            routes: [{
                legs: [{
                    distance: {
                        text: `${(route.distance / 1000).toFixed(1)} km`,
                        value: route.distance // OSRM gives distance in meters
                    },
                    duration: {
                        text: formatDuration(route.duration),
                        value: route.duration // OSRM gives duration in seconds
                    },
                    duration_in_traffic: {
                        // OSRM Public API doesn't have live traffic, use base duration
                        text: formatDuration(route.duration),
                        value: route.duration
                    },
                    start_address: geocodedLocations[0].display_name,
                    end_address: geocodedLocations[geocodedLocations.length - 1].display_name,
                }],
                overview_polyline: {
                    points: route.geometry // OSRM geometry is encoded polyline
                },
                waypoint_order: [] // OSRM public API doesn't do TSP optimization by default
            }]
        });

    } catch (error) {
        console.error('OSRM API error:', error.response?.data || error.message);
        res.status(500).json({ 
            message: 'Failed to fetch OSRM directions',
            details: error.response?.data 
        });
    }
});

module.exports = router;
