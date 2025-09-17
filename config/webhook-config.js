/**
 * Webhook 服务配置文件
 */

module.exports = {
  // 钉钉机器人配置
  dingtalk: {
    // 钉钉机器人 Webhook URL (必填)
    webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=e752406cc306412cc5dedceadd8987de73505f2729bf0a48b6dfc72d3c1a9b9b',  
    // 钉钉机器人密钥 (如果设置了加签验证，请填入)
    secret: 'SEC6003b953af40d70d503dcdcf55b21ca748da30fc75c5532504ed4adf1cabfc9c', // 留空表示未设置加签
    
    // 消息模板配置
    messageTemplate: {
      // 标题前缀
      titlePrefix: '📦',
      
      // 是否显示提交详情
      showCommitDetails: true,
      
      // 最大显示提交数量
      maxCommitsDisplay: 5,
      
      // 是否@所有人
      isAtAll: false,
      
      // @指定用户的手机号列表
      atMobiles: [],
      
      // @指定用户的userId列表  
      atUserIds: []
    }
  },

  // Gogs/GitHub Webhook 配置
  gogs: {
    // 支持的事件类型
    supportedEvents: ['push', 'create', 'delete', 'pull_request', 'issues'],
    
    // 过滤配置
    filter: {
      // 只处理指定分支的推送 (留空表示处理所有分支)
      branches: [], // 例如: ['master', 'main', 'develop']
      
      // 忽略的分支
      ignoreBranches: [], // 例如: ['temp', 'test']
      
      // 只处理指定仓库 (留空表示处理所有仓库)
      repositories: [], // 例如: ['user/repo1', 'user/repo2']
      
      // 忽略的提交消息关键词
      ignoreCommitKeywords: ['[skip ci]', '[ci skip]', 'WIP:', 'wip:']
    }
  },

  // 服务配置
  service: {
    // 服务名称
    name: 'Gogs/GitHub Webhook 中转服务',
    
    // 服务版本
    version: '1.0.0',
    
    // 默认端口
    port: process.env.PORT || 3000,
    
    // 日志级别
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // 是否启用详细日志
    enableVerboseLogging: process.env.NODE_ENV === 'development'
  },

  // 安全配置
  security: {
    // Webhook 密钥验证 (可选)
    webhookSecret: process.env.WEBHOOK_SECRET || '',
    
    // 允许的IP地址列表 (留空表示允许所有)
    allowedIPs: [], // 例如: ['192.168.1.0/24', '10.0.0.1']
    
    // 请求频率限制 (每分钟)
    rateLimitPerMinute: 60
  }
}