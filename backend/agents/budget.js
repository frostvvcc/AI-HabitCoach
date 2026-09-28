const { Trace } = require('./tracer');

const DAILY_TOKEN_LIMIT = 100000;

async function checkBudget(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayTraces = await Trace.find({
    user: userId,
    created_at: { $gte: today }
  });

  const todayTokens = todayTraces.reduce((sum, t) => sum + (t.total_tokens || 0), 0);

  return {
    used: todayTokens,
    limit: DAILY_TOKEN_LIMIT,
    remaining: Math.max(0, DAILY_TOKEN_LIMIT - todayTokens),
    exceeded: todayTokens >= DAILY_TOKEN_LIMIT
  };
}

module.exports = { checkBudget, DAILY_TOKEN_LIMIT };
