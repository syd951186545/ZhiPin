#!/usr/bin/env bash
# ============================================================
# 智聘云 同步脚本
# 目标：把代码或 OpenClaw 模板配置同步到正在运行的容器。
#
# 用法:
#   ./deploy_update.sh        # 默认同步 frontend + backend + OpenClaw
#   ./deploy_update.sh -f     # 只同步前端
#   ./deploy_update.sh -b     # 只同步后端
#   ./deploy_update.sh -o     # 只同步 OpenClaw 配置
#   ./deploy_update.sh -a     # 同步 frontend + backend + OpenClaw
#   ./deploy_update.sh -k     # 查看帮助
#
# 说明:
#   - 这个脚本不会自动检查 git 改动。
#   - 这个脚本只做“同步到运行中的容器”。
#   - 如果你改了 Dockerfile、docker-compose.yml、.env.production 等基础部署内容，请改用 ./deploy.sh。
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
section() { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

DO_FRONTEND=false
DO_BACKEND=false
DO_OPENCLAW=false
EXPLICIT=false

usage() {
    cat <<USAGE
用法: $0 [-f] [-b] [-o] [-a] [-k]
  -f  只同步 frontend
  -b  只同步 backend
  -o  只同步 OpenClaw 配置
  -a  同步 frontend + backend + OpenClaw
  -k  显示帮助

说明:
  * 不会自动检查 git 改动。
  * 不带参数时，默认同步 frontend + backend + OpenClaw。
  * 前端会重新构建 dist，再覆盖到 frontend 容器，同时同步 nginx 配置。
  * 后端会直接覆盖 backend 容器中的 /app，并重启 backend。
  * OpenClaw 会重新渲染 openclaw.json，再覆盖到 openclaw 容器并重启。
  * 如果你改了 Dockerfile、docker-compose.yml、.env.production 等基础部署内容，请改用 ./deploy.sh。
USAGE
    exit 0
}

while getopts ":fboak" opt; do
    case "$opt" in
        f) DO_FRONTEND=true; EXPLICIT=true ;;
        b) DO_BACKEND=true; EXPLICIT=true ;;
        o) DO_OPENCLAW=true; EXPLICIT=true ;;
        a) DO_FRONTEND=true; DO_BACKEND=true; DO_OPENCLAW=true; EXPLICIT=true ;;
        k) usage ;;
        \?) error "未知选项: -$OPTARG  使用 -k 查看帮助" ;;
    esac
done

if ! $EXPLICIT; then
    DO_FRONTEND=true
    DO_BACKEND=true
    DO_OPENCLAW=true
fi

check_prerequisites() {
    [ -f .env.production ] || error ".env.production 不存在，请先执行 ./deploy.sh。"

    command -v docker >/dev/null 2>&1 || error "未检测到 docker，请先执行 ./deploy.sh。"
    docker compose version >/dev/null 2>&1 || error "未检测到 docker compose，请先执行 ./deploy.sh。"

    for service in frontend backend openclaw; do
        if ! docker compose --env-file .env.production ps -q "$service" 2>/dev/null | grep -q .; then
            error "未检测到运行中的 $service 容器，请先执行 ./deploy.sh。"
        fi
    done
}

get_container_id() {
    local service="$1"
    docker compose --env-file .env.production ps -q "$service"
}

require_running_container() {
    local service="$1"
    local container_id
    container_id=$(get_container_id "$service")
    [ -n "$container_id" ] || error "未找到运行中的 $service 容器。"
    printf '%s' "$container_id"
}

wait_backend_health() {
    section "等待 backend 健康检查"
    local retries=15
    local i=0

    while [ "$i" -lt "$retries" ]; do
        if curl -sf http://localhost/api/health >/dev/null 2>&1; then
            info "backend 健康检查通过 ✓"
            return 0
        fi
        i=$((i + 1))
        sleep 2
    done

    warn "backend 健康检查超时，请执行: docker compose --env-file .env.production logs backend"
}

wait_openclaw_health() {
    section "等待 OpenClaw 健康检查"
    local port
    local retries=20
    local i=0

    port=$(grep -E '^OPENCLAW_HOST_PORT=' .env.production 2>/dev/null | cut -d'=' -f2)
    port=${port:-28789}

    while [ "$i" -lt "$retries" ]; do
        if curl -sf "http://localhost:${port}/healthz" >/dev/null 2>&1; then
            info "OpenClaw 健康检查通过 ✓"
            return 0
        fi
        i=$((i + 1))
        sleep 3
    done

    warn "OpenClaw 健康检查超时，请执行: docker compose --env-file .env.production logs openclaw"
}

sync_frontend() {
    section "同步 frontend"

    local frontend_container
    frontend_container=$(require_running_container frontend)

    info "使用临时 Node 容器重新构建 dist ..."
    docker run --rm \
        -v "$REPO_ROOT/frontend:/workspace" \
        -w /workspace \
        node:20-alpine \
        sh -lc 'npm ci && npm run build'

    info "覆盖 frontend 容器中的静态资源 ..."
    tar -C "$REPO_ROOT/frontend" -cf - dist | \
        docker exec -i "$frontend_container" sh -lc 'rm -rf /usr/share/nginx/html/* && tar -xf - -C /usr/share/nginx/html --strip-components=1'

    info "同步 nginx 配置并重载 nginx ..."
    docker cp "$SCRIPT_DIR/docker/nginx/default.conf" "$frontend_container:/etc/nginx/conf.d/default.conf"
    docker exec "$frontend_container" nginx -t
    docker exec "$frontend_container" nginx -s reload

    info "frontend 同步完成 ✓"
}

sync_backend() {
    section "同步 backend"

    local backend_container
    backend_container=$(require_running_container backend)

    info "覆盖 backend 容器中的 /app ..."
    tar \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='.pytest_cache' \
        --exclude='.mypy_cache' \
        -C "$REPO_ROOT" -cf - backend | \
        docker exec -i "$backend_container" sh -lc 'mkdir -p /app && tar -xf - -C /app --strip-components=1'

    info "重启 backend 容器 ..."
    docker compose --env-file .env.production restart backend
    wait_backend_health
    info "backend 同步完成 ✓"
}

render_openclaw_config() {
    [ -f docker/openclaw.json.tmpl ] || error "缺少 deploy/docker/openclaw.json.tmpl。"

    if ! command -v envsubst >/dev/null 2>&1; then
        error "未检测到 envsubst，请先安装 gettext-base，或改用 ./deploy.sh。"
    fi

    set -a
    # shellcheck source=/dev/null
    source .env.production
    set +a

    envsubst < docker/openclaw.json.tmpl > docker/openclaw.json
}

sync_openclaw() {
    section "同步 OpenClaw 配置"

    local openclaw_container
    openclaw_container=$(require_running_container openclaw)

    render_openclaw_config

    info "覆盖 OpenClaw 容器状态卷中的 openclaw.json ..."
    docker exec -i "$openclaw_container" sh -lc 'mkdir -p /home/node/.openclaw && cat > /home/node/.openclaw/openclaw.json' < docker/openclaw.json

    info "重启 OpenClaw 容器 ..."
    docker compose --env-file .env.production restart openclaw
    wait_openclaw_health
    info "OpenClaw 配置同步完成 ✓"
}

show_status() {
    section "当前服务状态"
    docker compose --env-file .env.production ps
}

main() {
    echo -e "${CYAN}"
    echo "  ┌─────────────────────────────────────┐"
    echo "  │      智聘云 容器同步 deploy_update   │"
    echo "  └─────────────────────────────────────┘"
    echo -e "${NC}"

    check_prerequisites

    section "本次同步计划"
    $DO_FRONTEND && info "✔ frontend" || info "✘ frontend"
    $DO_BACKEND && info "✔ backend" || info "✘ backend"
    $DO_OPENCLAW && info "✔ openclaw" || info "✘ openclaw"

    $DO_OPENCLAW && sync_openclaw
    $DO_BACKEND && sync_backend
    $DO_FRONTEND && sync_frontend

    show_status
    info "同步完成 🎉"
}

main "$@"
