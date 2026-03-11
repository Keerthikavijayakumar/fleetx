import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { HiOutlineCog, HiOutlineUser, HiOutlineShieldCheck, HiOutlineBell } from 'react-icons/hi';

const Settings = () => {
    const { user } = useAuth();
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState('5');
    const [saved, setSaved] = useState(false);

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const Toggle = ({ enabled, onChange }) => (
        <button onClick={onChange}
            className={`w-11 h-6 rounded-full transition-all duration-300 ${enabled ? 'bg-red-500' : 'bg-gray-200'}`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
    );

    return (
        <div className="animate-fade-in max-w-2xl">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <HiOutlineCog className="text-red-500" /> Settings
                </h1>
                <p className="text-gray-500 text-sm mt-1">Configure your application preferences</p>
            </div>

            {saved && (
                <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-medium animate-fade-in">
                    ✅ Settings saved successfully!
                </div>
            )}

            {/* Profile */}
            <div className="card p-6 mb-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-5 flex items-center gap-2">
                    <HiOutlineUser className="text-red-500" /> Profile Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="text-xs text-gray-500 mb-1.5 block font-medium">Username</label>
                        <input type="text" value={user?.username || ''} className="input-field" readOnly />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1.5 block font-medium">Email</label>
                        <input type="email" value={user?.email || ''} className="input-field" readOnly />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1.5 block font-medium">Role</label>
                        <input type="text" value={user?.role || ''} className="input-field capitalize" readOnly />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1.5 block font-medium">Account Status</label>
                        <div className="flex items-center gap-2 mt-3">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-sm text-green-600 font-medium">Active</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Notifications */}
            <div className="card p-6 mb-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-5 flex items-center gap-2">
                    <HiOutlineBell className="text-red-500" /> Notifications
                </h3>
                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
                    <div>
                        <p className="text-sm text-gray-800 font-medium">Enable Notifications</p>
                        <p className="text-xs text-gray-500 mt-1">Receive alerts for maintenance & fuel</p>
                    </div>
                    <Toggle enabled={notificationsEnabled} onChange={() => setNotificationsEnabled(!notificationsEnabled)} />
                </div>
            </div>

            {/* Application */}
            <div className="card p-6 mb-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-5 flex items-center gap-2">
                    <HiOutlineShieldCheck className="text-red-500" /> Application
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
                        <div>
                            <p className="text-sm text-gray-800 font-medium">Auto-Refresh Tracking</p>
                            <p className="text-xs text-gray-500 mt-1">Automatically update live tracking data</p>
                        </div>
                        <Toggle enabled={autoRefresh} onChange={() => setAutoRefresh(!autoRefresh)} />
                    </div>
                    <div className="p-4 rounded-lg bg-gray-50">
                        <label className="text-sm text-gray-800 font-medium mb-2.5 block">Refresh Interval</label>
                        <select value={refreshInterval} onChange={(e) => setRefreshInterval(e.target.value)} className="input-field max-w-xs">
                            <option value="3">3 seconds</option>
                            <option value="5">5 seconds</option>
                            <option value="10">10 seconds</option>
                            <option value="30">30 seconds</option>
                        </select>
                    </div>
                </div>
            </div>

            <button onClick={handleSave} className="btn-primary py-2.5 px-8">Save Settings</button>
        </div>
    );
};

export default Settings;
