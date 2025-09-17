/**
 * 钉钉机器人诊断工具
 * 帮助排查钉钉机器人消息发送问题
 */

const config = require('../config/webhook-config')

class DingTalkDiagnostic {
  static diagnose() {
    const issues = []
    const suggestions = []

    // 检查 URL 格式
    const webhookUrl = config.dingtalk.webhookUrl
    if (!webhookUrl) {
      issues.push('钉钉机器人 Webhook URL 未配置')
      suggestions.push('请在 config/webhook-config.js 中配置 dingtalk.webhookUrl')
    } else {
      // 检查 URL 格式
      if (!webhookUrl.startsWith('https://oapi.dingtalk.com/robot/send?access_token=')) {
        issues.push('钉钉机器人 URL 格式不正确')
        suggestions.push('URL 应该以 https://oapi.dingtalk.com/robot/send?access_token= 开头')
      }
      
      // 检查 access_token 长度
      const tokenMatch = webhookUrl.match(/access_token=([^&]+)/)
      if (tokenMatch) {
        const token = tokenMatch[1]
        if (token.length !== 64) {
          issues.push(`access_token 长度异常 (当前: ${token.length}, 期望: 64)`)
          suggestions.push('请检查 access_token 是否完整复制')
        }
      } else {
        issues.push('无法从 URL 中提取 access_token')
        suggestions.push('请确保 URL 包含有效的 access_token 参数')
      }
    }

    // 检查签名配置
    const secret = config.dingtalk.secret
    if (secret && secret.trim() !== '') {
      if (secret.length !== 43) {
        issues.push(`钉钉机器人签名密钥长度异常 (当前: ${secret.length}, 期望: 43)`)
        suggestions.push('请检查签名密钥是否完整复制')
      }
    }

    return {
      hasIssues: issues.length > 0,
      issues,
      suggestions,
      config: {
        hasUrl: !!webhookUrl,
        hasSecret: !!secret && secret.trim() !== '',
        urlPreview: webhookUrl ? `${webhookUrl.substring(0, 50)}...` : 'null'
      }
    }
  }

  static getCommonProblems() {
    return [
      {
        problem: '机器人消息发送成功但群里收不到',
        possibleCauses: [
          '机器人未添加到目标群聊',
          '机器人被群主或管理员移除',
          '群聊已解散或机器人失效',
          '机器人权限被限制'
        ],
        solutions: [
          '确认机器人已正确添加到群聊',
          '检查群成员列表中是否包含机器人',
          '尝试在群里@机器人看是否有响应',
          '重新创建机器人并更新 access_token'
        ]
      },
      {
        problem: '返回签名验证失败 (errcode: 310000)',
        possibleCauses: [
          '签名密钥配置错误',
          '签名算法实现有误',
          '时间戳不同步'
        ],
        solutions: [
          '检查 config.dingtalk.secret 配置',
          '确保签名密钥从钉钉后台正确复制',
          '如果不需要签名验证，可以关闭加签功能'
        ]
      },
      {
        problem: 'access_token 无效 (errcode: 300001)',
        possibleCauses: [
          'access_token 错误或已过期',
          '机器人被删除',
          'URL 格式错误'
        ],
        solutions: [
          '检查 access_token 是否正确',
          '重新生成机器人并获取新的 access_token',
          '确认 Webhook URL 格式正确'
        ]
      }
    ]
  }
}

module.exports = DingTalkDiagnostic