const llm = require('./llm');
const { analystAgent, analystAgentStream } = require('./analystAgent');
const { actionAgent, actionAgentStream } = require('./actionAgent');
const { loadMemory, saveMemory } = require('./memory');
const { getCache, setCache, invalidateUserCache } = require('./cache');
const { Goal } = require('../db');
const { retrieve, buildRAGContext, indexConversation, indexAllGoalSummaries } = require('./rag');

const ROUTING_PROMPT = `你是一个智能路由器。根据用户消息判断意图，返回 JSON：
{
  "intent": "analysis | action | both",
  "analyst_query": "给分析 Agent 的完整指令（包含你理解到的目标名称等关键信息）",
  "action_query": "给操作 Agent 的完整指令"
}

## 路由规则

### 分析类 → "analysis"
- 问数据/进度/表现："这周表现怎么样""跑步频率如何""喝咖啡坚持得怎样"
- 问建议/原因："为什么坚持不下去""有什么建议""哪些需要注意"
- 生成报告："今日总结""本周周报"
- 闲聊/打招呼/感谢

### 操作类 → "action"
- 打卡："帮我打卡""把跑步打了""今天的都打了"
- 创建/修改/删除目标："建个任务""改提醒时间""删掉XX"
- 查询待办/目标列表："今天做什么""还有哪些没完成""看看今天做了多少""今天完成了几个""我有哪些目标""有什么目标"
- **用户只发了一个目标名称**（如"跑步""读书""冥想"），没有"怎么样""如何"等分析词 → 默认为打卡操作

### 混合类 → "both"
- 又要分析又要操作："读书坚持不下去，帮我调整计划""分析一下然后帮我改频率"

## 关键判断规则

1. **区分"查进度"和"分析表现"**：
   - "今天做了多少""看看完成情况" → action（查待办列表）
   - "这周表现怎么样""频率如何" → analysis（需要数据分析）
2. **只有目标名称，没有其他上下文** → action（打卡）
3. 当你生成 analyst_query 或 action_query 时，**必须把用户提到的目标名称原封不动地传进去**。
   例如用户说"咖啡喝得怎么样"，analyst_query 应该是"分析用户'咖啡'目标的完成情况"，不要丢失关键词。`;

async function fetchUserGoals(userId) {
  try {
    const goals = await Goal.find({ user: userId, is_hidden: false }).select('name repeat_type reminder_time').lean();
    if (goals.length === 0) return '';
    const list = goals.map(g => `「${g.name}」(${g.repeat_type})`).join('、');
    return `用户当前的目标有：${list}`;
  } catch (e) {
    return '';
  }
}

async function coordinatorRoute(userId, userMessage, contextMessages = [], goalsContext = '') {
  const systemMessages = [{ role: 'system', content: ROUTING_PROMPT }];
  if (goalsContext) {
    systemMessages.push({ role: 'system', content: goalsContext });
  }

  const response = await llm.chat([
    ...systemMessages,
    ...contextMessages,
    { role: 'user', content: userMessage }
  ], { response_format: { type: 'json_object' } });

  try {
    return JSON.parse(response.content);
  } catch (e) {
    return { intent: 'analysis', analyst_query: userMessage };
  }
}

async function buildContext(userId, sessionId) {
  const memory = await loadMemory(userId, sessionId);
  const contextMessages = [];
  if (memory.summary) {
    contextMessages.push({ role: 'system', content: `之前的对话摘要：${memory.summary}` });
  }
  contextMessages.push(...memory.messages.slice(-20).map(m => ({ role: m.role, content: m.content })));
  return contextMessages;
}

async function coordinator(userId, userMessage, sessionId) {
  const cached = getCache(userId, userMessage);
  if (cached) {
    console.log('Cache HIT:', userMessage.substring(0, 30));
    return cached;
  }

  const [contextMessages, goalsContext, ragDocs] = await Promise.all([
    buildContext(userId, sessionId),
    fetchUserGoals(userId),
    retrieve(userId, userMessage, 3).catch(() => []),
  ]);

  const plan = await coordinatorRoute(userId, userMessage, contextMessages, goalsContext);

  const ragContext = buildRAGContext(ragDocs);
  const enrichedContext = [
    ...(goalsContext ? [{ role: 'system', content: goalsContext }] : []),
    ...(ragContext ? [{ role: 'system', content: ragContext }] : []),
    ...contextMessages,
  ];

  let result;

  if (plan.intent === 'analysis') {
    const reply = await analystAgent(userId, plan.analyst_query || userMessage, enrichedContext);
    result = { reply, data_changed: false };
  } else if (plan.intent === 'action') {
    result = await actionAgent(userId, plan.action_query || userMessage, enrichedContext);
  } else {
    const analysis = await analystAgent(userId, plan.analyst_query || userMessage, enrichedContext);
    const action = await actionAgent(userId,
      `用户请求：${userMessage}\n分析结果：${analysis}`, enrichedContext);
    result = {
      reply: `${analysis}\n\n---\n\n${action.reply}`,
      data_changed: action.data_changed,
      pending_action: action.pending_action
    };
  }

  const replyText = typeof result === 'string' ? result : result.reply;
  await saveMemory(userId, sessionId, userMessage, replyText);

  // 后台异步：将对话索引到 RAG 向量库（不阻塞响应）
  indexConversation(userId, sessionId, [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: replyText },
  ]).catch(() => {});

  if (!result.data_changed) {
    setCache(userId, userMessage, result);
  } else {
    invalidateUserCache(userId);
    // 数据变更后重新索引目标摘要（后台异步）
    indexAllGoalSummaries(userId).catch(() => {});
  }

  return result;
}

async function coordinatorStream(userId, userMessage, onProgress, sessionId) {
  const [contextMessages, goalsContext, ragDocs] = await Promise.all([
    buildContext(userId, sessionId),
    fetchUserGoals(userId),
    retrieve(userId, userMessage, 3).catch(() => []),
  ]);

  onProgress({ type: 'status', content: '正在思考...' });
  const plan = await coordinatorRoute(userId, userMessage, contextMessages, goalsContext);

  const ragContext = buildRAGContext(ragDocs);
  const enrichedContext = [
    ...(goalsContext ? [{ role: 'system', content: goalsContext }] : []),
    ...(ragContext ? [{ role: 'system', content: ragContext }] : []),
    ...contextMessages,
  ];

  let result;

  if (plan.intent === 'analysis') {
    const reply = await analystAgentStream(userId, plan.analyst_query || userMessage, onProgress, enrichedContext);
    result = { reply, data_changed: false };
  } else if (plan.intent === 'action') {
    result = await actionAgentStream(userId, plan.action_query || userMessage, onProgress, enrichedContext);
  } else {
    const analysis = await analystAgentStream(userId, plan.analyst_query || userMessage, onProgress, enrichedContext);
    onProgress({ type: 'status', content: '正在执行操作...' });
    result = await actionAgentStream(userId,
      `用户请求：${userMessage}\n分析结果：${analysis}`, onProgress, enrichedContext);
    result.reply = `${analysis}\n\n---\n\n${result.reply}`;
  }

  const replyText = typeof result === 'string' ? result : result.reply;
  await saveMemory(userId, sessionId, userMessage, replyText);

  indexConversation(userId, sessionId, [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: replyText },
  ]).catch(() => {});

  if (result.data_changed) {
    invalidateUserCache(userId);
    indexAllGoalSummaries(userId).catch(() => {});
  }

  return result;
}

module.exports = { coordinator, coordinatorStream, coordinatorRoute };
