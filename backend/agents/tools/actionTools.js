const { Goal, Checkin, GoalGroup } = require('../../db');
const { format, getDay, getDate } = require('date-fns');

async function findGoalByName(userId, goalName) {
  const goals = await Goal.find({ user: userId });
  return goals.find(g =>
    g.name === goalName ||
    g.name.includes(goalName) ||
    goalName.includes(g.name)
  );
}

async function createGoal(userId, { name, repeatType, repeatConfig, reminderTime }) {
  const existing = await Goal.findOne({ user: userId, name });
  if (existing) {
    return { success: true, message: `「${name}」已存在，无需重复创建`, idempotent: true };
  }

  const lastGoal = await Goal.findOne({ user: userId }).sort({ sort_order: -1 });
  await Goal.create({
    user: userId,
    name,
    repeat_type: repeatType || 'daily',
    repeat_config: JSON.stringify(repeatConfig || {}),
    reminder_time: reminderTime || null,
    sort_order: (lastGoal?.sort_order || 0) + 1
  });
  return { success: true, message: `已创建「${name}」`, idempotent: false };
}

async function checkIn(userId, { goal_name, note, date }) {
  const goal = await findGoalByName(userId, goal_name);
  if (!goal) {
    const all = await Goal.find({ user: userId });
    return {
      success: false,
      message: `找不到「${goal_name}」，现有目标：${all.map(g => g.name).join('、')}`
    };
  }

  const targetDate = date || format(new Date(), 'yyyy-MM-dd');
  const existing = await Checkin.findOne({
    user: userId, goal: goal._id,
    checkin_date: {
      $gte: new Date(`${targetDate}T00:00:00`),
      $lt: new Date(`${targetDate}T23:59:59`)
    }
  });

  if (existing) {
    return { success: true, message: `「${goal.name}」今天已打卡`, idempotent: true };
  }

  await Checkin.create({
    user: userId,
    goal: goal._id,
    name: goal.name,
    checkin_date: date ? new Date(date) : new Date(),
    note: note || '',
    is_manual: false
  });
  return { success: true, message: `「${goal.name}」打卡成功`, idempotent: false };
}

async function updateGoal(userId, { goal_name, updates }) {
  const goal = await findGoalByName(userId, goal_name);
  if (!goal) return { success: false, message: `找不到「${goal_name}」` };

  const mongoUpdates = {};
  if (updates.name) mongoUpdates.name = updates.name;
  if (updates.reminder_time !== undefined) mongoUpdates.reminder_time = updates.reminder_time;
  if (updates.repeat_type) mongoUpdates.repeat_type = updates.repeat_type;
  if (updates.repeat_config) mongoUpdates.repeat_config = JSON.stringify(updates.repeat_config);
  if (updates.is_hidden !== undefined) mongoUpdates.is_hidden = updates.is_hidden;
  if (updates.group !== undefined) mongoUpdates.group = updates.group;
  if (updates.group_id !== undefined) mongoUpdates.group = updates.group_id;

  await Goal.findOneAndUpdate({ _id: goal._id, user: userId }, mongoUpdates);
  return { success: true, message: `「${goal.name}」已更新` };
}

async function deleteGoal(userId, { goal_name }) {
  const goal = await findGoalByName(userId, goal_name);
  if (!goal) return { success: false, message: `找不到「${goal_name}」` };

  await Checkin.deleteMany({ goal: goal._id });
  await Goal.findOneAndDelete({ _id: goal._id, user: userId });
  return { success: true, message: `「${goal.name}」已删除` };
}

async function getTodayTasks(userId) {
  const goals = await Goal.find({ user: userId, is_hidden: false });
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const results = [];

  for (const goal of goals) {
    let config = {};
    try { config = JSON.parse(goal.repeat_config || '{}'); } catch (e) {}

    let shouldDoToday = false;
    if (goal.repeat_type === 'daily' || goal.repeat_type === 'flexible') {
      shouldDoToday = true;
    } else if (goal.repeat_type === 'weekly') {
      shouldDoToday = config.mode === 'count' ? true : (config.days?.includes(getDay(today)) || false);
    } else if (goal.repeat_type === 'monthly') {
      shouldDoToday = config.mode === 'count' ? true : (config.days?.includes(getDate(today)) || false);
    }
    if (!shouldDoToday) continue;

    const checked = await Checkin.findOne({
      user: userId, goal: goal._id,
      checkin_date: {
        $gte: new Date(`${todayStr}T00:00:00`),
        $lt: new Date(`${todayStr}T23:59:59`)
      }
    });
    results.push({ goal_name: goal.name, is_done: !!checked });
  }

  return {
    date: todayStr,
    total: results.length,
    done: results.filter(r => r.is_done).length,
    pending: results.filter(r => !r.is_done).length,
    tasks: results
  };
}

async function listGoals(userId) {
  const goals = await Goal.find({ user: userId }).sort({ sort_order: 1 });
  return goals.map(g => ({
    name: g.name,
    repeat_type: g.repeat_type,
    is_hidden: g.is_hidden,
    reminder_time: g.reminder_time
  }));
}

async function changeSchedule(userId, { goal_name, repeat_type, repeat_config }) {
  const goal = await findGoalByName(userId, goal_name);
  if (!goal) {
    const all = await Goal.find({ user: userId });
    return { success: false, message: `找不到「${goal_name}」，现有目标：${all.map(g => g.name).join('、')}` };
  }

  const mongoUpdates = { repeat_type };
  if (repeat_config) mongoUpdates.repeat_config = JSON.stringify(repeat_config);
  else mongoUpdates.repeat_config = '{}';

  await Goal.findOneAndUpdate({ _id: goal._id, user: userId }, mongoUpdates);
  return { success: true, message: `「${goal.name}」的周期已改为 ${repeat_type}`, idempotent: false };
}

async function listGroups(userId) {
  const groups = await GoalGroup.find({ user: userId }).sort({ sort_order: 1 });
  return [
    { id: null, name: '默认分组' },
    ...groups.map(g => ({ id: g._id.toString(), name: g.name }))
  ];
}

async function moveGoalToGroup(userId, { goal_name, group_name }) {
  const goal = await findGoalByName(userId, goal_name);
  if (!goal) {
    const all = await Goal.find({ user: userId });
    return { success: false, message: `找不到「${goal_name}」，现有目标：${all.map(g => g.name).join('、')}` };
  }

  if (group_name === '默认分组' || group_name === '默认' || !group_name) {
    await Goal.findOneAndUpdate({ _id: goal._id, user: userId }, { group: null });
    return { success: true, message: `「${goal.name}」已移到默认分组` };
  }

  let group = await GoalGroup.findOne({ user: userId, name: group_name });
  if (!group) {
    group = await GoalGroup.findOne({ user: userId, name: { $regex: group_name, $options: 'i' } });
  }
  if (!group) {
    group = await GoalGroup.create({ user: userId, name: group_name, sort_order: 0 });
  }

  await Goal.findOneAndUpdate({ _id: goal._id, user: userId }, { group: group._id });
  return { success: true, message: `「${goal.name}」已移到「${group.name}」分组` };
}

module.exports = { createGoal, checkIn, updateGoal, deleteGoal, getTodayTasks, listGoals, listGroups, moveGoalToGroup, changeSchedule };
