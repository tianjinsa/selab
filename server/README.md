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

当前默认使用 `data/db.json` 作为课程设计演示数据仓库，API 形状已按 SQL Server 后续落库预留。需要重置数据：

```bash
npm run seed
```

`.env` 中设置 `USE_SQLSERVER=true` 后，可通过 `src/services/sqlServer.js` 的连接配置接入本地 SQL Server。

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

如果本机 SQL Server 登录失败，后端仍会使用 JSON 演示仓库保证课程设计页面和 API 可运行。
