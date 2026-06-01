/**
 * 短信服务模块
 * 支持阿里云短信服务
 */

let Core = null;
try {
  Core = require('@alicloud/pop-core');
} catch (error) {
  console.log('⚠️  @alicloud/pop-core 未安装，将使用开发模式（模拟发送）');
  console.log('   如需使用真实短信服务，请运行: npm install @alicloud/pop-core');
}

// 阿里云短信配置
const SMS_CONFIG = {
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
  signName: process.env.ALIYUN_SMS_SIGN_NAME || '打卡助手',
  templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE || 'SMS_123456789',
  endpoint: 'https://dysmsapi.aliyuncs.com',
  apiVersion: '2017-05-25',
};

// 创建阿里云客户端
let smsClient = null;
if (Core && SMS_CONFIG.accessKeyId && SMS_CONFIG.accessKeySecret) {
  try {
    smsClient = new Core({
      accessKeyId: SMS_CONFIG.accessKeyId,
      accessKeySecret: SMS_CONFIG.accessKeySecret,
      endpoint: SMS_CONFIG.endpoint,
      apiVersion: SMS_CONFIG.apiVersion,
    });
  } catch (error) {
    console.error('创建阿里云客户端失败:', error);
  }
}

/**
 * 发送短信验证码
 * @param {string} phone - 手机号
 * @param {string} code - 验证码
 * @returns {Promise<boolean>} 是否发送成功
 */
async function sendSMS(phone, code) {
  // 如果没有配置阿里云密钥，使用模拟发送（开发环境）
  if (!smsClient) {
    console.log(`📱 [模拟发送] 验证码发送到 ${phone}: ${code}`);
    console.log('⚠️  提示: 请配置阿里云短信服务以启用真实发送功能');
    console.log('   环境变量: ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET');
    return true; // 开发环境模拟成功
  }

  try {
    const params = {
      PhoneNumbers: phone,
      SignName: SMS_CONFIG.signName,
      TemplateCode: SMS_CONFIG.templateCode,
      TemplateParam: JSON.stringify({ code }),
    };

    const requestOption = {
      method: 'POST',
    };

    const result = await smsClient.request('SendSms', params, requestOption);
    
    if (result.Code === 'OK') {
      console.log(`✅ 验证码已发送到 ${phone}`);
      return true;
    } else {
      console.error('❌ 短信发送失败:', result.Message);
      throw new Error(result.Message || '短信发送失败');
    }
  } catch (error) {
    console.error('发送短信异常:', error);
    throw error;
  }
}

/**
 * 检查短信服务是否已配置
 * @returns {boolean}
 */
function isSMSConfigured() {
  return !!(SMS_CONFIG.accessKeyId && SMS_CONFIG.accessKeySecret);
}

module.exports = {
  sendSMS,
  isSMSConfigured,
};

