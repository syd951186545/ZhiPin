# 机灵-企业数字员工、机器灵智平台

一个面向企业数字员工与机器灵智场景的自动化平台：`frontend/` 提供管理台，`backend/` 提供 FastAPI 工作流调度与数据落库逻辑，生产部署时由单一 `backopenclaw` 镜像同时承载 FastAPI 与 OpenClaw。此 README 只保留后续接手最需要的信息。

## 项目结构
```text
.
├── frontend/   # React + Vite 前端
├── backend/    # FastAPI + LangGraph 后端
├── deploy/     # Docker Compose、Dockerfile、部署/更新脚本
└── README.md
```

## 目录说明

### `frontend/`
- `src/App.tsx`：应用路由入口，挂载主题、认证、国际化、OpenClaw 等 Provider。
- `src/pages/`：页面层，包含仪表盘、企业/岗位、候选人、自动化、设置、监控、登录注册。
- `src/components/`：业务组件与基础 UI 组件。
- `src/services/workflowService.ts`：前端工作流 API 入口，负责启动/取消任务与订阅 SSE。
- `src/stores/` / `src/hooks/` / `src/contexts/`：状态、数据订阅与全局上下文。
- `src/lib/` / `src/types/` / `src/i18n/`：底层工具、类型和文案。
- `package.json` / `vite.config.ts` / `tsconfig.json`：前端构建与开发配置。

### `backend/`
- `main.py`：FastAPI 入口，注册路由与 CORS。
- `config.py`：环境变量与默认配置读取。
- `routers/workflow.py`：工作流主入口，提供 start/cancel/status/stream。
- `routers/openclaw_proxy.py`：OpenClaw 代理层，统一注入认证。
- `routers/settings.py`：读写 OpenClaw 配置并触发容器重启。
- `workflows/`：岗位发布、人才探索、简历筛选等工作流实现。
- `prompts/` / `services/` / `parsers/`：Prompt 模板、OpenClaw/Supabase 封装、结果解析。
- `requirements.txt`：后端依赖。

### `deploy/`
- `docker-compose.yml`：生产部署入口，仅保留 `frontend` / `backopenclaw` 两个服务。
- `docker/frontend.Dockerfile`：构建前端镜像。
- `docker/backopenclaw.Dockerfile`：构建单一 `backopenclaw` 镜像，内含 FastAPI、OpenClaw、Chromium 与 Playwright Browser Skill。
- `docker/backopenclaw-entrypoint.sh`：容器入口，负责 seed OpenClaw 运行态数据并拉起 OpenClaw + FastAPI。
- `deploy.sh`：唯一部署入口，支持 `prepare` / `build` / `recreate` / `all` 四种模式。
- `.env.example`：生产环境变量模板。

## 架构说明
```text
Browser
  -> frontend/ (React SPA)
  -> /api/* -> backopenclaw:8000
  -> /api/workflow/* -> backend/routers/workflow.py -> backend/workflows/* -> OpenClaw (容器内 127.0.0.1:18789)
  -> /api/openclaw/* -> backend/routers/openclaw_proxy.py -> OpenClaw
  -> /api/settings/* -> backend/routers/settings.py -> OpenClaw Gateway /tools/invoke

Supabase <- frontend 认证 / backend 截图上传与数据持久化
```

## 接手时建议先看
1. `deploy/docker-compose.yml`：先理解服务边界和请求流向。
2. `frontend/src/services/workflowService.ts` + `backend/routers/workflow.py`：理解前后端任务链路。
3. `backend/workflows/base.py` + 各 workflow 文件：理解自动化执行模型。
4. `frontend/src/pages/` + `frontend/src/stores/`：理解页面如何消费执行结果。
5. `backend/routers/settings.py`：理解 OpenClaw 配置如何落地。

## 常用命令
- 前端开发：`cd frontend && npm run dev`
- 前端构建检查：`cd frontend && npm run build`
- 后端启动：`cd backend && python main.py`
- 只生成部署配置：`cd deploy && ./deploy.sh prepare`
- 只构建镜像：`cd deploy && ./deploy.sh build`
- 只重建服务：`cd deploy && ./deploy.sh recreate`
- 完整重部署：`cd deploy && ./deploy.sh`

## 部署运维
唯一入口是 `deploy/deploy.sh`。

### 1. 首次部署 / 日常发版
```bash
cd deploy
cp .env.example .env.production   # 首次部署时
./deploy.sh
```

执行内容：
- 读取 `deploy/.env.production`
- 生成 `frontend/.env.production`、`backend/.env.production`、`deploy/generated/openclaw.generated.json`
- 构建 `frontend` 与 `backopenclaw` 镜像
- 重建 `frontend` 与 `backopenclaw` 服务

### 2. 常用模式
- `./deploy.sh prepare`
  - 只生成镜像构建所需配置，不构建、不重启。
- `./deploy.sh build`
  - 先生成配置，再只构建 `frontend` 与 `backopenclaw` 镜像。
- `./deploy.sh recreate`
  - 不重新构建，直接使用两张镜像的最新共同 tag 重建服务。
- `./deploy.sh recreate --image-tag <tag>`
  - 使用指定 tag 重建，适合回滚或复用已构建镜像。

### 3. 拉取基础镜像
- `./deploy.sh --pull-openclaw`
  - 构建 `backopenclaw` 时拉取最新 OpenClaw 源镜像。
- `./deploy.sh --pull-base`
  - 构建 `frontend` 和 `backopenclaw` 时拉取最新基础镜像。

### 4. 运维排障
- 查看容器状态：`docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml ps`
- 查看后端日志：`docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml logs -f backopenclaw`
- 查看前端日志：`docker compose --env-file deploy/.env.production -f deploy/docker-compose.yml logs -f frontend`
- 进入后端容器：`docker exec -it <backopenclaw-container> sh`
- 健康检查：访问 `/api/health`，确认 `openclaw.status=ok`

### 5. 配置与持久化
- `deploy/.env.production` 是部署事实源，内容会写入镜像构建产物。
- OpenClaw 运行态配置通过 Docker volume `/opt/openclaw-home` 持久化。
- 设置页修改的 OpenClaw 模型配置写入 volume，容器重建后保留。

## 维护提示
- 新增自动化场景时，优先复用 `backend/workflows/base.py` 的状态与步骤执行模式。
- 排查“任务无响应”时，优先看前端 SSE 订阅、`backend/routers/workflow.py`、`/api/health` 的 OpenClaw 子状态与 Supabase 凭据。
- 生产环境不暴露 OpenClaw 端口；如需调试，SSH 到服务器后使用 `docker exec -it <backopenclaw-container> sh` 进入容器。
- 现在顶层目录只保留 `frontend/`、`backend/`、`deploy/` 三个主入口，默认按此分层继续扩展。
