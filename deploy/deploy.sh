#!/usr/bin/env bash
# ============================================================
# 智聘云 一键部署脚本 (Ubuntu 22.04)
# 作用：执行完整重部署。
# - 删除旧的自构建 frontend / backend 镜像
# - 重新构建新的自构建镜像
# - 可按需更新 OpenClaw 远程镜像 / Dockerfile 基础镜像
#
# 用法:
#   ./deploy.sh                    # 完整重部署；默认不主动拉取外部镜像
#   ./deploy.sh --pull-openclaw    # 重部署前拉取最新 OpenClaw 镜像
#   ./deploy.sh --pull-base        # 构建 frontend/backend 前拉取最新基础镜像(node/python/nginx)
#   ./deploy.sh --pull-all         # 同时更新 OpenClaw + 基础镜像
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$SCRIPT_DIR"
cd "$DEPLOY_DIR"

PULL_OPENCLAW=false
PULL_BASE=false
OLD_FRONTEND_IMAGE=""
OLD_BACKEND_IMAGE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --pull-openclaw)
            PULL_OPENCLAW=true
            ;;
        --pull-base)
            PULL_BASE=true
            ;;
        --pull-all)
            PULL_OPENCLAW=true
            PULL_BASE=true
            ;;
        -h|--help)
            cat <<USAGE
用法: $0 [--pull-openclaw] [--pull-base] [--pull-all]
  --pull-openclaw  重部署前拉取最新 OpenClaw 镜像
  --pull-base      重建 frontend/backend 时拉取最新基础镜像(node/python/nginx)
  --pull-all       同时启用以上两个选项
USAGE
            exit 0
            ;;
        *)
            echo "未知参数: $1" >&2
            exit 1
            ;;
    esac
    shift
done

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 1. 检查 Docker ──────────────────────────────────────────
check_docker() {
    if ! command -v docker &>/dev/null; then
        info "正在安装 Docker..."
        sudo apt-get update
        sudo apt-get install -y docker.io docker-compose-plugin
        sudo systemctl enable --now docker
        sudo usermod -aG docker "$USER"
        warn "Docker 已安装。如果是首次安装，请重新登录以使用户组生效，然后重新运行此脚本。"
        exit 0
    fi

    if ! docker compose version &>/dev/null; then
        info "正在安装 docker-compose-plugin..."
        sudo apt-get update
        sudo apt-get install -y docker-compose-plugin
    fi

    info "Docker $(docker --version | awk '{print $3}') ✓"
    info "Docker Compose $(docker compose version --short) ✓"
}

# ── 2. 检查环境配置文件 ─────────────────────────────────────
check_env() {
    if [ ! -f .env.production ]; then
        warn ".env.production 不存在，正在从模板创建..."
        cp .env.production.template .env.production
        warn "请编辑 .env.production 填入真实配置值:"
        warn "  nano $DEPLOY_DIR/.env.production"
        warn "填写完成后重新运行此脚本。"
        exit 0
    fi
    info ".env.production ✓"
}

# ── 3. 渲染 OpenClaw 初始配置文件 ───────────────────────────
# 从 docker/openclaw.json.tmpl 通过 envsubst 渲染成 docker/openclaw.json。
# 该文件仅用于首次部署或手动同步到容器状态卷，运行期配置由 Gateway 控制面管理。
setup_openclaw_config() {
    if [ ! -f docker/openclaw.json.tmpl ]; then
        error "docker/openclaw.json.tmpl 不存在，请确认项目文件完整。"
    fi

    if ! command -v envsubst &>/dev/null; then
        info "安装 envsubst..."
        sudo apt-get install -y gettext-base -qq
    fi

    set -a
    # shellcheck source=/dev/null
    source .env.production
    set +a

    envsubst < docker/openclaw.json.tmpl > docker/openclaw.json
    info "OpenClaw 初始配置已渲染到 deploy/docker/openclaw.json ✓"
}

# ── 4. 自动生成 OpenClaw Auth Token ─────────────────────────
setup_openclaw_token() {
    local token
    token=$(grep -E '^OPENCLAW_AUTH_TOKEN=' .env.production 2>/dev/null | cut -d'=' -f2)

    if [ -z "$token" ]; then
        info "OPENCLAW_AUTH_TOKEN 未设置，自动生成..."
        token=$(openssl rand -hex 24)
        sed -i "s|^OPENCLAW_AUTH_TOKEN=.*|OPENCLAW_AUTH_TOKEN=$token|" .env.production
        info "Token 已写入 .env.production ✓"
        info "OpenClaw Auth Token: ${YELLOW}$token${NC}"
    else
        info "OpenClaw Auth Token 已配置 ✓"
    fi
}

# ── 5. 拉取 OpenClaw 镜像（可选）─────────────────────────────
pull_openclaw_image_if_needed() {
    local img
    img=$(grep -E '^OPENCLAW_IMAGE=' .env.production 2>/dev/null | cut -d'=' -f2)
    img=${img:-ghcr.io/openclaw/openclaw:latest}

    if ! $PULL_OPENCLAW; then
        warn "本次未主动拉取 OpenClaw 镜像（使用 --pull-openclaw / --pull-all 可更新远程镜像）。"
        return 0
    fi

    info "正在拉取 OpenClaw 镜像: $img ..."
    if ! docker pull "$img"; then
        error "拉取 OpenClaw 镜像失败: $img\n  请检查:\n  1. 网络是否可访问 ghcr.io\n  2. .env.production 中 OPENCLAW_IMAGE 是否正确"
    fi
    info "OpenClaw 镜像拉取成功 ✓"
}

# ── 6. 停止现有服务并清理自构建镜像 ─────────────────────────
remember_built_images() {
    OLD_FRONTEND_IMAGE=$(docker compose --env-file .env.production images -q frontend 2>/dev/null || true)
    OLD_BACKEND_IMAGE=$(docker compose --env-file .env.production images -q backend 2>/dev/null || true)
}

stop_existing_stack() {
    info "停止当前服务栈（保留数据卷）..."
    docker compose --env-file .env.production down --remove-orphans || true
}

remove_built_images() {
    if [ -n "$OLD_FRONTEND_IMAGE" ]; then
        info "删除旧 frontend 镜像: $OLD_FRONTEND_IMAGE"
        docker image rm -f "$OLD_FRONTEND_IMAGE" || warn "frontend 镜像删除失败，Docker 将在重建时自行处理。"
    else
        info "未发现可删除的旧 frontend 镜像。"
    fi

    if [ -n "$OLD_BACKEND_IMAGE" ]; then
        info "删除旧 backend 镜像: $OLD_BACKEND_IMAGE"
        docker image rm -f "$OLD_BACKEND_IMAGE" || warn "backend 镜像删除失败，Docker 将在重建时自行处理。"
    else
        info "未发现可删除的旧 backend 镜像。"
    fi
}

# ── 7. 构建自定义镜像 ───────────────────────────────────────
build_app_images() {
    local build_args=(--env-file .env.production build --no-cache frontend backend)

    if $PULL_BASE; then
        info "构建前拉取最新基础镜像（node/python/nginx）..."
        build_args=(--env-file .env.production build --pull --no-cache frontend backend)
    else
        warn "本次未主动拉取 Dockerfile 基础镜像（使用 --pull-base / --pull-all 可更新 node/python/nginx 基础镜像）。"
    fi

    info "重新构建 frontend / backend 镜像..."
    docker compose "${build_args[@]}"
}

# ── 8. 同步配置到 OpenClaw 状态卷（仅首次）──────────────────
sync_openclaw_config_if_missing() {
    local container_id
    container_id=$(docker compose --env-file .env.production ps -q openclaw)

    if [ -z "$container_id" ]; then
        error "未找到 openclaw 容器，无法同步初始配置。"
    fi

    if docker exec "$container_id" sh -lc '[ -f /home/node/.openclaw/openclaw.json ]'; then
        warn "检测到 OpenClaw 状态卷中已有 openclaw.json，保留现有运行时配置。"
        return 0
    fi

    info "首次部署：写入 OpenClaw 初始配置到状态卷..."
    docker exec -i "$container_id" sh -lc 'mkdir -p /home/node/.openclaw && cat > /home/node/.openclaw/openclaw.json' < docker/openclaw.json
    info "OpenClaw 状态卷已写入配置 ✓"
}

# ── 9. 启动服务 ─────────────────────────────────────────────
deploy() {
    info "启动 OpenClaw 容器..."
    docker compose --env-file .env.production up -d openclaw

    sync_openclaw_config_if_missing

    info "重启 OpenClaw 以加载状态卷配置..."
    docker compose --env-file .env.production restart openclaw

    info "启动前后端服务..."
    docker compose --env-file .env.production up -d backend frontend

    info "等待服务启动..."
    sleep 3

    local max_retries=10
    local retry=0
    while [ $retry -lt $max_retries ]; do
        if curl -sf http://localhost/api/health >/dev/null 2>&1; then
            info "健康检查通过 ✓"
            break
        fi
        retry=$((retry + 1))
        sleep 2
    done

    if [ $retry -eq $max_retries ]; then
        warn "健康检查未通过，请查看日志: docker compose logs"
    fi
}

# ── 10. 显示状态 ────────────────────────────────────────────
show_status() {
    echo ""
    info "═══════════════════════════════════════════"
    info "  智聘云部署完成!"
    info "═══════════════════════════════════════════"
    echo ""
    docker compose --env-file .env.production ps
    echo ""

    local port
    port=$(grep -E '^EXPOSE_PORT=' .env.production 2>/dev/null | cut -d'=' -f2)
    port=${port:-80}

    local ip
    ip=$(hostname -I | awk '{print $1}')

    info "访问地址: http://${ip}:${port}"
    info "健康检查: http://${ip}:${port}/api/health"
    echo ""
    info "常用命令:"
    info "  查看日志:   docker compose logs -f"
    info "  查看状态:   docker compose ps"
    info "  重启服务:   docker compose restart"
    info "  停止服务:   docker compose down"
    info "  快速更新:   ./deploy_update.sh"
    info "  完整重建:   ./deploy.sh --pull-all"
}

# ── Main ────────────────────────────────────────────────────
main() {
    info "智聘云 Docker 完整重部署 (Ubuntu 22.04)"
    echo ""
    check_docker
    check_env
    setup_openclaw_token
    setup_openclaw_config
    pull_openclaw_image_if_needed
    remember_built_images
    stop_existing_stack
    remove_built_images
    build_app_images
    deploy
    show_status
}

main "$@"
