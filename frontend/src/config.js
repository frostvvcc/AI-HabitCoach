// API配置
// ⭐️ 现在后端上云了，无论是开发还是打包，都直接用这个 Vercel 地址
// 注意：不要在末尾加斜杠 /

// 本地开发（模拟器用 localhost）
export const API_BASE_URL = 'http://127.0.0.1:3000';

// 正式版配置（部署时切回来）
// export const API_BASE_URL = 'https://frost-checkin.top';

// 调试信息
console.log('🔧 当前使用的 API 地址:', API_BASE_URL);

// 应用配置 (这部分保持不变)
export const APP_CONFIG = {
  MAX_RETROACTIVE_DAYS: 3, 
  NOTIFICATION_ENABLED: true,
};