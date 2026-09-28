const llm = require('./llm');
const dataTools = require('./tools/dataTools');
const { AgentTracer } = require('./tracer');
const { validateToolArgs, safeParseArgs } = require('./toolValidator');

const ANALYST_PROMPT = `你是用户的 AI 习惯教练，擅长用数据帮用户看清自己的习惯情况并给出建议。

## 核心工作流程

每次收到问题，按这个顺序思考：

1. **理解意图**：用户在问什么？是问某个具体目标，还是整体情况？
2. **定位目标**：如果提到了具体目标名称 → 先调 find_goal_by_name 拿到 goal_id
3. **拉取数据**：根据问题类型调对应的分析工具
4. **组织回答**：用数据说话，给可执行的建议

## 示例对话

### 示例 1：问某个目标的频率/表现
用户：咖啡喝得怎么样
思考：用户在问"咖啡"相关目标的完成情况。先查目标。
调用：find_goal_by_name({ name: "咖啡" })
结果：{ success: true, goal_id: "xxx", goal_name: "喝咖啡" }
调用：get_completion_rate({ goal_id: "xxx", period: "week" })
结果：{ rate: 0.71, actual: 5, target: 7 }
回复：你的「喝咖啡」本周完成了 5/7 天，完成率 71%，还不错！保持下去就好～

### 示例 2：问为什么坚持不下去
用户：跑步坚持不下去怎么办
思考：用户遇到瓶颈，需要看完成率 + 连续性 + 时间规律来诊断。
调用：find_goal_by_name({ name: "跑步" })
调用：get_completion_rate({ goal_id: "xxx", period: "week" })
调用：get_streak_data({ goal_id: "xxx" })
调用：detect_time_pattern({ goal_id: "xxx" })
→ 综合数据给出诊断和建议

### 示例 3：问整体情况
用户：我最近表现怎么样
思考：问的是整体，用 all 查全部目标完成率 + 风险检测。
调用：get_completion_rate({ goal_id: "all", period: "week" })
调用：get_risk_goals()
→ 逐个目标总结 + 标出风险项

### 示例 4：问有没有进步
用户：读书比上周有进步吗
思考：需要周期对比。
调用：find_goal_by_name({ name: "读书" })
调用：compare_periods({ goal_id: "xxx", period1: "this_week", period2: "last_week" })
→ 对比数据 + 趋势判断

### 示例 5：闲聊/打招呼
用户：你好
回复：你好！我是你的习惯教练，随时可以帮你看看打卡数据、分析表现。有什么想了解的吗？

## 回答风格

- 先用 1-2 句话总结结论
- 用具体数字佐证（"跑步本周 5/7，完成率 71%"）
- 最后给 1-2 条可执行的短建议
- 语气像朋友聊天，不像系统报告
- 做得好要肯定鼓励，有问题给方案不说教

## 限制
- 你只能读数据，不能创建/修改/删除目标
- 如果用户要求操作（"帮我改""帮我建"），告诉他你可以分析，操作交给操作助手`;

const ANALYST_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'find_goal_by_name',
      description: '根据目标名称模糊搜索，返回 goal_id。分析任何具体目标前必须先调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '用户提到的目标名称，如"跑步""喝咖啡""读书"' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_completion_rate',
      description: '计算指定目标在指定周期内的完成率。goal_id 传 "all" 查所有目标。',
      parameters: {
        type: 'object',
        properties: {
          goal_id: { type: 'string', description: '目标ID，从 find_goal_by_name 获取，或传 "all"' },
          period: { type: 'string', enum: ['week', 'month', 'year'] }
        },
        required: ['goal_id', 'period']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_streak_data',
      description: '获取连续打卡数据：当前连续天数、最长连续、总打卡天数',
      parameters: {
        type: 'object',
        properties: {
          goal_id: { type: 'string', description: '目标ID，从 find_goal_by_name 获取' }
        },
        required: ['goal_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'detect_time_pattern',
      description: '分析打卡时间规律：高频时段、星期分布、最近是否推迟/提前',
      parameters: {
        type: 'object',
        properties: {
          goal_id: { type: 'string' }
        },
        required: ['goal_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'compare_periods',
      description: '对比两个时间段的表现（如本周 vs 上周）',
      parameters: {
        type: 'object',
        properties: {
          goal_id: { type: 'string' },
          period1: { type: 'string', description: 'this_week / last_week / this_month / last_month' },
          period2: { type: 'string' }
        },
        required: ['goal_id', 'period1', 'period2']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_risk_goals',
      description: '找出有断连风险或完成率骤降的目标',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
];

const TOOL_MAP = {
  find_goal_by_name: dataTools.findGoalByName,
  get_completion_rate: dataTools.getCompletionRate,
  get_streak_data: dataTools.getStreakData,
  detect_time_pattern: dataTools.detectTimePattern,
  compare_periods: dataTools.comparePeriods,
  get_risk_goals: dataTools.getRiskGoals
};

const TOOL_LABELS = {
  find_goal_by_name: '查找目标',
  get_completion_rate: '查询完成率',
  get_streak_data: '查询连续打卡',
  detect_time_pattern: '分析时间模式',
  compare_periods: '对比历史数据',
  get_risk_goals: '检测风险目标'
};

async function analystAgent(userId, query, contextMessages = []) {
  const tracer = new AgentTracer(userId, 'analyst', query);
  const messages = [
    { role: 'system', content: ANALYST_PROMPT },
    ...contextMessages,
    { role: 'user', content: query }
  ];

  for (let i = 0; i < 8; i++) {
    const llmStart = Date.now();
    const response = await llm.chat(messages, { tools: ANALYST_TOOLS });
    tracer.logLLMCall(response.usage?.total_tokens || 0, Date.now() - llmStart);

    if (response.tool_calls) {
      messages.push(response);

      const results = await Promise.all(response.tool_calls.map(async (call) => {
        const parsed = safeParseArgs(call.function.arguments);
        if (!parsed.ok) return { call_id: call.id, result: { error: parsed.error } };
        const args = parsed.args;
        const validation = validateToolArgs(call.function.name, args);
        if (!validation.valid) return { call_id: call.id, result: { error: validation.message } };
        tracer.logToolCall(call.function.name, args);
        const toolStart = Date.now();
        const result = await TOOL_MAP[call.function.name](userId, args);
        tracer.logToolResult(call.function.name, result, Date.now() - toolStart);
        return { call_id: call.id, result };
      }));

      for (const { call_id, result } of results) {
        messages.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: call_id });
      }
    } else {
      await tracer.save();
      return response.content;
    }
  }

  await tracer.save();
  return '分析超时，请简化问题再试。';
}

async function analystAgentStream(userId, query, onProgress, contextMessages = []) {
  const tracer = new AgentTracer(userId, 'analyst', query);
  const messages = [
    { role: 'system', content: ANALYST_PROMPT },
    ...contextMessages,
    { role: 'user', content: query }
  ];

  for (let i = 0; i < 8; i++) {
    const llmStart = Date.now();
    const response = await llm.chat(messages, { tools: ANALYST_TOOLS });
    tracer.logLLMCall(response.usage?.total_tokens || 0, Date.now() - llmStart);

    if (response.tool_calls) {
      messages.push(response);

      const results = await Promise.all(response.tool_calls.map(async (call) => {
        const parsed = safeParseArgs(call.function.arguments);
        if (!parsed.ok) return { call_id: call.id, result: { error: parsed.error } };
        const args = parsed.args;
        const validation = validateToolArgs(call.function.name, args);
        if (!validation.valid) return { call_id: call.id, result: { error: validation.message } };
        const label = TOOL_LABELS[call.function.name] || call.function.name;
        onProgress({ type: 'tool', content: `正在${label}...` });

        tracer.logToolCall(call.function.name, args);
        const toolStart = Date.now();
        const result = await TOOL_MAP[call.function.name](userId, args);
        tracer.logToolResult(call.function.name, result, Date.now() - toolStart);
        return { call_id: call.id, result };
      }));

      for (const { call_id, result } of results) {
        messages.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: call_id });
      }
    } else {
      onProgress({ type: 'status', content: '正在生成建议...' });

      const stream = await llm.chatStream(messages);
      let fullReply = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullReply += content;
          onProgress({ type: 'reply_chunk', content });
        }
      }

      await tracer.save();
      return fullReply;
    }
  }

  await tracer.save();
  return '分析超时，请简化问题再试。';
}

module.exports = { analystAgent, analystAgentStream };
