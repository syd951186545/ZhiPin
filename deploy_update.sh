#!/usr/bin/env bash
# ============================================================
# 智聘云 快速更新脚本
# 仅重建有改动的服务，避免全量重启。
#
# 用法:
#   ./deploy_update.sh              # 自动检测 git 改动并更新
#   ./deploy_update.sh -f           # 仅更新前端
#   ./deploy_update.sh -b           # 仅更新后端
#   ./deploy_update.sh -o           # 仅重载 OpenClaw 配置
#   ./deploy_update.sh -f -b        # 同时更新前端 + 后端
#   ./deploy_update.sh -a           # 更新所有服务
#
# 各服务更新策略:
#   frontend  → docker build + 容器替换（src/、public/、nginx 配置变动）
#   backend   → docker build + 容器替换（server/ 代码变动）
#   openclaw  → 仅 restart（docker/openclaw.json 为 bind mount，无需重建）
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── 颜色输出 ────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
section() { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

# ── 参数解析 ────────────────────────────────────────────────
DO_FRONTEND=false
DO_BACKEND=false
DO_OPENCLAW=false
EXPLICIT=false   # 是否传入了显式标志

usage() {
    echo "用法: $0 [-f] [-b] [-o] [-a]"
    echo "  -f  更新前端 (frontend)"
    echo "  -b  更新后端 (backend)"
    echo "  -o  重载 OpenClaw 配置 (openclaw)"
    echo "  -a  更新所有服务"
    echo "  不传参数则自动检测 git 改动"
    exit 0
}

while getopts ":fboak" opt; do
    case $opt in
        f) DO_FRONTEND=true; EXPLICIT=true ;;
        b) DO_BACKEND=true;  EXPLICIT=true ;;
        o) DO_OPENCLAW=true; EXPLICIT=true ;;
        a) DO_FRONTEND=true; DO_BACKEND=true; DO_OPENCLAW=true; EXPLICIT=true ;;
        k) usage ;;
        \?) error "未知选项: -$OPTARG  使用 -k 查看帮助" ;;
    esac
done

# ── 前置检查 ────────────────────────────────────────────────
check_prerequisites() {
    [ -f .env.production ] || error ".env.production 不存在，请先运行 ./deploy.sh 完成初始部署。"

    # 确认服务已在运行
    if ! docker compose --env-file .env.production ps --quiet openclaw 2>/dev/null | grep -q .; then
        error "OpenClaw 容器未运行，请先执行 ./deploy.sh 完成初始部署。"
    fi
}

# ── 自动检测改动的服务 ───────────────────────────────────────
# 将 git 中改动的文件映射到对应服务
auto_detect() {
    section "自动检测改动"

    # 同时检查已暂存(cached)和未暂存的变更，以及 untracked 文件
    local changed_files
    changed_files=$(
        {
            git diff --name-only          2>/dev/null   # 未暂存变更
            git diff --name-only --cached 2>/dev/null   # 已暂存变更
            git ls-files --others --exclude-standard 2>/dev/null  # 新增未跟踪文件
        } | sort -u
    )

    if [ -z "$changed_files" ]; then
        warn "未检测到 git 变更。如需强制更新，请使用 -f/-b/-o/-a 参数。"
        exit 0
    fi

    info "检测到以下变更文件:"
    echo "$changed_files" | sed 's/^/  /'

    # 前端：src/ public/ index.html vite配置 nginx配置 前端Dockerfile
    if echo "$changed_files" | grep -qE '^(src/|public/|index\.html|vite\.config\.|tsconfig|package\.json|docker/frontend\.Dockerfile|docker/nginx/)'; then
        DO_FRONTEND=true
    fi

    # 后端：server/ 后端Dockerfile
    if echo "$changed_files" | grep -qE '^(server/|docker/backend\.Dockerfile)'; then
        DO_BACKEND=true
    fi

    # OpenClaw 配置：仅重启即可（bind mount 已更新）
    if echo "$changed_files" | grep -qE '^docker/openclaw\.json'; then
        DO_OPENCLAW=true
    fi

    if ! $DO_FRONTEND && ! $DO_BACKEND && ! $DO_OPENCLAW; then
        warn "改动文件不属于前端/后端/OpenClaw 配置，无需更新服务。"
        warn "如需强制更新，请使用 -f/-b/-o/-a 参数。"
        exit 0
    fi
}

# ── 更新前端 ─────────────────────────────────────────────────
update_frontend() {
    section "更新前端 (frontend)"
    info "重新构建并替换前端容器..."
    docker compose --env-file .env.production up -d --build --no-deps frontend
    info "前端更新完成 ✓"
}

# ── 更新后端 ─────────────────────────────────────────────────
update_backend() {
    section "更新后端 (backend)"
    info "重新构建并替换后端容器..."
    docker compose --env-file .env.production up -d --build --no-deps backend

    # 等待后端健康
    info "等待后端就绪..."
    local retries=15 i=0
    while [ $i -lt $retries ]; do
        if curl -sf http://localhost/api/health >/dev/null 2>&1; then
            info "后端健康检查通过 ✓"
            return 0
        fi
        i=$((i + 1))
        sleep 2
    done
    warn "后端健康检查超时，请查看日志: docker compose logs backend"
}

# ── 重载 OpenClaw 配置 ────────────────────────────────────────
# 先重新渲染 openclaw.json（以防模板或 env 变量有变化），再重启容器。
reload_openclaw() {
    section "重载 OpenClaw 配置"

    # 重新渲染配置文件（仅在 .env.production 存在时）
    if [ -f .env.production ] && [ -f docker/openclaw.json.tmpl ]; then
        if command -v envsubst &>/dev/null; then
            set -a; source .env.production; set +a
            envsubst < docker/openclaw.json.tmpl > docker/openclaw.json
            info "openclaw.json 已重新渲染 ✓"
        else
            warn "envsubst 未安装，跳过配置重新渲染（sudo apt install gettext-base）"
        fi
    fi

    info "重启 OpenClaw 容器以应用新配置..."
    docker compose --env-file .env.production restart openclaw

    # 等待 openclaw 健康
    info "等待 OpenClaw 就绪..."
    local retries=20 i=0
    while [ $i -lt $retries ]; do
        local port
        port=$(grep -E '^OPENCLAW_HOST_PORT=' .env.production 2>/dev/null | cut -d'=' -f2)
        port=${port:-28789}
        if curl -sf "http://localhost:${port}/healthz" >/dev/null 2>&1; then
            info "OpenClaw 健康检查通过 ✓"
            return 0
        fi
        i=$((i + 1))
        sleep 3
    done
    warn "OpenClaw 健康检查超时，请查看日志: docker compose logs openclaw"
}

# ── 显示最终状态 ─────────────────────────────────────────────
show_status() {
    section "当前服务状态"
    docker compose --env-file .env.production ps
    echo ""
}

# ── Main ─────────────────────────────────────────────────────
main() {
    echo -e "${CYAN}"
    echo "  ┌─────────────────────────────────────┐"
    echo "  │     智聘云 快速更新 deploy_update    │"
    echo "  └─────────────────────────────────────┘"
    echo -e "${NC}"

    check_prerequisites

    # 未传显式参数时自动检测
    if ! $EXPLICIT; then
        auto_detect
    fi

    # 汇总本次将更新哪些服务
    section "本次更新计划"
    $DO_FRONTEND && info "✔ frontend  — 重建镜像" || info "✘ frontend  — 跳过"
    $DO_BACKEND  && info "✔ backend   — 重建镜像" || info "✘ backend   — 跳过"
    $DO_OPENCLAW && info "✔ openclaw  — 重启容器" || info "✘ openclaw  — 跳过"
    echo ""

    # 执行更新（openclaw 优先，backend 依赖其健康状态）
    $DO_OPENCLAW && reload_openclaw
    $DO_BACKEND  && update_backend
    $DO_FRONTEND && update_frontend

    show_status
    info "更新完成 🎉"
}

main "$@"
