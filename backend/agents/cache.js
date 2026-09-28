const cacheStore = new Map();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 1000;

function getCacheKey(userId, message) {
  const normalized = message.replace(/[，。？！、\s]/g, '').toLowerCase();
  const today = new Date().toISOString().split('T')[0];
  return `${userId}:${today}:${normalized}`;
}

function getCache(userId, message) {
  const key = getCacheKey(userId, message);
  const cached = cacheStore.get(key);

  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    cacheStore.delete(key);
    return null;
  }

  return cached.result;
}

function setCache(userId, message, result) {
  const key = getCacheKey(userId, message);
  cacheStore.set(key, { result, timestamp: Date.now() });

  if (cacheStore.size > MAX_ENTRIES) {
    const oldestKey = cacheStore.keys().next().value;
    cacheStore.delete(oldestKey);
  }
}

function invalidateUserCache(userId) {
  for (const [key] of cacheStore) {
    if (key.startsWith(userId)) {
      cacheStore.delete(key);
    }
  }
}

module.exports = { getCache, setCache, invalidateUserCache };
