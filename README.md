# 智聘云（ZhiPin）

一个面向招聘业务的自动化平台：`frontend/` 提供管理台，`backend/` 负责编排工作流与代理 OpenClaw，`deploy/` 保存 Docker 与部署脚本。此 README 只保留后续接手最需要的信息。

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
- `docker-compose.yml`：生产部署入口，串联 frontend / backend / openclaw 三个服务。
- `docker/frontend.Dockerfile`：构建前端镜像。
- `docker/backend.Dockerfile`：构建后端镜像。
- `docker/openclaw.json.tmpl`：OpenClaw 配置模板。
- `deploy.sh`：完整重部署脚本，会删除旧的自构建镜像并重新构建；可选拉取 OpenClaw/基础镜像。
- `deploy_update.sh`：同步脚本，把代码或 OpenClaw 模板配置直接同步到运行中的容器；遇到依赖、Dockerfile、Compose、环境变量改动时提示改用 `deploy.sh`。
- `.env.production.template`：生产环境变量模板。

## 架构说明
```text
Browser
  -> frontend/ (React SPA)
  -> /api/workflow/* -> backend/routers/workflow.py -> backend/workflows/* -> OpenClaw
  -> /api/openclaw/* -> backend/routers/openclaw_proxy.py -> OpenClaw
  -> /api/settings/* -> backend/routers/settings.py -> deploy/docker/openclaw.json

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
- 后端启动：`python backend/main.py`
- 同步全部代码/配置到运行中容器：`cd deploy && ./deploy_update.sh`
- 完整重部署：`cd deploy && ./deploy.sh`
- 完整重部署并更新外部镜像：`cd deploy && ./deploy.sh --pull-all`

## 部署脚本说明
- `deploy_update.sh`
  - 目标：把你改完的项目代码或 OpenClaw 模板配置，直接同步到已经在运行的容器。不会自动检查 git 改动。
  - 默认行为：不带参数时，同步 `frontend + backend + OpenClaw`；也可以用 `-f`、`-b`、`-o` 只同步指定部分。
  - 前端：使用临时 `node:20-alpine` 容器重新构建 `dist/`，再覆盖到运行中的 nginx 容器，并同步 nginx 配置。
  - 后端：直接把 `backend/` 覆盖到运行中的 backend 容器，再重启 backend。
  - OpenClaw：重新渲染 `openclaw.json`，覆盖到 OpenClaw 状态卷后重启容器。
  - 限制：如果你改的是 Dockerfile、`docker-compose.yml`、`.env.production` 等基础部署内容，应改用 `deploy.sh`。
- `deploy.sh`
  - 目标：执行完整重部署，适合环境初始化、Compose 调整、镜像彻底重建。
  - 默认会删除旧的自构建 `frontend` / `backend` 镜像并重新构建。
  - `--pull-openclaw`：拉取最新 OpenClaw 远程镜像。
  - `--pull-base`：拉取最新基础镜像（例如 `node` / `python` / `nginx`）后重建自构建镜像。
  - `--pull-all`：同时更新 OpenClaw 与基础镜像。

## 维护提示
- 新增自动化场景时，优先复用 `backend/workflows/base.py` 的状态与步骤执行模式。
- 排查“任务无响应”时，优先看前端 SSE 订阅、`backend/routers/workflow.py`、OpenClaw 连通性与 Supabase 凭据。
- 现在顶层目录只保留 `frontend/`、`backend/`、`deploy/` 三个主入口，默认按此分层继续扩展。
