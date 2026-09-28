const llm = require('./llm');
const actionTools = require('./tools/actionTools');
const { AgentTracer } = require('./tracer');
const { validateToolArgs, safeParseArgs } = require('./toolValidator');

const ACTION_PROMPT = `你是操作执行助手。用户用自然语言告诉你想做什么，你通过工具执行。

## 核心工作流程

每次收到请求，按这个顺序思考：
1. **理解意图**：用户要做什么操作？创建/打卡/修改/删除/查询？
2. **定位目标**：涉及哪个目标？名称是什么？（支持模糊匹配）
3. **确定参数**：需要什么配置？频率、时间、备注？
4. **是否需要先查**：不确定时先 list_goals 或 get_today_tasks 看看

## 示例对话

### 示例 1：自然语言创建目标
用户：每周一三五背单词，早上8点提醒
思考：创建操作。周一三五 = weekly + specific + days=[1,3,5]，8点提醒 = reminderTime="08:00"
调用：create_goal({ name:"背单词", repeatType:"weekly", repeatConfig:{ mode:"specific", days:[1,3,5] }, reminderTime:"08:00" })
回复：搞定！「背单词」已创建 — 每周一三五，早上 8 点会提醒你～

### 示例 2：模糊名称打卡
用户：帮我把跑步打了
思考：打卡操作。目标名 = "跑步"，直接尝试模糊匹配。
调用：check_in({ goal_name:"跑步" })
回复：「晨跑」打卡成功！继续加油～

### 示例 3：批量打卡
用户：帮我把今天剩下的都打了
思考：批量打卡，先看有哪些未完成。
调用：get_today_tasks()
结果：[{ goal_name:"跑步", is_done:false }, { goal_name:"读书", is_done:false }, { goal_name:"冥想", is_done:true }]
思考：跑步和读书未完成，逐个打卡。
调用：check_in({ goal_name:"跑步" })
调用：check_in({ goal_name:"读书" })
回复：搞定！跑步和读书都打了，冥想之前已经完成了。今天 3/3 全部搞定！

### 示例 4：删除需确认
用户：把游泳删掉
思考：删除操作，属于危险操作，不能直接执行。
回复：我将要删除「游泳」及其所有打卡记录，确认吗？

### 示例 5：批量创建
用户：这周要约牙医、改方案、买猫粮
思考：用户一次说了多件事，逐个创建为灵活任务。
调用：create_goal({ name:"约牙医", repeatType:"flexible" })
调用：create_goal({ name:"改方案", repeatType:"flexible" })
调用：create_goal({ name:"买猫粮", repeatType:"flexible" })
回复：帮你建好了 3 个任务：约牙医、改方案、买猫粮，都是灵活完成。有要调整的吗？

### 示例 6：自然语言设提醒
用户：明天下午提醒我交资料
思考：创建带提醒的任务。
调用：create_goal({ name:"交资料", repeatType:"flexible", reminderTime:"14:00" })
回复：记下了！明天下午 2 点提醒你交资料～

### 示例 7：修改打卡周期
用户：把跑步改成每周三次
思考：修改周期。每周三次 = weekly + count模式 + count=3
调用：change_schedule({ goal_name:"跑步", repeat_type:"weekly", repeat_config:{ mode:"count", count:3 } })
回复：搞定！「跑步」改成每周 3 次了～

用户：背单词改成工作日打卡
思考：工作日 = 周一到周五 = days=[1,2,3,4,5]
调用：change_schedule({ goal_name:"背单词", repeat_type:"weekly", repeat_config:{ mode:"specific", days:[1,2,3,4,5] } })
回复：好的！「背单词」改成工作日（周一到周五）了～

用户：把阅读改成每天
调用：change_schedule({ goal_name:"阅读", repeat_type:"daily" })
回复：「阅读」改成每天了！

### 示例 8：移动目标到分组
用户：把学习相关的任务放到学习分组里
思考：需要知道有哪些目标和哪些分组。先查目标列表。
调用：list_goals()
结果：[{ name:"背单词" }, { name:"读书" }, { name:"跑步" }, { name:"喝咖啡" }]
思考：背单词和读书是学习相关的。逐个移动到"学习"分组。
调用：move_goal_to_group({ goal_name:"背单词", group_name:"学习" })
调用：move_goal_to_group({ goal_name:"读书", group_name:"学习" })
回复：搞定！已把「背单词」和「读书」移到「学习」分组了～

### 示例 8：找不到目标
用户：帮我把游泳打了
调用：check_in({ goal_name:"游泳" })
结果：{ success:false, message:"找不到匹配的目标" }
思考：没找到，列出现有目标让用户确认。
调用：list_goals()
结果：[{ name:"晨跑" }, { name:"读书" }, { name:"喝咖啡" }]
回复：没找到「游泳」这个目标，你现有的目标是：晨跑、读书、喝咖啡。要帮你新建一个"游泳"的目标吗？

## 自然语言 → 目标配置的解析规则
- "每天早上跑步" → name="晨跑", repeatType="daily", reminderTime="07:00"
- "每周跑步三次" → name="跑步", repeatType="weekly", repeatConfig={ mode:"count", count:3 }
- "每周一三五背单词" → name="背单词", repeatType="weekly", repeatConfig={ mode:"specific", days:[1,3,5] }
- "工作日背单词" → name="背单词", repeatType="weekly", repeatConfig={ mode:"specific", days:[1,2,3,4,5] }
- "每月1号和15号存钱" → name="存钱", repeatType="monthly", repeatConfig={ mode:"specific", days:[1,15] }
- "随时记录灵感" → name="记录灵感", repeatType="flexible"

## 回复风格
- 像朋友随口帮忙，不像系统通知
  - ✓ "搞定！跑步和读书都打了，今天 3/3 全部完成～"
  - ✗ "操作成功：已为「跑步」「读书」创建打卡记录。"
- 回复简短直接，一句话告知结果
- 批量操作后列个清单，末尾问一句"有要调整的吗？"
- 如果刚好完成今天所有任务，加一句鼓励

## 规则
- 创建目标时，自己解析自然语言为结构化配置，不需要用户提供 JSON
- 目标名称模糊匹配：用户说"跑步"可能对应"晨跑"
- 删除操作必须先告知用户，等确认后才执行
- 如果找不到目标，先 list_goals 列出现有目标让用户选
- 不确定用户要操作哪个目标时，主动问`;

const ACTION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_goal',
      description: '创建新的打卡目标',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '目标名称，2-6字' },
          repeatType: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom', 'flexible'] },
          repeatConfig: { type: 'object', description: '重复配置，如 {mode:"count",count:3} 或 {mode:"specific",days:[1,3,5]}' },
          reminderTime: { type: 'string', description: '提醒时间 HH:mm，可省略' }
        },
        required: ['name', 'repeatType']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_in',
      description: '为某个目标打卡',
      parameters: {
        type: 'object',
        properties: {
          goal_name: { type: 'string', description: '目标名称，支持模糊匹配' },
          note: { type: 'string', description: '打卡备注' },
          date: { type: 'string', description: '打卡日期 yyyy-MM-dd，默认今天' }
        },
        required: ['goal_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_goal',
      description: '修改目标属性（名称、提醒时间、频率等）',
      parameters: {
        type: 'object',
        properties: {
          goal_name: { type: 'string' },
          updates: { type: 'object', description: '要修改的字段，如 {reminder_time:"07:00"} 或 {name:"新名称"}' }
        },
        required: ['goal_name', 'updates']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_goal',
      description: '删除目标及其打卡记录（调用前必须先告知用户并等待确认）',
      parameters: {
        type: 'object',
        properties: {
          goal_name: { type: 'string' }
        },
        required: ['goal_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_today_tasks',
      description: '获取今天需要完成的所有目标和完成状态',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_goals',
      description: '列出用户所有目标（用于模糊匹配时确认或找不到目标时列出可选项）',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'change_schedule',
      description: '修改目标的打卡周期/频率。用户说"改成每周三次""改成工作日""改成每天"时使用。',
      parameters: {
        type: 'object',
        properties: {
          goal_name: { type: 'string', description: '目标名称' },
          repeat_type: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly', 'flexible'], description: '周期类型' },
          repeat_config: {
            type: 'object',
            description: '周期配置。频次模式: {mode:"count",count:3}; 指定日期: {mode:"specific",days:[1,3,5]}（周一三五=1,3,5; 每月几号=日期数字）'
          }
        },
        required: ['goal_name', 'repeat_type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_groups',
      description: '列出用户所有分组',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_goal_to_group',
      description: '将目标移动到指定分组。如果分组不存在会自动创建。',
      parameters: {
        type: 'object',
        properties: {
          goal_name: { type: 'string', description: '目标名称' },
          group_name: { type: 'string', description: '目标分组名称，如"学习""运动""生活"' }
        },
        required: ['goal_name', 'group_name']
      }
    }
  }
];

const TOOL_MAP = {
  create_goal: actionTools.createGoal,
  check_in: actionTools.checkIn,
  update_goal: actionTools.updateGoal,
  delete_goal: actionTools.deleteGoal,
  get_today_tasks: actionTools.getTodayTasks,
  list_goals: actionTools.listGoals,
  change_schedule: actionTools.changeSchedule,
  list_groups: actionTools.listGroups,
  move_goal_to_group: actionTools.moveGoalToGroup,
};

const DANGEROUS_TOOLS = ['delete_goal'];

const READ_ONLY_TOOLS = ['get_today_tasks', 'list_goals', 'list_groups'];

const TOOL_LABELS = {
  create_goal: '创建目标',
  check_in: '打卡',
  update_goal: '修改目标',
  delete_goal: '删除目标',
  get_today_tasks: '查询今日任务',
  list_goals: '查询目标列表'
};

async function actionAgent(userId, query, contextMessages = []) {
  const tracer = new AgentTracer(userId, 'action', query);
  const messages = [
    { role: 'system', content: ACTION_PROMPT },
    ...contextMessages,
    { role: 'user', content: query }
  ];

  let dataChanged = false;

  for (let i = 0; i < 8; i++) {
    const llmStart = Date.now();
    const response = await llm.chat(messages, { tools: ACTION_TOOLS });
    tracer.logLLMCall(response.usage?.total_tokens || 0, Date.now() - llmStart);

    if (response.tool_calls) {
      messages.push(response);

      // 预处理：解析参数 + 校验
      const validated = [];
      for (const call of response.tool_calls) {
        const parsed = safeParseArgs(call.function.arguments);
        if (!parsed.ok) {
          messages.push({ role: 'tool', content: JSON.stringify({ error: parsed.error }), tool_call_id: call.id });
          continue;
        }
        const validation = validateToolArgs(call.function.name, parsed.args);
        if (!validation.valid) {
          messages.push({ role: 'tool', content: JSON.stringify({ error: validation.message }), tool_call_id: call.id });
          continue;
        }
        validated.push({ call, args: parsed.args });
      }

      // 危险操作拦截
      const dangerous = validated.find(v => DANGEROUS_TOOLS.includes(v.call.function.name));
      if (dangerous) {
        await tracer.save();
        return {
          reply: `我将要删除「${dangerous.args.goal_name}」及其所有打卡记录，确认吗？回复"确认"执行。`,
          data_changed: false,
          pending_action: { tool: dangerous.call.function.name, args: dangerous.args }
        };
      }

      // 读写分离：读操作并行，写操作串行
      const reads = validated.filter(v => READ_ONLY_TOOLS.includes(v.call.function.name));
      const writes = validated.filter(v => !READ_ONLY_TOOLS.includes(v.call.function.name));

      // 并行执行读操作
      if (reads.length > 0) {
        const readResults = await Promise.all(reads.map(async ({ call, args }) => {
          tracer.logToolCall(call.function.name, args);
          const toolStart = Date.now();
          const result = await TOOL_MAP[call.function.name](userId, args);
          tracer.logToolResult(call.function.name, result, Date.now() - toolStart);
          return { call_id: call.id, result };
        }));
        for (const { call_id, result } of readResults) {
          messages.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: call_id });
        }
      }

      // 串行执行写操作
      for (const { call, args } of writes) {
        tracer.logToolCall(call.function.name, args);
        const toolStart = Date.now();
        const result = await TOOL_MAP[call.function.name](userId, args);
        tracer.logToolResult(call.function.name, result, Date.now() - toolStart);
        if (result.success && !result.idempotent) dataChanged = true;
        messages.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: call.id });
      }
    } else {
      await tracer.save();
      return { reply: response.content, data_changed: dataChanged };
    }
  }

  await tracer.save();
  return { reply: '操作超时，请简化请求。', data_changed: dataChanged };
}

async function actionAgentStream(userId, query, onProgress, contextMessages = []) {
  const tracer = new AgentTracer(userId, 'action', query);
  const messages = [
    { role: 'system', content: ACTION_PROMPT },
    ...contextMessages,
    { role: 'user', content: query }
  ];

  let dataChanged = false;

  for (let i = 0; i < 8; i++) {
    const llmStart = Date.now();
    const response = await llm.chat(messages, { tools: ACTION_TOOLS });
    tracer.logLLMCall(response.usage?.total_tokens || 0, Date.now() - llmStart);

    if (response.tool_calls) {
      messages.push(response);

      const validated = [];
      for (const call of response.tool_calls) {
        const parsed = safeParseArgs(call.function.arguments);
        if (!parsed.ok) {
          messages.push({ role: 'tool', content: JSON.stringify({ error: parsed.error }), tool_call_id: call.id });
          continue;
        }
        const validation = validateToolArgs(call.function.name, parsed.args);
        if (!validation.valid) {
          messages.push({ role: 'tool', content: JSON.stringify({ error: validation.message }), tool_call_id: call.id });
          continue;
        }
        validated.push({ call, args: parsed.args });
      }

      const dangerous = validated.find(v => DANGEROUS_TOOLS.includes(v.call.function.name));
      if (dangerous) {
        await tracer.save();
        return {
          reply: `我将要删除「${dangerous.args.goal_name}」及其所有打卡记录，确认吗？回复"确认"执行。`,
          data_changed: false,
          pending_action: { tool: dangerous.call.function.name, args: dangerous.args }
        };
      }

      const reads = validated.filter(v => READ_ONLY_TOOLS.includes(v.call.function.name));
      const writes = validated.filter(v => !READ_ONLY_TOOLS.includes(v.call.function.name));

      if (reads.length > 0) {
        const readResults = await Promise.all(reads.map(async ({ call, args }) => {
          const label = TOOL_LABELS[call.function.name] || call.function.name;
          onProgress({ type: 'tool', content: `正在${label}...` });
          tracer.logToolCall(call.function.name, args);
          const toolStart = Date.now();
          const result = await TOOL_MAP[call.function.name](userId, args);
          tracer.logToolResult(call.function.name, result, Date.now() - toolStart);
          return { call_id: call.id, result };
        }));
        for (const { call_id, result } of readResults) {
          messages.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: call_id });
        }
      }

      for (const { call, args } of writes) {
        const label = TOOL_LABELS[call.function.name] || call.function.name;
        onProgress({ type: 'tool', content: `正在${label}...` });
        tracer.logToolCall(call.function.name, args);
        const toolStart = Date.now();
        const result = await TOOL_MAP[call.function.name](userId, args);
        tracer.logToolResult(call.function.name, result, Date.now() - toolStart);
        if (result.success && !result.idempotent) dataChanged = true;
        messages.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: call.id });
      }
    } else {
      onProgress({ type: 'status', content: '正在组织回复...' });

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
      return { reply: fullReply, data_changed: dataChanged };
    }
  }

  await tracer.save();
  return { reply: '操作超时，请简化请求。', data_changed: dataChanged };
}

module.exports = { actionAgent, actionAgentStream, TOOL_MAP, DANGEROUS_TOOLS };
