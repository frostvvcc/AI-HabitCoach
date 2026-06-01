// server/index.js (Vercel 终极修复版)
console.log('-------------------------------------------');
console.log('1. ▶️  后端程序已启动 (Vercel/MongoDB 稳定版)...');
console.log('-------------------------------------------');

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 引入 db.js
const { User, GoalGroup, Goal, Checkin, connectDB } = require('./db');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production-12345';

// 基础中间件
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// 🛡️ 【核心修复】数据库连接中间件
// Vercel 每次请求可能都是新的实例，所以每个请求进来前，必须确认“门(数据库)”是开着的
app.use(async (req, res, next) => {
  // 只对 API 接口进行数据库检查，静态资源或根路径不管
  if (req.url.startsWith('/api')) {
    try {
      await connectDB();
    } catch (error) {
      console.error('🔥 数据库连接严重错误:', error);
      return res.status(500).json({ error: '服务器正在唤醒数据库，请刷新重试' });
    }
  }
  next();
});

// 日志中间件
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.url}`);
  next();
});

// 根路由
app.get('/', (req, res) => {
  res.send('✅ Checkin APP 后端服务器正在正常运行！(Vercel)');
});

// JWT 验证中间件
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未授权' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.userId };
    next();
  } catch (e) { return res.status(403).json({ error: '令牌无效' }); }
};

// ============ 1. 认证 API (Auth) ============

const verificationCodes = new Map();

// 发送验证码
app.post('/api/auth/send-code', async (req, res) => {
  const { phone } = req.body;
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  verificationCodes.set(phone, { code, expiresAt: Date.now() + 300000 });
  console.log(`📨 [开发模式] 验证码: ${code}`); 
  res.json({ message: '验证码已发送', code, devMode: true });
});

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { phone, password, nickname } = req.body;
    const existingUser = await User.findOne({ phone });
    if (existingUser) return res.status(400).json({ error: '手机号已注册' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ phone, password: hashedPassword, nickname });
    
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ user, token });
  } catch (e) { 
    console.error(e);
    res.status(500).json({ error: '注册失败' }); 
  }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(401).json({ error: '用户不存在' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: '密码错误' });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ user, token });
  } catch (e) { res.status(500).json({ error: '登录失败' }); }
});

// 更新用户信息
app.put('/api/auth/user', authenticateToken, async (req, res) => {
  try {
    const { nickname, avatar } = req.body;
    const updates = {};
    if (nickname) updates.nickname = nickname;
    if (avatar) updates.avatar = JSON.stringify(avatar);

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
    res.json({ user });
  } catch (e) { res.status(500).json({ error: '更新失败' }); }
});

// 修改密码
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(401).json({ error: '旧密码错误' });

    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = newHashedPassword;
    await user.save();

    res.json({ message: '密码修改成功' });
  } catch (e) { res.status(500).json({ error: '修改密码失败' }); }
});

// ============ 2. 分组 API (Groups) ============

// 获取分组
app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    const groups = await GoalGroup.find({ user: req.user.id }).sort({ sort_order: 1, created_at: 1 });
    res.json({ groups });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 创建分组
app.post('/api/groups', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const lastGroup = await GoalGroup.findOne({ user: req.user.id }).sort({ sort_order: -1 });
    const nextOrder = (lastGroup && lastGroup.sort_order) ? lastGroup.sort_order + 1 : 1;
    
    const group = await GoalGroup.create({
      user: req.user.id,
      name,
      sort_order: nextOrder
    });
    res.json({ group });
  } catch (e) { res.status(500).json({ error: '创建分组失败' }); }
});

// 更新分组
app.put('/api/groups/:id', authenticateToken, async (req, res) => {
  try {
    const { name, is_hidden } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (is_hidden !== undefined) updates.is_hidden = is_hidden;

    await GoalGroup.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      updates
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: '更新分组失败' }); }
});

// 分组排序
app.put('/api/groups/reorder/batch', authenticateToken, async (req, res) => {
  try {
    const { sortedGroups } = req.body; 
    if (!Array.isArray(sortedGroups)) return res.status(400).json({ error: 'sortedGroups 必须是数组' });
    
    const promises = sortedGroups.map(item => {
      if (item.id && item.sort_order !== undefined) {
        return GoalGroup.findOneAndUpdate(
          { _id: item.id, user: req.user.id },
          { sort_order: item.sort_order }
        );
      }
    });
    await Promise.all(promises);
    res.json({ success: true });
  } catch (e) { 
    console.error('分组排序失败:', e);
    res.status(500).json({ error: '排序失败' }); 
  }
});

// 删除分组
app.delete('/api/groups/:id', authenticateToken, async (req, res) => {
  try {
    await GoalGroup.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    await Goal.updateMany({ group: req.params.id }, { group: null });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: '删除失败' }); }
});

// ============ 3. 目标 API (Goals) ============

// 获取目标
app.get('/api/goals', authenticateToken, async (req, res) => {
  try {
    const goals = await Goal.find({ user: req.user.id })
      .sort({ is_pinned: -1, sort_order: 1, created_at: -1 });
    
    const formattedGoals = goals.map(g => {
        const obj = g.toObject();
        obj.group_id = obj.group;
        obj.id = obj._id;
        return obj;
    });

    res.json({ goals: formattedGoals });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 创建目标
app.post('/api/goals', authenticateToken, async (req, res) => {
  try {
    const { name, repeatType, repeatConfig, reminderTime, groupId } = req.body;
    
    const query = { user: req.user.id };
    if (groupId) query.group = groupId;
    else query.group = null;

    const lastGoal = await Goal.findOne(query).sort({ sort_order: -1 });
    const nextOrder = (lastGoal && lastGoal.sort_order) ? lastGoal.sort_order + 1 : 1;
    
    const configStr = typeof repeatConfig === 'object' ? JSON.stringify(repeatConfig) : repeatConfig;

    const goal = await Goal.create({
      user: req.user.id,
      name,
      repeat_type: repeatType || 'daily',
      repeat_config: configStr,
      reminder_time: reminderTime || null,
      group: groupId || null,
      sort_order: nextOrder
    });

    const obj = goal.toObject();
    obj.group_id = obj.group;
    obj.id = obj._id;

    res.json({ goal: obj });
  } catch (e) { 
    console.error('创建目标失败:', e);
    res.status(500).json({ error: '创建失败' }); 
  }
});

// 更新目标
app.put('/api/goals/:id', authenticateToken, async (req, res) => {
  try {
    const body = req.body;
    const updates = {};
    
    if (body.name !== undefined) updates.name = body.name;
    if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned;
    if (body.is_hidden !== undefined) updates.is_hidden = body.is_hidden;
    if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
    if (body.group_id !== undefined) updates.group = body.group_id || null;
    if (body.start_date !== undefined) updates.start_date = body.start_date || null;
    if (body.repeat_type !== undefined) updates.repeat_type = body.repeat_type;
    
    if (body.repeat_config !== undefined) {
        updates.repeat_config = typeof body.repeat_config === 'object' ? JSON.stringify(body.repeat_config) : body.repeat_config;
    }
    if (body.reminder_time !== undefined) updates.reminder_time = body.reminder_time || null;

    await Goal.findOneAndUpdate(
        { _id: req.params.id, user: req.user.id },
        updates
    );

    res.json({ message: '更新成功' });
  } catch (e) { 
    console.error('更新失败:', e);
    res.status(500).json({ error: '更新失败' }); 
  }
});

// 目标排序
app.put('/api/goals/reorder/batch', authenticateToken, async (req, res) => {
  try {
    const { sortedGoals } = req.body;
    const promises = sortedGoals.map(item => {
        const updates = { sort_order: item.sort_order };
        if (item.group_id !== undefined) updates.group = item.group_id || null;
        
        return Goal.findOneAndUpdate(
            { _id: item.id, user: req.user.id },
            updates
        );
    });
    await Promise.all(promises);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: '排序失败' }); }
});

// 删除目标
app.delete('/api/goals/:id', authenticateToken, async (req, res) => {
  try {
    await Checkin.deleteMany({ goal: req.params.id });
    await Goal.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    res.json({ message: '删除成功' });
  } catch (e) { res.status(500).json({ error: '删除失败' }); }
});

// ============ 4. 打卡 API (Checkins) ============

// 获取打卡
app.get('/api/checkins', authenticateToken, async (req, res) => {
  try {
    const checkIns = await Checkin.find({ user: req.user.id }).sort({ checkin_date: -1 });
    
    const formatted = checkIns.map(ci => {
        const obj = ci.toObject();
        obj.id = obj._id;
        obj.goal_id = obj.goal;
        const d = new Date(obj.checkin_date);
        const year = d.getFullYear(); 
        const month = String(d.getMonth() + 1).padStart(2, '0'); 
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0'); 
        const minutes = String(d.getMinutes()).padStart(2, '0'); 
        const seconds = String(d.getSeconds()).padStart(2, '0');
        obj.checkin_date = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        return obj;
    });

    res.json({ checkIns: formatted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 创建打卡
app.post('/api/checkins', authenticateToken, async (req, res) => {
  try {
    const { goalId, name, date, note, image } = req.body;
    
    const newCheckin = await Checkin.create({
        user: req.user.id,
        goal: goalId,
        name,
        checkin_date: new Date(date),
        note,
        image,
        is_manual: false
    });

    res.json({ checkIn: { id: newCheckin._id } });
  } catch (e) { res.status(500).json({ error: '打卡失败' }); }
});

// 删除打卡
app.delete('/api/checkins/:id', authenticateToken, async (req, res) => {
  try {
    const result = await Checkin.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!result) return res.status(404).json({ error: '记录不存在' });
    res.json({ message: '删除成功' });
  } catch (e) { res.status(500).json({ error: '删除失败' }); }
});

// 更新打卡
app.put('/api/checkins/:id', authenticateToken, async (req, res) => {
  try {
    const { date, note } = req.body;
    const updates = {};
    if (date) updates.checkin_date = new Date(date);
    if (note !== undefined) updates.note = note;

    await Checkin.findOneAndUpdate(
        { _id: req.params.id, user: req.user.id },
        updates
    );
    res.json({ message: '修改成功' });
  } catch (e) { res.status(500).json({ error: '修改失败' }); }
});

// ============ 5. 高级统计 API (Stats) ============
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const goals = await Goal.find({ user: userId });
    const checkIns = await Checkin.find({ user: userId });

    const goalStats = goals.map(goal => {
      const myCheckIns = checkIns.filter(ci => String(ci.goal) === String(goal._id));
      
      const uniqueDaysSet = new Set();
      const byDate = {}; 
      
      myCheckIns.forEach(ci => {
        const d = new Date(ci.checkin_date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        uniqueDaysSet.add(dateStr);
        byDate[dateStr] = (byDate[dateStr] || 0) + 1;
      });
      const totalDays = uniqueDaysSet.size;

      const sortedDates = Array.from(uniqueDaysSet).sort((a, b) => new Date(b) - new Date(a));
      let currentStreak = 0;
      if (sortedDates.length > 0) {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        
        const lastCheckIn = new Date(sortedDates[0]);
        const diffToLast = (new Date(todayStr) - lastCheckIn) / (1000 * 3600 * 24);
        
        if (diffToLast <= 1) {
          currentStreak = 1;
          let checkDate = new Date(sortedDates[0]);
          for (let i = 1; i < sortedDates.length; i++) {
            const prevDate = new Date(sortedDates[i]);
            const diff = (checkDate - prevDate) / (1000 * 3600 * 24);
            if (diff === 1) {
              currentStreak++;
              checkDate = prevDate;
            } else {
              break;
            }
          }
        }
      }

      return {
        goalId: goal._id,
        goalName: goal.name,
        totalCheckIns: myCheckIns.length, 
        totalDays: totalDays,              
        currentStreak: currentStreak,      
        checkInsByDate: byDate
      };
    });

    res.json({ stats: { goalStats } });
  } catch (e) { 
    console.error(e);
    res.status(500).json({ error: '统计失败' }); 
  }
});

// ============ 启动服务器 ============

// Vercel 需要导出 app
if (require.main === module) {
  // 如果是本地运行 (npm start)，则监听端口
  app.listen(PORT, () => {
    console.log(`🚀 服务器运行在: http://localhost:${PORT}`);
    console.log(`✅ 成功连接到 MongoDB 云数据库!`); 
  });
}

module.exports = app;