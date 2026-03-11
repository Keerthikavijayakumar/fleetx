import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { trucksAPI, directionsAPI, routesAPI } from '../services/api';
import { HiOutlineMap, HiOutlineSwitchHorizontal, HiOutlineTruck } from 'react-icons/hi';
import polylineUtil from '@mapbox/polyline';

// Helper component to handle programmatic map moves in Leaflet
function MapController({ center, bounds }) {
    const map = useMap();
    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds, { padding: [50, 50] });
        } else if (center) {
            map.flyTo([center.lat, center.lng], map.getZoom());
        }
    }, [center, bounds, map]);
    return null;
}

const RoutePlanner = () => {
    const [origin, setOrigin] = useState('');
    const [waypoints, setWaypoints] = useState([]);
    const [destination, setDestination] = useState('');
    const [leafletPolyline, setLeafletPolyline] = useState([]);
    const [mapBounds, setMapBounds] = useState(null);
    const [routeInfo, setRouteInfo] = useState(null);
    const [trucks, setTrucks] = useState([]);
    const [selectedTruck, setSelectedTruck] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [center, setCenter] = useState({ lat: 20.5937, lng: 78.9629 }); // Default India

    useEffect(() => {
        // Get user location for map center
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setCenter({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                },
                (error) => console.log('Geolocation error:', error)
            );
        }

        trucksAPI.getAll().then(res => {
            setTrucks(res.data);
            if (res.data.length > 0) setSelectedTruck(res.data[0]);
        }).catch(console.error);
    }, []);

    const swapLocations = () => {
        setOrigin(destination);
        setDestination(origin);
    };

    const addWaypoint = () => {
        setWaypoints([...waypoints, '']);
    };

    const removeWaypoint = (index) => {
        const newWaypoints = [...waypoints];
        newWaypoints.splice(index, 1);
        setWaypoints(newWaypoints);
    };

    const updateWaypoint = (index, value) => {
        const newWaypoints = [...waypoints];
        newWaypoints[index] = value;
        setWaypoints(newWaypoints);
    };

    const calculateRoute = async () => {
        if (!origin || !destination) return setError('Enter both origin and destination');
        if (!selectedTruck) return setError('Select a truck');
        
        // Filter out empty waypoints
        const validWaypoints = waypoints.filter(wp => wp.trim() !== '');
        
        setError('');
        setLoading(true);

        try {
            // Use backend proxy for Routes API v2
            const res = await directionsAPI.get({
                origin,
                destination,
                waypoints: validWaypoints
            });
            
            const data = res.data;

            if (data.status === 'OK' && data.routes?.length > 0) {
                const route = data.routes[0];
                const leg = route.legs[0]; // New backend collapses total journey into 1 leg
                const distanceKm = leg.distance.value / 1000;
                
                // Using route.duration and duration_in_traffic from the new API
                const durationSec = leg.duration.value;
                const durationInTrafficSec = leg.duration_in_traffic?.value || durationSec;

                // Traffic level
                let trafficLevel = 'Low';
                if (durationInTrafficSec > durationSec * 1.4) trafficLevel = 'High';
                else if (durationInTrafficSec > durationSec * 1.15) trafficLevel = 'Medium';

                // Calculations using selected truck
                const fuelConsumed = parseFloat((distanceKm / selectedTruck.fuelEfficiency).toFixed(2));
                const fuelCost = parseFloat((fuelConsumed * selectedTruck.costPerLitre).toFixed(2));
                const carbonEmission = parseFloat((fuelConsumed * selectedTruck.emissionFactor).toFixed(2));

                setRouteInfo({
                    origin: leg.start_address,
                    destination: leg.end_address,
                    distance: parseFloat(distanceKm.toFixed(1)),
                    duration: leg.duration.text,
                    durationInTraffic: leg.duration_in_traffic?.text || leg.duration.text,
                    trafficLevel,
                    fuelConsumed,
                    fuelCost,
                    carbonEmission,
                    truckId: selectedTruck.truckId,
                    optimizedOrder: route.waypoint_order?.length > 0 ? route.waypoint_order : null
                });

                // Parse polyline returned by backend (OSRM returning GeoJSON or encoded poly)
                if (route.overview_polyline?.points) {
                    try {
                        // Decode Google-style/OSRM-style encoded polyline to LatLng array
                        const decoded = polylineUtil.decode(route.overview_polyline.points);
                        setLeafletPolyline(decoded);
                        
                        // Calculate bounding box for map fit
                        if (decoded.length > 0) {
                            const lats = decoded.map(p => p[0]);
                            const lngs = decoded.map(p => p[1]);
                            setMapBounds([
                                [Math.min(...lats), Math.min(...lngs)],
                                [Math.max(...lats), Math.max(...lngs)]
                            ]);
                        }
                    } catch(e) { console.error("Polyline decoding failed", e); }
                }

                // Save route
                try {
                    await routesAPI.plan({
                        source: origin,
                        destination,
                        distance: parseFloat(distanceKm.toFixed(1)),
                        fuelConsumed,
                        fuelCost,
                        carbonEmission,
                        trafficLevel,
                        duration: leg.duration_in_traffic?.text || leg.duration.text,
                    });
                } catch (e) {
                    console.error('Failed to save route:', e);
                }
            } else {
                setError('No route found');
            }
        } catch (err) {
            setError('Route calculation failed: ' + (err.response?.data?.message || err.message));
        } finally {
            setLoading(false);
        }
    };

    const trafficColor = routeInfo?.trafficLevel === 'High' ? 'text-red-600 bg-red-50 border-red-200'
        : routeInfo?.trafficLevel === 'Medium' ? 'text-amber-600 bg-amber-50 border-amber-200'
            : 'text-green-600 bg-green-50 border-green-200';

    return (
        <div className="animate-fade-in">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <HiOutlineMap className="text-red-500" /> Route Planner
                </h1>
                <p className="text-gray-500 text-sm mt-1">Plan routes with real-time traffic and fuel calculations</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Controls */}
                <div className="space-y-4">
                    {/* Truck Selector */}
                    <div className="card p-4">
                        <label className="text-xs font-semibold text-gray-600 mb-2 block flex items-center gap-1.5">
                            <HiOutlineTruck className="text-red-500" /> Select Truck
                        </label>
                        <select
                            value={selectedTruck?._id || ''}
                            onChange={(e) => setSelectedTruck(trucks.find(t => t._id === e.target.value))}
                            className="input-field text-sm"
                        >
                            <option value="">Select...</option>
                            {trucks.map(t => (
                                <option key={t._id} value={t._id}>{t.truckId} — {t.driverName} ({t.fuelEfficiency} km/l)</option>
                            ))}
                        </select>
                    </div>

                    {/* Origin / Destination */}
                    <div className="card p-4 space-y-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Origin</label>
                            <input
                                type="text"
                                placeholder="Enter origin city"
                                value={origin}
                                onChange={(e) => setOrigin(e.target.value)}
                                className="input-field text-sm"
                            />
                        </div>

                        <div className="flex justify-center -my-2 relative z-10">
                            <button onClick={swapLocations} className="p-1.5 rounded-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors shadow-sm cursor-pointer" title="Swap">
                                <HiOutlineSwitchHorizontal className="rotate-90 text-lg" />
                            </button>
                        </div>
                        
                        {/* Waypoints */}
                        {waypoints.map((wp, index) => (
                            <div key={index} className="flex gap-2 items-center">
                                <div className="flex-1">
                                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Stop {index + 1}</label>
                                    <input
                                        type="text"
                                        placeholder="Enter intermediate stop"
                                        value={wp}
                                        onChange={(e) => updateWaypoint(index, e.target.value)}
                                        className="input-field text-sm"
                                    />
                                </div>
                                <button 
                                    onClick={() => removeWaypoint(index)}
                                    className="mt-5 p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                                    title="Remove Stop"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                        
                        <div className="flex justify-center py-1">
                            <button 
                                onClick={addWaypoint}
                                className="text-xs font-bold text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg border border-dashed border-red-300 hover:border-red-400 bg-red-50/50 hover:bg-red-50 transition-colors flex items-center gap-1"
                            >
                                + Add Stop
                            </button>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Destination</label>
                            <input
                                type="text"
                                placeholder="Enter destination"
                                value={destination}
                                onChange={(e) => setDestination(e.target.value)}
                                className="input-field text-sm"
                            />
                        </div>

                        <button
                            onClick={calculateRoute}
                            disabled={loading || !origin || !destination}
                            className="btn-primary w-full py-2.5 text-center disabled:opacity-50 text-sm"
                        >
                            {loading ? 'Calculating...' : 'Calculate Route'}
                        </button>

                        {error && <p className="text-red-600 text-sm">{error}</p>}
                    </div>

                    {/* Results */}
                    {routeInfo && (
                        <div className="card p-4 space-y-3 animate-slide-up bg-white border-l-4 border-l-red-500 shadow-lg">
                            <div className="flex justify-between items-start">
                                <h3 className="text-sm font-bold text-gray-800">Optimized Route Results</h3>
                                {routeInfo.optimizedOrder && (
                                    <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">Route Optimized</span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 rounded-lg bg-blue-50">
                                    <p className="text-xs text-blue-600 font-medium">Distance</p>
                                    <p className="text-lg font-bold text-blue-700">{routeInfo.distance} km</p>
                                </div>
                                <div className="p-3 rounded-lg bg-purple-50">
                                    <p className="text-xs text-purple-600 font-medium">Duration</p>
                                    <p className="text-lg font-bold text-purple-700">{routeInfo.duration}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-sky-50">
                                    <p className="text-xs text-sky-600 font-medium">Fuel Consumed</p>
                                    <p className="text-lg font-bold text-sky-700">{routeInfo.fuelConsumed} L</p>
                                </div>
                                <div className="p-3 rounded-lg bg-amber-50">
                                    <p className="text-xs text-amber-600 font-medium">Fuel Cost</p>
                                    <p className="text-lg font-bold text-amber-700">₹{routeInfo.fuelCost.toLocaleString()}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-orange-50">
                                    <p className="text-xs text-orange-600 font-medium">CO₂ Emission</p>
                                    <p className="text-lg font-bold text-orange-700">{routeInfo.carbonEmission} kg</p>
                                </div>
                                <div className={`p-3 rounded-lg border ${trafficColor}`}>
                                    <p className="text-xs font-medium">Traffic</p>
                                    <p className="text-lg font-bold">{routeInfo.trafficLevel}</p>
                                </div>
                            </div>

                            <div className="text-xs text-gray-500 pt-1">
                                Truck: <span className="font-semibold text-gray-700">{routeInfo.truckId}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Map */}
                <div className="lg:col-span-2 card overflow-hidden z-0" style={{ minHeight: '500px' }}>
                    <MapContainer
                        center={[center.lat, center.lng]}
                        zoom={5}
                        scrollWheelZoom={true}
                        style={{ width: '100%', height: '100%' }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapController center={center} bounds={mapBounds} />
                        
                        {leafletPolyline.length > 0 && (
                            <Polyline positions={leafletPolyline} color="#3b82f6" weight={5} opacity={0.7} />
                        )}
                    </MapContainer>
                </div>
            </div>
        </div>
    );
};

export default RoutePlanner;
