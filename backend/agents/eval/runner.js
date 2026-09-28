const { coordinatorRoute } = require('../coordinator');
const { analystAgent } = require('../analystAgent');
const { actionAgent } = require('../actionAgent');
const { EVAL_DATASET } = require('./dataset');
const { Goal, Checkin } = require('../../db');
const mongoose = require('mongoose');

// 路由准确率：intent 判断是否正确
function checkIntentMatch(expected, actual) {
  if (expected === actual) return 'exact';
  if (expected === 'both' && (actual === 'analysis' || actual === 'action')) return 'partial';
  if (actual === 'both' && (expected === 'analysis' || expected === 'action')) return 'partial';
  return 'miss';
}

// 工具命中率：期望的工具是否都出现在实际调用中
function checkToolHit(expectedTools, actualTools) {
  if (expectedTools.length === 0) return actualTools.length === 0 ? 1 : 0.5;
  const hits = expectedTools.filter(t => actualTools.includes(t)).length;
  return hits / expectedTools.length;
}

// 参数准确率：关键参数是否被正确提取到 query 中
function checkParamExtraction(expectedParams, analystQuery, actionQuery) {
  const combined = `${analystQuery || ''} ${actionQuery || ''}`.toLowerCase();
  const keys = Object.entries(expectedParams);
  if (keys.length === 0) return 1;
  const hits = keys.filter(([, val]) => {
    const v = String(val).toLowerCase();
    return combined.includes(v);
  }).length;
  return hits / keys.length;
}

// 从 Tracer 的 steps 中提取实际调用的工具名（去重）
function extractToolNames(steps) {
  const names = new Set();
  (steps || []).forEach(s => {
    if (s.type === 'tool_call' && s.tool_name) names.add(s.tool_name);
  });
  return Array.from(names);
}

// ===== 端到端评测：创建测试数据 + 跑完整 Agent =====

const TEST_USER_ID = new mongoose.Types.ObjectId();

async function setupTestData() {
  const goals = [
    { user: TEST_USER_ID, name: '跑步', repeat_type: 'daily', repeat_config: '{}', sort_order: 1 },
    { user: TEST_USER_ID, name: '读书', repeat_type: 'weekly', repeat_config: '{"mode":"count","count":3}', sort_order: 2 },
    { user: TEST_USER_ID, name: '喝咖啡', repeat_type: 'daily', repeat_config: '{}', sort_order: 3 },
    { user: TEST_USER_ID, name: '冥想', repeat_type: 'daily', repeat_config: '{}', sort_order: 4 },
    { user: TEST_USER_ID, name: '背单词', repeat_type: 'weekly', repeat_config: '{"mode":"specific","days":[1,3,5]}', sort_order: 5 },
    { user: TEST_USER_ID, name: '游泳', repeat_type: 'weekly', repeat_config: '{"mode":"count","count":2}', sort_order: 6 },
  ];
  await Goal.insertMany(goals);
  return goals;
}

async function cleanupTestData() {
  await Goal.deleteMany({ user: TEST_USER_ID });
  await Checkin.deleteMany({ user: TEST_USER_ID });
}

// 端到端用例（挑代表性的，不用全部 50 条）
const E2E_CASES = EVAL_DATASET.filter(d =>
  [1, 2, 6, 11, 13, 16, 19, 20, 24, 33, 37, 48].includes(d.id)
);

async function runE2E(options = {}) {
  const { verbose = false } = options;
  console.log(`\n🔬 端到端评测：${E2E_CASES.length} 条用例（含工具命中率）\n`);

  await setupTestData();
  const userId = TEST_USER_ID.toString();

  let toolHitTotal = 0;
  let toolHitCount = 0;
  const results = [];

  for (const testCase of E2E_CASES) {
    const startTime = Date.now();
    try {
      // 劫持 Tracer.save 来捕获 steps 而不写入数据库
      const { AgentTracer } = require('../tracer');
      let capturedSteps = [];
      const origSave = AgentTracer.prototype.save;
      AgentTracer.prototype.save = async function () {
        capturedSteps = this.steps;
      };

      let actualTools = [];
      const goalsCtx = `用户当前的目标有：「跑步」(daily)、「读书」(weekly)、「喝咖啡」(daily)、「冥想」(daily)、「背单词」(weekly)、「游泳」(weekly)`;

      const plan = await coordinatorRoute(userId, testCase.input || '你好', [], goalsCtx);

      if (plan.intent === 'analysis' || plan.intent === 'both') {
        await analystAgent(userId, plan.analyst_query || testCase.input, []);
        actualTools.push(...extractToolNames(capturedSteps));
        capturedSteps = [];
      }
      if (plan.intent === 'action' || plan.intent === 'both') {
        await actionAgent(userId, plan.action_query || testCase.input, []);
        actualTools.push(...extractToolNames(capturedSteps));
      }

      AgentTracer.prototype.save = origSave;

      actualTools = [...new Set(actualTools)];
      const toolScore = checkToolHit(testCase.expected_tools, actualTools);
      if (testCase.expected_tools.length > 0) {
        toolHitTotal += toolScore;
        toolHitCount++;
      }

      const latency = Date.now() - startTime;
      const icon = toolScore >= 1 ? '✅' : toolScore > 0 ? '🟡' : '❌';

      results.push({
        id: testCase.id,
        input: testCase.input,
        expected_tools: testCase.expected_tools,
        actual_tools: actualTools,
        tool_hit: toolScore,
        latency_ms: latency,
      });

      if (verbose || toolScore < 1) {
        console.log(`${icon} #${testCase.id} "${testCase.input}"`);
        console.log(`   期望工具: [${testCase.expected_tools.join(', ')}]`);
        console.log(`   实际工具: [${actualTools.join(', ')}]`);
        console.log(`   命中率: ${(toolScore * 100).toFixed(0)}% | ${latency}ms`);
      } else {
        process.stdout.write(icon);
      }

      // 清理这轮可能创建的打卡/目标（防止幂等性影响下一轮）
      await Checkin.deleteMany({ user: TEST_USER_ID });
    } catch (err) {
      process.stdout.write('💥');
      results.push({ id: testCase.id, input: testCase.input, error: err.message });
    }
  }

  const toolHitRate = toolHitCount > 0 ? ((toolHitTotal / toolHitCount) * 100).toFixed(1) : 'N/A';

  console.log('\n\n' + '='.repeat(60));
  console.log('📊 端到端评测报告');
  console.log('='.repeat(60));
  console.log(`用例数:          ${E2E_CASES.length}`);
  console.log(`工具命中率:      ${toolHitRate}%`);
  console.log(`平均延迟:        ${Math.round(results.filter(r => r.latency_ms).reduce((s, r) => s + r.latency_ms, 0) / results.length)}ms`);
  console.log('='.repeat(60));

  await cleanupTestData();
  return { toolHitRate, results };
}

// ===== 路由评测（原有） =====

async function runEval(options = {}) {
  const {
    subset = null,
    verbose = false,
    goalsContext = '用户当前的目标有：「跑步」(daily)、「读书」(weekly)、「喝咖啡」(daily)、「冥想」(daily)、「背单词」(weekly)、「游泳」(weekly)',
  } = options;

  let dataset = EVAL_DATASET;
  if (subset) {
    dataset = dataset.filter(d => d.category === subset);
  }

  const results = [];
  let routeCorrect = 0;
  let routePartial = 0;
  let totalParamScore = 0;
  let totalCases = dataset.length;
  const errors = [];

  console.log(`\n🧪 开始评测：${totalCases} 条用例\n`);

  for (const testCase of dataset) {
    const startTime = Date.now();
    try {
      const routeResult = await coordinatorRoute(
        'eval_user',
        testCase.input || '你好',
        [],
        goalsContext
      );

      const latency = Date.now() - startTime;
      const intentMatch = checkIntentMatch(testCase.expected_intent, routeResult.intent);
      const paramScore = checkParamExtraction(
        testCase.expected_params,
        routeResult.analyst_query,
        routeResult.action_query
      );

      if (intentMatch === 'exact') routeCorrect++;
      else if (intentMatch === 'partial') routePartial++;

      totalParamScore += paramScore;

      const result = {
        id: testCase.id,
        input: testCase.input,
        category: testCase.category,
        expected_intent: testCase.expected_intent,
        actual_intent: routeResult.intent,
        intent_match: intentMatch,
        param_score: paramScore,
        latency_ms: latency,
        analyst_query: routeResult.analyst_query,
        action_query: routeResult.action_query,
      };
      results.push(result);

      const icon = intentMatch === 'exact' ? '✅' : intentMatch === 'partial' ? '🟡' : '❌';
      if (verbose || intentMatch === 'miss') {
        console.log(`${icon} #${testCase.id} [${testCase.category}] "${testCase.input}"`);
        console.log(`   期望: ${testCase.expected_intent} → 实际: ${routeResult.intent} | 参数: ${(paramScore * 100).toFixed(0)}% | ${latency}ms`);
        if (intentMatch === 'miss') {
          console.log(`   analyst_query: ${routeResult.analyst_query || '-'}`);
          console.log(`   action_query: ${routeResult.action_query || '-'}`);
        }
      } else {
        process.stdout.write(icon);
      }
    } catch (err) {
      errors.push({ id: testCase.id, input: testCase.input, error: err.message });
      process.stdout.write('💥');
    }
  }

  // 按 category 分组统计
  const categoryStats = {};
  for (const r of results) {
    if (!categoryStats[r.category]) {
      categoryStats[r.category] = { total: 0, correct: 0, partial: 0, paramSum: 0, latencySum: 0 };
    }
    const s = categoryStats[r.category];
    s.total++;
    if (r.intent_match === 'exact') s.correct++;
    else if (r.intent_match === 'partial') s.partial++;
    s.paramSum += r.param_score;
    s.latencySum += r.latency_ms;
  }

  const metrics = {
    total: totalCases,
    route_accuracy: totalCases > 0 ? ((routeCorrect / totalCases) * 100).toFixed(1) : 0,
    route_accuracy_with_partial: totalCases > 0 ? (((routeCorrect + routePartial) / totalCases) * 100).toFixed(1) : 0,
    param_extraction_rate: totalCases > 0 ? ((totalParamScore / totalCases) * 100).toFixed(1) : 0,
    avg_latency_ms: results.length > 0 ? Math.round(results.reduce((s, r) => s + r.latency_ms, 0) / results.length) : 0,
    errors: errors.length,
    by_category: {},
  };

  for (const [cat, s] of Object.entries(categoryStats)) {
    metrics.by_category[cat] = {
      total: s.total,
      accuracy: ((s.correct / s.total) * 100).toFixed(1) + '%',
      param_rate: ((s.paramSum / s.total) * 100).toFixed(1) + '%',
      avg_latency: Math.round(s.latencySum / s.total) + 'ms',
    };
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('📊 评测报告');
  console.log('='.repeat(60));
  console.log(`总用例数:        ${metrics.total}`);
  console.log(`路由准确率:      ${metrics.route_accuracy}%（严格匹配）`);
  console.log(`路由准确率:      ${metrics.route_accuracy_with_partial}%（含部分匹配）`);
  console.log(`参数提取率:      ${metrics.param_extraction_rate}%`);
  console.log(`平均延迟:        ${metrics.avg_latency_ms}ms`);
  console.log(`错误数:          ${metrics.errors}`);
  console.log('\n📂 分类明细:');
  for (const [cat, s] of Object.entries(metrics.by_category)) {
    console.log(`  ${cat.padEnd(20)} 准确率:${s.accuracy.padStart(6)} | 参数:${s.param_rate.padStart(6)} | 延迟:${s.avg_latency.padStart(6)} (${s.total}条)`);
  }
  if (errors.length > 0) {
    console.log('\n💥 错误用例:');
    errors.forEach(e => console.log(`  #${e.id} "${e.input}" → ${e.error}`));
  }
  console.log('='.repeat(60));

  return { metrics, results, errors };
}

module.exports = { runEval, runE2E, checkIntentMatch, checkToolHit, checkParamExtraction };
