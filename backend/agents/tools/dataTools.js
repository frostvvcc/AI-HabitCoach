const { Goal, Checkin } = require('../../db');
const {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, format
} = require('date-fns');

async function getCompletionRate(userId, { goal_id, period }) {
  const goals = goal_id === 'all'
    ? await Goal.find({ user: userId, is_hidden: false })
    : [await Goal.findOne({ _id: goal_id, user: userId })];

  const results = [];
  const now = new Date();

  for (const goal of goals.filter(Boolean)) {
    let config = {};
    try { config = JSON.parse(goal.repeat_config || '{}'); } catch (e) {}

    let start, end, targetDays;
    if (period === 'week') {
      start = startOfWeek(now, { weekStartsOn: 1 });
      end = endOfWeek(now, { weekStartsOn: 1 });
      targetDays = goal.repeat_type === 'daily' ? 7 : (config.count || config.days?.length || 7);
    } else if (period === 'month') {
      start = startOfMonth(now);
      end = endOfMonth(now);
      targetDays = goal.repeat_type === 'daily' ? end.getDate() : (config.count || config.days?.length || 30);
    } else {
      start = startOfYear(now);
      end = endOfYear(now);
      targetDays = goal.repeat_type === 'daily' ? 365 : (config.count || 365);
    }

    const checkins = await Checkin.find({
      user: userId, goal: goal._id,
      checkin_date: { $gte: start, $lte: end }
    });

    const uniqueDays = new Set(
      checkins.map(c => format(new Date(c.checkin_date), 'yyyy-MM-dd'))
    );

    results.push({
      goal_id: goal._id.toString(),
      goal_name: goal.name,
      period,
      actual: uniqueDays.size,
      target: targetDays,
      rate: targetDays > 0 ? Math.round((uniqueDays.size / targetDays) * 100) / 100 : 0
    });
  }
  return results;
}

async function getStreakData(userId, { goal_id }) {
  const checkins = await Checkin.find({ user: userId, goal: goal_id })
    .sort({ checkin_date: -1 });

  const uniqueDaysSet = new Set();
  checkins.forEach(ci => uniqueDaysSet.add(format(new Date(ci.checkin_date), 'yyyy-MM-dd')));
  const sortedDates = Array.from(uniqueDaysSet).sort((a, b) => new Date(b) - new Date(a));

  let currentStreak = 0;
  if (sortedDates.length > 0) {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const diffToLast = (new Date(todayStr) - new Date(sortedDates[0])) / (1000 * 3600 * 24);
    if (diffToLast <= 1) {
      currentStreak = 1;
      let checkDate = new Date(sortedDates[0]);
      for (let i = 1; i < sortedDates.length; i++) {
        const prevDate = new Date(sortedDates[i]);
        if ((checkDate - prevDate) / (1000 * 3600 * 24) === 1) {
          currentStreak++;
          checkDate = prevDate;
        } else break;
      }
    }
  }

  let longestStreak = sortedDates.length > 0 ? 1 : 0;
  let tempStreak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    if ((new Date(sortedDates[i - 1]) - new Date(sortedDates[i])) / (1000 * 3600 * 24) === 1) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  return {
    current_streak: currentStreak,
    longest_streak: longestStreak,
    total_days: uniqueDaysSet.size,
    last_checkin: sortedDates[0] || null
  };
}

async function detectTimePattern(userId, { goal_id }) {
  const checkins = await Checkin.find({ user: userId, goal: goal_id })
    .sort({ checkin_date: -1 }).limit(60);

  if (checkins.length === 0) {
    return { peak_hour: null, message: '暂无打卡数据' };
  }

  const hourDist = new Array(24).fill(0);
  const weekdayDist = new Array(7).fill(0);
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  checkins.forEach(c => {
    const d = new Date(c.checkin_date);
    hourDist[d.getHours()]++;
    weekdayDist[d.getDay()]++;
  });

  const peakHour = hourDist.indexOf(Math.max(...hourDist));
  const peakDay = weekdayDist.indexOf(Math.max(...weekdayDist));

  const recent7 = checkins.slice(0, 7);
  const prev7 = checkins.slice(7, 14);
  const avgRecent = recent7.length
    ? recent7.reduce((s, c) => s + new Date(c.checkin_date).getHours(), 0) / recent7.length
    : null;
  const avgPrev = prev7.length
    ? prev7.reduce((s, c) => s + new Date(c.checkin_date).getHours(), 0) / prev7.length
    : null;

  let timeShift = null;
  if (avgRecent !== null && avgPrev !== null && Math.abs(avgRecent - avgPrev) > 1) {
    const diff = avgRecent - avgPrev;
    timeShift = {
      direction: diff > 0 ? 'later' : 'earlier',
      hours: Math.round(Math.abs(diff) * 10) / 10,
      description: diff > 0
        ? `最近打卡时间比之前晚了约${Math.round(Math.abs(diff))}小时`
        : `最近打卡时间比之前早了约${Math.round(Math.abs(diff))}小时`
    };
  }

  return {
    peak_hour: peakHour,
    peak_hour_label: `${peakHour}:00`,
    peak_weekday: peakDay,
    peak_weekday_label: dayNames[peakDay],
    time_shift: timeShift,
    pattern: peakHour < 9 ? 'morning' : peakHour < 18 ? 'daytime' : 'night'
  };
}

async function comparePeriods(userId, { goal_id, period1, period2 }) {
  const now = new Date();

  const getRange = (p) => {
    if (p === 'this_week') return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    if (p === 'last_week') {
      const lw = new Date(now);
      lw.setDate(lw.getDate() - 7);
      return { start: startOfWeek(lw, { weekStartsOn: 1 }), end: endOfWeek(lw, { weekStartsOn: 1 }) };
    }
    if (p === 'this_month') return { start: startOfMonth(now), end: endOfMonth(now) };
    if (p === 'last_month') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }
    return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
  };

  const countDays = async (range) => {
    const cks = await Checkin.find({
      user: userId, goal: goal_id,
      checkin_date: { $gte: range.start, $lte: range.end }
    });
    return new Set(cks.map(c => format(new Date(c.checkin_date), 'yyyy-MM-dd'))).size;
  };

  const c1 = await countDays(getRange(period1));
  const c2 = await countDays(getRange(period2));

  return {
    [period1]: c1,
    [period2]: c2,
    change_percent: c2 > 0 ? Math.round(((c1 - c2) / c2) * 100) : null,
    trend: c1 > c2 ? 'improving' : c1 < c2 ? 'declining' : 'stable'
  };
}

async function getRiskGoals(userId) {
  const goals = await Goal.find({ user: userId, is_hidden: false });
  const risks = [];

  for (const goal of goals) {
    const streak = await getStreakData(userId, { goal_id: goal._id });
    const rate = await getCompletionRate(userId, { goal_id: goal._id.toString(), period: 'week' });

    let riskLevel = 'low';
    let reason = '';

    if (streak.current_streak === 0 && streak.longest_streak > 5) {
      riskLevel = 'high';
      reason = `曾连续${streak.longest_streak}天，但已中断`;
    } else if (rate[0] && rate[0].rate < 0.5) {
      riskLevel = 'medium';
      reason = `本周完成率仅${Math.round(rate[0].rate * 100)}%`;
    }

    if (riskLevel !== 'low') {
      risks.push({
        goal_name: goal.name,
        risk_level: riskLevel,
        reason,
        current_streak: streak.current_streak
      });
    }
  }

  return risks.sort((a, b) => (b.risk_level === 'high' ? 1 : 0) - (a.risk_level === 'high' ? 1 : 0));
}

async function findGoalByName(userId, { name }) {
  const goals = await Goal.find({ user: userId, is_hidden: false });
  if (!goals.length) return { success: false, message: '你还没有创建任何目标' };

  const query = name.toLowerCase();

  const exact = goals.find(g => g.name.toLowerCase() === query);
  if (exact) return { success: true, goal_id: exact._id.toString(), goal_name: exact.name };

  const partial = goals.find(g =>
    g.name.toLowerCase().includes(query) || query.includes(g.name.toLowerCase())
  );
  if (partial) return { success: true, goal_id: partial._id.toString(), goal_name: partial.name };

  return {
    success: false,
    message: `没有找到「${name}」，你现有的目标：${goals.map(g => g.name).join('、')}`,
  };
}

module.exports = { getCompletionRate, getStreakData, detectTimePattern, comparePeriods, getRiskGoals, findGoalByName };
