# ZhiPin_CC AI Agent Runbook

本手册用于让 Codex / Claude Code 在当前仓库里稳定完成运行、联调、排障与部署相关任务。

## 1. 项目结构
- `frontend/`：React 19 + Vite 管理台，开发端口 `3000`
- `backend/`：FastAPI + LangGraph 后端，开发端口 `8000`
- `supabase/`：远端 Supabase 对应的迁移记录
- `deploy/`：Docker Compose、镜像构建与远程部署脚本

部署关键事实：
- 生产环境只有两个服务：`frontend` 与 `backopenclaw`
- `backopenclaw` 单镜像内同时运行 FastAPI 与 OpenClaw
- `deploy/.env.production` 中的配置与密钥会在构建阶段写入镜像
- OpenClaw 运行态数据保存在 Docker volume `/opt/openclaw-home`
- 部署统一入口是 `deploy/deploy.sh`，支持 `prepare` / `build` / `recreate` / `all`

## 2. 启动命令

### 后端
在 `backend/` 目录执行：

```powershell
python main.py
```

关键事实：
- 入口文件：`backend/main.py`
- 配置类：`backend/config.py`
- 环境文件：`backend/.env.production`
- 健康检查：`http://127.0.0.1:8000/api/health`

后端会在启动时输出：
- `OpenClaw: ...`
- `Supabase: ...`

如果启动失败，优先检查：
- `backend/.env.production`
- `backend/backend-run.log`
- `backend/backend-err.log`

### 前端
在 `frontend/` 目录执行：

```powershell
npm run dev
```

关键事实：
- 开发端口固定为 `3000`
- Vite 配置文件：`frontend/vite.config.ts`
- 环境文件：`frontend/.env.production`
- 开发态所有 `/api/*` 请求都会代理到 `http://localhost:8000`

本地联调顺序：
1. 先启动后端
2. 再启动前端
3. 访问 `http://127.0.0.1:3000`

## 3. OpenClaw 运行与调试

### 架构分工
- 管理面 Gateway API：由后端 `backend/services/openclaw_gateway_config.py` 通过 `POST /tools/invoke` 调用
- 执行面 Responses API：由后端在设置校验等场景通过 `POST /v1/responses` 调用
- 前端访问 OpenClaw 时，不直接带密钥，而是走后端代理 `backend/routers/openclaw_proxy.py`

### 关键后端文件
- `backend/routers/openclaw_proxy.py`
- `backend/routers/settings.py`
- `backend/services/openclaw_gateway_config.py`
- `backend/services/openclaw_client.py`

### 本地开发与 Docker 部署的差异
- 本地开发时，后端默认通过 `OPENCLAW_BASE_URL=http://127.0.0.1:18789` 访问本机或同容器内 OpenClaw
- Docker Compose 部署时，OpenClaw 不再是独立服务，而是 `backopenclaw` 内部子进程
- 生产环境不对外暴露 OpenClaw 端口；如需调试，SSH 到服务器后 `docker exec` 进入 `backopenclaw` 容器

### OpenClaw 连通性排查顺序
1. 检查后端启动日志里输出的 `OpenClaw` 地址是否正确
2. 检查 `GET /api/health` 的 `openclaw.status` 是否为 `ok`
3. 如果是配置页异常，优先看 `backend/services/openclaw_gateway_config.py` 是否能成功调用 `/tools/invoke`
4. 如果是模型执行异常，优先看 `/v1/responses` 调用链路
5. 如果是截图或页面代理异常，检查 `backend/routers/openclaw_proxy.py`

### 关键约束
- 后端会统一注入：
  - `Authorization: Bearer <openclaw token>`
  - `x-openclaw-agent-id`
- 前端默认不应直接保存或暴露 OpenClaw token

## 4. Supabase 运行与调试

### 配置位置
- 前端：`frontend/.env.production`
- 后端：`backend/.env.production`

### 当前实现方式
- 前端直接通过 `frontend/src/lib/supabase.ts` 初始化 `@supabase/supabase-js`
- 后端通过 `backend/services/supabase_client.py` 创建客户端
- 后端默认优先使用前端透传的用户 JWT，以用户身份访问 Supabase，遵循 RLS
- 当 `SUPABASE_SERVICE_KEY` 为空时，不启用 service-role fallback

### 认证与数据入口
- 用户认证校验：`backend/services/supabase_client.py::validate_supabase_user`
- 租户设置表：`tenant_settings`
- 平台账号表：`platform_configs`
- 平台绑定会话表：`platform_binding_sessions`
- 工作流运行态表：`workflow_runs`、`workflow_artifacts`、`workflow_checkpoints`

### 迁移与 SQL
- 迁移目录：`supabase/migrations/`
- 辅助脚本：
  - `deploy/migrate.sh`
  - `deploy/execute_sql.py`
  - `deploy/execute_sql.js`

如果需要排查 Supabase 问题，优先按此顺序：
1. 检查 env 中的 `SUPABASE_URL` / `SUPABASE_ANON_KEY`
2. 检查前端登录态和用户 JWT 是否存在
3. 检查后端 `validate_supabase_user` 是否通过
4. 再检查对应表结构与 RLS / 迁移是否匹配

## 5. 常见联调入口

### 前后端
- 前端页面入口：`frontend/src/pages/`
- 工作流 API 客户端：`frontend/src/services/workflowService.ts`
- 后端工作流路由：`backend/routers/workflow.py`

### OpenClaw
- 前端若访问 `/api/openclaw/*`，看后端代理层
- 后端若更新模型配置，先看 `backend/routers/settings.py`
- 后端若读取 / 应用 Gateway 配置，先看 `backend/services/openclaw_gateway_config.py`

### Supabase
- 前端入口：`frontend/src/lib/supabase.ts`
- 后端入口：`backend/services/supabase_client.py`

## 6. 远端宿主机与局域网资源
- OpenClaw 运行在局域网主机上，详细地址、SSH 用户、密码、token 统一保存在 `docs/AI_AGENT_SECRETS.local.md`
- 如果需要登录远端 Docker 主机排查容器，先读取该本地 secrets 文件，再 `docker exec` 到 `backopenclaw` 容器内部
- 远端项目同路径说明也记录在该文件中

## 7. gstack 工作区
- 项目计划 / 文档 / 讨论上下文位于：

```text
C:\Users\SunYD\.gstack\projects\syd951186545-ZhiPin
```

遇到“按既有计划实现”“查看项目文档”“继续上次方案”之类任务，优先读取该目录。

## 8. Agent 行为约束
- 始终使用中文答复
- 非必要不要在最终回复中回显明文密钥或密码
- 如需修改运行配置，优先复用现有 `.env.production`、`deploy/docker-compose.yml`、`supabase/migrations/`，不要另起一套并行配置
