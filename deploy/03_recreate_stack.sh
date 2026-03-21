#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[ -f .env.production ] || error ".env.production 不存在，请先执行 ./01_prepare_env.sh。"
[ -f .images.env ] || error ".images.env 不存在，请先执行 ./02_build_images.sh。"

command -v docker >/dev/null 2>&1 || error "未检测到 docker。"
docker compose version >/dev/null 2>&1 || error "未检测到 docker compose。"

eval "$(python3 - .env.production .images.env <<'PY'
from pathlib import Path
import shlex
import sys
for file_name in sys.argv[1:]:
    path = Path(file_name)
    for line in path.read_text(encoding='utf-8').splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        if key and value:
            print(f"export {key}={shlex.quote(value)}")
PY
)"

: "${FRONTEND_IMAGE:?请先执行 ./02_build_images.sh 生成 FRONTEND_IMAGE}"
: "${BACKEND_IMAGE:?请先执行 ./02_build_images.sh 生成 BACKEND_IMAGE}"
: "${OPENCLAW_RUNTIME_IMAGE:?请先执行 ./02_build_images.sh 生成 OPENCLAW_RUNTIME_IMAGE}"

info "停止并删除当前运行中的容器（保留 backend/openclaw 持久化数据）..."
docker compose down --remove-orphans

info "按新镜像启动服务..."
docker compose up -d openclaw backend frontend

info "等待 backend 健康检查..."
retries=15
for _ in $(seq 1 "$retries"); do
    if curl -sf http://localhost/api/health >/dev/null 2>&1; then
        info "backend 健康检查通过 ✓"
        docker compose ps
        exit 0
    fi
    sleep 2
done

warn "backend 健康检查超时，请执行: docker compose logs"
docker compose ps
