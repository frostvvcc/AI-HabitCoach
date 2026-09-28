import {
  format, getDay, getDate, getMonth, isSameDay,
  isWithinInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, startOfDay, isBefore,
} from 'date-fns';

export function parseGoalConfig(goal) {
  try {
    return goal.repeat_config
      ? (typeof goal.repeat_config === 'string' ? JSON.parse(goal.repeat_config) : goal.repeat_config)
      : {};
  } catch (e) { return {}; }
}

export function isGoalDueOnDate(goal, date) {
  if (goal.is_hidden) return false;
  const config = parseGoalConfig(goal);
  if (goal.repeat_type === 'flexible') return true;
  if (config.mode === 'count') return true;
  if (goal.repeat_type === 'daily') return true;
  try {
    if (goal.repeat_type === 'weekly') return config.days?.includes(getDay(date));
    if (goal.repeat_type === 'monthly') return config.days?.includes(getDate(date));
    if (goal.repeat_type === 'yearly') {
      const m = String(getMonth(date) + 1).padStart(2, '0');
      const d = String(getDate(date)).padStart(2, '0');
      return config.dates?.includes(`${m}-${d}`);
    }
    if (goal.repeat_type === 'custom') {
      return config.dates?.includes(format(date, 'yyyy-MM-dd'));
    }
  } catch (e) { return false; }
  return false;
}

export function getGoalsForDate(goals, date) {
  if (!goals) return [];
  return goals.filter(g => isGoalDueOnDate(g, date));
}

export function getTaskStatusForDate(goal, date, checkIns) {
  const config = parseGoalConfig(goal);
  const targetDateStr = format(date, 'yyyy-MM-dd');
  const isFrequency = config.mode === 'count';
  const isFlexible = goal.repeat_type === 'flexible';

  const isCheckedOnDate = checkIns.some(ci => {
    if (String(ci.goal_id || ci.goalId) !== String(goal.id)) return false;
    const d = typeof ci.checkin_date === 'string' ? ci.checkin_date : format(new Date(ci.checkin_date), 'yyyy-MM-dd');
    return d.startsWith(targetDateStr);
  });

  let progressText = '';
  let isFull = false;

  if (isFrequency) {
    let intervalStart, intervalEnd, periodLabel = '';
    if (goal.repeat_type === 'weekly') {
      intervalStart = startOfWeek(date, { weekStartsOn: 1 });
      intervalEnd = endOfWeek(date, { weekStartsOn: 1 });
      periodLabel = '本周';
    } else if (goal.repeat_type === 'monthly') {
      intervalStart = startOfMonth(date);
      intervalEnd = endOfMonth(date);
      periodLabel = '本月';
    } else if (goal.repeat_type === 'yearly') {
      intervalStart = startOfYear(date);
      intervalEnd = endOfYear(date);
      periodLabel = '本年';
    }
    if (intervalStart && intervalEnd) {
      const count = checkIns.filter(ci => {
        if (String(ci.goal_id || ci.goalId) !== String(goal.id)) return false;
        const d = new Date(ci.checkin_date || ci.date);
        return isWithinInterval(d, { start: intervalStart, end: intervalEnd });
      }).length;
      const target = config.count || 1;
      progressText = `${periodLabel} ${count}/${target}`;
      if (count >= target) isFull = true;
    }
  } else {
    const startW = startOfWeek(date, { weekStartsOn: 1 });
    const endW = endOfWeek(date, { weekStartsOn: 1 });
    const countW = checkIns.filter(ci => {
      if (String(ci.goal_id || ci.goalId) !== String(goal.id)) return false;
      const d = new Date(ci.checkin_date || ci.date);
      return isWithinInterval(d, { start: startW, end: endW });
    }).length;
    if (isFlexible) {
      progressText = `本周 ${countW} 次`;
    } else if (goal.repeat_type === 'daily') {
      progressText = `本周 ${countW}/7`;
    } else {
      progressText = `本周 ${countW} 次`;
    }
  }

  return {
    isCheckedToday: isCheckedOnDate,
    isFull,
    isCompleted: isCheckedOnDate || isFull,
    progressText,
  };
}

export function getSummaryText(goal) {
  const config = parseGoalConfig(goal);
  try {
    if (goal.repeat_type === 'daily') return '每天';
    if (goal.repeat_type === 'flexible') return '自由打卡';
    if (goal.repeat_type === 'weekly') {
      if (config.mode === 'count') return `每周 ${config.count} 次`;
      if (config.days && Array.isArray(config.days)) {
        const dayMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const sorted = [...config.days].sort((a, b) => a - b);
        if (sorted.length === 7) return '每天';
        const text = '每周 ' + sorted.map(d => dayMap[d]).join('、');
        return text.length > 16 ? text.substring(0, 15) + '…' : text;
      }
      return '每周';
    }
    if (goal.repeat_type === 'monthly') {
      if (config.mode === 'count') return `每月 ${config.count} 次`;
      if (config.days && Array.isArray(config.days)) {
        const sorted = [...config.days].sort((a, b) => a - b);
        const text = '每月 ' + sorted.join('、') + '号';
        return text.length > 16 ? text.substring(0, 15) + '…' : text;
      }
      return '每月';
    }
    if (goal.repeat_type === 'yearly') {
      if (config.mode === 'count') return `每年 ${config.count} 次`;
      if (config.dates && Array.isArray(config.dates)) {
        const text = '每年 ' + config.dates.map(d => {
          const [m, day] = d.split('-');
          return `${parseInt(m)}月${parseInt(day)}日`;
        }).join('、');
        return text.length > 16 ? text.substring(0, 15) + '…' : text;
      }
      return '每年';
    }
    if (goal.repeat_type === 'custom') {
      if (config.dates && Array.isArray(config.dates)) return `自定义 (${config.dates.length}天)`;
      return '自定义';
    }
    return '定期';
  } catch (e) { return '定期'; }
}

export function getCheckInTimeForGoal(goal, date, checkIns) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const ci = checkIns.find(c => {
    if (String(c.goal_id || c.goalId) !== String(goal.id)) return false;
    const d = typeof c.checkin_date === 'string' ? c.checkin_date : format(new Date(c.checkin_date), 'yyyy-MM-dd');
    return d.startsWith(dateStr);
  });
  if (!ci) return null;
  try {
    const d = new Date(ci.checkin_date || ci.date);
    return format(d, 'HH:mm');
  } catch (e) { return null; }
}
