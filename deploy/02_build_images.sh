#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SCRIPT_DIR"

PULL_OPENCLAW=false
PULL_BASE=false
IMAGE_TAG="$(date -u +%Y%m%d-%H%M%S)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

usage() {
    cat <<USAGE
用法: $0 [--pull-openclaw] [--pull-base] [--image-tag TAG]
  --pull-openclaw   构建 openclaw 时拉取最新 OpenClaw 源镜像
  --pull-base       构建 frontend/backend 时拉取最新基础镜像
  --image-tag TAG   自定义镜像 tag，默认 UTC 时间戳 YYYYMMDD-HHMMSS
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --pull-openclaw)
            PULL_OPENCLAW=true
            ;;
        --pull-base)
            PULL_BASE=true
            ;;
        --image-tag)
            shift
            [ $# -gt 0 ] || error "--image-tag 需要一个参数"
            IMAGE_TAG="$1"
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            error "未知参数: $1"
            ;;
    esac
    shift
done

[ -f .env.production ] || error ".env.production 不存在，请先执行 ./01_prepare_env.sh 或 ./deploy.sh。"
[ -f "$REPO_ROOT/frontend/.env.production" ] || error "缺少 frontend/.env.production，请先执行 ./01_prepare_env.sh。"
[ -f "$REPO_ROOT/backend/.env.production" ] || error "缺少 backend/.env.production，请先执行 ./01_prepare_env.sh。"

command -v docker >/dev/null 2>&1 || error "未检测到 docker。"
docker compose version >/dev/null 2>&1 || error "未检测到 docker compose。"

eval "$(python3 - .env.production <<'PY'
from pathlib import Path
import shlex
import sys
for line in Path(sys.argv[1]).read_text(encoding='utf-8').splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith('#') or '=' not in line:
        continue
    key, value = line.split('=', 1)
    key = key.strip()
    value = value.strip()
    if key:
        print(f"export {key}={shlex.quote(value)}")
PY
)"

: "${FRONTEND_IMAGE_REPO:?请在 .env.production 中配置 FRONTEND_IMAGE_REPO}"
: "${BACKEND_IMAGE_REPO:?请在 .env.production 中配置 BACKEND_IMAGE_REPO}"
: "${OPENCLAW_RUNTIME_REPO:?请在 .env.production 中配置 OPENCLAW_RUNTIME_REPO}"
: "${OPENCLAW_IMAGE:?请在 .env.production 中配置 OPENCLAW_IMAGE}"

FRONTEND_IMAGE="${FRONTEND_IMAGE_REPO}:${IMAGE_TAG}"
BACKEND_IMAGE="${BACKEND_IMAGE_REPO}:${IMAGE_TAG}"
OPENCLAW_RUNTIME_IMAGE="${OPENCLAW_RUNTIME_REPO}:${IMAGE_TAG}"
IMAGE_ENV_FILE="$SCRIPT_DIR/.images.env"

if $PULL_OPENCLAW; then
    info "构建 openclaw 时拉取最新 OpenClaw 源镜像: $OPENCLAW_IMAGE"
fi

export FRONTEND_IMAGE BACKEND_IMAGE OPENCLAW_RUNTIME_IMAGE IMAGE_TAG

build_args=(build frontend backend)
openclaw_build_args=(build openclaw)
if $PULL_BASE; then
    info "构建前拉取最新基础镜像并复用本地缓存..."
    build_args=(build --pull frontend backend)
else
    info "使用缓存构建 frontend/backend 镜像..."
fi
if $PULL_OPENCLAW; then
    openclaw_build_args=(build --pull openclaw)
else
    info "使用缓存构建 openclaw 镜像..."
fi

info "构建 frontend 镜像: $FRONTEND_IMAGE"
info "构建 backend 镜像: $BACKEND_IMAGE"
info "构建 openclaw 镜像: $OPENCLAW_RUNTIME_IMAGE (base: $OPENCLAW_IMAGE)"
docker compose "${build_args[@]}"
docker compose "${openclaw_build_args[@]}"

cat > "$IMAGE_ENV_FILE" <<EOF_IMAGE
FRONTEND_IMAGE=$FRONTEND_IMAGE
BACKEND_IMAGE=$BACKEND_IMAGE
OPENCLAW_RUNTIME_IMAGE=$OPENCLAW_RUNTIME_IMAGE
IMAGE_TAG=$IMAGE_TAG
EOF_IMAGE

info "已写入镜像标签文件: $IMAGE_ENV_FILE"
