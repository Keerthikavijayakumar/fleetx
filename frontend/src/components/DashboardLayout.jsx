import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { Outlet, Link } from 'react-router-dom';
import io from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { HiOutlineExclamationCircle, HiX } from 'react-icons/hi';

const SOCKET_URL = 'http://localhost:5000';

const DashboardLayout = () => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [emergencyAlert, setEmergencyAlert] = useState(null);
    const { user } = useAuth();

    useEffect(() => {
        if (user?.role === 'admin' || user?.role === 'manager') {
            const socket = io(SOCKET_URL);
            socket.on('emergencyAlert', (alertData) => {
                setEmergencyAlert(alertData);
                setTimeout(() => setEmergencyAlert(null), 30000); // auto-hide
            });
            return () => socket.disconnect();
        }
    }, [user?.role]);

    return (
        <div className="app-layout bg-[#f8f9fc]">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
            <Navbar sidebarCollapsed={sidebarCollapsed} />
            <main className="main-content transition-all duration-300 ease-in-out">
                    {/* Emergency Alert Toast */}
                    {emergencyAlert && (
                        <div className="fixed top-24 right-6 z-50 w-96 bg-red-600 border-2 border-red-500 rounded-xl shadow-2xl animate-pulse overflow-hidden">
                            <div className="flex items-start p-4 gap-3 border-b border-red-500/30">
                                <div className="text-white text-3xl shrink-0">
                                    <HiOutlineExclamationCircle />
                                </div>
                                <div className="flex-1 text-white">
                                    <h3 className="font-extrabold text-lg tracking-wide uppercase mb-0.5">Emergency Alert</h3>
                                    <p className="font-bold text-sm text-red-100 mb-1">Truck: {emergencyAlert.truckId}</p>
                                    <p className="text-sm opacity-90 mb-3">{emergencyAlert.message}</p>
                                    <Link 
                                        to={`/live-tracking?truckId=${emergencyAlert.truckId}`}
                                        onClick={() => setEmergencyAlert(null)}
                                        className="inline-block bg-white text-red-600 font-bold px-4 py-1.5 rounded-lg text-sm hover:bg-red-50 transition-colors shadow-sm"
                                    >
                                        Track Live
                                    </Link>
                                </div>
                                <button onClick={() => setEmergencyAlert(null)} className="text-red-200 hover:text-white transition-colors shrink-0">
                                    <HiX className="text-xl" />
                                </button>
                            </div>
                        </div>
                    )}
                    <Outlet />
            </main>
        </div>
    );
};

export default DashboardLayout;
