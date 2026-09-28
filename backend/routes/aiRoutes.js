const express = require('express');
const router = express.Router();
const { coordinator, coordinatorStream } = require('../agents/coordinator');
const { checkBudget } = require('../agents/budget');
const { TOOL_MAP, DANGEROUS_TOOLS } = require('../agents/actionAgent');
const { createSession, listSessions, deleteSession, loadMemory } = require('../agents/memory');
const { getMetrics } = require('../agents/tracer');
const { rateLimitMiddleware, acquireLLMSlot, releaseLLMSlot, withTimeout, getLLMStats } = require('../agents/rateLimiter');

// ============ 会话管理 ============

router.post('/sessions', async (req, res) => {
  try {
    const session = await createSession(req.user.id);
    res.json(session);
  } catch (e) {
    console.error('Create Session Error:', e);
    res.status(500).json({ error: '创建会话失败' });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const sessions = await listSessions(req.user.id);
    res.json({ sessions });
  } catch (e) {
    console.error('List Sessions Error:', e);
    res.status(500).json({ error: '获取会话列表失败' });
  }
});

router.get('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const memory = await loadMemory(req.user.id, req.params.sessionId);
    res.json({ messages: memory.messages || [], summary: memory.summary || '' });
  } catch (e) {
    console.error('Get Messages Error:', e);
    res.status(500).json({ error: '获取消息失败' });
  }
});

router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    await deleteSession(req.user.id, req.params.sessionId);
    res.json({ success: true });
  } catch (e) {
    console.error('Delete Session Error:', e);
    res.status(500).json({ error: '删除会话失败' });
  }
});

// ============ AI 对话 ============

router.post('/chat', rateLimitMiddleware, async (req, res) => {
  try {
    const budget = await checkBudget(req.user.id);
    if (budget.exceeded) {
      return res.json({
        reply: `今日 AI 额度已用完（${budget.used.toLocaleString()} / ${budget.limit.toLocaleString()} tokens）。明天重置后再来吧！`,
        data_changed: false
      });
    }

    const { message, session_id } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: '消息不能为空' });
    }

    const slotId = await acquireLLMSlot();
    try {
      const result = await withTimeout(coordinator(req.user.id, message, session_id));
      res.json(result);
    } finally {
      await releaseLLMSlot(slotId);
    }
  } catch (e) {
    console.error('AI Chat Error:', e);
    const status = e.message?.includes('超时') ? 504 : 500;
    res.status(status).json({ error: e.message || 'AI 服务暂时不可用' });
  }
});

router.post('/chat/stream', rateLimitMiddleware, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const { message, session_id } = req.body;
  const userId = req.user.id;

  try {
    const budget = await checkBudget(userId);
    if (budget.exceeded) {
      res.write(`data: ${JSON.stringify({ type: 'reply_chunk', content: '今日 AI 额度已用完。' })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const slotId = await acquireLLMSlot();
    try {
      const onProgress = (step) => {
        res.write(`data: ${JSON.stringify(step)}\n\n`);
      };

      const result = await withTimeout(
        coordinatorStream(userId, message, onProgress, session_id),
        60000
      );

      if (result.data_changed) {
        res.write(`data: ${JSON.stringify({ type: 'data_changed' })}\n\n`);
      }
      if (result.pending_action) {
        res.write(`data: ${JSON.stringify({ type: 'pending_action', action: result.pending_action })}\n\n`);
      }
    } finally {
      await releaseLLMSlot(slotId);
    }
    res.write('data: [DONE]\n\n');
  } catch (e) {
    console.error('AI Stream Error:', e);
    const msg = e.message?.includes('超时') ? '请求处理超时，请简化问题重试' : 'AI 服务暂时不可用';
    res.write(`data: ${JSON.stringify({ type: 'error', content: msg })}\n\n`);
    res.write('data: [DONE]\n\n');
  }
  res.end();
});

// ============ 报告 ============

router.get('/daily', async (req, res) => {
  try {
    const result = await coordinator(req.user.id, '生成今天的打卡情况报告，包含各目标完成状态和建议');
    res.json({ report: result.reply || result });
  } catch (e) {
    console.error('Daily Report Error:', e);
    res.status(500).json({ error: '报告生成失败' });
  }
});

router.get('/weekly', async (req, res) => {
  try {
    const result = await coordinator(req.user.id, '生成本周的习惯养成周报，对比上周数据，给出下周建议');
    res.json({ report: result.reply || result });
  } catch (e) {
    console.error('Weekly Report Error:', e);
    res.status(500).json({ error: '周报生成失败' });
  }
});

// ============ 可观测性指标 ============

router.get('/metrics', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const metrics = await getMetrics(hours);
    metrics.llm_concurrency = getLLMStats();
    res.json(metrics);
  } catch (e) {
    console.error('Metrics Error:', e);
    res.status(500).json({ error: '指标查询失败' });
  }
});

// ============ 确认危险操作 ============

router.post('/confirm', async (req, res) => {
  try {
    const { tool, args } = req.body;
    if (!tool || !DANGEROUS_TOOLS.includes(tool)) {
      return res.status(400).json({ error: '无效的确认请求' });
    }
    const toolFn = TOOL_MAP[tool];
    const result = await toolFn(req.user.id, args);
    res.json({ reply: result.message, data_changed: result.success });
  } catch (e) {
    console.error('Confirm Error:', e);
    res.status(500).json({ error: '执行失败' });
  }
});

module.exports = router;
