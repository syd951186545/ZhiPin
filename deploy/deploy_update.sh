#!/usr/bin/env bash
# ============================================================
# 智聘云 快速更新脚本
# 优先复用已部署容器 / 镜像，避免每次都重新安装依赖并重建镜像。
#
# 用法:
#   ./deploy/deploy_update.sh              # 自动检测 git 改动并快速更新
#   ./deploy/deploy_update.sh -f           # 仅更新前端
#   ./deploy/deploy_update.sh -b           # 仅更新后端
#   ./deploy/deploy_update.sh -o           # 仅同步模板配置并重载 OpenClaw
#   ./deploy/deploy_update.sh -f -b        # 同时更新前端 + 后端
#   ./deploy/deploy_update.sh -a           # 更新所有服务
#   ./deploy/deploy_update.sh -k           # 查看帮助
#
# 更新策略:
#   frontend  → 优先使用临时 Node 容器增量构建 dist，并同步到运行中的 nginx 容器
#               若检测到依赖 / Dockerfile 变更，则回退到 docker compose build
#   backend   → 优先将 backend/ 代码同步到运行中的容器并重启
#               若检测到 requirements / Dockerfile 变更，则回退到 docker compose build
#   openclaw  → 同步最新模板到状态卷并重启（运行期配置仍可通过 Gateway 控制面修改）
#
# 需要重新部署基础环境、Compose 配置或彻底重建自构建镜像时，请执行 ./deploy.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CACHE_DIR="$SCRIPT_DIR/.cache"
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
EXPLICIT=false
NEEDS_FULL_REDEPLOY=false
CHANGED_FILES=""

usage() {
    cat <<USAGE
用法: $0 [-f] [-b] [-o] [-a] [-k]
  -f  更新前端 (frontend)
  -b  更新后端 (backend)
  -o  同步模板配置并重载 OpenClaw
  -a  更新所有服务
  -k  显示帮助

说明:
  * 默认会自动检测 git 改动并选择最快的更新路径。
  * 若改动涉及依赖、Dockerfile 或 Compose 基础设施，则会自动回退到局部重建。
  * 若改动涉及 .env.production / docker-compose.yml 等基础部署配置，请改用 ./deploy.sh。
USAGE
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

check_prerequisites() {
    [ -f .env.production ] || error ".env.production 不存在，请先运行 ./deploy.sh 完成初始部署。"

    command -v docker >/dev/null 2>&1 || error "未检测到 docker，请先执行 ./deploy.sh 完成环境初始化。"
    docker compose version >/dev/null 2>&1 || error "未检测到 docker compose，请先执行 ./deploy.sh 完成环境初始化。"

    if ! docker compose --env-file .env.production ps --quiet openclaw 2>/dev/null | grep -q .; then
        error "OpenClaw 容器未运行，请先执行 ./deploy.sh 完成初始部署。"
    fi

    mkdir -p "$CACHE_DIR"
}

has_changed() {
    local pattern="$1"
    echo "$CHANGED_FILES" | grep -qE "$pattern"
}

get_container_id() {
    local service="$1"
    docker compose --env-file .env.production ps -q "$service"
}

require_running_container() {
    local service="$1"
    local container_id
    container_id=$(get_container_id "$service")
    [ -n "$container_id" ] || error "未找到运行中的 $service 容器，请先执行 ./deploy.sh。"
    printf '%s' "$container_id"
}

restart_service() {
    local service="$1"
    docker compose --env-file .env.production restart "$service"
}

build_and_replace_service() {
    local service="$1"
    section "回退为容器重建: $service"
    info "检测到依赖或镜像层变更，执行 docker compose up -d --build --no-deps $service ..."
    docker compose --env-file .env.production up -d --build --no-deps "$service"
}

auto_detect() {
    section "自动检测改动"

    CHANGED_FILES=$(
        {
            git diff --name-only 2>/dev/null
            git diff --name-only --cached 2>/dev/null
            git ls-files --others --exclude-standard 2>/dev/null
        } | sort -u
    )

    if [ -z "$CHANGED_FILES" ]; then
        warn "未检测到 git 变更。如需强制更新，请使用 -f/-b/-o/-a 参数。"
        exit 0
    fi

    info "检测到以下变更文件:"
    echo "$CHANGED_FILES" | sed 's/^/  /'

    if has_changed '^(frontend/|deploy/docker/frontend\.Dockerfile|deploy/docker/nginx/)'; then
        DO_FRONTEND=true
    fi

    if has_changed '^(backend/|deploy/docker/backend\.Dockerfile)'; then
        DO_BACKEND=true
    fi

    if has_changed '^(deploy/docker/openclaw\.json(\.tmpl)?|deploy/deploy(_update)?\.sh)$'; then
        DO_OPENCLAW=true
    fi

    if has_changed '^(deploy/docker-compose\.yml|deploy/\.env\.production(\.template)?|deploy/\.env\.production)$'; then
        NEEDS_FULL_REDEPLOY=true
    fi

    if ! $DO_FRONTEND && ! $DO_BACKEND && ! $DO_OPENCLAW; then
        warn "改动文件不属于前端/后端/OpenClaw 配置，无需更新服务。"
        warn "如需强制更新，请使用 -f/-b/-o/-a 参数。"
        exit 0
    fi
}

ensure_changed_files_for_explicit_mode() {
    if [ -n "$CHANGED_FILES" ]; then
        return 0
    fi

    CHANGED_FILES=$(
        {
            git diff --name-only 2>/dev/null
            git diff --name-only --cached 2>/dev/null
            git ls-files --others --exclude-standard 2>/dev/null
        } | sort -u
    )
}

prepare_frontend_dist() {
    section "构建前端静态资源 (快速模式)"

    local lock_hash
    lock_hash=$(cat "$REPO_ROOT/frontend/package-lock.json" "$REPO_ROOT/frontend/package.json" | sha256sum | awk '{print $1}')

    mkdir -p "$CACHE_DIR/npm" "$CACHE_DIR/frontend-node-modules"

    info "使用临时 Node 容器构建 dist，并复用缓存依赖..."
    docker run --rm \
        -e LOCK_HASH="$lock_hash" \
        -v "$REPO_ROOT/frontend:/workspace" \
        -v "$CACHE_DIR/frontend-node-modules:/workspace/node_modules" \
        -v "$CACHE_DIR/npm:/root/.npm" \
        -w /workspace \
        node:20-alpine \
        sh -lc '
            set -e
            if [ ! -d node_modules ] || [ ! -f node_modules/.deps-lock-hash ] || [ "$(cat node_modules/.deps-lock-hash 2>/dev/null)" != "$LOCK_HASH" ]; then
                echo "[frontend] 依赖缓存失效，执行 npm ci..."
                npm ci
                printf "%s" "$LOCK_HASH" > node_modules/.deps-lock-hash
            else
                echo "[frontend] 复用已有 node_modules 缓存"
            fi
            npm run build
        '
}

sync_frontend_dist_to_container() {
    section "同步前端 dist 到运行中的容器"

    local container_id
    container_id=$(require_running_container frontend)

    tar -C "$REPO_ROOT/frontend" -cf - dist | \
        docker exec -i "$container_id" sh -lc 'rm -rf /usr/share/nginx/html/* && tar -xf - -C /usr/share/nginx/html --strip-components=1'

    info "前端静态资源已同步 ✓"
}

sync_frontend_nginx_config() {
    local container_id
    container_id=$(require_running_container frontend)

    if has_changed '^deploy/docker/nginx/'; then
        section "同步 nginx 配置"
        docker cp "$SCRIPT_DIR/docker/nginx/default.conf" "$container_id:/etc/nginx/conf.d/default.conf"
        docker exec "$container_id" nginx -t
        docker exec "$container_id" nginx -s reload
        info "nginx 配置已重载 ✓"
    fi
}

update_frontend() {
    section "更新前端 (frontend/)"

    ensure_changed_files_for_explicit_mode

    if has_changed '^(frontend/package(-lock)?\.json|deploy/docker/frontend\.Dockerfile)$'; then
        warn "检测到前端依赖或 Dockerfile 变更，快速同步可能不可靠，改为重建前端镜像。"
        build_and_replace_service frontend
        info "前端更新完成 ✓"
        return 0
    fi

    prepare_frontend_dist
    sync_frontend_dist_to_container
    sync_frontend_nginx_config
    info "前端快速更新完成 ✓"
}

sync_backend_code_to_container() {
    section "同步后端代码到运行中的容器"

    local container_id
    container_id=$(require_running_container backend)

    tar \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='.pytest_cache' \
        --exclude='.mypy_cache' \
        -C "$REPO_ROOT" -cf - backend | \
        docker exec -i "$container_id" sh -lc 'mkdir -p /app && tar -xf - -C /app --strip-components=1'

    info "后端代码已同步 ✓"
}

wait_backend_health() {
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

update_backend() {
    section "更新后端 (backend/)"

    ensure_changed_files_for_explicit_mode

    if has_changed '^(backend/requirements\.txt|deploy/docker/backend\.Dockerfile)$'; then
        warn "检测到后端依赖或 Dockerfile 变更，改为重建后端镜像。"
        build_and_replace_service backend
        wait_backend_health
        info "后端更新完成 ✓"
        return 0
    fi

    sync_backend_code_to_container
    info "重启后端容器以加载最新代码..."
    restart_service backend
    wait_backend_health
    info "后端快速更新完成 ✓"
}

reload_openclaw() {
    section "重载 OpenClaw 配置"

    if [ -f .env.production ] && [ -f docker/openclaw.json.tmpl ]; then
        if command -v envsubst &>/dev/null; then
            set -a
            # shellcheck source=/dev/null
            source .env.production
            set +a
            envsubst < docker/openclaw.json.tmpl > docker/openclaw.json
            info "openclaw.json 已重新渲染 ✓"
        else
            warn "envsubst 未安装，跳过配置重新渲染（sudo apt install gettext-base）"
        fi
    fi

    local container_id
    container_id=$(docker compose --env-file .env.production ps -q openclaw)
    if [ -z "$container_id" ]; then
        error "未找到 openclaw 容器，无法同步配置。"
    fi

    info "同步 openclaw.json 到容器状态卷..."
    docker exec -i "$container_id" sh -lc 'mkdir -p /home/node/.openclaw && cat > /home/node/.openclaw/openclaw.json' < docker/openclaw.json

    info "重启 OpenClaw 容器以应用新配置..."
    docker compose --env-file .env.production restart openclaw

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

show_status() {
    section "当前服务状态"
    docker compose --env-file .env.production ps
    echo ""
}

main() {
    echo -e "${CYAN}"
    echo "  ┌─────────────────────────────────────┐"
    echo "  │     智聘云 快速更新 deploy_update    │"
    echo "  └─────────────────────────────────────┘"
    echo -e "${NC}"

    check_prerequisites

    if ! $EXPLICIT; then
        auto_detect
    else
        ensure_changed_files_for_explicit_mode
    fi

    if $NEEDS_FULL_REDEPLOY; then
        error "检测到 docker-compose / 环境变量等基础部署配置变更，请执行 ./deploy.sh 完整重部署。"
    fi

    section "本次更新计划"
    $DO_FRONTEND && info "✔ frontend  — 快速同步 / 必要时局部重建" || info "✘ frontend  — 跳过"
    $DO_BACKEND  && info "✔ backend   — 快速同步 / 必要时局部重建" || info "✘ backend   — 跳过"
    $DO_OPENCLAW && info "✔ openclaw  — 同步配置并重启" || info "✘ openclaw  — 跳过"
    echo ""

    $DO_OPENCLAW && reload_openclaw
    $DO_BACKEND  && update_backend
    $DO_FRONTEND && update_frontend

    show_status
    info "更新完成 🎉"
}

main "$@"
