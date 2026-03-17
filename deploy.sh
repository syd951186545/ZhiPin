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

# ── 3. 构建并启动 ───────────────────────────────────────────
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

# ── 4. 显示状态 ─────────────────────────────────────────────
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
    deploy
    show_status
}

main "$@"
