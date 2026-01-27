import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, portal } from '../services/api';
import type { User } from '../types/portal';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Try to get dashboard data - if successful, user is authenticated
      const data = await portal.getDashboard();
      setUser(data.user);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (phoneNumber: string, password: string) => {
    try {
      const response = await auth.login(phoneNumber, password);
      if (response.success) {
        await checkAuth(); // Refresh user data
        return { success: true };
      }
      return { success: false, error: response.error || 'Login failed' };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'Login failed. Please try again.' 
      };
    }
  };

  const logout = async () => {
    try {
      await auth.logout();
      setUser(null);
      navigate('/portal/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const setupPortal = async (token: string, password: string) => {
    try {
      const response = await auth.setup(token, password);
      if (response.success) {
        await checkAuth(); // Refresh user data
        return { success: true };
      }
      return { success: false, error: response.error || 'Setup failed' };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'Setup failed. Please try again.' 
      };
    }
  };

  return {
    user,
    loading,
    login,
    logout,
    setupPortal,
    checkAuth
  };
};
