# 机灵平台（ZhiPin_CC）

面向中国大陆招聘与企业自动化场景的「企业数字员工」平台。

- **前端**：React 19 + Vite 管理台（`frontend/`，默认 `3000`）
- **后端**：FastAPI + LangGraph 编排服务（`backend/`，默认 `8000`）
- **自动化引擎**：OpenClaw（与后端同容器部署）
- **数据层**：Supabase（云端）
- **部署形态**：测试/生产统一为两个服务：`frontend` + `backopenclaw`

> 目标用户为中国大陆中文互联网场景，默认文案、流程与运维说明均以中文语境为主。

---

## 1. 核心架构（精简版）

```text
Browser
  -> frontend (React SPA)
  -> /api/*
  -> backopenclaw:8000 (FastAPI)
       ├─ /api/workflow/*  -> LangGraph workflows
       ├─ /api/openclaw/*  -> OpenClaw proxy
       └─ /api/settings/*  -> OpenClaw gateway config

Supabase <- 前端认证 + 后端持久化/截图上传
OpenClaw <- 与 FastAPI 同容器运行（不对外暴露端口）
```

---

## 2. 仓库目录（关键入口）

```text
.
├── frontend/              # React + Vite 管理台
├── backend/               # FastAPI + LangGraph
├── supabase/migrations/   # 数据库迁移（云端 Supabase 对应）
├── deploy/                # Docker Compose、镜像、部署脚本
├── docs/AI_AGENT_RUNBOOK.md
└── README.md
```

### 前端重点
- `frontend/src/App.tsx`：路由与全局 Provider 入口。
- `frontend/src/pages/`：页面层（平台配置、执行、设置等）。
- `frontend/src/services/workflowService.ts`：工作流 API + SSE 订阅。

### 后端重点
- `backend/main.py`：FastAPI 入口与路由注册。
- `backend/routers/workflow.py`：任务启动/取消/状态/流式输出。
- `backend/routers/openclaw_proxy.py`：OpenClaw 代理。
- `backend/routers/settings.py`：OpenClaw 配置写入与生效。
- `backend/workflows/`：各业务工作流实现。

### 部署重点
- `deploy/deploy.sh`：唯一部署入口（`prepare/build/recreate/all`）。
- `deploy/docker-compose.yml`：仅 `frontend` 与 `backopenclaw` 两服务。
- `deploy/docker/backopenclaw-entrypoint.sh`：容器内拉起 OpenClaw + FastAPI。

---

## 3. 本地开发

### 前端
```bash
cd frontend
npm install
npm run dev
```

### 后端
```bash
cd backend
pip install -r requirements.txt
python main.py
```

### 常用检查
```bash
cd frontend && npm run build   # 前端构建校验
cd frontend && npm run lint    # TS 类型检查
cd backend && pytest           # 后端测试（若本地已安装 pytest）
```

---

## 4. 数据与迁移

- Supabase 迁移目录：`supabase/migrations/`
- 辅助脚本：
  - `deploy/migrate.sh`
  - `deploy/execute_sql.py`
  - `deploy/execute_sql.js`

建议：任何涉及表结构/RLS 的变更，优先补齐 migration，再联调前后端。

---

## 5. 部署与发版

统一入口：`deploy/deploy.sh`

```bash
cd deploy
# 首次部署需手动配置.env.production 
bash ./deploy.sh                       # 等价于 all
```

常见模式：
- `./deploy.sh prepare`：仅生成配置
- `./deploy.sh build`：仅构建镜像
- `./deploy.sh recreate`：不构建直接重建容器
- `./deploy.sh recreate --image-tag <tag>`：指定镜像版本重建

> `deploy/.env.production` 是部署事实源；构建阶段会写入前后端镜像。

---

## 6. 联调与排障最短路径

1. 先看 `docs/AI_AGENT_RUNBOOK.md`（统一流程与环境约束）。
2. 健康检查：`GET /api/health`，确认 `openclaw.status=ok`。
3. 若任务链路异常：
   - 前端 `workflowService.ts` SSE 是否持续
   - 后端 `backend/routers/workflow.py` 日志
   - OpenClaw 连通性与配置（`backend/routers/settings.py`）
4. 线上容器排查：
   - `docker compose ... ps`
   - `docker compose ... logs -f backopenclaw`

---

## 7. 开发约定（高频）

- 保持“前后端 + OpenClaw 同容器”的部署假设，不额外拆并行配置。
- 配置修改优先复用：`.env.production`、`deploy/docker-compose.yml`、`supabase/migrations/`。
- 默认中文场景与中文文案优先，避免引入不必要的英文业务术语。

如需扩展新业务流，建议先复用 `backend/workflows/base.py` 的状态机与步骤执行模式。
