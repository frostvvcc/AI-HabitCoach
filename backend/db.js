// server/db.js (Vercel 终极修复版)
const mongoose = require('mongoose');

// 你的 MongoDB 连接地址
const DB_URL = "mongodb+srv://frost:Frost411023@checkinappdb.xq9ku7o.mongodb.net/?appName=CheckinAppDB";

// ♻️ 使用全局变量缓存连接
// Vercel 是 Serverless 环境，函数会被冻结/重启，必须缓存连接池，否则会爆连接数
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  // 1. 如果已有连接，直接复用
  if (cached.conn) {
    // console.log('💡 [复用] 使用现有的数据库连接');
    return cached.conn;
  }

  // 2. 如果正在连接中，等待连接完成
  if (!cached.promise) {
    const opts = {
      bufferCommands: false, // 连接没好之前不要缓存命令，直接报错，避免卡死
      serverSelectionTimeoutMS: 15000, // 15秒连不上就报错 (Vercel默认超时是10秒，这里设置长一点但别太长)
      family: 4 // 强制使用 IPv4，解决 Vercel 网络兼容性问题
    };

    console.log('🔄 [新连接] 正在连接 MongoDB...');
    cached.promise = mongoose.connect(DB_URL, opts).then((mongoose) => {
      console.log('✅ 成功连接到 MongoDB 云数据库!');
      return mongoose;
    });
  }

  // 3. 等待连接结果
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null; // 连接失败，清空 promise 以便下次重试
    console.error('❌ 数据库连接失败:', e);
    throw e;
  }

  return cached.conn;
};

// ============ 定义 Schema ============
const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nickname: { type: String, default: '新用户' },
  avatar: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
});

const goalGroupSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  sort_order: { type: Number, default: 0 },
  is_hidden: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

const goalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'GoalGroup', default: null },
  name: { type: String, required: true },
  repeat_type: { type: String, default: 'daily' },
  repeat_config: { type: String, default: '{}' }, // JSON string
  reminder_time: { type: String, default: null },
  start_date: { type: Date, default: Date.now },
  is_pinned: { type: Boolean, default: false },
  is_hidden: { type: Boolean, default: false },
  sort_order: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

const checkinSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  goal: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', required: true },
  name: { type: String }, // snapshot of goal name
  checkin_date: { type: Date, default: Date.now },
  note: { type: String, default: '' },
  image: { type: String, default: '' },
  is_manual: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const GoalGroup = mongoose.model('GoalGroup', goalGroupSchema);
const Goal = mongoose.model('Goal', goalSchema);
const Checkin = mongoose.model('Checkin', checkinSchema);

module.exports = { connectDB, User, GoalGroup, Goal, Checkin };