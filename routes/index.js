const router = require('koa-router')()

router.get('/', async (ctx, next) => {
  await ctx.render('index', {
    title: 'Gogs Webhook 中转服务',
    description: '接收 Gogs Webhook 事件并转发到钉钉机器人'
  })
})

router.get('/string', async (ctx, next) => {
  ctx.body = 'koa2 string'
})

router.get('/info', async (ctx, next) => {
  ctx.body = {
    service: 'Gogs Webhook 中转服务',
    version: '1.0.0',
    endpoints: {
      webhook: 'POST /webhook/gogs - 接收 Gogs Webhook 事件',
      health: 'GET /webhook/health - 健康检查',
      test: 'POST /webhook/test-dingtalk - 测试钉钉机器人连接',
      testFormats: 'POST /webhook/test-dingtalk-formats - 测试多种消息格式',
      diagnostic: 'GET /webhook/dingtalk-diagnostic - 钉钉机器人配置诊断'
    },
    dingtalk_configured: true,
    troubleshooting: '如果消息发送成功但群里收不到，请检查机器人是否正确添加到群聊'
  }
})

router.post('/', async (ctx, next) => {
  console.log(ctx.request.body)
})

module.exports = router
