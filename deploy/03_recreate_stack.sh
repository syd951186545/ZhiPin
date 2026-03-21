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

latest_tag="$(docker images --format '{{.Repository}} {{.Tag}}' | python3 -c '
import sys
repos = sys.argv[1:4]
repo_tags = {repo: set() for repo in repos}
for raw in sys.stdin:
    raw = raw.strip()
    if not raw:
        continue
    try:
        repo, tag = raw.split(None, 1)
    except ValueError:
        continue
    if repo in repo_tags and tag and tag != "<none>":
        repo_tags[repo].add(tag)
common_tags = set.intersection(*(repo_tags[repo] for repo in repos))
if not common_tags:
    sys.exit(1)
print(sorted(common_tags)[-1])
' "$FRONTEND_IMAGE_REPO" "$BACKEND_IMAGE_REPO" "$OPENCLAW_RUNTIME_REPO")" || error "未找到同时存在于 frontend/backend/openclaw 的共同镜像 tag。请先执行 ./02_build_images.sh 完整构建三张镜像。"

FRONTEND_IMAGE="${FRONTEND_IMAGE_REPO}:${latest_tag}"
BACKEND_IMAGE="${BACKEND_IMAGE_REPO}:${latest_tag}"
OPENCLAW_RUNTIME_IMAGE="${OPENCLAW_RUNTIME_REPO}:${latest_tag}"
export FRONTEND_IMAGE BACKEND_IMAGE OPENCLAW_RUNTIME_IMAGE

info "使用最新共同镜像 tag: $latest_tag"
info "frontend: $FRONTEND_IMAGE"
info "backend: $BACKEND_IMAGE"
info "openclaw: $OPENCLAW_RUNTIME_IMAGE"

info "停止并删除当前运行中的容器（保留 backend/openclaw 持久化数据）..."
docker compose --env-file .env.production down --remove-orphans

info "按最新镜像启动服务..."
docker compose --env-file .env.production up -d openclaw backend frontend

info "等待 backend 健康检查..."
retries=15
for _ in $(seq 1 "$retries"); do
    if curl -sf http://localhost/api/health >/dev/null 2>&1; then
        info "backend 健康检查通过 ✓"
        docker compose --env-file .env.production ps
        exit 0
    fi
    sleep 2
done

warn "backend 健康检查超时，请执行: docker compose --env-file .env.production logs"
docker compose --env-file .env.production ps
