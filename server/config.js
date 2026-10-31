// 外部服务配置 - 通过环境变量配置，未设置时使用本地回退方案
module.exports = {
  // Supabase Storage（免费 1GB，仅需邮箱注册，无需银行卡）
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || '',
    enabled: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY && process.env.SUPABASE_BUCKET),
  },
  // 短信服务（阿里云短信）- 不配置则注册无需手机验证
  sms: {
    accessKeyId: process.env.SMS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.SMS_ACCESS_KEY_SECRET || '',
    signName: process.env.SMS_SIGN_NAME || '',
    templateCode: process.env.SMS_TEMPLATE_CODE || '',
    enabled: !!(process.env.SMS_ACCESS_KEY_ID && process.env.SMS_ACCESS_KEY_SECRET),
  },
  // 内容安全审核（阿里云内容安全）- 不配置则使用本地敏感词过滤
  contentCheck: {
    accessKeyId: process.env.CONTENT_CHECK_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.CONTENT_CHECK_ACCESS_KEY_SECRET || '',
    enabled: !!(process.env.CONTENT_CHECK_ACCESS_KEY_ID && process.env.CONTENT_CHECK_ACCESS_KEY_SECRET),
  },
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'campus-wall-secret-key-change-me',
  // 管理员密码
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  // 超级管理员密码（本地兜底，生产环境务必通过环境变量配置）
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || 'super123456',
};
