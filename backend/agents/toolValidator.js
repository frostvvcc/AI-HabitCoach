// Tool Call 参数校验器：校验 LLM 返回的工具参数是否符合 schema
// 校验失败时返回错误信息，让 Agent 把错误注入 messages 触发 LLM 纠错重试

const TOOL_SCHEMAS = {
  create_goal: {
    required: ['name', 'repeatType'],
    properties: {
      name: { type: 'string', maxLength: 20 },
      repeatType: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom', 'flexible'] },
      repeatConfig: { type: 'object' },
      reminderTime: { type: 'string', pattern: /^\d{2}:\d{2}$/ },
    },
  },
  check_in: {
    required: ['goal_name'],
    properties: {
      goal_name: { type: 'string' },
      note: { type: 'string' },
      date: { type: 'string', pattern: /^\d{4}-\d{2}-\d{2}$/ },
    },
  },
  update_goal: {
    required: ['goal_name', 'updates'],
    properties: {
      goal_name: { type: 'string' },
      updates: { type: 'object' },
    },
  },
  delete_goal: {
    required: ['goal_name'],
    properties: {
      goal_name: { type: 'string' },
    },
  },
  change_schedule: {
    required: ['goal_name', 'repeat_type'],
    properties: {
      goal_name: { type: 'string' },
      repeat_type: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly', 'flexible'] },
      repeat_config: { type: 'object' },
    },
  },
  move_goal_to_group: {
    required: ['goal_name', 'group_name'],
    properties: {
      goal_name: { type: 'string' },
      group_name: { type: 'string' },
    },
  },
  find_goal_by_name: {
    required: ['name'],
    properties: {
      name: { type: 'string' },
    },
  },
  get_completion_rate: {
    required: ['goal_id', 'period'],
    properties: {
      goal_id: { type: 'string' },
      period: { type: 'string', enum: ['week', 'month', 'year'] },
    },
  },
  get_streak_data: {
    required: ['goal_id'],
    properties: {
      goal_id: { type: 'string' },
    },
  },
  detect_time_pattern: {
    required: ['goal_id'],
    properties: {
      goal_id: { type: 'string' },
    },
  },
  compare_periods: {
    required: ['goal_id', 'period1', 'period2'],
    properties: {
      goal_id: { type: 'string' },
      period1: { type: 'string' },
      period2: { type: 'string' },
    },
  },
};

function validateToolArgs(toolName, args) {
  const schema = TOOL_SCHEMAS[toolName];
  if (!schema) return { valid: true };

  const errors = [];

  // 必填字段检查
  for (const field of schema.required || []) {
    if (args[field] === undefined || args[field] === null || args[field] === '') {
      errors.push(`缺少必填参数 "${field}"`);
    }
  }

  // 类型 + 枚举 + 格式检查
  for (const [key, rule] of Object.entries(schema.properties || {})) {
    const val = args[key];
    if (val === undefined) continue;

    if (rule.type === 'string' && typeof val !== 'string') {
      errors.push(`参数 "${key}" 应为字符串，实际为 ${typeof val}`);
    }
    if (rule.type === 'object' && (typeof val !== 'object' || val === null)) {
      errors.push(`参数 "${key}" 应为对象`);
    }
    if (rule.enum && !rule.enum.includes(val)) {
      errors.push(`参数 "${key}" 的值 "${val}" 不在允许范围 [${rule.enum.join(', ')}] 内`);
    }
    if (rule.pattern && typeof val === 'string' && !rule.pattern.test(val)) {
      errors.push(`参数 "${key}" 格式不正确，值为 "${val}"`);
    }
    if (rule.maxLength && typeof val === 'string' && val.length > rule.maxLength) {
      errors.push(`参数 "${key}" 超过最大长度 ${rule.maxLength}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, message: `工具 ${toolName} 参数校验失败: ${errors.join('; ')}` };
  }
  return { valid: true };
}

function safeParseArgs(argsStr) {
  try {
    return { ok: true, args: JSON.parse(argsStr) };
  } catch (e) {
    return { ok: false, args: {}, error: `JSON 解析失败: ${e.message}` };
  }
}

module.exports = { validateToolArgs, safeParseArgs, TOOL_SCHEMAS };
