import React, { createContext, useState, useContext, useEffect } from 'react';
import { getCheckIns, getGoals, getStats } from '../services/checkInService';
import { useAuth } from './AuthContext';

const CheckInContext = createContext({});

export const useCheckIn = () => {
  const context = useContext(CheckInContext);
  if (!context) {
    throw new Error('useCheckIn must be used within CheckInProvider');
  }
  return context;
};

export const CheckInProvider = ({ children }) => {
  const { user } = useAuth();
  const [checkIns, setCheckIns] = useState([]);
  const [goals, setGoals] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!user) {
      setCheckIns([]);
      setGoals([]);
      setStats(null);
      return;
    }
    
    setLoading(true);
    try {
      const [checkInsData, goalsData, statsData] = await Promise.all([
        getCheckIns(),
        getGoals(),
        getStats()
      ]);
      setCheckIns(checkInsData);
      setGoals(goalsData);
      setStats(statsData);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const refreshData = () => {
    loadData();
  };

  return (
    <CheckInContext.Provider value={{ 
      checkIns, 
      goals, 
      stats, 
      loading, 
      refreshData,
      setCheckIns,
      setGoals,
      setStats
    }}>
      {children}
    </CheckInContext.Provider>
  );
};
