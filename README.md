# Gogs/GitHub Webhook 中转服务

一个基于 Koa2 的轻量级服务，用于接收 Gogs 和 GitHub 的 Webhook 事件并转发到钉钉机器人。

## 功能特性

- 🔄 接收 Gogs 和 GitHub Webhook 事件
- 📱 转发消息到钉钉机器人
- 🎛️ 灵活的配置管理
- 🚫 支持分支、仓库、提交消息过滤
- 🔐 支持钉钉机器人签名验证
- 📊 健康检查和测试接口
- 📝 详细的日志记录
- 🌟 支持多种 GitHub 事件类型（Push、Pull Request、Issues 等）

## 快速开始

### 1. 安装依赖

```bash
npm install
# 或
pnpm install
```

### 2. 配置环境变量

复制环境配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置钉钉机器人信息：

```env
DINGTALK_WEBHOOK_URL=你的钉钉机器人webhook地址
DINGTALK_SECRET=你的钉钉机器人密钥（如果设置了加签）
PORT=3000
```

### 3. 修改配置文件

编辑 `config/webhook-config.js` 文件，根据需要调整配置：

- 钉钉消息模板
- Gogs 事件过滤规则
- 安全设置等

### 4. 启动服务

开发环境：
```bash
npm run dev
```

生产环境：
```bash
npm start
# 或使用 PM2
npm run prd
```

### 5. 配置 Webhook

#### Gogs Webhook

在 Gogs 仓库设置中添加 Webhook：

- URL: `http://你的服务器地址:3000/webhook/gogs`
- Content Type: `application/json`
- Secret: （可选，如果配置了安全验证）
- 触发事件: 选择 `Push events`

#### GitHub Webhook

在 GitHub 仓库设置中添加 Webhook：

1. 进入仓库 Settings → Webhooks → Add webhook
2. 配置参数：
   - **Payload URL**: `http://你的服务器地址:3000/webhook/github`
   - **Content type**: `application/json`
   - **Secret**: （可选，如果需要安全验证）
   - **Which events would you like to trigger this webhook?**
     - 选择 "Let me select individual events"
     - 勾选：`Pushes`、`Pull requests`、`Issues`、`Create`、`Delete`
   - **Active**: 勾选

## API 接口

### Webhook 接口

- `POST /webhook/gogs` - 接收 Gogs Webhook 事件
- `POST /webhook/github` - 接收 GitHub Webhook 事件
- `GET /webhook/health` - 健康检查
- `POST /webhook/test-dingtalk` - 测试钉钉机器人连接
- `POST /webhook/test-gogs-webhook` - 测试 Gogs Webhook 处理流程
- `POST /webhook/test-github-webhook` - 测试 GitHub Webhook 处理流程
- `POST /webhook/test-dingtalk-formats` - 测试钉钉机器人不同消息格式
- `GET /webhook/dingtalk-diagnostic` - 钉钉机器人配置诊断

### 其他接口

- `GET /` - 服务主页
- `GET /info` - 获取服务信息

## 配置说明

### 钉钉机器人配置

```javascript
dingtalk: {
  webhookUrl: '钉钉机器人 Webhook URL',
  secret: '密钥（可选）',
  messageTemplate: {
    titlePrefix: '📦',
    showCommitDetails: true,
    maxCommitsDisplay: 5,
    isAtAll: false,
    atMobiles: [],
    atUserIds: []
  }
}
```

### 事件过滤配置

```javascript
filter: {
  branches: [],           // 只处理指定分支
  ignoreBranches: [],     // 忽略指定分支
  repositories: [],       // 只处理指定仓库
  ignoreCommitKeywords: ['[skip ci]', '[ci skip]'] // 忽略包含关键词的提交
}
```

### 支持的事件类型

**Gogs 事件**：
- `push` - 代码推送
- `create` - 创建分支/标签
- `delete` - 删除分支/标签

**GitHub 事件**：
- `push` - 代码推送（包括创建/删除分支）
- `create` - 创建分支/标签
- `delete` - 删除分支/标签
- `pull_request` - Pull Request 事件（opened, closed, merged 等）
- `issues` - Issues 事件（opened, closed, reopened 等）

## 消息格式

钉钉机器人会收到不同类型的消息：

### Push 事件消息

```markdown
## 📦 仓库名 有新的代码推送

**仓库**: [user/repo](http://github.com/user/repo)
**推送者**: 用户名
**分支**: main

**提交记录** (2 个):
- [12345678](http://link) 提交消息 - 作者
- [87654321](http://link) 另一个提交 - 作者

[查看完整变更](http://compare-url)
```

### Pull Request 事件消息

```markdown
## 📦 🔄 仓库名 Pull Request opened

**仓库**: [user/repo](http://github.com/user/repo)
**操作者**: 用户名
**PR #123**: [添加新功能](http://pr-url)
**状态**: opened
**分支**: feature-branch → main

**描述**: 这是一个新功能的实现...
```

### Issues 事件消息

```markdown
## 📦 🔥 仓库名 Issue opened

**仓库**: [user/repo](http://github.com/user/repo)
**操作者**: 用户名
**Issue #456**: [修复 Bug](http://issue-url)
**状态**: opened
**指派给**: developer
**标签**: bug, high-priority

**描述**: 发现了一个重要问题...
```

## 开发

### 项目结构

```
├── config/
│   └── webhook-config.js    # 主配置文件
├── routes/
│   ├── index.js            # 主页路由
│   ├── users.js            # 用户路由
│   └── webhook.js          # Webhook 路由
├── views/                  # 页面模板
├── public/                 # 静态资源
├── app.js                  # 应用入口
└── package.json
```

### 添加新功能

1. 修改 `config/webhook-config.js` 添加新配置
2. 在 `routes/webhook.js` 中添加新的路由处理
3. 更新消息格式化逻辑

## 部署

### 使用 PM2

```bash
npm install -g pm2
npm run prd
```

### 使用 Docker

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 常见问题

### 1. 钉钉机器人返回签名错误

确保在配置文件中正确设置了 `secret`，并且钉钉机器人开启了加签验证。

### 2. Webhook 接收不到事件

- 棆查 Gogs/GitHub 中 Webhook URL 是否正确
- 确保服务正在运行且端口可访问
- 查看服务日志确认是否有错误
- 使用测试接口验证：
  - `POST /webhook/test-gogs-webhook` - 测试 Gogs
  - `POST /webhook/test-github-webhook` - 测试 GitHub

### 3. 消息不显示提交详情

检查 `config/webhook-config.js` 中的 `showCommitDetails` 是否为 `true`。

### 4. GitHub 事件不生效

- 确保 GitHub Webhook 配置中选择了正确的事件类型
- 检查 `config/webhook-config.js` 中的 `supportedEvents` 配置
- 查看 GitHub Webhook 的 Delivery 历史确认请求是否成功

### 5. Pull Request 或 Issues 消息格式问题

这些事件类型使用专门的消息模板，不受 `showCommitDetails` 设置影响。

## 许可证

MIT License



