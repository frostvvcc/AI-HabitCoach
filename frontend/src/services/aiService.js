import { API_BASE_URL } from '../config';
import { getStoredToken } from './authService';

const getAuthHeaders = async () => {
  const token = await getStoredToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
};

export const createSession = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/ai/sessions`, {
    method: 'POST', headers,
  });
  if (!response.ok) throw new Error('创建会话失败');
  return await response.json();
};

export const listSessions = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/ai/sessions`, { headers });
  if (!response.ok) throw new Error('获取会话列表失败');
  const data = await response.json();
  return data.sessions || [];
};

export const getSessionMessages = async (sessionId) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/ai/sessions/${sessionId}/messages`, { headers });
  if (!response.ok) throw new Error('获取消息失败');
  return await response.json();
};

export const deleteSessionAPI = async (sessionId) => {
  const headers = await getAuthHeaders();
  await fetch(`${API_BASE_URL}/api/ai/sessions/${sessionId}`, {
    method: 'DELETE', headers,
  });
};

export const chatWithAI = async (message, sessionId) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
    method: 'POST', headers,
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!response.ok) throw new Error('AI 服务不可用');
  return await response.json();
};

/**
 * SSE 流式对话
 * @param {string} message - 用户消息
 * @param {string} sessionId - 会话 ID
 * @param {object} callbacks - 回调函数集
 * @param {function} callbacks.onChunk - 收到文本片段 (content: string)
 * @param {function} callbacks.onTool - 收到工具调用状态 (content: string)
 * @param {function} callbacks.onStatus - 收到状态提示 (content: string)
 * @param {function} callbacks.onDataChanged - 数据有变更
 * @param {function} callbacks.onPendingAction - 收到待确认操作 (action: object)
 * @param {function} callbacks.onDone - 流结束
 * @param {function} callbacks.onError - 出错 (error: Error)
 */
/**
 * SSE 流式对话 — 使用 XMLHttpRequest 实现，兼容 React Native
 *
 * RN 的 fetch 不支持 ReadableStream / response.body.getReader()，
 * 但 XMLHttpRequest 的 onreadystatechange 在 readyState === 3 (LOADING)
 * 时可以通过 responseText 增量读取 SSE 数据。
 */
export const chatWithAIStream = async (message, sessionId, callbacks) => {
  const headers = await getAuthHeaders();

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/ai/chat/stream`);

    Object.keys(headers).forEach(key => {
      xhr.setRequestHeader(key, headers[key]);
    });

    let lastIndex = 0;

    const processChunk = (text) => {
      const newData = text.substring(lastIndex);
      lastIndex = text.length;

      const lines = newData.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6);

        if (payload === '[DONE]') {
          callbacks.onDone?.();
          return;
        }

        try {
          const event = JSON.parse(payload);
          switch (event.type) {
            case 'reply_chunk':
              callbacks.onChunk?.(event.content);
              break;
            case 'tool':
              callbacks.onTool?.(event.content);
              break;
            case 'status':
              callbacks.onStatus?.(event.content);
              break;
            case 'data_changed':
              callbacks.onDataChanged?.();
              break;
            case 'pending_action':
              callbacks.onPendingAction?.(event.action);
              break;
            case 'error':
              callbacks.onError?.(new Error(event.content));
              break;
          }
        } catch (parseErr) {
          // skip malformed JSON
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 && xhr.responseText) {
        processChunk(xhr.responseText);
      }
      if (xhr.readyState === 4) {
        if (xhr.responseText) processChunk(xhr.responseText);
        if (xhr.status >= 400) {
          callbacks.onError?.(new Error(`HTTP ${xhr.status}`));
        }
        callbacks.onDone?.();
        resolve();
      }
    };

    xhr.onerror = () => {
      callbacks.onError?.(new Error('网络错误'));
      resolve();
    };

    xhr.ontimeout = () => {
      callbacks.onError?.(new Error('请求超时'));
      resolve();
    };

    xhr.timeout = 120000;
    xhr.send(JSON.stringify({ message, session_id: sessionId }));
  });
};

export const confirmAction = async (action) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/ai/confirm`, {
    method: 'POST', headers,
    body: JSON.stringify(action),
  });
  if (!response.ok) throw new Error('确认执行失败');
  return await response.json();
};

export const getDailyReport = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/ai/daily`, { headers });
  if (!response.ok) throw new Error('获取报告失败');
  return await response.json();
};

export const getWeeklyReport = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/ai/weekly`, { headers });
  if (!response.ok) throw new Error('获取周报失败');
  return await response.json();
};
