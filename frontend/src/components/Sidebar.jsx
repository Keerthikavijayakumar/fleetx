import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    HiOutlineViewGrid, HiOutlineLocationMarker, HiOutlineTruck,
    HiOutlineMap, HiOutlineKey, HiOutlineChartBar, HiOutlineCog,
    HiOutlineChevronLeft, HiOutlineChevronRight,
} from 'react-icons/hi';

const allNavItems = [
    { path: '/', icon: HiOutlineViewGrid, label: 'Overview', roles: ['admin', 'manager'] },
    { path: '/live-tracking', icon: HiOutlineLocationMarker, label: 'Live Tracking', roles: ['admin', 'manager'] },
    { path: '/fleet', icon: HiOutlineTruck, label: 'Fleet', roles: ['admin'] },
    { path: '/route-planner', icon: HiOutlineMap, label: 'Routes', roles: ['admin'] },
    { path: '/maintenance', icon: HiOutlineKey, label: 'Maintenance', roles: ['admin'] },
    { path: '/analytics', icon: HiOutlineChartBar, label: 'Analytics', roles: ['admin', 'manager'] },
    { path: '/my-truck', icon: HiOutlineTruck, label: 'My Truck', roles: ['driver'] },
    { path: '/driver-analysis', icon: HiOutlineChartBar, label: 'Analysis', roles: ['driver'] },
    { path: '/settings', icon: HiOutlineCog, label: 'Settings', roles: ['admin'] },
];

const Sidebar = ({ collapsed, onToggle }) => {
    const { user } = useAuth();
    const role = user?.role || 'manager';
    const navItems = allNavItems.filter(item => item.roles.includes(role));

    return (
        <aside className="sidebar bg-white border-r border-gray-100 flex flex-col z-50 transition-all duration-300 ease-in-out overflow-y-auto">
            {/* Logo */}
            <div className="h-16 flex items-center px-4 border-b border-gray-50">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-red-500/15">
                        <HiOutlineTruck className="text-white text-[17px]" />
                    </div>
                    {!collapsed && (
                        <div className="animate-slide-right">
                            <h1 className="text-[15px] font-extrabold text-gray-900 leading-none tracking-tight">FleetX</h1>
                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Logistics</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 px-2.5 overflow-y-auto">
                {!collapsed && <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-3 px-2.5">Menu</p>}
                <div className="space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            title={collapsed ? item.label : ''}
                            className={({ isActive }) =>
                                `group flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] font-medium transition-all duration-200 ${isActive
                                    ? 'bg-gradient-to-r from-rose-50 to-red-50 text-rose-600 shadow-sm shadow-rose-500/5'
                                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${isActive ? 'bg-rose-100 text-rose-600' : 'text-gray-400 group-hover:text-gray-600'}`}>
                                        <item.icon className="text-[17px]" />
                                    </div>
                                    {!collapsed && <span>{item.label}</span>}
                                </>
                            )}
                        </NavLink>
                    ))}
                </div>
            </nav>

            {/* User + Toggle */}
            <div className="p-3 border-t border-gray-50">
                {!collapsed && user && (
                    <div className="flex items-center gap-2.5 mb-3 px-1">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {user.username?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{user.username}</p>
                            <p className="text-[10px] text-gray-400 capitalize">{user.role}</p>
                        </div>
                    </div>
                )}
                <button
                    onClick={onToggle}
                    className="w-full flex items-center justify-center p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors"
                >
                    {collapsed ? <HiOutlineChevronRight /> : <HiOutlineChevronLeft />}
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
