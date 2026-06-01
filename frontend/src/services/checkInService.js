import { API_BASE_URL } from '../config';
import { getStoredToken } from './authService';

// 获取认证头
const getAuthHeaders = async () => {
  const token = await getStoredToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
};

// ========================
// 分组 (Groups) API
// ========================

export const getGroups = async () => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/groups`, { headers });
    if (!response.ok) throw new Error('获取分组失败');
    const data = await response.json();
    return data.groups || [];
  } catch (error) {
    console.error('获取分组失败:', error);
    return []; // 失败返回空数组，防止页面崩溃
  }
};

export const createGroup = async (name) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/groups`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error('创建分组失败');
  return await response.json();
};

export const updateGroup = async (id, data) => {
  const headers = await getAuthHeaders();
  await fetch(`${API_BASE_URL}/api/groups/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
};

export const reorderGroups = async (sortedGroups) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/groups/reorder/batch`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ sortedGroups }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '排序失败' }));
    throw new Error(error.error || '排序失败');
  }
  return await response.json();
};

export const deleteGroup = async (id) => {
  const headers = await getAuthHeaders();
  await fetch(`${API_BASE_URL}/api/groups/${id}`, { method: 'DELETE', headers });
};


// ========================
// 目标 (Goals) API
// ========================

export const getGoals = async () => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/goals`, { headers });
    if (!response.ok) throw new Error('获取目标失败');
    const data = await response.json();
    return data.goals || [];
  } catch (error) {
    console.error('获取目标失败:', error);
    throw error;
  }
};

export const createGoal = async (goalData) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/goals`, {
    method: 'POST',
    headers,
    body: JSON.stringify(goalData),
  });
  if (!response.ok) throw new Error('创建目标失败');
  const data = await response.json();
  return data.goal;
};

export const updateGoal = async (id, data) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/goals/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('更新目标失败');
};

export const deleteGoal = async (id) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/goals/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) throw new Error('删除目标失败');
};

export const reorderGoals = async (sortedGoals) => {
  const headers = await getAuthHeaders();
  await fetch(`${API_BASE_URL}/api/goals/reorder/batch`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ sortedGoals }),
  });
};

// ========================
// 打卡 (CheckIns) API
// ========================

export const getCheckIns = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/checkins`, { headers });
  if (!response.ok) throw new Error('获取记录失败');
  const data = await response.json();
  return data.checkIns || [];
};

export const createCheckIn = async (checkInData) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/checkins`, {
    method: 'POST',
    headers,
    body: JSON.stringify(checkInData),
  });
  if (!response.ok) throw new Error('打卡失败');
  const data = await response.json();
  return data.checkIn;
};

export const deleteCheckIn = async (id) => {
  const headers = await getAuthHeaders();
  await fetch(`${API_BASE_URL}/api/checkins/${id}`, { method: 'DELETE', headers });
};

export const updateCheckIn = async (id, data) => {
  const headers = await getAuthHeaders();
  await fetch(`${API_BASE_URL}/api/checkins/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
};

// 【核心修改】增加了 customDate 参数
export const checkInGoal = async (goalId, note, image, goalList, customDate = null) => {
  // 1. 获取目标名称（为了在后端记录当时的名称快照）
  // 增加 String() 转换，防止 ID 类型不一致导致找不到
  const goal = goalList?.find(g => String(g.id) === String(goalId));
  const name = goal ? goal.name : '打卡';

  // 2. 决定使用哪个时间
  // 如果有传入 customDate（补卡时间），就使用它；否则使用当前时间
  const dateToSend = customDate ? new Date(customDate) : new Date();

  // 3. 调用 createCheckIn
  return await createCheckIn({
    goalId,
    name,
    date: dateToSend.toISOString(), // 使用 ISO 格式，后端更容易解析
    note,
    image,
    isManual: !!customDate // 如果有自定义时间，标记为手动补卡
  });
};

export const getStats = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/stats`, { headers });
  const data = await response.json();
  return data.stats || { goalStats: [] };
};