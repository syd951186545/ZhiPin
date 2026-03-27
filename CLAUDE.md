# ZhiPin_CC Claude Code Instructions

请始终使用中文答复。

## 项目操作入口
- 在处理前后端、Supabase、OpenClaw、部署、联调任务前，先阅读 `docs/AI_AGENT_RUNBOOK.md`
- 如果任务需要访问局域网 OpenClaw、远端 SSH、或读取本机保存的敏感凭据，先读取 `docs/AI_AGENT_SECRETS.local.md`（如果存在）
- 非必要不要在回复里回显密码、token、anon key、登录口令
- 生产部署只有 `frontend` 与 `backopenclaw` 两个服务，`backopenclaw` 容器内同时运行 FastAPI 与 OpenClaw
- 涉及 Supabase 迁移、schema 变更、远端迁移状态时，优先使用全局技能 `C:\Users\SunYD\.codex\skills\supabase-cli-ops\SKILL.md`
- 本项目涉及 215 服务器同步、SSH、部署、热更新时，使用项目技能 `D:\_WorkSpaceWebStorm\ZhiPin_CC\.claude\skills\zhipin-215-sync\SKILL.md`
- 当本仓库代码发生改动时，除非用户明确禁止，结束前默认执行 `python .claude/skills/zhipin-215-sync/scripts/sync_to_215.py --changed-only --health-check` 把变更同步到 `192.168.3.215:/home/sunyd/projectspace/ZhiPin`

## 默认运行方式
- 后端：在 `backend/` 执行 `python main.py`
- 前端：在 `frontend/` 执行 `npm run dev`
- 前端开发地址：`http://127.0.0.1:3000`
- 后端健康检查：`http://127.0.0.1:8000/api/health`

## 联调约定
- 前端开发态通过 Vite proxy 把 `/api/*` 转发到 `http://localhost:8000`
- 后端默认从 `backend/.env.production` 读取 Supabase / OpenClaw 配置
- OpenClaw 分两条链路：
  - 管理面 Gateway API：`/tools/invoke`
  - 执行面 Responses API：`/v1/responses`
- 前端访问 OpenClaw 统一走后端 `/api/openclaw/*` 代理
- 部署脚本会把 `deploy/.env.production` 中的配置与密钥写入镜像，OpenClaw 运行态配置通过 Docker volume 保留

## 调试优先级
1. 先确认后端可启动、`/api/health` 正常
2. 再确认前端 `npm run dev` 正常、页面能访问
3. 若工作流异常，按“前端请求 -> FastAPI 路由 -> OpenClaw -> Supabase”顺序排查
4. 若需要检查远端 OpenClaw Docker，再读取本地 secrets 文档、SSH 到局域网主机，并 `docker exec` 到 `backopenclaw` 容器

## Supabase 与文档工作区
- 前端环境文件：`frontend/.env.production`
- 后端环境文件：`backend/.env.production`
- 迁移目录：`supabase/migrations/`
- gstack 项目空间：`C:\Users\SunYD\.gstack\projects\syd951186545-ZhiPin`

## 生产部署
执行部署或排查服务器 Docker 问题时，运行 `/zhipin-deploy` 获取完整操作手册（包含已知坑、修复命令、健康验证）。

## gstack
Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools directly.

### Setup
If you don't have gstack installed, run:
```
git clone https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

### Available skills
/office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /retro, /investigate, /document-release, /codex, /cso, /autoplan, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade
