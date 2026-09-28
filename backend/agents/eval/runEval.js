#!/usr/bin/env node

// 用法:
//   node agents/eval/runEval.js                    # 路由评测（50 条）
//   node agents/eval/runEval.js --e2e              # 端到端评测（含工具命中率）
//   node agents/eval/runEval.js --e2e --verbose    # 端到端详细模式
//   node agents/eval/runEval.js --verbose           # 路由评测详细模式
//   node agents/eval/runEval.js --category checkin  # 只跑某个分类
//   node agents/eval/runEval.js --json              # 输出 JSON 报告

require('dotenv').config();
const { connectDB } = require('../../db');
const { runEval, runE2E } = require('./runner');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const jsonOutput = args.includes('--json');
const e2eMode = args.includes('--e2e');
const categoryIdx = args.indexOf('--category');
const subset = categoryIdx !== -1 ? args[categoryIdx + 1] : null;

(async () => {
  try {
    await connectDB();

    if (e2eMode) {
      const { toolHitRate, results } = await runE2E({ verbose });
      if (jsonOutput) {
        const fs = require('fs');
        const path = `eval_e2e_${new Date().toISOString().split('T')[0]}.json`;
        fs.writeFileSync(path, JSON.stringify({ timestamp: new Date().toISOString(), toolHitRate, results }, null, 2));
        console.log(`\n📄 JSON 报告已保存: ${path}`);
      }
    } else {
      const { metrics, results } = await runEval({ verbose, subset });
      if (jsonOutput) {
        const fs = require('fs');
        const path = `eval_report_${new Date().toISOString().split('T')[0]}.json`;
        fs.writeFileSync(path, JSON.stringify({ timestamp: new Date().toISOString(), metrics, results }, null, 2));
        console.log(`\n📄 JSON 报告已保存: ${path}`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('评测失败:', err);
    process.exit(1);
  }
})();
