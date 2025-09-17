const router = require('koa-router')()
const DingTalkRobot = require('dingtalk-robot-sender')
const config = require('../config/webhook-config')
const DingTalkDiagnostic = require('../utils/dingtalk-diagnostic')

router.prefix('/webhook')

// 初始化钉钉机器人
const robot = new DingTalkRobot({
  webhook: config.dingtalk.webhookUrl,
  secret: config.dingtalk.secret || undefined
})

/**
 * 处理 Gogs Webhook 事件
 */
router.post('/gogs', async (ctx, next) => {
  try {
    const payload = ctx.request.body
    
    console.log('=== Gogs Webhook 处理开始 ===')
    console.log('请求头:', JSON.stringify(ctx.headers, null, 2))
    
    // 始终显示完整的 Webhook 数据，用于调试
    console.log('完整 Webhook 数据:', JSON.stringify(payload, null, 2))
    
    if (!config.service.enableVerboseLogging) {
      console.log('收到 Webhook 事件概要:', {
        repository: payload?.repository?.name || 'unknown',
        ref: payload?.ref || 'unknown',
        commits_count: payload?.commits?.length || 0
      })
    }

    // 验证和过滤 Webhook 数据
    console.log('步骤 1: 解析 Webhook 数据...')
    const webhookData = parseGogsWebhook(payload)
    
    if (!webhookData) {
      console.log('✗ 解析失败: 无法解析 Webhook 数据')
      console.log('请检查以上完整数据，并更新解析函数')
      
      // 返回更详细的错误信息
      ctx.body = { 
        success: false, 
        message: '无法解析 Webhook 数据',
        debug_info: {
          received_keys: Object.keys(payload || {}),
          payload_preview: JSON.stringify(payload).substring(0, 200) + '...'
        }
      }
      return
    }
    
    console.log('✓ 解析成功:', {
      repository: webhookData.repository.name,
      branch: webhookData.branch,
      commits: webhookData.commits.length,
      pusher: webhookData.pusher.name
    })
    
    // 应用过滤规则
    console.log('步骤 2: 应用过滤规则...')
    const shouldProcess = shouldProcessWebhook(webhookData)
    
    if (!shouldProcess.process) {
      console.log('✗ Webhook 被过滤:', shouldProcess.reason)
      ctx.body = { 
        success: true, 
        message: `Webhook 被过滤: ${shouldProcess.reason}`,
        filtered: true 
      }
      return
    }
    
    console.log('✓ 过滤检查通过:', shouldProcess.reason)
    
    // 发送消息到钉钉机器人
    console.log('步骤 3: 发送消息到钉钉机器人...')
    const dingTalkResult = await sendToDingTalk(webhookData)
    
    console.log('✓ 消息发送成功:', {
      errcode: dingTalkResult?.errcode || 0,
      errmsg: dingTalkResult?.errmsg || 'OK'
    })
    
    console.log('=== Gogs Webhook 处理完成 ===')
    
    ctx.body = {
      success: true,
      message: '已成功转发到钉钉机器人',
      data: {
        repository: webhookData.repository.name,
        branch: webhookData.branch,
        commits: webhookData.commits.length
      },
      dingtalk_response: {
        errcode: dingTalkResult?.errcode || 0,
        errmsg: dingTalkResult?.errmsg || 'OK'
      }
    }
  } catch (error) {
    console.error('✗ 处理 Webhook 事件失败:', error)
    console.error('错误堆栈:', error.stack)
    ctx.status = 500
    ctx.body = {
      success: false,
      message: '处理失败: ' + error.message,
      error_details: {
        name: error.name,
        message: error.message,
        stack: config.service.enableVerboseLogging ? error.stack : undefined
      }
    }
  }
})

/**
 * 处理 GitHub Webhook 事件
 */
router.post('/github', async (ctx, next) => {
  try {
    const payload = ctx.request.body
    const eventType = ctx.headers['x-github-event']
    const signature = ctx.headers['x-hub-signature-256']
    
    console.log('=== GitHub Webhook 处理开始 ===')
    console.log('请求头:', JSON.stringify({
      'x-github-event': eventType,
      'x-github-delivery': ctx.headers['x-github-delivery'],
      'x-hub-signature-256': signature ? '已设置' : '未设置'
    }, null, 2))
    
    // 始终显示完整的 Webhook 数据，用于调试
    console.log('GitHub Event Type:', eventType)
    console.log('完整 Webhook 数据:', JSON.stringify(payload, null, 2))
    
    if (!config.service.enableVerboseLogging) {
      console.log('收到 GitHub Webhook 事件概要:', {
        event_type: eventType,
        repository: payload?.repository?.name || 'unknown',
        ref: payload?.ref || 'unknown',
        commits_count: payload?.commits?.length || (payload?.head_commit ? 1 : 0)
      })
    }

    // 验证事件类型
    if (!eventType) {
      console.log('✗ 缺少 GitHub 事件类型头')
      ctx.body = { 
        success: false, 
        message: '缺少 X-GitHub-Event 头信息'
      }
      return
    }

    // 验证和过滤 Webhook 数据
    console.log('步骤 1: 解析 GitHub Webhook 数据...')
    const webhookData = parseGitHubWebhook(payload, eventType)
    
    if (!webhookData) {
      console.log('✗ 解析失败: 无法解析 GitHub Webhook 数据')
      console.log('请检查以上完整数据，并更新解析函数')
      
      ctx.body = { 
        success: false, 
        message: `无法解析 GitHub ${eventType} 事件数据`,
        debug_info: {
          event_type: eventType,
          received_keys: Object.keys(payload || {}),
          payload_preview: JSON.stringify(payload).substring(0, 200) + '...'
        }
      }
      return
    }
    
    console.log('✓ 解析成功:', {
      repository: webhookData.repository.name,
      branch: webhookData.branch,
      commits: webhookData.commits.length,
      pusher: webhookData.pusher.name,
      event_type: webhookData.event_type
    })
    
    // 应用过滤规则
    console.log('步骤 2: 应用过滤规则...')
    const shouldProcess = shouldProcessGitHubWebhook(webhookData)
    
    if (!shouldProcess.process) {
      console.log('✗ GitHub Webhook 被过滤:', shouldProcess.reason)
      ctx.body = { 
        success: true, 
        message: `GitHub Webhook 被过滤: ${shouldProcess.reason}`,
        filtered: true 
      }
      return
    }
    
    console.log('✓ 过滤检查通过:', shouldProcess.reason)
    
    // 发送消息到钉钉机器人
    console.log('步骤 3: 发送消息到钉钉机器人...')
    const dingTalkResult = await sendGitHubToDingTalk(webhookData)
    
    console.log('✓ 消息发送成功:', {
      errcode: dingTalkResult?.errcode || 0,
      errmsg: dingTalkResult?.errmsg || 'OK'
    })
    
    console.log('=== GitHub Webhook 处理完成 ===')
    
    ctx.body = {
      success: true,
      message: '已成功转发 GitHub 事件到钉钉机器人',
      data: {
        event_type: webhookData.event_type,
        repository: webhookData.repository.name,
        branch: webhookData.branch,
        commits: webhookData.commits.length
      },
      dingtalk_response: {
        errcode: dingTalkResult?.errcode || 0,
        errmsg: dingTalkResult?.errmsg || 'OK'
      }
    }
  } catch (error) {
    console.error('✗ 处理 GitHub Webhook 事件失败:', error)
    console.error('错误堆栈:', error.stack)
    ctx.status = 500
    ctx.body = {
      success: false,
      message: '处理失败: ' + error.message,
      error_details: {
        name: error.name,
        message: error.message,
        stack: config.service.enableVerboseLogging ? error.stack : undefined
      }
    }
  }
})

/**
 * 判断是否应该处理该 GitHub Webhook
 * @param {Object} webhookData - 格式化后的 GitHub webhook 数据
 * @returns {Object} - { process: boolean, reason: string }
 */
function shouldProcessGitHubWebhook(webhookData) {
  const { filter } = config.gogs  // 复用 gogs 的过滤配置
  const { repository, branch, commits, event_type } = webhookData
  
  // 检查事件类型过滤
  if (!config.gogs.supportedEvents.includes(event_type)) {
    return { process: false, reason: `事件类型 ${event_type} 不在支持列表中` }
  }
  
  // 检查仓库过滤
  if (filter.repositories.length > 0) {
    if (!filter.repositories.includes(repository.full_name)) {
      return { process: false, reason: `仓库 ${repository.full_name} 不在允许列表中` }
    }
  }
  
  // 检查分支过滤（仅对 push 事件）
  if (event_type === 'push' && filter.branches.length > 0) {
    if (!filter.branches.includes(branch)) {
      return { process: false, reason: `分支 ${branch} 不在允许列表中` }
    }
  }
  
  // 检查忽略分支（仅对 push 事件）
  if (event_type === 'push' && filter.ignoreBranches.includes(branch)) {
    return { process: false, reason: `分支 ${branch} 在忽略列表中` }
  }
  
  // 检查提交消息关键词过滤（仅对 push 事件）
  if (event_type === 'push') {
    for (const commit of commits) {
      for (const keyword of filter.ignoreCommitKeywords) {
        if (commit.message.includes(keyword)) {
          return { process: false, reason: `提交消息包含忽略关键词: ${keyword}` }
        }
      }
    }
  }
  
  return { process: true, reason: '通过所有过滤规则' }
}

/**
 * 判断是否应该处理该 Webhook
 * @param {Object} webhookData - 格式化后的 webhook 数据
 * @returns {Object} - { process: boolean, reason: string }
 */
function shouldProcessWebhook(webhookData) {
  const { filter } = config.gogs
  const { repository, branch, commits } = webhookData
  
  // 检查仓库过滤
  if (filter.repositories.length > 0) {
    if (!filter.repositories.includes(repository.full_name)) {
      return { process: false, reason: `仓库 ${repository.full_name} 不在允许列表中` }
    }
  }
  
  // 检查分支过滤
  if (filter.branches.length > 0) {
    if (!filter.branches.includes(branch)) {
      return { process: false, reason: `分支 ${branch} 不在允许列表中` }
    }
  }
  
  // 检查忽略分支
  if (filter.ignoreBranches.includes(branch)) {
    return { process: false, reason: `分支 ${branch} 在忽略列表中` }
  }
  
  // 检查提交消息关键词过滤
  for (const commit of commits) {
    for (const keyword of filter.ignoreCommitKeywords) {
      if (commit.message.includes(keyword)) {
        return { process: false, reason: `提交消息包含忽略关键词: ${keyword}` }
      }
    }
  }
  
  return { process: true, reason: '通过所有过滤规则' }
}
/**
 * 解析 GitHub Webhook 数据
 * @param {Object} payload - GitHub webhook 原始数据
 * @param {string} eventType - GitHub 事件类型
 * @returns {Object|null} - 格式化后的数据
 */
function parseGitHubWebhook(payload, eventType) {
  console.log('开始解析 GitHub Webhook 数据...')
  console.log('事件类型:', eventType)
  console.log('数据类型:', typeof payload)
  console.log('数据键名:', Object.keys(payload || {}))
  
  // 检查基本结构
  if (!payload || typeof payload !== 'object') {
    console.log('✗ 数据为空或格式错误')
    return null
  }

  let repository, pusher, commits = [], ref, compare_url, action
  
  // 解析仓库信息
  repository = payload.repository
  if (!repository || !repository.name) {
    console.log('✗ 缺少必需的仓库信息')
    return null
  }

  // 根据事件类型处理不同数据
  switch (eventType) {
    case 'push':
      console.log('✓ 检测到 GitHub Push 事件')
      pusher = payload.pusher || payload.sender
      commits = payload.commits || []
      ref = payload.ref
      compare_url = payload.compare
      action = 'push'
      
      // 处理删除分支的情况
      if (payload.deleted) {
        action = 'delete'
        commits = [] // 删除分支时没有提交
      }
      // 处理创建分支的情况
      else if (payload.created) {
        action = 'create'
      }
      break
      
    case 'create':
      console.log('✓ 检测到 GitHub Create 事件')
      pusher = payload.sender
      commits = []
      ref = `refs/${payload.ref_type}s/${payload.ref}` // branch 或 tag
      compare_url = repository.html_url
      action = 'create'
      break
      
    case 'delete':
      console.log('✓ 检测到 GitHub Delete 事件')
      pusher = payload.sender
      commits = []
      ref = `refs/${payload.ref_type}s/${payload.ref}`
      compare_url = repository.html_url
      action = 'delete'
      break
      
    case 'pull_request':
      console.log('✓ 检测到 GitHub Pull Request 事件')
      const pr = payload.pull_request
      pusher = payload.sender
      commits = [] // PR 事件不包含提交列表
      ref = pr.head.ref
      compare_url = pr.html_url
      action = payload.action // opened, closed, merged, etc.
      
      // 为 PR 事件添加额外信息
      return {
        event_type: 'pull_request',
        action: action,
        repository: {
          name: repository.name,
          full_name: repository.full_name,
          url: repository.html_url
        },
        pusher: {
          name: pusher?.login || pusher?.name || 'unknown',
          email: pusher?.email || ''
        },
        branch: ref,
        commits: [],
        compare_url: compare_url,
        pull_request: {
          number: pr.number,
          title: pr.title,
          body: pr.body,
          state: pr.state,
          merged: pr.merged,
          base_branch: pr.base.ref,
          head_branch: pr.head.ref
        }
      }
      
    case 'issues':
      console.log('✓ 检测到 GitHub Issues 事件')
      const issue = payload.issue
      pusher = payload.sender
      commits = []
      ref = repository.default_branch
      compare_url = issue.html_url
      action = payload.action
      
      // 为 Issue 事件添加额外信息
      return {
        event_type: 'issues',
        action: action,
        repository: {
          name: repository.name,
          full_name: repository.full_name,
          url: repository.html_url
        },
        pusher: {
          name: pusher?.login || pusher?.name || 'unknown',
          email: pusher?.email || ''
        },
        branch: ref,
        commits: [],
        compare_url: compare_url,
        issue: {
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          assignee: issue.assignee?.login,
          labels: issue.labels?.map(label => label.name) || []
        }
      }
      
    default:
      console.log(`✗ 不支持的事件类型: ${eventType}`)
      return null
  }

  const branch = ref ? ref.replace(/^refs\/(heads|tags)\//, '') : 'unknown'
  
  // 安全处理字段缺失
  const safeRepository = {
    name: repository.name,
    full_name: repository.full_name,
    url: repository.html_url
  }
  
  const safePusher = {
    name: pusher?.login || pusher?.name || 'unknown',
    email: pusher?.email || ''
  }
  
  const safeCommits = (commits || []).map(commit => {
    if (!commit) return null
    return {
      id: commit.id || commit.sha || 'unknown',
      message: commit.message || '无提交消息',
      author: commit.author?.name || commit.committer?.name || safePusher.name,
      url: commit.url || '#',
      timestamp: commit.timestamp || new Date().toISOString()
    }
  }).filter(Boolean)
  
  const result = {
    event_type: eventType,
    action,
    repository: safeRepository,
    pusher: safePusher,
    branch,
    commits: safeCommits,
    compare_url: compare_url || repository.html_url
  }
  
  console.log('✓ GitHub Webhook 解析成功:', {
    event_type: result.event_type,
    action: result.action,
    repository_name: result.repository.name,
    branch: result.branch,
    commits_count: result.commits.length,
    pusher_name: result.pusher.name
  })
  
  return result
}

/**
 * 解析 Gogs Webhook 数据
 * @param {Object} payload - Gogs webhook 原始数据
 * @returns {Object|null} - 格式化后的数据
 */
function parseGogsWebhook(payload) {
  console.log('开始解析 Gogs Webhook 数据...')
  console.log('数据类型:', typeof payload)
  console.log('数据键名:', Object.keys(payload || {}))
  
  // 检查基本结构
  if (!payload || typeof payload !== 'object') {
    console.log('✗ 数据为空或格式错误')
    return null
  }

  // 情况 1: 钉钉 ActionCard 格式（特殊情况）
  if (payload.msgtype === 'actionCard' && payload.actionCard) {
    console.log('✓ 检测到钉钉 ActionCard 格式，解析内容...')
    return parseDingTalkActionCard(payload.actionCard)
  }

  // 尝试不同的数据结构解析
  let repository, pusher, commits = [], ref, compare_url
  
  // 情况 2: 标准 Gogs 格式
  if (payload.repository && payload.repository.name) {
    console.log('✓ 检测到标准 Gogs 格式')
    repository = payload.repository
    pusher = payload.pusher
    commits = payload.commits || []
    ref = payload.ref
    compare_url = payload.compare_url
  }
  // 情况 3: GitHub 兼容格式
  else if (payload.repository && payload.head_commit) {
    console.log('✓ 检测到 GitHub 兼容格式')
    repository = payload.repository
    pusher = payload.pusher || payload.sender
    commits = payload.commits || [payload.head_commit]
    ref = payload.ref
    compare_url = payload.compare
  }
  // 情况 4: 简化格式（字段直接在根层级）
  else if (payload.repo || payload.project) {
    console.log('✓ 检测到简化格式')
    repository = payload.repo || payload.project
    pusher = payload.user || payload.author
    commits = payload.commits || []
    ref = payload.ref || payload.branch
    compare_url = payload.compare_url || payload.url
  }
  // 情况 5: 自定义解析（根据实际数据结构）
  else {
    console.log('✗ 未能识别的数据格式')
    console.log('尝试自动解析...')
    
    // 尝试从不同字段提取信息
    const possibleRepoFields = ['repository', 'repo', 'project', 'target']
    const possiblePusherFields = ['pusher', 'sender', 'user', 'author', 'actor']
    const possibleCommitFields = ['commits', 'changeset', 'changes']
    
    for (const field of possibleRepoFields) {
      if (payload[field] && payload[field].name) {
        repository = payload[field]
        break
      }
    }
    
    for (const field of possiblePusherFields) {
      if (payload[field] && payload[field].name) {
        pusher = payload[field]
        break
      }
    }
    
    for (const field of possibleCommitFields) {
      if (payload[field] && Array.isArray(payload[field])) {
        commits = payload[field]
        break
      }
    }
    
    ref = payload.ref || payload.branch || payload.target_branch
    compare_url = payload.compare_url || payload.compare || payload.url
    
    if (!repository) {
      console.log('✗ 无法解析仓库信息')
      return null
    }
  }

  // 确保必需字段存在
  if (!repository || !repository.name) {
    console.log('✗ 缺少必需的仓库信息')
    return null
  }

  const branch = ref ? ref.replace(/^refs\/heads\//, '') : 'unknown'
  
  // 安全处理字段缺失
  const safeRepository = {
    name: repository.name || 'unknown',
    full_name: repository.full_name || repository.name || 'unknown',
    url: repository.html_url || repository.url || repository.clone_url || '#'
  }
  
  const safePusher = {
    name: pusher?.name || pusher?.login || pusher?.username || 'unknown',
    email: pusher?.email || ''
  }
  
  const safeCommits = (commits || []).map(commit => {
    if (!commit) return null
    return {
      id: commit.id || commit.sha || 'unknown',
      message: commit.message || '无提交消息',
      author: commit.author?.name || commit.committer?.name || safePusher.name,
      url: commit.url || '#',
      timestamp: commit.timestamp || commit.date || new Date().toISOString()
    }
  }).filter(Boolean)
  
  const result = {
    action: 'push',
    repository: safeRepository,
    pusher: safePusher,
    branch,
    commits: safeCommits,
    compare_url: compare_url || '#'
  }
  
  console.log('✓ 解析成功:', {
    repository_name: result.repository.name,
    branch: result.branch,
    commits_count: result.commits.length,
    pusher_name: result.pusher.name
  })
  
  return result
}

/**
 * 解析钉钉 ActionCard 格式的数据
 * @param {Object} actionCard - ActionCard 数据
 * @returns {Object|null} - 格式化后的数据
 */
function parseDingTalkActionCard(actionCard) {
  console.log('解析 ActionCard 内容:', actionCard.text)
  
  const text = actionCard.text || ''
  
  // 使用正则表达式提取信息
  const repoMatch = text.match(/Repo: \*\*\[([^\]]+)\]\(([^)]+)\)\*\*/)
  const refMatch = text.match(/Ref: \*\*\[([^\]]+)\]\([^)]+\)\*\*/)
  const pusherMatch = text.match(/Pusher: \*\*([^*]+)\*\*/)
  const commitsMatch = text.match(/Total (\d+) commits?\(s\)/)
  
  // 提取提交信息
  const commitPattern = /> (\d+)\. \[([^\]]+)\]\(([^)]+)\) ([^-]+) - (.+)/g
  const commits = []
  let commitMatch
  
  while ((commitMatch = commitPattern.exec(text)) !== null) {
    commits.push({
      id: commitMatch[2],
      message: commitMatch[5].trim(),
      author: commitMatch[4].trim(),
      url: commitMatch[3],
      timestamp: new Date().toISOString()
    })
  }
  
  if (!repoMatch) {
    console.log('✗ 无法从 ActionCard 中提取仓库信息')
    return null
  }
  
  const repoName = repoMatch[1]
  const repoUrl = repoMatch[2]
  const branch = refMatch ? refMatch[1] : 'main'
  const pusherName = pusherMatch ? pusherMatch[1] : 'unknown'
  
  const result = {
    action: 'push',
    repository: {
      name: repoName,
      full_name: repoName,
      url: repoUrl
    },
    pusher: {
      name: pusherName,
      email: ''
    },
    branch: branch,
    commits: commits,
    compare_url: actionCard.singleURL || repoUrl
  }
  
  console.log('✓ ActionCard 解析成功:', {
    repository_name: result.repository.name,
    branch: result.branch,
    commits_count: result.commits.length,
    pusher_name: result.pusher.name
  })
  
  return result
}


/**
 * 发送 GitHub 消息到钉钉机器人
 * @param {Object} data - 格式化后的 GitHub webhook 数据
 */
async function sendGitHubToDingTalk(data) {
  console.log('开始构建 GitHub 钉钉消息...')
  
  const { repository, pusher, branch, commits, event_type, action } = data
  const { messageTemplate } = config.dingtalk
  
  let message = ''
  let emoji = ''
  
  // 根据事件类型设置不同的消息格式
  switch (event_type) {
    case 'push':
      if (action === 'delete') {
        emoji = '🗑️'
        message = `## ${messageTemplate.titlePrefix} ${emoji} ${repository.name} 分支被删除\n\n`
        message += `**仓库**: [${repository.full_name}](${repository.url})\n\n`
        message += `**操作者**: ${pusher.name}\n\n`
        message += `**删除分支**: ${branch}\n\n`
      } else if (action === 'create') {
        emoji = '🌱'
        message = `## ${messageTemplate.titlePrefix} ${emoji} ${repository.name} 创建新分支\n\n`
        message += `**仓库**: [${repository.full_name}](${repository.url})\n\n`
        message += `**创建者**: ${pusher.name}\n\n`
        message += `**新分支**: ${branch}\n\n`
      } else {
        emoji = '📦'
        message = `## ${messageTemplate.titlePrefix} ${emoji} ${repository.name} 有新的代码推送\n\n`
        message += `**仓库**: [${repository.full_name}](${repository.url})\n\n`
        message += `**推送者**: ${pusher.name}\n\n`
        message += `**分支**: ${branch}\n\n`
        
        if (messageTemplate.showCommitDetails && commits.length > 0) {
          message += `**提交记录** (${commits.length} 个):\n\n`
          const displayCount = Math.min(commits.length, messageTemplate.maxCommitsDisplay)
          
          for (let i = 0; i < displayCount; i++) {
            const commit = commits[i]
            message += `- [${commit.id.substring(0, 8)}](${commit.url}) ${commit.message} - ${commit.author}\n`
          }
          
          if (commits.length > messageTemplate.maxCommitsDisplay) {
            message += `- ... 还有 ${commits.length - messageTemplate.maxCommitsDisplay} 个提交\n`
          }
        }
      }
      break
      
    case 'create':
      emoji = '✨'
      message = `## ${messageTemplate.titlePrefix} ${emoji} ${repository.name} 创建新分支/标签\n\n`
      message += `**仓库**: [${repository.full_name}](${repository.url})\n\n`
      message += `**创建者**: ${pusher.name}\n\n`
      message += `**名称**: ${branch}\n\n`
      break
      
    case 'delete':
      emoji = '🗑️'
      message = `## ${messageTemplate.titlePrefix} ${emoji} ${repository.name} 删除分支/标签\n\n`
      message += `**仓库**: [${repository.full_name}](${repository.url})\n\n`
      message += `**操作者**: ${pusher.name}\n\n`
      message += `**删除名称**: ${branch}\n\n`
      break
      
    case 'pull_request':
      const pr = data.pull_request
      let prEmoji = ''
      switch (action) {
        case 'opened': prEmoji = '🔄'; break
        case 'closed': prEmoji = pr.merged ? '✅' : '❌'; break
        case 'merged': prEmoji = '✅'; break
        default: prEmoji = '🔄'
      }
      
      message = `## ${messageTemplate.titlePrefix} ${prEmoji} ${repository.name} Pull Request ${action}\n\n`
      message += `**仓库**: [${repository.full_name}](${repository.url})\n\n`
      message += `**操作者**: ${pusher.name}\n\n`
      message += `**PR #${pr.number}**: [${pr.title}](${data.compare_url})\n\n`
      message += `**状态**: ${action}\n\n`
      message += `**分支**: ${pr.head_branch} → ${pr.base_branch}\n\n`
      
      if (pr.body && pr.body.trim()) {
        const bodyPreview = pr.body.substring(0, 200)
        message += `**描述**: ${bodyPreview}${pr.body.length > 200 ? '...' : ''}\n\n`
      }
      break
      
    case 'issues':
      const issue = data.issue
      let issueEmoji = ''
      switch (action) {
        case 'opened': issueEmoji = '🔥'; break
        case 'closed': issueEmoji = '✅'; break
        case 'reopened': issueEmoji = '🔄'; break
        default: issueEmoji = '📝'
      }
      
      message = `## ${messageTemplate.titlePrefix} ${issueEmoji} ${repository.name} Issue ${action}\n\n`
      message += `**仓库**: [${repository.full_name}](${repository.url})\n\n`
      message += `**操作者**: ${pusher.name}\n\n`
      message += `**Issue #${issue.number}**: [${issue.title}](${data.compare_url})\n\n`
      message += `**状态**: ${action}\n\n`
      
      if (issue.assignee) {
        message += `**指派给**: ${issue.assignee}\n\n`
      }
      
      if (issue.labels && issue.labels.length > 0) {
        message += `**标签**: ${issue.labels.join(', ')}\n\n`
      }
      
      if (issue.body && issue.body.trim()) {
        const bodyPreview = issue.body.substring(0, 200)
        message += `**描述**: ${bodyPreview}${issue.body.length > 200 ? '...' : ''}\n\n`
      }
      break
      
    default:
      emoji = '🔔'
      message = `## ${messageTemplate.titlePrefix} ${emoji} ${repository.name} GitHub 事件\n\n`
      message += `**仓库**: [${repository.full_name}](${repository.url})\n\n`
      message += `**操作者**: ${pusher.name}\n\n`
      message += `**事件类型**: ${event_type} (${action})\n\n`
  }
  
  if (data.compare_url && !message.includes(data.compare_url)) {
    message += `\n[查看详情](${data.compare_url})`
  }

  console.log('消息内容预览:', message.substring(0, 200) + '...')
  console.log('消息统计:', {
    事件类型: event_type,
    操作: action,
    总长度: message.length,
    提交数: commits.length
  })

  console.log('发送 GitHub Markdown 消息到钉钉...')
  
  // 发送 Markdown 消息
  const result = await robot.markdown(
    `${repository.name} GitHub 事件通知`, // title
    message, // text
    {
      isAtAll: messageTemplate.isAtAll,
      atMobiles: messageTemplate.atMobiles,
      atUserIds: messageTemplate.atUserIds
    }
  )

  console.log('钉钉机器人响应:', {
    errcode: result.errcode,
    errmsg: result.errmsg,
    success: !result.errcode || result.errcode === 0
  })
  
  if (result.errcode && result.errcode !== 0) {
    console.error('钉钉机器人返回错误:', {
      errcode: result.errcode,
      errmsg: result.errmsg
    })
    throw new Error(`钉钉机器人返回错误 (${result.errcode}): ${result.errmsg}`)
  }
  
  console.log('钉钉 GitHub 消息发送成功✓')
  return result
}

/**
 * 发送消息到钉钉机器人
 * @param {Object} data - 格式化后的 webhook 数据
 */
async function sendToDingTalk(data) {
  console.log('开始构建钉钉消息...')
  
  const { repository, pusher, branch, commits } = data
  const { messageTemplate } = config.dingtalk
  
  // 构建消息内容
  let message = `## ${messageTemplate.titlePrefix} ${repository.name} 有新的代码推送\n\n`
  message += `**仓库**: [${repository.full_name}](${repository.url})\n\n`
  message += `**推送者**: ${pusher.name}\n\n`
  message += `**分支**: ${branch}\n\n`
  
  if (messageTemplate.showCommitDetails && commits.length > 0) {
    message += `**提交记录** (${commits.length} 个):\n\n`
    const displayCount = Math.min(commits.length, messageTemplate.maxCommitsDisplay)
    
    for (let i = 0; i < displayCount; i++) {
      const commit = commits[i]
      message += `- [${commit.id.substring(0, 8)}](${commit.url}) ${commit.message} - ${commit.author}\n`
    }
    
    if (commits.length > messageTemplate.maxCommitsDisplay) {
      message += `- ... 还有 ${commits.length - messageTemplate.maxCommitsDisplay} 个提交\n`
    }
  }
  
  if (data.compare_url) {
    message += `\n[查看完整变更](${data.compare_url})`
  }

  console.log('消息内容预览:', message.substring(0, 200) + '...')
  console.log('消息统计:', {
    总长度: message.length,
    提交数: commits.length,
    显示提交数: Math.min(commits.length, messageTemplate.maxCommitsDisplay)
  })

  console.log('发送 Markdown 消息到钉钉...')
  
  // 发送 Markdown 消息
  const result = await robot.markdown(
    `${repository.name} 代码推送通知`, // title
    message, // text
    {
      isAtAll: messageTemplate.isAtAll,
      atMobiles: messageTemplate.atMobiles,
      atUserIds: messageTemplate.atUserIds
    }
  )

  console.log('钉钉机器人响应:', {
    errcode: result.errcode,
    errmsg: result.errmsg,
    success: !result.errcode || result.errcode === 0
  })
  
  if (result.errcode && result.errcode !== 0) {
    console.error('钉钉机器人返回错误:', {
      errcode: result.errcode,
      errmsg: result.errmsg
    })
    throw new Error(`钉钉机器人返回错误 (${result.errcode}): ${result.errmsg}`)
  }
  
  console.log('钉钉消息发送成功✓')
  return result
}

/**
 * 健康检查接口
 */
router.get('/health', async (ctx, next) => {
  ctx.body = {
    status: 'ok',
    service: config.service.name,
    version: config.service.version,
    message: 'Webhook 服务运行正常',
    timestamp: new Date().toISOString(),
    config: {
      dingtalk_configured: !!config.dingtalk.webhookUrl,
      has_secret: !!config.dingtalk.secret,
      supported_events: config.gogs.supportedEvents,
      supported_platforms: ['Gogs', 'GitHub'],
      endpoints: {
        gogs: '/webhook/gogs',
        github: '/webhook/github',
        test_gogs: '/webhook/test-gogs-webhook',
        test_github: '/webhook/test-github-webhook',
        test_dingtalk: '/webhook/test-dingtalk'
      },
      filter_enabled: {
        branches: config.gogs.filter.branches.length > 0,
        repositories: config.gogs.filter.repositories.length > 0,
        ignore_keywords: config.gogs.filter.ignoreCommitKeywords.length > 0
      }
    }
  }
})

/**
 * 测试钉钉机器人连接
 */
router.post('/test-dingtalk', async (ctx, next) => {
  try {
    console.log('开始测试钉钉机器人连接...')
    console.log('钉钉机器人 URL:', config.dingtalk.webhookUrl)
    console.log('是否配置了签名:', !!config.dingtalk.secret)
    
    // 使用 dingtalk-robot-sender 发送测试消息
    const testMessage = '🤖 测试消息：Webhook 服务连接正常！\n\n时间：' + new Date().toLocaleString('zh-CN')
    
    console.log('发送消息内容:', testMessage)
    const result = await robot.text(testMessage)
    
    console.log('钉钉机器人完整响应:', JSON.stringify({
      errcode: result.errcode,
      errmsg: result.errmsg,
      timestamp: new Date().toISOString()
    }, null, 2))

    // 提取需要的字段，避免循环引用
    const safeResult = {
      errcode: result.errcode || 0,
      errmsg: result.errmsg || 'OK',
      success: !result.errcode || result.errcode === 0
    }

    // 根据钉钉返回的错误码提供具体的错误信息
    let detailedMessage = ''
    if (result.errcode === 310000) {
      detailedMessage = '钉钉机器人签名验证失败，请检查 secret 配置'
    } else if (result.errcode === 300001) {
      detailedMessage = '钉钉机器人 access_token 无效'
    } else if (result.errcode === 300002) {
      detailedMessage = '钉钉机器人已停用'
    } else if (result.errcode === 300003) {
      detailedMessage = '钉钉机器人消息格式错误'
    } else if (result.errcode === 300004) {
      detailedMessage = '钉钉机器人消息内容为空'
    } else if (result.errcode === 300005) {
      detailedMessage = '钉钉机器人消息超出长度限制'
    } else if (safeResult.success) {
      detailedMessage = '消息发送成功！如果群里没收到消息，请检查：\n1. 机器人是否已添加到正确的群\n2. 群成员是否包含机器人\n3. 机器人是否有发送权限'
    }

    ctx.body = {
      success: safeResult.success,
      message: safeResult.success ? '测试消息已发送' : '发送失败',
      detailedMessage,
      response: safeResult,
      debug: {
        hasSecret: !!config.dingtalk.secret,
        urlConfigured: !!config.dingtalk.webhookUrl,
        timestamp: new Date().toISOString()
      }
    }
  } catch (error) {
    console.error('测试钉钉机器人失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      message: '测试失败: ' + error.message,
      error: {
        name: error.name,
        message: error.message,
        stack: config.service.enableVerboseLogging ? error.stack : undefined
      }
    }
  }
})

/**
 * 测试钉钉机器人不同消息类型
 */
router.post('/test-dingtalk-formats', async (ctx, next) => {
  try {
    const testResults = []
    const timestamp = new Date().toLocaleString('zh-CN')
    
    // 测试 1: 简单文本消息
    try {
      console.log('测试 1: 简单文本消息')
      const textResult = await robot.text(`📝 测试文本消息\n时间: ${timestamp}`)
      testResults.push({
        type: '文本消息',
        success: !textResult.errcode || textResult.errcode === 0,
        errcode: textResult.errcode,
        errmsg: textResult.errmsg
      })
    } catch (error) {
      testResults.push({
        type: '文本消息',
        success: false,
        error: error.message
      })
    }
    
    // 测试 2: Markdown 消息
    try {
      console.log('测试 2: Markdown 消息')
      const markdownResult = await robot.markdown(
        'Webhook 服务测试',
        `## 🗨 Markdown 测试

**时间**: ${timestamp}

- 测试项目 1
- 测试项目 2

> 这是一个测试消息`
      )
      testResults.push({
        type: 'Markdown 消息',
        success: !markdownResult.errcode || markdownResult.errcode === 0,
        errcode: markdownResult.errcode,
        errmsg: markdownResult.errmsg
      })
    } catch (error) {
      testResults.push({
        type: 'Markdown 消息',
        success: false,
        error: error.message
      })
    }
    
    // 测试 3: 链接消息
    try {
      console.log('测试 3: 链接消息')
      const linkResult = await robot.link({
        title: 'Webhook 服务测试',
        text: `这是一个链接消息测试\n时间: ${timestamp}`,
        messageUrl: 'https://github.com',
        picUrl: 'https://avatars.githubusercontent.com/u/9919?s=200&v=4'
      })
      testResults.push({
        type: '链接消息',
        success: !linkResult.errcode || linkResult.errcode === 0,
        errcode: linkResult.errcode,
        errmsg: linkResult.errmsg
      })
    } catch (error) {
      testResults.push({
        type: '链接消息',
        success: false,
        error: error.message
      })
    }
    
    const successCount = testResults.filter(r => r.success).length
    
    ctx.body = {
      success: successCount > 0,
      message: `完成 ${testResults.length} 个消息类型测试，成功 ${successCount} 个`,
      results: testResults,
      summary: {
        total: testResults.length,
        success: successCount,
        failed: testResults.length - successCount
      },
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('测试钉钉机器人多格式失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      message: '测试失败: ' + error.message
    }
  }
})

/**
 * 钉钉机器人配置诊断
 */
router.get('/dingtalk-diagnostic', async (ctx, next) => {
  try {
    const diagnostic = DingTalkDiagnostic.diagnose()
    const commonProblems = DingTalkDiagnostic.getCommonProblems()
    
    ctx.body = {
      success: !diagnostic.hasIssues,
      message: diagnostic.hasIssues ? '发现配置问题' : '配置检查通过',
      diagnostic,
      commonProblems,
      recommendations: [
        '如果消息发送成功但群里收不到，请检查机器人是否正确添加到群聊',
        '可以使用 POST /webhook/test-dingtalk-formats 测试不同消息类型',
        '如果仍然有问题，请尝试重新创建钉钉机器人'
      ],
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('诊断失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      message: '诊断失败: ' + error.message
    }
  }
})

/**
 * 测试 GitHub Webhook 处理流程
 */
router.post('/test-github-webhook', async (ctx, next) => {
  try {
    console.log('=== 测试 GitHub Webhook 处理流程 ===')
    
    // 使用模拟的 GitHub Webhook 数据
    const mockPayload = {
      ref: 'refs/heads/main',
      before: '0000000000000000000000000000000000000000',
      after: '1234567890abcdef1234567890abcdef12345678',
      created: false,
      deleted: false,
      forced: false,
      base_ref: null,
      compare: 'https://github.com/testuser/test-repo/compare/main...1234567',
      commits: [
        {
          id: '1234567890abcdef1234567890abcdef12345678',
          tree_id: 'abcdef1234567890abcdef1234567890abcdef12',
          distinct: true,
          message: '测试：添加 GitHub Webhook 功能模块',
          timestamp: new Date().toISOString(),
          url: 'https://github.com/testuser/test-repo/commit/1234567890abcdef1234567890abcdef12345678',
          author: {
            name: '测试用户',
            email: 'test@example.com',
            username: 'testuser'
          },
          committer: {
            name: '测试用户',
            email: 'test@example.com',
            username: 'testuser'
          },
          added: ['src/github-webhook.js'],
          removed: [],
          modified: ['README.md']
        }
      ],
      head_commit: {
        id: '1234567890abcdef1234567890abcdef12345678',
        tree_id: 'abcdef1234567890abcdef1234567890abcdef12',
        distinct: true,
        message: '测试：添加 GitHub Webhook 功能模块',
        timestamp: new Date().toISOString(),
        url: 'https://github.com/testuser/test-repo/commit/1234567890abcdef1234567890abcdef12345678',
        author: {
          name: '测试用户',
          email: 'test@example.com',
          username: 'testuser'
        },
        committer: {
          name: '测试用户',
          email: 'test@example.com',
          username: 'testuser'
        },
        added: ['src/github-webhook.js'],
        removed: [],
        modified: ['README.md']
      },
      repository: {
        id: 123456789,
        node_id: 'MDEwOlJlcG9zaXRvcnkxMjM0NTY3ODk=',
        name: 'test-repo',
        full_name: 'testuser/test-repo',
        private: false,
        html_url: 'https://github.com/testuser/test-repo',
        description: '测试仓库，用于 GitHub Webhook 集成',
        fork: false,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
        pushed_at: new Date().toISOString(),
        clone_url: 'https://github.com/testuser/test-repo.git',
        ssh_url: 'git@github.com:testuser/test-repo.git',
        default_branch: 'main'
      },
      pusher: {
        name: 'testuser',
        email: 'test@example.com'
      },
      sender: {
        login: 'testuser',
        id: 12345,
        node_id: 'MDQ6VXNlcjEyMzQ1',
        avatar_url: 'https://github.com/images/error/testuser_happy.gif',
        gravatar_id: '',
        url: 'https://api.github.com/users/testuser',
        html_url: 'https://github.com/testuser',
        type: 'User',
        site_admin: false
      }
    }
    
    const eventType = 'push'
    
    console.log('使用模拟 GitHub Push 事件数据测试 Webhook 处理...')
    
    // 模拟处理流程
    const webhookData = parseGitHubWebhook(mockPayload, eventType)
    
    if (!webhookData) {
      throw new Error('模拟数据解析失败')
    }
    
    console.log('GitHub 数据解析结果:', {
      event_type: webhookData.event_type,
      action: webhookData.action,
      repository: webhookData.repository.name,
      branch: webhookData.branch,
      commits: webhookData.commits.length,
      pusher: webhookData.pusher.name
    })
    
    // 检查过滤规则
    const shouldProcess = shouldProcessGitHubWebhook(webhookData)
    
    if (!shouldProcess.process) {
      ctx.body = {
        success: false,
        message: `模拟 GitHub 数据被过滤: ${shouldProcess.reason}`,
        filtered: true
      }
      return
    }
    
    // 发送测试消息
    const result = await sendGitHubToDingTalk(webhookData)
    
    console.log('=== GitHub Webhook 测试完成 ===')
    
    ctx.body = {
      success: true,
      message: '模拟 GitHub Webhook 测试成功',
      mockData: {
        event_type: webhookData.event_type,
        action: webhookData.action,
        repository: webhookData.repository.name,
        branch: webhookData.branch,
        commits: webhookData.commits.length
      },
      dingtalk_response: {
        errcode: result?.errcode || 0,
        errmsg: result?.errmsg || 'OK'
      }
    }
  } catch (error) {
    console.error('测试 GitHub Webhook 失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      message: '测试失败: ' + error.message
    }
  }
})

/**
 * 测试 Gogs Webhook 处理流程
 */
router.post('/test-gogs-webhook', async (ctx, next) => {
  try {
    console.log('=== 测试 Gogs Webhook 处理流程 ===')
    
    // 使用模拟的 Gogs Webhook 数据
    const mockPayload = {
      ref: 'refs/heads/master',
      before: '00000000000000000000000000000000',
      after: '1234567890abcdef1234567890abcdef12345678',
      compare_url: 'http://gogs.example.com/user/repo/compare/master',
      commits: [
        {
          id: '1234567890abcdef1234567890abcdef12345678',
          message: '测试：添加新功能模块',
          url: 'http://gogs.example.com/user/repo/commit/1234567890abcdef1234567890abcdef12345678',
          author: {
            name: '测试用户',
            email: 'test@example.com'
          },
          timestamp: new Date().toISOString()
        }
      ],
      repository: {
        id: 123,
        name: 'test-repo',
        full_name: 'testuser/test-repo',
        html_url: 'http://gogs.example.com/testuser/test-repo',
        description: '测试仓库',
        private: false,
        default_branch: 'master'
      },
      pusher: {
        name: '测试用户',
        email: 'test@example.com',
        username: 'testuser'
      }
    }
    
    console.log('使用模拟数据测试 Webhook 处理...')
    
    // 模拟处理流程
    const webhookData = parseGogsWebhook(mockPayload)
    
    if (!webhookData) {
      throw new Error('模拟数据解析失败')
    }
    
    console.log('解析结果:', {
      repository: webhookData.repository.name,
      branch: webhookData.branch,
      commits: webhookData.commits.length,
      pusher: webhookData.pusher.name
    })
    
    // 检查过滤规则
    const shouldProcess = shouldProcessWebhook(webhookData)
    
    if (!shouldProcess.process) {
      ctx.body = {
        success: false,
        message: `模拟数据被过滤: ${shouldProcess.reason}`,
        filtered: true
      }
      return
    }
    
    // 发送测试消息
    const result = await sendToDingTalk(webhookData)
    
    console.log('=== Gogs Webhook 测试完成 ===')
    
    ctx.body = {
      success: true,
      message: '模拟 Gogs Webhook 测试成功',
      mockData: {
        repository: webhookData.repository.name,
        branch: webhookData.branch,
        commits: webhookData.commits.length
      },
      dingtalk_response: {
        errcode: result?.errcode || 0,
        errmsg: result?.errmsg || 'OK'
      }
    }
  } catch (error) {
    console.error('测试 Gogs Webhook 失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      message: '测试失败: ' + error.message
    }
  }
})

module.exports = router