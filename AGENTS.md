# ZhiPin_CC Codex Instructions

## Agent 行为约束
- 始终使用中文答复
- 非必要不要在最终回复中回显明文密钥或密码
- 如需修改运行配置，优先复用现有 `.env.production`、`deploy/docker-compose.yml`、`supabase/migrations/`，不要另起一套并行配置

## 项目结构
- `frontend/`：React 19 + Vite 管理台，开发端口 `3000`
- `backend/`：FastAPI + LangGraph 后端，开发端口 `8000`
- `supabase/`：远端 Supabase 对应的迁移记录
- `deploy/`：Docker Compose、镜像构建与远程部署脚本
- 
## 项目操作入口
- 在处理前后端、Supabase、OpenClaw、测试联调、部署、任务前，先阅读 `docs/AI_AGENT_RUNBOOK.md`
- 如果任务需要访问局域网 OpenClaw、远端 SSH、或读取本机保存的敏感凭据，先读取 `docs/AI_AGENT_SECRETS.local.md`（如果存在）
- 非必要不要在回复里回显密码、token、anon key、登录口令
- 测试环境（同生产部署）只有 `frontend` 与 `backopenclaw` 两个服务，`backopenclaw` 容器内同时运行 FastAPI 与 OpenClaw

## 浏览器调试
Use the `/browse` skill from gstack for all web browsing. 仅当/browse无法使用时才调用  `Playwright MCP MCP Browser *` 工具.

### gstack Setup
If you don't have gstack installed, run:
```
git clone https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

### Available skills
/office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /retro, /investigate, /document-release, /codex, /cso, /autoplan, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.
