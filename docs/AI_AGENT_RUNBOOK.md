# ZhiPin_CC AI Agent Runbook

本手册用于让 Codex / Claude Code 在当前仓库里稳定完成运行、调测、排障与部署相关任务。

## 1. 开发和测试
- 本地环境为开发环境，测试环境在局域网192.168.3.215服务器，supabase为云端环境、openclaw随fastapi服务同步部署在测试服务器。
- 测试环境只有两个服务：`frontend` 与 `backopenclaw`，暂不考虑生产环境，最终由镜像确保生产环境与测试环境一致。
- `backopenclaw` 单镜像内同时运行 FastAPI 与 OpenClaw
- `deploy/.env.production` 中的配置与密钥会在构建阶段写入镜像
- OpenClaw 运行态数据保存在 Docker volume `/opt/openclaw-home`
- 部署统一入口是 `deploy/deploy.sh`，支持 `prepare` / `build` / `recreate` / `all`
- OpenClaw 基础镜像当前固定为 `ghcr.io/openclaw/openclaw:2026.3.24`；不要直接回到 `latest`，`2026.3.28` 已确认会导致 browser control 端口 `127.0.0.1:18791` 缺失
- 后端 `HOST/PORT/DEBUG` 已内置默认值（`0.0.0.0/8000/false`），部署链路不再要求在 `deploy/.env.production` 或 `backend/.env.production` 显式配置这三项
- 后端 `OPENCLAW_BASE_URL/OPENCLAW_BROWSER_BASE_URL` 已内置默认值（`127.0.0.1:18789/127.0.0.1:18791`），同容器部署时不要在 `deploy/.env.production` 或 `backend/.env.production` 显式覆盖

关键事实：
  - 仅在本地开发代码和单元测试，仅在服务器中执行启动和集成测试。
  - 服务器中不对外暴露 OpenClaw 端口；如需调试，SSH 到服务器后 `docker exec` 进入 `backopenclaw` 容器
  - 若在测试服工作区临时恢复、补齐或手工修改了任何被证明有用的项目文件，必须同步回本机仓库；本机工作区与 GitHub 才是最终基线，不能只把有效文件留在服务器

### 集成测试步骤
  1. 若有数据库迁移，本地连接supabase更新数据库迁移
  - 迁移目录：`supabase/migrations/`
  - 辅助脚本：
    - `deploy/migrate.sh`
    - `deploy/execute_sql.py`
    - `deploy/execute_sql.js`
  2. 同步本地变更的项目文件到服务器`~/projectworkspace/` 保持服务器文件与本地一致，冲突文件以开发服为准
  3. 若`deploy/.env.production`有更新，在服务器上重新生成镜像并重启动容器，否则使用docker热更新容器
  4. 访问 `http://192.168.3.215`进入前段网页，使用/browser skill 或者playwright进行集成测试
### 远端宿主机与局域网资源
- OpenClaw 运行在局域网主机上，详细地址、SSH 用户、密码、token 统一保存在 `docs/AI_AGENT_SECRETS.local.md`
- 如果需要登录远端 Docker 主机排查容器，先读取该本地 secrets 文件，再 `docker exec` 到 `backopenclaw` 容器内部
- 远端项目同路径说明也记录在该文件中
- 若远端目录中存在本机仓库缺失、但构建/运行确实依赖的文件，先同步回本机，再决定是否提交 GitHub；禁止把“仅服务器存在”的临时文件当作长期解决方案
## 2. 生产部署
  暂不涉及，当前项目处于开发调测中。

补充说明（网络受限环境）：
- 默认无需声明镜像加速参数，`deploy/docker-compose.yml` 已内置默认值。
- 仅在网络受限导致构建拉取失败时，再在 `deploy/.env.production` 中按需增加 `OPENCLAW_APT_MIRROR_HOST`、`OPENCLAW_NPM_REGISTRY`、`OPENCLAW_PLAYWRIGHT_DOWNLOAD_HOST` 覆盖默认行为。

## 3. 常见联调入口

### 前后端
- 开发态所有 `/api/*` 请求都会代理到 `http://localhost:8000`
后端会在启动时输出：
- `OpenClaw: ...`
- `Supabase: ...`
如果启动失败，优先检查：
- `backend/.env.production`
- `backend/backend-run.log`
- `backend/backend-err.log`
补充说明：
- `backend/main.py` 仍会读取 `settings.host/settings.port/settings.debug` 启动 Uvicorn，但这些值现在默认来自 `backend/config.py`，除非调试需要，一般无需在部署配置中覆盖

### OpenClaw
- 前端若访问 `/api/openclaw/*`，看后端代理层
- 后端若更新模型配置，先看 `backend/routers/settings.py`
- 后端若读取 / 应用 Gateway 配置，先看 `backend/services/openclaw_gateway_config.py`

- OpenClaw 连通性排查顺序
1. 检查后端启动日志里输出的 `OpenClaw` 地址是否为容器内默认值；同容器部署应为 `http://127.0.0.1:18789`
2. 检查 `GET /api/health` 的 `openclaw.status` 是否为 `ok`
3. 如果是配置页异常，优先看 `backend/services/openclaw_gateway_config.py` 是否能成功调用 `/tools/invoke`
4. 如果是模型执行异常，优先看 `/v1/responses` 调用链路
5. 如果是截图或页面代理异常，检查 `backend/routers/openclaw_proxy.py`

### Supabase
- 前端入口：`frontend/src/lib/supabase.ts`
- 后端入口：`backend/services/supabase_client.py`
如果需要排查 Supabase 问题，优先按此顺序：
1. 检查 env 中的 `SUPABASE_URL` / `SUPABASE_ANON_KEY`
2. 检查前端登录态和用户 JWT 是否存在
3. 检查后端 `validate_supabase_user` 是否通过
4. 再检查对应表结构与 RLS / 迁移是否匹配

