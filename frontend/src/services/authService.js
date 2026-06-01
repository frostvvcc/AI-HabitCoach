import { API_BASE_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'auth_token';

// 获取存储的token
export const getStoredToken = async () => {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error('获取token失败:', error);
    return null;
  }
};

// 存储token
export const storeToken = async (token) => {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch (error) {
    console.error('存储token失败:', error);
  }
};

// 删除token
export const removeToken = async () => {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.error('删除token失败:', error);
  }
};

// 发送验证码
export const sendVerificationCode = async (phone) => {
  try {
    console.log('📱 发送验证码请求:', `${API_BASE_URL}/api/auth/send-code`, { phone });
    
    const response = await fetch(`${API_BASE_URL}/api/auth/send-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone }),
    });

    console.log('📱 验证码响应状态:', response.status, response.statusText);

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('❌ 服务器返回非JSON响应:', text);
      throw new Error(`服务器连接失败，请检查后端服务是否运行在 ${API_BASE_URL}`);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '发送验证码失败' }));
      throw new Error(error.error || '发送验证码失败');
    }

    const data = await response.json();
    console.log('✅ 验证码发送成功');
    return data;
  } catch (error) {
    console.error('❌ 发送验证码失败:', error);
    
    // 网络错误
    if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
      throw new Error(`无法连接到服务器 ${API_BASE_URL}，请检查网络或IP配置`);
    }
    throw error;
  }
};

// 注册
export const register = async (phone, password, nickname, avatar, code) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, password, nickname, avatar, code }),
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('服务器连接失败');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '注册失败' }));
      throw new Error(error.error || '注册失败');
    }

    const data = await response.json();
    await storeToken(data.token);
    return data.user;
  } catch (error) {
    console.error('注册失败:', error);
    throw error;
  }
};

// 登录
export const login = async (phone, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, password }),
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('服务器连接失败');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '登录失败' }));
      throw new Error(error.error || '登录失败');
    }

    const data = await response.json();
    await storeToken(data.token);
    return data.user;
  } catch (error) {
    console.error('登录失败:', error);
    throw error;
  }
};

// 验证码登录
export const loginWithCode = async (phone, code) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login-with-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, code }),
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('服务器连接失败');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '登录失败' }));
      throw new Error(error.error || '登录失败');
    }

    const data = await response.json();
    await storeToken(data.token);
    return data.user;
  } catch (error) {
    console.error('验证码登录失败:', error);
    throw error;
  }
};

// 忘记密码（重置密码）
export const resetPassword = async (phone, code, newPassword) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, code, newPassword }),
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('服务器连接失败');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '修改密码失败' }));
      throw new Error(error.error || '修改密码失败');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('修改密码失败:', error);
    throw error;
  }
};

// ... 保留 authService.js 原有代码 ...

// [新增] 修改密码（需要登录状态）
export const changePassword = async (phone, oldPassword, newPassword) => {
  try {
    const token = await getStoredToken();
    if (!token) throw new Error('未登录');

    const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ oldPassword, newPassword }), // 注意：后端不需要 phone，从 token 获取 id 即可
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('非JSON响应:', text);
        throw new Error('服务器响应格式错误');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '修改密码失败' }));
      // 这里会抛出 "旧密码错误"
      throw new Error(error.error || '修改密码失败');
    }

    return await response.json();
  } catch (error) {
    console.error('修改密码请求失败:', error);
    if (error.message.includes('JSON Parse error')) {
       throw new Error('服务器连接失败');
    }
    throw error;
  }
};

// 更新用户信息
export const updateUser = async (updates) => {
  try {
    const token = await getStoredToken();
    if (!token) {
      throw new Error('未登录');
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('服务器连接失败');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '更新失败' }));
      throw new Error(error.error || '更新失败');
    }

    const data = await response.json();
    return data.user;
  } catch (error) {
    console.error('更新用户信息失败:', error);
    if (error.message.includes('Network request failed')) {
      throw new Error('无法连接到服务器');
    }
    throw error;
  }
};
