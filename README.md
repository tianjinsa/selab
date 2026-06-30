# 校园智能生活服务平台

软件工程课程设计项目，面向校园生活服务场景，包含微信小程序端、管理员后台和 Node.js 后端。当前实现覆盖统一认证、消息通知、私信卡片、任务互助、社区论坛、二手市场、智能体问答和后台管理主流程。

## 项目结构

| 路径 | 说明 |
| --- | --- |
| `weixin/` | 微信小程序端，基于 TDesign MiniProgram。 |
| `web/` | 管理员后台，Vue 3 + Element Plus + Vite。 |
| `server/` | Express API、WebSocket、演示数据仓库和 SQL Server 初始化脚本。 |
| `docs/` | 需求规格与调研说明。 |

## 当前状态

| 模块 | 状态 |
| --- | --- |
| 主系统 | 已完成统一认证、个人资料、五 Tab 导航、通知、私信和卡片消息。 |
| 任务互助 | 已完成发布、浏览、报名、接单确认、模拟托管、交付/结算 API 和后台管理；部分移动端流程仍为简化入口。 |
| 社区论坛 | 已完成发帖、话题、搜索、热门排序、点赞、收藏、评论、关注、分享和后台审核。 |
| 二手市场 | 已完成商品发布、审核、浏览、求购卡片、订单、模拟支付、评价、纠纷和后台仲裁。 |
| 智能体 | 已完成本地知识库问答、来源展示、规则工具调用和会话历史；未接入真实 LLM。 |
| 数据库 | 默认使用 JSON 演示仓库；SQL Server Schema 和初始化脚本已提供。 |

完整需求状态和调研结论见 [requirements-spec.md](docs/requirements-spec.md)。

## 技术栈

- 小程序端：微信小程序 + TDesign MiniProgram。
- 管理后台：Vue 3 + Element Plus + Vite。
- 后端：Node.js + Express + JWT + WebSocket (`ws`)。
- 数据：JSON 演示仓库，SQL Server 建表脚本。

## 快速启动

### 1. 启动后端

```bash
cd server
npm install
npm start
```

后端默认运行在 `http://localhost:8888`。

### 2. 启动管理后台开发服务

```bash
cd web
npm install
npm run dev
```

后台开发服务默认运行在 `http://localhost:5173`。如果要通过后端静态目录访问后台：

```bash
cd web
npm run build
cd ../server
npm start
```

然后打开 `http://localhost:8888/admin/`。

### 3. 运行微信小程序

```bash
cd weixin
npm install
npm run lint
```

使用微信开发者工具导入 `weixin/`，执行“构建 npm”。本地 API 地址在 `weixin/config.js` 中配置：

```js
apiBaseUrl: 'http://localhost:8888/api'
socketUrl: 'ws://localhost:8888/ws'
```

## 演示账号

| 角色 | 账号 | 密码 |
| --- | --- | --- |
| 普通用户 | `20260001` | `123456Aa` |
| 管理员 | `admin` | `123456Aa` |

默认邀请码：`CAMPUS2026`

## 常用命令

```bash
# 重置演示数据
cd server
npm run seed

# 初始化 SQL Server 数据库
cd server
npm run db:init

# 检查 SQL Server 连接
cd server
npm run check:sqlserver

# 构建管理后台
cd web
npm run build

# 检查小程序代码
cd weixin
npm run lint
```

## 核心接口

| 接口 | 说明 |
| --- | --- |
| `GET /api/health` | 健康检查 |
| `POST /api/auth/login` | 登录 |
| `GET /api/tasks` | 任务列表 |
| `GET /api/community/posts` | 社区帖子 |
| `GET /api/market/goods` | 二手商品 |
| `GET /api/messages/conversations` | 私信会话 |
| `POST /api/agent/chat` | 智能体问答 |
| `GET /api/admin/overview` | 管理后台概览 |

## 演示边界

- 当前支付、托管、退款和到账均为模拟实现。
- 小程序正式环境需要 HTTPS/WSS 域名、证书和微信后台域名配置；`localhost` 只适合本地开发演示。
- 智能体为本地知识库和规则工具调用，未接入真实大语言模型或向量检索。
- 性能、并发、准确率和强一致指标尚未通过压测或评测验证。
