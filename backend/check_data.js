// server/check_data.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'frost411023', // 你的密码
  database: process.env.DB_NAME || 'checkin_app',
};

async function check() {
  console.log('🕵️ 正在检查数据库存活情况...');
  try {
    const conn = await mysql.createConnection(dbConfig);
    
    const [users] = await conn.query('SELECT count(*) as count FROM users');
    const [goals] = await conn.query('SELECT count(*) as count FROM goals');
    const [checkins] = await conn.query('SELECT count(*) as count FROM checkins');
    
    console.log('================================');
    console.log(`👤 用户总数: ${users[0].count}`);
    console.log(`🎯 目标总数: ${goals[0].count}`);
    console.log(`📝 打卡记录: ${checkins[0].count}`);
    console.log('================================');
    
    if (users[0].count === 0) {
      console.log('⚠️ 数据库是空的！说明之前的操作可能重置了数据库。');
      console.log('👉 请在 APP 里重新注册账号即可使用。');
    } else {
      console.log('✅ 数据还在！请尝试重新登录找回数据。');
    }
    
    conn.end();
  } catch (e) {
    console.error('❌ 连接失败:', e.message);
  }
}

check();