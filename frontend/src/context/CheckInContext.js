import React, { createContext, useState, useContext, useEffect } from 'react';
import { getCheckIns, getGoals, getStats, getGroups } from '../services/checkInService';
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
  const [groups, setGroups] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!user) {
      setCheckIns([]);
      setGoals([]);
      setGroups([]);
      setStats(null);
      return;
    }

    setLoading(true);
    try {
      const [checkInsData, goalsData, statsData, groupsData] = await Promise.all([
        getCheckIns(),
        getGoals(),
        getStats(),
        getGroups().catch(() => []),
      ]);
      setCheckIns(checkInsData);
      setGoals(goalsData);
      setGroups(groupsData);
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
      groups,
      stats,
      loading,
      refreshData,
      setCheckIns,
      setGoals,
      setGroups,
      setStats
    }}>
      {children}
    </CheckInContext.Provider>
  );
};
