import React, { createContext, useState, useContext, useEffect } from 'react';
// 注意这里增加了 changePassword as changePasswordAPI
import { 
  login, 
  loginWithCode as loginWithCodeAPI, 
  register, 
  sendVerificationCode, 
  resetPassword as resetPasswordAPI, 
  changePassword as changePasswordAPI, // <--- 新增引入
  updateUser as updateUserAPI, 
  getStoredToken, 
  removeToken 
} from '../services/authService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      // 从本地存储加载用户信息（仅用于显示，实际验证通过token）
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        setUser(JSON.parse(userData));
      }
    } catch (error) {
      console.error('加载用户信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loginWithPassword = async (phone, password) => {
    try {
      const userData = await login(phone, password);
      const normalizedUser = {
        ...userData,
      };
      await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      return normalizedUser;
    } catch (error) {
      console.error('登录失败:', error);
      throw error;
    }
  };

  const registerUser = async (phone, password, nickname, avatar, code) => {
    try {
      const userData = await register(phone, password, nickname, avatar, code);
      const normalizedUser = {
        ...userData,
      };
      await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      return normalizedUser;
    } catch (error) {
      console.error('注册失败:', error);
      throw error;
    }
  };

  const sendCode = async (phone) => {
    try {
      return await sendVerificationCode(phone);
    } catch (error) {
      console.error('发送验证码失败:', error);
      throw error;
    }
  };

  const loginWithCode = async (phone, code) => {
    try {
      const userData = await loginWithCodeAPI(phone, code);
      const normalizedUser = {
        ...userData,
      };
      await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      return normalizedUser;
    } catch (error) {
      console.error('验证码登录失败:', error);
      throw error;
    }
  };

  // 忘记密码（通过手机验证码重置）
  const resetPassword = async (phone, code, newPassword) => {
    try {
      await resetPasswordAPI(phone, code, newPassword);
      return true;
    } catch (error) {
      console.error('重置密码失败:', error);
      throw error;
    }
  };

// --- 更新：修改密码逻辑 ---
const changePassword = async (oldPassword, newPassword) => {
  try {
    // 这里的 phone 参数其实不需要了，因为 API 使用 Token 识别用户
    // 但为了保持 service 参数对齐，传 null 或者不传都行，关键是 service 内部
    await changePasswordAPI(null, oldPassword, newPassword); 
    return true;
  } catch (error) {
    console.error('Context修改密码失败:', error);
    throw error; // 必须抛出错误，MyScreen 才能弹窗提示失败
  }
};

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('user');
      await removeToken();
      setUser(null);
    } catch (error) {
      console.error('登出失败:', error);
    }
  };

  const updateUser = async (updates) => {
    try {
      const updatedUser = await updateUserAPI(updates);
      // 合并旧数据，防止部分字段丢失
      const normalizedUser = {
        ...user, 
        ...updatedUser,
      };
      await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      return normalizedUser;
    } catch (error) {
      console.error('更新用户信息失败:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loginWithPassword,
      loginWithCode,
      register: registerUser,
      sendCode,
      resetPassword,   // 忘记密码
      changePassword,  // <--- 新增：修改密码
      logout, 
      updateUser, 
      loading 
    }}>
      {children}
    </AuthContext.Provider>
  );
};