import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { trucksAPI, driverAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import io from 'socket.io-client';
import { HiOutlineLocationMarker } from 'react-icons/hi';
import { Navigate, useSearchParams } from 'react-router-dom';

const getSocketUrl = () => {
    if (window.location.origin.includes('localhost')) return 'http://localhost:5000';
    return window.location.origin;
};

// Helper component to handle programmatic map moves in Leaflet
function MapController({ center, zoom }) {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.flyTo([center.lat, center.lng], zoom || map.getZoom());
        }
    }, [center, zoom, map]);
    return null;
}

// Function to generate pure Leaflet HTML icon for trucks
const getTruckIcon = (status) => {
    const color = status === 'running' ? '#22c55e' : status === 'idle' ? '#f59e0b' : '#ef4444';
    return L.divIcon({
        className: 'custom-truck-marker',
        html: `
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2"/>
                <text x="16" y="20" text-anchor="middle" fill="white" font-size="11" font-weight="bold">TRK</text>
            </svg>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    });
};

const LiveTracking = () => {
    const { user } = useAuth();
    const [trucks, setTrucks] = useState([]);
    const [selectedTruck, setSelectedTruck] = useState(null);
    const [loading, setLoading] = useState(true);
    const [center, setCenter] = useState({ lat: 20.5937, lng: 78.9629 }); 
    const [zoom, setZoom] = useState(5);
    const [isTracking, setIsTracking] = useState(false);
    const [driverTruck, setDriverTruck] = useState(null);
    const [lastLocationUpdateTime, setLastLocationUpdateTime] = useState(null);
    const watchIdRef = useRef(null);
    const hasInitializedTracking = useRef(false);
    const [searchParams, setSearchParams] = useSearchParams();

    const isDriver = user?.role === 'driver';

    useEffect(() => {
        if (!isDriver) {
            // Admin view: fetch all trucks
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => setCenter({ lat: position.coords.latitude, lng: position.coords.longitude }),
                    (error) => console.log('Geolocation error:', error)
                );
            }

            trucksAPI.getAll().then(res => {
                setTrucks(res.data);
                setLoading(false);
            }).catch(err => {
                console.error(err);
                setLoading(false);
            });

            const socket = io(getSocketUrl());
            socket.on('truckUpdate', (updates) => {
                setTrucks(currentTrucks => {
                    const updated = [...currentTrucks];
                    updates.forEach(liveT => {
                        const idx = updated.findIndex(t => t.truckId === liveT.truckId);
                        if (idx !== -1) {
                            updated[idx] = { ...updated[idx], ...liveT };
                        } else {
                            updated.push(liveT);
                        }
                    });
                    return updated;
                });
            });
            return () => socket.disconnect();
        }
    }, [isDriver]);

    // Live Follow Logic: Update map center if the selected truck moves
    useEffect(() => {
        if (selectedTruck) {
            const liveData = trucks.find(t => t.truckId === selectedTruck.truckId);
            if (liveData && (liveData.latitude !== center.lat || liveData.longitude !== center.lng)) {
                setCenter({ lat: liveData.latitude, lng: liveData.longitude });
            }
        }
    }, [trucks, selectedTruck, center.lat, center.lng]);

    useEffect(() => {
        const targetTruckId = searchParams.get('truckId');
        if (targetTruckId && trucks.length > 0) {
            const truck = trucks.find(t => t.truckId === targetTruckId);
            if (truck && truck.latitude && truck.longitude && !hasInitializedTracking.current) {
                setSelectedTruck(truck);
                setCenter({ lat: truck.latitude, lng: truck.longitude });
                setZoom(16);
                hasInitializedTracking.current = true;
            }
        }
    }, [searchParams, trucks]);

    const startTracking = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        if (!driverTruck) {
            alert('No assigned truck found for you. Please contact admin.');
            return;
        }

        setIsTracking(true);
        watchIdRef.current = navigator.geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude, speed } = position.coords;
                // GPS speed is in m/s, convert to km/h if available else default to 0
                const kmh_speed = speed ? Math.round(speed * 3.6) : 0;
                
                try {
                    await driverAPI.locationUpdate({
                        driverId: user._id,
                        truckId: driverTruck.truckId,
                        latitude,
                        longitude,
                        speed: kmh_speed,
                        timestamp: new Date().toISOString()
                    });
                    setLastLocationUpdateTime(new Date());
                } catch (error) {
                    console.error('Failed to send location update:', error);
                }
            },
            (error) => {
                console.error('Error watching position:', error);
                alert('Failed to access location. Please check your permissions.');
                setIsTracking(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    };

    const stopTracking = () => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setIsTracking(false);
    };

    // Clean up watch position on unmount
    useEffect(() => {
        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-10 h-10 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (isDriver) {
        return <Navigate to="/my-truck" replace />;
    }

    // Admin view
    const activeTrucks = trucks.filter(t => t.latitude && t.longitude);

    return (
        <div className="animate-fade-in">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <HiOutlineLocationMarker className="text-red-500" /> Live Tracking
                </h1>
                <p className="text-gray-500 text-sm mt-1">Real-time fleet tracking • {activeTrucks.length} trucks online</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
                {/* Truck List */}
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {activeTrucks.map(truck => (
                        <div
                            key={truck._id}
                            onClick={() => {
                                setSelectedTruck(truck);
                                setCenter({ lat: truck.latitude, lng: truck.longitude });
                                setZoom(15);
                            }}
                            className={`card p-3 cursor-pointer transition-all ${selectedTruck?._id === truck._id ? 'ring-2 ring-red-500 bg-red-50' : 'hover:bg-gray-50'}`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-bold text-gray-800">{truck.truckId}</span>
                                <span className={`w-2 h-2 rounded-full ${truck.engineStatus === 'running' ? 'bg-green-500' : truck.engineStatus === 'idle' ? 'bg-amber-500' : 'bg-red-500'}`} />
                            </div>
                            <p className="text-xs text-gray-500 mb-2">{truck.driverName}</p>
                            <div className="flex items-center gap-3 text-xs">
                                <span className="text-blue-600 font-medium">{truck.speed} km/h</span>
                                    <span className={`font-medium ${truck.fuelLevel > 50 ? 'text-green-600' : truck.fuelLevel > 20 ? 'text-amber-600' : 'text-red-600'}`}>
                                        Fuel {truck.fuelLevel?.toFixed(0)}%
                                    </span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Map */}
                <div className="lg:col-span-3 card overflow-hidden z-0" style={{ minHeight: '600px' }}>
                    <MapContainer
                        center={[center.lat, center.lng]}
                        zoom={zoom}
                        scrollWheelZoom={true}
                        style={{ width: '100%', height: '100%' }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapController center={center} zoom={zoom} />

                        {activeTrucks.map(truck => (
                            <Marker
                                key={truck._id}
                                position={[truck.latitude, truck.longitude]}
                                icon={getTruckIcon(truck.engineStatus)}
                                eventHandlers={{
                                    click: () => setSelectedTruck(truck),
                                }}
                            >
                                <Popup>
                                    <div className="min-w-[150px]">
                                        <h3 className="text-sm font-bold text-gray-900 mb-2">{truck.truckId}</h3>
                                        <div className="space-y-1.5 text-xs">
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Driver:</span>
                                                <span className="font-medium text-gray-800">{truck.driverName}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Speed:</span>
                                                <span className="font-medium text-blue-600">{truck.speed} km/h</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Fuel:</span>
                                                <span className={`font-medium ${truck.fuelLevel > 50 ? 'text-green-600' : 'text-orange-600'}`}>
                                                    {truck.fuelLevel?.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Engine:</span>
                                                <span className={`font-medium capitalize ${truck.engineStatus === 'running' ? 'text-green-600' : 'text-amber-600'}`}>
                                                    {truck.engineStatus}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Status:</span>
                                                <span className={`font-medium capitalize ${truck.speed > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                                                    {truck.speed > 0 ? 'Moving' : 'Idle'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                </div>
            </div>
        </div>
    );
};

export default LiveTracking;
