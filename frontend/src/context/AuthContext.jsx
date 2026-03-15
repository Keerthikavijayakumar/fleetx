import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('fleetx_token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            fetchProfile();
        } else {
            setLoading(false);
        }
    }, [token]);

    const fetchProfile = async () => {
        try {
            const res = await api.get('/auth/profile');
            setUser(res.data.user);
        } catch {
            logout();
        } finally {
            setLoading(false);
        }
    };

    const login = async (emailOrPhone, password) => {
        const res = await api.post('/auth/login', { emailOrPhone, password });
        const { token: newToken, user: userData } = res.data;
        localStorage.setItem('fleetx_token', newToken);
        setToken(newToken);
        setUser(userData);
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        return res.data;
    };

    const register = async (username, email, password, role) => {
        const res = await api.post('/auth/register', { username, email, password, role });
        const { token: newToken, user: userData } = res.data;
        localStorage.setItem('fleetx_token', newToken);
        setToken(newToken);
        setUser(userData);
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        return res.data;
    };

    const logout = () => {
        localStorage.removeItem('fleetx_token');
        setToken(null);
        setUser(null);
        delete api.defaults.headers.common['Authorization'];
    };

    return (
        <AuthContext.Provider value={{ user, token, loading, login, register, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
