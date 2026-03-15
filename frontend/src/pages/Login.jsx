import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { HiOutlineTruck, HiOutlineMail, HiOutlineLockClosed, HiOutlineLocationMarker, HiOutlineChartBar, HiOutlineShieldCheck, HiOutlinePhone } from 'react-icons/hi';

const Login = () => {
    const [emailOrPhone, setEmailOrPhone] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(emailOrPhone, password);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
            {/* Left: Hero panel */}
            <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col justify-between text-white"
                 style={{ background: 'linear-gradient(145deg, #e11d48 0%, #be123c 40%, #9f1239 100%)', padding: '48px' }}>
                {/* Decorative circles */}
                <div className="absolute top-[-80px] right-[-80px] w-[320px] h-[320px] rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <div className="absolute bottom-[-60px] left-[-60px] w-[260px] h-[260px] rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] rounded-full border border-white/[0.08]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-white/[0.05]" />

                {/* Logo */}
                <div className="relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-lg">
                            <HiOutlineTruck className="text-xl" />
                        </div>
                        <div>
                            <span className="text-xl font-extrabold tracking-tight block leading-tight">FleetX</span>
                            <span className="text-white/50 text-xs font-medium">Logistics Platform</span>
                        </div>
                    </div>
                </div>

                {/* Hero text */}
                <div className="relative z-10 space-y-6">
                    <div>
                        <h2 className="text-[42px] font-extrabold leading-[1.1] mb-5 tracking-tight">
                            Manage your fleet<br />with intelligence
                        </h2>
                        <p className="text-white/65 text-[17px] leading-relaxed max-w-[400px]">
                            Real-time GPS tracking, smart route planning, and data-driven analytics for modern logistics operations.
                        </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3 max-w-[420px]">
                        {[
                            { icon: HiOutlineLocationMarker, label: 'Live GPS', desc: 'Real-time tracking' },
                            { icon: HiOutlineChartBar, label: 'Analytics', desc: 'Data insights' },
                            { icon: HiOutlineShieldCheck, label: 'Secure', desc: 'Role-based access' },
                        ].map((f, i) => (
                            <div key={i} className="bg-white/[0.08] backdrop-blur-sm rounded-xl p-4 border border-white/[0.08] hover:bg-white/[0.12] transition-all duration-300">
                                <f.icon className="text-2xl mb-2.5 text-white/80" />
                                <p className="text-[13px] font-bold">{f.label}</p>
                                <p className="text-[11px] text-white/40 mt-0.5">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="relative z-10">
                    <p className="text-white/30 text-xs">© 2025 FleetX. All rights reserved.</p>
                </div>
            </div>

            {/* Right: Form */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full" style={{ maxWidth: '480px' }}>
                    {/* Mobile logo */}
                    <div className="lg:hidden flex flex-col items-center mb-10">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center mb-4 shadow-xl shadow-red-500/25">
                            <HiOutlineTruck className="text-white text-3xl" />
                        </div>
                        <h1 className="text-2xl font-extrabold text-white">FleetX</h1>
                    </div>

                    {/* Card */}
                    <div className="bg-white rounded-2xl shadow-2xl shadow-black/10 border border-gray-100/50" style={{ padding: '44px 48px' }}>
                        <div style={{ marginBottom: '32px' }}>
                            <h2 className="text-[26px] font-extrabold text-gray-900 tracking-tight" style={{ marginBottom: '8px' }}>Welcome back</h2>
                            <p style={{ color: '#9ca3af', fontSize: '15px' }}>Sign in to your account to continue</p>
                        </div>

                        {error && (
                            <div className="flex items-center gap-3 animate-slide-up" style={{ marginBottom: '24px', padding: '16px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fee2e2', color: '#dc2626', fontSize: '14px' }}>
                                <span className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-xs flex-shrink-0 font-bold">!</span>
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: '22px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#4b5563', marginBottom: '8px' }}>Email or Phone Number</label>
                                <div className="relative">
                                    <HiOutlinePhone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 text-lg pointer-events-none" />
                                    <input type="text" placeholder="Email address or +91 phone number" value={emailOrPhone}
                                        onChange={(e) => setEmailOrPhone(e.target.value)}
                                        style={{ width: '100%', paddingLeft: '48px', paddingRight: '16px', paddingTop: '14px', paddingBottom: '14px', background: '#f9fafb', border: '2px solid transparent', borderRadius: '12px', fontSize: '14px', color: '#1f2937', outline: 'none', transition: 'all 0.2s' }}
                                        onFocus={(e) => { e.target.style.background = '#fff'; e.target.style.borderColor = '#e11d48'; }}
                                        onBlur={(e) => { e.target.style.background = '#f9fafb'; e.target.style.borderColor = 'transparent'; }}
                                        required />
                                </div>
                                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '5px' }}>Drivers &amp; assistants: sign in with phone number and common password: arm</p>
                            </div>
                            <div style={{ marginBottom: '28px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#4b5563', marginBottom: '8px' }}>Password</label>
                                <div className="relative">
                                    <HiOutlineLockClosed className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 text-lg pointer-events-none" />
                                    <input type="password" placeholder="Enter your password" value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        style={{ width: '100%', paddingLeft: '48px', paddingRight: '16px', paddingTop: '14px', paddingBottom: '14px', background: '#f9fafb', border: '2px solid transparent', borderRadius: '12px', fontSize: '14px', color: '#1f2937', outline: 'none', transition: 'all 0.2s' }}
                                        onFocus={(e) => { e.target.style.background = '#fff'; e.target.style.borderColor = '#e11d48'; }}
                                        onBlur={(e) => { e.target.style.background = '#f9fafb'; e.target.style.borderColor = 'transparent'; }}
                                        required />
                                </div>
                            </div>
                            <button type="submit" disabled={loading}
                                style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: '700', color: '#fff', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)', boxShadow: '0 10px 25px -5px rgba(225,29,72,0.25)', transition: 'all 0.3s', opacity: loading ? 0.5 : 1 }}>
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Signing in...
                                    </span>
                                ) : 'Sign In'}
                            </button>
                        </form>

                        <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #f3f4f6', textAlign: 'center' }}>
                            <p style={{ color: '#9ca3af', fontSize: '14px' }}>
                                Don't have an account?{' '}
                                <Link to="/register" style={{ color: '#e11d48', fontWeight: '700' }}>Create Account</Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
