// 三层防护：每用户请求限流 + 全局 LLM 并发上限 + 单请求超时熔断
// 使用 Redis (Upstash) 实现分布式状态，Serverless 多实例下也有效

const IORedis = require('ioredis');
require('dotenv').config();

// Redis 连接（复用单例）
let redis = null;

function getRedis() {
  if (!redis && process.env.REDIS_URL) {
    redis = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    redis.on('error', (err) => {
      console.error('Redis error:', err.message);
    });
  }
  return redis;
}

// === 1. 每用户请求限流（Redis 滑动窗口） ===

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

// 进程内 fallback（Redis 不可用时降级）
const localWindows = new Map();

async function checkRateLimit(userId) {
  const r = getRedis();

  // Redis 可用：分布式限流
  if (r && r.status !== 'end') {
    try {
      const key = `ratelimit:${userId}`;
      const now = Date.now();
      const windowStart = now - WINDOW_MS;

      const pipeline = r.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 6)}`);
      pipeline.zcard(key);
      pipeline.pexpire(key, WINDOW_MS);
      const results = await pipeline.exec();

      const count = results[2][1];
      if (count > MAX_REQUESTS_PER_WINDOW) {
        return { allowed: false, remaining: 0, retryAfterMs: WINDOW_MS };
      }
      return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - count };
    } catch (e) {
      // Redis 出错，降级到进程内
    }
  }

  // 进程内 fallback
  const now = Date.now();
  let window = localWindows.get(userId);
  if (!window) { window = []; localWindows.set(userId, window); }
  while (window.length > 0 && window[0] < now - WINDOW_MS) window.shift();
  if (window.length >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0, retryAfterMs: window[0] + WINDOW_MS - now };
  }
  window.push(now);
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - window.length };
}

// === 2. 全局 LLM 并发控制（Redis 信号量） ===

const MAX_CONCURRENT_LLM = 10;
const SLOT_TTL = 60;

// 进程内 fallback
let localActive = 0;
const localWaitQueue = [];

async function acquireLLMSlot() {
  const r = getRedis();

  if (r && r.status !== 'end') {
    try {
      const key = 'llm:slots';
      // 清理过期的槽位（防止某个实例崩溃后槽位不释放）
      const now = Date.now();
      await r.zremrangebyscore(key, 0, now - SLOT_TTL * 1000);

      const slotId = `${process.pid}:${now}:${Math.random().toString(36).slice(2, 6)}`;
      const current = await r.zcard(key);

      if (current < MAX_CONCURRENT_LLM) {
        await r.zadd(key, now, slotId);
        return slotId;
      }

      // 等待：轮询直到有空位
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await r.zremrangebyscore(key, 0, Date.now() - SLOT_TTL * 1000);
        const count = await r.zcard(key);
        if (count < MAX_CONCURRENT_LLM) {
          await r.zadd(key, Date.now(), slotId);
          return slotId;
        }
      }
      throw new Error('LLM 并发已满，请稍后重试');
    } catch (e) {
      if (e.message.includes('并发已满')) throw e;
      // Redis 出错，降级到进程内
    }
  }

  // 进程内 fallback
  return new Promise((resolve) => {
    if (localActive < MAX_CONCURRENT_LLM) {
      localActive++;
      resolve('local');
    } else {
      localWaitQueue.push(resolve);
    }
  });
}

async function releaseLLMSlot(slotId) {
  if (slotId === 'local') {
    if (localWaitQueue.length > 0) {
      const next = localWaitQueue.shift();
      next('local');
    } else {
      localActive--;
    }
    return;
  }

  const r = getRedis();
  if (r && r.status !== 'end') {
    try {
      await r.zrem('llm:slots', slotId);
    } catch (e) {
      // 静默失败，槽位会被 TTL 自动回收
    }
  }
}

async function getLLMStats() {
  const r = getRedis();
  if (r && r.status !== 'end') {
    try {
      await r.zremrangebyscore('llm:slots', 0, Date.now() - SLOT_TTL * 1000);
      const active = await r.zcard('llm:slots');
      return { active, max: MAX_CONCURRENT_LLM, backend: 'redis' };
    } catch (e) {
      // 降级
    }
  }
  return { active: localActive, queued: localWaitQueue.length, max: MAX_CONCURRENT_LLM, backend: 'local' };
}

// === 3. 请求超时熔断 ===

const REQUEST_TIMEOUT_MS = 30000;

function withTimeout(promise, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`请求超时（${timeoutMs}ms），请稍后重试`));
    }, timeoutMs);
    promise
      .then(result => { clearTimeout(timer); resolve(result); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

// === Express 中间件 ===

function rateLimitMiddleware(req, res, next) {
  checkRateLimit(req.user.id).then(result => {
    res.setHeader('X-RateLimit-Remaining', result.remaining || 0);
    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil((result.retryAfterMs || 60000) / 1000));
      return res.status(429).json({
        error: '请求过于频繁，请稍后再试',
        retry_after_ms: result.retryAfterMs,
      });
    }
    next();
  }).catch(() => next());
}

module.exports = {
  checkRateLimit,
  rateLimitMiddleware,
  acquireLLMSlot,
  releaseLLMSlot,
  getLLMStats,
  withTimeout,
  REQUEST_TIMEOUT_MS,
};
