// 文件路径: server/update_db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'frost411023',
  database: process.env.DB_NAME || 'checkin_app',
};

async function fixDatabase() {
  console.log('🔧 正在连接数据库...');
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('✅ 连接成功，开始检查并修复字段...');

    // 需要添加的字段列表
    const alterations = [
      "ALTER TABLE goals ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE",
      "ALTER TABLE goals ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE",
      "ALTER TABLE goals ADD COLUMN sort_order INT DEFAULT 0"
    ];

    for (const sql of alterations) {
      try {
        await conn.query(sql);
        console.log(`✅ 执行成功: ${sql}`);
      } catch (e) {
        // 如果字段已存在(错误码1060)，则忽略
        if (e.code === 'ER_DUP_FIELDNAME') {
          console.log(`👌 字段已存在，跳过: ${sql}`);
        } else {
          console.error(`❌ 添加字段失败: ${e.message}`);
        }
      }
    }
    console.log('🎉 数据库修复完成！');
  } catch (e) {
    console.error('❌ 数据库连接失败:', e.message);
  } finally {
    if (conn) await conn.end();
  }
}

fixDatabase();