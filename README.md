# 校园智能生活服务平台

本项目根据 `需求文档.md` 分阶段实现，技术栈为 Vue3 + Naive UI + Node.js + Express + SQL Server，并补充用户体验层面的流程提示、空状态、错误提示和后台演示能力。

## 阶段分支

每个阶段单独创建分支开发，完成后合并回 `main`：

| 阶段 | 分支 | 子系统 |
| --- | --- | --- |
| 0 | `phase/00-planning` | 阶段文档与工程约束 |
| 1 | `phase/01-main-system` | 主系统、认证、个人中心、私信通知基础 |
| 2 | `phase/02-task-system` | 校园任务互助系统 |
| 3 | `phase/03-forum-system` | 校园社区论坛系统 |
| 4 | `phase/04-market-system` | 校园二手市场系统 |
| 5 | `phase/05-ai-agent` | 校园信息智能体系统 |
| 6 | `phase/06-admin-final` | 管理员后台完善、Mock 演示与最终验证 |

## 开发原则

- 需求文档是最低范围，用户体验是最终验收指标。
- 用户端与管理员端使用独立登录态，Token 不互通。
- 业务闭环优先于静态展示，关键状态必须可追踪。
- Mock 数据只用于后台展示类功能，不改变真实业务状态。
- 每个阶段保持 `main` 可运行、可演示、可继续迭代。

## 运行方式

```bash
npm install
npm run build
npm run start
```

启动后访问：

- 用户端：`http://localhost:3000/`
- 管理员端：`http://localhost:3000/admin`

演示账号：

- 普通用户：`202600000001 / 123456`
- 普通用户：`202600000002 / 123456`
- 管理员：`admin / 123456`

后端会优先连接本地 SQL Server：`localhost:8887 / CampusLifeService`。如果连接不可用，会自动进入本地演示数据模式，并在 `/api/health` 中显示当前数据模式。
