# 校园智能生活服务平台后端

本服务提供需求文档中的统一认证、私信通知、任务互助、社区论坛、二手市场、智能体和管理员后台 API。

## 启动

```bash
npm install
npm run dev
```

默认端口：`8888`。管理员后台构建产物放在 `server/public`，启动后可访问 `http://localhost:8888/admin/`。

## 演示账号

- 普通用户：`20260001` / `123456Aa`
- 管理员：`admin` / `123456Aa`

## 数据说明

当前默认使用 `data/db.json` 作为课程设计演示数据仓库。需要重置数据：

```bash
npm run seed
```

SQL Server 相关命令用于本地建表和连接检查。

## SQL Server

按需求文档的本地连接信息，默认配置为 `localhost:8887`、用户 `sa`、密码 `123456Aa`。业务数据库命名为 `CampusSmartLifeDB`，初始化连接上下文使用 `tempdb`，不使用 `master`。重置初始化数据库：

```bash
npm run db:init
```

这个命令会删除旧的 `CampusSmartLifeDB`，重新创建新数据库，并执行 [schema.sql](sql/schema.sql) 建表。

只检查连接：

```bash
npm run check:sqlserver
```

如果想手动建表，可在目标数据库中执行：

```sql
-- server/sql/schema.sql
```

## 智能体模型配置

智能体使用 OpenAI 兼容的 Chat Completions 请求格式。复制 `.env.example` 为 `.env` 后填写：

```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=你的 API Key
OPENAI_MODEL=gpt-4o-mini
```

`OPENAI_BASE_URL` 可以填写兼容服务的 `/v1` 地址；如果已经包含 `/chat/completions`，后端会直接使用该地址。未配置完整时，智能体接口会返回明确错误。
