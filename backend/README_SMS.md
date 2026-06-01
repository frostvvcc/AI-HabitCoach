# 短信验证码功能已集成

## ✅ 已完成的功能

1. ✅ 集成阿里云短信服务SDK
2. ✅ 验证码生成和存储（5分钟有效期）
3. ✅ 发送频率限制（60秒内只能发送一次）
4. ✅ 开发模式支持（未配置时自动使用模拟发送）

## 📦 安装依赖

请在 `server` 目录下运行：

```bash
cd server
npm install @alicloud/pop-core
```

## ⚙️ 配置短信服务（可选）

### 方式一：使用真实短信服务（推荐生产环境）

1. **获取阿里云AccessKey**
   - 登录 [阿里云控制台](https://ecs.console.aliyun.com/)
   - 访问控制 -> 用户 -> 创建AccessKey
   - 获取 `AccessKey ID` 和 `AccessKey Secret`

2. **开通短信服务**
   - 访问 [阿里云短信服务](https://dysms.console.aliyun.com/)
   - 申请短信签名（如：`打卡助手`）
   - 申请短信模板（验证码类型，包含 `${code}` 变量）

3. **配置环境变量**
   
   在 `server` 目录创建 `.env` 文件：
   ```env
   ALIYUN_ACCESS_KEY_ID=你的AccessKey_ID
   ALIYUN_ACCESS_KEY_SECRET=你的AccessKey_Secret
   ALIYUN_SMS_SIGN_NAME=打卡助手
   ALIYUN_SMS_TEMPLATE_CODE=SMS_123456789
   ```

### 方式二：开发模式（无需配置）

如果不配置阿里云短信服务，系统会自动进入**开发模式**：
- 验证码会在服务器控制台打印
- 前端会收到验证码（方便测试）
- 可以正常测试注册功能

## 🚀 启动服务

```bash
cd server
npm start
```

## 📱 使用说明

1. 在注册页面输入手机号
2. 点击"获取验证码"
3. **如果配置了短信服务**：查看手机短信获取验证码
4. **如果未配置（开发模式）**：查看弹窗或控制台获取验证码
5. 输入验证码完成注册

## ⚠️ 注意事项

- 同一手机号60秒内只能发送一次验证码
- 验证码有效期为5分钟
- 生产环境建议配置真实的短信服务
- 短信费用约0.045元/条

## 🔍 故障排查

如果遇到"发送验证码失败"：
1. 检查后端服务是否运行（`http://localhost:3000`）
2. 检查网络连接
3. 如果配置了阿里云，检查AccessKey是否正确
4. 查看服务器控制台日志







