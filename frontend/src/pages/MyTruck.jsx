import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { trucksAPI, locationAPI, emergencyAPI } from '../services/api';
import { HiOutlineTruck, HiOutlineLocationMarker, HiOutlineLightningBolt, HiOutlineStatusOnline, HiOutlineExclamation } from 'react-icons/hi';

const MyTruck = () => {
    const { user } = useAuth();
    const [trucks, setTrucks] = useState([]);
    const [myTruck, setMyTruck] = useState(null);
    const [sharing, setSharing] = useState(false);
    const [gpsStatus, setGpsStatus] = useState('');
    const [emergencyStatus, setEmergencyStatus] = useState(null);
    const watchRef = useRef(null);

    useEffect(() => {
        fetchTrucks();
        return () => {
            if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
        };
    }, []);

    useEffect(() => {
        if (myTruck && !sharing) {
            startSharing();
        }
    }, [myTruck, sharing]);

    const fetchTrucks = async () => {
        try {
            const res = await trucksAPI.getAll();
            setTrucks(res.data);
            // Auto-select first truck matching driver name (simplified)
            if (res.data.length > 0) setMyTruck(res.data[0]);
        } catch (err) {
            console.error(err);
        }
    };

    const startSharing = useCallback(() => {
        if (!myTruck) return;
        if (!navigator.geolocation) {
            setGpsStatus('Geolocation not supported');
            return;
        }

        setSharing(true);
        setGpsStatus('Acquiring GPS...');

        watchRef.current = navigator.geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude, speed } = position.coords;
                setGpsStatus(`Sending: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
                try {
                    await locationAPI.update({
                        truckId: myTruck.truckId,
                        latitude,
                        longitude,
                        speed: speed ? Math.round(speed * 3.6) : 0, // m/s to km/h
                    });
                } catch (err) {
                    console.error('Location update failed:', err);
                }
            },
            (error) => {
                setGpsStatus(`GPS Error: ${error.message}`);
                setSharing(false);
            },
            { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
        );
    }, [myTruck]);

    const stopSharing = () => {
        if (watchRef.current) {
            navigator.geolocation.clearWatch(watchRef.current);
            watchRef.current = null;
        }
        setSharing(false);
        setGpsStatus('Stopped');
    };

    const triggerEmergency = async () => {
        if (!myTruck) return;
        
        // Use standard geolocation for one-off if watch isn't working/ready, or just grab current
        if (navigator.geolocation) {
            setEmergencyStatus('sending');
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    try {
                        await emergencyAPI.triggerAlert({
                            driverId: user._id,
                            truckId: myTruck.truckId,
                            latitude: pos.coords.latitude,
                            longitude: pos.coords.longitude,
                            message: "Emergency alert triggered by driver"
                        });
                        setEmergencyStatus('sent');
                        setTimeout(() => setEmergencyStatus(null), 5000);
                    } catch (err) {
                        console.error('Failed to trigger emergency', err);
                        setEmergencyStatus('error');
                    }
                },
                (err) => {
                    console.error('Failed to get location for emergency', err);
                    alert("Please enable location services to send panic alerts.");
                    setEmergencyStatus('error');
                }
            );
        } else {
            alert('Location services not available.');
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">My Truck</h1>
                <p className="text-gray-500 text-sm mt-1">View your assigned truck and share location</p>
            </div>

            {/* Truck selector */}
            <div className="card p-5 mb-6">
                <label className="text-sm font-medium text-gray-600 mb-2 block">Select Your Truck</label>
                <select
                    value={myTruck?._id || ''}
                    onChange={(e) => setMyTruck(trucks.find(t => t._id === e.target.value))}
                    className="input-field max-w-md"
                >
                    <option value="">Select truck</option>
                    {trucks.map(t => (
                        <option key={t._id} value={t._id}>{t.truckId} — {t.driverName}</option>
                    ))}
                </select>
            </div>

            {myTruck && (
                <>
                    {/* Truck Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                        {[
                            { label: 'Truck ID', value: myTruck.truckId, icon: HiOutlineTruck, color: 'bg-red-50 text-red-600' },
                            { label: 'License Plate', value: myTruck.licensePlate, icon: HiOutlineLocationMarker, color: 'bg-blue-50 text-blue-600' },
                            { label: 'Speed', value: `${myTruck.speed} km/h`, icon: HiOutlineLightningBolt, color: 'bg-green-50 text-green-600' },
                            { label: 'Fuel Level', value: `${myTruck.fuelLevel?.toFixed(0)}%`, icon: HiOutlineStatusOnline, color: myTruck.fuelLevel > 50 ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600' },
                        ].map(item => (
                            <div key={item.label} className="card p-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-lg ${item.color} flex items-center justify-center`}>
                                        <item.icon className="text-xl" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">{item.label}</p>
                                        <p className="text-lg font-bold text-gray-800">{item.value}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* GPS Sharing */}
                    <div className="card p-5">
                        <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <HiOutlineLocationMarker className="text-red-500" /> Auto GPS Tracking Active
                        </h3>
                        <p className="text-sm text-gray-500 mb-4">Your real-time location is being securely shared with the central tracking map.</p>
                        
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="px-5 py-2.5 rounded-lg bg-green-50/50 border border-green-100 flex items-center gap-2">
                                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-sm font-semibold text-green-700">Live Syncing</span>
                                </div>
                                {gpsStatus && (
                                    <span className="text-sm text-gray-500 font-medium">
                                        {gpsStatus}
                                    </span>
                                )}
                            </div>
                            
                            {emergencyStatus === 'sent' ? (
                                <div className="px-6 py-3 bg-red-100/50 border border-red-200 text-red-700 font-bold rounded-xl animate-pulse w-full sm:w-auto text-center">
                                    Alert Broadcasted
                                </div>
                            ) : (
                                <button
                                    onClick={triggerEmergency}
                                    disabled={emergencyStatus === 'sending'}
                                    className="w-full sm:w-auto px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-[0_8px_30px_rgb(220,38,38,0.3)] hover:shadow-[0_8px_30px_rgb(220,38,38,0.5)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:hover:translate-y-0"
                                >
                                    <HiOutlineExclamation className="text-xl group-hover:scale-125 transition-transform" /> 
                                    {emergencyStatus === 'sending' ? 'Sending...' : 'Panic / Emergency'}
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default MyTruck;
