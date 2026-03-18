#!/usr/bin/env bash
# ============================================================
# 智聘云 一键部署脚本 (Ubuntu 22.04)
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

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
        warn "  nano $SCRIPT_DIR/.env.production"
        warn "填写完成后重新运行此脚本。"
        exit 0
    fi
    info ".env.production ✓"
}

# ── 3. 渲染 OpenClaw 配置文件 ────────────────────────────────
# 从 docker/openclaw.json.tmpl 通过 envsubst 渲染成 docker/openclaw.json
# 渲染后的文件包含实际 token 和 API Key，由 backend/settings API 后续读写
setup_openclaw_config() {
    if [ ! -f docker/openclaw.json.tmpl ]; then
        error "docker/openclaw.json.tmpl 不存在，请确认项目文件完整。"
    fi

    # 确保 gettext-base（提供 envsubst）已安装
    if ! command -v envsubst &>/dev/null; then
        info "安装 envsubst..."
        sudo apt-get install -y gettext-base -qq
    fi

    # 将 .env.production 中的变量导出，供 envsubst 使用
    set -a
    # shellcheck source=/dev/null
    source .env.production
    set +a

    envsubst < docker/openclaw.json.tmpl > docker/openclaw.json
    info "OpenClaw 配置已渲染到 docker/openclaw.json ✓"
}

# ── 4. 自动生成 OpenClaw Auth Token ─────────────────────────
setup_openclaw_token() {
    local token
    token=$(grep -E '^OPENCLAW_AUTH_TOKEN=' .env.production 2>/dev/null | cut -d'=' -f2)

    if [ -z "$token" ]; then
        info "OPENCLAW_AUTH_TOKEN 未设置，自动生成..."
        token=$(openssl rand -hex 24)
        # 将生成的 token 写回 .env.production
        sed -i "s|^OPENCLAW_AUTH_TOKEN=.*|OPENCLAW_AUTH_TOKEN=$token|" .env.production
        info "Token 已写入 .env.production ✓"
        info "OpenClaw Auth Token: ${YELLOW}$token${NC}"
    else
        info "OpenClaw Auth Token 已配置 ✓"
    fi
}

# ── 5. 拉取 OpenClaw 镜像 ────────────────────────────────────
pull_openclaw_image() {
    local img
    img=$(grep -E '^OPENCLAW_IMAGE=' .env.production 2>/dev/null | cut -d'=' -f2)
    img=${img:-ghcr.io/openclaw/openclaw:latest}

    info "正在拉取 OpenClaw 镜像: $img ..."
    if ! docker pull "$img"; then
        error "拉取 OpenClaw 镜像失败: $img\n  请检查:\n  1. 网络是否可访问 ghcr.io\n  2. .env.production 中 OPENCLAW_IMAGE 是否正确"
    fi
    info "OpenClaw 镜像拉取成功 ✓"
}

# ── 6. 构建并启动 ───────────────────────────────────────────
deploy() {
    info "正在构建并启动所有服务..."
    docker compose --env-file .env.production up -d --build

    info "等待服务启动..."
    sleep 3

    # 健康检查
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

# ── 7. 显示状态 ─────────────────────────────────────────────
show_status() {
    echo ""
    info "═══════════════════════════════════════════"
    info "  智聘云部署完成!"
    info "═══════════════════════════════════════════"
    echo ""
    docker compose ps
    echo ""

    # 获取暴露端口
    local port
    port=$(grep -E '^EXPOSE_PORT=' .env.production 2>/dev/null | cut -d'=' -f2)
    port=${port:-80}

    # 获取服务器 IP
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
    info "  重新构建:   docker compose up -d --build"
}

# ── Main ────────────────────────────────────────────────────
main() {
    info "智聘云 Docker 部署 (Ubuntu 22.04)"
    echo ""
    check_docker
    check_env
    setup_openclaw_token   # 先生成 token（setup_openclaw_config 需要读取它）
    setup_openclaw_config  # 用 envsubst 渲染配置文件（需要 token 已写入 .env.production）
    pull_openclaw_image
    deploy
    show_status
}

main "$@"
