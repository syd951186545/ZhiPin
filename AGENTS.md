# ZhiPin_CC Agent Instructions

请始终使用中文答复。

## 首次进入仓库时必须知道的事
- 本项目由 `frontend/`、`backend/`、`supabase/`、`deploy/` 四部分组成。
- 在开始前后端、Supabase、OpenClaw、部署或联调任务前，先阅读 `docs/AI_AGENT_RUNBOOK.md`。
- 如果任务需要访问局域网 OpenClaw、SSH 到远端 Docker 主机、或直接使用本地保存的 Supabase / OpenClaw 凭据，先读取 `docs/AI_AGENT_SECRETS.local.md`（如果文件存在）。
- 非必要不要在聊天中回显 token、密码、Bearer、anon key、登录口令；执行命令时可以使用，回复里默认只描述用途和结果。
- 生产部署只有 `frontend` 与 `backopenclaw` 两个服务；`backopenclaw` 容器内同时运行 FastAPI 与 OpenClaw。

## 默认运行方式
- 后端：在 `backend/` 目录执行 `python main.py`
- 前端：在 `frontend/` 目录执行 `npm run dev`
- 前端开发端口：`3000`
- 后端开发端口：`8000`
- 后端健康检查：`GET /api/health`

## 联调约定
- 前端开发态通过 Vite proxy 把 `/api/*` 转发到 `http://localhost:8000`。
- 后端默认从 `backend/.env.production` 读取 Supabase 与 OpenClaw 配置，不要随意改成其他 env 文件，除非任务明确要求。
- OpenClaw 分为两条链路：
  - 管理面 Gateway API：后端通过 `backend/services/openclaw_gateway_config.py` 调 `/tools/invoke`
  - 执行面 Responses API：后端通过 `/v1/responses` 发起模型/执行请求
- 前端不直接持有 OpenClaw 密钥，统一通过后端 `/api/openclaw/*` 代理。
- 部署脚本会把 `deploy/.env.production` 的配置和密钥写入镜像；OpenClaw 运行态配置通过 Docker volume 持久化。

## 调试优先级
1. 先确认后端 `python main.py` 能正常启动，且 `http://127.0.0.1:8000/api/health` 返回 200。
2. 再启动前端 `npm run dev`，确认 `http://127.0.0.1:3000` 可访问。
3. 如果工作流、截图、配置页异常，按顺序检查：前端请求 -> FastAPI 路由 -> OpenClaw 连通性 -> Supabase 鉴权 / RLS。
4. 如果需要远程排查生产 OpenClaw，优先读取本地 secrets 文档中的 SSH 信息，再进入宿主机并 `docker exec` 到 `backopenclaw` 容器。

## Supabase 约定
- 前端 Supabase 配置在 `frontend/.env.production`
- 后端 Supabase 配置在 `backend/.env.production`
- 迁移文件在 `supabase/migrations/`
- SQL/迁移辅助脚本在 `deploy/migrate.sh`、`deploy/execute_sql.py`、`deploy/execute_sql.js`
- 当前后端 `SUPABASE_SERVICE_KEY` 允许为空；若为空，后端不会启用 service-role fallback，而是优先使用前端传入的用户 JWT。

## gstack
- 项目计划 / 文档工作区位于 `C:\Users\SunYD\.gstack\projects\syd951186545-ZhiPin`
- 如果任务要求查看已有计划、设计稿、项目记录，优先到该目录读取上下文。

## 生产部署
需要执行部署或排查服务器 Docker 问题时，读取 `.codex/deploy-runbook.md` 获取完整操作手册。
Claude Code 环境下可直接运行 `/zhipin-deploy`。
