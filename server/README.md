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
