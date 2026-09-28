const mongoose = require('mongoose');

const traceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agent: String,
  user_message: String,
  steps: [{
    type: { type: String },
    tool_name: String,
    tool_args: Object,
    tool_result: Object,
    tokens_used: Number,
    latency_ms: Number
  }],
  total_tokens: Number,
  total_latency_ms: Number,
  route_intent: String,
  tool_call_count: Number,
  tool_error_count: Number,
  cache_hit: Boolean,
  created_at: { type: Date, default: Date.now }
});

traceSchema.index({ user: 1, created_at: -1 });
traceSchema.index({ created_at: -1 });

const Trace = mongoose.model('Trace', traceSchema);

class AgentTracer {
  constructor(userId, agentName, userMessage) {
    this.userId = userId;
    this.agentName = agentName;
    this.userMessage = userMessage;
    this.steps = [];
    this.startTime = Date.now();
    this.meta = {};
  }

  logToolCall(toolName, args) {
    this.steps.push({ type: 'tool_call', tool_name: toolName, tool_args: args });
    this._log('tool_call', { tool: toolName, args_keys: Object.keys(args || {}) });
  }

  logToolResult(toolName, result, latencyMs) {
    this.steps.push({ type: 'tool_result', tool_name: toolName, tool_result: result, latency_ms: latencyMs });
    const success = result?.success !== false && !result?.error;
    this._log('tool_result', { tool: toolName, success, latency_ms: latencyMs });
  }

  logLLMCall(tokensUsed, latencyMs) {
    this.steps.push({ type: 'think', tokens_used: tokensUsed, latency_ms: latencyMs });
    this._log('llm_call', { tokens: tokensUsed, latency_ms: latencyMs });
  }

  setMeta(key, value) {
    this.meta[key] = value;
  }

  _log(event, data) {
    const entry = {
      ts: new Date().toISOString(),
      event,
      agent: this.agentName,
      user: this.userId,
      ...data,
    };
    console.log(JSON.stringify(entry));
  }

  async save() {
    const totalTokens = this.steps.reduce((s, step) => s + (step.tokens_used || 0), 0);
    const toolCalls = this.steps.filter(s => s.type === 'tool_call');
    const toolErrors = this.steps.filter(s => s.type === 'tool_result' && (s.tool_result?.error || s.tool_result?.success === false));

    const totalLatency = Date.now() - this.startTime;
    this._log('agent_complete', {
      total_tokens: totalTokens,
      total_latency_ms: totalLatency,
      tool_calls: toolCalls.length,
      tool_errors: toolErrors.length,
    });

    await Trace.create({
      user: this.userId,
      agent: this.agentName,
      user_message: this.userMessage,
      steps: this.steps,
      total_tokens: totalTokens,
      total_latency_ms: totalLatency,
      route_intent: this.meta.intent || null,
      tool_call_count: toolCalls.length,
      tool_error_count: toolErrors.length,
      cache_hit: this.meta.cache_hit || false,
    });
  }
}

// 指标聚合：给 /api/ai/metrics 端点用
async function getMetrics(hours = 24) {
  const since = new Date(Date.now() - hours * 3600 * 1000);

  const traces = await Trace.find({ created_at: { $gte: since } }).lean();
  if (traces.length === 0) {
    return { period_hours: hours, total_requests: 0 };
  }

  const totalTokens = traces.reduce((s, t) => s + (t.total_tokens || 0), 0);
  const latencies = traces.map(t => t.total_latency_ms || 0).sort((a, b) => a - b);
  const toolCalls = traces.reduce((s, t) => s + (t.tool_call_count || 0), 0);
  const toolErrors = traces.reduce((s, t) => s + (t.tool_error_count || 0), 0);

  const intentDist = {};
  traces.forEach(t => {
    const intent = t.route_intent || t.agent || 'unknown';
    intentDist[intent] = (intentDist[intent] || 0) + 1;
  });

  // 按工具统计延迟
  const toolLatencies = {};
  traces.forEach(t => {
    (t.steps || []).forEach(step => {
      if (step.type === 'tool_result' && step.tool_name && step.latency_ms) {
        if (!toolLatencies[step.tool_name]) toolLatencies[step.tool_name] = [];
        toolLatencies[step.tool_name].push(step.latency_ms);
      }
    });
  });
  const toolStats = {};
  for (const [name, lats] of Object.entries(toolLatencies)) {
    lats.sort((a, b) => a - b);
    toolStats[name] = {
      count: lats.length,
      p50: lats[Math.floor(lats.length * 0.5)] || 0,
      p95: lats[Math.floor(lats.length * 0.95)] || 0,
      avg: Math.round(lats.reduce((a, b) => a + b, 0) / lats.length),
    };
  }

  // 独立用户数
  const uniqueUsers = new Set(traces.map(t => String(t.user))).size;

  return {
    period_hours: hours,
    total_requests: traces.length,
    unique_users: uniqueUsers,
    total_tokens: totalTokens,
    avg_tokens_per_request: Math.round(totalTokens / traces.length),
    latency: {
      avg: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      p50: latencies[Math.floor(latencies.length * 0.5)] || 0,
      p95: latencies[Math.floor(latencies.length * 0.95)] || 0,
      max: latencies[latencies.length - 1] || 0,
    },
    tool_calls: toolCalls,
    tool_error_rate: toolCalls > 0 ? ((toolErrors / toolCalls) * 100).toFixed(1) + '%' : '0%',
    intent_distribution: intentDist,
    tool_stats: toolStats,
  };
}

module.exports = { Trace, AgentTracer, getMetrics };
