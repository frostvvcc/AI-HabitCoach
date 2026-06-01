# 打卡助手 APP

一个功能完整的移动端打卡应用，支持提醒打卡和记录打卡两种模式，具备日历热力图、统计功能等。

## 功能特性

### 1. 用户系统
- ✅ 手机号一键登录（支持第三方SDK集成）
- ✅ 匿名试用模式（降低使用门槛）

### 2. 打卡核心功能
- ✅ **提醒打卡**：创建打卡目标
  - 输入目标名称
  - 设置重复周期（每天、每周X次）
  - 选择提醒时间（可选）
  - 执行打卡后记录到日历热力图
  
- ✅ **记录打卡**：手动记录打卡
  - 输入打卡名称
  - 设置打卡日期和时间
  - 添加备注（可选）
  - 自动记录到日历热力图

### 3. 主界面功能
- ✅ 一键打卡（记录当天当下时间）
- ✅ 补充文字功能
- ✅ 快速补卡（允许补过去1-3天的记录）
- ✅ 日历热力图（展示打卡连续性）
- ✅ 连续打卡天数显示
- ✅ 月度统计卡片（显示本月打卡率、总次数）

### 4. 其他功能
- ✅ 通知提醒（每日定时提醒）
- ✅ 数据统计（总体统计、月度统计）
- ✅ 本地存储 + 后端API支持

## 技术栈

### 前端
- React Native (Expo)
- React Navigation
- AsyncStorage（本地存储）
- Expo Notifications（通知）
- date-fns（日期处理）

### 后端
- Node.js + Express
- CORS支持
- RESTful API

## 项目结构

```
V/
├── src/
│   ├── components/          # 组件
│   │   └── CalendarHeatmap.js
│   ├── context/             # Context状态管理
│   │   ├── AuthContext.js
│   │   └── CheckInContext.js
│   ├── screens/             # 页面
│   │   ├── LoginScreen.js
│   │   ├── HomeScreen.js
│   │   ├── CheckInScreen.js
│   │   ├── GoalsScreen.js
│   │   ├── StatsScreen.js
│   │   ├── CreateGoalScreen.js
│   │   └── RecordCheckInScreen.js
│   ├── services/            # 服务层
│   │   ├── authService.js
│   │   ├── checkInService.js
│   │   └── notificationService.js
│   └── config.js            # 配置文件
├── server/                  # 后端服务器
│   ├── index.js
│   └── package.json
├── App.js                   # 应用入口
├── package.json
└── app.json                 # Expo配置
```

## 安装和运行

### 1. 安装前端依赖

```bash
npm install
```

### 2. 安装后端依赖

```bash
cd server
npm install
cd ..
```

### 3. 启动后端服务器

```bash
npm run server
# 或
cd server && npm start
```

服务器将在 `http://localhost:3000` 启动

### 4. 启动前端应用

```bash
# iOS
npm run ios

# Android
npm run android

# Web
npm run web
```

## API 端点

### 认证
- `POST /api/auth/phone-login` - 手机号登录
- `POST /api/auth/anonymous-login` - 匿名登录

### 打卡记录
- `GET /api/checkins?userId=xxx` - 获取打卡记录
- `POST /api/checkins` - 创建打卡记录

### 打卡目标
- `GET /api/goals?userId=xxx` - 获取打卡目标
- `POST /api/goals` - 创建打卡目标

### 统计
- `GET /api/stats?userId=xxx` - 获取统计信息

## 使用说明

### 首次使用
1. 打开应用，选择"手机号一键登录"或"匿名试用"
2. 匿名模式下数据仅保存在本地

### 创建打卡目标
1. 进入"目标"页面
2. 点击"+"创建新目标
3. 输入目标名称、设置重复周期和提醒时间
4. 保存后可在"打卡"页面执行打卡

### 一键打卡
1. 在首页点击"一键打卡"按钮
2. 可选择性添加文字备注
3. 打卡后自动记录到日历热力图

### 记录打卡
1. 在首页点击"记录打卡"或进入"打卡"页面
2. 输入打卡名称、选择日期和时间
3. 可添加备注
4. 保存后记录到日历热力图

### 快速补卡
1. 在首页点击"快速补卡"中的"X天前"
2. 自动跳转到记录打卡页面，日期已预设
3. 填写信息后保存

### 查看统计
1. 进入"统计"页面
2. 查看月度统计、总体统计和日历热力图

## 开发说明

### 数据存储
- 应用支持本地存储（AsyncStorage）和远程API两种模式
- 当API不可用时，自动降级到本地存储
- 匿名用户数据仅保存在本地

### 通知权限
- iOS和Android都需要用户授权通知权限
- 通知功能仅在真实设备上可用（模拟器不支持）

### 第三方SDK集成
- 手机号一键登录功能预留了第三方SDK接口
- 可集成极光一键登录、腾讯云等SDK

## 注意事项

1. 后端服务器使用内存存储，重启后数据会丢失（生产环境应使用数据库）
2. 补卡功能限制为最近3天
3. 通知提醒仅支持每日重复（每天模式）
4. 日历热力图显示最近3个月的数据

## 后续优化建议

1. 集成真实数据库（MongoDB/PostgreSQL）
2. 添加用户头像和昵称
3. 支持打卡目标编辑和删除
4. 添加打卡记录编辑功能
5. 支持数据导出
6. 添加社交分享功能
7. 优化日历热力图显示效果
8. 添加更多统计维度

## 许可证

MIT License

