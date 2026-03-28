#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SCRIPT_DIR"

MODE="all"
ENV_FILE="$SCRIPT_DIR/.env.production"
PULL_OPENCLAW=false
PULL_BASE=false
FORCE_OPENCLAW_STATE=false
IMAGE_TAG=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

usage() {
    cat <<USAGE
用法:
  $0 [all|prepare|build|recreate] [--env-file PATH] [--pull-openclaw] [--pull-base] [--force-openclaw-state] [--image-tag TAG]

模式:
  all         生成配置 → 构建镜像 → 重建服务（默认）
  prepare     只生成 frontend/.env.production、backend/.env.production、deploy/generated/openclaw.generated.json
  build       生成配置并构建 frontend/backopenclaw 镜像
  recreate    使用现有镜像重建服务；未指定 --image-tag 时自动选择两张镜像的最新共同 tag

选项:
  --env-file PATH            指定配置源文件，默认 deploy/.env.production
  --pull-openclaw            构建 backopenclaw 时拉取最新 OpenClaw 源镜像
  --pull-base                构建 frontend/backopenclaw 时拉取最新基础镜像
  --force-openclaw-state     兼容保留参数；当前默认就会重新生成镜像构建所需配置
  --image-tag TAG            自定义镜像 tag；在 build/all 模式下用于构建，在 recreate 模式下用于指定重建镜像 tag
USAGE
}

write_env_value() {
    local file="$1"
    local key="$2"
    local value="$3"

    python3 - "$file" "$key" "$value" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
line = f"{key}={value}"
lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
for idx, existing in enumerate(lines):
    if existing.startswith(f"{key}="):
        lines[idx] = line
        break
else:
    lines.append(line)
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
}

env_has_key() {
    local file="$1"
    local key="$2"
    python3 - "$file" "$key" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
key = sys.argv[2]
for line in path.read_text(encoding="utf-8").splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith('#') or '=' not in line:
        continue
    current_key, _ = line.split('=', 1)
    if current_key.strip() == key:
        raise SystemExit(0)
raise SystemExit(1)
PY
}

read_env_value() {
    local key="$1"
    python3 - "$ENV_FILE" "$key" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
key = sys.argv[2]
for line in path.read_text(encoding="utf-8").splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith('#') or '=' not in line:
        continue
    current_key, current_value = line.split('=', 1)
    if current_key.strip() == key:
        print(current_value)
        break
PY
}

ensure_env_value() {
    local key="$1"
    local value="$2"
    if ! env_has_key "$ENV_FILE" "$key"; then
        write_env_value "$ENV_FILE" "$key" "$value"
    fi
}

require_nonempty() {
    local key="$1"
    local value="$2"
    [ -n "$value" ] || error "$key 未配置，请先填写 $ENV_FILE"
}

load_env_exports() {
    eval "$(python3 - "$ENV_FILE" <<'PY'
from pathlib import Path
import shlex
import sys

path = Path(sys.argv[1])
for line in path.read_text(encoding='utf-8').splitlines():
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
}

prepare_artifacts() {
    [ -f "$ENV_FILE" ] || error "配置源不存在: $ENV_FILE"

    ensure_env_value "SUPABASE_SERVICE_KEY" ""
    ensure_env_value "HOST" "0.0.0.0"
    ensure_env_value "PORT" "8000"
    ensure_env_value "DEBUG" "false"
    ensure_env_value "CORS_ORIGINS" "*"
    ensure_env_value "EXPOSE_PORT" "80"
    ensure_env_value "OPENCLAW_TZ" "Asia/Shanghai"
    ensure_env_value "OPENCLAW_AGENT_ID" "HR_Juzi"
    ensure_env_value "OPENCLAW_AGENT_NAME" "HR 橘子"
    ensure_env_value "OPENCLAW_AGENT_EMOJI" "🍊"
    ensure_env_value "OPENCLAW_AGENT_THEME" "你是一名专业的 HR 招聘助手，擅长在网页版本的招聘平台上高效完成公告发布、候选人筛选和沟通工作。"
    ensure_env_value "OPENCLAW_MODEL_PROVIDER" "minimax-cn"
    ensure_env_value "OPENCLAW_MODEL_API_BASE_URL" "https://api.minimaxi.com/anthropic"
    ensure_env_value "OPENCLAW_MODEL_API_TYPE" "anthropic-messages"
    ensure_env_value "OPENCLAW_MODEL_ID" "MiniMax-M2.5"
    ensure_env_value "OPENCLAW_MODEL_NAME" "MiniMax M2.5"
    ensure_env_value "OPENCLAW_MODEL_ALIAS" "Minimax"
    ensure_env_value "OPENCLAW_MODEL_REASONING" "true"
    ensure_env_value "OPENCLAW_MODEL_INPUT_TYPES" "text"
    ensure_env_value "OPENCLAW_MODEL_COST_INPUT" "0.3"
    ensure_env_value "OPENCLAW_MODEL_COST_OUTPUT" "1.2"
    ensure_env_value "OPENCLAW_MODEL_COST_CACHE_READ" "0.03"
    ensure_env_value "OPENCLAW_MODEL_COST_CACHE_WRITE" "0.12"
    ensure_env_value "OPENCLAW_MODEL_CONTEXT_WINDOW" "200000"
    ensure_env_value "OPENCLAW_MODEL_MAX_TOKENS" "8192"
    ensure_env_value "OPENCLAW_GATEWAY_TOOLS_ALLOW" "gateway"
    ensure_env_value "OPENCLAW_RESPONSES_API_ENABLED" "true"
    ensure_env_value "OPENCLAW_BROWSER_BASE_URL" "http://127.0.0.1:18791"
    ensure_env_value "OPENCLAW_PLAYWRIGHT_SKILL_REF" "v4.1.0"
    ensure_env_value "FRONTEND_IMAGE_REPO" "zhipin/frontend"
    ensure_env_value "BACKOPENCLAW_IMAGE_REPO" "zhipin/backopenclaw"
    ensure_env_value "OPENCLAW_IMAGE" "ghcr.io/openclaw/openclaw:latest"

    if ! env_has_key "$ENV_FILE" "OPENCLAW_AUTH_TOKEN" || [ -z "$(read_env_value OPENCLAW_AUTH_TOKEN)" ]; then
        info "OPENCLAW_AUTH_TOKEN 未设置，自动生成并回填到 $ENV_FILE ..."
        write_env_value "$ENV_FILE" "OPENCLAW_AUTH_TOKEN" "$(openssl rand -hex 24)"
    fi

    if ! env_has_key "$ENV_FILE" "SESSION_ENCRYPTION_KEY" || [ -z "$(read_env_value SESSION_ENCRYPTION_KEY)" ]; then
        info "SESSION_ENCRYPTION_KEY 未设置，自动生成并回填到 $ENV_FILE ..."
        write_env_value "$ENV_FILE" "SESSION_ENCRYPTION_KEY" "$(openssl rand -hex 32)"
    fi

    require_nonempty SUPABASE_URL "$(read_env_value SUPABASE_URL)"
    require_nonempty SUPABASE_ANON_KEY "$(read_env_value SUPABASE_ANON_KEY)"
    require_nonempty OPENCLAW_MODEL_API_KEY "$(read_env_value OPENCLAW_MODEL_API_KEY)"

    load_env_exports

    require_nonempty SUPABASE_URL "${SUPABASE_URL}"
    require_nonempty SUPABASE_ANON_KEY "${SUPABASE_ANON_KEY}"
    require_nonempty OPENCLAW_AUTH_TOKEN "${OPENCLAW_AUTH_TOKEN}"
    require_nonempty SESSION_ENCRYPTION_KEY "${SESSION_ENCRYPTION_KEY}"
    require_nonempty OPENCLAW_MODEL_API_KEY "${OPENCLAW_MODEL_API_KEY}"
    require_nonempty OPENCLAW_AGENT_ID "${OPENCLAW_AGENT_ID}"
    require_nonempty OPENCLAW_AGENT_NAME "${OPENCLAW_AGENT_NAME}"
    require_nonempty OPENCLAW_AGENT_THEME "${OPENCLAW_AGENT_THEME}"

    FRONTEND_ENV_FILE="$REPO_ROOT/frontend/.env.production"
    BACKEND_ENV_FILE="$REPO_ROOT/backend/.env.production"
    GENERATED_DIR="$SCRIPT_DIR/generated"
    OPENCLAW_GENERATED_FILE="$GENERATED_DIR/openclaw.generated.json"

    mkdir -p "$GENERATED_DIR"

    python3 - "$FRONTEND_ENV_FILE" "$BACKEND_ENV_FILE" <<'PY'
from pathlib import Path
import os
import sys

def encode(value: str) -> str:
    escaped = value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
    return f'"{escaped}"'

frontend = {
    'VITE_SUPABASE_URL': os.environ['SUPABASE_URL'],
    'VITE_SUPABASE_ANON_KEY': os.environ['SUPABASE_ANON_KEY'],
}
backend = {
    'SUPABASE_URL': os.environ['SUPABASE_URL'],
    'SUPABASE_ANON_KEY': os.environ['SUPABASE_ANON_KEY'],
    'SUPABASE_SERVICE_KEY': os.environ['SUPABASE_SERVICE_KEY'],
    'SESSION_ENCRYPTION_KEY': os.environ['SESSION_ENCRYPTION_KEY'],
    'OPENCLAW_BASE_URL': 'http://127.0.0.1:18789',
    'OPENCLAW_BROWSER_BASE_URL': os.environ['OPENCLAW_BROWSER_BASE_URL'],
    'OPENCLAW_AUTH_TOKEN': os.environ['OPENCLAW_AUTH_TOKEN'],
    'OPENCLAW_AGENT_ID': os.environ['OPENCLAW_AGENT_ID'],
    'HOST': os.environ['HOST'],
    'PORT': os.environ['PORT'],
    'DEBUG': os.environ['DEBUG'],
    'CORS_ORIGINS': os.environ['CORS_ORIGINS'],
    'OPENCLAW_HOME_MOUNT': '/opt/openclaw-home',
    'OPENCLAW_MEDIA_MOUNT': '/opt/openclaw-home/.openclaw/media',
}
for path, data in ((Path(sys.argv[1]), frontend), (Path(sys.argv[2]), backend)):
    path.write_text(''.join(f'{k}={encode(v)}\n' for k, v in data.items()), encoding='utf-8')
PY

    python3 - "$OPENCLAW_GENERATED_FILE" <<'PY'
from pathlib import Path
import json
import os
import sys

provider = os.environ['OPENCLAW_MODEL_PROVIDER']
model_id = os.environ['OPENCLAW_MODEL_ID']
qualified_model = f"{provider}/{model_id}"
reasoning = os.environ['OPENCLAW_MODEL_REASONING'].strip().lower() in {'1', 'true', 'yes', 'on'}
responses_enabled = os.environ['OPENCLAW_RESPONSES_API_ENABLED'].strip().lower() in {'1', 'true', 'yes', 'on'}
input_types = [item.strip() for item in os.environ['OPENCLAW_MODEL_INPUT_TYPES'].split(',') if item.strip()]
gateway_tools_allow = [item.strip() for item in os.environ['OPENCLAW_GATEWAY_TOOLS_ALLOW'].split(',') if item.strip()]
if 'gateway' not in gateway_tools_allow:
    gateway_tools_allow.append('gateway')
config = {
    'gateway': {
        'bind': 'lan',
        'http': {'endpoints': {'responses': {'enabled': responses_enabled}}},
        'auth': {'mode': 'token', 'token': os.environ['OPENCLAW_AUTH_TOKEN']},
        'tools': {'allow': gateway_tools_allow},
    },
    'browser': {
        'enabled': True,
        'defaultProfile': 'openclaw',
        'executablePath': '/usr/bin/chromium',
        'headless': True,
        'noSandbox': True,
    },
    'models': {
        'mode': 'merge',
        'providers': {
            provider: {
                'baseUrl': os.environ['OPENCLAW_MODEL_API_BASE_URL'],
                'api': os.environ['OPENCLAW_MODEL_API_TYPE'],
                'authHeader': True,
                'apiKey': os.environ['OPENCLAW_MODEL_API_KEY'],
                'models': [{
                    'id': model_id,
                    'name': os.environ['OPENCLAW_MODEL_NAME'],
                    'reasoning': reasoning,
                    'input': input_types or ['text'],
                    'cost': {
                        'input': float(os.environ['OPENCLAW_MODEL_COST_INPUT']),
                        'output': float(os.environ['OPENCLAW_MODEL_COST_OUTPUT']),
                        'cacheRead': float(os.environ['OPENCLAW_MODEL_COST_CACHE_READ']),
                        'cacheWrite': float(os.environ['OPENCLAW_MODEL_COST_CACHE_WRITE']),
                    },
                    'contextWindow': int(os.environ['OPENCLAW_MODEL_CONTEXT_WINDOW']),
                    'maxTokens': int(os.environ['OPENCLAW_MODEL_MAX_TOKENS']),
                }],
            }
        },
    },
    'agents': {
        'defaults': {
            'model': {'primary': qualified_model},
            'models': {qualified_model: {'alias': os.environ['OPENCLAW_MODEL_ALIAS']}},
        },
        'list': [{
            'id': os.environ['OPENCLAW_AGENT_ID'],
            'default': True,
            'name': os.environ['OPENCLAW_AGENT_NAME'],
            'model': qualified_model,
            'sandbox': {'mode': 'off'},
            'identity': {
                'emoji': os.environ['OPENCLAW_AGENT_EMOJI'],
                'theme': os.environ['OPENCLAW_AGENT_THEME'],
            },
            'workspace': '/opt/openclaw-home/.openclaw/workspace',
        }],
    },
}
Path(sys.argv[1]).write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY

    if $FORCE_OPENCLAW_STATE; then
        warn "--force-openclaw-state 已兼容保留；当前默认就会重新生成镜像构建所需配置"
    fi

    info "已同步 deploy 配置源: $ENV_FILE"
    info "已生成前端配置: $FRONTEND_ENV_FILE"
    info "已生成后端配置: $BACKEND_ENV_FILE"
    info "已生成 OpenClaw 初始配置: $OPENCLAW_GENERATED_FILE"
    info "OpenClaw Gateway tools.allow: ${OPENCLAW_GATEWAY_TOOLS_ALLOW}"
    info "OpenClaw Responses API enabled: ${OPENCLAW_RESPONSES_API_ENABLED}"
}

build_images() {
    [ -f "$ENV_FILE" ] || error ".env.production 不存在，请先执行部署准备。"
    [ -f "$REPO_ROOT/frontend/.env.production" ] || error "缺少 frontend/.env.production，请先执行部署准备。"
    [ -f "$REPO_ROOT/backend/.env.production" ] || error "缺少 backend/.env.production，请先执行部署准备。"
    [ -f "$REPO_ROOT/deploy/generated/openclaw.generated.json" ] || error "缺少 deploy/generated/openclaw.generated.json，请先执行部署准备。"

    command -v docker >/dev/null 2>&1 || error "未检测到 docker。"
    docker compose version >/dev/null 2>&1 || error "未检测到 docker compose。"

    load_env_exports

    : "${FRONTEND_IMAGE_REPO:?请在 .env.production 中配置 FRONTEND_IMAGE_REPO}"
    : "${BACKOPENCLAW_IMAGE_REPO:?请在 .env.production 中配置 BACKOPENCLAW_IMAGE_REPO}"
    : "${OPENCLAW_IMAGE:?请在 .env.production 中配置 OPENCLAW_IMAGE}"

    local tag="${IMAGE_TAG:-$(date -u +%Y%m%d-%H%M%S)}"
    FRONTEND_IMAGE="${FRONTEND_IMAGE_REPO}:${tag}"
    BACKOPENCLAW_IMAGE="${BACKOPENCLAW_IMAGE_REPO}:${tag}"
    export FRONTEND_IMAGE BACKOPENCLAW_IMAGE IMAGE_TAG="$tag"

    if $PULL_OPENCLAW; then
        info "构建 backopenclaw 时拉取最新 OpenClaw 源镜像: $OPENCLAW_IMAGE"
    fi

    local frontend_build_args=(build frontend)
    local backopenclaw_build_args=(build backopenclaw)
    if $PULL_BASE; then
        info "构建 frontend 时拉取最新基础镜像并复用本地缓存..."
        frontend_build_args=(build --pull frontend)
    fi
    if $PULL_BASE || $PULL_OPENCLAW; then
        info "构建 backopenclaw 时拉取最新基础镜像并复用本地缓存..."
        backopenclaw_build_args=(build --pull backopenclaw)
    else
        info "使用缓存构建 frontend/backopenclaw 镜像..."
    fi

    info "构建 frontend 镜像: $FRONTEND_IMAGE"
    info "构建 backopenclaw 镜像: $BACKOPENCLAW_IMAGE (base: $OPENCLAW_IMAGE)"
    docker compose --env-file "$ENV_FILE" "${frontend_build_args[@]}"
    docker compose --env-file "$ENV_FILE" "${backopenclaw_build_args[@]}"

    info "镜像构建完成，统一标签: $tag"
    info "frontend: $FRONTEND_IMAGE"
    info "backopenclaw: $BACKOPENCLAW_IMAGE"
}

find_latest_common_tag() {
    python3 -c '
import subprocess
import sys

repos = sys.argv[1:]
repo_tags = {repo: set() for repo in repos}
output = subprocess.check_output(["docker", "images", "--format", "{{.Repository}} {{.Tag}}"], text=True)
for raw in output.splitlines():
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
    raise SystemExit(1)
print(sorted(common_tags)[-1])
' "$@"
}

recreate_stack() {
    [ -f "$ENV_FILE" ] || error ".env.production 不存在，请先执行部署准备。"

    command -v docker >/dev/null 2>&1 || error "未检测到 docker。"
    docker compose version >/dev/null 2>&1 || error "未检测到 docker compose。"

    load_env_exports

    : "${FRONTEND_IMAGE_REPO:?请在 .env.production 中配置 FRONTEND_IMAGE_REPO}"
    : "${BACKOPENCLAW_IMAGE_REPO:?请在 .env.production 中配置 BACKOPENCLAW_IMAGE_REPO}"

    local tag="$IMAGE_TAG"
    if [ -z "$tag" ]; then
        tag="$(find_latest_common_tag "$FRONTEND_IMAGE_REPO" "$BACKOPENCLAW_IMAGE_REPO")" || error "未找到同时存在于 frontend/backopenclaw 的共同镜像 tag。请先执行 $0 build 或 $0 all。"
    fi

    FRONTEND_IMAGE="${FRONTEND_IMAGE_REPO}:${tag}"
    BACKOPENCLAW_IMAGE="${BACKOPENCLAW_IMAGE_REPO}:${tag}"
    export FRONTEND_IMAGE BACKOPENCLAW_IMAGE

    info "使用镜像 tag: $tag"
    info "frontend: $FRONTEND_IMAGE"
    info "backopenclaw: $BACKOPENCLAW_IMAGE"

    info "停止并删除当前运行中的容器（保留 backopenclaw_data 持久化卷）..."
    docker compose --env-file "$ENV_FILE" down --remove-orphans

    info "按指定镜像启动服务..."
    docker compose --env-file "$ENV_FILE" up -d backopenclaw frontend

    local container_id
    container_id="$(docker compose --env-file "$ENV_FILE" ps -q backopenclaw)"
    [ -n "$container_id" ] || error "未找到 backopenclaw 容器，请执行 docker compose --env-file $ENV_FILE ps 检查。"

    info "等待 backopenclaw 容器健康检查..."
    local retries=90
    for _ in $(seq 1 "$retries"); do
        local status
        status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
        case "$status" in
            healthy)
                info "backopenclaw 健康检查通过 ✓"
                docker compose --env-file "$ENV_FILE" ps
                return 0
                ;;
            unhealthy|exited|dead)
                warn "backopenclaw 状态异常: ${status:-unknown}"
                docker compose --env-file "$ENV_FILE" ps
                docker compose --env-file "$ENV_FILE" logs --tail=200 backopenclaw
                return 1
                ;;
        esac
        sleep 2
    done

    warn "backopenclaw 健康检查超时"
    docker compose --env-file "$ENV_FILE" ps
    docker compose --env-file "$ENV_FILE" logs --tail=200 backopenclaw frontend
    return 1
}

while [ $# -gt 0 ]; do
    case "$1" in
        all|prepare|build|recreate)
            MODE="$1"
            ;;
        --env-file)
            shift
            [ $# -gt 0 ] || { echo "--env-file 需要一个参数" >&2; exit 1; }
            ENV_FILE="$1"
            ;;
        --pull-openclaw)
            PULL_OPENCLAW=true
            ;;
        --pull-base)
            PULL_BASE=true
            ;;
        --force-openclaw-state)
            FORCE_OPENCLAW_STATE=true
            ;;
        --image-tag)
            shift
            [ $# -gt 0 ] || { echo "--image-tag 需要一个参数" >&2; exit 1; }
            IMAGE_TAG="$1"
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "未知参数: $1" >&2
            exit 1
            ;;
    esac
    shift
done

case "$MODE" in
    prepare)
        prepare_artifacts
        ;;
    build)
        prepare_artifacts
        build_images
        ;;
    recreate)
        recreate_stack
        ;;
    all)
        prepare_artifacts
        build_images
        recreate_stack
        ;;
esac
