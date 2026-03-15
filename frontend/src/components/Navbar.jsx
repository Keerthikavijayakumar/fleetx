import { useAuth } from '../context/AuthContext';
import { HiOutlineLogout, HiOutlineBell, HiOutlineSearch } from 'react-icons/hi';

const roleBadges = {
    admin: { bg: 'bg-rose-100', text: 'text-rose-700', dot: 'bg-rose-500' },
    driver: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    assistant: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
};

const Navbar = ({ sidebarCollapsed }) => {
    const { user, logout } = useAuth();
    const badge = roleBadges[user?.role] || roleBadges.admin;

    return (
        <header className="fixed top-0 right-0 h-16 bg-white/80 backdrop-blur-xl border-b border-gray-100 flex items-center justify-between px-6 z-40 transition-all duration-300" style={{ left: '240px' }}>
            {/* Left: search */}
            <div className="flex items-center gap-3 flex-1 max-w-md">
                <div className="relative flex-1">
                    <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 text-lg pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search trucks, routes..."
                        className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-transparent rounded-xl text-sm text-gray-600 placeholder-gray-300 focus:bg-white focus:border-gray-200 focus:outline-none transition-all"
                    />
                </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2">
                <button className="relative w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all">
                    <HiOutlineBell className="text-lg" />
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center shadow-sm">3</span>
                </button>

                <div className="w-px h-6 bg-gray-100 mx-1" />

                <div className="flex items-center gap-2.5 pl-1">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-red-500/15">
                        {user?.username?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <div className="hidden sm:block">
                        <p className="text-[13px] font-semibold text-gray-800 leading-tight">{user?.username}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            <span className={`text-[10px] font-semibold capitalize ${badge.text}`}>{user?.role}</span>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-8 h-8 rounded-xl hover:bg-red-50 flex items-center justify-center text-gray-300 hover:text-rose-500 transition-all ml-1"
                        title="Logout"
                    >
                        <HiOutlineLogout className="text-lg" />
                    </button>
                </div>
            </div>
        </header>
    );
};

export default Navbar;
