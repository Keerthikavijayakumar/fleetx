import { useState, useEffect, useRef } from 'react';
import { trucksAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
    HiOutlineMap, HiOutlineClock, HiOutlineLightningBolt, 
    HiOutlineCloud, HiOutlineTruck,
    HiOutlineLocationMarker, HiOutlineSearch
} from 'react-icons/hi';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Marker icon issues in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Helper component to smoothly pan map when center changes
const ChangeView = ({ center, zoom }) => {
    const map = useMap();
    map.setView(center, zoom);
    return null;
};

const DriverAnalysis = () => {
    const { user } = useAuth();
    
    const [truck, setTruck] = useState(null);
    const [currentLocation, setCurrentLocation] = useState(null);
    
    // Search Autocomplete state
    const [destinationQuery, setDestinationQuery] = useState('');
    const [destinationOptions, setDestinationOptions] = useState([]);
    
    const [destination, setDestination] = useState(null);
    const [route, setRoute] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [weather, setWeather] = useState(null);
    const [restStops, setRestStops] = useState([]);
    
    const [isTracking, setIsTracking] = useState(false);
    const watchRef = useRef(null);

    // Initial load: Get assigned truck and start location watch
    useEffect(() => {
        trucksAPI.getAll().then(res => {
            const assigned = res.data.find(t => t.driverName === user?.username);
            setTruck(assigned);
        });

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => console.log('Location error:', err)
            );
        }
        
        return () => {
            if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
        };
    }, [user?.username]);

    // Fetch Weather (simulated Open-Meteo)
    const fetchWeather = async (lat, lng) => {
        try {
            const res = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
            const code = res.data.current_weather.weathercode;
            let text = 'Clear';
            if (code > 50) text = 'Rain';
            if (res.data.current_weather.temperature > 35) text = 'Heat';
            
            setWeather({
                temp: res.data.current_weather.temperature,
                condition: text
            });
        } catch (e) {
            console.error('Weather error:', e);
            setWeather({ temp: 32, condition: 'Clear' }); // fallback
        }
    };

    // Calculate Distance
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        return +(R * c).toFixed(1);
    };

    // Fetch Rest Stops via Overpass API
    const fetchRestStops = async (lat, lng) => {
        try {
            const query = `
                [out:json];
                (
                  node["amenity"="fuel"](around:20000,${lat},${lng});
                  node["amenity"="restaurant"](around:20000,${lat},${lng});
                  node["amenity"="parking"](around:20000,${lat},${lng});
                );
                out center 15;
            `;
            const encodedQuery = encodeURIComponent(query);
            const res = await axios.get(`https://overpass-api.de/api/interpreter?data=${encodedQuery}`);
            
            if (res.data && res.data.elements) {
                const stops = res.data.elements.map(el => {
                    let typeName = el.tags.amenity || 'rest_area';
                    let icon = '📍';
                    if (typeName === 'fuel') icon = '⛽';
                    if (typeName === 'restaurant') icon = '🍔';
                    if (typeName === 'parking') icon = '🅿️';

                    return {
                        id: el.id,
                        name: el.tags.name || el.tags.brand || `Nearby ${typeName.charAt(0).toUpperCase() + typeName.slice(1)}`,
                        type: typeName,
                        icon: icon,
                        lat: el.lat,
                        lng: el.lon,
                        distance: calculateDistance(lat, lng, el.lat, el.lon)
                    };
                }).sort((a, b) => a.distance - b.distance).slice(0, 5);
                setRestStops(stops);
            }
        } catch (err) {
            console.error('Failed to fetch rest stops via Overpass API', err);
        }
    };

    // Nominatim Autocomplete Search
    const handleSearch = async (e) => {
        const query = e.target.value;
        setDestinationQuery(query);
        
        if (query.length > 3) {
            try {
                // Free OpenStreetMap Geocoding
                const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`);
                setDestinationOptions(res.data);
            } catch (err) {
                console.error('Search error:', err);
            }
        } else {
            setDestinationOptions([]);
        }
    };

    const handlePlaceSelect = (place) => {
        setDestination({
            name: place.display_name,
            location: { lat: parseFloat(place.lat), lng: parseFloat(place.lon) }
        });
        setDestinationQuery(place.display_name);
        setDestinationOptions([]);
    };

    // Calculate Route Analysis via OSRM Free API
    const handleRouteAnalysis = async () => {
        if (!currentLocation || !destination) return;
        
        try {
            // OSRM routing expects lng,lat 
            const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${currentLocation.lng},${currentLocation.lat};${destination.location.lng},${destination.location.lat}?overview=full&geometries=geojson`;
            const res = await axios.get(url);
            
            if (res.data && res.data.routes && res.data.routes[0]) {
                const routeData = res.data.routes[0];
                
                // GeoJSON uses [lng, lat], Leaflet polyline expects [lat, lng]
                const coords = routeData.geometry.coordinates.map(c => [c[1], c[0]]);
                setRoute(coords);
                
                const distanceKm = routeData.distance / 1000;
                const durationMins = Math.round(routeData.duration / 60);
                
                let traffic = 'Clear Route';
                if (durationMins > (distanceKm / 50 * 60) * 1.2) traffic = 'Heavy Traffic';
                else if (durationMins > (distanceKm / 50 * 60) * 1.05) traffic = 'Moderate Traffic';
                
                // Fuel Calc
                const mileage = truck?.fuelEfficiency || 8; 
                const fuelRequired = (distanceKm / mileage).toFixed(1);
                
                // Format ETA 
                const hours = Math.floor(durationMins / 60);
                const mins = durationMins % 60;
                const etaText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                
                setAnalysis({
                    traffic,
                    eta: etaText,
                    distanceRemaining: `${distanceKm.toFixed(1)} km`,
                    distanceValueKm: distanceKm,
                    fuelRequired: fuelRequired
                });

                fetchWeather(currentLocation.lat, currentLocation.lng);
                fetchRestStops(currentLocation.lat, currentLocation.lng);
            }
        } catch (err) {
            console.error('Routing failed:', err);
            alert("Could not load route from OpenStreetMap API.");
        }
    };

    
    // Live tracking update loop
    const startLiveTracking = () => {
        if (!navigator.geolocation || !truck) return;
        setIsTracking(true);
        
        watchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setCurrentLocation(newLoc);
                
                // Re-calc route periodically if driving
                if (destination && Math.random() > 0.8) {
                   handleRouteAnalysis(); 
                }
            },
            (err) => console.error(err),
            { enableHighAccuracy: true, timeout: 5000 }
        );
    };

    return (
        <div className="animate-fade-in max-w-6xl mx-auto pb-10">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Route Analysis</h1>
                    <p className="text-gray-500 text-sm mt-1">Plan and verify your trip details before driving (Open-Source Map Edition)</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                
                {/* Left Column: Input and Metrics (40%) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Destination Selection */}
                    <div className="card p-5 overflow-visible">
                        <label className="text-sm font-bold text-gray-800 mb-3 block">Set Delivery Destination</label>
                        <div className="flex flex-col gap-3">
                            <div className="relative">
                                <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={destinationQuery}
                                    onChange={handleSearch}
                                    placeholder="Enter destination..."
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                />
                                {/* Custom Autocomplete Dropdown */}
                                {destinationOptions.length > 0 && (
                                    <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                                        {destinationOptions.map((opt, idx) => (
                                            <li 
                                                key={idx} 
                                                onClick={() => handlePlaceSelect(opt)}
                                                className="px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm text-gray-700 border-b border-gray-100 last:border-0"
                                            >
                                                {opt.display_name}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <button 
                                onClick={handleRouteAnalysis}
                                disabled={!destination || !currentLocation}
                                className="w-full btn-primary py-3 disabled:opacity-50"
                            >
                                Analyze Route
                            </button>
                        </div>
                        {destination && (
                            <p className="text-sm text-gray-500 mt-3 flex items-center gap-2">
                                <HiOutlineLocationMarker className="text-blue-500 flex-shrink-0" /> 
                                <span className="font-semibold text-gray-800 truncate" title={destination.name}>{destination.name}</span>
                            </p>
                        )}
                    </div>

                    {/* Route Metrics (Visible after analysis) */}
                    {analysis && (
                        <div className="space-y-6">
                            {/* ETA & Distance */}
                            <div className="card p-5 border-l-4 border-l-blue-500 px-6">
                                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest mb-5">Trip Details</h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center border-b border-gray-50 pb-3">
                                        <p className="text-sm text-gray-500 font-medium">Distance</p>
                                        <p className="text-lg font-bold text-gray-800">{analysis.distanceRemaining}</p>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-gray-50 pb-3">
                                        <p className="text-sm text-gray-500 font-medium">Estimated Arrival</p>
                                        <p className="text-lg font-bold text-blue-600 flex items-center gap-1.5">
                                            <HiOutlineClock className="text-xl" /> {analysis.eta}
                                        </p>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-gray-50 pb-3">
                                        <p className="text-sm text-gray-500 font-medium">Fuel Needed</p>
                                        <p className="text-lg font-bold text-gray-800 flex items-center gap-1.5">
                                            <HiOutlineLightningBolt className="text-orange-500 text-xl" /> {analysis.fuelRequired} L
                                        </p>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <p className="text-sm text-gray-500 font-medium">Traffic</p>
                                        <p className={`text-sm font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${analysis.traffic.includes('Heavy') ? 'bg-red-50 text-red-600' : analysis.traffic.includes('Mod') ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                            <HiOutlineMap className="text-lg" /> {analysis.traffic}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Weather Card */}
                            {weather && (
                                <div className="card p-5 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-gray-800 mb-1">Destination Weather</p>
                                        <p className="text-sm text-gray-500">{weather.condition}</p>
                                    </div>
                                    <div className="text-2xl font-black text-gray-900 flex items-center gap-1">
                                        <HiOutlineCloud className="text-blue-400" /> {weather.temp}°C
                                    </div>
                                </div>
                            )}

                            {/* Rest Stops Card */}
                            {restStops.length > 0 && (
                                <div className="card p-5">
                                    <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                                        <HiOutlineLocationMarker className="text-blue-500 text-lg" /> Recommended Stops Nearby
                                    </h3>
                                    <div className="space-y-3">
                                        {restStops.map((stop) => (
                                            <div key={stop.id} className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl border border-gray-100 transition-all">
                                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl shadow-inner">
                                                    {stop.icon}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-gray-800 truncate">{stop.name}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">{stop.type}</span>
                                                        <span className="text-xs text-blue-600 font-semibold">• {stop.distance} km away</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Column: Leaflet Map (60%) */}
                <div className="lg:col-span-3 card overflow-hidden relative" style={{ minHeight: '600px', padding: 0 }}>
                    <MapContainer 
                        center={currentLocation || { lat: 20.5937, lng: 78.9629 }} 
                        zoom={currentLocation ? 14 : 5} 
                        scrollWheelZoom={true}
                        style={{ height: '600px', width: '100%', zIndex: 10 }}
                    >
                        {/* OpenStreetMap Tile Layer (Free, no keys needed) */}
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        
                        {/* Smooth Panning when coords change */}
                        {currentLocation && !route && <ChangeView center={currentLocation} zoom={14} />}
                        
                        {/* Current Location Marker */}
                        {currentLocation && (
                            <Marker position={currentLocation}>
                                <Popup>Your Current Location</Popup>
                            </Marker>
                        )}

                        {/* Destination Marker */}
                        {destination && (
                            <Marker position={destination.location}>
                                <Popup>{destination.name}</Popup>
                            </Marker>
                        )}
                        
                        {/* Rest Stops Markers */}
                        {restStops.map((stop) => (
                            <Marker key={stop.id} position={{ lat: stop.lat, lng: stop.lng }}>
                                <Popup>
                                    <b>{stop.name}</b><br/>
                                    {stop.distance} km away<br/>
                                    {stop.icon} {stop.type}
                                </Popup>
                            </Marker>
                        ))}
                        
                        {/* Drawn Route Polyline */}
                        {route && (
                            <Polyline 
                                positions={route} 
                                pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.8 }} 
                            />
                        )}
                    </MapContainer>
                    
                    {route && !isTracking && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000]">
                            <button 
                                onClick={startLiveTracking}
                                className="bg-gray-900/95 backdrop-blur-md text-white px-8 py-3.5 rounded-full shadow-2xl font-bold flex items-center gap-2 hover:bg-gray-800 hover:scale-105 transition-all outline-none focus:ring-4 focus:ring-gray-900/20"
                            >
                                <HiOutlineTruck className="text-xl" /> Start Driving
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DriverAnalysis;
