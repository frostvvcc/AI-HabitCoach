const { pool, initDatabase } = require('./db');

async function main() {
  try {
    console.log('开始初始化数据库...');
    await initDatabase();
    console.log('✅ 数据库初始化完成！');
    process.exit(0);
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    process.exit(1);
  }
}

main();







