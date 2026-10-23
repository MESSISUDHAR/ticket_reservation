import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);
  const [activeReservation, setActiveReservation] = useState(null);

  // Validate session on mount
  useEffect(() => {
    async function initAuth() {
      if (token) {
        try {
          const res = await api.getMe();
          setUser(res.user);
          localStorage.setItem('user', JSON.stringify(res.user));
          // Also check for any active unexpired reservations
          checkActiveReservations();
        } catch (err) {
          console.warn('Session expired or invalid:', err.message);
          logout();
        }
      }
      setLoading(false);
    }
    initAuth();
  }, [token]);

  const checkActiveReservations = async () => {
    try {
      const res = await api.getMyActiveReservations();
      if (res.reservations && res.reservations.length > 0) {
        setActiveReservation(res.reservations[0]);
      } else {
        setActiveReservation(null);
      }
    } catch (err) {
      // Ignore if not logged in
    }
  };

  const login = async (email, password) => {
    const res = await api.login({ email, password });
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
    checkActiveReservations();
    return res.user;
  };

  const register = async (userData) => {
    const res = await api.register(userData);
    localStorage.setItem('token', res.token);
    localStorage.setItem('user', JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setActiveReservation(null);
  };

  // Demo accounts for quick testing
  const demoAccounts = {
    admin: { email: 'admin@tickets.com', password: 'admin123' },
    organizer: { email: 'organizer@soundwave.com', password: 'organizer123' },
    attendee: { email: 'attendee@example.com', password: 'attendee123' },
  };

  const quickLogin = async (roleName) => {
    const creds = demoAccounts[roleName];
    if (creds) {
      return await login(creds.email, creds.password);
    }
  };

  const value = {
    user,
    token,
    loading,
    activeReservation,
    setActiveReservation,
    checkActiveReservations,
    login,
    register,
    logout,
    quickLogin,
    isAdmin: user?.role === 'admin',
    isOrganizer: user?.role === 'organizer' || user?.role === 'admin',
    isAttendee: user?.role === 'attendee',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
