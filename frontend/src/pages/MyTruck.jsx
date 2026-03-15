import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { trucksAPI, routesAPI, locationAPI, emergencyAPI } from '../services/api';
import { HiOutlineTruck, HiOutlineLocationMarker, HiOutlineLightningBolt, HiOutlineStatusOnline, HiOutlineExclamation, HiOutlineUser, HiOutlinePhone, HiOutlineMail, HiOutlineCurrencyRupee } from 'react-icons/hi';

const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const calcAge = (dob) => {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
};

const MyTruck = () => {
    const { user } = useAuth();
    const [trucks, setTrucks] = useState([]);
    const [routes, setRoutes] = useState([]);
    const [myTruck, setMyTruck] = useState(null);
    const [sharing, setSharing] = useState(false);
    const [gpsStatus, setGpsStatus] = useState('');
    const [emergencyStatus, setEmergencyStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const watchRef = useRef(null);

    useEffect(() => {
        fetchData();
        return () => {
            if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
        };
    }, [user?._id, user?.id]);

    useEffect(() => {
        if (myTruck && !sharing) {
            startSharing();
        }
    }, [myTruck, sharing]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [trucksRes, routesRes] = await Promise.all([
                trucksAPI.getAll(),
                routesAPI.getAll(),
            ]);
            const allTrucks = Array.isArray(trucksRes.data) ? trucksRes.data : [];
            const allRoutes = Array.isArray(routesRes.data) ? routesRes.data : [];
            setTrucks(allTrucks);
            setRoutes(allRoutes);

            const myId = user?._id || user?.id;
            const myTrips = allRoutes.filter((r) => {
                const driverId = r.driverId?._id || r.driverId;
                const assistantId = r.assistantId?._id || r.assistantId;
                return String(driverId) === String(myId) || String(assistantId) === String(myId);
            });

            const myTruckIds = new Set(
                myTrips
                    .map((r) => r.truckId?._id || r.truckId)
                    .filter(Boolean)
                    .map((id) => String(id))
            );

            const myTrucks = allTrucks.filter((t) => myTruckIds.has(String(t._id)));
            if (myTrucks.length > 0) {
                setMyTruck(myTrucks[0]);
            } else {
                setMyTruck(null);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const myId = user?._id || user?.id;
    const myTrips = routes.filter((r) => {
        const driverId = r.driverId?._id || r.driverId;
        const assistantId = r.assistantId?._id || r.assistantId;
        return String(driverId) === String(myId) || String(assistantId) === String(myId);
    });
    const myTruckIds = new Set(
        myTrips
            .map((r) => r.truckId?._id || r.truckId)
            .filter(Boolean)
            .map((id) => String(id))
    );
    const myTrucks = trucks.filter((t) => myTruckIds.has(String(t._id)));

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
                            driverId: user?._id || user?.id,
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
                <h1 className="text-2xl font-bold text-gray-900">Driver Details</h1>
                <p className="text-gray-500 text-sm mt-1">Your admin-assigned profile and operational details</p>
            </div>

            {/* Driver profile */}
            <div className="card p-5 mb-6">
                <div className="flex items-start gap-4 flex-wrap">
                    {user?.photoPath ? (
                        <img src={`/api/${user.photoPath}`} alt={user.fullName || user.username} className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white font-extrabold text-2xl">
                            {(user?.fullName || user?.username || 'D')[0]?.toUpperCase()}
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1 min-w-0">
                        <div>
                            <p className="text-[11px] text-gray-500 font-semibold uppercase inline-flex items-center gap-1"><HiOutlineUser /> Name</p>
                            <p className="text-sm font-bold text-gray-800">{user?.fullName || user?.username || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-500 font-semibold uppercase inline-flex items-center gap-1"><HiOutlinePhone /> Phone</p>
                            <p className="text-sm font-bold text-gray-800">{user?.phone || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-500 font-semibold uppercase inline-flex items-center gap-1"><HiOutlineMail /> Email</p>
                            <p className="text-sm font-bold text-gray-800 break-all">{user?.email || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-500 font-semibold uppercase inline-flex items-center gap-1"><HiOutlineCurrencyRupee /> Salary</p>
                            <p className="text-sm font-bold text-gray-800">Rs.{Number(user?.monthlySalary || 0).toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-500 font-semibold uppercase">Date of Birth</p>
                            <p className="text-sm font-bold text-gray-800">{fmtDate(user?.dateOfBirth)}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-500 font-semibold uppercase">Age</p>
                            <p className="text-sm font-bold text-gray-800">{calcAge(user?.dateOfBirth) != null ? `${calcAge(user?.dateOfBirth)} yrs` : '—'}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-500 font-semibold uppercase">Experience</p>
                            <p className="text-sm font-bold text-gray-800">{user?.experienceYears != null ? `${user.experienceYears} yrs` : '—'}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-500 font-semibold uppercase">Licence</p>
                            <p className="text-sm font-bold text-gray-800 break-all">{user?.driverLicenceNumber || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-500 font-semibold uppercase">Aadhaar</p>
                            <p className="text-sm font-bold text-gray-800">{user?.aadharNumber || '—'}</p>
                        </div>
                        <div className="sm:col-span-2 lg:col-span-4">
                            <p className="text-[11px] text-gray-500 font-semibold uppercase">Address</p>
                            <p className="text-sm font-bold text-gray-800">{user?.address || '—'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Assigned trucks summary */}
            <div className="card p-5 mb-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Assigned Trucks</h3>
                {loading ? (
                    <p className="text-xs text-gray-400">Loading assignments...</p>
                ) : myTrucks.length === 0 ? (
                    <p className="text-xs text-gray-400">No truck assignments found for your trips yet.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {myTrucks.map((t) => (
                            <span key={t._id} className="px-2 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 border border-gray-200">
                                {t.truckId} • {t.licensePlate}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {myTruck && (
                <>
                    {/* Truck Live Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                        {[
                            { label: 'Truck ID', value: myTruck.truckId, icon: HiOutlineTruck, color: 'bg-red-50 text-red-600' },
                            { label: 'License Plate', value: myTruck.licensePlate, icon: HiOutlineLocationMarker, color: 'bg-blue-50 text-blue-600' },
                                { label: 'Trips On This Truck', value: tripsForSelectedTruck.length, icon: HiOutlineLightningBolt, color: 'bg-green-50 text-green-600' },
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
