# AGENTS.md

## 项目概览

本项目是软件工程课程设计“校园智能生活服务平台”。系统面向校园生活场景，提供统一认证、消息通知、私信卡片、任务互助、社区论坛、二手市场、智能体问答和管理员后台。

当前项目用于课程验收和本地演示，不按生产系统承诺真实支付、真实微信登录、智能体回答准确率、万级并发或资金强一致结算。

## 代码结构

| 路径 | 说明 |
| --- | --- |
| `server/` | Node.js + Express 后端，包含 REST API、WebSocket 私信、JSON 演示数据仓库和 SQL Server 初始化脚本。 |
| `web/` | Vue 3 + Element Plus 管理员后台，生产构建输出到 `server/public`。 |
| `weixin/` | 微信小程序端，基于 TDesign MiniProgram，包含五个主 Tab 和聊天、发布、详情、个人中心等页面。 |
| `docs/` | 当前需求规格与调研说明，主文档为 `docs/requirements-spec.md`。 |

## 核心能力

| 模块 | 当前能力 |
| --- | --- |
| 主系统 | JWT 登录鉴权、个人资料、邀请码注册、通知中心、私信会话、WebSocket 未读提醒、导航徽标、通用卡片消息。 |
| 任务互助 | 任务发布、浏览、搜索、报名、接单确认、模拟托管、交付/结算 API、取消、排行榜、后台状态管理。 |
| 社区论坛 | 发帖、话题、搜索、热门排序、点赞、收藏、评论、关注、互关分享、后台审核。 |
| 二手市场 | 商品发布、审核、浏览、收藏、求购卡片、订单、模拟支付、收货、评价、纠纷仲裁。 |
| 智能体 | OpenAI 兼容模型调用、本地知识库上下文、来源展示、工具调用、流式会话历史和后台统计。 |
| 管理后台 | 运营概览、任务管理、社区审核、商品审核、用户信用、举报处理、智能体数据、系统参数、响应式控制台界面。 |
| 界面体验 | 小程序统一 Less 设计变量、加载态、空态、可触达消息入口；后台统一 Element Plus 主题变量、表格状态和移动端适配。 |

## 运行方式

后端服务：

```bash
cd server
npm install
npm start
```

管理员后台开发服务：

```bash
cd web
npm install
npm run dev
```

管理员后台构建到后端静态目录：

```bash
cd web
npm run build
```

微信小程序检查：

```bash
cd weixin
npm install
npm run lint
```

使用微信开发者工具导入 `weixin/`，并执行“构建 npm”。

## 演示账号

| 角色 | 账号 | 密码 |
| --- | --- | --- |
| 普通用户 | `20260001` | `123456Aa` |
| 管理员 | `admin` | `123456Aa` |

默认邀请码：`CAMPUS2026`

## 数据与接口

- 后端默认端口：`8888`
- 健康检查：`GET /api/health`
- 小程序 API Base：`http://localhost:8888/api`
- WebSocket：`ws://localhost:8888/ws`
- 管理后台静态入口：`http://localhost:8888/admin/`
- 默认数据仓库：`server/data/db.json`
- SQL Server Schema：`server/sql/schema.sql`

常用核心接口：

| 接口 | 说明 |
| --- | --- |
| `POST /api/auth/login` | 登录。 |
| `GET /api/tasks` | 任务列表。 |
| `GET /api/community/posts` | 社区帖子。 |
| `GET /api/market/goods` | 二手商品。 |
| `GET /api/messages/conversations` | 私信会话。 |
| `POST /api/agent/chat` | 智能体问答。 |
| `GET /api/admin/overview` | 管理后台概览。 |

## 验证命令

后端语法检查：

```bash
find server/src -name "*.js" -print -exec node -c {} \;
```

后台构建：

```bash
cd web
npm run build
```

小程序 lint：

```bash
cd weixin
npm run lint
```

## 工作约束

- `README.md` 负责项目快速说明；`docs/requirements-spec.md` 负责需求、状态和调研结论。
- 不新增重复说明文档；必要内容合并到现有两个文档。
- 默认数据仓库是 JSON 文件，SQL Server 目前用于建表脚本和连接检查。
- 支付、托管、退款和到账均为模拟实现。
- 智能体通过 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL` 调用 OpenAI 兼容 Chat Completions 接口，并结合本地知识库和只读工具结果；未配置完整时接口返回明确错误。
- 智能体未接入向量检索，回答准确率和安全边界需要通过评测验证。
- 微信小程序正式环境需要 HTTPS/WSS 域名、证书和微信后台域名配置。
- `web` 构建会更新 `server/public`，只有需要刷新后端静态后台时才提交这些产物。
- 不提交 `node_modules/`、本地环境文件、日志文件或 `server/data/db.json`。
